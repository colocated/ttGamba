#!/usr/bin/env node
/**
 * The container's actual entrypoint — migrate, then serve.
 *
 * A relative import into `@tt/db`'s source rather than the package specifier:
 * this file is never traced by Next, since nothing at request time imports it,
 * so it runs against whatever the standalone output actually copied rather
 * than a full, resolvable `node_modules`. The monorepo's directory shape
 * survives the copy (see the Dockerfile's own note on the tracing root), so a
 * relative path does not depend on package resolution finding `@tt/db` at all
 * — only on the one file this needs actually being there, which the Dockerfile
 * copies in beside the migrations themselves.
 *
 * Set `SKIP_MIGRATIONS` to anything to boot straight to the server instead —
 * for a rollback to an image whose migrations are already applied, or a
 * multi-replica deploy where only one instance should be the one to migrate.
 */

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(here, "..");

if (process.env.SKIP_MIGRATIONS) {
  console.log("SKIP_MIGRATIONS is set — skipping migrations.");
} else {
  const { deployMigrations } = await import("../../../packages/db/src/migrate.mjs");

  try {
    await deployMigrations({ migrationsDir: path.join(appDir, "prisma", "migrations") });
  } catch (error) {
    // Fails closed: a server started against a schema its own code does not
    // match is a worse failure than one that never starts, and a quieter one —
    // it answers requests right up until the first query that assumes a
    // column which is not there yet.
    console.error(`\n${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

const server = spawn(process.execPath, [path.join(appDir, "server.js")], {
  stdio: "inherit",
  cwd: appDir,
});

// Forwarded rather than left to Docker's default: without this, `docker stop`
// waits out its whole grace period and kills the server instead of the clean
// shutdown Next's own SIGTERM handling would have done.
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.kill(signal));
}

server.on("exit", (code, signal) => process.exit(signal ? 128 : (code ?? 1)));
