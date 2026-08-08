/**
 * The table, drawn.
 *
 * Everything in here is furniture: it is rendered once and never changes for
 * the whole of a session at this table. Nothing that reacts to a player lives
 * in this file — no seats, no cards, no hover — which is what lets the whole
 * thing be one static SVG the browser can rasterise and forget about.
 *
 * ── What is being drawn ───────────────────────────────────────────────────
 * A blackjack table is a half-disc with the dealer at the flat edge. Their
 * side carries the chip tray, the shoe the cards come out of, and — on a
 * modern high-limit table — a slot in the surface that swallows dealt cards
 * into a shuffler underneath, so a hand is cleared without anybody touching
 * it. The players' side carries the paint: what the dealer must do, what the
 * game pays, what insurance pays, and a circle each.
 *
 * The order things are drawn in is the order they are stacked in reality, and
 * it matters in one place: the dealer is drawn *before* the table, so the rail
 * cuts them off at the waist and they read as standing behind it rather than
 * as a sticker on the felt.
 *
 * DESIGN.md's rules are suspended inside this box and only inside it — see the
 * carve-out there. Everything below is gradients, curves and cast shadow,
 * because that is what leather, felt and lacquered wood are.
 */

import { arc, DISCARD, RAIL, RING, SHOE, TABLE, VIEW } from "./geometry";

const { cx, cy, rx, ry } = TABLE;

/** The felt's own edge, one bumper's thickness inside the table's. */
const FELT_RX = rx - 26;
const FELT_RY = ry - 26;

/**
 * How far round the arc the insurance band runs.
 *
 * Named because three things have to agree about it — the stripe, the text on
 * it, and the two rules along its edges — and a band whose text runs off the
 * end of it is what happens when they stop agreeing.
 */
const INSURANCE_SPAN = 50;

/**
 * A half-ellipse: flat edge at the top, bulging down.
 *
 * Sweep flag 0 is the way round that goes *under*, in SVG's y-down space. Get
 * it wrong and the table is drawn as a dome above the dealer's head, which is
 * a memorable five minutes.
 */
const half = (hx: number, hy: number) =>
  `M ${cx - hx} ${cy} A ${hx} ${hy} 0 0 0 ${cx + hx} ${cy} Z`;

export function TableArt() {
  return (
    <svg
      viewBox={`0 0 ${VIEW.w} ${VIEW.h}`}
      /*
        Nothing on a table is selectable. The paint is paint: a player dragging
        across the felt to reach a card or a chip should not leave a trail of
        highlighted words behind them, and `pointer-events-none` alone does not
        stop that — a selection started anywhere else runs straight through
        this and takes the layout with it.
      */
      className="pointer-events-none absolute inset-0 h-full w-full select-none"
      aria-hidden
    >
      <defs>
        {/*
          The overhead light, as it falls on the cloth: brightest a little
          above the middle, where a pit's lamp actually hangs, and dropping
          away to almost nothing at the rail.
        */}
        <radialGradient id="bj-felt" cx="50%" cy="16%" r="86%">
          <stop offset="0%" stopColor="#37a973" />
          <stop offset="46%" stopColor="#22794f" />
          <stop offset="100%" stopColor="#0e4229" />
        </radialGradient>

        {/* Padded leather, lit from above: the roll's top edge catches, its underside does not. */}
        <linearGradient id="bj-leather" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#83323f" />
          <stop offset="38%" stopColor="#5e2130" />
          <stop offset="100%" stopColor="#37121c" />
        </linearGradient>

        <linearGradient id="bj-wood" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#6d4527" />
          <stop offset="55%" stopColor="#4a2c19" />
          <stop offset="100%" stopColor="#2c1a0f" />
        </linearGradient>

        <linearGradient id="bj-lacquer" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2b323c" />
          <stop offset="100%" stopColor="#141a21" />
        </linearGradient>

        {/* The one gold on the table. Everything a casino wants read twice is in it. */}
        <linearGradient id="bj-gold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f4dc9a" />
          <stop offset="52%" stopColor="#e3bb5f" />
          <stop offset="100%" stopColor="#b98a2f" />
        </linearGradient>

        {/*
          Cloth. Fine enough that it is texture rather than a grid — the test
          is that you cannot count the lines at any window size the frame
          allows, which is what keeps it reading as a woven surface.
        */}
        <pattern
          id="bj-weave"
          width="7"
          height="7"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <line x1="0" y1="0" x2="0" y2="7" stroke="#0b3a25" strokeOpacity="0.2" strokeWidth="2" />
        </pattern>

        <clipPath id="bj-felt-clip">
          <path d={half(FELT_RX, FELT_RY)} />
        </clipPath>

        <filter id="bj-cast" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="16" />
        </filter>

        {/* The arcs the paint is set along. Defined once, used by text and by stripe. */}
        <path id="bj-rules-arc" d={arc(RING.rules, 62)} fill="none" />
        <path id="bj-title-arc" d={arc(RING.title, 60)} fill="none" />
        <path id="bj-pays-arc" d={arc(RING.pays, 44)} fill="none" />
        <path id="bj-insurance-arc" d={arc(RING.insurance, INSURANCE_SPAN)} fill="none" />
      </defs>

      <Dealer />

      {/* What the table throws on the floor behind it. */}
      <path
        d={half(rx, ry)}
        fill="#05080c"
        fillOpacity="0.55"
        filter="url(#bj-cast)"
        transform="translate(0 16)"
      />

      {/* The bumper: the whole table in leather, with the felt laid inside it. */}
      <path d={half(rx, ry)} fill="url(#bj-leather)" />
      {/*
        The roll, as one highlight down the middle of the leather. A padded rail
        is a cylinder, and a cylinder lit from above has exactly one bright line
        along it — drawing the two shadow edges as well would be more accurate
        and would read as three stripes.
      */}
      <path
        d={half(rx - 11, ry - 11)}
        fill="none"
        stroke="#a8505f"
        strokeOpacity="0.42"
        strokeWidth="7"
      />
      <path d={half(rx, ry)} fill="none" stroke="#210a11" strokeOpacity="0.7" strokeWidth="3" />

      <path d={half(FELT_RX, FELT_RY)} fill="url(#bj-felt)" />
      <g clipPath="url(#bj-felt-clip)">
        <path d={half(FELT_RX, FELT_RY)} fill="url(#bj-weave)" />
        {/*
          Where the cloth tucks under the rail. Stroked on the inside of the
          clip so the darkening stays on the felt rather than bleeding onto the
          leather — which is the whole reason there is a clip path here.
        */}
        <path
          d={half(FELT_RX, FELT_RY)}
          fill="none"
          stroke="#062616"
          strokeOpacity="0.55"
          strokeWidth="22"
        />
      </g>

      <Paint />
      <DealerRail />
      <ChipTray />
      <Shoe />
      <DiscardSlot />
    </svg>
  );
}

