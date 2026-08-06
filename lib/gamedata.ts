"use client";

/**
 * The player, as the game client describes them.
 *
 * `onGameData` hands over raw key/value pairs, and only the ones that just
 * *changed* — there is no message that means "here is the player". This module
 * is the difference: it accumulates those patches into a cache, asks for the
 * full set once on startup, and reads a typed player out of the result.
 *
 * Every field is nullable and stays that way. The app is a web page, and a web
 * page can be opened outside the game — in a browser tab while developing, or
 * in a client that has not sent anything yet. There is no arrangement of
 * loading states that makes a name appear in those cases, so "we do not know"
 * is a value the UI has to render rather than a moment it can wait out.
 *
 * Key names come from the data table at https://ttycoon.eu/userapps/docs.
 */

import { useSyncExternalStore } from "react";

import { getData, onGameData, type GameData } from "./userapp";

/** What the settings page and the shelf need to know about who is playing. */
export type Player = {
  /** Character name, as the server displays it. */
  name: string | null;
  /**
   * vRP `user_id` — the account behind the character, stable across reconnects
   * and renames. This is the key ttGamba stores chips against.
   */
  vrpId: number | null;
  /** Faction, if they are in one. */
  factionName: string | null;
  factionTag: string | null;
  /** Discord snowflake, with the client's `discord:` prefix removed. */
  discordId: string | null;
  /** Cfx.re account id, from the `fivem:` player identifier. */
  cfxId: string | null;
  /** In-game cash on hand, in dollars. Not chips — see PRODUCT.md. */
  wallet: number | null;
  /** In-game bank balance, in dollars. */
  bank: number | null;
};

const NO_PLAYER: Player = {
  name: null,
  vrpId: null,
  factionName: null,
  factionTag: null,
  discordId: null,
  cfxId: null,
  wallet: null,
  bank: null,
};

/**
 * Whether the game client is there.
 *
 * The distinction that matters is between "not yet" and "not at all", and
 * nothing in the protocol draws it: silence is what both look like. So the
 * only way to tell them apart is to ask and wait — `waiting` is that wait, and
 * it is why the app cannot simply treat the absence of data as absence of a
 * game. Getting this wrong means every in-game load flashes an error before
 * the client has had a chance to answer.
 */
export type Connection = "waiting" | "connected" | "absent";

type State = { connection: Connection; player: Player };

/**
 * How long the client gets to answer `getData` before we call it: a local
 * `postMessage` round trip, so in practice this is decided in a frame or two.
 * The generosity is all downside-weighted — an extra second of blank frame
 * costs a player nothing, and telling a player who *is* in game that they are
 * not sends them off to fix a problem they do not have.
 */
const CLIENT_TIMEOUT = 2000;

/** Referentially stable — `useSyncExternalStore` compares snapshots by identity. */
const INITIAL: State = { connection: "waiting", player: NO_PLAYER };

let state: State = INITIAL;
/** The accumulated cache. Patches are folded in here, then read as a `Player`. */
let cache: GameData = {};
let hydrated = false;
const listeners = new Set<() => void>();

function text(key: string): string | null {
  const value = cache[key];
  // Empty strings are how the client says "none" for faction and identifier
  // keys, so they are absence rather than a name worth printing.
  return typeof value === "string" && value !== "" ? value : null;
}

function number(key: string): number | null {
  const value = cache[key];
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  // Numbers sometimes arrive as strings depending on how the client cached
  // them, so a numeric string is taken at face value rather than dropped.
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/**
 * Player identifiers arrive in their raw FiveM form — `discord:1234567890`,
 * `fivem:987654` — under a key named for the type. Only the id is of interest;
 * the prefix is the key repeated.
 */
function identifier(key: string): string | null {
  const raw = text(key);
  if (!raw) return null;
  const separator = raw.indexOf(":");
  const id = separator === -1 ? raw : raw.slice(separator + 1);
  return id === "" ? null : id;
}

function read(): Player {
  return {
    name: text("name"),
    vrpId: number("user_id"),
    factionName: text("faction_name"),
    factionTag: text("faction_tag"),
    discordId: identifier("discord"),
    cfxId: identifier("fivem"),
    wallet: number("wallet"),
    bank: number("bank"),
  };
}

/** Cheap enough to run on every patch, and it keeps the snapshot stable. */
function changed(next: Player, previous: Player): boolean {
  return (Object.keys(next) as (keyof Player)[]).some(
    (key) => next[key] !== previous[key],
  );
}

function emit() {
  for (const listener of listeners) listener();
}

function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;

  const giveUp = setTimeout(() => {
    if (state.connection === "waiting") {
      state = { ...state, connection: "absent" };
      emit();
    }
  }, CLIENT_TIMEOUT);

  onGameData((data) => {
    cache = { ...cache, ...data };

    // Deliberately not one-way. A client that answers late — or answers a
    // `getData` sent by the refresh button — is a client that is there, so
    // `absent` is a current best guess rather than a verdict.
    clearTimeout(giveUp);

    const player = read();
    // Every message proves a client is there, even one carrying keys this
    // module does not read — so the connection can settle without the player
    // themself changing at all.
    if (state.connection !== "connected" || changed(player, state.player)) {
      state = { connection: "connected", player };
      emit();
    }
  });

  // The client volunteers changes only, so without this an app opened
  // mid-session would sit empty until the player happened to move or earn
  // something. This asks for the cache it already holds.
  getData();
}

function subscribe(listener: () => void) {
  hydrate();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * The current player, and whether the game client is talking to us.
 *
 * Hydration is deferred to `subscribe`, which React calls after mount, so the
 * first client render matches the server's — both see `waiting` — and the
 * player arrives as an ordinary update rather than a hydration mismatch.
 */
export function usePlayer(): State {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => INITIAL,
  );
}
