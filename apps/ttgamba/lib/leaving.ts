"use client";

/**
 * The seat a player is holding, told to the rest of the window.
 *
 * ── The problem this exists to solve ──────────────────────────────────────
 * A seat at a table is not like the rest of the app. Everywhere else, clicking
 * something in the shelf is free — you are reading a queue, you go and read a
 * different one, nothing happened. At a table it is not free: the chair is
 * given up, the hand in progress is abandoned, and there is no way back to
 * either of them. A rail that navigates away on the first click is a rail that
 * throws a player out of a game they are mid-hand in, and neither the shelf nor
 * the window has any way of knowing that.
 *
 * So the engine says. While a table is on screen it registers what it is and
 * how to leave it, and the shelf asks here before it goes anywhere.
 *
 * ── Why a store and not a prop or a context ───────────────────────────────
 * The shelf and the stage are siblings: the shelf is drawn by the window
 * (components/window.tsx) and the table by a page several levels down inside
 * it. A prop would have to go up through the window and back down, and a
 * context provider would have to wrap both — which means the window knowing
 * that one of its apps has tables in it.
 *
 * The same arrangement as lib/chips.ts, for the same reason: two parts of the
 * page that are not related to each other need to agree about one thing.
 *
 * ── What it is not ────────────────────────────────────────────────────────
 * It is not a guard, and nothing here prevents anything. A player who types the
 * address, presses the browser's back button or reloads the page leaves the
 * table and that is that — the seat is released by the poll going quiet
 * (lib/casino.ts) and no round is corrupted by it. This makes the *shelf* ask
 * first, which is where a player who did not mean to leave actually clicks.
 */

import { useSyncExternalStore } from "react";

export type HeldTable = {
  /**
   * Whether they are in a chair, rather than standing at the rail watching.
   *
   * The difference decides what leaving actually costs, and therefore what a
   * confirmation is allowed to say. A spectator gives up nothing at all —
   * telling them their seat goes back to the table is describing something
   * that is not happening to them.
   */
  seated: boolean;
  /**
   * A hand is being played *and* this player is in it. Leaving will be held
   * until it settles, and the confirmation should say so rather than promising
   * something immediate.
   *
   * Always false for a spectator: a hand being dealt in front of somebody with
   * nothing staked on it is not a reason to keep them there.
   */
  midRound: boolean;
  /**
   * Give up the seat, then run `then`.
   *
   * The engine owns the timing: if a round is in progress this waits for it,
   * and `then` runs when the seat has actually been released. A caller
   * navigating away should do it in there rather than beside it, or the page
   * unmounts before the engine has done anything with the request.
   */
  leave: (then: () => void) => void;
};

let held: HeldTable | null = null;
const listeners = new Set<() => void>();

function publish() {
  for (const listener of listeners) listener();
}

/**
 * Say that a table is on screen, and how to leave it. Returns the cleanup, so
 * an engine's effect can be a one-liner:
 *
 * ```ts
 * useEffect(() => holdTable(table), [table]);
 * ```
 *
 * Last writer wins, and nothing tries to be cleverer than that. Two tables are
 * never on screen at once — the stage renders one engine — and the cleanup
 * clearing a hold that a newer mount has already replaced would be worse than
 * the alternative, so it only clears its own.
 */
export function holdTable(table: HeldTable): () => void {
  held = table;
  publish();

  return () => {
    if (held !== table) return;
    held = null;
    publish();
  };
}

/** The table on screen, or `null` when the player is free to go anywhere. */
export function useHeldTable(): HeldTable | null {
  return useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    () => held,
    // Nothing is ever held during a server render: a table only exists once a
    // client has polled for one.
    () => null,
  );
}
