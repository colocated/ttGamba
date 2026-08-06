/**
 * The pre-React boot script, and the names it shares with the rest of the app.
 *
 * Deliberately not a `"use client"` module: the root layout is a server
 * component and has to read these values at render time to inline the script.
 * Importing them from `settings.ts` would reach into the client graph and hand
 * the server a client reference instead of a string.
 */

/** Our key in the client's `local_` namespace, and in `localStorage`. */
export const SETTINGS_KEY = "ttgamba_settings";

/**
 * Geometry the boot script writes onto `:root` before the first paint, so the
 * window is drawn at its remembered size instead of appearing at the default
 * and correcting once React arrives.
 */
export const GEOMETRY_VARS = {
  width: "--tt-window-width",
  left: "--tt-window-left",
  top: "--tt-window-top",
  transform: "--tt-window-transform",
} as const;

/**
 * Runs in the document head, before anything paints and before React exists.
 * It does two jobs that both have to happen outside React:
 *
 * 1. Applies the remembered window geometry, so the window is drawn at its
 *    saved size straight away. React renders the same values a moment later,
 *    and because they agree there is nothing to see — no default-sized frame
 *    appearing first and correcting itself.
 *
 * 2. Installs Escape → pin. This is the player's way out, and it must not
 *    depend on the app working. If a bundle fails to load or the React tree
 *    throws, what is left is a transparent full-screen iframe that still holds
 *    input focus: the game is unclickable and nothing on screen explains why.
 *    An inline listener survives all of that, because by the time anything
 *    else can fail it has already been attached.
 *
 * Kept as a string rather than a module so it ships inline in the HTML — a
 * script that has to be fetched is a script that can fail to arrive, which is
 * the failure this is here to cover.
 */
export const BOOTSTRAP_SCRIPT = `
(function () {
  try {
    var raw = window.localStorage.getItem(${JSON.stringify(SETTINGS_KEY)});
    if (raw) {
      var parsed = JSON.parse(raw);
      var s = parsed && parsed.v ? parsed.v : parsed;
      var css = "";
      if (typeof s.windowWidth === "number") {
        css += ${JSON.stringify(GEOMETRY_VARS.width)} + ":" + s.windowWidth + "px;";
      }
      if (typeof s.windowX === "number" && typeof s.windowY === "number") {
        css += ${JSON.stringify(GEOMETRY_VARS.left)} + ":" + s.windowX + "px;";
        css += ${JSON.stringify(GEOMETRY_VARS.top)} + ":" + s.windowY + "px;";
        css += ${JSON.stringify(GEOMETRY_VARS.transform)} + ":none;";
      }
      if (css) {
        // A style element of our own, never a style attribute on <html>.
        // React renders <html> and diffs its attributes at hydration, so
        // writing to it here is a mismatch it reports and refuses to patch.
        var el = document.createElement("style");
        el.appendChild(document.createTextNode(":root{" + css + "}"));
        document.head.appendChild(el);
      }
    }
  } catch (e) {
    // Unreadable storage just means the window opens at its default size.
  }

  window.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
      window.parent.postMessage({ type: "pin" }, "*");
    }
  });
})();
`;
