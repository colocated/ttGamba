"use server";

/**
 * Blackjack, as the things a player can do.
 *
 * Every export is the same five steps: check who is asking, bring the round up
 * to date against the clock, hand it to lib/blackjack/engine.ts, move whatever
 * chips that produced, write it all back in one transaction. The rules are not
 * here and the chips are not there — this file is only the join between them.
 *
 * ── Reading the table is a write, and has to be ───────────────────────────
 * `readTable` looks like a query and is not. Nothing schedules a round: the
 * clock is turned by whoever is looking at the table, so every read may deal a
 * hand, close a betting window, stand a player who never acted, or pay a table
 * out. That is the design, and its consequences are worth knowing — the poll is
 * the dealer, and a table nobody is watching is a table where nothing happens.
 *
 * ── Why the whole state is compared, not a version column ─────────────────
 * Two players hitting at the same moment, and the round advancing underneath
 * both of them, is the ordinary case at a full table rather than a rare one.
 * Every write is conditional on `Table.state` still being the exact string it
 * was read as, so the loser is told it lost and goes round again with the
 * round the winner wrote.
 *
 * A version column would do the same job and need a migration; the state is
 * already a single column whose value is the whole of what is being guarded, so
 * comparing it *is* the version. The cards drawn inside a losing attempt are
 * rolled back with it — the draw and the state that records it are in one
 * transaction, and there is no arrangement in which a card leaves the shoe
 * without a hand to land in.
 */

import { record, type Db } from "./audit";
import { ANYONE, authorise, FORBIDDEN, readWhole, type Caller } from "./auth";
import type { SeatRow } from "./casino";
import { AMOUNT_LIMIT, type Outcome as Answer } from "./desk";
import { prisma } from "./db";
import type { Role } from "./generated/prisma/enums";
import {
  backBet,
  catchUp,
  insuranceSettled,
  insure,
  movesForPlayer,
  parseRound,
  play,
  refundBackers,
  releaseAbsent,
  stake,
  viewOf,
  type Deal,
  type Payout,
} from "./blackjack/engine";
import { backBetsOf, bettingOpen, type Round, type TableView } from "./blackjack/round";
import type { Move } from "./blackjack/rules";
import { toChips, toSeatRow, toStored } from "./rows";
import { draw, reshuffleIfPastCut } from "./shoe";

/** Thrown to send a transaction round again after losing the compare-and-swap. */
class Restart extends Error {}
/** Thrown when a balance could not cover what the move needed. */
class Broke extends Error {}

const SHORT: Answer<never> = {
  ok: false,
  reason: "funds",
  message: "You do not have the chips for that.",
};

const GONE: Answer<never> = {
  ok: false,
  reason: "gone",
  message: "That table is not there any more.",
};

/*
  Four losses of the compare-and-swap in a row. `conflict` is the desk's word
  for "somebody else moved first", which is exactly what happened, and the
  interface already knows to offer a retry rather than an apology for it.
*/
const BUSY: Answer<never> = {
  ok: false,
  reason: "conflict",
  message: "The table moved on. Try that again.",
};

/**
 * What one step at the table produced.
 *
 * `delta` is chips to move off the caller's own balance — positive takes,
 * negative gives back — and is separate from `payouts`, which are chips owed to
 * anybody at all, including other people. The two are applied differently:
 * `delta` is conditional on the balance covering it and refuses the move if it
 * does not, and a payout is money already won and is never refused.
 */
type Step = {
  round: Round;
  delta?: number;
  payouts?: Payout[];
};

type Table = {
  id: number;
  tierId: number;
  state: string | null;
  tier: { minBet: bigint; maxBet: bigint; seats: number; minDecks: number; maxDecks: number };
};

/** The transaction handle, as `record` and the shoe already understand it. */
type Tx = Db;

/**
 * A stake, which unlike every other amount in this app may be nothing.
 *
 * `readAmount` refuses zero on purpose — at the banker's desk a request to move
 * no chips is malformed rather than small, and it is right to say so. A stake
 * is not that. Zero is the instruction "take my chips back off the table", and
 * it is the one a player gives every time they change their mind before the
 * deal or decline insurance.
 *
 * Reusing the desk's reader here cost three controls that did nothing at all:
 * Cancel bet, clearing a back bet, and "No thanks" to insurance were all
 * refused before they reached the table, silently, because the amount they sent
 * was zero.
 */
function readStake(value: unknown): number | null {
  return readWhole(value, 0, AMOUNT_LIMIT);
}

