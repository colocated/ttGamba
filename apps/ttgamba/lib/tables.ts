"use server";

/**
 * Sitting down, standing up, and keeping enough tables open.
 *
 * The game page makes exactly one call — `getPlace` — and renders whatever it
 * gets back: a lobby, a table, or a slate saying the engine could not be found.
 * Everything else in here is what that call has to do first.
 *
 * ── Why one call and not three ────────────────────────────────────────────
 * The obvious shape is "am I sitting anywhere?", then "give me the lobby" or
 * "give me my table". That is a race with itself: a seat swept between the two
 * leaves the page drawing a table nobody is at, and the player looking at a
 * hand they are not in. One question with one answer cannot disagree with
 * itself.
 *
 * It is also the heartbeat. Asking where you are is proof that you are still
 * there, so a seat is held by the same poll that draws it and there is no
 * second call anyone can forget to make. See `SEAT_TIMEOUT` in lib/casino.ts.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * ── The floor keeps itself ────────────────────────────────────────────────
 * A tier says how many tables to keep open (`floor`). When every table in a
 * tier is full, another opens beyond the floor, and when that one empties it is
 * taken away again. So the lobby always has somewhere to sit without an
 * administrator having to guess how busy a Friday gets, and a quiet Tuesday
 * does not show a screen of empty tables.
 *
 * That housekeeping runs on the way through a read, which is a write on a path
 * that looks like a GET. Deliberately: the moment a table is needed is the
 * moment somebody is looking at the lobby, and doing it anywhere else would
 * mean a player seeing "all full" that a refresh would have fixed.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { Db } from "./audit";
import { ANYONE, authorise, FORBIDDEN, readId, readName, type Caller } from "./auth";
import { SEAT_TIMEOUT, type Place, type TableRow, type TierView } from "./casino";
import { prisma } from "./db";
import type { Outcome } from "./desk";
import { engineFault, findEngine, type Engine } from "./engines";
import { discardShoe, remaining, requestShoe } from "./shoe";
import { toGameRow, toTableRow, toTierRow } from "./rows";

/**
 * How long an empty overflow table is left standing before it is taken away.
 *
 * Not zero, and the reason is the gap between a table being opened and the
 * player it was opened for sitting at it. A reaper with no patience would
 * delete the table in that gap and hand them a join that fails against a table
 * that existed a moment ago.
 */
const TABLE_GRACE = 30_000;

/** A ceiling on one tier, so nothing here can run away with the database. */
const MAX_TABLES = 20;

// ── Housekeeping ───────────────────────────────────────────────────────────

/**
 * Let go of anyone who has stopped saying they are there, and tidy up after
 * them.
 *
 * Three things in order, and the order matters: seats go first, then the tables
 * they emptied are marked and have their shoes thrown away, then the overflow
 * tables that have been empty long enough are removed. Doing it the other way
 * round would reap a table on the strength of seats that were about to be
 * deleted anyway.
 *
 * Global rather than scoped to the game being looked at. A player who wandered
 * off from blackjack should not keep a chair there until somebody else happens
 * to open blackjack, and this is one indexed delete over a table with tens of
 * rows in it.
 */
async function sweep(db: Db): Promise<void> {
  await db.tableSeat.deleteMany({
    where: { seenAt: { lt: new Date(Date.now() - SEAT_TIMEOUT) } },
  });

  const empty = await db.table.findMany({
    where: { seats: { none: {} } },
    select: { id: true, overflow: true, ownerVrpId: true, emptiedAt: true },
  });
  if (empty.length === 0) return;

  const now = Date.now();

  // Newly empty: stamp it, and throw the shoe away. A table nobody is at is not
  // mid-anything, and carrying a half-dealt shoe across an empty room would
  // hand the next arrival a count somebody else did the work for.
  const justEmptied = empty.filter((table) => table.emptiedAt === null);
  for (const table of justEmptied) await discardShoe(db, table.id);
  if (justEmptied.length > 0) {
    await db.table.updateMany({
      where: { id: { in: justEmptied.map((table) => table.id) } },
      data: { emptiedAt: new Date(now) },
    });
  }

  // Gone for good: the tables that only existed because the others were full,
  // and every private table, whose one player has left.
  const reap = empty
    .filter((table) => table.overflow || table.ownerVrpId !== null)
    .filter((table) => table.emptiedAt !== null && now - table.emptiedAt.getTime() > TABLE_GRACE)
    .map((table) => table.id);

  if (reap.length > 0) await db.table.deleteMany({ where: { id: { in: reap } } });
}

