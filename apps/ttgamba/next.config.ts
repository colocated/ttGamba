import { execSync } from "node:child_process";
import type { NextConfig } from "next";

import { GAMES } from "./lib/games";

/**
 * Identifies this build, so a running app can notice it is out of date.
 *
 * The timestamp is what makes the comparison work: a rebuild of the same
 * commit is still a new bundle, and a client holding the old one still needs
 * telling. The commit is along for readability when debugging which build a
 * player is on.
 *
 * Deliberately *not* wired to `deploymentId`. Next's own skew handling reacts
 * to a mismatch by forcing a full page reload, and this app is a full-screen
 * iframe that holds the game's input focus — a reload it cannot control is the
 * one thing that can strand a player. We detect the same condition and put a
 * banner up instead. See components/update-banner.tsx.
 */
const BUILD_ID = `${commit()}-${Date.now().toString(36)}`;

function commit() {
  try {
    return execSync("git rev-parse --short HEAD", {
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
  } catch {
    // No git, or no commits yet. The timestamp alone still identifies a build.
    return "nogit";
  }
}

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  /**
   * There is no lobby yet, so the app opens on the first game in the shelf.
   *
   * This is a routing rule and not a `redirect()` in a page component, which is
   * what it used to be. That version was actively dangerous here: `redirect()`
   * throws, and Next answers the request with a *complete* 200 document whose
   * page segment is a `NEXT_REDIRECT` error to be replayed in the browser. So
   * every single load rendered the whole window, then hydrated an error into
   * it. React's development build logs an errored component to the performance
   * track, that call computes a negative start timestamp for a component which
   * threw before it rendered, and `performance.measure` refuses it with an
   * uncaught TypeError — which lands mid-hydration and takes the tree with it.
   *
   * The visible result is the one failure this app cannot have: a blank
   * full-screen iframe still holding the game's input focus, with no way back
   * out (components/tablet.tsx).
   *
   * Answering at the routing layer means `/` is a 307 before any React runs.
   * Redirects are matched ahead of filesystem routes, so there is deliberately
   * no `app/page.tsx` — this is the whole of what `/` does.
   *
   * Not `permanent`: browsers cache a 308 indefinitely, and this is a
   * placeholder for a lobby rather than a fact about the app.
   */
  async redirects() {
    return [{ source: "/", destination: GAMES[0].href, permanent: false }];
  },
  /*
    The dev indicator floats over the app's own bottom-right corner, which is
    where the resize grip lives — in dev it sits on top of the one control the
    window is meant to be grabbed by. Compile and runtime errors still surface.
  */
  devIndicators: false,
  generateBuildId: () => BUILD_ID,
  /* Inlined into the client bundle, so the page carries the build it came from. */
  env: { NEXT_PUBLIC_BUILD_ID: BUILD_ID },
  experimental: {
    /*
      `@phosphor-icons/react` is a barrel over ~3000 icon modules, and importing
      a handful by name pulls the lot. In dev that is thousands of module
      requests standing between load and hydration — the window paints, but
      nothing in it responds until they land. Next names this package
      specifically in its local-development guide.
    */
    optimizePackageImports: ["@phosphor-icons/react"],
  },
};

export default nextConfig;
