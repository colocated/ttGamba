/**
 * The rules of blackjack, as arithmetic.
 *
 * Pure functions over cards and nothing else — no database, no clock, no
 * randomness, no `server-only`. That is deliberate: the interface has to print
 * a hand's total beside it and grey out a Double the player cannot afford, and
 * the alternative to sharing this file is writing the same rules twice and
 * having the two disagree in front of somebody's money.
 *
 * The server is still the authority. Every one of these is re-run inside the
 * transaction that moves the chips (lib/blackjack/engine.ts); the client
 * running them too is a courtesy to the player, never a permission.
 *
 * ── Cards ─────────────────────────────────────────────────────────────────
 * Two characters, rank then suit, exactly as the shoe stores them (lib/shoe.ts)
 * — `AS`, `TD`, `2C`. Ten is `T` so every card is the same width and a hand can
 * be sliced without parsing.
 */

import type { Card } from "../cards";

export { isCard } from "../cards";
export type { Card };

/**
 * What a rank is worth, with an ace at eleven.
 *
 * Eleven rather than one because demoting is the easy direction: a hand knows
 * how many aces it holds and can take ten off for each one it cannot afford,
 * which is what `total` does. Starting from one and trying to promote gets the
 * same answers by a longer route and is where the off-by-one lives.
 */
export function valueOf(card: Card): number {
  const rank = card[0];
  if (rank === "A") return 11;
  if (rank === "T" || rank === "J" || rank === "Q" || rank === "K") return 10;
  return Number(rank);
}

/**
 * A hand's total, and whether it is soft.
 *
 * Soft means an ace is still counted as eleven and could be dropped to one, so
 * the hand cannot bust on the next card. It is not decoration: the interface
 * says "soft 17" because that is a different hand from a hard 17 and the player
 * plays it differently.
 */
export type Total = { value: number; soft: boolean };

export function total(cards: readonly Card[]): Total {
  let value = 0;
  let aces = 0;

  for (const card of cards) {
    const worth = valueOf(card);
    value += worth;
    if (worth === 11) aces += 1;
  }

  // Demote aces one at a time, only as far as it takes. Two aces are 12, not 2.
  while (value > 21 && aces > 0) {
    value -= 10;
    aces -= 1;
  }

  return { value, soft: aces > 0 };
}

export function isBust(cards: readonly Card[]): boolean {
  return total(cards).value > 21;
}

/**
 * A *natural* — twenty-one on the first two cards.
 *
 * ── Why this is not "the total is 21" ─────────────────────────────────────
 * Because a natural beats a twenty-one made out of more cards, and a great many
 * implementations quietly get this wrong by comparing totals and stopping
 * there. An ace and a ten is not the same hand as ten, eight and three: the
 * first pays three to two and wins against the second, which pays nothing at
 * all because it has merely tied.
 *
 * `fromSplit` is the other half of it. Splitting a pair of aces and drawing a
 * ten gives twenty-one on two cards and is *not* a natural anywhere the game is
 * dealt properly — it pays even money and pushes against a dealer's twenty-one.
 * A hand that has been split can never be a natural again, which is why the
 * flag is on the hand rather than worked out from the cards.
 */
export function isNatural(cards: readonly Card[], fromSplit: boolean): boolean {
  return !fromSplit && cards.length === 2 && total(cards).value === 21;
}

/** Whether two cards are a pair worth offering a split on. */
export function isPair(cards: readonly Card[]): boolean {
  if (cards.length !== 2) return false;
  /*
    By *value*, not by rank: a king and a ten are both tens and every casino
    lets you split them. Splitting them is almost always a bad idea, and that
    is the player's business rather than the table's.
  */
  return valueOf(cards[0]) === valueOf(cards[1]);
}

/** Whether a hand is a pair of aces, which are dealt one card each and closed. */
export function isAcePair(cards: readonly Card[]): boolean {
  return cards.length === 2 && cards[0][0] === "A" && cards[1][0] === "A";
}

// ── How a hand finishes ────────────────────────────────────────────────────

/**
 * What happened to one hand, from the player's side.
 *
 * `blackjack` is kept apart from `win` because it pays differently, and
 * `bust` apart from `lose` because the player wants to know which of the two
 * happened — losing to a dealer's nineteen and busting on a twelve feel nothing
 * alike and the table should not describe them with the same word.
 */
export type Outcome = "blackjack" | "win" | "push" | "lose" | "bust";

/**
 * Who won.
 *
 * The order of these tests *is* the rule, and it is the order a dealer settles
 * in. Busts first, because a busted hand loses to anything including a dealer
 * who goes on to bust as well — that is the house edge, and it is the whole of
 * it. Then naturals on both sides, before any total is compared, which is what
 * keeps a two-card twenty-one above a three-card one. Only then are the numbers
 * looked at.
 */
