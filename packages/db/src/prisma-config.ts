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

/**
 * An app's `prisma.config.ts` in one line:
 *
 * ```ts
 * import { userAppPrismaConfig } from "@tt/db/prisma-config";
 * export default userAppPrismaConfig();
 * ```
 *
 * Reads `DATABASE_URL` directly rather than through `env.mjs`'s `databaseUrl`
 * — that one throws when it is unset, which is right for the app but wrong
 * here: `prisma generate` needs no database at all, and should keep working
 * without one rather than fail for a reason that has nothing to do with what
 * someone is doing.
 */
export function userAppPrismaConfig(
  overrides: Partial<Parameters<typeof defineConfig>[0]> = {},
) {
  return defineConfig({
    schema: "prisma/schema.prisma",
    migrations: { path: "prisma/migrations" },
    datasource: { url: process.env.DATABASE_URL },
    ...overrides,
  });
}
