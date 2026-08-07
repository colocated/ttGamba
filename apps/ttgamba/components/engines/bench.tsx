"use client";

/**
 * A table with nothing being played at it.
 *
 * Every engine is this one for the moment, and it is deliberately not a "coming
 * soon" panel: it renders everything the table layer actually provides — the
 * seats and who is in them, the stakes, the cards left in the shoe — so the
 * whole of it can be checked in game before there is a game to check it with.
 * If a seat is wrong here, it is wrong in lib/tables.ts.
 *
 * The shoe figure is the one worth watching. It appears when the first player
 * sits down, holds while anyone is at the table, and is gone when the last one
 * leaves — which is the lifecycle in prisma/schema.prisma, made visible.
 */

import { CardsIcon } from "@phosphor-icons/react/dist/csr/Cards";
import { UserIcon } from "@phosphor-icons/react/dist/csr/User";

import { Button } from "@/components/banker/ui";
import { Panel } from "@/components/stage";
import { formatChips } from "@/lib/format";
import type { EngineProps } from "./registry";

export function Bench({ game, tier, table, seat, onTakeSeat, onLeave, busy }: EngineProps) {
  const seats = Array.from({ length: tier.seats }, (_, index) => index + 1);
  const watching = seat === null;

  return (
    <div className="flex flex-col gap-4">
      <Panel className="flex flex-col gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-sm font-medium">
            {tier.name} {table.number}
          </h2>
          <span className="font-mono text-xs tabular-nums text-ink-muted">
            {formatChips(tier.minBet)} – {formatChips(tier.maxBet)}
          </span>
        </div>

        <ul className="flex flex-wrap gap-2">
          {seats.map((position) => {
            const player = table.seats.find((taken) => taken.position === position) ?? null;
            const mine = position === seat;

            /*
              An empty chair is pressable only for somebody who is not already
              in one. Moving seats mid-game is a different decision from picking
              one, and the table layer treats a move as a leave and a re-seat —
              so it stays out of here until a game exists to have an opinion
              about it.
            */
            const takeable = watching && !player && !busy;

            const body = (
              <>
                <span className="text-xs uppercase tracking-wide text-ink-muted">
                  Seat {position}
                </span>
                <span
                  className={`flex items-center gap-1.5 truncate text-sm ${
                    player ? "text-ink" : "text-ink-muted"
                  }`}
                >
                  {player ? (
                    <>
                      <UserIcon size={13} weight="fill" aria-hidden />
                      {player.playerName ?? `Player ${player.vrpId}`}
                      {mine ? <span className="text-xs text-felt-hi">(you)</span> : null}
                    </>
                  ) : takeable ? (
                    "Sit here"
                  ) : (
                    "Empty"
                  )}
                </span>
              </>
            );

            const shape = `flex min-w-36 flex-1 flex-col gap-1 rounded-control border px-3 py-2 text-left ${
              mine
                ? "border-felt bg-felt/10"
                : player
                  ? "border-edge bg-tone-2"
                  : "border-dashed border-edge bg-transparent"
            }`;

            return (
              <li key={position} className="flex min-w-36 flex-1">
                {takeable ? (
                  <button
                    type="button"
                    onClick={() => onTakeSeat(position)}
                    title={`Sit in seat ${position}`}
                    className={`${shape} w-full cursor-pointer transition-colors duration-120 ease-out hover:border-felt hover:bg-felt/10 hover:text-felt-hi`}
                  >
                    {body}
                  </button>
                ) : (
                  <span className={`${shape} w-full`}>{body}</span>
                )}
              </li>
            );
          })}
        </ul>

        {/*
          A game that deals no cards has no shoe at all, and `null` is that
          rather than a shoe with nothing in it — so the row goes rather than
          reading zero.
        */}
        {table.cardsLeft !== null ? (
          <div className="flex items-center gap-2 border-t border-edge pt-3 text-sm text-ink-soft">
            <CardsIcon size={16} weight="fill" className="text-ink-muted" aria-hidden />
            <span className="font-mono tabular-nums">{table.cardsLeft}</span>
            <span>cards left before the shoe is re-shuffled</span>
          </div>
        ) : null}
      </Panel>

      {/*
        Everything below this line is the player's side of the table. It is
        absent for a watcher — not disabled, absent — because a bet menu that
        cannot be used is a menu somebody will try to use.
      */}
      <Panel className="flex flex-col gap-2">
        <h2 className="text-sm font-medium">
          {watching ? `Watching ${game.name}` : `${game.name} is not dealt yet`}
        </h2>
        <p className="text-sm text-ink-soft">
          {watching
            ? "Pick a seat above to join in. Watching costs nothing and holds nothing — the table carries on either way."
            : "The table above is real: the seat is held for as long as this window is open, the shoe was cut when the first player sat down, and it is thrown away when the last one leaves. What is missing is the game itself."}
        </p>
      </Panel>

      <div>
        <Button onClick={onLeave} disabled={busy}>
          {watching ? "Back to the tables" : "Leave the table"}
        </Button>
      </div>
    </div>
  );
}
