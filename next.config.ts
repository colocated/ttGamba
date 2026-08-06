import { execSync } from "node:child_process";
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
 * to a mismatch by forcing a full page reload, and this app is a full-screen
 * iframe that holds the game's input focus — a reload it cannot control is the
 * one thing that can strand a player. We detect the same condition and put a
 * banner up instead. See components/update-banner.tsx.
 */
const BUILD_ID = `${commit()}-${Date.now().toString(36)}`;

function commit() {
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

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  /*
    The dev indicator floats over the app's own bottom-right corner, which is
    where the resize grip lives — in dev it sits on top of the one control the
    window is meant to be grabbed by. Compile and runtime errors still surface.
  */
  devIndicators: false,
  generateBuildId: () => BUILD_ID,
  /* Inlined into the client bundle, so the page carries the build it came from. */
  env: { NEXT_PUBLIC_BUILD_ID: BUILD_ID },
  experimental: {
    /*
      `@phosphor-icons/react` is a barrel over ~3000 icon modules, and importing
      a handful by name pulls the lot. In dev that is thousands of module
      requests standing between load and hydration — the window paints, but
      nothing in it responds until they land. Next names this package
      specifically in its local-development guide.
    */
    optimizePackageImports: ["@phosphor-icons/react"],
  },
};

export default nextConfig;
