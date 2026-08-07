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

/**
 * The same figure at a glance — `10B`, `1.5M`, `750`.
 *
 * For places where the number is being *scanned* rather than checked, and where
 * spelling it out in full would run past the edge of what it is written on — a
 * lobby card's bet limits, which are two figures side by side inside a box a
 * couple of hundred pixels wide.
 *
 * It rounds, so it is never the last word on an amount: anywhere this is used,
 * the exact figure has to be reachable — a `title` beside it, or the table
 * itself once the player has sat down.
 */
const SHORT = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

export function formatChipsShort(amount: number): string {
  return SHORT.format(Math.trunc(amount));
}

/**
 * The same figure in words — `10 billion`, `1.5 million`, `750`.
 *
 * For reading back an amount someone has just typed. Thirteen digits is past
 * the point where anyone can count zeros at a glance, and "one zero out" is
 * the mistake this exists to catch: `1,000,000,000` and `10,000,000,000` look
 * alike in a field, and "1 billion" and "10 billion" do not.
 *
 * A reading, never the authority — it rounds, and the digits beside it are the
 * exact figure. Three fraction digits is where that stops being a shortening
 * and starts being a different number.
 */
const MAGNITUDE = new Intl.NumberFormat("en-US", {
  notation: "compact",
  compactDisplay: "long",
  maximumFractionDigits: 3,
});

export function formatMagnitude(amount: number): string {
  return MAGNITUDE.format(amount);
}

/*
  Times, for the banker desk.

  The locale is pinned for the same reason the numbers are, but the timezone
  deliberately is not: a banker works out whether a request came in "this
  morning" against their own clock, and pinning it to UTC would make every
  timestamp arithmetic they have to do in their head. That is safe here because
  everything these format is fetched after mount and never server-rendered —
  there is no first paint for the two to disagree about.
*/

const WHEN = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const EXACT = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "full",
  timeStyle: "medium",
});

/** `6 Aug, 14:32` — a timestamp at a glance. `at` is epoch milliseconds. */
export function formatWhen(at: number): string {
  return WHEN.format(at);
}

/** The unabbreviated version, for a `title` on anything shortened. */
export function formatExactly(at: number): string {
  return EXACT.format(at);
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * `4m ago`, `3h ago`, `2d ago`.
 *
 * How old a request is, which is the question a queue actually raises — a
 * banker scanning one wants to know what has been waiting, not what the clock
 * said when it arrived. Stops at days: past a week the exact date is the more
 * useful answer, and `formatWhen` is beside it.
 */
export function formatAgo(at: number, now: number = Date.now()): string {
  const elapsed = Math.max(0, now - at);
  if (elapsed < MINUTE) return "just now";
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)}m ago`;
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)}h ago`;
  return `${Math.floor(elapsed / DAY)}d ago`;
}
