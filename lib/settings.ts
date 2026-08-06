"use client";

/**
 * Persisted app preferences.
 *
 * Two stores, because neither one alone covers the app's life:
 *
 * - The game client's data cache, written with `shareLocalData` and read back
 *   as `local_ttgamba_settings`. This is the shared copy — every ttGamba tab
 *   loaded in the client sees the same value, and it survives the app being
 *   reloaded or reopened. It is the client's memory though, so it goes when
 *   the game session does.
 * - `localStorage`, which is ours alone but is durable and — the reason it is
 *   the one we read on startup — synchronous. Waiting on the client's reply
 *   would mean a visible flash of the default window size on every load.
 *
 * Writes go to both. Reads prefer whatever arrives last, which is the client's
 * copy, so a second tab changing a setting wins over our stale local mirror.
 */

import { useSyncExternalStore } from "react";

import { SETTINGS_KEY } from "./bootstrap";
import { getNamedData, onGameData, shareLocalData } from "./userapp";

export type Settings = {
  /** Requested window width in px. The tablet clamps it to the viewport. */
  windowWidth: number;
  /** Window top-left. `null` means "never moved" — the tablet centres it. */
  windowX: number | null;
  windowY: number | null;
  /** Is the game shelf held open? */
  shelfPinned: boolean;
};

/**
 * Defaults are preferences and live here; the constraints they are clamped
 * against (min/max width, aspect) belong to the tablet that enforces them.
 */
export const DEFAULT_SETTINGS: Settings = {
  windowWidth: 1120,
  windowX: null,
  windowY: null,
  shelfPinned: false,
};

/** The same value is echoed back under this prefixed key. See the docs. */
const CACHE_KEY = `local_${SETTINGS_KEY}`;

/**
 * Settings are stored stamped with the time they were written.
 *
 * Without it, startup is a race: we ask the client for its cached copy, and
 * its reply lands whenever it lands. Anything the player changed in the
 * meantime — clicking the shelf pin the moment the window appears — was
 * overwritten by the older value arriving late, which read as the button
 * simply not working. Now a copy is only adopted if it is genuinely newer
 * than the last change made here, so a late reply loses to a live click.
 *
 * Every writer is a ttGamba tab in the same client on one machine, so the
 * timestamps are all from the same clock and directly comparable.
 */
type Stored = { t: number; v: Settings };

/**
 * Dragging and resizing update settings on every pointer move. State applies
 * immediately; the writes behind it coalesce so we aren't posting a message at
 * the game client every frame.
 */
const PERSIST_DELAY = 250;

/**
 * `ready` is false until stored settings have been read. The server renders
 * that state, and so does the client's first render, so the two agree; the
 * tablet uses it to hold off on committing geometry it would have to correct
 * a moment later.
 */
type State = { ready: boolean; settings: Settings };

/** Referentially stable — `useSyncExternalStore` compares snapshots by identity. */
const INITIAL: State = { ready: false, settings: DEFAULT_SETTINGS };

let state: State = INITIAL;
let hydrated = false;
let persistTimer: ReturnType<typeof setTimeout> | undefined;
/** When the settings we hold were authored. See `Stored`. */
let writtenAt = 0;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

/**
 * Ignore anything that isn't the shape we expect. These values feed layout
 * arithmetic, and a string where a number belongs would propagate as `NaN`
 * through the window geometry rather than failing where it was read.
 */
function sanitise(value: unknown): Partial<Settings> {
  if (!value || typeof value !== "object") return {};
  const raw = value as Record<string, unknown>;
  const clean: Partial<Settings> = {};

  if (typeof raw.windowWidth === "number" && Number.isFinite(raw.windowWidth)) {
    clean.windowWidth = raw.windowWidth;
  }
  if (raw.windowX === null || (typeof raw.windowX === "number" && Number.isFinite(raw.windowX))) {
    clean.windowX = raw.windowX as number | null;
  }
  if (raw.windowY === null || (typeof raw.windowY === "number" && Number.isFinite(raw.windowY))) {
    clean.windowY = raw.windowY as number | null;
  }
  if (typeof raw.shelfPinned === "boolean") {
    clean.shelfPinned = raw.shelfPinned;
  }

  return clean;
}

