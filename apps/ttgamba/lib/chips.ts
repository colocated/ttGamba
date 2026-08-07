"use client";

/**
 * The player's chip balance, as the interface reads it.
 *
 * `lib/account.ts` is the server's answer and the only authority. This is the
 * shared client-side copy: one store, so the titlebar and the settings page
 * show the same figure without each asking for it, backed by `localStorage` so
 * a reload paints a balance instead of a dash.
 *
 * ── What this cache is, and what it is not ───────────────────────────────
 * It is a display cache. It is never a fact about what a player can afford.
 *
 * Every bet has to be settled by a server action that re-reads the balance,
 * checks it and debits it in one transaction — the number here is whatever
 * this browser last wrote, and a player can edit it. Feed the account that
 * action returns back through `settle` and the interface catches up. Nothing
 * else may write a balance.
 *
 * That contract is what makes caching safe rather than merely cheap: a stale
 * figure costs a moment of wrong text, never a bet that should not have been
 * allowed. It is also why a failed re-read leaves the old number on screen
 * instead of blanking it — the next bet corrects it either way.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * The server is asked once per app load, not once per page. The store outlives
 * navigation, so moving between the shelf's games re-reads nothing; the
 * titlebar's refresh button is the manual re-read.
 */

import { useEffect, useSyncExternalStore } from "react";

import { getAccount, type Account } from "./account";
import { usePlayer } from "./gamedata";
import type { Role } from "./generated/prisma/enums";

/**
 * `localStorage` only — deliberately not also shared with the game client the
 * way settings are. A second copy in a second store would be a second stale
 * writer, and neither of them is the authority anyway. Other tabs are kept in
 * step through the `storage` event instead, which costs nothing.
 */
const CACHE_KEY = "ttgamba_chips";

export type ChipState = {
  /** The balance to show, or `null` if we have not got one yet. */
  chips: number | null;
  /**
   * The player's role. Only ever the server's answer — a cached role would be
   * a guess about what someone is allowed to do, and the settings page would
   * rather say nothing (see components/account.tsx).
   */
  role: Role | null;
  /**
   * The server could not be reached *and* there is nothing to fall back on. A
   * failed re-read behind a balance already on screen is not something the
   * player can act on, so it is not reported as one.
   */
  failed: boolean;
};

/** The cached balance, stamped with when it was written. */
type Stored = { t: number; vrpId: number; chips: number };

/** Referentially stable — `useSyncExternalStore` compares snapshots by identity. */
const INITIAL: ChipState = { chips: null, role: null, failed: false };

let state: ChipState = INITIAL;
/**
 * The stored copy, held back until a player is known. It carries the vRP id it
 * was written for: one machine can host more than one account over its life,
 * and publishing before that is matched shows a player someone else's balance.
 */
let stored: Stored | null = null;
/** Whose account has been asked for, so a navigation does not re-ask. */
let asked: number | null = null;
/** When the balance we hold was written. Keeps an older copy from winning. */
let at = 0;
let hydrated = false;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function publish(next: ChipState) {
  state = next;
  emit();
}

/**
 * Ignore anything that is not the shape we expect. This feeds a currency
 * readout, and a string where a number belongs would be rendered rather than
 * caught.
 */
function parse(raw: string | null): Stored | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return null;
    const { t, vrpId, chips } = value as Record<string, unknown>;
    if (typeof vrpId !== "number" || !Number.isFinite(vrpId)) return null;
    if (typeof chips !== "number" || !Number.isFinite(chips)) return null;
    return { t: typeof t === "number" ? t : 0, vrpId, chips };
  } catch {
    return null;
  }
}

function write(value: Stored) {
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(value));
  } catch {
    // Private mode, or a client with storage disabled. The only thing lost is
    // the head start on the next load.
  }
}

