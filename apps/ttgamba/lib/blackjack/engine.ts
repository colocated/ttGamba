import "server-only";

/**
 * The dealer.
 *
 * Everything that changes a round of blackjack is in this file, and nothing
 * that changes a round is anywhere else. The actions a player can call are
 * lib/blackjack.ts, and every one of them is a thin wrapper: authorise, hand
 * the round to a function in here, write back what comes out.
 *
 * ── There is no timer, and there is no loop ───────────────────────────────
 * A round carries a deadline and nothing watches it. `catchUp` is what turns
 * the clock, and it runs at the front of every single read and every single
 * action — so the table advances because somebody is looking at it, and a table
 * nobody is looking at simply waits, which is the correct thing for it to do.
 *
 * That is not a compromise around not having a scheduler. It is better than
 * having one: a `setTimeout` per open table dies with the process, cannot be
 * shared between two instances of the app, and silently stops dealing after a
 * deploy with players sitting at the table. A deadline in a row survives all
 * three, and the poll that already holds a player's seat is the same poll that
 * moves the game on.
 *
 * The consequence to keep in mind: `catchUp` may have to apply *several*
 * transitions in one call — a table nobody read for a minute has a betting
 * window, a deal, a dealer's hand and a payout all overdue — so it is a loop
 * with a bound rather than a single step.
 *
 * ── Nothing here trusts the caller ────────────────────────────────────────
 * Every function re-derives what is legal from the round it was handed, using
 * the same lib/blackjack/rules.ts the interface draws its buttons from. A move
 * that arrives for the wrong seat, the wrong hand, or at the wrong moment is
 * refused rather than applied — the buttons are a convenience and this is the
 * gate.
 */

import { readName } from "../auth";
import type { Card } from "../cards";
import { isCard } from "../cards";
import {
  emptyRound,
  MAX_HANDS,
  TIMING,
  type BackBet,
  type Hand,
  type Round,
  type RoundView,
  type SeatRound,
} from "./round";
import {
  insuranceReturn,
  isAcePair,
  isBust,
  isNatural,
  movesFor,
  returnFor,
  settleHand,
  total,
  valueOf,
  type Move,
  type Outcome,
} from "./rules";

/** Draw from the table's shoe. Bound to a transaction by the caller. */
export type Deal = (count: number) => Promise<Card[]>;

/**
 * Chips owed to somebody, once the round is settled.
 *
 * Returned rather than applied, because moving a balance is a database write
 * and this file does not have one. The caller applies them inside the same
 * transaction that writes the round back, so a settled round and the chips it
 * paid can never be two different facts.
 */
export type Payout = {
  vrpId: number;
  name: string | null;
  /** Always positive. Stake included — this is what lands in the balance. */
  amount: number;
  action: "game.payout" | "game.refund";
  note: string;
};

// ── Reading and writing the stored state ───────────────────────────────────

/**
 * The round on a table, or a fresh one.
 *
 * Deliberately paranoid. `Table.state` is a JSON column a previous build of
 * this engine wrote, and the schema says as much: a table can outlive the
 * version of the code that filled it in. Anything that does not parse as the
 * shape this build understands is discarded and the table starts again — which
 * costs at most one hand, and is the only answer that cannot deal from a state
 * it has half understood.
 */
export function parseRound(raw: string | null): Round {
  if (!raw) return emptyRound();

  try {
    const value: unknown = JSON.parse(raw);
    if (!isRound(value)) return emptyRound();
    return value;
  } catch {
    return emptyRound();
  }
}

function isRound(value: unknown): value is Round {
  if (typeof value !== "object" || value === null) return false;
  const round = value as Partial<Round>;
  return (
    round.v === 1 &&
    typeof round.id === "number" &&
    typeof round.phase === "string" &&
    Array.isArray(round.seats) &&
    typeof round.dealer === "object" &&
    round.dealer !== null &&
    Array.isArray(round.dealer.cards) &&
    round.dealer.cards.every(isCard)
  );
}

