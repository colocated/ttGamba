/**
 * What a card is called. Nothing else.
 *
 * ── Why this is not in lib/shoe.ts ────────────────────────────────────────
 * The shoe is `server-only`, and rightly: it holds the undealt cards in dealing
 * order, and a browser that could read them would know every card before it was
 * turned over. But the *notation* is not a secret — a card that has been dealt
 * face up has to be drawn on screen, and the interface has to know that `TD`
 * means the ten of diamonds.
 *
 * So the alphabet lives here, where both sides can have it, and the shoe keeps
 * the one thing worth guarding: which cards, in which order. `lib/shoe.ts`
 * re-exports these so nothing that already dealt from it has to change.
 */

/**
 * A card, as two characters: rank then suit.
 *
 * `AS` is the ace of spades, `TD` the ten of diamonds, `2C` the two of clubs.
 * Ten is `T` so that every card is exactly two characters wide and a hand can
 * be sliced without parsing.
 *
 * What a card is *worth* is deliberately not here. An ace is 1 or 11 at
 * blackjack and high at poker, and a notation that had an opinion about it
 * would be one only a single game could use — see lib/blackjack/rules.ts,
 * which is where blackjack's opinion lives.
 */
export const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K"] as const;
export const SUITS = ["S", "H", "D", "C"] as const;

export type Rank = (typeof RANKS)[number];
export type Suit = (typeof SUITS)[number];

/** Not a template type — a card read back out of the database is a string. */
export type Card = string;

export const CARDS_PER_DECK = RANKS.length * SUITS.length;

/** Whether a two-character string is a card this deck could have produced. */
export function isCard(value: unknown): value is Card {
  return (
    typeof value === "string" &&
    value.length === 2 &&
    (RANKS as readonly string[]).includes(value[0]) &&
    (SUITS as readonly string[]).includes(value[1])
  );
}
