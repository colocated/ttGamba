/**
 * One of a thing per process, surviving dev's hot reload.
 *
 * The Prisma client and the Redis connection share a problem: dev re-evaluates
 * the module that constructs them on every save, leaking a connection pool per
 * edit until the server refuses more.
 *
 * Cached in development only. In production the module is evaluated once, and a
 * global would only be a strong reference to a handle nothing can replace.
 */
export function devSingleton<T>(key: string, create: () => T): T {
  const store = globalThis as typeof globalThis & {
    __ttDb?: Record<string, unknown>;
  };

  const existing = store.__ttDb?.[key] as T | undefined;
  if (existing) return existing;

  const value = create();

  if (process.env.NODE_ENV !== "production") {
    store.__ttDb ??= {};
    store.__ttDb[key] = value;
  }

  return value;
}
