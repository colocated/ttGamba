"use client";

/**
 * ttGamba's persisted preferences.
 *
 * The machinery is `createSettingsStore` (`@tt/userapp/settings`): two stores,
 * the game client's cache and `localStorage`, with a timestamp guard so a late
 * reply cannot undo a change the player just made.
 *
 * What is here is the shape — the window's geometry from `@tt/window` plus this
 * app's own preference. One store and one key: the window writes to it on every
 * pointer move while being dragged, and a second store would double that.
 */

import { createSettingsStore, present, readBoolean } from "@tt/userapp/settings";
import {
  DEFAULT_WINDOW_SETTINGS,
  field,
  sanitiseWindowSettings,
  type WindowSettings,
} from "@tt/window";

import { SETTINGS_KEY } from "./keys";

export type Settings = WindowSettings & {
  /** Is the game shelf held open? */
  shelfPinned: boolean;
};

export const DEFAULT_SETTINGS: Settings = {
  ...DEFAULT_WINDOW_SETTINGS,
  shelfPinned: false,
};

const store = createSettingsStore<Settings>({
  key: SETTINGS_KEY,
  defaults: DEFAULT_SETTINGS,
  /*
    The window's half first, then ours. Both drop anything that is not the
    shape they expect: these values feed layout arithmetic, and a string where
    a number belongs would propagate as `NaN` through the window geometry
    rather than failing where it was read.
  */
  sanitise: (value) => ({
    ...sanitiseWindowSettings(value),
    ...present<Settings>({ shelfPinned: readBoolean(field(value, "shelfPinned")) }),
  }),
});

/** The settings, an updater, and whether stored settings have been read yet. */
export const useSettings = store.useSettings;
/** Update one or more settings. Persistence is debounced; state is not. */
export const updateSettings = store.update;
/** Force any pending write out now, e.g. before reloading the app. */
export const flushSettings = store.flush;
