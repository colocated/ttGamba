/**
 * Applies pending migrations to Turso.
 *
 * `prisma migrate deploy` cannot do this. The schema engine only speaks `file:`
 * and rejects a `libsql://` URL outright, so the CLI's reach stops at the local
 * dev database — which is why migrations are *authored* with `prisma migrate
 * dev` and shipped with this.
 *
 * What it is not is a second opinion about what a migration means. It runs the
 * same `migration.sql` files Prisma generated, in the same order, and records
 * them in the same `_prisma_migrations` table with the same sha256 checksums —
 * so a Turso database deployed this way is one Prisma's own tooling recognises.
 *
 * Plain JavaScript, and run with bare `node`, so deploying does not depend on a
 * TypeScript runner being installed wherever this runs.
 *
 *   node prisma/deploy-turso.mjs
 */

import { createHash, randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import "dotenv/config";
import { createClient } from "@libsql/client";

const MIGRATIONS = join(dirname(fileURLToPath(import.meta.url)), "migrations");

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

// The same resolution lib/db.ts uses, so what gets migrated is what the app
// will read. See the note there on why there are two names, and why this is
// `||` rather than `??`.
const url = process.env.TURSO_DATABASE_URL || process.env.DATABASE_URL;
if (!url) {
  throw new Error("Set TURSO_DATABASE_URL (or DATABASE_URL) to the target database.");
}

// Guard rails, not policy: pointing this at the dev file would work, and would
// also be a sign that the production URL never made it into the environment.
if (url.startsWith("file:")) {
  console.warn(`! Target is a local file (${url}), not Turso.`);
  console.warn("  Use `prisma migrate dev` for the dev database.");
}

const client = createClient({
  url,
  ...(process.env.TURSO_AUTH_TOKEN ? { authToken: process.env.TURSO_AUTH_TOKEN } : {}),
});

await client.execute(BOOKKEEPING);

const applied = new Map(
  (
    await client.execute(
      'SELECT "migration_name", "checksum", "finished_at" FROM "_prisma_migrations"',
    )
  ).rows.map((row) => [row.migration_name, row]),
);

// Prisma names migrations with a leading timestamp, so lexical order is the
// order they were written in.
const names = (await readdir(MIGRATIONS, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

let pending = 0;

for (const name of names) {
  const sql = await readFile(join(MIGRATIONS, name, "migration.sql"), "utf8");
  const checksum = createHash("sha256").update(sql).digest("hex");
  const record = applied.get(name);

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
    // needing a human — the next run refuses rather than guessing how far it got.
    await client.execute({
      sql: 'INSERT INTO "_prisma_migrations" ("id", "checksum", "migration_name", "started_at", "logs", "applied_steps_count") VALUES (?, ?, ?, ?, ?, 0)',
      args: [randomUUID(), checksum, name, startedAt, String(error)],
    });
    console.log("failed");
    throw error;
  }

  await client.execute({
    sql: 'INSERT INTO "_prisma_migrations" ("id", "checksum", "migration_name", "started_at", "finished_at", "applied_steps_count") VALUES (?, ?, ?, ?, ?, 1)',
    args: [randomUUID(), checksum, name, startedAt, Date.now()],
  });

  console.log("done");
  pending += 1;
}

console.log(
  pending === 0
    ? `No pending migrations. ${names.length} already applied.`
    : `Applied ${pending} migration${pending === 1 ? "" : "s"}.`,
);

client.close();
