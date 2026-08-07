import "server-only";

/**
 * The cards a table deals from.
 *
 * A shoe belongs to a table and lasts as long as that table has somebody at it.
 * The first player to sit down brings one into existence; the last one to leave
 * takes it with them, so nobody ever inherits a shoe half-counted by whoever
 * was there before. See lib/tables.ts for that lifecycle — this module is only
 * the cards.
 *
 * ── Nothing in here may cross to a browser ────────────────────────────────
 * `cards` is the whole shoe in dealing order, undealt cards included. A player
 * who could read it would know every card before it was turned over, which is
 * not a small advantage — it is the entire game. So the column is loaded only
 * by the functions below, there is no flattener for it in lib/rows.ts, and the
 * one thing about a shoe that ever leaves the server is how many cards are left
 * in it (`TableRow.cardsLeft`).
 *
 * That is also why this file is `server-only`: importing it from a client
 * component is a build error rather than a leak.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * ── Why the randomness is not `Math.random` ───────────────────────────────
 * Because this decides who wins money. `Math.random` is a fast PRNG with a
 * seed an engine is free to keep wherever it likes, and its output sequence is
 * not something anyone has undertaken to make unpredictable. `crypto.randomInt`
 * draws from the platform's cryptographic source and — the part that matters
 * for a shuffle — is uniform over the range it is given, with the modulo bias
 * rejected rather than ignored.
 *
 * A biased shuffle is not a fair game with a wonky feel to it; it is a game
 * whose deal can be predicted by anyone who watches enough of it. Chips are not
 * real money (PRODUCT.md), and this would still be worth getting right.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { randomInt } from "node:crypto";

import type { Db } from "./audit";

/**
 * A card, as two characters: rank then suit.
 *
 * `AS` is the ace of spades, `TD` the ten of diamonds, `2C` the two of clubs.
 * Ten is `T` so that every card is exactly two characters wide and a hand can
 * be sliced without parsing.
 *
 * What a card is *worth* is deliberately not here. An ace is 1 or 11 at
 * blackjack and high at poker, and a shoe that had an opinion about it would be
 * a shoe that only one game could deal from.
 */
export const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K"] as const;
export const SUITS = ["S", "H", "D", "C"] as const;

export type Rank = (typeof RANKS)[number];
export type Suit = (typeof SUITS)[number];
/** Not a template type — a card read back out of the database is a string. */
export type Card = string;

export const CARDS_PER_DECK = RANKS.length * SUITS.length;

/**
 * How much of the shoe is dealt before it is re-shuffled.
 *
 * The cut card, in other words. Dealing a shoe to its last card is what makes
 * counting worth doing — by then what is left is no longer a mystery — so the
 * last quarter is never dealt. A real table reaches the cut and finishes the
 * round; this one re-shuffles at the start of the next draw that would cross
 * it, which is the same idea without the engine having to remember to ask.
 */
const PENETRATION = 0.75;

/** Four decks unless an engine says otherwise. See lib/engines.ts. */
export const DEFAULT_DECKS = 4;

/** One deck, in order. Shuffled immediately, so the order is only a starting point. */
function deck(): Card[] {
  const cards: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) cards.push(`${rank}${suit}`);
  }
  return cards;
}

/**
 * Fisher–Yates, back to front.
 *
 * Every permutation equally likely, which is the property being bought — and it
 * only holds if each swap picks uniformly from the *unshuffled* remainder,
 * which is what `randomInt(0, index + 1)` is. The common bug is picking from
 * the whole array each time; that shuffles, but not evenly, and the difference
 * is invisible until somebody has watched a few thousand hands.
 */
function shuffle(cards: Card[]): Card[] {
  for (let index = cards.length - 1; index > 0; index -= 1) {
    // `randomInt` is exclusive of the upper bound, so this covers 0..index.
    const swap = randomInt(0, index + 1);
    [cards[index], cards[swap]] = [cards[swap], cards[index]];
  }
  return cards;
}

/** A fresh shoe: `decks` decks shuffled together. */
export function build(decks: number): Card[] {
  const cards: Card[] = [];
  for (let count = 0; count < decks; count += 1) cards.push(...deck());
  return shuffle(cards);
}

