/**
 * Number formatting for anything the player reads as a balance.
 *
 * The locale is pinned rather than taken from the browser. These figures are
 * rendered on the server and again on the client, and a player whose machine
 * reports `de-DE` would have the two disagree about where the separators go —
 * which React reports as a hydration mismatch. Pinning it also means a screen
 * shared between two players shows both of them the same number.
 */

const DECIMAL = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

/** In-game cash — wallet and bank. Dollars, never chips. See PRODUCT.md. */
export function formatMoney(amount: number): string {
  return `$${DECIMAL.format(Math.trunc(amount))}`;
}

/**
 * Chips, the app's own currency. Left unprefixed and named instead: a `$` on a
 * chip balance is the one thing on this page that could be read as ttGamba
 * dealing in money, and it does not.
 */
export function formatChips(amount: number): string {
  return `${DECIMAL.format(Math.trunc(amount))} ${amount === 1 ? "chip" : "chips"}`;
}

/**
 * The bare figure, for places too tight to spell the unit out — the titlebar
 * readout, where the chip glyph beside it does the naming instead. Anywhere
 * with room for the word should use `formatChips`.
 */
export function formatChipCount(amount: number): string {
  return DECIMAL.format(Math.trunc(amount));
}
