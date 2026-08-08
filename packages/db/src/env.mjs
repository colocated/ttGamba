/**
 * Where the database is, according to the environment.
 *
 * Plain JavaScript with JSDoc types rather than TypeScript, because the
 * migration deployer runs under bare `node` — deploying must not depend on a
 * TypeScript runner being installed wherever it happens. The TypeScript side
 * imports this file and gets the types out of the JSDoc.
 */

/**
 * The one URL both the app and the Prisma CLI read.
 *
 * Postgres needs no split between the two the way Turso did — the schema
 * engine speaks the same protocol the app connects with, so there is nothing
 * here for `prisma.config.ts` to avoid.
 *
 * @returns {string}
 */
export function databaseUrl() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "No database URL. Set DATABASE_URL — copy .env.example to .env for local development.",
    );
  }
  return url;
}
