"use client";

/**
 * A playing card, as an object with two sides and some weight.
 *
 * ── Why it is HTML and not part of the table's SVG ────────────────────────
 * Because it moves. The table is drawn once; a card is dealt, turned over and
 * swept away, and each of those is a transform the compositor can run on its
 * own thread without touching layout. It also carries text, and text in an SVG
 * that is being scaled by a `viewBox` is text the browser has given up hinting.
 *
 * ── The two transforms, and why they never meet ───────────────────────────
 * A card is doing two independent things at once: travelling across the table,
 * and turning over. Travelling is `translate` / `rotate` / `scale` on the
 * outer element; turning is `transform: rotateY(...)` on the inner one. They
 * are separate elements *and* separate properties, so neither animation has to
 * know what the other is doing — which matters most in the case they overlap,
 * which is every face-up card ever dealt.
 *
 * Position is `left` / `top` rather than a third transform, for the same
 * reason: the moment layout and motion share a property, every keyframe has to
 * restate where the card lives, and a card that lands in the wrong place is
 * the bug you get.
 */

import { rankLabel, suitOf, type Card as Code, type SuitName } from "@/lib/blackjack/rules";
import { CARD, SHOE, DISCARD, placeCentred, unit, type Point } from "./geometry";

type Suit = SuitName;

/**
 * The four shapes, drawn rather than typed.
 *
 * `♠︎ ♥︎ ♦︎ ♣︎` would be one character each and a lifetime of trouble: half the
 * fonts on a player's machine render them as emoji, the other half at four
 * different optical sizes, and a card whose pip is a different size on two
 * machines is a card that looks wrong on one of them. These are paths, so they
 * are the same everywhere and they scale with the table.
 */
const SHAPES: Record<Suit, string> = {
  spades:
    "M12 2.2c0 0-8.2 6.6-8.2 11.6a4.9 4.9 0 0 0 7.3 4.3c-.2 1.7-.9 2.9-2 3.7h5.8c-1.1-.8-1.8-2-2-3.7a4.9 4.9 0 0 0 7.3-4.3C20.2 8.8 12 2.2 12 2.2z",
  hearts:
    "M12 21.4S3.6 15.6 3.6 9.9A4.9 4.9 0 0 1 12 6.4a4.9 4.9 0 0 1 8.4 3.5c0 5.7-8.4 11.5-8.4 11.5z",
  diamonds: "M12 1.8 20.2 12 12 22.2 3.8 12z",
  clubs:
    "M12 2.2a4.1 4.1 0 0 0-3.2 6.7 4.1 4.1 0 1 0-.4 7.6 4 4 0 0 0 2.9-1.2c-.1 1.9-.8 3.4-2.1 4.5h5.6c-1.3-1.1-2-2.6-2.1-4.5a4 4 0 0 0 2.9 1.2 4.1 4.1 0 1 0-.4-7.6A4.1 4.1 0 0 0 12 2.2z",
};

/** Red is red because it always has been. Black is warmed a shade off pure. */
const INK: Record<Suit, string> = {
  spades: "#191f26",
  clubs: "#191f26",
  hearts: "#c4202f",
  diamonds: "#c4202f",
};

function Pip({ suit, size }: { suit: Suit; size: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={unit(size)}
      height={unit(size)}
      fill={INK[suit]}
      aria-hidden
      className="block shrink-0"
    >
      <path d={SHAPES[suit]} />
    </svg>
  );
}

/** How a card reads aloud, and what its `aria-label` says. */
const SPOKEN: Record<string, string> = {
  A: "Ace",
  "2": "Two",
  "3": "Three",
  "4": "Four",
  "5": "Five",
  "6": "Six",
  "7": "Seven",
  "8": "Eight",
  "9": "Nine",
  T: "Ten",
  J: "Jack",
  Q: "Queen",
  K: "King",
};

export function describe(code: Code): string {
  return `${SPOKEN[code[0]] ?? code[0]} of ${suitOf(code)}`;
}

/**
 * Where a card is in its life.
 *
 * `dealt` covers the flight *and* lying on the felt afterwards, because they
 * are one animation with a fill rather than two states — the card lands where
 * the keyframes leave it and stays there. `swept` is the clearance at the end
 * of a hand, and the card is unmounted once it has played.
 */
export type CardPhase = "dealt" | "swept";

