"use client";

/**
 * The sound effects the client will play, as a keyboard.
 *
 * The list is `SFX` in lib/userapp.ts, which is this repository's copy of the
 * table in the official docs (<https://ttycoon.eu/userapps/docs>). Names are
 * shown exactly as they appear there rather than prettified: the point of this
 * tab is to find the one you want and then go and type it into a game, so the
 * thing on screen has to be the thing you would type.
 *
 * Nothing here is previewable any other way — the sounds live in the game
 * client, not in this app — so pressing one is the only way to know what it is.
 */

import { useState } from "react";
import { PlayIcon } from "@phosphor-icons/react/dist/csr/Play";
import { SpeakerHighIcon } from "@phosphor-icons/react/dist/csr/SpeakerHigh";

import { Panel } from "@/components/stage";
import { Button } from "@/components/banker/ui";
import { SFX, playSfx, type SfxName } from "@tt/userapp";

/** The curated list, in the docs' own order. */
const NAMED = (Object.entries(SFX) as [SfxName, number][]).sort((a, b) => a[1] - b[1]);

/** Which named effect an index belongs to, for the note under the free field. */
const BY_INDEX: Record<number, SfxName> = Object.fromEntries(
  NAMED.map(([name, index]) => [index, name]),
);

/** How long a pressed key stays lit. Long enough to see, short enough to stop asking. */
const LIT = 1200;

export function SfxBoard() {
  /** The index last sent, so the key that was pressed can say so. */
  const [last, setLast] = useState<number | null>(null);
  const [raw, setRaw] = useState("");

  const play = (index: number) => {
    playSfx(index);
    setLast(index);
    // Cleared on a timer rather than left lit, so pressing the same key twice
    // is visible as two presses.
    setTimeout(() => setLast((current) => (current === index ? null : current)), LIT);
  };

  const parsed = Number(raw.trim());
  const custom = raw.trim() !== "" && Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;

  return (
    <div className="flex flex-col gap-4">
      <Panel className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-medium">Sound effects</h2>
          <span className="text-xs text-ink-muted">{NAMED.length} in the docs</span>
        </div>

        <p className="text-sm text-ink-soft">
          Each one plays through the game, not through the app — so it follows the game&apos;s
          volume, and you will hear it whether or not this window has focus.
        </p>

        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {NAMED.map(([name, index]) => (
            <li key={name}>
              <Key name={name} index={index} lit={last === index} onPlay={() => play(index)} />
            </li>
          ))}
        </ul>
      </Panel>

      {/*
        The list above is what the docs name, and the client takes a number. The
        two are not the same thing: an index outside the table may play
        something, or may do nothing at all, and there is no way to find out
        except to send it. This is that.
      */}
      <Panel className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">Any index</h2>
        <p className="text-sm text-ink-soft">
          The client takes a number, and the docs only name the ones above. Anything else may
          play, or may be ignored — silence here means nothing was mapped to it.
        </p>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (custom !== null) play(custom);
          }}
          className="flex items-center gap-2"
        >
          <input
            value={raw}
            onChange={(event) => setRaw(event.target.value)}
            inputMode="numeric"
            placeholder="18"
            aria-label="Sound effect index"
            className="w-28 rounded-control border border-edge bg-tone-1 px-3 py-2 font-mono text-sm tabular-nums text-ink outline-none placeholder:font-sans placeholder:text-ink-muted focus:border-edge-strong"
          />
          <Button type="submit" disabled={custom === null}>
            Play
          </Button>
          {custom !== null && custom in BY_INDEX ? (
            <span className="text-xs text-ink-muted">
              That is <span className="font-mono">{BY_INDEX[custom]}</span>, above.
            </span>
          ) : null}
        </form>
      </Panel>
    </div>
  );
}

/**
 * One key.
 *
 * Lighting up on press is the whole feedback loop: a sound that turns out to be
 * silent is otherwise indistinguishable from a button that did not register.
 * Colour only, at the house's 120ms (DESIGN.md).
 */
function Key({
  name,
  index,
  lit,
  onPlay,
}: {
  name: SfxName;
  index: number;
  lit: boolean;
  onPlay: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPlay}
      className={`flex w-full cursor-pointer items-center gap-3 rounded-control border px-3 py-2 text-left transition-colors duration-120 ease-out ${
        lit
          ? "border-felt bg-felt/15 text-felt-hi"
          : "border-edge bg-tone-2 text-ink-soft hover:bg-raised-hover hover:text-ink"
      }`}
    >
      <span className="shrink-0">
        {lit ? (
          <SpeakerHighIcon size={14} weight="fill" aria-hidden />
        ) : (
          <PlayIcon size={14} weight="fill" aria-hidden />
        )}
      </span>
      <span className="min-w-0 flex-1 truncate font-mono text-xs">{name}</span>
      <span className="shrink-0 font-mono text-xs tabular-nums text-ink-muted">{index}</span>
    </button>
  );
}
