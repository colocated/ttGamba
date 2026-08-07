"use client";

/**
 * A game, whichever of its three states it is in.
 *
 * One component and one call. `getPlace` answers "where is this player, in this
 * game" and the answer is a lobby, a table, or a slate saying the engine could
 * not be found — so there is nothing here that decides between them, only
 * something that renders what it was told. The reasoning for putting all three
 * behind one call is on `getPlace` itself (lib/tables.ts); the short version is
 * that asking twice is a race, and this is the component that would have lost
 * it.
 *
 * ── The poll is the seat ──────────────────────────────────────────────────
 * This page asks where it is every few seconds, and that ask is what holds the
 * chair. A player who closes the app cannot tell us — the window is an iframe
 * the game takes away — so a seat goes quiet rather than being given up, and a
 * quiet one is swept. Which means: while this component is mounted the player
 * is at the table, and when it is not, they are not. There is nothing to
 * remember to call.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { Problem, Skeleton } from "@/components/banker/ui";
import { ENGINE_COMPONENTS } from "@/components/engines/registry";
import { Stage, Tag } from "@/components/stage";
import { PLACE_POLL, type GameRow, type Place } from "@/lib/casino";
import type { Caller } from "@/lib/desk";
import { findEngine, isEngineId } from "@/lib/engines";
import { useDeskAction, usePlayerCall } from "@/lib/staff";
import { getPlace, sitAtTable, sitAtTier, stand } from "@/lib/tables";
import { EngineFailed } from "./failed";
import { Lobby } from "./lobby";

export function GameStage({ game }: { game: GameRow }) {
  /*
    `game` is what the server rendered the page against, so the header is right
    on the first frame rather than a beat later. Everything below it comes from
    the poll, and `place.game` supersedes this the moment it lands — a game
    renamed while somebody has it open catches up on its own.
  */
  const fetcher = useCallback((caller: Caller) => getPlace(caller, game.slug), [game.slug]);
  const { data: place, failure, reload } = usePlayerCall(fetcher, PLACE_POLL);
  const { run, busy } = useDeskAction();

  const current = place?.game ?? game;

  /**
   * Which table is being looked at, if any.
   *
   * Client state rather than anything the server knows: standing in a room is
   * not a thing there is a row for, and giving it one would mean a "watcher"
   * that has to be swept like a seat. The poll keeps returning `lobby`, and
   * the table being watched is picked back out of the lobby it returns — so a
   * seat filling up while somebody looks at it fills up on screen, with nothing
   * here to keep in step.
   */
  const [viewing, setViewing] = useState<number | null>(null);

  const takeSeat = useCallback(
    (tableId: number, position: number) => {
      void run((caller) => sitAtTable(caller, tableId, position)).then((result) => {
        // Cleared on success only: a refused pick leaves the player looking at
        // the table, where the seat they wanted has just gone grey.
        if (result) setViewing(null);
        reload();
      });
    },
    [run, reload],
  );

  const sitTier = useCallback(
    (tierId: number) => {
      void run((caller) => sitAtTier(caller, tierId)).then(reload);
    },
    [run, reload],
  );

  const leave = useCallback(() => {
    void run((caller) => stand(caller)).then(reload);
  }, [run, reload]);

  /**
   * A singleplayer game loads in front of the player rather than behind a
   * button.
   *
   * With one set of stakes there is nothing to pick, so the lobby would be a
   * screen containing a single button — and the game is meant to start on
   * demand (PRODUCT.md). It is done here rather than on the server for one
   * reason: this happens once per arrival, and the server's answer is a poll.
   * Seating them in `getPlace` would sit them back down five seconds after they
   * stood up, and the way out of the game would look broken.
   *
   * The ref is what makes "once" true. It survives every re-render and every
   * poll, so leaving the table leaves it — and it is deliberately not reset,
   * because a player who wants back in has the button in front of them.
   */
  const seated = useRef(false);
  useEffect(() => {
    if (seated.current || !place || place.at !== "lobby" || place.tiers.length !== 1) return;
    if (findEngine(place.game.engine)?.mode !== "singleplayer") return;

    seated.current = true;
    sitTier(place.tiers[0].id);
  }, [place, sitTier]);

  return (
    <Stage title={current.name} blurb={current.blurb ?? undefined} aside={<Aside place={place} />}>
      {/*
        A failure sits above whatever is already on screen rather than replacing
        it. A table that empties itself because one poll was refused tells a
        player they have been thrown out, which is a worse lie than being a few
        seconds stale (lib/staff.ts).
      */}
      {failure ? <Problem failure={failure} onRetry={reload} /> : null}

      {place === null ? (
        failure ? null : (
          <Skeleton rows={2} />
        )
      ) : (
        <Body
          place={place}
          viewing={viewing}
          onView={setViewing}
          onTakeSeat={takeSeat}
          onSitTier={sitTier}
          onLeave={leave}
          busy={busy}
          reload={reload}
        />
      )}
    </Stage>
  );
}