export function Card({
  card,
  at,
  faceUp,
  dealtFaceUp,
  phase,
  delay = 0,
  dim = false,
}: {
  /**
   * The shoe's own two-character code — `AS`, `TD`. See lib/cards.ts.
   *
   * `null` is a card whose face nobody at the table is entitled to: the
   * dealer's hole card before it is turned. It is not a placeholder standing in
   * for the real one — the real one has not left the server, and the front of
   * this card is genuinely blank until it does. Sending a code and trusting the
   * back to cover it would put the card in the page for anyone who looked.
   */
  card: Code | null;
  /** Where it comes to rest, and at what angle. */
  at: Point & { turn: number };
  /** Whether its face is showing *now*. */
  faceUp: boolean;
  /**
   * Whether it was face up when it was dealt.
   *
   * The difference between the two decides which turn it plays. A card dealt
   * face up turns over during its flight; one dealt face down and turned later
   * — the dealer's hole card — turns on the spot, with no flight to hide the
   * first half of the movement.
   */
  dealtFaceUp: boolean;
  phase: CardPhase;
  /**
   * How long after mounting this card leaves the shoe.
   *
   * The server deals a whole opening round in one go, so without this every
   * card of it flies out at the same instant and the deal reads as a hand
   * appearing. The caller works the order out from the deal itself — see
   * ./hands.tsx — and a card that is not part of an opening round passes zero.
   */
  delay?: number;
  /**
   * Belongs to a split hand that is not the one being played right now.
   *
   * Fades the card rather than the whole hand disappearing or a badge being
   * added — the cards are still there and still matter, they are simply not
   * what the felt should be read as being about for the next few seconds. See
   * ./hands.tsx for where this is decided.
   */
  dim?: boolean;
}) {
  const corner = unit(3.2);

  /*
    The two journeys, as vectors from where the card ends up. Both are worked
    out here rather than in the keyframes because only this component knows
    where the card landed, and a keyframe cannot subtract.
  */
  const style = {
    ...placeCentred(at, CARD.w, CARD.h),
    width: unit(CARD.w),
    height: unit(CARD.h),
    /*
      Held back until its turn in the deal. The animations carry `both`, so a
      delayed card sits in its *starting* state — at the shoe, face down — until
      the delay elapses, rather than being drawn on the felt and then jumping
      back to the shoe to fly in.
    */
    animationDelay: delay ? `${delay}ms` : undefined,
    "--rest-r": `${at.turn.toFixed(2)}deg`,
    "--in-x": unit(SHOE.x - at.x),
    "--in-y": unit(SHOE.y - at.y),
    "--in-r": `${(at.turn - 10).toFixed(2)}deg`,
    "--out-x": unit(DISCARD.x - at.x),
    "--out-y": unit(DISCARD.y - at.y),
    "--out-r": `${(at.turn + 16).toFixed(2)}deg`,
  } as React.CSSProperties;

  /*
    ── Three elements, three jobs, and that is why ───────────────────────────
    Position and size on the outer. The sweep on the middle. The flight from
    the shoe on the inner. They were two, with the flight and the sweep sharing
    an element and swapping `animation-name` between them — and swapping an
    animation-name *restarts* it, so any wobble in the condition that chose
    between them sent every card on the table back to the shoe to be dealt
    again. It looked like the game had glitched, because it had.

    Split up, the flight is applied once when the card mounts and can never be
    taken away. Whatever the sweep does or does not do, a card that has landed
    stays landed. The clock's monotonic rule (./clock.ts) stops the flapping at
    source; this stops the flapping from *mattering*, which is the half that
    still holds when the next condition is added.
  */
  return (
    <div
      style={style}
      className={`pointer-events-none absolute transition-opacity duration-300 ease-out ${dim ? "opacity-45" : "opacity-100"} ${phase === "swept" ? "animate-sweep" : ""}`}
      /*
        One card is one thing on the table, so it is labelled once, here, rather
        than having a face and a back that each announce themselves. A face-down
        card genuinely has nothing to say — and saying what it is would be worse
        than saying nothing.
      */
      role="img"
      aria-label={faceUp && card ? describe(card) : "Face-down card"}
    >
      {/*
        The flight. Mounted with this class and never without it, so it plays
        once and is never restarted by anything happening around it.
      */}
      <div
        style={{
          animationDelay: delay ? `${delay}ms` : undefined,
          // On this element rather than the outer: `perspective` only reaches
          // *direct* children, and the flip is a child of this one now.
          perspective: unit(620),
        }}
        className="animate-deal h-full w-full"
      >
      <div
        style={{
          transformStyle: "preserve-3d",
          transform: faceUp ? undefined : "rotateY(180deg)",
          // The turn happens during the flight, so it waits on the same delay.
          animationDelay: delay ? `${delay}ms` : undefined,
        }}
        /*
          Utilities rather than an inline `animation`, and it is load-bearing:
          Tailwind only emits an `@keyframes` block for an animation it can see
          being used, and what it looks for is the class name in the source. An
          inline `var(--animate-turn-in)` would resolve to a name with no
          keyframes behind it, and the card would simply never turn over.

          No class at all while it is face down — `animate-turn-in` would fire
          on mount and flip a hole card the instant it was dealt.
        */
        className={`relative h-full w-full ${
          faceUp ? (dealtFaceUp ? "animate-turn-in" : "animate-turn-over") : ""
        }`}
      >
        <Face card={card} corner={corner} />
        <Back corner={corner} />
      </div>
      </div>
    </div>
  );
}