/**
 * What is printed on the cloth.
 *
 * Four lines, in the order they run outwards from the dealer, which is the
 * order a table prints them in and — not by accident — the order a player
 * needs them: what the dealer is obliged to do, what a blackjack pays, what
 * insurance pays, and then their own half of the table.
 *
 * All four are set along arcs concentric with the table's edge, so the paint
 * curves the way the table does. `startOffset="50%"` with a middle anchor puts
 * each line on the centre of its arc regardless of how long the words are, so
 * changing the wording never moves anything.
 */
function Paint() {
  return (
    <g className="font-sans">
      <text
        fontSize="13"
        fontWeight="600"
        letterSpacing="1.8"
        fill="#eadfc6"
        fillOpacity="0.62"
        textAnchor="middle"
      >
        <textPath href="#bj-rules-arc" startOffset="50%">
          DEALER MUST STAND ON ALL 17s
        </textPath>
      </text>

      {/*
        ── Why this is drawn twice and not stroked ───────────────────────────
        It had a dark stroke on it for definition, and a stroke is painted
        *over* the fill — so it ate into the letterforms from both sides. On a
        stem that is barely noticeable; on the crossbar of an A, which is the
        thinnest part of the whole word, it doubled the apparent weight of the
        one piece that should be lightest. The result read as a strip laid
        across two uprights rather than as a letter, which is exactly what it
        looked like: tape between two sticks.

        So there is no stroke. Definition comes from a second copy of the word
        underneath, in a dark warm brown, offset down by two units — paint on
        cloth with a little depth behind it. The letterforms themselves are
        left entirely alone, which is the only way an A's crossbar stays the
        weight the typeface drew it.
      */}
      <text
        fontSize="38"
        fontWeight="800"
        letterSpacing="8"
        fill="#3d2a09"
        fillOpacity="0.5"
        textAnchor="middle"
        transform="translate(0 2.2)"
        aria-hidden
      >
        <textPath href="#bj-title-arc" startOffset="50%">
          BLACKJACK
        </textPath>
      </text>

      <text fontSize="38" fontWeight="800" letterSpacing="8" fill="url(#bj-gold)" textAnchor="middle">
        <textPath href="#bj-title-arc" startOffset="50%">
          BLACKJACK
        </textPath>
      </text>

      <text
        fontSize="19"
        fontWeight="700"
        letterSpacing="5.5"
        fill="#f2e7cf"
        fillOpacity="0.9"
        textAnchor="middle"
      >
        <textPath href="#bj-pays-arc" startOffset="50%">
          PAYS 3 TO 2
        </textPath>
      </text>

      {/*
        Insurance is a stripe rather than a line of text, because on a table it
        is a painted band you put chips on — and the band is the thing that
        makes the sentence a rule rather than a caption. The stroke and the
        words share one path, so they cannot drift apart.
      */}
      {/*
        ── The rim is under the band, not beside it ──────────────────────────
        The gold used to be two arcs, one just inside the stripe's ring and one
        just outside, which drew the long edges and left the rounded ends bare
        — the band looked like it had been cut off at both tips.

        One path, stroked a fraction wider than the band and painted first, so
        the dark stripe laid over it leaves an even gold edge showing on every
        side including the caps. Same path, same span, same line cap: an
        outline that cannot disagree with the shape it is outlining, because it
        *is* that shape.
      */}
      <path
        d={arc(RING.insurance, INSURANCE_SPAN)}
        fill="none"
        stroke="#e3bb5f"
        strokeOpacity="0.5"
        strokeWidth="25.6"
        strokeLinecap="round"
      />
      <path
        d={arc(RING.insurance, INSURANCE_SPAN)}
        fill="none"
        stroke="#083a22"
        strokeOpacity="0.95"
        strokeWidth="23"
        strokeLinecap="round"
      />
      <text
        fontSize="13"
        fontWeight="700"
        letterSpacing="3.4"
        fill="url(#bj-gold)"
        textAnchor="middle"
        dy="4.4"
      >
        <textPath href="#bj-insurance-arc" startOffset="50%">
          INSURANCE PAYS 2 TO 1
        </textPath>
      </text>
    </g>
  );
}

