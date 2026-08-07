"use client";

/**
 * What a player gets when the game they opened names an engine this build does
 * not have.
 *
 * This is the visible half of the bargain lib/engines.ts makes: the engine field
 * in the admin panel is free text, so that a game can be prepared for an engine
 * still being written, and the price of that is that a typo reaches a player.
 * The point of this slate is to make that a five-second fix rather than a
 * mystery — it names the engine it went looking for, in the words it was given.
 *
 * Toned as a fault rather than a closed door, because unlike the banker desk's
 * refusal something genuinely has gone wrong here. But the fault is the app's,
 * not the player's, so nothing on it suggests they try again.
 */

import { PlugsIcon } from "@phosphor-icons/react/dist/csr/Plugs";

import { Panel } from "@/components/stage";
import type { GameRow } from "@/lib/casino";
import { ENGINE_IDS } from "@/lib/engines";
import { useStaff } from "@/lib/staff";

export function EngineFailed({ game, reason }: { game: GameRow; reason: string }) {
  // The list of engines that *do* exist is the next thing an administrator
  // wants and the last thing a player needs, so only one of them is shown it.
  const { admin } = useStaff();

  return (
    <Panel className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <PlugsIcon size={20} weight="fill" className="mt-0.5 shrink-0 text-loss" aria-hidden />
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="text-sm font-medium">Failed to load game engine</h2>
          {/*
            The reason as the server phrased it, put on screen unchanged — the
            engine name inside it is the whole point, and re-writing the
            sentence here would be a second version of it to keep in step.
          */}
          <p className="text-sm text-ink-soft">{reason}</p>
        </div>
      </div>

      <p className="border-t border-edge pt-3 text-sm text-ink-soft">
        {admin ? (
          <>
            <span className="text-ink">{game.name}</span> is set up, but nothing in this build
            plays it. Point it at one of the engines below under Admin Tools › Games, or leave it
            out of the shelf until its engine has been written.
          </>
        ) : (
          <>
            Nothing is wrong with your account and the rest of ttGamba works as it did. This is
            one for whoever maintains the app — the other games in the shelf are unaffected.
          </>
        )}
      </p>

      {admin ? (
        <ul className="flex flex-wrap gap-2">
          {ENGINE_IDS.map((id) => (
            <li
              key={id}
              className="rounded-chip border border-edge bg-tone-2 px-2 py-1 font-mono text-xs text-ink-soft"
            >
              {id}
            </li>
          ))}
        </ul>
      ) : null}
    </Panel>
  );
}