/** Shared by both sides, so the two are the same object seen from two angles. */
const SIDE = "absolute inset-0 overflow-hidden";
const SIDE_STYLE: React.CSSProperties = { backfaceVisibility: "hidden" };

function Face({ card, corner }: { card: Code | null; corner: string }) {
  // Nothing is known about it yet, so nothing is drawn on it. The back is
  // facing the player either way; this is what is behind that back, and it is
  // blank because the server has not said otherwise.
  const rank = card ? rankLabel(card) : "";
  const suit = card ? suitOf(card) : null;

  /*
    A ten is two glyphs where every other rank is one, and at this size the
    difference between "10" set to fit and "10" set like a K is the difference
    between a card and a spreadsheet. It gets its own size rather than the
    corner getting wider, because the corner's width is what keeps the pip
    under it centred.
  */
  const index = suit ? (
    <span
      style={{ fontSize: unit(rank === "10" ? 13.5 : 16), color: INK[suit] }}
      className="font-sans font-bold leading-none tracking-tight"
    >
      {rank}
    </span>
  ) : null;

  return (
    <div
      style={{
        ...SIDE_STYLE,
        borderRadius: corner,
        // A card is not white. It is warm, and it has an edge you can see.
        background: "linear-gradient(160deg, #fefdfa 0%, #f4f0e6 100%)",
        boxShadow: `inset 0 0 0 ${unit(1)} rgba(25,31,38,0.16)`,
        padding: unit(4.5),
      }}
      className={`${SIDE} flex flex-col justify-between`}
    >
      <span className="flex flex-col items-center gap-px self-start">
        {index}
        {suit ? <Pip suit={suit} size={8} /> : null}
      </span>

      {/*
        The middle pip is the card at a glance — the thing a player reads from
        across the table when the corner index is four pixels tall. Nudged up a
        hair off true centre, which is where the eye expects it against two
        corner indices.
      */}
      {suit ? (
        <span
          style={{ marginTop: unit(-6) }}
          className="pointer-events-none absolute inset-0 flex items-center justify-center"
        >
          <Pip suit={suit} size={26} />
        </span>
      ) : null}

      <span className="flex rotate-180 flex-col items-center gap-px self-start">
        {index}
        {suit ? <Pip suit={suit} size={8} /> : null}
      </span>
    </div>
  );
}

/**
 * The back: a house pattern, not a blank.
 *
 * Every card on the table is face down at some point, and a rectangle of flat
 * colour reads as a card that has not finished loading. The lattice is drawn
 * as an SVG pattern so it stays the same density however large the table is —
 * the one thing on a card that must not scale with it, because a pattern that
 * scales is a pattern you can count.
 */
function Back({ corner }: { corner: string }) {
  return (
    <div
      style={{
        ...SIDE_STYLE,
        borderRadius: corner,
        transform: "rotateY(180deg)",
        background: "linear-gradient(160deg, #a02533 0%, #6f1723 100%)",
        boxShadow: `inset 0 0 0 ${unit(1)} rgba(25,31,38,0.3)`,
      }}
      className={SIDE}
    >
      <svg viewBox="0 0 52 73" preserveAspectRatio="none" className="h-full w-full" aria-hidden>
        <defs>
          <pattern id="bj-card-lattice" width="7" height="7" patternUnits="userSpaceOnUse">
            <path
              d="M0 7 L7 0 M-1 1 L1 -1 M6 8 L8 6"
              stroke="#f3e2d0"
              strokeOpacity="0.28"
              strokeWidth="1.1"
              fill="none"
            />
          </pattern>
        </defs>

        <rect x="0" y="0" width="52" height="73" fill="url(#bj-card-lattice)" />
        {/* The border every deck has: a light rule holding the pattern in. */}
        <rect
          x="3.4"
          y="3.4"
          width="45.2"
          height="66.2"
          rx="2"
          fill="none"
          stroke="#f3e2d0"
          strokeOpacity="0.5"
          strokeWidth="1"
        />
        {/* The house's mark in the middle, kept to a shape at this size. */}
        <ellipse cx="26" cy="36.5" rx="10" ry="13" fill="#5c111c" fillOpacity="0.75" />
        <ellipse
          cx="26"
          cy="36.5"
          rx="10"
          ry="13"
          fill="none"
          stroke="#f3e2d0"
          strokeOpacity="0.55"
          strokeWidth="0.9"
        />
        <path d={SHAPES.spades} fill="#f3e2d0" fillOpacity="0.62" transform="translate(17 27) scale(0.75)" />
      </svg>
    </div>
  );
}