/** The seats an engine will actually deal to, whatever the tier asks for. */
function capacityOf(tierSeats: number, engine: Engine): number {
  return Math.max(1, Math.min(tierSeats, engine.maxSeats));
}

/** The lowest table number not in use, so numbering closes up behind a reap. */
function nextNumber(taken: number[]): number {
  const used = new Set(taken);
  let number = 1;
  while (used.has(number)) number += 1;
  return number;
}

/**
 * Open a table.
 *
 * `emptiedAt` is stamped on creation rather than left null, because a table
 * that has never had anyone at it *is* empty — and it is the reaper's clock, so
 * a table opened and never used has to start it ticking or it would stand there
 * forever.
 */
async function openTable(
  db: Db,
  tier: { id: number },
  options: { overflow: boolean; ownerVrpId?: number },
): Promise<{ id: number } | null> {
  const existing = await db.table.findMany({
    where: { tierId: tier.id },
    select: { number: true },
  });
  if (existing.length >= MAX_TABLES) return null;

  try {
    return await db.table.create({
      data: {
        tierId: tier.id,
        number: nextNumber(existing.map((table) => table.number)),
        overflow: options.overflow,
        ownerVrpId: options.ownerVrpId ?? null,
        emptiedAt: new Date(),
      },
      select: { id: true },
    });
  } catch {
    // Lost the race on `(tierId, number)` to somebody else opening a table at
    // the same moment. Theirs is as good as ours would have been.
    return null;
  }
}

/**
 * Make sure a tier has its floor open, and somewhere free to sit.
 *
 * Singleplayer tiers are skipped outright: their tables are private, made for
 * one player when they ask and taken away when they leave, so a floor of
 * standing empty tables would be a room full of chairs nobody can share.
 */
async function ensureTables(db: Db, tier: { id: number; seats: number; floor: number }, engine: Engine) {
  if (engine.mode === "singleplayer") return;

  const tables = await db.table.findMany({
    where: { tierId: tier.id, ownerVrpId: null },
    select: { id: true, _count: { select: { seats: true } } },
  });

  const missing = tier.floor - tables.length;
  if (missing > 0) {
    for (let count = 0; count < missing; count += 1) {
      await openTable(db, tier, { overflow: false });
    }
    return;
  }

  // Every table full — including the case of there being none at all, which is
  // what a tier with a floor of zero looks like before anyone turns up.
  const capacity = capacityOf(tier.seats, engine);
  if (tables.every((table) => table._count.seats >= capacity)) {
    await openTable(db, tier, { overflow: true });
  }
}

// ── Reading ────────────────────────────────────────────────────────────────

/** What a table row needs pulled with it to become a `TableRow`. */
const TABLE_INCLUDE = {
  seats: true,
  shoe: { select: { decks: true, cursor: true } },
} as const;

type Loaded = Parameters<typeof toTableRow>[0] & {
  shoe: { decks: number; cursor: number } | null;
};

const asTableRow = (table: Loaded): TableRow =>
  toTableRow(table, table.shoe ? remaining(table.shoe.decks, table.shoe.cursor) : null);

/**
 * Where this player is, for this game.
 *
 * Also the heartbeat, also the housekeeping, and — for a singleplayer game with
 * only one set of stakes — also the thing that sits them down, because there is
 * nothing for them to pick and a chooser with one option on it is a step that
 * exists to be clicked through.
 */
