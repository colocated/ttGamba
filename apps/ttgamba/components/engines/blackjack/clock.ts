"use client";

/**
 * How long is left, ticking.
 *
 * ── Why the server sends a duration and not a deadline ────────────────────
 * A round's deadline is the *server's* epoch milliseconds, and a player's
 * machine is not necessarily anywhere near it. A clock a minute fast would show
 * every betting window as already expired; a minute slow, and a hand dealt long
 * ago would still appear to have twenty seconds on it. Comparing the two clocks
 * and carrying an offset around works, and it means every countdown on screen
 * depends on a subtraction made somewhere else being right.
 *
 * So the server sends "twelve thousand milliseconds from when I answered", and
 * this counts down from there. There is one clock in the arithmetic and it is
 * the browser's own, used only to measure elapsed time against itself — which
 * is the one thing every clock is good at.
 *
 * ── Why none of it happens during render ──────────────────────────────────
 * `Date.now()` is impure and React's lint rules say so, correctly: a component
 * that reads the clock while rendering produces a different tree every time it
 * happens to re-render, for reasons unrelated to anything that changed. Here it
 * is read in an effect (to anchor the target) and in an interval callback (to
 * measure against it), and the render itself is a pure function of state.
 */

import { useEffect, useRef, useState } from "react";

/** How often the number on screen is recomputed. Four times a second is plenty. */
const TICK = 200;

/**
 * Milliseconds remaining, counting down, restarted whenever the server sends a
 * new figure.
 *
 * `null` for a phase with no clock — the table waiting for somebody to bet —
 * and zero once it has run out, which is a real answer rather than a missing
 * one: the deadline has passed and the next poll will act on it.
 */
export function useCountdown(left: number | null): number {
  /*
    When the current window ends, on this machine's clock. A ref rather than
    state because nothing should re-render when it is re-anchored — the ticking
    below is what re-renders, at its own pace, and re-anchoring on every poll
    would make that four times as often for no visible difference.
  */
  const ends = useRef<number | null>(null);
  const [ms, setMs] = useState(left ?? 0);

  /*
    ── The clock only ever runs down ─────────────────────────────────────────
    Re-anchoring on every answer looks obviously right and is not. The poll
    arrives at whatever moment the network delivers it, so the remainder it
    carries is a reading taken a little while ago — and if it lands late, that
    reading is *larger* than what this has already counted down to. Anchoring
    to it makes the clock tick backwards.

    A few milliseconds of that is invisible on a number showing seconds. It was
    not invisible anywhere else: the card sweep is switched on when the payout
    has less than half a second left, and a clock that crossed that line and
    then jumped back over it flipped every card on the table from "swept" to
    "dealt" — which changes an animation-name, which restarts the deal, which
    is every card snapping back to the shoe and flying out again. That is the
    bug this rule fixes, and the animation is written not to depend on it
    either (see ./card.tsx).

    So a new reading is taken only when it moves the finish *earlier*, or when
    it moves it later by more than a second — which is not jitter, it is a new
    phase with a new clock.
  */
  useEffect(() => {
    if (left === null) {
      ends.current = null;
      return;
    }

    const next = Date.now() + left;
    const current = ends.current;
    if (current === null || next < current || next - current > 1_000) {
      ends.current = next;
    }
  }, [left]);

  useEffect(() => {
    const tick = setInterval(() => {
      setMs(ends.current === null ? 0 : Math.max(0, ends.current - Date.now()));
    }, TICK);
    return () => clearInterval(tick);
  }, []);

  return ms;
}