/**
 * The one path to the table. Everything else in this file is a caller.
 *
 * `run` is handed a round that has already been brought up to date, and may
 * return `null` to mean "that move was not legal" — in which case the clock's
 * own work is still written, because the fact that the betting window closed
 * does not stop being true just because somebody then asked for something silly.
 */
async function atTable<T>(
  caller: Caller,
  tableId: number,
  run: (context: {
    round: Round;
    table: Table;
    who: { vrpId: number; name: string | null; role: Role; chips: number };
    deal: Deal;
    now: number;
    /**
     * The transaction. Everything a step reads or writes goes through it.
     *
     * Not optional and not a convenience: an audit row written on `prisma`
     * would survive a transaction that then rolled back, leaving a trail
     * claiming chips moved when they did not — and a seat read outside it could
     * answer from a moment either side of the round being written.
     */
    tx: Tx;
  }) => Promise<{ step: Step; result: T } | null>,
): Promise<Answer<T | null>> {
  const who = await authorise(caller, ANYONE);
  if (!who) return FORBIDDEN;

  const id = readWhole(tableId, 1, Number.MAX_SAFE_INTEGER);
  if (id === null) return GONE;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const table = await prisma.table.findUnique({
      where: { id },
      select: {
        id: true,
        tierId: true,
        state: true,
        tier: {
          select: { minBet: true, maxBet: true, seats: true, minDecks: true, maxDecks: true },
        },
      },
    });
    if (!table) return GONE;

    const raw = table.state;

    try {
      const answer = await prisma.$transaction(async (tx) => {
        const now = Date.now();
        const deal: Deal = (count) => draw(tx, id, count);

        const before = parseRound(raw);

        /*
          Anybody who has left takes their un-dealt chips with them, before the
          clock is turned — because the clock's next move might be to deal, and
          dealing a hand to a chair nobody is in is the thing this prevents.
        */
        const seated = await tx.tableSeat.findMany({
          where: { tableId: id },
          select: { vrpId: true },
        });
        const released = releaseAbsent(
          before,
          new Set(seated.map((seat) => seat.vrpId)),
        );

        const caught = await catchUp(released.round, now, deal);

        const balance = await tx.balance.findUnique({
          where: { vrpId: who.vrpId },
          select: { chips: true },
        });

        const step = await run({
          round: caught.round,
          table,
          tx,
          who: {
            vrpId: who.vrpId,
            name: who.name,
            role: who.role,
            chips: balance ? toChips(balance.chips) : 0,
          },
          deal,
          now,
        });

        const round = step?.step.round ?? caught.round;
        const payouts = [
          ...released.payouts,
          ...caught.payouts,
          ...(step?.step.payouts ?? []),
        ];
        const delta = step?.step.delta ?? 0;

        /*
          The caller's own stake moves before anything is written down. A
          conditional decrement rather than a read and a write: two tabs
          doubling at once would both pass a check made a moment earlier, and
          only the database can decide between them.
        */
        if (delta > 0) {
          const taken = await tx.balance.updateMany({
            where: { vrpId: who.vrpId, chips: { gte: toStored(delta) } },
            data: { chips: { decrement: toStored(delta) } },
          });
          if (taken.count !== 1) throw new Broke();
        } else if (delta < 0) {
          await tx.balance.update({
            where: { vrpId: who.vrpId },
            data: { chips: { increment: toStored(-delta) } },
          });
        }

        const written = await tx.table.updateMany({
          where: { id, state: raw },
          data: { state: JSON.stringify(round) },
        });
        if (written.count !== 1) throw new Restart();

        for (const payout of payouts) {
          const after = await tx.balance.update({
            where: { vrpId: payout.vrpId },
            data: { chips: { increment: toStored(payout.amount) } },
            select: { chips: true },
          });

          await record(
            {
              action: payout.action,
              actor: { vrpId: payout.vrpId, name: payout.name },
              subject: { vrpId: payout.vrpId, name: payout.name },
              amount: payout.amount,
              balanceAfter: toChips(after.chips),
              note: payout.note,
            },
            tx,
          );
        }

        /*
          The cut card is honoured here and nowhere else: between rounds, which
          is the only moment a shoe may be replaced without a hand spanning two
          of them (lib/shoe.ts). A round having ended is exactly the round id
          having moved on.
        */
        if (round.id !== before.id) {
          await reshuffleIfPastCut(tx, id, {
            min: table.tier.minDecks,
            max: table.tier.maxDecks,
          });
        }

        // Reading the table is proof the player is still at it, so the same
        // call that turns the clock holds the chair.
        await tx.tableSeat.updateMany({
          where: { tableId: id, vrpId: who.vrpId },
          data: { seenAt: new Date() },
        });

        return { ok: true as const, data: step ? step.result : null };
      });

      return answer;
    } catch (error) {
      if (error instanceof Restart) continue;
      if (error instanceof Broke) return SHORT;
      throw error;
    }
  }

  // Told rather than thrown: the player presses again and the table has almost
  // certainly settled by then.
  return BUSY;
}