/**
 * The round as a browser may see it.
 *
 * ── Built field by field, never by deleting one ───────────────────────────
 * The temptation is `{ ...round, dealer: { ...round.dealer, hole: undefined } }`
 * and it is a trap: the next person to add something to the dealer's hand gets
 * it published for free, and nothing anywhere fails. Listing what may cross
 * means a new field is invisible until somebody decides it should not be.
 *
 * What is withheld is one card. It is enough to decide whether to take
 * insurance, whether to hit a sixteen, and whether the round is already lost —
 * which is to say it is the game.
 */
export function viewOf(round: Round): RoundView {
  return {
    v: round.v,
    id: round.id,
    phase: round.phase,
    deadline: round.deadline,
    turn: round.turn,
    seats: round.seats,
    dealer: {
      cards: round.dealer.cards,
      // Whether there is a card face down, never which card it is.
      hole: round.dealer.hole !== null,
      natural: round.dealer.natural,
    },
  };
}

// ── The clock ──────────────────────────────────────────────────────────────

/**
 * Bring a round up to date with the wall clock.
 *
 * Applies every transition that is due, in order, and stops at the first one
 * that is not. The bound is not defensive dressing: `payout` rolls into
 * `waiting`, and a bug that left a phase with a deadline in the past would
 * otherwise spin here forever inside a database transaction.
 *
 * Twelve is comfortably more than the longest real chain — betting, deal,
 * insurance, several dealer cards, payout, reset — and far short of a hang.
 */
export async function catchUp(
  round: Round,
  now: number,
  deal: Deal,
): Promise<{ round: Round; payouts: Payout[] }> {
  let current = round;
  const payouts: Payout[] = [];

  for (let step = 0; step < 12; step += 1) {
    if (current.deadline === null || now < current.deadline) break;

    const wasPhase = current.phase;
    const wasDeadline = current.deadline;

    switch (current.phase) {
      case "betting":
        current = await startDeal(current, now, deal);
        break;

      case "dealt":
        current = await openInsuranceOrPeek(current, now, payouts);
        break;

      case "insurance":
        current = await closeInsurance(current, now, payouts);
        break;

      case "playing":
        // Nobody acted. A table cannot wait on one player, so the default is
        // the safe one: stand. It never takes more chips and never busts a
        // hand that was still alive.
        current = advanceTurn(closeCurrentHand(current), now, payouts);
        break;

      case "dealer":
        current = await dealerStep(current, now, deal, payouts);
        break;

      case "payout":
        current = reset(current);
        break;

      default:
        return { round: current, payouts };
    }

    /*
      A transition that changed nothing would spin until the bound. Compared
      against what this iteration started from, not against the round this call
      was handed — those are the same thing only on the first pass, and after
      that the second test is meaningless.
    */
    if (current.phase === wasPhase && current.deadline === wasDeadline) break;
  }

  return { round: current, payouts };
}

// ── Betting ────────────────────────────────────────────────────────────────

/**
 * Put a seat's stake on the table, or change it before the cards come out.
 *
 * The whole stake for the round in one call rather than a chip at a time. The
 * interface stacks chips in the circle as they are pressed and commits the
 * total, which keeps one round to one bet: one balance movement, one line in
 * the audit trail, and no way for a series of presses to be half-applied.
 *
 * Returns the difference to move on the balance — positive means take that
 * much more, negative means give some back — so the caller settles it in one
 * conditional update rather than two.
 */
export function stake(
  round: Round,
  seat: number,
  who: { vrpId: number; name: string | null },
  amount: number,
  now: number,
): { round: Round; delta: number } | null {
  if (round.phase !== "waiting" && round.phase !== "betting") return null;

  const seats = [...round.seats];
  const index = seats.findIndex((entry) => entry.seat === seat);
  const existing = index === -1 ? null : seats[index];

  // One seat is one player. A chair that changed hands between rounds must not
  // inherit the last occupant's chips.
  if (existing && existing.vrpId !== who.vrpId) return null;

  const before = existing?.hands[0]?.bet ?? 0;
  const delta = amount - before;

  const entry: SeatRound = existing
    ? { ...existing, hands: amount > 0 ? [freshHand(amount)] : [] }
    : {
        seat,
        vrpId: who.vrpId,
        name: readName(who.name),
        hands: amount > 0 ? [freshHand(amount)] : [],
        insurance: 0,
        insuranceReturned: 0,
        insuranceAnswered: false,
        backers: [],
      };

  if (index === -1) seats.push(entry);
  else seats[index] = entry;

  /*
    The window opens on the first stake and is not extended by later ones.
    Otherwise a table with somebody idly adding and removing chips never deals,
    and every player who bet promptly waits on the one who did not.
  */
  const anyBet = seats.some((one) => one.hands.length > 0);
  const phase = anyBet ? "betting" : "waiting";
  const deadline =
    phase === "betting" ? (round.phase === "betting" ? round.deadline : now + TIMING.betting) : null;

  return {
    round: { ...round, seats: seats.sort(bySeat), phase, deadline },
    delta,
  };
}