/** The stored column, or an empty shoe if it is unreadable. */
function parse(raw: string): Card[] {
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value.filter((card): card is Card => typeof card === "string" && card.length === 2);
  } catch {
    // A shoe written by something that is no longer this code. Treated as
    // empty, which makes the next draw re-shuffle rather than deal nonsense.
    return [];
  }
}

/**
 * Make sure the table has a shoe, and leave it alone if it already does.
 *
 * This is the `requestShoe` a table calls when it opens. Idempotent, because
 * two players sitting down at the same moment both think they are the first —
 * the unique constraint on `tableId` is what settles that, and losing the race
 * means the shoe you wanted already exists.
 *
 * A game that deals no cards passes `0` and gets no shoe at all, which is why
 * `cardsLeft` is nullable everywhere it appears.
 */
export async function requestShoe(db: Db, tableId: number, decks: number): Promise<void> {
  if (decks <= 0) return;

  const existing = await db.shoe.findUnique({ where: { tableId }, select: { id: true } });
  if (existing) return;

  try {
    await db.shoe.create({
      data: { tableId, decks, cards: JSON.stringify(build(decks)) },
    });
  } catch {
    // Lost the race to another player sitting down. The shoe exists now, which
    // is the whole of what was being asked for.
  }
}

/**
 * Throw the shoe away.
 *
 * Called when the last player leaves a table. The next person to sit down gets
 * a new one — a table nobody is at is not mid-anything, and carrying a
 * half-dealt shoe across an empty room would hand the next arrival a count
 * somebody else did the work for.
 */
export async function discardShoe(db: Db, tableId: number): Promise<void> {
  await db.shoe.deleteMany({ where: { tableId } });
}

/**
 * How many cards are left before the cut.
 *
 * A pure function over the two columns rather than a query, so a lobby can work
 * it out for every table on screen from the rows it already fetched. It is also
 * the only thing about a shoe that is allowed out — see the note at the top.
 */
export function remaining(decks: number, cursor: number): number {
  return Math.max(0, Math.floor(decks * CARDS_PER_DECK * PENETRATION) - cursor);
}

/**
 * Deal.
 *
 * Re-shuffles first if what is left would not see the draw out, or if the cut
 * card has been reached. Either way the caller gets the cards it asked for, so
 * an engine never has to handle "the shoe ran out mid-hand" — there is no such
 * state.
 *
 * ── Why the cursor is a compare-and-swap ──────────────────────────────────
 * Two hands can be dealt at the same moment: a table full of players hitting at
 * once, or one player with two tabs open. Reading the cursor and then writing
 * `cursor + 2` would let both of them read `10`, both write `12`, and both be
 * dealt the same two cards — which is worse than a crash, because it looks
 * fine. Claiming the cards with an update conditional on the cursor not having
 * moved means the loser is told it lost and asks again.
 * ─────────────────────────────────────────────────────────────────────────
 */
export async function draw(db: Db, tableId: number, count: number): Promise<Card[]> {
  if (count <= 0) return [];

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const shoe = await db.shoe.findUnique({ where: { tableId } });
    if (!shoe) throw new Error(`Table ${tableId} has no shoe to deal from`);

    const cards = parse(shoe.cards);
    const cut = Math.floor(shoe.decks * CARDS_PER_DECK * PENETRATION);

    if (shoe.cursor + count > Math.min(cut, cards.length)) {
      // Past the cut, or simply not enough left. A fresh shuffle resets the
      // cursor, and the same compare-and-swap guards it — a second dealer that
      // re-shuffled first wins and this attempt goes round again.
      const reshuffled = await db.shoe.updateMany({
        where: { tableId, cursor: shoe.cursor },
        data: {
          cards: JSON.stringify(build(shoe.decks)),
          cursor: 0,
          shuffles: { increment: 1 },
        },
      });
      if (reshuffled.count !== 1) continue;
      // Round again rather than dealing from `cards`, which is now the old shoe.
      continue;
    }

    const claimed = await db.shoe.updateMany({
      where: { tableId, cursor: shoe.cursor },
      data: { cursor: shoe.cursor + count },
    });
    if (claimed.count !== 1) continue;

    return cards.slice(shoe.cursor, shoe.cursor + count);
  }

  // Three losses in a row is not contention, it is something wrong. Thrown
  // rather than returned as a `Failure`: an engine cannot carry on without the
  // cards it asked for, and a hand half-dealt is not a state to hand back.
  throw new Error(`Could not deal ${count} from table ${tableId}: the shoe kept moving`);
}
