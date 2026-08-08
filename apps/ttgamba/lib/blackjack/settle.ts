import "server-only";

/**
 * Settling up with anybody who is no longer at the table.
 *
 * ── Why this exists apart from lib/blackjack.ts ───────────────────────────
 * Because it has to be callable from the *table* layer, which is where seats
 * are actually released — `stand`, and the sweeper that takes a chair back from
 * somebody who has gone quiet (lib/tables.ts). That layer deals every game and
 * knows nothing about a round, and lib/blackjack.ts is `"use server"` and may
 * only export things a browser is allowed to call. So the join lives here.
 *
 * ── The hole it fills ─────────────────────────────────────────────────────
 * `releaseAbsent` already refunded departed players, and it ran at the front of
 * every read of the table — which is exactly the wrong moment, because the
 * person who left is the person who was reading it. Bet during the betting
 * window, leave before the deal, and if nobody else was at the table there was
 * no next read: the chips were gone from the balance and sitting on a square
 * belonging to nobody. If the table was then reaped, they were gone for good.
 *
 * Refunding at the moment the seat is released does not depend on anybody
 * looking, which is the property that was missing.
 */

import { record, type Db } from "../audit";
import { toChips, toStored } from "../rows";
import { parseRound, releaseAbsent, voidRound, type Payout } from "./engine";

/**
 * Give back whatever this table is holding for people who are not at it.
 *
 * Two cases, and the second is not merely the first taken to its limit:
 *
 * **Somebody left.** Only stakes that have not been dealt against come back —
 * once cards are out, the chips are in the round and the hand plays itself out
 * and settles, and the payout finds them wherever they are because settlement
 * credits a vRP id rather than a chair.
 *
 * **Everybody left.** Now the hand *cannot* play itself out: nothing advances a
 * round except somebody reading the table, and the shoe is discarded the moment
 * the table registers as empty. The round is void and every chip on it goes
 * back. See `voidRound`.
 *
 * Safe to call more than once, and called more than once — the compare-and-swap
 * on the state is what makes a second caller a no-op rather than a second
 * refund.
 */
export async function reconcileSeats(db: Db, tableId: number): Promise<void> {
  const table = await db.table.findUnique({ where: { id: tableId }, select: { state: true } });
  if (!table?.state) return;

  const seats = await db.tableSeat.findMany({ where: { tableId }, select: { vrpId: true } });
  const round = parseRound(table.state);

  const empty = seats.length === 0;
  const released = empty
    ? { round, payouts: voidRound(round) }
    : releaseAbsent(round, new Set(seats.map((seat) => seat.vrpId)));

  /*
    An emptied table keeps no round at all. Clearing it rather than leaving the
    voided one behind matters for a table that stays on the floor: the next
    player to sit down should find a clean square, not somebody else's abandoned
    hand with the phase still reading `playing`.
  */
  const next = empty ? null : JSON.stringify(released.round);

  /*
    Nothing to do is the common case — most seats are given up between rounds,
    with nothing on the table. Compared against the *reparsed* round rather than
    the raw column, because a round that round-trips through JSON is not
    guaranteed to come back byte-for-byte and a formatting difference is not a
    change worth writing.
  */
  if (released.payouts.length === 0 && next === JSON.stringify(round)) return;

  /*
    Conditional on the state not having moved. Two callers can arrive at once —
    the last player standing up runs this, and so does the sweeper a moment
    later — and the loser doing nothing is exactly right: the winner has already
    paid everybody.
  */
  const written = await db.table.updateMany({
    where: { id: tableId, state: table.state },
    data: { state: next },
  });
  if (written.count !== 1) return;

  for (const payout of released.payouts) await pay(db, payout);
}

async function pay(db: Db, payout: Payout): Promise<void> {
  const after = await db.balance.update({
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
    db,
  );
}