/**
 * Back somebody else's hand.
 *
 * Only on a seat that has already staked something — the bet rides their hand,
 * and a seat with no hand has nothing to ride. Never on your own seat, where it
 * would just be a larger bet wearing a disguise, and where it would settle
 * against your own first hand twice.
 */
export function backBet(
  round: Round,
  seat: number,
  who: { vrpId: number; name: string | null },
  amount: number,
): { round: Round; delta: number } | null {
  if (round.phase !== "waiting" && round.phase !== "betting") return null;

  const index = round.seats.findIndex((entry) => entry.seat === seat);
  if (index === -1) return null;

  const target = round.seats[index];
  if (target.vrpId === who.vrpId) return null;
  if (target.hands.length === 0) return null;

  const backers = [...target.backers];
  const at = backers.findIndex((backer) => backer.vrpId === who.vrpId);
  const before = at === -1 ? 0 : backers[at].amount;
  const delta = amount - before;

  const entry: BackBet = {
    vrpId: who.vrpId,
    name: readName(who.name),
    amount,
    outcome: null,
    returned: 0,
  };

  if (amount <= 0) {
    if (at !== -1) backers.splice(at, 1);
  } else if (at === -1) {
    backers.push(entry);
  } else {
    backers[at] = entry;
  }

  const seats = [...round.seats];
  seats[index] = { ...target, backers };

  return { round: { ...round, seats }, delta };
}

/**
 * Give back the chips of anybody who is no longer at the table.
 *
 * ── The bug this exists to fix ────────────────────────────────────────────
 * Standing up releases the chair (lib/tables.ts) and knows nothing about the
 * round, because the round is the engine's business and that layer deals every
 * game. So a player who bet and then left had their stake sitting on a square
 * belonging to nobody: their chips were gone from their balance, and the next
 * deal would have dealt a hand to an empty seat.
 *
 * Fixing it here rather than in `stand` is what keeps the two layers apart, and
 * it covers strictly more: standing up, being swept for going quiet, closing
 * the app, and losing the connection are all "no longer in the seats table",
 * and all of them arrive here on the very next read.
 *
 * ── Only before the cards come out ────────────────────────────────────────
 * Once a hand has been dealt the chips are in the round, and leaving does not
 * take them back out — that is what betting means. The hand plays itself out
 * and settles as it would have done, and the payout finds them wherever they
 * are, because settlement credits a vRP id rather than a chair.
 */
export function releaseAbsent(
  round: Round,
  present: ReadonlySet<number>,
): { round: Round; payouts: Payout[] } {
  if (round.phase !== "waiting" && round.phase !== "betting") return { round, payouts: [] };

  const gone = round.seats.filter((seat) => !present.has(seat.vrpId));
  if (gone.length === 0) return { round, payouts: [] };

  const payouts: Payout[] = [];

  for (const seat of gone) {
    const staked = seat.hands.reduce((sum, hand) => sum + hand.bet, 0);
    if (staked > 0) {
      payouts.push({
        vrpId: seat.vrpId,
        name: seat.name,
        amount: staked,
        action: "game.refund",
        note: `Left seat ${seat.seat} before the deal`,
      });
    }
    // Their backers were riding a hand that is now never going to exist.
    payouts.push(...refundBackers(seat));
  }

  const seats = round.seats.filter((seat) => present.has(seat.vrpId));
  const anyBet = seats.some((seat) => seat.hands.length > 0);

  return {
    round: {
      ...round,
      seats,
      phase: anyBet ? "betting" : "waiting",
      // The last bet leaving takes the clock with it. A window counting down
      // over an empty table would deal nothing and then deal nothing again.
      deadline: anyBet ? round.deadline : null,
    },
    payouts,
  };
}

