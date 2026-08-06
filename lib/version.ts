"use client";

/**
 * Notices when the server is serving a newer build than the one this page is
 * running.
 *
 * We cannot act on it: reloading the document is what strands players when it
 * goes wrong (see components/tablet.tsx), and we cannot reach the userapp's
 * URL bar from inside the iframe. So this only reports, and the banner asks
 * the player to re-paste the URL themselves.
 */

import { useEffect, useState } from "react";

/** Inlined at build time — the build this page was served from. */
const BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID;

/**
 * Slow on purpose. A new build is not urgent, the player is mid-game, and the
 * request costs a round trip to a server they are already talking to.
 */
const POLL_INTERVAL = 60_000;

export function useUpdateAvailable() {
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    // Without an id to compare against there is nothing to say. Bailing out
    // keeps a misconfigured build quiet rather than permanently nagging.
    if (!BUILD_ID) return;

    let cancelled = false;

    const check = async () => {
      try {
        const response = await fetch("/api/version", { cache: "no-store" });
        if (!response.ok) return;

        const { buildId } = (await response.json()) as { buildId?: unknown };
        if (cancelled || typeof buildId !== "string") return;
        if (buildId !== BUILD_ID) setAvailable(true);
      } catch {
        // Offline, or the server is mid-restart. Nothing to report; the next
        // poll will pick it up.
      }
    };

    check();
    const timer = setInterval(check, POLL_INTERVAL);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  return available;
}
