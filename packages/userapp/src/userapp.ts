/**
 * Transport Tycoon user app bridge.
 *
 * A user app runs in an iframe over the game client, and the only way to talk
 * to the client is to post a message at the parent frame.
 *
 * The action list mirrors the command table at https://ttycoon.eu/userapps/docs
 * (readme.md, updated April 16th 2025).
 */

export type UserAppAction =
  // Focus and visibility
  /** Hand input back to the game, leaving the app open behind it. */
  | { type: "pin" }
  /** Hand input back to the game and hide the app. */
  | { type: "close" }
  // On-screen messaging
  | { type: "notification"; text: string }
  | { type: "popup"; title: string; text: string }
  | { type: "oneliner"; text: string }
  | { type: "message"; text: string }
  /** Lingering bottom-right message. `time` is in seconds. */
  | { type: "info"; text: string; time: number }
  // Game control
  | { type: "setWaypoint"; x: number; y: number }
  | { type: "sendCommand"; command: string }
  | { type: "sfx"; sfx: number }
  // Data cache
  /** Ask the client to re-send its entire data cache. */
  | { type: "getData" }
  /** Ask the client for specific cache keys only. */
  | { type: "getNamedData"; keys: string[] }
  // Shared data
  /** Shared with every app on this client, read back as `local_[key]`. */
  | { type: "shareLocalData"; key: string; value: string }
  /** Shared with every player on the server, read back as `players_[key]`. */
  | { type: "shareServerData"; key: string; value: string }
  // Map blips
  | { type: "addBlip"; id: string; x: number; y: number }
  | { type: "removeBlip"; id: string }
  | { type: "setBlipPosition"; id: string; x: number; y: number }
  | { type: "setBlipSprite"; id: string; sprite: number }
  | { type: "setBlipColour"; id: string; color: number }
  | { type: "setBlipAsShortRange"; id: string; alwaysVisible: boolean }
  | { type: "setBlipRoute"; id: string; route: boolean }
  | { type: "showTickOnBlip"; id: string; ticked: boolean }
  | { type: "showNumberOnBlip"; id: string; number: number }
  | { type: "setBlipName"; id: string; name: string }
  | ({ type: "buildBlip"; id: string; x: number; y: number } & BlipOptions)
  // vRP HUD
  /** Named vRP divs include `money`, `bmoney`, `job`, `mission`, `additional_css`. */
  | { type: "setDivCss"; div: string; css: string }
  | { type: "setDivContent"; div: string; content: string }
  // vRP menus and prompts
  /** `mod` is -1 for left arrow, 0 for enter, 1 for right arrow. */
  | { type: "forceMenuChoice"; choice: string; mod: number }
  | { type: "forceMenuBack" }
  | { type: "forceSubmitValue"; value: string }
  | { type: "forceRequestResult"; result: boolean }
  | { type: "openMainMenu" }
  // Keybinds
  /** Registers a bindable key, which sends back `trigger_[trigger]` as data. */
  | { type: "registerTrigger"; trigger: string; name: string };

/** Everything `buildBlip` can set beyond a position. */
export type BlipOptions = {
  /** FiveM blip sprite number. */
  sprite?: number;
  /** FiveM blip colour number. */
  color?: number;
  alwaysVisible?: boolean;
  route?: boolean;
  ticked?: boolean;
  name?: string;
};

/**
 * The curated sound effects the client will play, keyed by the names the docs
 * use. Indexes are the game's, not ours — do not renumber.
 *
 * ── Why the casing is a mess, and stays a mess ────────────────────────────
 * `Bed`, `ScreenFlash`, `On_Call_Player_Join` and `Out_Of_Bounds_Timer` break
 * the pattern the other thirteen follow, and they are copied that way on
 * purpose. These are not names this project chose: they are GTA's own audio
 * references, transcribed by the docs, and the only thing anyone does with one
 * is paste it into a search somewhere else. Tidied into SCREAMING_SNAKE they
 * stop matching what they name, and the table stops being a copy of anything.
 *
 * Verified against <https://ttycoon.eu/userapps/docs> (readme.md, updated
 * April 16th 2025) on 6 August 2026: 17 effects, indexes 1–17, unchanged.
 * ─────────────────────────────────────────────────────────────────────────
 */
