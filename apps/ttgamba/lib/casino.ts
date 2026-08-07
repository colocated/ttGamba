/**
 * The floor, as a vocabulary.
 *
 * What a game is, what a tier is, what a table is, and what any of them look
 * like once they have crossed to a browser. Deliberately holds data only — no
 * Prisma client, no server functions, no components — so the server layer
 * (lib/catalogue.ts, lib/tables.ts) and the interface (components/games/,
 * components/admin/games.tsx) can both import it. The same arrangement, and for
 * the same reasons, as lib/desk.ts is for the banker's desk.
 *
 * ── The three layers, and why there are three ─────────────────────────────
 * A **game** is a definition: "Blackjack". It has a name, an icon and the id of
 * the engine that plays it, and it holds no state at all.
 *
 * A **tier** is a class of table: "Blackjack, 1M–10M, five seats, keep one
 * open". This is the layer an administrator configures, and the reason tables
 * are not configured directly is that a fixed list of them can fill up. See
 * `floor`.
 *
 * A **table** is somewhere to sit. It owns the shoe, the seats and the round in
 * progress, and it is where an engine actually runs.
 *
 * Singleplayer games have all three. They never show a player a list of tables
 * — one is made for them and they are sat at it — but the table is still what
 * owns the cards, and one shape for both kinds of game is what keeps an engine
 * from having to know which kind it is. See PRODUCT.md.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { Tone } from "./desk";

// ── What the interface is handed ───────────────────────────────────────────

/*
  Rows, as they cross from the server. Times are epoch milliseconds and chip
  figures are `number`, both for the reasons set out in lib/desk.ts — and
  converted in exactly one place, lib/rows.ts.
*/

/** A game, as the shelf and the stage read it. */
export type GameRow = {
  id: number;
  slug: string;
  name: string;
  blurb: string | null;
  /** A Phosphor icon name. Free text — see components/icon.tsx. */
  icon: string;
  /** A key into the engine registry, which it may well not be. See lib/engines.ts. */
  engine: string;
  inRail: boolean;
  position: number;
};

/** A class of table, as the lobby lists it. */
export type TierRow = {
  id: number;
  gameId: number;
  name: string;
  minBet: number;
  maxBet: number;
  seats: number;
  floor: number;
  position: number;
};

/** Somebody sitting at a table. */
export type SeatRow = {
  position: number;
  vrpId: number;
  playerName: string | null;
  joinedAt: number;
};

/**
 * A table, as anyone who is not sitting at it sees it.
 *
 * Note what is *not* here: the shoe's cards. `cardsLeft` is a count, and it is
 * the only thing about the shoe that ever leaves the server — a player who
 * could read the order would know every card before it was dealt. See
 * lib/shoe.ts.
 */
export type TableRow = {
  id: number;
  tierId: number;
  number: number;
  overflow: boolean;
  ownerVrpId: number | null;
  seats: SeatRow[];
  /** `null` when nobody has sat down yet, so no shoe has been asked for. */
  cardsLeft: number | null;
};

/** A tier with its tables, which is one row of a lobby. */
export type TierView = TierRow & { tables: TableRow[] };

/**
 * Where a player is, in one answer.
 *
 * The game page asks this on a timer and renders whichever of the three it gets
 * back. One call rather than "am I seated?" followed by "then give me the
 * lobby" because the two would be a race with each other: a seat swept between
 * them would leave the page rendering a table nobody is at.
 *
 * It is also the heartbeat. Asking where you are is proof you are still there,
 * so a seat is held by the same poll that draws it, and there is no second call
 * to forget to make. See `SEAT_TIMEOUT`.
 */
export type Place =
  /** The engine named on the game is not one this build has. */
  | { at: "broken"; game: GameRow; reason: string }
  /** Pick somewhere to sit. Multiplayer, or a singleplayer game with stakes to choose. */
  | { at: "lobby"; game: GameRow; tiers: TierView[] }
  /** Sat down. This is what an engine is handed. */
  | { at: "table"; game: GameRow; tier: TierRow; table: TableRow; seat: number };

