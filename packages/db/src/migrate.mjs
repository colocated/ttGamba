/**
 * Applies pending Prisma migrations to Turso.
 *
 * `prisma migrate deploy` cannot do this. The schema engine only speaks `file:`
 * and rejects a `libsql://` URL outright, so the CLI's reach stops at the local
 * dev database — which is why migrations are *authored* with `prisma migrate
 * dev` and shipped with this.
 *
 * It is not a second opinion about what a migration means: it runs the same
 * `migration.sql` files Prisma generated, in the same order, and records them in
 * the same `_prisma_migrations` table with the same sha256 checksums. A database
 * deployed this way is one `prisma migrate status` recognises.
 *
 * Plain JavaScript so deploying never depends on a TypeScript runner. Reached as
 * `tt-db-deploy`; see bin/deploy.mjs.
 */

import { createHash, randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { createClient } from "@libsql/client";

import { databaseUrl, libsqlConfig } from "./env.mjs";

/** Prisma's own table, verbatim. A different shape here would strand the CLI. */
const BOOKKEEPING = `
CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
    "id"                    TEXT PRIMARY KEY NOT NULL,
    "checksum"              TEXT NOT NULL,
    "finished_at"           DATETIME,
    "migration_name"        TEXT NOT NULL,
    "logs"                  TEXT,
    "rolled_back_at"        DATETIME,
    "started_at"            DATETIME NOT NULL DEFAULT current_timestamp,
    "applied_steps_count"   INTEGER UNSIGNED NOT NULL DEFAULT 0
)`;

/**
 * @param {object} options
 * @param {string} options.migrationsDir Absolute path to `prisma/migrations`.
 * @param {(message: string) => void} [options.log]
 * @returns {Promise<{ applied: string[], total: number }>}
 */
export async function deployMigrations({ migrationsDir, log = console.log }) {
  // The same resolution the app uses, so what gets migrated is what the app
  // will read. See env.mjs on why there are two names.
  const url = databaseUrl();

  // Guard rails, not policy: pointing this at the dev file would work, and would
  // also be a sign that the production URL never made it into the environment.
  if (url.startsWith("file:")) {
    console.warn(`! Target is a local file (${url}), not Turso.`);
    console.warn("  Use `prisma migrate dev` for the dev database.");
  }

  const client = createClient(libsqlConfig());

  try {
    await client.execute(BOOKKEEPING);

    const done = new Map(
      (
        await client.execute(
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

      process.stdout.write(`Applying ${name}... `);
      const startedAt = Date.now();

      try {
        await client.executeMultiple(sql);
      } catch (error) {
        // Recorded with no `finished_at`, which is what marks the database as
        // needing a human — the next run refuses rather than guessing how far
        // it got.
        await client.execute({
          sql: 'INSERT INTO "_prisma_migrations" ("id", "checksum", "migration_name", "started_at", "logs", "applied_steps_count") VALUES (?, ?, ?, ?, ?, 0)',
          args: [randomUUID(), checksum, name, startedAt, String(error)],
        });
        log("failed");
        throw error;
      }

      await client.execute({
        sql: 'INSERT INTO "_prisma_migrations" ("id", "checksum", "migration_name", "started_at", "finished_at", "applied_steps_count") VALUES (?, ?, ?, ?, ?, 1)',
        args: [randomUUID(), checksum, name, startedAt, Date.now()],
      });

      log("done");
      applied.push(name);
    }

    log(
      applied.length === 0
        ? `No pending migrations. ${names.length} already applied.`
        : `Applied ${applied.length} migration${applied.length === 1 ? "" : "s"}.`,
    );

    return { applied, total: names.length };
  } finally {
    // In a `finally` so a thrown migration still closes its connection —
    // this is callable more than once per process.
    client.close();
  }
}
