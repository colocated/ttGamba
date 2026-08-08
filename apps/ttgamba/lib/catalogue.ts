"use server";

/**
 * The list of games, read and written.
 *
 * Two audiences with very different rights, and both of them go through here.
 * Every player reads the shelf; only an administrator changes it. The vocabulary
 * — what a game and a tier are — is in lib/casino.ts, so this module is only
 * the database work.
 *
 * ── Saving is one call, not twenty ────────────────────────────────────────
 * The admin panel holds the whole catalogue as a draft and posts all of it. Not
 * because that is less code, but because the thing being edited is a *list*:
 * reordering games is a change to every row at once, and a panel that saved one
 * row at a time would have to decide what a half-applied reorder means. It also
 * makes the Save button honest — either the arrangement on screen is now the
 * arrangement in the database, or nothing moved.
 *
 * The cost is that a save is destructive to anything left out of it, which is
 * how a game gets deleted. `saveCatalogue` is careful about that: it is the one
 * function in this file that can take a table out from under a player, and it
 * says so where it does it.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { flushCache } from "@tt/db/cache";

import { record } from "./audit";
import { ADMIN, ANYONE, authorise, FORBIDDEN, readText, readWhole, type Caller } from "./auth";
import { CACHE_PREFIX } from "./keys";
import {
  BLURB_LIMIT,
  ENGINE_LIMIT,
  ICON_LIMIT,
  MAX_DECKS,
  MAX_FLOOR,
  MAX_GAMES,
  MAX_SEATS,
  MAX_TIERS,
  MIN_DECKS,
  MIN_SEATS,
  NAME_LIMIT,
  slugify,
  type GameDraft,
  type GameRow,
  type TierRow,
} from "./casino";
import { prisma } from "./db";
import { AMOUNT_LIMIT, type Outcome } from "./desk";
import { toGameRow, toStored, toTierRow } from "./rows";

/** A game with the tiers under it — one row of the admin panel's editor. */
export type CatalogueEntry = { game: GameRow; tiers: TierRow[] };

/**
 * The shelf: every game a player can see, in order.
 *
 * Open to anyone with an account, because it is the app's own navigation — a
 * player who could not read this would have no way to reach anything. Hidden
 * games are left out here rather than filtered in the shelf, so `inRail: false`
 * means the same thing to every reader.
 */
export async function getRail(caller: Caller): Promise<Outcome<GameRow[]>> {
  const who = await authorise(caller, ANYONE);
  if (!who) return FORBIDDEN;

  const rows = await prisma.game.findMany({
    where: { inRail: true },
    orderBy: { position: "asc" },
  });

  return { ok: true, data: rows.map(toGameRow) };
}

/**
 * The whole catalogue, hidden games and tiers included.
 *
 * The admin panel's read. Behind `ADMIN` rather than `ANYONE` — not because a
 * game's bet limits are a secret, but because this is the editor's own view of
 * the world and a player has no use for a list of things they cannot see.
 */
export async function getCatalogue(caller: Caller): Promise<Outcome<CatalogueEntry[]>> {
  const who = await authorise(caller, ADMIN);
  if (!who) return FORBIDDEN;

  const games = await prisma.game.findMany({
    orderBy: { position: "asc" },
    include: { tiers: { orderBy: { position: "asc" } } },
  });

  return {
    ok: true,
    data: games.map((game) => ({
      game: toGameRow(game),
      tiers: game.tiers.map(toTierRow),
    })),
  };
}

// ── Saving ─────────────────────────────────────────────────────────────────

/**
 * A draft, checked. `null` for anything that would not be a game.
 *
 * Every field is re-read from scratch rather than trusted — the panel checks
 * the same things and shows them in red as you type, and that check is a
 * courtesy to the person typing rather than a guarantee about what arrives.
 */
type Checked = {
  id: number | null;
  slug: string;
  name: string;
  blurb: string | null;
  icon: string;
  engine: string;
  inRail: boolean;
  tiers: {
    id: number | null;
    name: string;
    minBet: bigint;
    maxBet: bigint;
    seats: number;
    floor: number;
    minDecks: number;
    maxDecks: number;
  }[];
};