/** The dealer's wooden strip along the flat edge. Everything of theirs sits on it. */
function DealerRail() {
  return (
    <g>
      <rect
        x={cx - rx}
        y={cy - 7}
        width={rx * 2}
        height={RAIL + 7}
        rx="5"
        fill="url(#bj-wood)"
      />
      {/* The lit top edge of the strip, and the shadow it casts onto the cloth. */}
      <rect x={cx - rx} y={cy - 7} width={rx * 2} height="3" rx="1.5" fill="#8a5c34" fillOpacity="0.7" />
      <rect x={cx - rx} y={cy + RAIL} width={rx * 2} height="9" fill="#04180e" fillOpacity="0.42" />
    </g>
  );
}

/**
 * The dealer's chip tray, sunk into the rail.
 *
 * Six colours in the order a house racks them — the small denominations
 * nearest the dealer's working hand. It holds no state and never will: the
 * house's float is not a number this app has, and a tray that emptied as
 * players won would be inventing one.
 */
function ChipTray() {
  const columns = ["#d8dde4", "#c8434c", "#3f7fc4", "#43a06c", "#2c333d", "#d8a83e"];
  const left = cx - 152;

  return (
    <g>
      <rect x={left} y={cy - 1} width="304" height="30" rx="4" fill="url(#bj-lacquer)" />
      <rect
        x={left}
        y={cy - 1}
        width="304"
        height="30"
        rx="4"
        fill="none"
        stroke="#0a0e13"
        strokeOpacity="0.8"
        strokeWidth="1.5"
      />

      {columns.map((colour, index) => (
        <g key={colour}>
          {/* A column of chips, seen end-on: the top few edges of a stack in a slot. */}
          <rect
            x={left + 9 + index * 48}
            y={cy + 3}
            width="40"
            height="22"
            rx="2.5"
            fill={colour}
            fillOpacity="0.9"
          />
          {[0, 1, 2].map((line) => (
            <rect
              key={line}
              x={left + 9 + index * 48}
              y={cy + 8 + line * 6}
              width="40"
              height="1.6"
              fill="#0a0e13"
              fillOpacity="0.35"
            />
          ))}
        </g>
      ))}
    </g>
  );
}

/**
 * The shoe. Every card on this table starts here.
 *
 * Drawn as the wedge it is — tall at the back where the decks stand, low at
 * the mouth where they come out — with the mouth pointing at the table so the
 * direction a card leaves in is visible before one ever does. `SHOE` in
 * geometry.ts is the point cards fly *from*, and it is the mouth rather than
 * the middle of the box for that reason.
 */
