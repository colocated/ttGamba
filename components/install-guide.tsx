"use client";

/**
 * What the whole window shows when there is no game client behind it.
 *
 * Almost always this is ttGamba open in an ordinary browser tab — someone was
 * sent the link and opened it the only way a link can be opened. The app is
 * working exactly as built and simply has nothing to show, so this is toned as
 * instructions rather than an error: no red, no warning triangle, nothing has
 * gone wrong. What that person needs is the four steps that turn a browser tab
 * into an installed user app, and the address to paste, which is the one thing
 * they cannot be expected to type out correctly from memory.
 */

import { useEffect, useRef, useState } from "react";
import { CheckIcon } from "@phosphor-icons/react/dist/csr/Check";
import { CopyIcon } from "@phosphor-icons/react/dist/csr/Copy";
import { PlugsIcon } from "@phosphor-icons/react/dist/csr/Plugs";

/** How long "Copied" stays up before the button offers to copy again. */
const COPIED_FOR = 2000;

export function InstallGuide() {
  const address = useAddress();

  return (
    <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-5 overflow-y-auto p-8">
      <div className="flex flex-col items-center gap-2 text-center">
        <PlugsIcon size={32} className="text-ink-muted" aria-hidden />
        <h1 className="text-base font-semibold tracking-tight">No game data</h1>
        <p className="max-w-sm text-sm text-ink-soft">
          ttGamba runs inside Transport Tycoon and reads your character from the
          game client. Load it in game to play.
        </p>
      </div>

      <ol className="flex w-full max-w-sm flex-col gap-3">
        <Step number={1}>
          Press <Key>F1</Key> in game to open User Applications.
        </Step>
        <Step number={2}>
          Paste this address into the box:
          <Address value={address} />
        </Step>
        <Step number={3}>Press Load.</Step>
      </ol>

      <p className="text-xs text-ink-muted">
        Already in game? Refresh above to ask the client again.
      </p>
    </div>
  );
}

function Step({ number, children }: { number: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3 text-sm">
      {/* Squared off, like everything else — no circular step markers. */}
      <span
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-chip border border-edge bg-tone-3 font-mono text-xs text-ink-soft"
        aria-hidden
      >
        {number}
      </span>
      {/*
        Normal flow, not a flex column. As a column every child becomes a
        stretched block, which turns an inline <kbd> into a full-width bar on
        its own line — the text has to read as a sentence.
      */}
      <div className="min-w-0 flex-1 pt-0.5 leading-relaxed">{children}</div>
    </li>
  );
}

function Key({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded-chip border border-edge bg-tone-3 px-1.5 py-0.5 font-mono text-xs">
      {children}
    </kbd>
  );
}

/**
 * The address to paste, and a click to copy it.
 *
 * The text is always on screen rather than hidden behind the button. Copying
 * can fail for reasons the player cannot see — the clipboard API is refused
 * outside a secure context, so a plain `http://` deployment simply has no way
 * to do it — and when it does, a button that quietly did nothing is worse than
 * no button. Visible text can always be selected by hand.
 */
function Address({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // The reset outlives the click, so it has to be cancelled if this unmounts —
  // which it does the moment the game client answers.
  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), COPIED_FOR);
    } catch {
      // No clipboard to write to. The address is already readable above, so
      // there is nothing to announce — saying "copy failed" would only draw
      // attention away from the text that solves the problem.
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={copy}
        // Named explicitly so the label stays put when the contents change.
        // Left to its own content, the button would rename itself to "Copied"
        // and read as a different control every time it was pressed.
        aria-label={`Copy address ${value}`}
        title="Copy address"
        // `mt-2` rather than a gap on the parent: the step's content is normal
        // flow so that its text reads as a sentence, and this is the one child
        // that wants to be a block under it.
        className="group mt-2 flex w-full items-center gap-2 rounded-control border border-edge bg-tone-2 px-3 py-2 text-left transition-colors duration-120 ease-out hover:border-edge-strong hover:bg-raised-hover"
      >
        <span className="min-w-0 flex-1 truncate font-mono text-sm">{value}</span>
        {copied ? (
          <>
            <CheckIcon size={16} weight="bold" className="shrink-0 text-felt-hi" aria-hidden />
            <span className="shrink-0 text-xs text-felt-hi">Copied</span>
          </>
        ) : (
          <CopyIcon
            size={16}
            className="shrink-0 text-ink-muted transition-colors duration-120 ease-out group-hover:text-ink-soft"
            aria-hidden
          />
        )}
      </button>

      {/* Confirmation is a colour and a glyph, neither of which is announced.
          Outside the button so it reads as a result, not as a rename. */}
      <span className="sr-only" role="status">
        {copied ? "Address copied" : ""}
      </span>
    </>
  );
}

/**
 * The address the player needs, taken from the one they are already looking at
 * — origin only, because the user app wants a host to load and any path this
 * tab happens to be on (`/settings`, say) is not it.
 *
 * Read during render without a `useEffect` because this component cannot reach
 * the server: it renders only once the connection is `absent`, which is a
 * state reached by a timer two seconds after mount. The guard is for the type
 * checker and for whoever renders this somewhere else one day.
 */
function useAddress(): string {
  return typeof window === "undefined" ? "" : window.location.origin;
}
