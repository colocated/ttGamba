/**
 * A casino chip, drawn.
 *
 * One component for the whole rack. It is handed a value, looks the piece up in
 * lib/denominations.ts, and everything about how it looks comes out of that
 * one hex — the edge spots, the inlay, the shading, the ink. Inventing a new
 * denomination is a line in the registry and nothing here changes.
 *
 * ── Why the colours are derived rather than authored ──────────────────────
 * Because twenty-six chips at four hand-picked colours each is a hundred
 * decisions, and about ninety of them would be wrong. A chip is one colour with
 * a light inlay and a dark rim; saying so once in SVG means every piece in the
 * rack is the same object in a different colour, which is what a real rack is.
 *
 * The shading is white and black laid over the base at low opacity rather than
 * lightened and darkened hexes, so a colour that arrives as anything CSS
 * understands works without being parsed.
 *
 * ── Where it is used ──────────────────────────────────────────────────────
 * The gutter's drawer, the stack in a betting circle, and anywhere else a
 * figure would be better shown than written. It takes a CSS length for its
 * size, so the felt can pass container-query units and have chips scale with
 * the table while the gutter passes pixels.
 *
 * DESIGN.md: a chip is a drawing of a physical object and is exempt from the
 * flat-and-squared rules — including, obviously, being round.
 */

import { denomination, type ChipShape } from "@/lib/denominations";

/** The cream of the edge spots and the inlay's highlight. Every chip shares it. */
const CREAM = "#f4f0e4";
/** What is printed on the inlay. Dark enough to read on any base colour. */
const INK = "#14181e";

export function Chip({
  value,
  size,
  title,
  className = "",
}: {
  value: number;
  /** Any CSS length. The felt passes `cqw`, the gutter passes pixels. */
  size: string | number;
  title?: string;
  className?: string;
}) {
  const piece = denomination(value);
  if (!piece) return null;

  const plaque = piece.shape === "plaque";
  const width = typeof size === "number" ? `${size}px` : size;

  return (
    <svg
      viewBox={plaque ? "0 0 150 100" : "0 0 100 100"}
      style={{ width, aspectRatio: plaque ? "3 / 2" : "1 / 1" }}
      className={`block shrink-0 select-none ${className}`}
      role="img"
      aria-label={title ?? `${piece.label} chip`}
    >
      {title ? <title>{title}</title> : null}
      {plaque ? (
        <Plaque colour={piece.colour} label={piece.label} />
      ) : (
        <Disc colour={piece.colour} label={piece.label} />
      )}
    </svg>
  );
}

/**
 * The ordinary chip.
 *
 * Six edge spots, which is what most houses use and what still reads as spots
 * rather than as a dashed line at the twenty-odd pixels this is drawn at on the
 * felt. They are drawn as one rotated group so the count is a number rather
 * than six sets of coordinates.
 */
function Disc({ colour, label }: { colour: string; label: string }) {
  const spots = 6;

  return (
    <>
      {/* The body, and the shadow it sits in. */}
      <circle cx="50" cy="51" r="48" fill="#05080c" fillOpacity="0.45" />
      <circle cx="50" cy="50" r="48" fill={colour} />

      {/* Edge spots: the cream blocks every casino chip has round its rim. */}
      <g>
        {Array.from({ length: spots }, (_, index) => (
          <rect
            key={index}
            x="42.5"
            y="1.5"
            width="15"
            height="17"
            rx="2.5"
            fill={CREAM}
            transform={`rotate(${(index * 360) / spots} 50 50)`}
          />
        ))}
      </g>

      {/*
        A dark rule just inside the rim, then the inlay. Both are the base
        colour with black or white over it, so the whole chip is one hue and
        cannot end up with an inlay that clashes with its own body.
      */}
      <circle cx="50" cy="50" r="39" fill="#000000" fillOpacity="0.18" />
      <circle cx="50" cy="50" r="36" fill={colour} />
      <circle cx="50" cy="50" r="34" fill={CREAM} fillOpacity="0.9" />

      {/* The light on top, so it reads as a disc rather than a target. */}
      <circle cx="50" cy="50" r="48" fill="url(#chip-sheen)" />
      <defs>
        <radialGradient id="chip-sheen" cx="35%" cy="28%" r="75%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.22" />
          <stop offset="60%" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0.22" />
        </radialGradient>
      </defs>

      <Value label={label} size={fitDisc(label)} cx={50} cy={50} />
    </>
  );
}

