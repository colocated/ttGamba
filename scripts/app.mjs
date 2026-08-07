/**
 * Run one app's script, named rather than assumed.
 *
 *   node scripts/app.mjs <script[,script...]> [app] [...args]
 *
 * The app can be given positionally or with `--app`, so all of these work:
 *
 *   pnpm dev ttgamba
 *   pnpm dev --app ttgamba
 *   pnpm dev --app=ttgamba
 *   pnpm dev ttgamba --port 3001      # anything else is passed through
 *
 * A comma-separated list runs in order and stops at the first failure, which is
 * all `pnpm bas` is — `build,start`. Passed-through arguments go to the last
 * script in the chain, since that is the one still running when they matter.
 *
 * The script being named here rather than assumed is what lets `pnpm db` exist
 * without this file knowing anything about databases: it asks for `db:studio`,
 * and an app that does not declare one is told so.
 *
 * Apps are discovered by reading `apps/`, not from a list here, so adding an app
 * needs no edit to this file or to the root package.json.
 *
 * Bare `pnpm dev` is an error rather than a default to the only app: defaulting
 * works until there are two, at which point whichever sorts first silently
 * becomes "the" app. Failing with the list costs one word to fix.
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const APPS_DIR = path.join(ROOT, "apps");

/** Every directory under `apps/` that is actually a package. */
function discover() {
  let entries;
  try {
    entries = fs.readdirSync(APPS_DIR, { withFileTypes: true });
  } catch {
    return [];
  }

  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const manifest = path.join(APPS_DIR, entry.name, "package.json");
      if (!fs.existsSync(manifest)) return null;
      try {
        const { name, scripts } = JSON.parse(fs.readFileSync(manifest, "utf8"));
        // The package name is what `--filter` matches on; the directory name is
        // what somebody types. Usually the same, and nothing here assumes it.
        return { dir: entry.name, name: name ?? entry.name, scripts: scripts ?? {} };
      } catch {
        // A malformed manifest is a broken app, not a missing one — but this is
        // not the tool that reports it, and pnpm will say so far more clearly.
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => a.dir.localeCompare(b.dir));
}

/**
 * Split argv into the app being asked for and everything to pass through.
 *
 * The first bare word is the app. Anything after it — or any flag that is not
 * `--app` — belongs to the script being run, so `pnpm dev ttgamba --port 3001`
 * reaches Next intact.
 */
function parse(argv) {
  let app = null;
  const rest = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--app") {
      app = argv[i + 1] ?? null;
      i += 1;
      continue;
    }
    if (arg.startsWith("--app=")) {
      app = arg.slice("--app=".length);
      continue;
    }
    if (app === null && !arg.startsWith("-")) {
      app = arg;
      continue;
    }
    rest.push(arg);
  }

  return { app, rest };
}

function list(apps) {
  if (apps.length === 0) return "  (none — apps/ is empty)";
  return apps.map((app) => `  ${app.dir}`).join("\n");
}

function fail(message, apps) {
  console.error(message);
  console.error("\nApps in this workspace:");
  console.error(list(apps));
  process.exit(1);
}

const [chain, ...argv] = process.argv.slice(2);
if (!chain) {
  console.error("usage: node scripts/app.mjs <script[,script...]> [app] [...args]");
  process.exit(1);
}

/**
 * One script, or several run in order.
 *
 * `build,start` is the whole of what `pnpm bas` is — build the app, then serve
 * the build. A chain stops at the first script that fails, so a broken build
 * never gets served.
 */
const scripts = chain.split(",").filter(Boolean);
const label = scripts.join(" then ");

const apps = discover();
const { app: wanted, rest } = parse(argv);

if (wanted === null) {
  fail(`${label} needs an app: pnpm <command> <app>`, apps);
}

const target = apps.find((app) => app.dir === wanted || app.name === wanted);
if (!target) {
  fail(`no app "${wanted}" detected`, apps);
}