/** What the top-right of the stage says about where you are. */
function Aside({ place }: { place: Place | null }) {
  if (!place) return null;
  if (place.at === "broken") return <Tag tone="bad">Unavailable</Tag>;
  if (place.at === "lobby") {
    // A singleplayer lobby is a list of stakes rather than of tables — the
    // table is made for whoever asks — so it should not tell them to pick one.
    const solo = findEngine(place.game.engine)?.mode === "singleplayer";
    return <Tag>{solo ? "Pick your stakes" : "Pick a table"}</Tag>;
  }
  return (
    <Tag tone="good">
      {place.tier.name} {place.table.number} · seat {place.seat}
    </Tag>
  );
}

function Body({
  place,
  viewing,
  onView,
  onTakeSeat,
  onSitTier,
  onLeave,
  busy,
  reload,
}: {
  place: Place;
  viewing: number | null;
  onView: (tableId: number | null) => void;
  onTakeSeat: (tableId: number, position: number) => void;
  onSitTier: (tierId: number) => void;
  onLeave: () => void;
  busy: boolean;
  reload: () => void;
}) {
  if (place.at === "broken") {
    return <EngineFailed game={place.game} reason={place.reason} />;
  }

  const engine = findEngine(place.game.engine);
  // Unreachable in practice — the server would have answered `broken` — and
  // handled anyway, because "unreachable" and "cannot happen" are different
  // things and the first one is the one that turns up in production.
  if (!engine || !isEngineId(place.game.engine)) {
    return <EngineFailed game={place.game} reason={`Game engine "${place.game.engine}" does not exist.`} />;
  }

  if (place.at === "lobby") {
    /*
      The watched table is looked up in the lobby the poll just returned rather
      than held alongside it, so it cannot go stale. A table that closed while
      somebody was looking at it simply is not there any more, and they land
      back on the list.
    */
    const watched =
      viewing === null
        ? null
        : place.tiers
            .flatMap((tier) => tier.tables.map((table) => ({ tier, table })))
            .find((entry) => entry.table.id === viewing) ?? null;

    /*
      A watcher gets the engine, not a screen of their own.

      Opening a table and sitting at one are the same view with one difference:
      a spectator has no seat, so nothing that commits chips is drawn for them.
      Everything else — the table, the cards, whatever the engine animates — is
      identical, because it is the same component being handed `seat: null`.
      Any other arrangement means writing each game twice and having the two
      drift.
    */
    if (watched) {
      const Watching = ENGINE_COMPONENTS[place.game.engine];
      return (
        <Watching
          game={place.game}
          tier={watched.tier}
          table={watched.table}
          seat={null}
          onTakeSeat={(position) => onTakeSeat(watched.table.id, position)}
          onLeave={() => onView(null)}
          reload={reload}
          busy={busy}
        />
      );
    }

    return (
      <Lobby
        tiers={place.tiers}
        engine={engine}
        onSitAtTable={onView}
        onSitAtTier={onSitTier}
        busy={busy}
      />
    );
  }

  const Engine = ENGINE_COMPONENTS[place.game.engine];
  return (
    <Engine
      game={place.game}
      tier={place.tier}
      table={place.table}
      seat={place.seat}
      onTakeSeat={(position) => onTakeSeat(place.table.id, position)}
      onLeave={onLeave}
      reload={reload}
      busy={busy}
    />
  );
}
