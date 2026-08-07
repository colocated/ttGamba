/**
 * The engines, as a list of what exists.
 *
 * A game row names an engine by id, and this is what that id is resolved
 * against. Data only — no components — for the same reason lib/casino.ts is:
 * `"use server"` modules may only export functions, and the server needs to
 * know what an engine *is* (how many seats, whether it deals cards) before it
 * can build a table for one. The components live in components/engines/, keyed
 * off this registry so that adding an entry here without wiring up a component
 * is a type error rather than a blank screen.
 *
 * ── Why a registry and not a database table ───────────────────────────────
 * Because an engine is code. Adding one is writing a file, not filling in a
 * form, and a row saying `baccarat` on a build with no baccarat in it would be
 * a promise the app cannot keep.
 *
 * What *is* configurable is which engine a game uses, and that is deliberately
 * free text in the admin panel. An administrator pointing a game at an engine
 * that does not exist is a mistake that should be visible rather than
 * impossible: they get the game they typed, and a player opening it gets a
 * slate naming the engine that could not be found. A dropdown would make the
 * mistake unmakeable at the cost of never being able to prepare a game for an
 * engine that is still being written.
 * ─────────────────────────────────────────────────────────────────────────
 */

/**
 * How many players share a round.
 *
 * The engine says, not the game row. "Blackjack is multiplayer" is a fact about
 * blackjack, and an administrator who could set it otherwise would be
 * describing a game the code does not play.
 */
export type EngineMode = "multiplayer" | "singleplayer";

export type Engine = {
  label: string;
  /** What it is, for the admin panel's list of what may be typed. */
  blurb: string;
  mode: EngineMode;
  /**
   * The most players it can deal to. A tier configured for more is clamped to
   * this when its tables are built — the engine is the authority on what it can
   * physically lay out (lib/tables.ts).
   */
  maxSeats: number;
  /**
   * Decks in the shoe, or `0` for a game that deals no cards.
   *
   * Four is the house default and the reason is in prisma/schema.prisma:
   * enough that counting them is work, few enough that the deal is still a
   * deal. A zero here means no shoe is ever asked for, and `cardsLeft` stays
   * `null` for every table of that game.
   */
  decks: number;
};

/**
 * Everything this build can play.
 *
 * Keys are what goes in a game's `engine` field. Lower case and hyphenated,
 * like a slug, because that is what they read as beside one.
 */
export const ENGINES = {
  blackjack: {
    label: "Blackjack",
    blurb: "Seated card game against the dealer. Deals from the table's shoe.",
    mode: "multiplayer",
    maxSeats: 7,
    decks: 4,
  },
  roulette: {
    label: "Roulette",
    blurb: "Shared wheel. Everyone at the table bets on one spin.",
    mode: "multiplayer",
    maxSeats: 8,
    decks: 0,
  },
  "cross-the-road": {
    label: "Cross the Road",
    blurb: "One player, one run. Starts on demand and takes no cards.",
    mode: "singleplayer",
    maxSeats: 1,
    decks: 0,
  },
} as const satisfies Record<string, Engine>;

export type EngineId = keyof typeof ENGINES;

/** Every engine, in the order the admin panel lists them. */
export const ENGINE_IDS = Object.keys(ENGINES) as EngineId[];

/** Whether a string names an engine this build has. */
export function isEngineId(id: string): id is EngineId {
  return Object.hasOwn(ENGINES, id);
}

/** The engine an id names, or `null`. */
export function findEngine(id: string): Engine | null {
  return isEngineId(id) ? ENGINES[id] : null;
}

/**
 * Why a game will not load, in words a person can act on.
 *
 * Returns `null` when the engine is fine. The two failures are told apart on
 * purpose: an unset engine is a game that has not been finished, and a wrong
 * one is a name that does not exist — and an administrator needs to know which
 * of those they are looking at. The message is put on screen as-is
 * (components/games/failed.tsx), so it is written to be read rather than
 * matched on.
 */
export function engineFault(engine: string): string | null {
  const id = engine.trim();
  if (id === "") return "This game has no engine set.";
  if (!isEngineId(id)) return `Game engine "${id}" does not exist.`;
  return null;
}
