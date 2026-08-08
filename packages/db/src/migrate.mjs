/**
 * Applies pending Prisma migrations directly, without the `prisma` CLI.
 *
 * `prisma migrate deploy` is the ordinary way to do this and is what
 * `pnpm db:deploy` runs everywhere the full CLI is available — a dev machine,
 * CI. This exists for the one place it is not: the runtime container. Next's
 * standalone output only traces the JS actually reachable from a request, and
 * nothing at request time imports the CLI or its query-engine binaries, so
 * they never make it into that image. Shipping them just to run migrations
 * once at boot would undo most of what standalone output is for.
 *
 * So this talks to Postgres directly with `pg` — already in the image, since
 * the app's own queries need it — and does the same bookkeeping the CLI does:
 * the same `_prisma_migrations` table, the same sha256 checksums, the same
 * refusal to touch a migration that has changed or died mid-flight. A database
 * migrated this way is one `prisma migrate status` still recognises.
 *
 * Plain JavaScript so it never depends on a TypeScript runner, matching every
 * other file in this package that runs outside Next's build.
 */

import { createHash, randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import pg from "pg";

import { databaseUrl } from "./env.mjs";

/** Prisma's own table, verbatim. A different shape here would strand the CLI. */
const BOOKKEEPING = `
CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
    "id"                    VARCHAR(36) PRIMARY KEY NOT NULL,
    "checksum"              VARCHAR(64) NOT NULL,
    "finished_at"           TIMESTAMPTZ,
    "migration_name"        VARCHAR(255) NOT NULL,
    "logs"                  TEXT,
    "rolled_back_at"        TIMESTAMPTZ,
    "started_at"            TIMESTAMPTZ NOT NULL DEFAULT now(),
    "applied_steps_count"   INTEGER NOT NULL DEFAULT 0
)`;

/**
 * @param {object} options
 * @param {string} options.migrationsDir Absolute path to `prisma/migrations`.
 * @param {(message: string) => void} [options.log]
 * @returns {Promise<{ applied: string[], total: number }>}
 */
export async function deployMigrations({ migrationsDir, log = console.log }) {
  const client = new pg.Client({ connectionString: databaseUrl() });
  await client.connect();

  try {
    await client.query(BOOKKEEPING);

    const done = new Map(
      (
        await client.query(
          'SELECT "migration_name", "checksum", "finished_at" FROM "_prisma_migrations"',
        )
      ).rows.map((row) => [row.migration_name, row]),
    );

    // Prisma names migrations with a leading timestamp, so lexical order is the
    // order they were written in.
    const names = (await readdir(migrationsDir, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();

    const applied = [];

    for (const name of names) {
      const sql = await readFile(join(migrationsDir, name, "migration.sql"), "utf8");
      const checksum = createHash("sha256").update(sql).digest("hex");
      const record = done.get(name);

      if (record) {
        // An edited migration is the one failure worth stopping for: the database
        // was built by the old text, and no amount of re-running the new one will
        // reconcile that. Prisma refuses here too.
        if (record.checksum !== checksum) {
          throw new Error(
            `Migration ${name} has changed since it was applied. The deployed ` +
              `database was built from different SQL — resolve by hand rather ` +
              `than re-running it.`,
          );
        }
        if (record.finished_at === null) {
          throw new Error(
            `Migration ${name} was started but never finished. The database may ` +
              `be half-migrated; inspect it before deploying again.`,
          );
        }
        continue;
      }

      log(`Applying ${name}...`);
      const startedAt = new Date();

      try {
        // Postgres's simple query protocol implicitly wraps a multi-statement
        // string like this in a transaction, so a `migration.sql` with several
        // statements cannot half-apply.
        await client.query(sql);
      } catch (error) {
        // Recorded with no `finished_at`, which is what marks the database as
        // needing a human — the next run refuses rather than guessing how far
        // it got.
        await client.query(
          'INSERT INTO "_prisma_migrations" ("id", "checksum", "migration_name", "started_at", "logs", "applied_steps_count") VALUES ($1, $2, $3, $4, $5, 0)',
          [randomUUID(), checksum, name, startedAt, String(error)],
        );
        log(`${name} failed`);
        throw error;
      }

      await client.query(
        'INSERT INTO "_prisma_migrations" ("id", "checksum", "migration_name", "started_at", "finished_at", "applied_steps_count") VALUES ($1, $2, $3, $4, $5, 1)',
        [randomUUID(), checksum, name, startedAt, new Date()],
      );

      applied.push(name);
    }

    log(
      applied.length === 0
        ? `No pending migrations. ${names.length} already applied.`
        : `Applied ${applied.length} migration${applied.length === 1 ? "" : "s"}.`,
    );

    return { applied, total: names.length };
  } finally {
    // In a `finally` so a thrown migration still closes its connection — this
    // is callable more than once per process.
    await client.end();
  }
}
