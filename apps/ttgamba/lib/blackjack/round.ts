/**
 * A round of blackjack, as a shape.
 *
 * Data only — no Prisma, no clock, no `server-only` — for the same reason
 * lib/casino.ts is: the engine writes this and the interface draws it, and both
 * need to agree about what a hand looks like. The rules that operate on it are
 * lib/blackjack/rules.ts; the machine that advances it is
 * lib/blackjack/engine.ts and is server-only.
 *
 * ── Two shapes, and the line between them ─────────────────────────────────
 * `Round` is what is stored on the table (`Table.state`, as JSON). `RoundView`
 * is what a browser is given. They are nearly identical and the difference is
 * the whole point: the dealer's hole card is in one and not the other.
 *
 * That is the same boundary the shoe has, for the same reason — a player who
 * can read the hole card knows whether to take insurance, whether to hit a
 * sixteen, and whether the round is already over. There is no version of this
 * where the card is sent and the interface promises not to look.
 *
 * `viewOf` in engine.ts is the only crossing, and it is a function that builds
 * the view field by field rather than one that deletes a key from the state.
 * Deleting is how the card gets sent by accident the next time somebody adds
 * one to the dealer.
 *
 * ── Why there is no timer anywhere ────────────────────────────────────────
 * Nothing schedules anything. A round carries a `deadline`, and the moment
 * anybody reads the table the engine brings it up to date against the clock —
 * dealing, closing the betting, standing a player who never acted, playing the
 * dealer out. See `catchUp`.
 *
 * The alternative is a process holding timers for every open table, which
 * cannot survive a deploy, cannot be shared between two instances of the app,
 * and stops the moment the last player's poll does. A deadline in a row
 * survives all three, and the poll that holds a player's seat is the same one
 * that turns the clock.
 */

import type { Account } from "../account";
import type { SeatRow } from "../casino";
import type { Card, Move, Outcome } from "./rules";

/**
 * Where the round has got to.
 *
 * `waiting` is a table with nothing happening — no bets, no clock. Everything
 * else has a deadline, and the engine will move it on with or without the
 * players' help.
 */
export type Phase =
  /** Nobody has bet. The table sits here indefinitely; this is the resting state. */
  | "waiting"
  /** Someone has bet and the window is open for everybody else. */
  | "betting"
  /** Cards are on the table. A beat for the deal to play before anything is asked. */
  | "dealt"
  /** Dealer is showing an ace. Insurance is open. */
  | "insurance"
  /** Somebody's turn. `turn` says whose. */
  | "playing"
  /** The dealer is playing their own hand out. */
  | "dealer"
  /** Settled and paid. The results are on screen until this clears. */
  | "payout";

/** One hand in front of one seat. A player has two of these after a split. */
export type Hand = {
  cards: Card[];
  /** Chips staked on this hand. Doubles have already been added in. */
  bet: number;
  /** Doubled down: exactly one more card was taken and the hand is finished. */
  doubled: boolean;
  /** Produced by a split, so it can never be a natural. See `isNatural`. */
  fromSplit: boolean;
  /** Finished — stood, busted, doubled out, or a split ace that took its card. */
  closed: boolean;
  /** How it ended, once the dealer has settled. */
  outcome: Outcome | null;
  /** Chips returned by the settlement, stake included. */
  returned: number;
};

/**
 * A bet somebody else has placed on this seat's hand.
 *
 * ── What it does and does not follow ──────────────────────────────────────
 * It rides the seat's *first* hand and never changes size. If the player
 * splits, it stays with the first of the two; if they double, it settles on the
 * same cards at a single payout rather than doubling with them.
 *
 * That is the rule because the backer is not at the table to be asked. A stake
 * that grew when somebody else pressed a button would take chips off a player
 * who agreed to a different number, and might take them off somebody who has
 * walked away from the screen. So the amount they agreed to is the amount that
 * is ever at risk, and a double they did not choose cannot cost them anything.
 *
 * A natural still pays a backer three to two — the bet is on the hand, and that
 * is what the hand paid.
 */
export type BackBet = {
  vrpId: number;
  name: string | null;
  amount: number;
  outcome: Outcome | null;
  returned: number;
};

/** A seat, as this round sees it. */
export type SeatRound = {
  seat: number;
  vrpId: number;
  name: string | null;
  hands: Hand[];
  /** Chips on the insurance line, or zero. */
  insurance: number;
  /** What insurance paid back, stake included. */
  insuranceReturned: number;
  /** Whether insurance was offered to and answered by this player. */
  insuranceAnswered: boolean;
  backers: BackBet[];
};

