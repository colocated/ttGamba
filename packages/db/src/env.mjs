/**
 * Where the database is, according to the environment.
 *
 * Plain JavaScript with JSDoc types rather than TypeScript, because the
 * migration deployer runs under bare `node` — deploying must not depend on a
 * TypeScript runner being installed wherever it happens. The TypeScript side
 * imports this file and gets the types out of the JSDoc.
 *
 * Two variables name the same slot, deliberately:
 *
 * - `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` are Turso's own names, which their
 *   Vercel and Netlify integrations inject unasked. Production is configured by
 *   connecting the integration and nothing else.
 * - `DATABASE_URL` is the development fallback, and the one the Prisma CLI
 *   reads. Migrations are authored against the local file, so the CLI's variable
 *   and the dev database's variable are the same one.
 */

/**
 * The URL the *application* should read, Turso first.
 *
 * `||`, not `??`. A variable left blank in a `.env` file is an empty string
 * rather than absent, and a `.env.example` ships exactly that — so `??` would
 * read the blank as a deliberate choice and refuse to fall back.
 *
 * @returns {string}
 */
export function databaseUrl() {
  const url = process.env.TURSO_DATABASE_URL || process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "No database URL. Set TURSO_DATABASE_URL in production, or copy " +
        ".env.example to .env for local development.",
    );
  }
  return url;
}

/**
 * A `@libsql/client` config for whichever end the environment points at.
 *
 * Turso is libSQL, which is SQLite, so one client covers both: the same
 * `@libsql/client` reads a `file:` database in development and speaks the
 * remote protocol to Turso in production. Nothing branches on which — the URL
 * decides.
 *
 * @returns {{ url: string, authToken?: string }}
 */
export function libsqlConfig() {
  const url = databaseUrl();

  // Harmless against a `file:` URL, which ignores it, so this needs no guard
  // for which end it is talking to. Absent for a local `turso dev` server too.
  const authToken = process.env.TURSO_AUTH_TOKEN;
  return authToken ? { url, authToken } : { url };
}

/**
 * The URL the **Prisma CLI** should read — `DATABASE_URL` and nothing else.
 *
 * Deliberately no Turso fallback. The schema engine only speaks `file:` and
 * rejects `libsql://`, so resolving this the way the app does would break
 * `prisma migrate dev` for anyone who happens to have Turso credentials in
 * their environment.
 *
 * Migrations are authored against the local file and shipped to Turso as SQL by
 * `tt-db-deploy`. The CLI never reads production.
 *
 * @returns {string | undefined}
 */
export function cliDatabaseUrl() {
  return process.env.DATABASE_URL;
}