export function settleHand(
  player: { cards: readonly Card[]; natural: boolean },
  dealer: { cards: readonly Card[]; natural: boolean },
): Outcome {
  if (isBust(player.cards)) return "bust";

  if (player.natural) return dealer.natural ? "push" : "blackjack";
  if (dealer.natural) return "lose";

  if (isBust(dealer.cards)) return "win";

  const mine = total(player.cards).value;
  const theirs = total(dealer.cards).value;
  if (mine > theirs) return "win";
  if (mine < theirs) return "lose";
  return "push";
}

/**
 * What comes back to the player, stake included.
 *
 * Zero for a loss, the stake for a push, twice for a win — and two and a half
 * for a natural, which is the three to two the felt promises.
 *
 * ── Rounding ──────────────────────────────────────────────────────────────
 * Chips are whole numbers, and three to two on an odd stake is not. The half
 * chip goes to the house, which is what every table does with an odd bet and is
 * the only direction that cannot be farmed: rounding a blackjack *up* on a
 * one-chip bet, over enough hands, is a machine for making chips out of
 * nothing.
 */
export function returnFor(outcome: Outcome, bet: number): number {
  switch (outcome) {
    case "blackjack":
      return bet + Math.floor((bet * 3) / 2);
    case "win":
      return bet * 2;
    case "push":
      return bet;
    default:
      return 0;
  }
}

/**
 * What insurance returns, stake included. Two to one, or nothing.
 *
 * Insurance is a side bet on the dealer's hole card being a ten, offered when
 * their up card is an ace. It is a bad bet and the house knows it; it is
 * offered because it is part of the game, and it is priced correctly here
 * rather than being quietly shaved.
 */
export function insuranceReturn(dealerNatural: boolean, stake: number): number {
  return dealerNatural ? stake * 3 : 0;
}

/** The most a player may insure: half their stake on that hand. */
export function insuranceLimit(bet: number): number {
  return Math.floor(bet / 2);
}

// ── What a player may do right now ─────────────────────────────────────────

export type Move = "hit" | "stand" | "double" | "split";

/**
 * A hand, as the rules need to see it. The engine's own hand type is a
 * superset; this is the part that decides what may be done to it.
 */
export type PlayableHand = {
  cards: readonly Card[];
  bet: number;
  /** Already doubled — one card was taken and the hand is finished. */
  doubled: boolean;
  /** Produced by a split, so never a natural and sometimes closed. */
  fromSplit: boolean;
  /** Split aces take one card and are done. Nothing further is legal. */
  closed: boolean;
};

/**
 * Which moves are legal on a hand, given what the player can pay for.
 *
 * Returned as a set rather than four booleans so the interface can render
 * whatever it is given, and so a move arriving from a browser can be checked
 * against exactly the same answer the buttons were drawn from. The server calls
 * this too — see `act` in lib/blackjack.ts — which is what makes the buttons a
 * convenience rather than the gate.
 */
export function movesFor(
  hand: PlayableHand,
  options: { chips: number; hands: number; maxHands: number },
): Move[] {
  if (hand.closed || hand.doubled) return [];
  if (isBust(hand.cards)) return [];
  if (total(hand.cards).value === 21) return [];

  const moves: Move[] = ["hit", "stand"];

  /*
    Double and split both need a second stake of the same size, and neither is
    offered to a player who cannot cover it. Checking here rather than letting
    the press fail means the player is never shown a button that takes their
    chips down to nothing and then refuses.
  */
  const affordable = options.chips >= hand.bet;

  // Doubling is a first-decision move: two cards, nothing drawn yet. Doubling
  // after a split is allowed, which is why `fromSplit` is not consulted.
  if (hand.cards.length === 2 && affordable) moves.push("double");

  if (
    hand.cards.length === 2 &&
    isPair(hand.cards) &&
    options.hands < options.maxHands &&
    affordable
  ) {
    moves.push("split");
  }

  return moves;
}

// ── Reading a card for the interface ───────────────────────────────────────

/** The four suits, spelled out, for anything that has to draw one. */
export type SuitName = "spades" | "hearts" | "diamonds" | "clubs";

const SUIT_NAMES: Record<string, SuitName> = {
  S: "spades",
  H: "hearts",
  D: "diamonds",
  C: "clubs",
};

/** A rank as it is printed on the card, where the shoe's `T` becomes `10`. */
export function rankLabel(card: Card): string {
  return card[0] === "T" ? "10" : card[0];
}

export function suitOf(card: Card): SuitName {
  return SUIT_NAMES[card[1]] ?? "spades";
}
