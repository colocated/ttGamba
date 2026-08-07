import type { NextConfig } from "next";
import { withUserApp } from "@tt/window/next-config";

/*
  `withUserApp` supplies everything that is true of every user app in this
  workspace: standalone output, the tracing root that makes it work in a pnpm
  monorepo, `transpilePackages` for the two workspace packages, the build id the
  update banner compares against, and the Phosphor barrel workaround. See
  packages/window/src/next-config.ts — each of those has a reason and most of
  them fail quietly rather than loudly.

  What is left here is ttGamba's alone.
*/
const nextConfig: NextConfig = {
  reactCompiler: true,
  /**
   * The app opens on the games index.
   *
   * It used to open on the first game in the shelf, which was possible because
   * the shelf was a constant this file could import. Games are database rows
   * now (prisma/schema.prisma) and there is no first game at build time, so the
   * redirect has to land somewhere that does not depend on one. `/play` is the
   * list itself — which is the better door anyway, since opening on blackjack
   * told every player that blackjack was the point of the app.
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
   * out.
   *
   * Answering at the routing layer means `/` is a 307 before any React runs.
   * Redirects are matched ahead of filesystem routes, so there is deliberately
   * no `app/page.tsx` — this is the whole of what `/` does.
   *
   * Not `permanent`: browsers cache a 308 indefinitely, and where the app opens
   * is a decision rather than a fact about the app.
   */
  async redirects() {
    return [{ source: "/", destination: "/play", permanent: false }];
  },
};

export default withUserApp(nextConfig);