/**
 * Adopt an account the server has just confirmed.
 *
 * This is the seam every bet settles through: a game's server action debits
 * the balance and returns the row it wrote, and passing it here is what puts
 * the new figure in the titlebar without another read.
 */
export function settle(account: Account) {
  asked = account.vrpId;
  at = Date.now();
  stored = { t: at, vrpId: account.vrpId, chips: account.chips };
  write(stored);
  publish({ chips: account.chips, role: account.role, failed: false });
}

/** Ask the server for a player's account, at most once per player. */
function load(vrpId: number) {
  if (asked === vrpId) return;
  asked = vrpId;

  // Show the stored balance while the server is asked — this is the whole
  // point of keeping one. Only this player's, and only when there is nothing
  // better already on screen.
  if (stored && stored.vrpId === vrpId && state.chips === null) {
    at = stored.t;
    publish({ ...state, chips: stored.chips, failed: false });
  }

  getAccount(vrpId)
    .then((account) => {
      // A reply for a player who is no longer the one on screen.
      if (asked !== vrpId) return;
      settle(account);
    })
    .catch(() => {
      if (asked !== vrpId) return;
      publish({ ...state, failed: state.chips === null });
    });
}

/** Re-read from the server. Wired to the titlebar's refresh button. */
export function refreshChips() {
  if (asked === null) return;
  const vrpId = asked;
  asked = null;
  load(vrpId);
}

/**
 * Re-read the account if what we hold is older than `maxAge` milliseconds.
 *
 * This is a deliberate departure from "the server is asked once per app load".
 * The balance was the only thing here when that was written, and a stale
 * balance costs a moment of wrong text. The role is not like that: it is a
 * permission, and a player who has just had `banker` taken off them is sitting
 * in front of a page that still believes otherwise. Reloading the app is not
 * something the app can ask for (components/tablet.tsx), so the only thing
 * left is to re-ask as they move around — which lib/staff.ts does on every
 * navigation, at most this often.
 *
 * The panel is not defended by this. It is defended by lib/auth.ts, which
 * re-reads the role on every single call and cannot be talked out of it. This
 * is the part that stops a demoted banker being *shown* a desk they can no
 * longer use.
 *
 * A failed re-read leaves `at` where it was, so the next navigation tries
 * again rather than accepting a stale role for the full interval.
 */
export function revalidateAccount(maxAge: number) {
  if (asked === null) return;
  if (Date.now() - at < maxAge) return;
  refreshChips();
}

function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;

  try {
    stored = parse(window.localStorage.getItem(CACHE_KEY));
  } catch {
    // An unreadable store just means the balance starts as a dash.
  }

  // Another ttGamba tab settling a bet. `storage` fires only in the *other*
  // documents on this origin, so this never sees our own writes, and the stamp
  // keeps a slow tab's re-read from undoing a bet this one just settled.
  window.addEventListener("storage", (event) => {
    if (event.key !== CACHE_KEY) return;
    const incoming = parse(event.newValue);
    if (!incoming || incoming.t <= at) return;

    stored = incoming;
    if (asked !== incoming.vrpId) return;
    at = incoming.t;
    publish({ ...state, chips: incoming.chips, failed: false });
  });
}

function subscribe(listener: () => void) {
  hydrate();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * The balance, the role, and whether we have failed to get either.
 *
 * Hydration is deferred to `subscribe`, which React calls after mount, so the
 * first client render matches the server's and the balance lands as an
 * ordinary update rather than a hydration mismatch.
 */
export function useChips(): ChipState {
  const { player } = usePlayer();

  const snapshot = useSyncExternalStore(
    subscribe,
    () => state,
    () => INITIAL,
  );

  // The account is keyed on the vRP id, so there is nothing to ask for until
  // the game client has produced one. `load` is idempotent per player, which is
  // what stops a second consumer — or a navigation — asking again.
  useEffect(() => {
    if (player.vrpId !== null) load(player.vrpId);
  }, [player.vrpId]);

  return snapshot;
}
