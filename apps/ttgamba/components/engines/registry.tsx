"use client";

/**
 * Which component plays which game.
 *
 * The other half of lib/engines.ts. That file is the data — what engines exist,
 * how many seats they deal to, whether they take cards — and has to stay data,
 * because `"use server"` modules import it and may only export functions. This
 * is the half that knows about React.
 *
 * The map is typed `Record<EngineId, …>`, so registering an engine in
 * lib/engines.ts without giving it a component here is a type error rather than
 * a blank stage. That is the whole reason the two files are allowed to be
 * separate.
 */

import type { GameRow, TableRow, TierRow } from "@/lib/casino";
import type { EngineId } from "@/lib/engines";
import { Bench } from "./bench";
import { BlackjackTable } from "./blackjack";

/**
 * What every engine is handed.
 *
 * Note what is *not* here: any way to move chips. An engine takes a bet by
 * calling a server function of its own that re-reads the balance, checks it and
 * debits it in one transaction (lib/chips.ts spells out why), and the figure it
 * would find on this side is a display cache a player can edit. Nothing an
 * engine is given is authority over anything.
 */
export type EngineProps = {
  game: GameRow;
  /** The stakes this table plays at. */
  tier: TierRow;
  table: TableRow;
  /**
   * Which chair this player is in, from 1 — or `null` when they are only
   * watching.
   *
   * A spectator gets the *same* table: the same cards, the same animations, the
   * same everything an engine draws. What they do not get is anything that
   * commits chips. An engine is responsible for that distinction, and the rule
   * is one line long: nothing that places a bet may render while `seat` is
   * null.
   *
   * Watching is not a lesser mode to be bolted on — it is how a player decides
   * whether to sit at all, and how they keep following a table after standing
   * up. Building it as a separate screen would mean writing every game twice.
   */
  seat: number | null;
  /**
   * Sit in a particular chair. Only meaningful while `seat` is null.
   *
   * The engine owns this because a seat is a place *at the table it is drawing*
   * — the chair a player wants is the one in the picture, not an entry in a
   * list somewhere else.
   */
  onTakeSeat: (position: number) => void;
  /**
   * Get up.
   *
   * By default this is the whole way out: the seat is given up and the player
   * lands back on the list of tables. `stay` gives up only the seat, leaving
   * them watching the table they were sitting at.
   *
   * The distinction is the difference between "I am done here" and "I will sit
   * this one out", and only the game knows which of those a player has asked
   * for — a blackjack player passing a shoe wants the second one and would be
   * thrown out of the room by the first.
   *
   * Standing up is not always allowed to happen *now*, and that is the
   * engine's business rather than this call's: a game with a round in progress
   * should hold the request until the round settles rather than pass it on
   * mid-hand. Nothing here queues anything.
   */
  onLeave: (options?: { stay?: boolean }) => void;
  /** Ask the server where we are again, rather than waiting for the next poll. */
  reload: () => void;
  /** A `leave` is in flight. Buttons that would race it should be off. */
  busy: boolean;
};

export type EngineComponent = (props: EngineProps) => React.ReactNode;

/**
 * How much of the pane an engine draws.
 *
 * `stage` is the ordinary arrangement: the game page keeps its header — the
 * title, the blurb, the seat tag — and the engine renders panels underneath it
 * like every other page in the app.
 *
 * `felt` is a game that *is* the pane. It gets the whole of it, header
 * included, because a table drawn under a page title reads as a widget on a
 * page rather than as the thing the player is sitting at — and the ~90px that
 * header costs is height a half-circle table cannot spare in a window whose
 * short edge is 406px at its smallest. An engine that asks for this owes the
 * player everything the header was carrying: which table this is, what it
 * costs, and the way out.
 *
 * Only at a table. A lobby is a list of places to sit and always keeps its
 * header, whichever engine is behind it.
 */
export type EngineSurface = "stage" | "felt";

/**
 * An engine, as the interface reaches it: what draws it, and how much room it
 * is drawn in.
 *
 * A record rather than a bare component so that adding a surface later cannot
 * be forgotten for one engine and remembered for another — every entry states
 * both, and the type below makes an omission a compile error.
 */
export type EngineEntry = {
  play: EngineComponent;
  surface: EngineSurface;
};

/**
 * ── The bench is what an engine looks like before it is written ───────────
 * `Bench` is not a placeholder in the "coming soon" sense — it is a working
 * view of everything the table layer actually provides: who is sitting where,
 * what the stakes are, and how much of the shoe is left. It is what lets the
 * plumbing be checked in game before there is a game to check it with, and it
 * is still what roulette and cross-the-road get.
 *
 * Building a game means writing its component and changing one line here.
 * Nothing else in the app needs to know.
 * ─────────────────────────────────────────────────────────────────────────
 */
export const ENGINE_COMPONENTS: Record<EngineId, EngineEntry> = {
  blackjack: { play: BlackjackTable, surface: "felt" },
  roulette: { play: Bench, surface: "stage" },
  "cross-the-road": { play: Bench, surface: "stage" },
};