function Shoe() {
  const { x, y } = SHOE;

  return (
    <g>
      <path
        d={`M ${x - 58} ${y + 26} L ${x - 52} ${y - 12} L ${x + 62} ${y - 30} L ${x + 62} ${y + 26} Z`}
        fill="#05080c"
        fillOpacity="0.5"
        transform="translate(3 7)"
      />
      <path
        d={`M ${x - 58} ${y + 26} L ${x - 52} ${y - 12} L ${x + 62} ${y - 30} L ${x + 62} ${y + 26} Z`}
        fill="url(#bj-lacquer)"
        stroke="#0a0e13"
        strokeWidth="1.5"
      />
      {/* The stack of decks inside, seen over the low side wall. */}
      <path
        d={`M ${x - 44} ${y + 4} L ${x - 40} ${y - 8} L ${x + 54} ${y - 22} L ${x + 54} ${y + 4} Z`}
        fill="#f2ece0"
        fillOpacity="0.9"
      />
      <path
        d={`M ${x - 44} ${y + 4} L ${x + 54} ${y + 4}`}
        stroke="#9aa3ae"
        strokeOpacity="0.7"
        strokeWidth="1.2"
      />
      {/* The mouth: the slot the dealer's thumb pulls a card through. */}
      <rect x={x - 62} y={y + 8} width="16" height="14" rx="2" fill="#0a0e13" />
      <rect x={x - 60} y={y + 11} width="12" height="4" rx="1" fill="#f2ece0" fillOpacity="0.55" />
    </g>
  );
}

/**
 * The slot dealt cards are swept into, and the shuffler under it.
 *
 * The modern high-limit table's answer to a discard rack: cards go into the
 * surface and never come back out by hand. It is drawn as a hole rather than a
 * tray — a lit rim around a dark opening — because it needs to read as
 * somewhere cards *go*, and a tray reads as somewhere they sit.
 */
function DiscardSlot() {
  const { x, y } = DISCARD;

  return (
    <g>
      <rect x={x - 62} y={y - 26} width="124" height="52" rx="5" fill="url(#bj-lacquer)" />
      <rect
        x={x - 62}
        y={y - 26}
        width="124"
        height="52"
        rx="5"
        fill="none"
        stroke="#0a0e13"
        strokeOpacity="0.8"
        strokeWidth="1.5"
      />
      {/* The opening, and the one green tell-tale that says the machine is live. */}
      <rect x={x - 50} y={y - 14} width="100" height="18" rx="2.5" fill="#04070a" />
      <rect
        x={x - 50}
        y={y - 14}
        width="100"
        height="3"
        rx="1.5"
        fill="#7f8894"
        fillOpacity="0.35"
      />
      <circle cx={x + 44} cy={y + 15} r="3.4" fill="#38b87c" />
      <circle cx={x + 44} cy={y + 15} r="6.5" fill="#38b87c" fillOpacity="0.22" />
    </g>
  );
}

/**
 * The dealer.
 *
 * Drawn before the table so the rail cuts them off at the waist — which is the
 * one thing that decides whether the figure is standing behind a table or
 * stuck on top of one. Everything below the rail is therefore never seen and
 * is not drawn.
 *
 * Stylised well short of a portrait, on purpose. At the smallest window this
 * app allows, their whole head is about thirty pixels tall; a face with any
 * detail in it at that size is a smudge, and a face with detail at the largest
 * size would be a character the game has not earned. Two eyes and a mouth is
 * the level that survives both.
 */
function Dealer() {
  return (
    <g className="dealer-idle">
      {/* Shoulders and waistcoat, running under the rail. */}
      <path
        d={`M 442 ${cy + 12} C 442 106, 464 90, 500 90 C 536 90, 558 106, 558 ${cy + 12} Z`}
        fill="#232a33"
      />
      {/* Shirt, and the tie every house makes them wear. */}
      <path d="M 484 92 L 500 124 L 516 92 Z" fill="#eef1f5" />
      <path d="M 486 96 L 500 116 L 514 96 Z" fill="#dfe4ea" />
      <path d="M 489 95 L 500 101 L 511 95 L 511 106 L 500 100 L 489 106 Z" fill="#c8434c" />
      <circle cx="500" cy="100" r="3.2" fill="#a83640" />

      {/* Neck, then head over it. */}
      <rect x="490" y="70" width="20" height="26" rx="8" fill="#c99a72" />
      <ellipse cx="500" cy="52" rx="25" ry="29" fill="#dcab7e" />
      {/* Hair: a cap over the crown, with the sideburn line the ellipse alone would miss. */}
      <path
        d="M 475 50 C 475 26, 486 20, 500 20 C 514 20, 525 26, 525 50 C 525 40, 517 34, 500 34 C 483 34, 475 40, 475 50 Z"
        fill="#2b2118"
      />
      <ellipse cx="492" cy="52" rx="2.6" ry="3.4" fill="#2b2118" />
      <ellipse cx="508" cy="52" rx="2.6" ry="3.4" fill="#2b2118" />
      <path
        d="M 493 63 Q 500 68 507 63"
        fill="none"
        stroke="#8a5c3f"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </g>
  );
}