function check(draft: GameDraft): Checked | null {
  const name = readText(draft?.name, NAME_LIMIT);
  if (name === null) return null;

  // A blank slug field means "take it from the name", which is what the panel
  // does as you type. Running it through `slugify` either way means a slug
  // typed by hand cannot be something the router would not carry.
  const slug = slugify(readText(draft?.slug, NAME_LIMIT) ?? name);
  if (slug === "") return null;

  const engine = readText(draft?.engine, ENGINE_LIMIT);
  // Deliberately not checked against the registry. An engine that does not
  // exist is a game a player is told about rather than a save that is refused —
  // see lib/engines.ts. Blank is allowed for the same reason: a game being
  // prepared for an engine still being written.
  if (draft?.engine !== "" && engine === null) return null;

  const tiers = Array.isArray(draft?.tiers) ? draft.tiers.slice(0, MAX_TIERS) : [];
  const checkedTiers: Checked["tiers"] = [];

  for (const tier of tiers) {
    const tierName = readText(tier?.name, NAME_LIMIT);
    const minBet = readWhole(tier?.minBet, 1, AMOUNT_LIMIT);
    const maxBet = readWhole(tier?.maxBet, 1, AMOUNT_LIMIT);
    const seats = readWhole(tier?.seats, MIN_SEATS, MAX_SEATS);
    const floor = readWhole(tier?.floor, 0, MAX_FLOOR);
    const minDecks = readWhole(tier?.minDecks, MIN_DECKS, MAX_DECKS);
    const maxDecks = readWhole(tier?.maxDecks, MIN_DECKS, MAX_DECKS);
    if (tierName === null || minBet === null || maxBet === null) return null;
    if (seats === null || floor === null) return null;
    if (minDecks === null || maxDecks === null) return null;
    // A minimum above the maximum is a table nobody can bet at.
    if (minBet > maxBet) return null;

    checkedTiers.push({
      id: typeof tier?.id === "number" && Number.isSafeInteger(tier.id) ? tier.id : null,
      name: tierName,
      minBet: toStored(minBet),
      maxBet: toStored(maxBet),
      seats,
      floor,
      /*
        Sorted rather than refused. A deck range the wrong way round is a typo
        with an obvious reading — the panel already draws it as two fields side
        by side — and unlike a bet range it cannot produce a table nobody can
        play at: the shoe just picks from the pair either way. Bet limits are
        refused because "minimum 10M, maximum 1M" has no honest reading at all.
      */
      minDecks: Math.min(minDecks, maxDecks),
      maxDecks: Math.max(minDecks, maxDecks),
    });
  }

  return {
    id: typeof draft?.id === "number" && Number.isSafeInteger(draft.id) ? draft.id : null,
    slug,
    name,
    blurb: readText(draft?.blurb, BLURB_LIMIT),
    icon: readText(draft?.icon, ICON_LIMIT) ?? "PokerChip",
    engine: engine ?? "",
    inRail: draft?.inRail !== false,
    tiers: checkedTiers,
  };
}

/**
 * Write the catalogue as the panel has it.
 *
 * ── What this is allowed to take away ─────────────────────────────────────
 * Everything not in the list. A game left out is deleted, and its tiers, tables,
 * seats and shoes go with it — the schema cascades, deliberately, because a
 * table belonging to a game that no longer exists is not something any part of
 * the app knows how to render.
 *
 * That includes tables with people at them. There is no check for it and that
 * is the considered answer rather than an oversight: an administrator deleting
 * a game means to delete it, a warning they cannot act on from here would only
 * teach them to click through, and the players are sat in front of a page that
 * re-asks where it is every few seconds (lib/tables.ts) and will find itself
 * back in the shelf. What must not happen — a balance moving, a bet
 * disappearing mid-round — is not in reach here: no chips are staked until an
 * engine takes them, and that is settled through the audited path in
 * lib/account.ts rather than held on a table row.
 * ─────────────────────────────────────────────────────────────────────────
 */