/**
 * Give everything back, because there is nobody left to play the round out.
 *
 * ── When a table empties mid-hand ─────────────────────────────────────────
 * The round is advanced by whoever is reading the table (`catchUp`), so a table
 * everybody has walked away from is one where the dealer never draws another
 * card. The hands sit there, the chips sit with them, and the shoe is thrown
 * away the moment the table registers as empty — so the round cannot be
 * finished later even in principle.
 *
 * Voiding it is the only honest answer. It is what a casino does when a table
 * has to be abandoned: no result, everybody's chips back, including anybody who
 * was riding somebody else's hand.
 *
 * A round already in `payout` is left alone. Its money has moved — the winners
 * were paid when it settled — and refunding the stakes on top of that would be
 * paying for the same hand twice.
 */
export function voidRound(round: Round): Payout[] {
  if (round.phase === "waiting" || round.phase === "payout") return [];

  const payouts: Payout[] = [];

  for (const seat of round.seats) {
    const staked = seat.hands.reduce((sum, hand) => sum + hand.bet, 0) + seat.insurance;
    if (staked > 0) {
      payouts.push({
        vrpId: seat.vrpId,
        name: seat.name,
        amount: staked,
        action: "game.refund",
        note: "Table emptied mid-round",
      });
    }

    for (const backer of seat.backers) {
      if (backer.amount <= 0) continue;
      payouts.push({
        vrpId: backer.vrpId,
        name: backer.name,
        amount: backer.amount,
        action: "game.refund",
        note: "Table emptied mid-round",
      });
    }
  }

  return payouts;
}

/**
 * Everything a seat has to give back if its stake is pulled.
 *
 * A seat's backers are riding a hand that is about to stop existing, so their
 * chips go back to them. Refunds rather than losses: nothing was ever dealt.
 */
export function refundBackers(seat: SeatRound): Payout[] {
  return seat.backers
    .filter((backer) => backer.amount > 0)
    .map((backer) => ({
      vrpId: backer.vrpId,
      name: backer.name,
      amount: backer.amount,
      action: "game.refund" as const,
      note: `Seat ${seat.seat} pulled their bet`,
    }));
}

function freshHand(bet: number): Hand {
  return {
    cards: [],
    bet,
    doubled: false,
    fromSplit: false,
    closed: false,
    outcome: null,
    returned: 0,
  };
}

const bySeat = (a: SeatRound, b: SeatRound) => a.seat - b.seat;

// ── Dealing ────────────────────────────────────────────────────────────────

/**
 * The deal: two cards to every staked seat, two to the dealer, one of them
 * face down.
 *
 * Drawn in the order a dealer draws them — round the table, then the dealer,
 * and round again — rather than two at a time per seat. It costs nothing here
 * and it is the difference between the shoe being consumed in the order the
 * table watched it come out and being consumed in an order nobody could follow.
 * A player counting cards is entitled to have counted the right ones.
 */
async function startDeal(round: Round, now: number, deal: Deal): Promise<Round> {
  const playing = round.seats.filter((seat) => seat.hands.length > 0);

  // Everybody pulled their chips before the window closed. Nothing to deal.
  if (playing.length === 0) return reset(round);

  const cards = await deal(playing.length * 2 + 2);
  let next = 0;

  const dealt = new Map<number, Card[]>();
  for (const seat of playing) dealt.set(seat.seat, []);

  // Round the table, the dealer's up card, round again, then the hole card —
  // which is the order it happens at a table, and therefore the order the shoe
  // is consumed in. A player who has been counting is entitled to have counted
  // the right cards.
  for (const seat of playing) dealt.get(seat.seat)!.push(cards[next++]);
  const up = cards[next++];
  for (const seat of playing) dealt.get(seat.seat)!.push(cards[next++]);
  const hole = cards[next++];

  const withCards = round.seats.map((seat) => {
    const hand = dealt.get(seat.seat);
    if (!hand || seat.hands.length === 0) return seat;

    const first: Hand = { ...seat.hands[0], cards: hand };
    // A natural is finished the moment it is dealt. It is never asked to act
    // and never offered a move — there is no hand it could improve.
    return { ...seat, hands: [closeIfFinished(first)] };
  });

  return {
    ...round,
    seats: withCards,
    dealer: { cards: [up], hole, natural: false },
    phase: "dealt",
    deadline: now + TIMING.dealt,
    turn: null,
  };
}

