"use client";

/**
 * What just happened to *you*, over the middle of the table.
 *
 * ── Only for somebody who was in it ───────────────────────────────────────
 * A spectator gets the lights around the seats and nothing else. This is the
 * one piece of the table that is about a single player, and putting it in
 * front of somebody who had nothing riding on the hand would be announcing
 * another person's result across their screen.
 *
 * ── Why it takes itself away ──────────────────────────────────────────────
 * It is read in the second it lands and is in the way for every second after.
 * The animation carries it in, holds it long enough to be taken in, and fades
 * it out well before the payout phase ends — so the felt is clear again while
 * the player is still looking at their cards, rather than the next round having
 * to shift it out of the way.
 *
 * ── Three lines, in the order they are wanted ─────────────────────────────
 * What happened, what it was worth, and why. A player knows whether they won
 * before they have read anything; the figure is what they actually came for;
 * and the reason is what turns a result into a hand they can remember. Any
 * other order makes them hunt.
 */

import { PokerChipIcon } from "@phosphor-icons/react/dist/csr/PokerChip";

import { verdictOf, type RoundView, type SeatRound, type SeatVerdict } from "@/lib/blackjack/round";
import { isBust, isNatural, total } from "@/lib/blackjack/rules";
import { formatChipCount } from "@/lib/format";

/** The word, and the colour it is said in. Matches the light around the seat. */
const HEADLINE: Record<SeatVerdict["tone"], { word: string; className: string }> = {
  blackjack: { word: "Blackjack!", className: "text-[#f7d99a]" },
  win: { word: "Win!", className: "text-[#7ce0ab]" },
  push: { word: "Push", className: "text-[#f0d472]" },
  lose: { word: "Lost", className: "text-[#ff8f95]" },
};

export function Verdict({
  round,
  seat,
  mine,
}: {
  round: RoundView;
  /** The reader's own chair. `null` for a spectator, who gets nothing. */
  seat: number | null;
  /** Their entry in the round, if they were in it. */
  mine: SeatRound | null;
}) {
  if (seat === null || !mine) return null;

  const verdict = verdictOf(mine);
  if (!verdict) return null;

  const headline = HEADLINE[verdict.tone];
  const won = verdict.net > 0;
  const level = verdict.net === 0;

  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
      <div className="animate-verdict relative flex w-full flex-col items-center gap-1.5 py-5 text-center">
        {/*
          ── The band behind it ──────────────────────────────────────────────
          Text shadows were not enough and were never going to be: this lands
          over the middle of the felt, which is the brightest part of the table
          and carries "BLACKJACK" in gold at forty-two units. Cream on that is a
          smudge, and a red "LOST" on a green table is the one contrast pairing
          that fails hardest.

          A dark band across the full width, fading out at the left and right
          rather than at the top and bottom. Vertical edges would need to be
          soft over the two centimetres the text occupies and would grey the
          text along with the felt; horizontal ones have the whole width of the
          table to disappear into, so the band has no edges anybody can see and
          the text sits on solid darkness throughout.
        */}
        <span
          aria-hidden
          style={{
            background:
              "linear-gradient(90deg, transparent 0%, rgba(4, 10, 8, 0.86) 22%, rgba(4, 10, 8, 0.9) 50%, rgba(4, 10, 8, 0.86) 78%, transparent 100%)",
          }}
          className="absolute inset-0"
        />

        <span className="relative flex flex-col items-center gap-1.5">
        <span
          className={`text-4xl font-black uppercase leading-none tracking-tight ${headline.className}`}
          style={{ textShadow: "0 2px 12px rgba(3, 12, 8, 0.85)" }}
        >
          {headline.word}
        </span>

        {/*
          What the balance did, not what the hand paid. A five-million win on a
          five-million stake returns ten, and telling a player they got ten
          million back when they are five million up is technically true and
          the wrong number to put in the biggest text on screen.
        */}
        <span
          className={`flex items-center gap-1.5 font-mono text-xl font-bold leading-none tabular-nums ${
            level ? "text-ink-soft" : won ? "text-[#7ce0ab]" : "text-[#ff8f95]"
          }`}
          style={{ textShadow: "0 2px 10px rgba(3, 12, 8, 0.85)" }}
        >
          <PokerChipIcon size={18} weight="fill" aria-hidden />
          {level ? "Stake returned" : `${won ? "+" : "−"}${formatChipCount(Math.abs(verdict.net))}`}
        </span>

        <span
          className="text-sm text-ink-soft"
          style={{ textShadow: "0 1px 8px rgba(3, 12, 8, 0.9)" }}
        >
          {because(round, mine)}
        </span>

          {verdict.insured ? (
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[#8dc0f0]">
              Insurance paid
            </span>
          ) : null}
        </span>
      </div>
    </div>
  );
}

/**
 * Why it went the way it did, in one line.
 *
 * Reads the cards rather than the outcome, because "you lost" is already the
 * headline and repeating it as a reason tells the player nothing. What they
 * want to know is what beat them — and busting, being out-drawn, and running
 * into a dealer's blackjack are three quite different disappointments.
 */
function because(round: RoundView, mine: SeatRound): string {
  const dealer = round.dealer.cards;
  const dealerTotal = total(dealer).value;

  if (round.dealer.natural) return "Dealer had blackjack";

  const first = mine.hands[0];
  if (!first) return "";

  // A split has two stories and no room to tell both. The dealer's hand is the
  // one thing every hand at the seat was played against, so that is what is said.
  if (mine.hands.length > 1) {
    return isBust(dealer) ? "Dealer busted" : `Dealer made ${dealerTotal}`;
  }

  if (isBust(first.cards)) return `You went over on ${total(first.cards).value}`;
  if (isNatural(first.cards, first.fromSplit)) return "Blackjack pays 3 to 2";
  if (isBust(dealer)) return `Dealer busted on ${dealerTotal}`;

  const mineTotal = total(first.cards).value;
  if (mineTotal === dealerTotal) return `Both on ${mineTotal}`;
  return `${mineTotal} against the dealer's ${dealerTotal}`;
}
