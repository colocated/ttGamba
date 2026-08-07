/**
 * Names shared between the client graph and the server one.
 *
 * A file of its own, and deliberately **not** `"use client"` — unlike
 * `lib/settings.ts`, which imports from here.
 *
 * The root layout is a server component and reads `SETTINGS_KEY` at render time
 * to inline it into the boot script. Every export of a `"use client"` module
 * reaches the server as a *client reference* rather than a value, so importing
 * the key from `settings.ts` would interpolate an opaque object into the script.
 * Nothing throws; the window just opens at its default size on every load,
 * having failed to find the geometry it wrote.
 */

/**
 * This app's key in the game client's `local_` namespace, and in `localStorage`.
 *
 * Read by `createSettingsStore` (lib/settings.ts) and by `bootstrapScript` in
 * the root layout. Changing it orphans every player's stored window position —
 * recoverable, but not worth doing by accident.
 */
export const SETTINGS_KEY = "ttgamba_settings";

/**
 * This app's Redis key prefix, so two apps sharing one Redis cannot read — or
 * flush — each other's cached rows.
 *
 * Read by `redisCache` in lib/db.ts and by the admin flush, which scans for
 * `<prefix>:*`. Here rather than in db.ts because that module is the database
 * handle and importing it pulls a Prisma client into anything that only wanted
 * a string.
 */
export const CACHE_PREFIX = "ttgamba";