/**
 * What happens the moment the cards have landed.
 *
 * Three roads, and which one is taken is decided entirely by the dealer's up
 * card:
 *
 * **An ace.** Insurance is offered before anything else, because it is a bet on
 * exactly the question about to be answered and offering it afterwards would be
 * offering it too late.
 *
 * **A ten.** The dealer peeks straight away — there is nothing to offer, and a
 * table that played a whole round out before discovering the dealer had
 * blackjack all along would have taken decisions, and chips, that never
 * counted.
 *
 * **Anything else.** No peek at all. The dealer cannot have a natural, so there
 * is nothing to look for, and looking would be a tell.
 */
async function openInsuranceOrPeek(round: Round, now: number, payouts: Payout[]): Promise<Round> {
  const up = round.dealer.cards[0];

  if (up && up[0] === "A") {
    return { ...round, phase: "insurance", deadline: now + TIMING.insurance };
  }

  if (up && valueOf(up) === 10) return peek(round, now, payouts);

  return beginPlay(round, now, payouts);
}

async function closeInsurance(round: Round, now: number, payouts: Payout[]): Promise<Round> {
  return peek(round, now, payouts);
}

/**
 * The dealer looks at their hole card.
 *
 * If it makes twenty-one the card goes face up immediately and the round is
 * over — which is the rule Jack asked for and the one most implementations get
 * halfway: they check, but they carry on dealing and only mention it at the
 * end. Turning it now is not a flourish. It stops players taking decisions,
 * doubling and splitting against a hand that has already won.
 *
 * If it does not, nothing is said and nothing is shown. The peek leaves no
 * trace in the view — the card stays face down and the phase moves on exactly
 * as it would have done if no peek had happened, because a player who could
 * tell the difference would know the dealer does not have a ten under there.
 */
function peek(round: Round, now: number, payouts: Payout[]): Round {
  const hole = round.dealer.hole;
  const natural = hole !== null && total([...round.dealer.cards, hole]).value === 21;

  if (!natural) return beginPlay(round, now, payouts);

  const revealed: Round = {
    ...round,
    dealer: { cards: [...round.dealer.cards, hole], hole: null, natural: true },
  };

  return settle(revealed, now, payouts);
}

/** Hand the table over to the first player with a decision to make. */
function beginPlay(round: Round, now: number, payouts: Payout[]): Round {
  const first = nextTurn(round, null);
  if (!first) return openDealer(round, now, payouts);

  return { ...round, phase: "playing", turn: first, deadline: now + TIMING.turn };
}

// ── The players' turns ─────────────────────────────────────────────────────

/**
 * Apply a move.
 *
 * `null` for anything that is not this player's to make right now. The move is
 * checked against `movesFor` — the same function the buttons were drawn from —
 * so the interface and the gate can never disagree about what was on offer.
 *
 * `cost` is the extra stake a double or a split needs. The caller takes it from
 * the balance in the same transaction, and a balance that cannot cover it is
 * what stops the move; that is why the check is made against a figure the
 * caller passes in rather than one read here.
 */