// ── Reading ────────────────────────────────────────────────────────────────

/**
 * The table, as this player may see it.
 *
 * Everything the felt draws comes through here on one poll, so the cards, the
 * seats and the clock can never be a few seconds out of step with each other —
 * which they would be if the round came from one call and the occupancy from
 * `getPlace`'s slower one.
 *
 * `now` is the server's clock, sent alongside the deadlines it produced. The
 * interface counts down against the *difference* rather than against the
 * browser's own time, because a player whose machine is a minute fast would
 * otherwise watch every window expire the moment it opened.
 */
export async function readTable(caller: Caller, tableId: number): Promise<Answer<TableView | null>> {
  return atTable(caller, tableId, async ({ round, table, who, now, tx }) => {
    const seats = await tx.tableSeat.findMany({ where: { tableId: table.id } });
    const mine = seats.find((seat) => seat.vrpId === who.vrpId) ?? null;
    const shoe = await tx.shoe.findUnique({
      where: { tableId: table.id },
      select: { decks: true, cursor: true },
    });

    const view: TableView = {
      round: viewOf(round),
      seats: seats.map(toSeatRow).sort((a: SeatRow, b: SeatRow) => a.position - b.position),
      seat: mine?.position ?? null,
      account: { vrpId: who.vrpId, role: who.role, chips: who.chips },
      moves: movesForPlayer(round, who.vrpId, who.chips)?.moves ?? [],
      backing: backBetsOf(round, who.vrpId).map((entry) => ({
        seat: entry.seat,
        amount: entry.bet.amount,
      })),
      limits: { min: toChips(table.tier.minBet), max: toChips(table.tier.maxBet) },
      cardsLeft: shoe ? shoe.decks * 52 - shoe.cursor : null,
      left: round.deadline === null ? null : Math.max(0, round.deadline - now),
    };

    // No state change of its own — the catch-up above is the only thing that
    // may have moved, and it is written whether or not this returns a step.
    return { step: { round }, result: view };
  });
}

// ── Betting ────────────────────────────────────────────────────────────────

/**
 * Put chips on your own square, or change them before the deal.
 *
 * The whole stake in one call rather than a chip at a time: the interface
 * stacks chips locally as they are pressed and commits the total, so one round
 * is one balance movement and one line in the trail. A stake of zero pulls the
 * bet back off the table, which also gives every backer riding it their chips
 * returned — they staked on a hand that is now not going to exist.
 */
export async function placeStake(
  caller: Caller,
  tableId: number,
  amount: number,
): Promise<Answer<boolean | null>> {
  return atTable(caller, tableId, async ({ round, table, who, now, tx }) => {
    const wanted = readStake(amount);
    if (wanted === null) return null;

    const seats = await tx.tableSeat.findMany({
      where: { tableId: table.id, vrpId: who.vrpId },
      select: { position: true },
    });
    const seat = seats[0]?.position;
    if (seat === undefined) return null;

    if (!bettingOpen(round.phase)) return null;

    /*
      Table limits, checked against the tier rather than against anything the
      browser sent. Zero is always allowed — it is how a bet is taken back — and
      everything else has to sit inside what the table plays for.
    */
    const min = toChips(table.tier.minBet);
    const max = toChips(table.tier.maxBet);
    if (wanted !== 0 && (wanted < min || wanted > max)) return null;

    const existing = round.seats.find((entry) => entry.seat === seat);
    const staked = stake(round, seat, who, wanted, now);
    if (!staked) return null;

    /*
      Pulling a bet takes everybody riding it with it. Their chips go back
      untouched — nothing was dealt, so nothing was lost — and the alternative
      is a back bet settling against a hand that never existed.
    */
    const payouts =
      wanted === 0 && existing ? refundBackers(existing) : [];
    const cleared =
      wanted === 0 && existing
        ? {
            ...staked.round,
            seats: staked.round.seats.map((entry) =>
              entry.seat === seat ? { ...entry, backers: [] } : entry,
            ),
          }
        : staked.round;

    if (staked.delta > 0) {
      await record(
        {
          action: "game.bet",
          actor: { vrpId: who.vrpId, name: who.name, role: who.role },
          subject: { vrpId: who.vrpId, name: who.name },
          amount: staked.delta,
          note: `Blackjack, seat ${seat}`,
        },
        tx,
      );
    }

    return {
      step: { round: cleared, delta: staked.delta, payouts },
      result: true,
    };
  });
}