export const SFX = {
  CHECKPOINT_MISSED: 1,
  FLIGHT_SCHOOL_LESSON_PASSED: 2,
  TIMER_STOP: 3,
  Bed: 4,
  MEDAL_UP: 5,
  CHALLENGE_UNLOCKED: 6,
  ScreenFlash: 7,
  On_Call_Player_Join: 8,
  Out_Of_Bounds_Timer: 9,
  ROUND_ENDING_STINGER_CUSTOM: 10,
  DELETE: 11,
  OTHER_TEXT: 12,
  GOLF_NEW_RECORD: 13,
  GOLF_BIRDIE: 14,
  GOLF_EAGLE: 15,
  MP_RANK_UP: 16,
  MP_WAVE_COMPLETE: 17,
} as const;

export type SfxName = keyof typeof SFX;

/**
 * `"*"` is deliberate: the game client is the parent frame and does not
 * advertise a stable origin to target.
 */
export function sendAction(action: UserAppAction) {
  if (typeof window === "undefined") return;
  window.parent.postMessage(action, "*");
}

// Inbound

/**
 * Key/value pairs the client pushes at us. The docs list ~90 possible keys —
 * `wallet`, `user_id`, `focused`, `local_[key]`, `trigger_[key]` and so on.
 */
export type GameData = Record<string, string | number | boolean>;

/**
 * Listen for data from the game client. Returns an unsubscribe function.
 *
 * The client only sends keys that *changed*, so a handler cannot assume any
 * given key is present — call `getData` or `getNamedData` to be sent current
 * values on demand.
 */
export function onGameData(handler: (data: GameData) => void) {
  if (typeof window === "undefined") return () => {};

  const listener = (event: MessageEvent) => {
    // The client wraps its payload in a `data` property. Anything else on the
    // message bus (dev tooling, other frames) is not ours.
    const payload: unknown = event.data;
    if (!payload || typeof payload !== "object") return;
    const data = (payload as { data?: unknown }).data;
    if (data && typeof data === "object") handler(data as GameData);
  };

  window.addEventListener("message", listener);
  return () => window.removeEventListener("message", listener);
}

// Focus and visibility

/** Give control back to the game without closing the app. */
export function pin() {
  sendAction({ type: "pin" });
}

/**
 * Give control back to the game and hide the app. Named `closeApp` rather than
 * `close` so a missing import falls over instead of silently hitting
 * `window.close`.
 */
export function closeApp() {
  sendAction({ type: "close" });
}

// On-screen messaging

/** Notification over the map. */
export function notify(text: string) {
  sendAction({ type: "notification", text });
}

/** Full-screen title and body. */
export function popup(title: string, text: string) {
  sendAction({ type: "popup", title, text });
}

/** Black mid-screen box. */
export function oneliner(text: string) {
  sendAction({ type: "oneliner", text });
}

/** Mid-screen text, no box. */
export function message(text: string) {
  sendAction({ type: "message", text });
}

/** Lingering bottom-right message, `seconds` long. */
export function info(text: string, seconds: number) {
  sendAction({ type: "info", text, time: seconds });
}

// Game control

/** Drop the in-game waypoint on map coordinates. */
export function setWaypoint(x: number, y: number) {
  sendAction({ type: "setWaypoint", x, y });
}

/** Run a console command as if the player typed it. */
export function sendCommand(command: string) {
  sendAction({ type: "sendCommand", command });
}

/** Play one of the curated sound effects, by name or raw index. */
export function playSfx(sfx: SfxName | number) {
  sendAction({ type: "sfx", sfx: typeof sfx === "number" ? sfx : SFX[sfx] });
}

// Data cache

/** Ask for the whole cache to be re-sent. */
export function getData() {
  sendAction({ type: "getData" });
}

/**
 * Ask for specific cache keys. `temp_`, `trigger_` and `chest_` keys are never
 * cached, so they cannot be requested this way.
 */
