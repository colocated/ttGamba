import "server-only";

/**
 * The database handle.
 *
 * Turso is libSQL, which is SQLite, so one client covers both ends: the same
 * `@libsql/client` reads a `file:` database in development and speaks the
 * remote protocol to Turso in production. Nothing here branches on which — the
 * URL decides.
 *
 * Prisma 7 has no query engine binary to talk to a database on its own; a
 * driver adapter is how it gets one. That is why this file exists rather than
 * a bare `new PrismaClient()`.
 *
 * See DEPLOYMENT.md for where these variables come from and how the schema
 * reaches Turso, which is not `prisma migrate deploy`.
 */

import type { Config } from "@libsql/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";

import { PrismaClient } from "./generated/prisma/client";

/**
 * Two names for the same slot, and the split is deliberate.
 *
 * `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` are Turso's own names — what their
 * docs use, what `turso` CLI examples assume, and what their Vercel and
 * Netlify integrations inject into a deployment without being asked. Taking
 * them as-is means production is configured by connecting the integration and
 * nothing else.
 *
 * `DATABASE_URL` stays the development fallback because it is the one the
 * Prisma CLI reads (see prisma.config.ts). Migrations are authored against the
 * local file, so the CLI's variable and the dev database's variable want to be
 * the same one — while production, which the CLI cannot reach at all, is
 * described entirely by Turso's pair.
 */
function config(): Config {
  // `||`, not `??`. A variable left blank in a `.env` file is an empty string
  // rather than absent, and `.env.example` ships exactly that — so `??` would
  // read the blank as a deliberate choice and refuse to fall back.
  const url = process.env.TURSO_DATABASE_URL || process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "No database URL. Set TURSO_DATABASE_URL in production, or copy " +
        ".env.example to .env for local development.",
    );
  }

  // Harmless against a `file:` URL, which ignores it, so this needs no guard
  // for which end it is talking to. Absent for a local `turso dev` server too.
  const authToken = process.env.TURSO_AUTH_TOKEN;
  return authToken ? { url, authToken } : { url };
}

/**
 * One client per process, kept on `globalThis` because dev's hot reload
 * re-evaluates this module on every change. A fresh client each time would
 * leak a connection pool per edit until the libSQL server refused any more —
 * which presents as the app working for ten minutes and then not.
 */
const globalForPrisma = globalThis as typeof globalThis & {
  prisma?: PrismaClient;
};

export const prisma =
  globalForPrisma.prisma ?? new PrismaClient({ adapter: new PrismaLibSql(config()) });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