export async function getPlace(caller: Caller, slug: string): Promise<Outcome<Place>> {
  const who = await authorise(caller, ANYONE);
  if (!who) return FORBIDDEN;

  const game = await prisma.game.findUnique({
    where: { slug: typeof slug === "string" ? slug : "" },
    include: { tiers: { orderBy: { position: "asc" } } },
  });
  if (!game) return { ok: false, reason: "gone", message: "That game does not exist." };

  const row = toGameRow(game);

  // No engine, no tables. Nothing below this line should run for a game that
  // cannot be played — building a floor for it would leave rows behind that
  // only exist because somebody mistyped a name.
  const fault = engineFault(game.engine);
  if (fault) return { ok: true, data: { at: "broken", game: row, reason: fault } };

  const engine = findEngine(game.engine);
  if (!engine) return { ok: true, data: { at: "broken", game: row, reason: "Unknown engine." } };

  await sweep(prisma);

  // Already sitting somewhere in this game? Then that is the answer, and the
  // ask itself is what holds the chair.
  const seated = await prisma.tableSeat.findFirst({
    where: { vrpId: who.vrpId, table: { tier: { gameId: game.id } } },
    include: { table: { include: { ...TABLE_INCLUDE, tier: true } } },
  });

  if (seated) {
    await prisma.tableSeat.update({ where: { id: seated.id }, data: { seenAt: new Date() } });
    return {
      ok: true,
      data: {
        at: "table",
        game: row,
        tier: toTierRow(seated.table.tier),
        table: asTableRow(seated.table),
        seat: seated.position,
      },
    };
  }

  for (const tier of game.tiers) await ensureTables(prisma, tier, engine);

  /*
    ── Why a singleplayer game is not sat down here ──────────────────────────
    It looks like it should be. A singleplayer game with one set of stakes has
    nothing to choose, and the game is supposed to load in front of the player
    rather than behind a button (PRODUCT.md) — so the obvious thing is to seat
    them on the way past.

    That obvious thing has no way out of it. This runs on every poll, so a
    player who stood up would be sat back down within five seconds, by the very
    call that drew the button they pressed. The "leave" would look broken and
    there would be nothing on screen to explain it.

    So the seating-on-arrival is the page's, where "arrival" is a thing that
    happens once (components/games/stage.tsx), and this call stays what its name
    says: a report of where the player is, which never moves them.
    ─────────────────────────────────────────────────────────────────────────
  */

  const tiers: TierView[] = [];
  for (const tier of game.tiers) {
    const tables = await prisma.table.findMany({
      where: {
        tierId: tier.id,
        // A private table belongs to one player and is never something to pick
        // off a list — it is not in anybody's lobby, including its owner's.
        ownerVrpId: null,
      },
      include: TABLE_INCLUDE,
      orderBy: { number: "asc" },
    });
    tiers.push({ ...toTierRow(tier), tables: tables.map(asTableRow) });
  }

  return { ok: true, data: { at: "lobby", game: row, tiers } };
}

// ── Sitting down ───────────────────────────────────────────────────────────

/**
 * Take a seat at a named table.
 *
 * A player holds one chair in the whole casino, so this stands them up from
 * wherever they were first. That is not a courtesy: a player seated at two
 * tables is a player two engines both think they are dealing to.
 */
export async function sitAtTable(
  caller: Caller,
  tableId: number,
  /** Which chair. Omitted, the first free one — used by singleplayer, which has no picker. */
  position?: number,
): Promise<Outcome<Place>> {
  const who = await authorise(caller, ANYONE);
  if (!who) return FORBIDDEN;

  const id = readId(tableId);
  if (id === null) return { ok: false, reason: "invalid", message: "Unknown table." };

  const table = await prisma.table.findUnique({
    where: { id },
    include: { tier: { include: { game: true } } },
  });
  if (!table) return { ok: false, reason: "gone", message: "That table has closed." };

  const engine = findEngine(table.tier.game.engine);
  if (!engine) {
    return { ok: false, reason: "gone", message: "That game is not playable at the moment." };
  }

  if (table.ownerVrpId !== null && table.ownerVrpId !== who.vrpId) {
    return { ok: false, reason: "forbidden", message: "That is a private table." };
  }

  const wanted = position === undefined ? undefined : readId(position) ?? -1;
  const taken = await seat(
    who.vrpId,
    who.name,
    table.id,
    capacityOf(table.tier.seats, engine),
    wanted,
  );
  if (!taken) {
    return {
      ok: false,
      reason: "conflict",
      message:
        wanted === undefined
          ? "That table filled up. Try another."
          : "Somebody took that seat. Pick another.",
    };
  }

  // Somebody has arrived, so the tier may now be full and want another table
  // behind this one. Done after seating rather than before, so the count it
  // works from includes the player who just sat down.
  await ensureTables(prisma, table.tier, engine);

  return getPlace(caller, table.tier.game.slug);
}

/**
 * Take a seat at whatever stakes the player picked.
 *
 * For singleplayer, where there is no table to point at — the table is made for
 * them here. Their own is reused if they still have one, so a player who
 * reloads the app mid-run is put back where they were rather than handed a new
 * table and a fresh shoe.
 */
