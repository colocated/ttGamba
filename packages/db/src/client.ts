import "server-only";

/**
 * The application's database handle — everything about it except the schema.
 *
 * ```ts
 * import "server-only";
 * import { createPrismaSingleton, libsqlAdapter } from "@tt/db";
 * import { PrismaClient } from "./generated/prisma/client";
 *
 * export const prisma = createPrismaSingleton(
 *   () => new PrismaClient({ adapter: libsqlAdapter() }),
 * );
 * ```
 *
 * This package never names `PrismaClient`. `prisma generate` writes a client
 * built from one schema into the app that owns it, so its type cannot exist in
 * a package several apps share — naming it here could only mean widening it to
 * `PrismaClient<any>` and discarding every model type.
 *
 * Instead `createPrismaSingleton` is generic and takes a factory. The app
 * constructs its client, the type is inferred from that call, and the package
 * supplies only what is schema-independent: connection config and process
 * lifetime. Anything the app wraps the client in — a `$extends` cache, logging,
 * soft delete — goes inside the factory and keeps its types.
 */

import { PrismaLibSql } from "@prisma/adapter-libsql";

import { libsqlConfig } from "./env.mjs";
import { devSingleton } from "./singleton";

export { databaseUrl, libsqlConfig } from "./env.mjs";

/**
 * A Prisma driver adapter pointed at whatever the environment describes.
 *
 * Prisma 7 ships no query engine binary and cannot reach a database without an
 * adapter, so `new PrismaClient()` on its own will not work.
 */
export function libsqlAdapter(): PrismaLibSql {
  return new PrismaLibSql(libsqlConfig());
}

/**
 * One client per process, surviving dev's hot reload.
 *
 * Without this, every edit re-evaluates the calling module and leaks a
 * connection pool, until the libSQL server refuses more connections.
 *
 * @param create Builds the client. Called only on a cache miss.
 * @param key Distinguishes handles if an app holds more than one.
 */
export function createPrismaSingleton<T>(create: () => T, key = "prisma"): T {
  return devSingleton(key, create);
}