/**
 * Back somebody else's hand.
 *
 * Open to anyone at the table, seated or not — a player who has sat one out can
 * still have an opinion about the hand in front of them, and a spectator
 * waiting for a chair has something to do while they wait.
 *
 * The stake rides that seat's first hand and never grows. If they split it
 * stays with the first of the two; if they double it settles on the same cards
 * at a single payout. Nothing anybody else presses can take another chip off a
 * backer, which is the property that makes this safe to offer to somebody who
 * has walked away from the screen.
 */
export async function placeBackBet(
  caller: Caller,
  tableId: number,
  seat: number,
  amount: number,
): Promise<Answer<boolean | null>> {
  return atTable(caller, tableId, async ({ round, table, who, tx }) => {
    const wanted = readStake(amount);
    const position = readWhole(seat, 1, table.tier.seats);
    if (wanted === null || position === null) return null;

    const min = toChips(table.tier.minBet);
    const max = toChips(table.tier.maxBet);
    if (wanted !== 0 && (wanted < min || wanted > max)) return null;

    const backed = backBet(round, position, who, wanted);
    if (!backed) return null;

    if (backed.delta > 0) {
      await record(
        {
          action: "game.bet",
          actor: { vrpId: who.vrpId, name: who.name, role: who.role },
          subject: { vrpId: who.vrpId, name: who.name },
          amount: backed.delta,
          note: `Backing seat ${position}`,
        },
        tx,
      );
    }

    return { step: { round: backed.round, delta: backed.delta }, result: true };
  });
}

/**
 * Take insurance, or turn it down.
 *
 * `0` is a real answer rather than a refusal to answer, and saying it is what
 * lets the table stop waiting — see `insuranceSettled`. A player who says
 * nothing at all is carried by the deadline instead, which declines for them.
 */
export async function takeInsurance(
  caller: Caller,
  tableId: number,
  amount: number,
): Promise<Answer<boolean | null>> {
  return atTable(caller, tableId, async ({ round, who, now, tx }) => {
    const wanted = readStake(amount);
    if (wanted === null) return null;

    const insured = insure(round, who, wanted);
    if (!insured) return null;

    /*
      Once *everybody* has answered there is nothing left to wait for, so the
      window closes early. Only then — an earlier version brought the deadline
      forward on the first answer, which cut every other player off the moment
      one person pressed a button.

      Bringing the deadline forward rather than jumping the phase keeps every
      route through `catchUp`, so the peek, the reveal and the settlement all
      happen in the one place that knows how to do them.
    */
    const settled = insuranceSettled(insured.round)
      ? { ...insured.round, deadline: now }
      : insured.round;

    if (insured.delta > 0) {
      await record(
        {
          action: "game.bet",
          actor: { vrpId: who.vrpId, name: who.name, role: who.role },
          subject: { vrpId: who.vrpId, name: who.name },
          amount: insured.delta,
          note: "Blackjack insurance",
        },
        tx,
      );
    }

    return { step: { round: settled, delta: insured.delta }, result: true };
  });
}

/**
 * Hit, stand, double or split.
 *
 * Refused unless it is this player's turn, on this hand, and the move is one
 * the rules offer — checked with the same function the buttons were drawn from
 * (`movesFor`), so there is no version of the interface that can ask for
 * something the table would allow but did not show.
 */
export async function makeMove(
  caller: Caller,
  tableId: number,
  move: Move,
): Promise<Answer<boolean | null>> {
  return atTable(caller, tableId, async ({ round, who, now, deal, tx }) => {
    if (move !== "hit" && move !== "stand" && move !== "double" && move !== "split") return null;

    const played = await play(round, who, move, now, deal);
    if (!played) return null;

    if (played.cost > 0) {
      await record(
        {
          action: "game.bet",
          actor: { vrpId: who.vrpId, name: who.name, role: who.role },
          subject: { vrpId: who.vrpId, name: who.name },
          amount: played.cost,
          note: move === "double" ? "Blackjack double" : "Blackjack split",
        },
        tx,
      );
    }

    /*
      A move can finish the round outright — the last player standing, with
      every other hand already busted, leaves the dealer nothing to play — and
      the settlement happens inside `play` rather than on a later tick. Its
      payouts have to come back out with it or the round pays nobody.
    */
    return {
      step: { round: played.round, delta: played.cost, payouts: played.payouts },
      result: true,
    };
  });
}
