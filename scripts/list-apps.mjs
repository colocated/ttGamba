/**
 * Apps that build to a container image — every directory under `apps/` that
 * has a Dockerfile. CI uses this to build its paths-filter dynamically, so
 * adding an app needs no edit to build.yml: give it a Dockerfile and it
 * appears here on the next run.
 *
 *   node scripts/list-apps.mjs                 one dir name per line
 *   node scripts/list-apps.mjs --paths-filter   dorny/paths-filter YAML
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const APPS_DIR = path.join(ROOT, "apps");

function discover() {
  let entries;
  try {
    entries = fs.readdirSync(APPS_DIR, { withFileTypes: true });
  } catch {
    return [];
  }

  return entries
    .filter((entry) => entry.isDirectory())
    .filter((entry) => fs.existsSync(path.join(APPS_DIR, entry.name, "Dockerfile")))
    .map((entry) => entry.name)
    .sort();
}

const apps = discover();

if (process.argv.includes("--paths-filter")) {
  // A change under packages/, the lockfile, the workspace file or this
  // workflow touches every app, because that is exactly what it does.
  const shared = [
    "packages/**",
    "pnpm-lock.yaml",
    "pnpm-workspace.yaml",
    ".github/workflows/build.yml",
  ];
  for (const app of apps) {
    console.log(`${app}:`);
    console.log(`  - 'apps/${app}/**'`);
    for (const glob of shared) console.log(`  - '${glob}'`);
  }
} else {
  for (const app of apps) console.log(app);
}
