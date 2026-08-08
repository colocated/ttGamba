"use client";

import { useState } from "react";
import { InfoIcon } from "@phosphor-icons/react/dist/csr/Info";
import { XIcon } from "@phosphor-icons/react/dist/csr/X";

import { Tooltip } from "./tooltip";
import { useUpdateAvailable } from "./version";

/**
 * Tells the player their app is running an old build.
 *
 * It ends in a manual step on purpose. Reloading the document from in here is
 * what has stranded players before, and the userapp's URL bar belongs to the
 * parent frame, so we cannot drive it. Asking is the only safe option — and
 * the URL bar is the one control that cannot be broken by anything we render.
 *
 * Rendered by `Tablet` with nothing to configure. It needs `/api/version` to
 * exist in the app and to answer with the build id — see ./version.ts.
 */
export function UpdateBanner() {
  const available = useUpdateAvailable();
  const [dismissed, setDismissed] = useState(false);
  // Only ever read on the client: the banner cannot be showing until a poll
  // has come back, which is long after hydration.
  const [url] = useState(() =>
    typeof window === "undefined" ? "" : window.location.href,
  );

  if (!available || dismissed) return null;

  return (
    <div className="flex shrink-0 items-center gap-2.5 border-b border-edge bg-tone-3 px-3 py-2">
      <InfoIcon size={16} weight="fill" className="shrink-0 text-chip" aria-hidden />

      <p className="shrink-0 text-xs text-ink-soft">
        New build available — re-paste this URL in the userapp bar:
      </p>

      {/*
        An input rather than text: it gives the player a select-all and a
        Ctrl+C without us needing clipboard permissions, which are not
        dependable inside the game client.
      */}
      <input
        readOnly
        value={url}
        onFocus={(event) => event.currentTarget.select()}
        onClick={(event) => event.currentTarget.select()}
        aria-label="App URL"
        className="min-w-0 flex-1 rounded-chip bg-tone-1 px-2 py-1 font-mono text-xs text-ink"
      />

      {/* This banner sits just under the titlebar — `side="bottom"` keeps clear of it. */}
      <Tooltip label="Dismiss" side="bottom">
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="shrink-0 cursor-pointer rounded-control p-1 text-ink-muted transition-colors duration-120 ease-out hover:bg-tone-2 hover:text-ink"
        >
          <XIcon size={14} aria-hidden />
          <span className="sr-only">Dismiss</span>
        </button>
      </Tooltip>
    </div>
  );
}