export async function play(
  round: Round,
  who: { vrpId: number; chips: number },
  move: Move,
  now: number,
  deal: Deal,
): Promise<{ round: Round; cost: number; payouts: Payout[] } | null> {
  if (round.phase !== "playing" || !round.turn) return null;

  const index = round.seats.findIndex((seat) => seat.seat === round.turn!.seat);
  if (index === -1) return null;

  const seat = round.seats[index];
  if (seat.vrpId !== who.vrpId) return null;

  const hand = seat.hands[round.turn.hand];
  if (!hand || hand.closed) return null;

  const legal = movesFor(
    { ...hand, fromSplit: hand.fromSplit },
    { chips: who.chips, hands: seat.hands.length, maxHands: MAX_HANDS },
  );
  if (!legal.includes(move)) return null;

  let hands = [...seat.hands];
  let cost = 0;

  switch (move) {
    case "stand":
      hands[round.turn.hand] = { ...hand, closed: true };
      break;

    case "hit": {
      const [card] = await deal(1);
      hands[round.turn.hand] = closeIfFinished({ ...hand, cards: [...hand.cards, card] });
      break;
    }

    case "double": {
      const [card] = await deal(1);
      cost = hand.bet;
      /*
        Doubling takes exactly one card and ends the hand, however small it is.
        Closing here rather than leaving it to `closeIfFinished` is the point:
        a doubled twelve is a finished hand, not one that may be hit again.
      */
      hands[round.turn.hand] = {
        ...hand,
        cards: [...hand.cards, card],
        bet: hand.bet * 2,
        doubled: true,
        closed: true,
      };
      break;
    }

    case "split": {
      cost = hand.bet;
      const aces = isAcePair(hand.cards);
      const [left, right] = await deal(2);

      /*
        Split aces take one card each and that is the hand. It is the oldest
        restriction in the game and the reason splitting them is still worth
        doing: without it, a pair of aces would be two hands starting on eleven
        with the whole shoe to draw from.
      */
      const first: Hand = {
        ...hand,
        cards: [hand.cards[0], left],
        fromSplit: true,
        closed: aces,
      };
      const second: Hand = {
        ...freshHand(hand.bet),
        cards: [hand.cards[1], right],
        fromSplit: true,
        closed: aces,
      };

      hands = [
        ...hands.slice(0, round.turn.hand),
        aces ? first : closeIfFinished(first),
        aces ? second : closeIfFinished(second),
        ...hands.slice(round.turn.hand + 1),
      ];
      break;
    }
  }

  const seats = [...round.seats];
  seats[index] = { ...seat, hands };

  const moved: Round = { ...round, seats };

  /*
    A split leaves the player on the *first* of the two new hands, which is now
    the hand at the same index — so the turn does not move even though the hands
    changed. Every other move either finished the hand or left it open, and
    `advanceTurn` reads which.

    The payouts matter here and are easy to lose: the last player standing can
    be the move that finishes the round outright — every other hand busted, so
    the dealer has nothing to play — and the settlement happens inside this
    call rather than on some later tick of the clock. Dropping them on the floor
    would be a round that resolved on screen and paid nobody.
  */
  const payouts: Payout[] = [];
  return { round: advanceTurn(moved, now, payouts), cost, payouts };
}

/** Close whatever the turn is pointing at. The timeout's stand. */
function closeCurrentHand(round: Round): Round {
  if (!round.turn) return round;

  const index = round.seats.findIndex((seat) => seat.seat === round.turn!.seat);
  if (index === -1) return round;

  const seat = round.seats[index];
  const hand = seat.hands[round.turn.hand];
  if (!hand) return round;

  const hands = [...seat.hands];
  hands[round.turn.hand] = { ...hand, closed: true };

  const seats = [...round.seats];
  seats[index] = { ...seat, hands };
  return { ...round, seats };
}

/**
 * Move to the next hand that still has a decision in it, or to the dealer.
 *
 * Called after every move as well as after a timeout, so a hand that finished
 * itself — a bust, a twenty-one, a double — hands over without the player
 * having to press anything else.
 */
function advanceTurn(round: Round, now: number, payouts: Payout[]): Round {
  const next = nextTurn(round, round.turn);
  if (!next) return openDealer(round, now, payouts);

  return { ...round, phase: "playing", turn: next, deadline: now + TIMING.turn };
}

/**
 * The next open hand, reading left to right and, within a seat, in the order
 * the hands were split off.
 *
 * `from` is where to carry on *after*, or null to start at the beginning. It is
 * not simply "the one after the current index", because a split inserts a hand
 * beside the one being played and the player stays on the first of the pair.
 */
