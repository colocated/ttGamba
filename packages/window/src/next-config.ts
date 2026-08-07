/**
 * The Next.js configuration every user app in this workspace needs.
 *
 * Next config is not inheritable — there is no `extends` — so without this each
 * app would carry its own copy of the same five settings and they would drift.
 * Everything here is either required by `@tt/window` to work at all, or is a
 * consequence of being an app in a pnpm workspace.
 *
 * Node-only. Never import this from a component; it is reached through
 * `@tt/window/next-config` and run once, at build time.
 */

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { NextConfig } from "next";

/**
 * Identifies this build, so a running app can notice it is out of date.
 *
 * The timestamp is what makes the comparison work: a rebuild of the same
 * commit is still a new bundle, and a client holding the old one still needs
 * telling. The commit is along for readability when debugging which build a
 * player is on.
 *
 * Deliberately *not* wired to `deploymentId`. Next's own skew handling reacts
 * to a mismatch by forcing a full page reload, and a user app is a full-screen
 * iframe that holds the game's input focus — a reload it cannot control is the
 * one thing that can strand a player. The same condition is detected and put on
 * screen as a banner instead. See update-banner.tsx.
 */
export function buildId(): string {
  return `${commit()}-${Date.now().toString(36)}`;
}

function commit(): string {
  /*
    A container has no `.git` — it is excluded from the build context, since
    including it to read one string would bust the layer cache on every commit.
    The Dockerfile passes the SHA as a build arg instead. Without it a build is
    still uniquely identified by its timestamp, but is no longer traceable to a
    commit.
  */
  if (process.env.BUILD_COMMIT) return process.env.BUILD_COMMIT;

  try {
    return execSync("git rev-parse --short HEAD", {
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
  } catch {
    // No git, or no commits yet. The timestamp alone still identifies a build.
    return "nogit";
  }
}

/**
 * The directory holding `pnpm-workspace.yaml`, walked up from the build's
 * working directory.
 *
 * Deliberately not `__dirname` or `import.meta.dirname`, which is how Next's own
 * docs write this. Each is correct only in a known module format, and
 * `next.config.ts` in a package without `"type": "module"` is exactly the case
 * where the format is not knowable: `__dirname` is undefined under ESM,
 * `import.meta` is a syntax error under CJS. The workspace file settles it
 * either way.
 */
function findWorkspaceRoot(from: string): string {
  let dir = path.resolve(from);

  for (;;) {
    if (fs.existsSync(path.join(dir, "pnpm-workspace.yaml"))) return dir;

    const parent = path.dirname(dir);
    // Hit the filesystem root without finding one. Fall back to where we
    // started, which is Next's own default — a standalone app outside a
    // workspace is a legitimate thing to be.
    if (parent === dir) return path.resolve(from);
    dir = parent;
  }
}

export function withUserApp(
  config: NextConfig = {},
  {
    workspaceRoot,
  }: {
    /** Override the walk. Rarely needed — see `findWorkspaceRoot`. */
    workspaceRoot?: string;
  } = {},
): NextConfig {
  const id = buildId();

  return {
    ...config,

    /* A container runs `node server.js`, not `next start`. */
    output: config.output ?? "standalone",

    /*
      Without this the tracer roots at the app directory and never looks above
      it — so every dependency pnpm hoisted into the workspace root's
      `node_modules/.pnpm` is left out of the standalone bundle, and the
      container dies on its first request with a module not found. It is the
      single most common way a Next app in a monorepo fails only once it is
      containerised.
    */
    outputFileTracingRoot:
      config.outputFileTracingRoot ?? workspaceRoot ?? findWorkspaceRoot(process.cwd()),

    /*
      Workspace packages ship TypeScript source rather than build output, which
      is what keeps them free of a build step and a watch mode. That means each
      app's own Next build compiles them, and has to be told to.
    */
    transpilePackages: [
      ...new Set([...(config.transpilePackages ?? []), "@tt/window", "@tt/userapp", "@tt/db"]),
    ],

    generateBuildId: config.generateBuildId ?? (() => id),
    /* Inlined into the client bundle, so the page carries the build it came from. */
    env: { NEXT_PUBLIC_BUILD_ID: id, ...config.env },

    /*
      The dev indicator floats over the window's own bottom-right corner, which
      is where the resize grip lives — in dev it sits on top of the one control
      the window is meant to be grabbed by. Compile and runtime errors still
      surface.
    */
    devIndicators: config.devIndicators ?? false,

    experimental: {
      ...config.experimental,
      /*
        `@phosphor-icons/react` is a barrel over ~3000 icon modules, and
        importing a handful by name pulls the lot. In dev that is thousands of
        module requests standing between load and hydration — the window paints,
        but nothing in it responds until they land. Next names this package
        specifically in its local-development guide.
      */
      optimizePackageImports: [
        ...new Set([
          ...(config.experimental?.optimizePackageImports ?? []),
          "@phosphor-icons/react",
        ]),
      ],
    },
  };
}
