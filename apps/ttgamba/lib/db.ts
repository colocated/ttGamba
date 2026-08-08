import "server-only";

/**
 * ttGamba's database handle.
 *
 * The plumbing — URL resolution, the Postgres adapter, one client per process,
 * the Redis cache extension — is `@tt/db`. What stays here is what cannot be
 * shared: `PrismaClient` is generated from this app's schema, so `prisma`
 * below is typed against this app's models alone.
 *
 * See DEPLOYMENT.md for where `DATABASE_URL` comes from in each environment.
 */

import { createPrismaSingleton, pgAdapter } from "@tt/db";
import { redisCache } from "@tt/db/cache";

import { PrismaClient } from "./generated/prisma/client";
import { CACHE_PREFIX } from "./keys";

/**
 * What is cached, and — the load-bearing part — what is not.
 *
 * Caching is opt-in per model:
 *
 * | Model | Cached | Why |
 * | --- | --- | --- |
 * | `Game`, `Tier` | yes, 300s | Read on every app load, written only by the admin panel. |
 * | `User` | yes, 60s | Identity and role. Read on every navigation and every desk call; written only by `setRole`. |
 * | `Balance` | **never** | Chips. Moves on every settled request and every payout. |
 * | `Request` | **never** | The banker queue: money mid-flight, with held chips riding on its status. |
 * | `Table`, `TableSeat`, `Shoe` | **never** | Live game state, swept by a poll (lib/tables.ts). |
 * | `AuditEvent` | **never** | Append-only, and read exactly when a stale answer is least welcome. |
 *
 * Adding a model: cache what an administrator edits, never what a player's
 * money depends on.
 *
 * ── Two things `User` caching rests on ────────────────────────────────────
 * **A role is only ever written through Prisma.** `setRole` (lib/banker.ts) is
 * the one path, and going through the client is what purges the cached row on
 * the spot. Editing a role directly in `pnpm db:studio` bypasses that — the
 * change is real but invisible for up to the TTL below, which is why the panel
 * exists and why the TTL is a minute rather than an hour.
 *
 * **A `User` is never read with its balance included.** `include: { balance }`
 * would put chips inside a cached row, where none of the invalidation that
 * protects `Balance` applies — the extension does not see writes through a
 * relation. Read them as two queries; lib/account.ts is the example.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Writes purge what they touch, so the admin panel sees its own save
 * immediately. With no `REDIS_URL` this is inert and development needs no Redis.
 */
const cache = redisCache({
  prefix: CACHE_PREFIX,
  models: [
    { model: "Game", ttl: 300 },
    { model: "Tier", ttl: 300 },
    // Shorter than the catalogue: a stale role is a permission, and a minute is
    // the longest anyone should have to wait for a revocation made outside the
    // panel to take effect. The admin cache flush is the way to cut it short.
    { model: "User", ttl: 60 },
  ],
});

export const prisma = createPrismaSingleton(() =>
  new PrismaClient({ adapter: pgAdapter() }).$extends(cache),
);
