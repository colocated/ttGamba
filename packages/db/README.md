# @tt/db

Turso/libSQL wiring for a user app: connection config, one client per process,
and the migration deployer. **No schema, no models, no generated client** —
those belong to the app and cannot be anywhere else.

```ts
// apps/<app>/lib/db.ts — the whole file
import "server-only";
import { createPrismaSingleton, libsqlAdapter } from "@tt/db";
import { PrismaClient } from "./generated/prisma/client";

export const prisma = createPrismaSingleton(
  () => new PrismaClient({ adapter: libsqlAdapter() }),
);
```

```ts
// apps/<app>/prisma.config.ts — likewise
import { userAppPrismaConfig } from "@tt/db/prisma-config";
export default userAppPrismaConfig();
```

```jsonc
// apps/<app>/package.json
"scripts": { "db:deploy": "tt-db-deploy" }
```

## How a shared package holds a per-app client

It doesn't, and that is the design.

`prisma generate` writes a client built from *one* schema into the app that owns
it, so its type describes that app's models and no other. A package shared by
several apps cannot name that type — any attempt would be a lie or a
`PrismaClient<any>` that threw every model away, which is most of the reason to
use Prisma at all.

So `createPrismaSingleton` is **generic in the client and takes a factory**. The
app constructs its own client, the type is inferred from that call, and the
package contributes only the parts that have nothing to do with the schema:
where the database is, and how long the handle lives. `prisma` in the app is
fully typed, not widened.

The same seam is where the cache goes — see below. Anything you would
`$extends` onto the client goes inside the factory, its type flows out through
the generic unchanged, and it stays the app's decision rather than something
every app inherits.

## Caching

`@tt/db/cache` wraps [`prisma-extension-redis`][pxr], which derives cache keys
from the model, operation and arguments — nothing here maintains a key per
model by hand — and purges a model's keys when a write to it succeeds.

[pxr]: https://github.com/yxx4c/prisma-extension-redis

```ts
export const prisma = createPrismaSingleton(() =>
  new PrismaClient({ adapter: libsqlAdapter() }).$extends(
    redisCache({
      prefix: "myapp",
      models: [
        { model: "Game", ttl: 300 },
        { model: "Tier", ttl: 300, excludedOperations: ["count"] },
        { model: "Session" }, // DEFAULT_TTL
      ],
    }),
  ),
);
```

**Nothing is cached until a model is named.** `models` is both the opt-in list
and the per-model configuration, so per-model and per-operation tuning is the
ordinary way to use this rather than something to retrofit. Each entry takes its
own `ttl`, its own `stale`, an `excludedOperations` list, and
`invalidateOnWrite: false` to stop writes purging it.

There is deliberately **no default `ttl` on the config** — a model that omits one
gets `DEFAULT_TTL` from this package. Most models worth naming state their own
ttl, so an app-level default would sit in the config governing no query while
appearing to govern every one.

That default is the safe one rather than the convenient one. For anything
holding money or permissions it is the only correct one: a cached role is a
revoked role that still works, and a cached balance is chips that can be spent
twice.

**Optional means optional.** With no `REDIS_URL`, the extension is still applied
— with `auto: false` and a backend that stores nothing. `$extends` changes the
client's *type*, and a cache that appeared and disappeared with an environment
variable would give an app one `prisma` type locally and another in production.
The shape stays constant; only the behaviour varies.

**Rows are serialized with `superjson`, not `JSON`.** Prisma rows are not JSON,
and the two types that break it fail in opposite ways:

- `BigInt` makes `JSON.stringify` **throw**. The extension catches and reports
  it, so a model with one `BigInt` column caches *nothing* — an empty Redis is
  the only symptom.
- `Date` **succeeds**, which is worse: it goes in as an ISO string and comes back
  a string, so the same query returns a `Date` on a miss and a `string` on a hit
  while its type still says `Date`. Code calling `.getTime()` works until the
  cache is warm.

**A Redis outage is survivable.** Cache read and write errors go to `onError`
rather than being rethrown, so queries fall through to the database. `onError`
defaults to a throttled `console.warn` rather than to nothing: a model that
silently fails to cache is otherwise indistinguishable from one that works. The ioredis client is built with
`enableOfflineQueue: false` (a command that succeeds after its request is gone
is worse than one that fails immediately) and — the line that matters most —
always with an `error` listener, because an ioredis instance without one turns
an unreachable Redis into a crashed Node process.

### Adding a model to the cache

Ask whether a stale answer is merely unhelpful or actually wrong. Catalogue
rows an administrator edits are the former. Balances, roles, queues and live
game state are the latter, and belong nowhere near this.

## Modules

| | |
| --- | --- |
| `@tt/db` | `createPrismaSingleton`, `libsqlAdapter`, `libsqlConfig`. `server-only`. |
| `@tt/db/cache` | `redisCache()` — the Redis query cache extension. `server-only`. |
| `@tt/db/env` | URL and token resolution. Plain JS, no `server-only` — the deployer uses it too. |
| `@tt/db/migrate` | `deployMigrations({ migrationsDir })`. |
| `@tt/db/prisma-config` | `userAppPrismaConfig()` for the Prisma CLI. |
| `tt-db-deploy` | Bin wrapper around `deployMigrations`. Run from an app directory. |

The `.mjs` files are plain JavaScript with JSDoc types on purpose: deploying
must not depend on a TypeScript runner being installed wherever it happens.

## Two things that will bite

**The Prisma CLI must never see the Turso URL.** The schema engine only speaks
`file:` and rejects `libsql://` outright, so `prisma.config.ts` reads
`DATABASE_URL` alone while the *app* reads `TURSO_DATABASE_URL` first. Resolving
both the same way works perfectly until someone has Turso credentials in their
environment, and then `prisma migrate dev` stops working for a reason that has
nothing to do with what they were doing. `cliDatabaseUrl` vs `databaseUrl` in
`env.mjs` is that split.

**`prisma migrate deploy` cannot reach Turso**, for the same reason. Migrations
are *authored* against the local file with `prisma migrate dev` and *shipped*
with `tt-db-deploy`, which replays the same SQL in the same order and writes the
same `_prisma_migrations` rows with the same sha256 checksums — so the result is
a database `prisma migrate status` still recognises. It refuses to run if an
applied migration's checksum has changed, or if a previous run died mid-flight.
