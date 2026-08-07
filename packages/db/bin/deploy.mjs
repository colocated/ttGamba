#!/usr/bin/env node
/**
 * `tt-db-deploy` — apply an app's pending migrations to Turso.
 *
 * Run from an app directory, which is where an app's `db:deploy` script runs it
 * from:
 *
 *   tt-db-deploy                    # ./prisma/migrations
 *   tt-db-deploy some/other/dir
 *
 * `dotenv/config` is imported here rather than in the library so that
 * `deployMigrations` stays callable from something that has already arranged
 * its own environment — a deploy job with real secrets should not have a `.env`
 * file quietly override them.
 */

import { resolve } from "node:path";

import "dotenv/config";

import { deployMigrations } from "../src/migrate.mjs";

const migrationsDir = resolve(process.cwd(), process.argv[2] ?? "prisma/migrations");

try {
  await deployMigrations({ migrationsDir });
} catch (error) {
  // The message is the useful part — a stack trace through the libSQL client
  // says nothing about which migration stopped, and the errors thrown in there
  // are written to be read.
  console.error(`\n${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