function parse(raw: string | null): { at: number; patch: Partial<Settings> } {
  if (!raw) return { at: 0, patch: {} };
  try {
    const value: unknown = JSON.parse(raw);
    if (value && typeof value === "object" && "v" in value) {
      const stored = value as Partial<Stored>;
      return {
        at: typeof stored.t === "number" ? stored.t : 0,
        patch: sanitise(stored.v),
      };
    }
    // An unstamped payload — written before settings carried a time. Treat it
    // as the oldest thing there is, so anything current beats it.
    return { at: 0, patch: sanitise(value) };
  } catch {
    return { at: 0, patch: {} };
  }
}

/** Fold a patch into the snapshot. Returns whether anything actually moved. */
function apply(patch: Partial<Settings>): boolean {
  const next = { ...state.settings, ...patch };
  const changed = (Object.keys(next) as (keyof Settings)[]).some(
    (key) => next[key] !== state.settings[key],
  );
  if (!changed) return false;

  state = { ...state, settings: next };
  emit();
  return true;
}

function writeNow() {
  clearTimeout(persistTimer);
  persistTimer = undefined;

  const serialised = JSON.stringify({ t: writtenAt, v: state.settings } satisfies Stored);
  // The client is the shared store; localStorage is the durable mirror.
  shareLocalData(SETTINGS_KEY, serialised);
  try {
    window.localStorage.setItem(SETTINGS_KEY, serialised);
  } catch {
    // Private mode, or a client with storage disabled. The client's copy still
    // carries settings across a reload, so this is not worth surfacing.
  }
}

function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;

  // Stored settings and `ready` land in one transition, so the first render
  // that shows real geometry is also the first render that trusts it. Applying
  // them separately would put a default-sized frame on screen in between —
  // exactly the snap this avoids.
  let patch: Partial<Settings> = {};
  try {
    const local = parse(window.localStorage.getItem(SETTINGS_KEY));
    writtenAt = local.at;
    patch = local.patch;
  } catch {
    // As above — an unreadable store just means we start from defaults.
  }
  state = { ready: true, settings: { ...state.settings, ...patch } };
  emit();

  // Applying what the client sends never writes back, so the echo of our own
  // `shareLocalData` settles rather than looping.
  onGameData((data) => {
    const raw = data[CACHE_KEY];
    if (typeof raw !== "string") return;

    // Older than what we hold: either our own echo coming back, or the copy
    // the client had cached before this session changed anything. Both would
    // undo a change the player just made.
    const incoming = parse(raw);
    if (incoming.at <= writtenAt) return;

    writtenAt = incoming.at;
    apply(incoming.patch);
  });
  getNamedData(CACHE_KEY);

  // A pending write must not be lost to the reload button.
  window.addEventListener("pagehide", () => {
    if (persistTimer !== undefined) writeNow();
  });
}

function subscribe(listener: () => void) {
  hydrate();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Update one or more settings. Persistence is debounced; state is not. */
export function updateSettings(patch: Partial<Settings>) {
  if (!apply(patch)) return;
  // Stamped now, not at write time, so a change made during the debounce still
  // outranks a cached copy that arrives before the write goes out.
  writtenAt = Date.now();
  clearTimeout(persistTimer);
  persistTimer = setTimeout(writeNow, PERSIST_DELAY);
}

/** Force any pending write out now, e.g. before reloading the app. */
export function flushSettings() {
  if (persistTimer !== undefined) writeNow();
}

/**
 * Returns the settings, an updater, and whether stored settings have been read
 * yet. Until `ready`, treat the values as placeholders.
 */
export function useSettings(): {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  ready: boolean;
} {
  // Hydration is deferred to `subscribe`, which React calls after mount, so
  // the first client render matches the server's and settings land as an
  // ordinary update rather than a hydration mismatch.
  const { settings, ready } = useSyncExternalStore(
    subscribe,
    () => state,
    () => INITIAL,
  );

  return { settings, update: updateSettings, ready };
}
