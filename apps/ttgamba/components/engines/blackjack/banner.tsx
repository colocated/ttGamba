"use client";

/**
 * What the table is doing, said once, across the top.
 *
 * ── Why this is not in the gutter with everything else ────────────────────
 * Because it is about the *table*, and everything in the gutter is about the
 * player. A countdown tucked beside the chip rack is a number next to your own
 * controls, and it reads as being about you — which is wrong when it is the
 * thing every seat is waiting on together. Up here it belongs to the room.
 *
 * It also puts the clock where the player is already looking. The cards, the
 * dealer and the seats are all on the felt; a timer at the bottom of the screen
 * is one a player discovers has run out.
 *
 * ── Nothing until somebody sits down ──────────────────────────────────────
 * An empty table is not waiting for anything, and a banner announcing that a
 * round starts when a bet is placed, to nobody, is furniture pretending to be
 * information.
 */

import type { RoundView } from "@/lib/blackjack/round";

export function RoundBanner({
  round,
  seated,
  countdown,
  mine,
}: {
  round: RoundView;
  /** Whether anybody is in a chair. Nothing is said to an empty table. */
  seated: boolean;
  /** Milliseconds left in this phase, already ticking. See ./clock.ts. */
  countdown: number;
  /** The reader's own seat, so their turn can be named as theirs. */
  mine: number | null;
}) {
  if (!seated) return null;

  const said = describe(round, countdown, mine);
  if (!said) return null;

  return (
    <div className="pointer-events-none flex min-w-0">
      <span
        className={`flex min-w-0 items-baseline gap-1.5 rounded-control border px-3 py-2 text-sm leading-none ${TONES[said.tone]}`}
      >
        {said.parts.map((part, index) =>
          /*
            The figure is the only thing on this line worth reading twice, so it
            is the only thing set brighter than the sentence around it. Told
            apart by weight and colour together rather than colour alone —
            somebody who cannot see the difference in hue still sees the bold.
          */
          part.strong ? (
            <strong
              key={index}
              className="shrink-0 font-mono text-base font-bold tabular-nums text-ink"
            >
              {part.text}
            </strong>
          ) : (
            <span key={index} className="truncate">
              {part.text}
            </span>
          ),
        )}
      </span>
    </div>
  );
}

/**
 * What the banner is saying, as a colour.
 *
 * The same five the seats are lit in when a round settles (`OUTCOME_LIGHT` in
 * ./hands.tsx and `NAME_LIGHT` in ./seats.tsx), used for the same reasons in a
 * different tense: blue is *you*, red is running out, yellow is a question,
 * green is money coming back. A player who has learnt what a colour means at
 * the end of a round already knows what it means at the start of one.
 *
 * Faint fills, because this sits over the dealer's head for the whole hand and
 * a saturated bar there would be the loudest thing on a table whose job is to
 * be looked at.
 */
const TONES: Record<Tone, string> = {
  neutral: "border-edge bg-tone-1/85 text-ink-soft",
  mine: "border-[#5b9fe0]/55 bg-[#12233a]/90 text-[#cfe2f7]",
  closing: "border-loss/55 bg-[#2c1114]/90 text-[#f3c9cc]",
  asking: "border-[#e0c05a]/50 bg-[#2b2410]/90 text-[#f0e3bb]",
  paying: "border-felt/55 bg-[#0e2a1d]/90 text-[#c4e8d5]",
};

type Tone = "neutral" | "mine" | "closing" | "asking" | "paying";

type Said = { parts: { text: string; strong?: boolean }[]; tone: Tone };

/**
 * The sentence for each phase.
 *
 * Written as pieces rather than one string so the number inside it can be set
 * apart without the sentence having to be assembled out of JSX at every call
 * site — and so a phase that has nothing worth saying can say nothing rather
 * than an empty box.
 */
function describe(round: RoundView, countdown: number, mine: number | null): Said | null {
  const seconds = Math.max(0, Math.ceil(countdown / 1000));

  switch (round.phase) {
    case "waiting":
      return { parts: [{ text: "Round starts when a bet is placed" }], tone: "neutral" };

    case "betting":
      return {
        parts: [
          { text: "Round starting in" },
          { text: `${seconds}s`, strong: true },
          { text: "· Get your bets in!" },
        ],
        // Red once the window is nearly shut, which is the moment it stops
        // being information and starts being a deadline.
        tone: seconds <= 5 ? "closing" : "neutral",
      };

    case "dealt":
      return { parts: [{ text: "Dealing" }], tone: "neutral" };

    case "insurance":
      return {
        parts: [
          { text: "Dealer shows an ace · insurance closes in" },
          { text: `${seconds}s`, strong: true },
        ],
        tone: "asking",
      };

    case "playing": {
      if (!round.turn) return null;
      const yours = round.turn.seat === mine;
      return {
        parts: [
          { text: yours ? "Your turn ·" : `Seat ${round.turn.seat} to act ·` },
          { text: `${seconds}s`, strong: true },
        ],
        // Blue when it is yours, so the one thing a player must not miss is the
        // one thing on the table that changes colour for them alone.
        tone: yours ? (seconds <= 5 ? "closing" : "mine") : "neutral",
      };
    }

    case "dealer":
      return { parts: [{ text: "Dealer plays" }], tone: "neutral" };

    case "payout":
      return { parts: [{ text: "Paying out" }], tone: "paying" };

    default:
      return null;
  }
}
