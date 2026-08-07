import "server-only";

/**
 * Optional Redis query caching, as a Prisma client extension.
 *
 * Wraps `prisma-extension-redis`, which derives cache keys from the model,
 * operation and arguments, and purges a model's keys when a write to it
 * succeeds. No key is maintained by hand.
 *
 * ```ts
 * export const prisma = createPrismaSingleton(() =>
 *   new PrismaClient({ adapter: libsqlAdapter() }).$extends(
 *     redisCache({ prefix: "myapp", models: [{ model: "Game", ttl: 300 }] }),
 *   ),
 * );
 * ```
 *
 * Three properties worth knowing before using it:
 *
 * **Nothing is cached until a model is named.** A model absent from `models` is
 * never auto-cached. For anything holding money or permissions that is the only
 * correct setting: a cached role is a revoked role that still works, and a
 * cached balance is chips that can be spent twice.
 *
 * **Caching is optional at runtime, not at compile time.** Without `REDIS_URL`
 * the extension is still applied, with caching disabled and a backend that
 * stores nothing. `$extends` changes the client's *type*, so a cache that came
 * and went with an environment variable would give an app one `prisma` type
 * locally and another in production.
 *
 * **A Redis failure is not a query failure.** Cache errors are reported to
 * `onError` and never rethrown, so an outage degrades to reading the database.
 */

import { Redis } from "ioredis";
import {
  PrismaExtensionRedis,
  type AutoCacheConfig,
  type RedisApi,
  type RedisClientInput,
} from "prisma-extension-redis";
import superjson from "superjson";

import { devSingleton } from "./singleton";

/**
 * Per-model cache configuration.
 *
 * Derived rather than imported: the extension declares `ModelConfig` but does
 * not export it. Reaching it through the exported `AutoCacheConfig` keeps this
 * in step with the package rather than being a copy that can rot.
 */
export type ModelConfig = NonNullable<Exclude<AutoCacheConfig, boolean>["models"]>[number];

/**
 * Freshness, in seconds, for a model that does not set its own `ttl`.
 *
 * A package constant rather than a config option: most models that are worth
 * naming state their own ttl, so an app-level default would sit in the config
 * governing nothing while appearing to govern everything.
 */
export const DEFAULT_TTL = 60;

/**
 * Extra window, in seconds, after `ttl` during which stale data is served while
 * a refresh runs behind it. Keys live for `ttl + stale` in total.
 *
 * Zero: serving known-stale data is something a model opts into.
 */
export const DEFAULT_STALE = 0;

export type RedisCacheOptions = {
  /**
   * Which models to cache, and how. Naming a model is what opts it in.
   *
   * Each entry may set its own `ttl` and `stale`, an `excludedOperations` list
   * to keep particular query types uncached, and `invalidateOnWrite: false` to
   * stop writes purging it. Omit `ttl` and the model gets {@link DEFAULT_TTL}.
   *
   * ```ts
   * models: [
   *   { model: "Game", ttl: 300 },
   *   { model: "Tier", ttl: 300, excludedOperations: ["count"] },
   *   { model: "Session" },                 // DEFAULT_TTL
   * ]
   * ```
   */
  models?: readonly ModelConfig[];
  /** Key prefix, so two apps sharing one Redis cannot read each other's entries. */
  prefix?: string;
  /**
   * Where cache failures are reported. They are never thrown.
   *
   * Defaults to a throttled `console.warn`. Leaving it unset entirely would make
   * a model that fails to cache indistinguishable from one that caches fine.
   */
  onError?: (error: unknown) => void;
  /** Supply your own client instead of one built from `REDIS_URL`. */
  client?: RedisClientInput;
};

/** Whether a Redis URL is configured. */
export function cacheConfigured(): boolean {
  return Boolean(process.env.REDIS_URL);
}

/**
 * How cached rows are written and read back.
 *
 * `superjson` rather than `JSON`, because Prisma rows are not JSON and the two
 * types that break it fail in opposite, equally unhelpful ways:
 *
 * - **`BigInt` throws.** The extension catches it and reports it, so a model
 *   with a `BigInt` column caches nothing at all — with no keys and no error
 *   visible unless `onError` is set.
 * - **`Date` does not throw.** It serialises to an ISO string and comes back a
 *   string, so a query returns a `Date` on a cache miss and a `string` on a hit
 *   while its type still says `Date`.
 *
 * superjson records types alongside the data and restores them, so a cached row
 * is the row.
 */
const transformer = {
  serialize: (data: unknown) => superjson.stringify(data),
  deserialize: (data: unknown) => superjson.parse(String(data)),
};

/**
 * A backend that stores nothing, used when no `REDIS_URL` is set.
 *
 * Present to satisfy the extension's type. It is paired with caching disabled,
 * so nothing calls it on a query path.
 */
function nullBackend(): RedisApi {
  return {
    async get() {
      return null;
    },
    async set() {
      return null;
    },
    async jsonGet() {
      return null;
    },
    async jsonSet() {
      return null;
    },
    async del() {
      return 0;
    },
    async unlink() {
      return 0;
    },
    async scan() {
      return { cursor: "0", keys: [] };
    },
    async ping() {
      return "PONG";
    },
  };
}