// ── What the admin panel sends back ────────────────────────────────────────

/**
 * A tier as the editor holds it, before it is anything in the database.
 *
 * `id` is `null` for a tier that has been added and not yet saved. The panel
 * sends the whole catalogue on every save — see `saveCatalogue` — so a `null`
 * means "create this" and an id means "this is the one to update".
 */
export type TierDraft = {
  id: number | null;
  name: string;
  minBet: number;
  maxBet: number;
  seats: number;
  floor: number;
};

/** A game as the editor holds it. Order is the position in the array. */
export type GameDraft = {
  id: number | null;
  slug: string;
  name: string;
  blurb: string;
  icon: string;
  engine: string;
  inRail: boolean;
  tiers: TierDraft[];
};

// ── Bounds ─────────────────────────────────────────────────────────────────

/*
  Sanity bounds rather than policy. Nothing here is a view about how a casino
  should be run — they exist so that a typo or a tampered payload cannot ask for
  something that costs the server real work, and so the panel and the server
  agree about what they are refusing. Bet limits are bounded by `AMOUNT_LIMIT`
  in lib/desk.ts, which is the app's one ceiling on a chip figure.
*/

export const NAME_LIMIT = 40;
export const BLURB_LIMIT = 160;
export const SLUG_LIMIT = 40;
/** Long enough for the longest Phosphor name, which is nowhere near this. */
export const ICON_LIMIT = 64;
export const ENGINE_LIMIT = 40;

export const MIN_SEATS = 1;
export const MAX_SEATS = 12;
/** Tables of one class kept standing open. Zero means "open one when asked". */
export const MAX_FLOOR = 10;

export const MAX_GAMES = 24;
export const MAX_TIERS = 8;

/**
 * How long a seat is held after the app stops saying it is there.
 *
 * A player closing the app does not get to say goodbye — the window is an
 * iframe the game can take away, and `beforeunload` inside one is not something
 * to build a lobby on. So a seat is *held* by the poll rather than released by a
 * departure, and one that goes quiet for this long is swept.
 *
 * Comfortably more than three polls, so a player on a bad connection keeps
 * their chair through a couple of missed calls rather than being stood up
 * mid-hand.
 */
export const SEAT_TIMEOUT = 45_000;

/** How often the game page asks where it is. Also what holds the seat. */
export const PLACE_POLL = 5_000;

// ── Reading a slug ─────────────────────────────────────────────────────────

/**
 * A name, as an address.
 *
 * Used in two places that must agree: the admin panel fills the slug field in
 * from the name as it is typed, and the server runs the same function over
 * whatever arrives. A slug that survives this unchanged is one the router can
 * carry — lower case, no punctuation, no leading or trailing hyphens.
 *
 * An empty result is a failure rather than a slug: a game called `!!!` has no
 * address, and the panel says so rather than saving one with no way to reach it.
 */
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_LIMIT)
    .replace(/-+$/g, "");
}

// ── Tone ───────────────────────────────────────────────────────────────────

/**
 * How full a table is, at a glance.
 *
 * The lobby is scanned rather than read, and the one question a player is
 * asking of every row is whether they can sit down. Green for room, blue for
 * the last chair — the colour that means "done" elsewhere, and here means "very
 * nearly" — and grey for full, because a full table is not an error, it is just
 * not for you. An empty table is the plain neutral tag: it has the most room of
 * all, but a screen of them all shouting green would leave nothing to pick out.
 *
 * Colour never carries it alone; the figure beside it always says `2/5`.
 */
export function occupancyTone(taken: number, seats: number): Tone {
  if (taken >= seats) return "muted";
  if (taken === 0) return "neutral";
  return taken >= seats - 1 ? "settled" : "good";
}