function nextTurn(
  round: Round,
  from: { seat: number; hand: number } | null,
): { seat: number; hand: number } | null {
  let reached = from === null;

  for (const seat of round.seats) {
    for (let hand = 0; hand < seat.hands.length; hand += 1) {
      if (!reached) {
        if (seat.seat === from!.seat && hand === from!.hand) reached = true;
        // The current hand is still eligible — a split leaves the player on it.
        if (seat.seat === from!.seat && hand === from!.hand && !seat.hands[hand].closed) {
          return { seat: seat.seat, hand };
        }
        continue;
      }

      if (!seat.hands[hand].closed) return { seat: seat.seat, hand };
    }
  }

  return null;
}

// ── Insurance ──────────────────────────────────────────────────────────────

/**
 * Take insurance, or decline it.
 *
 * Capped at half the stake on the first hand, which is the rule and also the
 * only cap worth having: insurance pays two to one, so half a stake is exactly
 * the amount that breaks even when the dealer turns over a ten.
 *
 * Declining is recorded rather than ignored. A table that knows every player
 * has answered can stop waiting and get on with it, which is most of what makes
 * insurance bearable at a full table.
 */
export function insure(
  round: Round,
  who: { vrpId: number },
  amount: number,
): { round: Round; delta: number } | null {
  if (round.phase !== "insurance") return null;

  const index = round.seats.findIndex((seat) => seat.vrpId === who.vrpId);
  if (index === -1) return null;

  const seat = round.seats[index];
  if (seat.hands.length === 0) return null;

  const limit = Math.floor(seat.hands[0].bet / 2);
  const wanted = Math.max(0, Math.min(amount, limit));
  const delta = wanted - seat.insurance;

  const seats = [...round.seats];
  seats[index] = { ...seat, insurance: wanted, insuranceAnswered: true };

  return { round: { ...round, seats }, delta };
}

/** Whether everybody who could insure has said one way or the other. */
export function insuranceSettled(round: Round): boolean {
  return round.seats
    .filter((seat) => seat.hands.length > 0)
    .every((seat) => seat.insuranceAnswered);
}

// ── The dealer's hand ──────────────────────────────────────────────────────

/**
 * Turn the hole card over and decide whether there is anything left to play
 * for.
 *
 * A dealer who has nothing to beat does not draw. If every hand at the table
 * has busted or is a natural, the outcome is already fixed — busts have lost
 * whatever happens next, and a natural has won — and making the table sit
 * through a dealer drawing to seventeen for no reason is theatre at the
 * players' expense.
 */
function openDealer(round: Round, now: number, payouts: Payout[]): Round {
  const hole = round.dealer.hole;
  const revealed: Round = hole
    ? { ...round, dealer: { ...round.dealer, cards: [...round.dealer.cards, hole], hole: null } }
    : round;

  const live = revealed.seats.some((seat) =>
    seat.hands.some(
      (hand) => !isBust(hand.cards) && !isNatural(hand.cards, hand.fromSplit),
    ),
  );

  if (!live) return settle(revealed, now, payouts);

  return { ...revealed, phase: "dealer", turn: null, deadline: now + TIMING.dealer };
}

/**
 * One card to the dealer, or the end of their hand.
 *
 * A card at a time, with a beat between, so the table can watch it happen. The
 * alternative is the dealer's whole hand appearing at once, which is both less
 * to look at and — the part that matters — impossible to follow when it is the
 * card that busts them.
 *
 * Stands on all seventeens, soft ones included. That is what the felt says
 * (components/engines/blackjack/table.tsx prints it), and the two must agree:
 * a table whose paint promises one rule and whose dealer plays another is
 * cheating whether or not anybody notices.
 */
async function dealerStep(
  round: Round,
  now: number,
  deal: Deal,
  payouts: Payout[],
): Promise<Round> {
  const hand = total(round.dealer.cards);

  if (hand.value >= 17) return settle(round, now, payouts);

  const [card] = await deal(1);
  const drawn: Round = {
    ...round,
    dealer: { ...round.dealer, cards: [...round.dealer.cards, card] },
  };

  if (total(drawn.dealer.cards).value >= 17) return settle(drawn, now, payouts);

  return { ...drawn, deadline: now + TIMING.dealer };
}