/** How long the same cache complaint stays quiet after being reported once. */
const WARN_EVERY = 60_000;
const warned = new Map<string, number>();

/**
 * The default `onError`: report once, then stay quiet about the same message
 * for {@link WARN_EVERY}.
 *
 * Throttled because the failure this most often reports is a Redis that has
 * gone away, and one line per failed query would turn a survivable outage into
 * a log flood.
 */
function warn(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const now = Date.now();
  const last = warned.get(message);
  if (last !== undefined && now - last < WARN_EVERY) return;

  warned.set(message, now);
  console.warn(`[cache] ${message}`);
}

/**
 * The one connection this module holds.
 *
 * Two memos, because they cover different problems. The module-level `shared`
 * is what stops a second caller — `flushCache`, say — opening a second
 * connection in production, where `devSingleton` deliberately caches nothing.
 * `devSingleton` is what carries the connection across a hot reload in
 * development, where the module-level one is thrown away on every edit.
 */
let shared: Redis | null = null;

function sharedRedis(url: string, onError?: (error: unknown) => void): Redis {
  shared ??= devSingleton("redis", () => connect(url, onError));
  return shared;
}

/**
 * Open the Redis connection. Three options are load-bearing:
 *
 * - **`enableOfflineQueue: false`.** ioredis otherwise queues commands while
 *   disconnected and replays them on reconnect. A cache command that succeeds
 *   after its request has gone is worse than one that fails immediately and
 *   lets the query read the database.
 * - **`maxRetriesPerRequest: 2`.** The default is 20, which is a lot of round
 *   trips to avoid reading a database that is already there.
 * - **The `error` listener.** ioredis emits `error` on a dropped connection, and
 *   an EventEmitter with no `error` listener throws. Without this line an
 *   unreachable Redis takes the Node process down instead of disabling caching.
 */
function connect(url: string, onError?: (error: unknown) => void): Redis {
  const client = new Redis(url, {
    maxRetriesPerRequest: 2,
    enableOfflineQueue: false,
    connectTimeout: 5_000,
  });

  client.on("error", (error) => {
    if (onError) onError(error);
    else warn(error);
  });

  return client;
}

/**
 * Build the cache extension.
 *
 * Reads of a named model are served from Redis while fresh; writes to it purge
 * its entries. Everything else goes straight to the database.
 */
export function redisCache({
  models = [],
  prefix,
  onError,
  client,
}: RedisCacheOptions = {}) {
  const url = process.env.REDIS_URL;

  const redis =
    client ??
    (url
      ? sharedRedis(url, onError)
      : // No URL, no connection attempt.
        nullBackend());

  const enabled = Boolean(client) || Boolean(url);
  const named = models.map((entry) => entry.model);

  return PrismaExtensionRedis({
    client: redis,
    config: {
      // `JSON` would require the RedisJSON module, which a stock Redis and
      // Dragonfly do not have; choosing it without it fails at runtime.
      type: "STRING",
      // The extension's own fallback for a model that carries no ttl or stale.
      ttl: DEFAULT_TTL,
      stale: DEFAULT_STALE,
      cacheKey: prefix ? { prefix } : undefined,
      transformer,
      onError: onError ?? warn,
      // `false` disables auto-caching entirely — the case for an app with no
      // Redis, and for one that has named no models.
      auto:
        enabled && named.length > 0
          ? {
              includedModels: named,
              // Copied: the extension's type wants a mutable array, and it
              // should not be handed one the caller still holds.
              models: [...models],
              invalidateOnWrite: true,
              ttl: DEFAULT_TTL,
              stale: DEFAULT_STALE,
            }
          : false,
    },
  });
}

/**
 * Throw away cached entries.
 *
 * The escape hatch for when something looks wrong and you do not want to wait
 * out a TTL — a role changed outside the app, a bad deploy, a suspicion. Safe
 * to call at any time: everything here is a cache, so the worst case is that
 * the next few queries read the database.
 *
 * Scans and unlinks rather than issuing `FLUSHDB`, so one app cannot wipe
 * another's entries off a shared Redis. `UNLINK` frees the keys on a background
 * thread, which matters if there are a lot of them.
 *
 * @param prefix The app's cache prefix. Required — without one this would have
 *   to match every key on the server, which is precisely what it must not do.
 * @returns How many keys were removed. Zero if no Redis is configured.
 */
export async function flushCache(prefix: string): Promise<{ deleted: number }> {
  const url = process.env.REDIS_URL;
  if (!url || !prefix) return { deleted: 0 };

  const redis = sharedRedis(url);
  const match = `${prefix}:*`;
  let cursor = "0";
  let deleted = 0;

  do {
    const [next, batch] = await redis.scan(cursor, "MATCH", match, "COUNT", 500);
    cursor = next;
    // A SCAN pass can return nothing and still not be finished, so the cursor
    // is what ends this rather than an empty batch.
    if (batch.length > 0) deleted += await redis.unlink(...batch);
  } while (cursor !== "0");

  return { deleted };
}
