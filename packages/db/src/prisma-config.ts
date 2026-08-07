/**
 * The Prisma CLI's configuration, which is the same for every app here.
 *
 * Not `server-only` and not part of the main entry: this is read by the `prisma`
 * CLI in a plain Node process, long before anything Next has touched.
 */

// The Prisma CLI runs in a bare Node process that has not read `.env`, and
// `datasource.url` below is required for `migrate dev`. Without this the CLI
// fails with "The datasource.url property is required in your Prisma config
// file" — and only for the migrate commands, so `generate` keeps working and
// hides it.
import "dotenv/config";
import { defineConfig } from "prisma/config";

import { cliDatabaseUrl } from "./env.mjs";

/**
 * An app's `prisma.config.ts` in one line:
 *
 * ```ts
 * import { userAppPrismaConfig } from "@tt/db/prisma-config";
 * export default userAppPrismaConfig();
 * ```
 *
 * The datasource is `DATABASE_URL` and deliberately never Turso —
 * `cliDatabaseUrl` explains why at length, and it is the kind of thing that
 * breaks on someone else's machine rather than yours.
 */
export function userAppPrismaConfig(
  overrides: Partial<Parameters<typeof defineConfig>[0]> = {},
) {
  return defineConfig({
    schema: "prisma/schema.prisma",
    migrations: { path: "prisma/migrations" },
    datasource: { url: cliDatabaseUrl() },
    ...overrides,
  });
}
