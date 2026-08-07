"use client";

/**
 * The shelf's list of games, as the interface holds it.
 *
 * One store rather than a query per component, for the same reason the balance
 * is one (lib/chips.ts): the shelf, the games index and the admin panel are all
 * looking at the same list, and three copies of it would disagree the moment
 * one of them was saved. The server is asked once per app load — navigating
 * between games re-reads nothing.
 *
 * Nothing here is cached to storage. The balance is, because a dash where a
 * number belongs is a thing a player notices on every load; a shelf that fills
 * in over the same beat its icons are being fetched over is not. See
 * components/icon.tsx.
 */

import { useEffect, useSyncExternalStore } from "react";

import type { GameRow } from "./casino";
import { getRail } from "./catalogue";
import { usePlayer } from "@tt/userapp/gamedata";

export type RailState = {
  /** `null` until the server has answered. Not the same as an empty shelf. */
  games: GameRow[] | null;
  /** We asked and could not be told. The shelf shows what it has, which is nothing. */
  failed: boolean;
};

/** Referentially stable — `useSyncExternalStore` compares snapshots by identity. */
const INITIAL: RailState = { games: null, failed: false };

let state: RailState = INITIAL;
/** Whose shelf has been asked for, so a navigation does not re-ask. */
let asked: number | null = null;
const listeners = new Set<() => void>();

function publish(next: RailState) {
  state = next;
  for (const listener of listeners) listener();
}

function load(vrpId: number) {
  if (asked === vrpId) return;
  asked = vrpId;

  getRail({ vrpId })
    .then((result) => {
      if (asked !== vrpId) return;
      if (result.ok) publish({ games: result.data, failed: false });
      // A refusal leaves whatever is on screen where it is. The shelf is
      // navigation: blanking it because one read was refused would strand a
      // player with no way out of the page they are on.
      else publish({ ...state, failed: state.games === null });
    })
    .catch(() => {
      if (asked !== vrpId) return;
      publish({ ...state, failed: state.games === null });
    });
}

/**
 * Ask again.
 *
 * Called by the admin panel after a save, so the shelf shows the arrangement
 * that was just written rather than the one from before it — the person who
 * moved a game is the one most likely to look at the shelf next.
 */
export function refreshRail() {
  if (asked === null) return;
  const vrpId = asked;
  asked = null;
  load(vrpId);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The games a player may see, in the order an administrator put them in. */
export function useRail(): RailState {
  const { player } = usePlayer();

  const snapshot = useSyncExternalStore(
    subscribe,
    () => state,
    () => INITIAL,
  );

  // Keyed on the vRP id, so there is nothing to ask for until the game client
  // has produced one. `load` is idempotent per player, which is what stops a
  // second consumer — or a navigation — asking again.
  useEffect(() => {
    if (player.vrpId !== null) load(player.vrpId);
  }, [player.vrpId]);

  return snapshot;
}