/** The dealer's hand, as stored. The hole card is in here. */
export type DealerHand = {
  /** Face up, in the order they were dealt. The up card is the first. */
  cards: Card[];
  /**
   * The card underneath, face down.
   *
   * Moved into `cards` when it is turned over, and `null` from then on — so
   * "is it revealed" is not a second flag that can disagree with the first.
   */
  hole: Card | null;
  /** Set once the dealer's hand is known to be a natural, after the peek. */
  natural: boolean;
};

/** Everything about the round in progress. Stored as JSON on the table. */
export type Round = {
  /**
   * The shape's version.
   *
   * A table can outlive the build that wrote its state (prisma/schema.prisma
   * says as much). Anything that does not parse as the current version is
   * thrown away and the table starts a fresh round, which costs at worst one
   * hand and is the only answer that cannot deal from a half-understood state.
   */
  v: 1;
  /** Counts up for the life of the table. Changes when a new round starts. */
  id: number;
  phase: Phase;
  /** Epoch ms. `null` in `waiting`, which has no clock. */
  deadline: number | null;
  dealer: DealerHand;
  seats: SeatRound[];
  /** Whose move it is. `null` outside `playing`. */
  turn: { seat: number; hand: number } | null;
};

/** The dealer's hand, as anybody who is not the dealer may see it. */
export type DealerView = {
  cards: Card[];
  /** Whether a face-down card is still sitting there. Not what it is. */
  hole: boolean;
  natural: boolean;
};

/** The round, with the hole card removed rather than hidden. */
export type RoundView = Omit<Round, "dealer"> & { dealer: DealerView };

/**
 * Everything the felt draws, in one answer.
 *
 * The round, who is sitting where, and what this player may do — read together
 * and sent together, so they cannot be a few seconds out of step with each
 * other. Occupancy used to come from `getPlace` on a five-second poll, which is
 * fine for a lobby and far too slow for a table where a hand takes twenty.
 */
export type TableView = {
  round: RoundView;
  /** Who is sitting where, at the same freshness as the round. */
  seats: SeatRow[];
  /** The caller's chair, or `null` while they are only watching. */
  seat: number | null;
  /**
   * The caller's account as the server has it.
   *
   * The balance is here because the controls need to know what is affordable —
   * but it is the whole account rather than a bare figure so the interface can
   * feed it straight into the shared chip store (lib/chips.ts), which is what
   * the titlebar reads. That store is only ever written by the server's answer,
   * and this is the server's answer.
   *
   * Without it the titlebar sat on the balance it was told at load: a player
   * could place a bet, watch the gutter's figure drop, and see the titlebar
   * still claiming the old number until they pressed refresh.
   */
  account: Account;
  /** What the caller may do right now. Empty unless it is their turn. */
  moves: Move[];
  /**
   * Which seats this player is riding, and for how much.
   *
   * Picked out on the server because the browser is never told its own vRP id
   * in a form it can match against a round — and because "what have I got on
   * this table" is a question the interface asks constantly, on every poll, for
   * the leave button alone.
   */
  backing: { seat: number; amount: number }[];
  /** What this table takes, in chips. */
  limits: { min: number; max: number };
  /** Cards physically left in the shoe, or `null` before one is cut. */
  cardsLeft: number | null;
  /**
   * How long the current phase has left, in milliseconds, as measured when this
   * was answered. `null` for a phase with no clock.
   *
   * A duration rather than the deadline itself, and the difference matters. The
   * deadline is the server's epoch milliseconds, and a browser's own clock is
   * not something to count it down against — a machine running a minute fast
   * would watch every window expire the moment it opened. Sending the remainder
   * leaves one clock in the arithmetic: the browser's, measuring elapsed time
   * against itself, which is the one thing every clock is reliable at.
   */
  left: number | null;
};

// ── The clock ──────────────────────────────────────────────────────────────

/**
 * How long each phase lasts.
 *
 * A shared table cannot wait on one player. Somebody who has closed the app is
 * swept by the seat timeout, but somebody who is simply *not looking* is still
 * sitting there, and without a clock a full table stops dead until they come
 * back. So every phase that is waiting for a person has a deadline and a
 * default: no bet, and stand.
 *
 * The numbers are what a live table feels like rather than what is fastest.
 * Twenty seconds is long enough to count a hand and reach for a control, short
 * enough that four players do not spend a minute between deals.
 */