export async function saveCatalogue(
  caller: Caller,
  drafts: GameDraft[],
): Promise<Outcome<CatalogueEntry[]>> {
  const who = await authorise(caller, ADMIN);
  if (!who) return FORBIDDEN;

  if (!Array.isArray(drafts) || drafts.length > MAX_GAMES) {
    return { ok: false, reason: "invalid", message: "That is not a list of games." };
  }

  const checked: Checked[] = [];
  for (const draft of drafts) {
    const game = check(draft);
    if (!game) {
      return {
        ok: false,
        reason: "invalid",
        message: "One of the games is not filled in properly.",
      };
    }
    checked.push(game);
  }

  // Two games at one address is a route with no answer. Caught here rather than
  // left to the unique constraint so the panel gets a sentence instead of a
  // database error it would have to translate.
  const slugs = new Set(checked.map((game) => game.slug));
  if (slugs.size !== checked.length) {
    return {
      ok: false,
      reason: "conflict",
      message: "Two games have the same address. Give one of them a different name.",
    };
  }

  await prisma.$transaction(async (tx) => {
    const keep = checked.map((game) => game.id).filter((id): id is number => id !== null);
    await tx.game.deleteMany({ where: { id: { notIn: keep } } });

    for (const [position, game] of checked.entries()) {
      const fields = {
        slug: game.slug,
        name: game.name,
        blurb: game.blurb,
        icon: game.icon,
        engine: game.engine,
        inRail: game.inRail,
        position,
      };

      /*
        `upsert` on the id would need one to create with, and a new game has
        none. Split instead: an id means it was already there — and `update`
        throwing on a row deleted by another administrator mid-edit is the right
        outcome, because the transaction takes the rest of the save with it
        rather than half-applying an arrangement.
      */
      const saved =
        game.id === null
          ? await tx.game.create({ data: fields })
          : await tx.game.update({ where: { id: game.id }, data: fields });

      const keepTiers = game.tiers
        .map((tier) => tier.id)
        .filter((id): id is number => id !== null);
      await tx.tier.deleteMany({ where: { gameId: saved.id, id: { notIn: keepTiers } } });

      for (const [tierPosition, tier] of game.tiers.entries()) {
        const tierFields = {
          gameId: saved.id,
          name: tier.name,
          minBet: tier.minBet,
          maxBet: tier.maxBet,
          seats: tier.seats,
          floor: tier.floor,
          minDecks: tier.minDecks,
          maxDecks: tier.maxDecks,
          position: tierPosition,
        };

        if (tier.id === null) await tx.tier.create({ data: tierFields });
        else await tx.tier.update({ where: { id: tier.id }, data: tierFields });
      }
    }

    await record(
      {
        action: "catalogue.saved",
        actor: { vrpId: who.vrpId, name: who.name, role: who.role },
        subject: { vrpId: who.vrpId, name: who.name },
        detail: {
          games: checked.length,
          tiers: checked.reduce((total, game) => total + game.tiers.length, 0),
          // The list itself, so the trail says what the floor looked like after
          // the change rather than only that it changed.
          slugs: checked.map((game) => game.slug).join(", "),
        },
      },
      tx,
    );
  });

  return getCatalogue(caller);
}

/**
 * Throw away every cached row this app holds.
 *
 * The escape hatch. Cached data is only ever a copy of what the database
 * already says, so this cannot lose anything — the worst case is that the next
 * few queries are slower.
 *
 * It exists because not every write goes through Prisma. A role edited directly
 * in `pnpm db:studio`, or a row changed by hand during an incident, leaves a
 * cached copy that nothing will purge until it expires. `setRole`
 * (lib/banker.ts) is the supported path and needs none of this; this is for
 * when someone has gone around it.
 *
 * Recorded, because "who cleared the cache and when" is a question worth being
 * able to answer while working out why something looked stale.
 */
export async function flushQueryCache(caller: Caller): Promise<Outcome<{ deleted: number }>> {
  const who = await authorise(caller, ADMIN);
  if (!who) return FORBIDDEN;

  const { deleted } = await flushCache(CACHE_PREFIX);

  await record({
    action: "cache.flushed",
    actor: { vrpId: who.vrpId, name: who.name, role: who.role },
    detail: { deleted },
  });

  return { ok: true, data: { deleted } };
}