export function getNamedData(...keys: string[]) {
  sendAction({ type: "getNamedData", keys });
}

// Shared data

/** Share with the other apps on this client; read back as `local_[key]`. */
export function shareLocalData(key: string, value: string) {
  sendAction({ type: "shareLocalData", key, value });
}

/**
 * Share with every player on the server; read back as `players_[key]`, a JSON
 * map of server id to `[value, serverTime]`. Entries expire after 2 minutes,
 * so anything meant to persist has to be re-sent. An empty `value` removes
 * this player's entry.
 */
export function shareServerData(key: string, value: string) {
  sendAction({ type: "shareServerData", key, value });
}

// Map blips

/** Create a blip and apply any options in one go. */
export function buildBlip(
  id: string,
  x: number,
  y: number,
  options: BlipOptions = {},
) {
  sendAction({ type: "buildBlip", id, x, y, ...options });
}

/** Create a bare blip. `buildBlip` is usually the one you want. */
export function addBlip(id: string, x: number, y: number) {
  sendAction({ type: "addBlip", id, x, y });
}

export function removeBlip(id: string) {
  sendAction({ type: "removeBlip", id });
}

export function setBlipPosition(id: string, x: number, y: number) {
  sendAction({ type: "setBlipPosition", id, x, y });
}

/** Sprite numbers come from the FiveM blip docs. */
export function setBlipSprite(id: string, sprite: number) {
  sendAction({ type: "setBlipSprite", id, sprite });
}

/** Colour numbers come from the FiveM blip docs. */
export function setBlipColour(id: string, color: number) {
  sendAction({ type: "setBlipColour", id, color });
}

/** Keep the blip on the radar even when the player is far from it. */
export function setBlipAsShortRange(id: string, alwaysVisible: boolean) {
  sendAction({ type: "setBlipAsShortRange", id, alwaysVisible });
}

/** Draw a route to the blip with the in-game GPS. */
export function setBlipRoute(id: string, route: boolean) {
  sendAction({ type: "setBlipRoute", id, route });
}

/** Overlay a checkmark on the blip. */
export function showTickOnBlip(id: string, ticked: boolean) {
  sendAction({ type: "showTickOnBlip", id, ticked });
}

/** Put a number in the middle of the blip. */
export function showNumberOnBlip(id: string, number: number) {
  sendAction({ type: "showNumberOnBlip", id, number });
}

/** Name the blip in the map legend. */
export function setBlipName(id: string, name: string) {
  sendAction({ type: "setBlipName", id, name });
}

// vRP HUD

/** Style a named vRP div, e.g. `money`, `bmoney`, `job`, `mission`. */
export function setDivCss(div: string, css: string) {
  sendAction({ type: "setDivCss", div, css });
}

/** Replace the contents of a named vRP div. */
export function setDivContent(div: string, content: string) {
  sendAction({ type: "setDivContent", div, content });
}

// vRP menus and prompts

/** Submit a menu choice. `mod` is -1 for left, 0 for enter, 1 for right. */
export function forceMenuChoice(choice: string, mod: number = 0) {
  sendAction({ type: "forceMenuChoice", choice, mod });
}

/** Close the menu, or step back one level. */
export function forceMenuBack() {
  sendAction({ type: "forceMenuBack" });
}

/** Answer the open text/number prompt. */
export function forceSubmitValue(value: string) {
  sendAction({ type: "forceSubmitValue", value });
}

/** Accept or decline the open request prompt (F5/F6). */
export function forceRequestResult(result: boolean) {
  sendAction({ type: "forceRequestResult", result });
}

export function openMainMenu() {
  sendAction({ type: "openMainMenu" });
}

// Keybinds

/**
 * Register a bindable key in the FiveM keybinds menu. The bind sends back
 * `trigger_[trigger]` as data, valued with the client timer in milliseconds.
 * Built-in binds already exist for square, triangle, circle and cross.
 */
export function registerTrigger(trigger: string, name: string) {
  sendAction({ type: "registerTrigger", trigger, name });
}
