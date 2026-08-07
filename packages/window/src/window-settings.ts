/**
 * The settings the window needs remembered — exported as parts for an app to
 * fold into its own store, not as a store of its own.
 *
 * A separate window store would mean two keys, two debounce timers, two copies
 * of the late-reply race guard, and two writes at the game client per pointer
 * move while a window is dragged. So an app composes one store:
 *
 * ```ts
 * const store = createSettingsStore<Settings>({
 *   key: "ttgamba_settings",
 *   defaults: { ...DEFAULT_WINDOW_SETTINGS, shelfPinned: false },
 *   sanitise: (value) => ({
 *     ...sanitiseWindowSettings(value),
 *     ...present<Settings>({ shelfPinned: readBoolean(field(value, "shelfPinned")) }),
 *   }),
 * });
 * ```
 *
 * `Tablet` is handed `store.useSettings`, and the app's own settings ride along
 * in the same snapshot.
 */

import { present, readNullableNumber, readNumber } from "@tt/userapp/settings";

export type WindowSettings = {
  /** Requested window width in px. The frame clamps it to the viewport. */
  windowWidth: number;
  /** Window top-left. `null` means "never moved" — the frame centres it. */
  windowX: number | null;
  windowY: number | null;
};

/**
 * Defaults are preferences and live here; the constraints they are clamped
 * against (min/max width, aspect) belong to the frame that enforces them, and
 * are `WindowFrameOptions`.
 */
export const DEFAULT_WINDOW_SETTINGS: WindowSettings = {
  windowWidth: 1120,
  windowX: null,
  windowY: null,
};

/** Read one field off unparsed JSON without asserting anything about the rest. */
export function field(value: unknown, name: string): unknown {
  return value && typeof value === "object" ? (value as Record<string, unknown>)[name] : undefined;
}

/**
 * The window's half of an app's `sanitise`. Spread it, then spread the app's
 * own fields after it.
 */
export function sanitiseWindowSettings(value: unknown): Partial<WindowSettings> {
  return present<WindowSettings>({
    windowWidth: readNumber(field(value, "windowWidth")),
    windowX: readNullableNumber(field(value, "windowX")),
    windowY: readNullableNumber(field(value, "windowY")),
  });
}