/*
  Not every app runs every command. `pnpm db` asks for `db:studio`, which only
  an app that owns a schema — a `prisma/`, a `prisma.config.ts`, a dependency on
  @tt/db — has any reason to declare. Rather than teach this file what Prisma is,
  the app's own manifest is taken as the answer: no script, no such capability.

  The list of what the app *does* have is the useful half of the message. It
  separates "this app has no database" from "this app has a database and the
  script is named something else", and the two want different fixes.
*/
const missing = scripts.filter((script) => !target.scripts[script]);
if (missing.length > 0) {
  const available = Object.keys(target.scripts);
  console.error(`${target.dir} has no ${missing.map((s) => `"${s}"`).join(" or ")} script.`);
  console.error(`\nScripts in ${target.dir}:`);
  console.error(available.length > 0 ? available.map((s) => `  ${s}`).join("\n") : "  (none)");
  process.exit(1);
}

/*
  pnpm's own entry point, run through node directly.

  Not `spawn("pnpm", ...)`: on Windows that resolves to `pnpm.cmd`, and Node
  refuses to spawn a `.cmd` without `shell: true` — which then puts every
  passed-through argument through cmd.exe's quoting rules. `npm_execpath` is the
  .cjs pnpm is already running from: same version, no shell, arguments arrive
  exactly as written. This is the path every `pnpm dev` takes.
*/
const pnpm = process.env.npm_execpath;
const node = process.env.npm_node_execpath ?? process.execPath;

/*
  The fallback, for this file being run by node directly rather than through a
  pnpm script. Here a shell is unavoidable, so the command goes as one string
  rather than as a string plus an args array — the latter is what Node
  deprecated in DEP0190, because with `shell: true` it concatenates the array
  without escaping anything. Quoting it here is the same work done deliberately.
*/
const quote = (arg) => (/^[\w@./:=-]+$/.test(arg) ? arg : JSON.stringify(arg));

/** Run one of the app's scripts, resolving to how it exited. */
function runScript(script, extra) {
  const args = ["--filter", target.name, "run", script, ...extra];

  const child = pnpm
    ? spawn(node, [pnpm, ...args], { stdio: "inherit", cwd: ROOT })
    : spawn(["pnpm", ...args].map(quote).join(" "), { stdio: "inherit", cwd: ROOT, shell: true });

  return new Promise((resolve) => {
    // A signalled child has no exit code. Report it the way a shell would, so
    // Ctrl-C on a dev server is not mistaken for a clean stop by anything
    // upstream.
    child.on("exit", (code, signal) => resolve(signal ? 128 : (code ?? 1)));
  });
}

/**
 * Stop a server left over from a previous run, before anything rebuilds.
 *
 * A standalone server chdirs into `.next/standalone/<app>` and Windows locks a
 * process's working directory, so a build that tries to clear `.next` dies with
 * `EBUSY: resource busy or locked, rmdir` — an error that names a directory and
 * never mentions the server still holding it. Ctrl-C cleans up on its own; this
 * is for the server that outlived its terminal.
 *
 * Only ever kills a pid this workspace wrote (see `tt-serve`), and shrugs at a
 * stale file naming a process that has already gone.
 */
function stopPreviousServer() {
  const pidfile = path.join(APPS_DIR, target.dir, ".next", "serve.pid");

  let pid;
  try {
    pid = Number(fs.readFileSync(pidfile, "utf8").trim());
  } catch {
    return;
  }
  if (!Number.isInteger(pid) || pid <= 0) return;

  try {
    process.kill(pid);
    console.log(`Stopped the previous ${target.dir} server (pid ${pid}).`);
  } catch {
    // Already gone. The file outlived it, which is what `force: true` is for.
  }
  fs.rmSync(pidfile, { force: true });
}

if (scripts.includes("build")) stopPreviousServer();

for (const [index, script] of scripts.entries()) {
  /*
    Passed-through arguments go to the *last* script only. In a chain they are
    almost always for the thing that ends up running — `pnpm bas ttgamba --port
    3001` means serve on 3001, and handing `--port` to `next build` would fail
    before anything was built.
  */
  const last = index === scripts.length - 1;
  const code = await runScript(script, last ? rest : []);

  if (code !== 0) {
    // Say which step stopped it. In a chain the failing command has scrolled
    // well off screen by the time the exit code lands.
    if (scripts.length > 1) console.error(`\n${target.dir}: "${script}" failed (${code}).`);
    process.exit(code);
  }
}