/**
 * The denomination, printed on the inlay.
 *
 * Dark on the light inlay, which is what a chip looks like. It briefly had a
 * dark plate behind it, on a misreading of which "5M" was hard to read — the
 * one that was clipping was the seat's bet total crossing the betting circle's
 * ring (./engines/blackjack/hands.tsx), not this. The plate went back.
 *
 * The size is stepped by character count rather than measured. There are five
 * possible label lengths in the whole rack, measuring text in SVG costs a
 * layout, and being a couple of units conservative costs nothing.
 */
function Value({
  label,
  size,
  cx,
  cy,
}: {
  label: string;
  size: number;
  cx: number;
  cy: number;
}) {
  return (
    <text
      x={cx}
      y={cy}
      textAnchor="middle"
      dominantBaseline="central"
      fill={INK}
      fontWeight="800"
      fontSize={size}
      letterSpacing="-0.5"
      className="font-sans"
    >
      {label}
    </text>
  );
}

/**
 * The plaque, for money that has stopped being chips.
 *
 * A flat rectangular plate with a bevelled edge and a bright inlay across the
 * middle — which is what a high-limit room hands you once one piece is worth
 * more than anybody wants to stack. Being a different *shape* is the point:
 * a billion in a stack of discs looks like a hundred in a stack of discs, and
 * the one mistake worth designing out is a player misreading which.
 */
function Plaque({ colour, label }: { colour: string; label: string }) {
  return (
    <>
      <rect x="2" y="4" width="146" height="94" rx="9" fill="#05080c" fillOpacity="0.45" />
      <rect x="2" y="2" width="146" height="94" rx="9" fill={colour} />

      {/* Bevel: light along the top edge, dark along the bottom. */}
      <rect x="2" y="2" width="146" height="94" rx="9" fill="url(#plaque-bevel)" />

      {/* The inlay the value is printed on, inset like a real plate's. */}
      <rect x="14" y="26" width="122" height="46" rx="5" fill="#000000" fillOpacity="0.2" />
      <rect x="16" y="28" width="118" height="42" rx="4" fill={CREAM} fillOpacity="0.93" />

      {/* Foil corners — the detail that says "this one is worth checking". */}
      {[
        [14, 14],
        [136, 14],
        [14, 84],
        [136, 84],
      ].map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="3.4" fill={CREAM} fillOpacity="0.55" />
      ))}

      <defs>
        <linearGradient id="plaque-bevel" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.24" />
          <stop offset="45%" stopColor="#ffffff" stopOpacity="0.02" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0.28" />
        </linearGradient>
      </defs>

      <Value label={label} size={fitPlaque(label)} cx={75} cy={50} />
    </>
  );
}

/**
 * How big the value is printed, given how much of it there is.
 *
 * `100M` and `1M` on the same chip at the same size would leave one of them
 * spilling over the inlay and the other rattling around inside it. Stepped by
 * character count rather than measured, because there are five possible lengths
 * in the whole rack and measuring text in an SVG costs a layout.
 */
function fitDisc(label: string): number {
  if (label.length <= 2) return 26;
  if (label.length === 3) return 22;
  if (label.length === 4) return 18;
  return 15;
}

function fitPlaque(label: string): number {
  if (label.length <= 2) return 30;
  if (label.length === 3) return 27;
  return 23;
}

/** What a shape is worth knowing for, when a caller has to lay chips out. */
export type { ChipShape };