// ── Settling ───────────────────────────────────────────────────────────────

/**
 * Work out what every hand at the table did, and what it is owed.
 *
 * The outcomes are written onto the round so the interface can say what
 * happened to each hand rather than only what the balance did — "you were
 * dealt twenty and the dealer made twenty-one" is a different thing to be told
 * from a number going down.
 */
function settle(round: Round, now: number, payouts: Payout[]): Round {
  const dealer = { cards: round.dealer.cards, natural: round.dealer.natural };

  const seats = round.seats.map((seat) => {
    let owed = 0;

    const hands = seat.hands.map((hand) => {
      const outcome = settleHand(
        { cards: hand.cards, natural: isNatural(hand.cards, hand.fromSplit) },
        dealer,
      );
      const returned = returnFor(outcome, hand.bet);
      owed += returned;
      return { ...hand, outcome, returned };
    });

    /*
      Insurance settles against the dealer's natural and nothing else. It is not
      affected by what the player's own hand did — a player can lose their hand
      and win their insurance in the same breath, which is the entire point of
      it.
    */
    const insuranceReturned = insuranceReturn(dealer.natural, seat.insurance);
    owed += insuranceReturned;

    /*
      Back bets ride the first hand. Not the best hand, not the total across a
      split — the one the backer was looking at when they put their chips down.
      They are paid at the hand's own rate, so a natural pays them three to two
      as well; what they never get is the doubled stake, because it was never
      their chips that doubled.
    */
    const backers = seat.backers.map((backer) => {
      const first = hands[0];
      if (!first) {
        return { ...backer, outcome: null, returned: backer.amount };
      }
      const returned = returnFor(first.outcome!, backer.amount);
      return { ...backer, outcome: first.outcome, returned };
    });

    for (const backer of backers) {
      if (backer.returned <= 0) continue;
      payouts.push({
        vrpId: backer.vrpId,
        name: backer.name,
        amount: backer.returned,
        action: backer.outcome === null ? "game.refund" : "game.payout",
        note: `Backed seat ${seat.seat}`,
      });
    }

    if (owed > 0) {
      payouts.push({
        vrpId: seat.vrpId,
        name: seat.name,
        amount: owed,
        action: "game.payout",
        note: `Blackjack, seat ${seat.seat}`,
      });
    }

    return { ...seat, hands, insuranceReturned, backers };
  });

  return { ...round, seats, phase: "payout", turn: null, deadline: now + TIMING.payout };
}

/** Clear the table and wait for the next stake. */
function reset(round: Round): Round {
  return emptyRound(round.id + 1);
}

/**
 * Finish a hand that has nothing left to decide.
 *
 * Twenty-one and a bust are both the end of a hand, and neither is a decision
 * the player should be asked to confirm. Closing them here rather than showing
 * a Stand button nobody would press is what keeps the table moving.
 */
function closeIfFinished(hand: Hand): Hand {
  const value = total(hand.cards).value;
  if (value >= 21) return { ...hand, closed: true };
  return hand;
}

// ── What the interface may not work out for itself ─────────────────────────

/**
 * Everything one player is allowed to do to this round at this moment.
 *
 * Worked out here rather than in the browser, because the browser does not know
 * the hole card and — more to the point — because this is the same answer the
 * actions check against. The interface draws what it is given and the gate
 * refuses everything else, and the two cannot drift because there is one
 * function.
 */
export function movesForPlayer(
  round: Round,
  vrpId: number,
  chips: number,
): { seat: number; hand: number; moves: Move[] } | null {
  if (round.phase !== "playing" || !round.turn) return null;

  const seat = round.seats.find((entry) => entry.seat === round.turn!.seat);
  if (!seat || seat.vrpId !== vrpId) return null;

  const hand = seat.hands[round.turn.hand];
  if (!hand) return null;

  return {
    seat: seat.seat,
    hand: round.turn.hand,
    moves: movesFor(hand, { chips, hands: seat.hands.length, maxHands: MAX_HANDS }),
  };
}

export type { Outcome };
