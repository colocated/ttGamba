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
import { CARDS_PER_DECK, RANKS, SUITS, type Card } from "./cards";

/*
  The notation itself is in lib/cards.ts, not here, and re-exported so that
  everything already dealing from this module reads the same as it did. The
  split is the same one this file's header is about: what a card is *called* has
  to be known on both sides of the wire, because a card dealt face up gets drawn
  on a screen. Which cards, and in what order, is the part that stays here.
*/
export { CARDS_PER_DECK, RANKS, SUITS, type Card, type Rank, type Suit } from "./cards";

/**
 * How deep the cut card can fall, as a fraction of the shoe.
 *
 * ── Why this is a range and not a number ──────────────────────────────────
 * The cut card is what stops a shoe being dealt to its last card, and dealing
 * to the last card is what makes counting worth doing: by then what is left is
 * no longer a mystery. A cut at a *fixed* depth solves only half of that,
 * because the depth itself becomes information — a player who knows the shoe
 * always dies at 75% knows exactly how many hands are left to bet big on, and
 * the end of every shoe is the part a counter is waiting for.
 *
 * Drawn afresh on every restock, the cut is somewhere between a quarter and
 * three quarters of the way in and nobody at the table knows where. A count is
 * still arithmetic anybody may do; what it is no longer is a schedule.
 *
 * Together with the tier's deck *range* (prisma/schema.prisma) this leaves a
 * counter unsure both how many cards are in play and how many of them they
 * will get to see. It costs an honest player nothing at all: they are dealt
 * from a uniformly shuffled shoe either way.
 */
const CUT = { shallowest: 0.25, deepest: 0.75 } as const;

/**
 * How many decks a table's shoe holds — the tier's range, re-rolled on every
 * restock.
 *
 * `max` below `min` is not an error to throw over. An administrator who typed
 * the two the wrong way round has made a mistake worth correcting, not one
 * worth taking a table off the floor for, so the pair is read in whichever
 * order it arrives.
 */
export type DeckRange = { min: number; max: number };

/** Four decks unless an engine says otherwise. See lib/engines.ts. */
export const DEFAULT_DECKS = 4;

/** How many decks this shuffle gets. Uniform across the range, ends included. */
function pickDecks({ min, max }: DeckRange): number {
  const low = Math.max(1, Math.min(min, max));
  const high = Math.max(low, Math.max(min, max));
  // `randomInt` is exclusive of the upper bound, so this covers low..high.
  return randomInt(low, high + 1);
}

/**
 * Where this shoe's cut card goes, as a cursor value.
 *
 * Whole cards, drawn from the crypto source like everything else in here — the
 * cut decides when the advantage a counter has been building is thrown away,
 * which makes it as much a part of the game's fairness as the shuffle itself.
 */
function pickCut(total: number): number {
  const shallowest = Math.floor(total * CUT.shallowest);
  const deepest = Math.floor(total * CUT.deepest);
  if (deepest <= shallowest) return deepest;
  return randomInt(shallowest, deepest + 1);
}

/** A fresh shoe: a deck count from the range, shuffled, with its cut card placed. */
export function restock(range: DeckRange): { decks: number; cards: Card[]; cut: number } {
  const decks = pickDecks(range);
  const cards = build(decks);
  return { decks, cards, cut: pickCut(cards.length) };
}

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
export async function requestShoe(
  db: Db,
  tableId: number,
  range: DeckRange | null,
): Promise<void> {
  if (range === null) return;

  const existing = await db.shoe.findUnique({ where: { tableId }, select: { id: true } });
  if (existing) return;

  const fresh = restock(range);

  try {
    await db.shoe.create({
      data: {
        tableId,
        decks: fresh.decks,
        cards: JSON.stringify(fresh.cards),
        cut: fresh.cut,
      },
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
 * How many cards are physically left in the shoe.
 *
 * A pure function over the two columns rather than a query, so a lobby can work
 * it out for every table on screen from the rows it already fetched. It is also
 * the only thing about a shoe that is allowed out — see the note at the top.
 *
 * ── Why this counts to the end and not to the cut ─────────────────────────
 * It used to answer "cards left before the re-shuffle", which was a fair thing
 * to publish when the cut sat at a fixed depth everybody could work out anyway.
 * Now that the cut is random and hidden, that figure would be the one thing on
 * screen quietly telling a counter exactly how much shoe was left to play —
 * which is the whole of what the randomisation was for.
 *
 * So this is the honest, useless number: how thick the stack is. It gives away
 * nothing that watching the table does not, and no player is shown it today
 * (it is on its way to a superadmin debug view).
 */
export function remaining(decks: number, cursor: number): number {
  return Math.max(0, decks * CARDS_PER_DECK - cursor);
}

/**
 * Retire the shoe if the cut card has come out, and do nothing if it has not.
 *
 * ── Why this is a call and not something `draw` decides ───────────────────
 * Because a shoe is retired *between rounds*, never inside one. A dealer who
 * reaches the cut card finishes the hand in front of them and shuffles
 * afterwards; re-shuffling mid-deal would mean a player's two cards came out of
 * different shoes, which is not a rule anybody plays by and is exactly the sort
 * of thing that looks like cheating whether or not it is.
 *
 * So the engine calls this when a round has finished settling and never at any
 * other time, and `draw` is left with no opinion about the cut at all.
 *
 * The deck count is re-rolled here as well as the cards, so "how many decks am
 * I playing against" is a question that goes stale every shoe.
 */
export async function reshuffleIfPastCut(
  db: Db,
  tableId: number,
  range: DeckRange,
): Promise<boolean> {
  const shoe = await db.shoe.findUnique({
    where: { tableId },
    select: { cursor: true, cut: true },
  });
  if (!shoe || shoe.cursor < shoe.cut) return false;

  const fresh = restock(range);

  /*
    Conditional on the cursor, like every other write in this file. Two players
    finishing the same round can both arrive here, and the second one must not
    throw away a shoe the first has already replaced — which would be a
    re-shuffle after nought cards, and a table that never gets past its first
    hand.
  */
  const done = await db.shoe.updateMany({
    where: { tableId, cursor: shoe.cursor },
    data: {
      decks: fresh.decks,
      cards: JSON.stringify(fresh.cards),
      cut: fresh.cut,
      cursor: 0,
      shuffles: { increment: 1 },
    },
  });

  return done.count === 1;
}

/**
 * Deal.
 *
 * Re-shuffles first only if what is physically left would not see the draw out.
 * That is a safety net and not the ordinary way a shoe is replaced — the cut
 * card is, and `reshuffleIfPastCut` is where that happens, between rounds. A
 * shoe cut between a quarter and three quarters of the way in should never
 * reach this, and if it does the caller still gets the cards it asked for, so
 * an engine never has to handle "the shoe ran out mid-hand".
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

    if (shoe.cursor + count > cards.length) {
      /*
        Genuinely out of cards, which should not happen — the cut retires a
        shoe long before its last card. Rebuilt at the same deck count rather
        than re-rolled from the tier's range: this is a shoe being rescued
        mid-hand, and the range belongs to the deliberate restock between
        rounds. The same compare-and-swap guards it, so a second dealer that
        got there first wins and this attempt goes round again.
      */
      const rescued = restock({ min: shoe.decks, max: shoe.decks });
      const reshuffled = await db.shoe.updateMany({
        where: { tableId, cursor: shoe.cursor },
        data: {
          cards: JSON.stringify(rescued.cards),
          cut: rescued.cut,
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
