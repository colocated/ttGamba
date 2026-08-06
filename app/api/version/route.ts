/**
 * The build the *server* is currently serving.
 *
 * The value is inlined at build time, so a redeployed server answers with its
 * own id while an already-open app still holds the one it was built from.
 * Comparing the two is how the app knows it is stale. See lib/version.ts.
 */

/** Never prerendered or cached — a stale answer here defeats the whole point. */
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(
    { buildId: process.env.NEXT_PUBLIC_BUILD_ID ?? null },
    { headers: { "cache-control": "no-store" } },
  );
}