export const TIMING = {
  /** From the first bet on the table to the cards coming out. */
  betting: 20_000,
  /** A beat for the deal to play on screen before anybody is asked anything. */
  dealt: 2_400,
  /** Insurance, offered only when the dealer shows an ace. */
  insurance: 12_000,
  /** One player's turn on one hand. Runs out as a stand. */
  turn: 20_000,
  /** The dealer playing their hand out, so it can be watched rather than jumped. */
  dealer: 1_800,
  /** How long the settled table stays on screen before it is cleared. */
  payout: 6_000,
} as const;

/**
 * The most hands one seat may play at once — the original plus three splits.
 *
 * Four is what a real table allows, and there is a second reason to have a
 * number at all: every hand is a bet, and a player who could split without
 * limit could put an unbounded amount of their balance on one round through a
 * series of presses no interface would show them the total of.
 */
export const MAX_HANDS = 4;

/** A table with nothing happening at it. */
export function emptyRound(id: number = 1): Round {
  return {
    v: 1,
    id,
    phase: "waiting",
    deadline: null,
    dealer: { cards: [], hole: null, natural: false },
    seats: [],
    turn: null,
  };
}

// ── Reading it back ────────────────────────────────────────────────────────

/**
 * Whether bets may be placed right now.
 *
 * The whole of the "somebody sat down mid-hand" rule. A player who takes a
 * chair while cards are on the table is *at* the table — their seat is theirs,
 * they can watch, they can back somebody else's hand — but there is nowhere to
 * put a stake, because the round they would be staking on has already been
 * dealt. There is no flag on the seat saying so; the phase says it for every
 * seat at once, and a phase cannot get out of step with itself.
 */
export function bettingOpen(phase: Phase): boolean {
  return phase === "waiting" || phase === "betting";
}

/** The seat a player is at in this round, if they are in it. */
export function seatOf(round: Round | RoundView, vrpId: number): SeatRound | null {
  return round.seats.find((seat) => seat.vrpId === vrpId) ?? null;
}

/** Everything this player has staked on somebody else's hand. */
export function backBetsOf(round: Round | RoundView, vrpId: number): { seat: number; bet: BackBet }[] {
  return round.seats.flatMap((seat) =>
    seat.backers
      .filter((backer) => backer.vrpId === vrpId)
      .map((bet) => ({ seat: seat.seat, bet })),
  );
}

/** What a seat has at risk this round, hands and insurance together. */
export function stakedBy(seat: SeatRound): number {
  return seat.hands.reduce((total, hand) => total + hand.bet, 0) + seat.insurance;
}

/**
 * How a seat's round finished, as one answer.
 *
 * A seat can hold four hands after two splits and they can end four different
 * ways, which is accurate and useless as a thing to put on a name plate. This
 * is the seat's round taken as a whole: the best thing that happened to it, and
 * what the balance did.
 *
 * `null` until there is something to say — a seat that never bet, or a round
 * that has not settled.
 *
 * ── Why insurance is kept separate ────────────────────────────────────────
 * Because winning it almost always means losing the hand: it pays when the
 * dealer turns over a blackjack, which is the moment nearly everything else on
 * the table loses. Folding it into the tone would paint a seat green for a
 * round where the player's own cards were beaten, and a player who was *only*
 * covered by insurance should be told exactly that.
 */
export type SeatVerdict = {
  tone: "blackjack" | "win" | "push" | "lose";
  /** Insurance paid. Worth its own colour: it means the dealer had blackjack. */
  insured: boolean;
  /** Everything they put in, hands and insurance together. */
  staked: number;
  /** Everything that came back, stake included. */
  returned: number;
  /** What the balance actually did. Negative is a loss. */
  net: number;
};

export function verdictOf(seat: SeatRound): SeatVerdict | null {
  const settled = seat.hands.filter((hand) => hand.outcome !== null);
  if (settled.length === 0) return null;

  const staked = stakedBy(seat);
  const returned =
    settled.reduce((sum, hand) => sum + hand.returned, 0) + seat.insuranceReturned;

  /*
    The best outcome across the hands, in the order a player would rank them.
    A split that won one and lost the other is a win — they are up on the round
    — and calling it a loss because one hand went down would be describing the
    worse half of something that went well.
  */
  const outcomes = new Set(settled.map((hand) => hand.outcome));
  const tone = outcomes.has("blackjack")
    ? "blackjack"
    : outcomes.has("win")
      ? "win"
      : outcomes.has("push")
        ? "push"
        : "lose";

  return {
    tone,
    insured: seat.insuranceReturned > 0,
    staked,
    returned,
    net: returned - staked,
  };
}
