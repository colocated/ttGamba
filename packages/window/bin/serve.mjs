#!/usr/bin/env node
/**
 * `tt-serve` — run an app's production build, the way the container does.
 *
 * Run from an app directory, after `next build`:
 *
 *   tt-serve                # port 3000
 *   tt-serve --port 3001
 *
 * ── Why not `next start` ──────────────────────────────────────────────────
 * `withUserApp` sets `output: "standalone"` (@tt/window/next-config), and Next
 * 16 warns on startup that `next start` "does not work with output: standalone".
 * In practice it does still serve — but relying on a path the framework tells
 * you is unsupported is a bad trade for a saved line of script, and it is not
 * what runs in production. The Dockerfile boots `server.js`; so does this, so
 * what you test in game is what ships.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * ── The copy step ─────────────────────────────────────────────────────────
 * Standalone output deliberately omits `public` and `.next/static`, because a
 * real deployment is expected to put those behind a CDN. Nothing here is behind
 * a CDN, so they are copied in — the same two copies the Dockerfile makes.
 * Without them the app answers, and every stylesheet and script 404s.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { spawn } from "node:child_process";
import { rmSync } from "node:fs";
import { cp, access, writeFile } from "node:fs/promises";
import path from "node:path";

const app = process.cwd();

/**
 * The workspace root, found the same way `withUserApp` finds it — by the file
 * on disk rather than by counting `..` segments.
 *
 * It matters here because standalone output is rooted at the *tracing* root, so
 * an app at `apps/ttgamba` has its server at
 * `.next/standalone/apps/ttgamba/server.js` rather than at the top.
 */
async function workspaceRoot(from) {
  let dir = path.resolve(from);

  for (;;) {
    try {
      await access(path.join(dir, "pnpm-workspace.yaml"));
      return dir;
    } catch {
      const parent = path.dirname(dir);
      if (parent === dir) return path.resolve(from);
      dir = parent;
    }
  }
}

const root = await workspaceRoot(app);
const inside = path.join(app, ".next", "standalone", path.relative(root, app));
const server = path.join(inside, "server.js");

try {
  await access(server);
} catch {
  console.error(`No build to serve — ${path.relative(app, server)} is not there.`);
  console.error("Run the build first: pnpm bas <app>, or pnpm --filter <app> build.");
  process.exit(1);
}

// `force: true` so a rebuild overwrites the previous run's copies rather than
// leaving stale assets a new build no longer references.
await cp(path.join(app, "public"), path.join(inside, "public"), {
  recursive: true,
  force: true,
});
await cp(path.join(app, ".next", "static"), path.join(inside, ".next", "static"), {
  recursive: true,
  force: true,
});

// The shell wins over `.env`, which is the precedence every other tool uses.
const shell = { DATABASE_URL: process.env.DATABASE_URL };
try {
  process.loadEnvFile(path.join(app, ".env"));
} catch {
  // No `.env`, which is normal anywhere the environment is supplied directly.
}

const database = shell.DATABASE_URL ?? process.env.DATABASE_URL;

/*
  Who is serving, so the next build can stop them.

  `server.js` does `process.chdir(__dirname)`, so a running server holds
  `.next/standalone/<app>` as its working directory — and on Windows a process's
  cwd is locked. The next `next build` then dies on `EBUSY: rmdir` while trying
  to clear `.next`, with an error that says nothing about a server still being
  up. Recording the pid is what lets `pnpm bas` clear the way (scripts/app.mjs).

  Inside `.next` on purpose: a build wipes it, which is exactly the right
  lifetime for a file that only means "something was serving this build".
*/
const pidfile = path.join(app, ".next", "serve.pid");
await writeFile(pidfile, String(process.pid), "utf8").catch(() => {});

const tidy = () => {
  try {
    rmSync(pidfile, { force: true });
  } catch {
    // Already gone, most likely taken by the build that replaced this server.
  }
};
process.on("exit", tidy);
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(signal, () => {
    tidy();
    process.exit(0);
  });
}

const child = spawn(process.execPath, [server, ...process.argv.slice(2)], {
  stdio: "inherit",
  cwd: inside,
  env: {
    ...process.env,
    ...(database ? { DATABASE_URL: database } : {}),
    // `server.js` reads both, and defaults to localhost — which a game client on
    // another machine on the LAN cannot reach.
    PORT: process.env.PORT ?? "3000",
    HOSTNAME: process.env.HOSTNAME ?? "0.0.0.0",
  },
});

child.on("exit", (code, signal) => process.exit(signal ? 128 : (code ?? 1)));
