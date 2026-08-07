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

import { useEffect, useRef, useSyncExternalStore } from "react";

import { getData, onGameData, type GameData } from "./userapp";

/** Who is playing, as much of it as any app has been found to need. */
export type Player = {
  /** Character name, as the server displays it. */
  name: string | null;
  /**
   * vRP `user_id` — the account behind the character, stable across reconnects
   * and renames. This is the key an app should store anything per-player
   * against; a name and a session id both move.
   */
  vrpId: number | null;
  /** Faction, if they are in one. */
  factionName: string | null;
  factionTag: string | null;
  /** Discord snowflake, with the client's `discord:` prefix removed. */
  discordId: string | null;
  /** Steam Hex Identifier with the steam: prefix removed */
  steamId: string | null;
  /** Source ID to show the players current session */
  sourceId: string | null;
  /**
   * In-game cash on hand, in dollars. Read-only: the protocol has no command
   * that moves it, so an app can report this figure and nothing more.
   */
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
  steamId: null,
  sourceId: null,
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
 * The cache itself, unread and untyped — everything the client has sent us this
 * session, whether or not this module knows what it means.
 *
 * `Player` above is this package's answer to "who is playing", and it is
 * deliberately eight fields out of the ~90 keys the docs list. This is the other
 * view: the raw pairs, for a panel that exists to show what the client is
 * actually saying. Nothing that renders a *feature* should read it — a feature
 * that wants a key should add it to `Player`, where it gets a name and a type,
 * rather than reaching into a bag of strings.
 */
export type GameDataSnapshot = {
  /** Current value per key, folded from every patch so far. */
  data: GameData;
  /**
   * When each key last *changed*, epoch milliseconds.
   *
   * Not when it last arrived. `getData` re-sends the whole cache, so stamping
   * on arrival would light up every row on every refresh and the one key that
   * actually moved would be invisible in the noise.
   */
  changedAt: Record<string, number>;
  /** When the last message landed at all, or `null` if none has. */
  at: number | null;
};

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
/** Same, for the raw view. */
const NO_DATA: GameDataSnapshot = { data: {}, changedAt: {}, at: null };
const NO_TRIGGERS: Readonly<Record<string, number>> = {};

/** Every trigger key carries it — `trigger_triangle`, `trigger_accept`. */
const TRIGGER_PREFIX = "trigger_";

let state: State = INITIAL;
/** The accumulated cache. Patches are folded in here, then read as a `Player`. */
let cache: GameData = {};
let changedAt: Record<string, number> = {};
/**
 * The raw view, rebuilt on every message.
 *
 * A fresh identity each time on purpose, `at` included: "nothing has changed
 * but the client is still talking" is exactly what a live panel needs to be
 * able to say, and it cannot say it from a snapshot that only moves when a
 * value does.
 */
let raw: GameDataSnapshot = NO_DATA;
/**
 * When each trigger last fired, by name with the prefix taken off.
 *
 * ── Why this is not simply read out of `raw` ──────────────────────────────
 * `raw` gains a new identity on every message, and in game the messages never
 * stop: position and camera keys alone move several times a second. Anything
 * subscribed to it re-renders at that rate, which is right for a panel whose
 * job is to show the stream and very wrong for the window frame — the root of
 * the whole app — which only wants to know that a key was pressed.
 *
 * So a narrow reading gets a narrow snapshot. This one changes identity when a
 * keybind fires and not otherwise, which is a handful of times a session.
 * ─────────────────────────────────────────────────────────────────────────
 */
let triggers: Readonly<Record<string, number>> = NO_TRIGGERS;
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
 * `steam:110000112345678` — under a key named for the type. Only the id is of
 * interest; the prefix is the key repeated.
 *
 * Two things the client is not consistent about, both handled here rather than
 * at each call site:
 *
 * - **Not everything is prefixed.** `source` is which slot on the server the
 *   player is sitting in, and it arrives bare — `280`, not `source:280`. A
 *   value with no colon in it is already the id.
 * - **Not everything is a string.** That same `source` arrives as a *number*,
 *   because that is how the client cached it. Reading it with `text` would
 *   drop it on the floor, and the field would sit empty forever with nothing
 *   to suggest why.
 *
 * The id is taken from after the *last* colon rather than the first, so a
 * prefix that ever gains a segment cannot start leaking into the value.
 * `lastIndexOf` returning -1 for an unprefixed value is what makes that one
 * expression cover both cases: `slice(0)` is the whole string.
 */
function identifier(key: string): string | null {
  const value = cache[key];

  const raw =
    typeof value === "string"
      ? value
      : // Not `String(value)` on anything: a boolean identifier is the client
        // sending something this function has no business guessing about.
        typeof value === "number" && Number.isFinite(value)
        ? String(value)
        : null;

  // As with `text`: an empty string is how the client says "none" — an account
  // with no Discord linked — rather than an id worth carrying around.
  if (raw === null || raw === "") return null;

  const id = raw.slice(raw.lastIndexOf(":") + 1);
  return id === "" ? null : id;
}

function read(): Player {
  return {
    name: text("name"),
    vrpId: number("user_id"),
    factionName: text("faction_name"),
    factionTag: text("faction_tag"),
    discordId: identifier("discord"),
    steamId: identifier("steam"),
    // Bare and numeric, unlike the two above it. `identifier` covers both.
    sourceId: identifier("source"),
    wallet: number("wallet"),
    bank: number("bank"),
  };
}

/**
 * Cheap enough to run on every patch, and it keeps the snapshot stable — a
 * player who has not moved keeps their identity, and nothing subscribed to it
 * re-renders.
 */
function changed(next: Player, previous: Player): boolean {
  return (Object.keys(next) as (keyof Player)[]).some((key) => next[key] !== previous[key]);
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
    const now = Date.now();

    // Folded key by key rather than spread wholesale, so a key that arrived
    // carrying the value it already had is not counted as a change. See
    // `changedAt`.
    const next = { ...cache };
    const stamps = { ...changedAt };
    let moved = false;
    /** Rebuilt only if a keybind actually fired, so the snapshot holds still. */
    let fired: Record<string, number> | null = null;

    for (const [key, value] of Object.entries(data)) {
      if (key in next && next[key] === value) continue;
      next[key] = value;
      stamps[key] = now;
      moved = true;

      // A trigger is the one thing in this stream that *happens* rather than
      // *is*: the value is the client's timer, so a second press of the same key
      // is a different number and lands here as a change. Which is exactly what
      // makes a press detectable at all.
      if (key.startsWith(TRIGGER_PREFIX)) {
        fired ??= { ...triggers };
        fired[key.slice(TRIGGER_PREFIX.length)] = now;
      }
    }

    if (moved) {
      cache = next;
      changedAt = stamps;
    }
    if (fired) triggers = fired;

    raw = { data: cache, changedAt, at: now };

    // Deliberately not one-way. A client that answers late — or answers a
    // `getData` sent by the refresh button — is a client that is there, so
    // `absent` is a current best guess rather than a verdict.
    clearTimeout(giveUp);

    // Every message proves a client is there, even one carrying keys this
    // module does not read — so the connection can settle without the player
    // themself changing at all.
    const player = read();
    if (state.connection !== "connected" || changed(player, state.player)) {
      state = { connection: "connected", player };
    }

    // Unconditional, because `raw` has moved even when nothing else has. The
    // `state` snapshot above keeps its identity when the player is unchanged,
    // so `usePlayer` consumers bail out of this without re-rendering.
    emit();
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

/**
 * The cache as it stands, keys and all.
 *
 * For the admin panel and nothing else — see `GameDataSnapshot`. It shares the
 * subscription with `usePlayer`, so opening the panel starts no second listener
 * and asks the client for nothing it was not already being sent.
 */
export function useGameData(): GameDataSnapshot {
  return useSyncExternalStore(
    subscribe,
    () => raw,
    () => NO_DATA,
  );
}

/**
 * Run something when the player presses one of the game's bindable keys.
 *
 * Triggers arrive as ordinary data — key `trigger_[name]`, value the client's
 * timer in milliseconds — so a *press* is a value that changed rather than a
 * message of its own. That is what this watches. The four built-in binds are
 * `square`, `triangle`, `circle` and `cross`; anything else has to be
 * registered first with `registerTrigger` (./userapp.ts).
 *
 * Two things follow from triggers being data, and both are handled here:
 *
 * - **The first sighting is not a press.** The store may already be holding a
 *   trigger from before this mounted, and firing on it would mean a key pressed
 *   ten minutes ago acts the moment a component appears.
 * - **The key is never cached** (the docs are explicit), so it cannot be asked
 *   for with `getData` and will not reappear after a refresh. Nothing here
 *   needs to allow for that; it just means the value only ever moves forwards.
 *
 * `onFire` is read through a ref, so a handler written inline at the call site
 * does not re-arm the watch on every render.
 */
export function useTrigger(name: string, onFire: () => void): void {
  const fired = useSyncExternalStore(
    subscribe,
    () => triggers,
    () => NO_TRIGGERS,
  );

  const handler = useRef(onFire);
  /** The press already acted on. `null` until the first sighting. */
  const seen = useRef<number | null>(null);

  useEffect(() => {
    handler.current = onFire;
  }, [onFire]);

  useEffect(() => {
    const at = fired[name];
    if (at === undefined) return;

    if (seen.current === null || at === seen.current) {
      seen.current = at;
      return;
    }

    seen.current = at;
    handler.current();
  }, [fired, name]);
}

