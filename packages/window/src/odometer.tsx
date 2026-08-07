"use client";

/**
 * A figure that rolls to its new value, one column per digit.
 *
 * A balance is the one number in a casino that a player is watching rather than
 * reading, and a chip count that simply *becomes* a different number leaves
 * them to work out whether anything happened at all. Rolling it does the job
 * DESIGN.md asks motion to do: it says a change fired, and which way it went.
 *
 * Direction is the point, not decoration. A column always travels *up* for a
 * gain and *down* for a loss, including across a wrap — 9 rolling to 0 on a
 * win goes forwards past 9, the way an odometer does, rather than winding back
 * through 8, 7, 6. The digits alone would not say which happened.
 *
 * Nothing here animates a figure that is merely *arriving* — a page mounting,
 * a balance read for the first time. That is not a change, and rolling it up
 * from zero would invent one.
 */

import { useState } from "react";

/**
 * Every cell is the same box — same height, same line box, same overflow rule —
 * so digits, separators and trailing words sit on one line rather than each
 * finding their own baseline. `whitespace-pre` is what keeps the space in
 * "1,234 chips": a lone space in a block would otherwise collapse to nothing.
 */
const CELL = "block h-[1.2em] overflow-hidden whitespace-pre leading-[1.2em]";

export function Odometer({
  value,
  format,
}: {
  value: number;
  /** How the figure reads. Anything that is not a digit rides along unrolled. */
  format: (value: number) => string;
}) {
  /*
    The move currently on screen: where the figure came from, and where it is
    going. Both start at `value`, which is what makes a first paint print
    rather than roll up from nowhere.

    Held as state and adjusted during render rather than in an effect. An
    effect would be a frame late — the roll has to be in the markup React
    commits, not applied to it afterwards — and a ref read during render would
    be a lie the second time anything else re-rendered this component. Once
    `to` has caught up, an unrelated re-render leaves it alone, so a roll in
    flight is never disturbed.
  */
  const [move, setMove] = useState({ from: value, to: value });
  if (move.to !== value) {
    setMove({ from: move.to, to: value });
  }

  // Keyed on the destination, so each change mounts a fresh roll rather than
  // retargeting the one in flight.
  return <Roll key={move.to} from={move.from} to={move.to} format={format} />;
}

function Roll({
  from,
  to,
  format,
}: {
  from: number;
  to: number;
  format: (value: number) => string;
}) {
  const moved = from !== to;
  const up = to > from;

  const target = format(to);

  return (
    <span
      className={`inline-flex items-end ${
        // A tint on the way past, settling back to the currency colour. At a
        // glance it is the difference between a win and a loss, before the
        // number has finished moving.
        moved ? (up ? "animate-gain" : "animate-loss") : ""
      }`.trim()}
    >
      {/* The reels are decoration to a screen reader; the figure is the text. */}
      <span aria-hidden className="inline-flex items-end">
        {cells(format(from), target).map((cell, index) =>
          cell.from === null ? (
            <span key={index} className={CELL}>
              {cell.char}
            </span>
          ) : (
            <Column key={index} from={cell.from} to={Number(cell.char)} up={up} />
          ),
        )}
      </span>
      <span className="sr-only">{target}</span>
    </span>
  );
}

/** One rolling digit, or `from: null` for anything that does not roll. */
type Cell = { char: string; from: number | null };

/**
 * Pair the old figure's digits with the new one's, right to left, so the ones
 * place is matched with the ones place however much the number has grown or
 * shrunk. A column with no counterpart — a balance that has just gained a digit
 * — starts from zero, which is where it was.
 */
function cells(source: string, target: string): Cell[] {
  const digits = source.replace(/[^0-9]/g, "");
  let cursor = digits.length;
  const out: Cell[] = [];

  for (let i = target.length - 1; i >= 0; i -= 1) {
    const char = target[i];
    if (char >= "0" && char <= "9") {
      cursor -= 1;
      out.push({ char, from: cursor >= 0 ? Number(digits[cursor]) : 0 });
    } else {
      out.push({ char, from: null });
    }
  }

  return out.reverse();
}

/**
 * A single digit column: a strip of the numbers it passes through, translated
 * so the right one is in the window.
 */
function Column({ from, to, up }: { from: number; to: number; up: boolean }) {
  // How far round the wheel this column turns, in its own direction. Modulo is
  // what makes 9 → 0 one step forwards on a gain and nine steps back on a loss,
  // rather than the shorter way round in both cases.
  const steps = up ? (to - from + 10) % 10 : (from - to + 10) % 10;

  // The strip always ascends, whichever way the balance went. Reversing it for
  // a loss would show the same digits while still sliding upwards — the point
  // is that the column physically travels the other way.
  const digits = Array.from({ length: steps + 1 }, (_, i) => (up ? from + i : to + i) % 10);

  // Percentages are of the strip's own height, so this is `-index × 1.2em`
  // without having to know the font size.
  const stop = (index: number) => `-${(index / digits.length) * 100}%`;

  return (
    <span className={`${CELL} w-[1ch]`}>
      <span
        className={steps === 0 ? "block" : "block animate-roll"}
        style={
          steps === 0
            ? undefined
            : ({
                "--tt-roll-from": stop(up ? 0 : steps),
                "--tt-roll-to": stop(up ? steps : 0),
              } as React.CSSProperties)
        }
      >
        {digits.map((digit, index) => (
          <span key={index} className="block h-[1.2em] leading-[1.2em]">
            {digit}
          </span>
        ))}
      </span>
    </span>
  );
}
