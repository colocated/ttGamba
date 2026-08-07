"use client";

/**
 * The floor, from the door.
 *
 * A card per game, in the order an administrator arranged them — the same list
 * the shelf draws, from the same store, so the two cannot disagree about what
 * the casino offers (lib/rail.ts).
 *
 * It reads the list rather than being handed one from the server because the
 * shelf beside it already has it: a second read on the way through the page
 * would fetch the same rows a second time for a list that is going to arrive
 * anyway.
 */

import Link from "next/link";
import { CaretRightIcon } from "@phosphor-icons/react/dist/csr/CaretRight";
import { GameControllerIcon } from "@phosphor-icons/react/dist/csr/GameController";
import { NamedIcon } from "@tt/window";

import { Panel, Stage } from "@/components/stage";
import { Skeleton } from "@/components/banker/ui";
import { useRail } from "@/lib/rail";

export function GamesIndex() {
  const { games, failed } = useRail();

  return (
    <Stage title="Games" blurb="Pick something to play. Chips only — never real money.">
      {games === null ? (
        // Nothing at all while the list is on its way, for the same reason the
        // shelf shows nothing: it lands in a frame or two in game, and a loader
        // that appears and leaves inside 100ms is a flicker rather than
        // information (DESIGN.md). The skeleton is only for the case where
        // something has actually gone wrong long enough to be worth admitting.
        failed ? <Skeleton rows={3} /> : null
      ) : games.length === 0 ? (
        <Panel className="flex flex-col gap-2">
          <h2 className="text-sm font-medium">Nothing on the floor yet</h2>
          <p className="text-sm text-ink-soft">
            No games are in the shelf. An administrator adds them under Admin Tools › Games.
          </p>
        </Panel>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {games.map((game) => (
            <li key={game.id}>
              <Link
                href={`/play/${game.slug}`}
                className="flex h-full items-center gap-3 rounded-panel border border-edge bg-raised px-4 py-3.5 transition-colors duration-120 ease-out hover:border-edge-strong hover:bg-raised-hover"
              >
                <span className="flex shrink-0 text-ink-soft">
                  <NamedIcon name={game.icon} size={22} weight="fill" fallback={GameControllerIcon} />
                </span>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-sm font-medium">{game.name}</span>
                  {game.blurb ? (
                    <span className="truncate text-xs text-ink-soft">{game.blurb}</span>
                  ) : null}
                </span>
                <CaretRightIcon
                  size={14}
                  className="ml-auto shrink-0 text-ink-muted"
                  aria-hidden
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Stage>
  );
}
