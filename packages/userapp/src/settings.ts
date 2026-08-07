"use client";

/**
 * Persisted preferences for a user app.
 *
 * Two stores, because neither one alone covers the app's life:
 *
 * - The game client's data cache, written with `shareLocalData` and read back
 *   as `local_[key]`. This is the shared copy — every tab of the same app
 *   loaded in the client sees the same value, and it survives the app being
 *   reloaded or reopened. It is the client's memory though, so it goes when
 *   the game session does.
 * - `localStorage`, which is ours alone but is durable and — the reason it is
 *   the one we read on startup — synchronous. Waiting on the client's reply
 *   would mean a visible flash of the default window size on every load.
 *
 * Writes go to both. Reads prefer whatever arrives last, which is the client's
 * copy, so a second tab changing a setting wins over our stale local mirror.
 *
 * Called **once per app**, with every setting that app has — including the
 * window geometry from `@tt/window`, folded in via `sanitiseWindowSettings`. A
 * store per concern would mean two keys, two debounce timers and two copies of
 * the race guard below, to save writing one `sanitise` function.
 */

import { useSyncExternalStore } from "react";

import { getNamedData, onGameData, shareLocalData } from "./userapp";

/**
 * Settings are stored stamped with the time they were written.
 *
 * Without it, startup is a race: we ask the client for its cached copy, and
 * its reply lands whenever it lands. Anything the player changed in the
 * meantime — clicking a toggle the moment the window appears — was overwritten
 * by the older value arriving late, which read as the button simply not
 * working. Now a copy is only adopted if it is genuinely newer than the last
 * change made here, so a late reply loses to a live click.
 *
 * Every writer is a tab of the same app in the same client on one machine, so
 * the timestamps are all from the same clock and directly comparable.
 */
type Stored<T> = { t: number; v: T };

/**
 * `ready` is false until stored settings have been read. The server renders
 * that state, and so does the client's first render, so the two agree; the
 * window uses it to hold off on committing geometry it would have to correct a
 * moment later.
 */
export type SettingsState<T> = { ready: boolean; settings: T };

export type SettingsStore<T> = {
  /** The settings, an updater, and whether stored settings have been read yet. */
  useSettings(): { settings: T; update: (patch: Partial<T>) => void; ready: boolean };
  /** Update one or more settings. Persistence is debounced; state is not. */
  update(patch: Partial<T>): void;
  /** Force any pending write out now. */
  flush(): void;
};

/**
 * Dragging and resizing update settings on every pointer move. State applies
 * immediately; the writes behind it coalesce so we aren't posting a message at
 * the game client every frame.
 */
const PERSIST_DELAY = 250;

export function createSettingsStore<T extends object>({
  key,
  defaults,
  sanitise,
  persistDelay = PERSIST_DELAY,
}: {
  /** Our key in the client's `local_` namespace, and in `localStorage`. */
  key: string;
  defaults: T;
  /**
   * Drop anything that isn't the shape we expect. These values feed layout
   * arithmetic, and a string where a number belongs would propagate as `NaN`
   * through the window geometry rather than failing where it was read.
   */
  sanitise: (value: unknown) => Partial<T>;
  persistDelay?: number;
}): SettingsStore<T> {
  /** The same value is echoed back under this prefixed key. See the docs. */
  const cacheKey = `local_${key}`;

  /** Referentially stable — `useSyncExternalStore` compares snapshots by identity. */
  const INITIAL: SettingsState<T> = { ready: false, settings: defaults };

  let state: SettingsState<T> = INITIAL;
  let hydrated = false;
  let persistTimer: ReturnType<typeof setTimeout> | undefined;
  /** When the settings we hold were authored. See `Stored`. */
  let writtenAt = 0;
  const listeners = new Set<() => void>();

  function emit() {
    for (const listener of listeners) listener();
  }

  function parse(raw: string | null): { at: number; patch: Partial<T> } {
    if (!raw) return { at: 0, patch: {} };
    try {
      const value: unknown = JSON.parse(raw);
      if (value && typeof value === "object" && "v" in value) {
        const stored = value as Partial<Stored<T>>;
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
  function apply(patch: Partial<T>): boolean {
    const next = { ...state.settings, ...patch };
    const changed = (Object.keys(next) as (keyof T)[]).some(
      (field) => next[field] !== state.settings[field],
    );
    if (!changed) return false;

    state = { ...state, settings: next };
    emit();
    return true;
  }

  function writeNow() {
    clearTimeout(persistTimer);
    persistTimer = undefined;

    const serialised = JSON.stringify({ t: writtenAt, v: state.settings } satisfies Stored<T>);
    // The client is the shared store; localStorage is the durable mirror.
    shareLocalData(key, serialised);
    try {
      window.localStorage.setItem(key, serialised);
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
    let patch: Partial<T> = {};
    try {
      const local = parse(window.localStorage.getItem(key));
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
      const raw = data[cacheKey];
      if (typeof raw !== "string") return;

      // Older than what we hold: either our own echo coming back, or the copy
      // the client had cached before this session changed anything. Both would
      // undo a change the player just made.
      const incoming = parse(raw);
      if (incoming.at <= writtenAt) return;

      writtenAt = incoming.at;
      apply(incoming.patch);
    });
    getNamedData(cacheKey);

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

  function update(patch: Partial<T>) {
    if (!apply(patch)) return;
    // Stamped now, not at write time, so a change made during the debounce still
    // outranks a cached copy that arrives before the write goes out.
    writtenAt = Date.now();
    clearTimeout(persistTimer);
    persistTimer = setTimeout(writeNow, persistDelay);
  }

  function flush() {
    if (persistTimer !== undefined) writeNow();
  }

  function useSettings() {
    // Hydration is deferred to `subscribe`, which React calls after mount, so
    // the first client render matches the server's and settings land as an
    // ordinary update rather than a hydration mismatch.
    const { settings, ready } = useSyncExternalStore(
      subscribe,
      () => state,
      () => INITIAL,
    );

    return { settings, update, ready };
  }

  return { useSettings, update, flush };
}

// Sanitiser helpers. A `sanitise` function is per-app boilerplate over stored
// JSON, and these are the three checks every one of them ends up writing.

/** A finite number, or nothing. */
export function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/**
 * A finite number or an explicit `null`, or nothing.
 *
 * The distinction matters for anything where `null` is a *value* rather than an
 * absence — a window position of `null` means "never moved", which is what tells
 * the frame to centre itself.
 */
export function readNullableNumber(value: unknown): number | null | undefined {
  if (value === null) return null;
  return readNumber(value);
}

/** A boolean, or nothing. */
export function readBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

/**
 * Drop the `undefined`s a run of the readers above leaves behind, so the result
 * is a patch that only mentions fields that were actually present. Spreading one
 * with `undefined` values in it would overwrite good defaults with nothing.
 */
export function present<T extends object>(fields: {
  [K in keyof T]?: T[K] | undefined;
}): Partial<T> {
  const clean: Partial<T> = {};
  for (const [field, value] of Object.entries(fields) as [keyof T, T[keyof T]][]) {
    if (value !== undefined) clean[field] = value;
  }
  return clean;
}