export async function sitAtTier(caller: Caller, tierId: number): Promise<Outcome<Place>> {
  const who = await authorise(caller, ANYONE);
  if (!who) return FORBIDDEN;

  const id = readId(tierId);
  if (id === null) return { ok: false, reason: "invalid", message: "Unknown stakes." };

  const tier = await prisma.tier.findUnique({ where: { id }, include: { game: true } });
  if (!tier) return { ok: false, reason: "gone", message: "Those stakes are no longer offered." };

  const engine = findEngine(tier.game.engine);
  if (!engine) {
    return { ok: false, reason: "gone", message: "That game is not playable at the moment." };
  }

  if (engine.mode === "multiplayer") {
    // Sit at the emptiest table in the tier, which is the one most likely to
    // still have room by the time the write lands.
    const tables = await prisma.table.findMany({
      where: { tierId: tier.id, ownerVrpId: null },
      select: { id: true, _count: { select: { seats: true } } },
      orderBy: { number: "asc" },
    });
    const capacity = capacityOf(tier.seats, engine);
    const free = tables
      .filter((table) => table._count.seats < capacity)
      .sort((a, b) => a._count.seats - b._count.seats)[0];

    if (!free) return { ok: false, reason: "conflict", message: "Every table is full." };
    return sitAtTable(caller, free.id);
  }

  const mine =
    (await prisma.table.findFirst({
      where: { tierId: tier.id, ownerVrpId: who.vrpId },
      select: { id: true },
    })) ?? (await openTable(prisma, tier, { overflow: false, ownerVrpId: who.vrpId }));

  if (!mine) {
    return { ok: false, reason: "conflict", message: "Could not open a table for you." };
  }

  const taken = await seat(who.vrpId, who.name, mine.id, 1);
  if (!taken) return { ok: false, reason: "conflict", message: "Could not sit you down." };

  return getPlace(caller, tier.game.slug);
}

/**
 * Put one player in one chair.
 *
 * ── Why this is a loop and not a query ────────────────────────────────────
 * Finding a free seat number and then writing it is a read-then-write, and two
 * players sitting down at the same instant both read the same free number. The
 * unique constraint on `(tableId, position)` is what decides between them, and
 * a rejected insert is not an error — it is the answer "that chair went, try
 * the next one". So the constraint is the mechanism rather than a safety net,
 * and the loop is how the loser recovers.
 *
 * The shoe is asked for inside the same transaction as the first seat, which is
 * what `requestShoe` means: a table that has somebody at it has cards, always,
 * and there is no window in which an engine could find one without the other.
 */
async function seat(
  vrpId: number,
  name: string | null,
  tableId: number,
  capacity: number,
  /**
   * The chair the player asked for, or every chair in turn when they did not
   * mind. Picking one is the normal path — a player opens a table, looks at who
   * is where, and chooses — and a refused pick has to stay refused rather than
   * quietly seating them somewhere else, because "somewhere else" is exactly
   * what they were avoiding.
   */
  wanted?: number,
): Promise<boolean> {
  /*
    Refuse before standing them up.

    Not merely an optimisation: giving up the chair you have for one that turns
    out not to exist is the worst outcome available here, and it is reachable —
    the lobby disables the button on a full table, but a table can fill in the
    seconds between the page being drawn and the press. This check can still
    lose that race, and the loop below is what catches it; what this stops is
    the far more likely version, where the table was already visibly full.
  */
  const occupied = await prisma.tableSeat.count({ where: { tableId } });
  if (occupied >= capacity) return false;

  // One chair each, everywhere. Done outside the loop so a player moving tables
  // is not briefly seated at both.
  await prisma.tableSeat.deleteMany({ where: { vrpId } });

  if (wanted !== undefined && (!Number.isInteger(wanted) || wanted < 1 || wanted > capacity)) {
    return false;
  }

  const chairs =
    wanted === undefined
      ? Array.from({ length: capacity }, (_, index) => index + 1)
      : [wanted];

  for (const position of chairs) {
    try {
      const done = await prisma.$transaction(async (tx) => {
        const before = await tx.tableSeat.count({ where: { tableId } });

        await tx.tableSeat.create({
          data: { tableId, position, vrpId, playerName: readName(name) },
        });

        if (before === 0) {
          const table = await tx.table.findUniqueOrThrow({
            where: { id: tableId },
            include: { tier: { include: { game: true } } },
          });
          const engine = findEngine(table.tier.game.engine);
          await requestShoe(tx, tableId, engine?.decks ?? 0);
          // No longer empty, so the reaper leaves it alone.
          await tx.table.update({ where: { id: tableId }, data: { emptiedAt: null } });
        }

        return true;
      });

      if (done) return true;
    } catch {
      // That chair was taken between reading and writing. Try the next one.
    }
  }

  return false;
}

/**
 * Get up.
 *
 * The seat goes immediately; what it leaves behind — a shoe to throw away, an
 * overflow table to take down — is the sweep's business on the next read, so
 * that a player leaving never waits on housekeeping.
 */
export async function stand(caller: Caller): Promise<Outcome<null>> {
  const who = await authorise(caller, ANYONE);
  if (!who) return FORBIDDEN;

  await prisma.tableSeat.deleteMany({ where: { vrpId: who.vrpId } });
  await sweep(prisma);

  return { ok: true, data: null };
}
