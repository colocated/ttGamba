/**
 * Every chip the casino has, in one list.
 *
 * Data only — no components, no `server-only` — so the felt, the gutter, the
 * lobby and anything else that ever needs to draw money can read the same
 * table. A chip that exists in two places with two colours is a chip a player
 * has to look twice at.
 *
 * ── Adding one is a line ──────────────────────────────────────────────────
 * A value, what is printed on its face, one hex, and whether it is a disc or a
 * plaque. Everything else about how it is drawn — the edge spots, the inlay,
 * the ink, the way the colour is shaded for depth — is derived from that hex in
 * components/chip.tsx. That is the whole point of the arrangement: nobody
 * should be picking four colours and a stroke width to invent a denomination.
 *
 * ── Why the label is written down ─────────────────────────────────────────
 * `Intl`'s compact notation gets most of these right and then writes `1000M`
 * or drops a digit somewhere it matters, and a chip is the one place a figure
 * has to be exactly the thing everyone at the table calls it. It is five
 * characters at most; writing it out is cheaper than trusting a formatter to
 * agree with the casino.
 */

/**
 * How a denomination is shaped.
 *
 * Discs up to the hundreds of millions, and plaques above it — the flat
 * rectangular plates a real high-limit room uses once a single piece is worth
 * more than anybody wants to stack. It is not decoration: a plaque reads as
 * *different money* at a glance, which is exactly what it is, and it stops a
 * billion sitting in a stack looking like a hundred.
 */
export type ChipShape = "disc" | "plaque";

export type Denomination = {
  value: number;
  /** What is printed on the face. */
  label: string;
  /** The one colour. Everything else about the chip is derived from it. */
  colour: string;
  shape: ChipShape;
};

/**
 * The rack, smallest first.
 *
 * The spacing is a real casino's: ones, fives and their multiples, so any round
 * figure is reachable in three or four pieces and nobody has to stack eleven of
 * anything. Colours follow the conventional ones as far as they go — red for
 * the small unit, green, blue, black — and are invented past the point where
 * convention runs out, which is somewhere around a million.
 */
export const DENOMINATIONS: readonly Denomination[] = [
  { value: 100, label: "100", colour: "#e6e1d3", shape: "disc" },
  { value: 1_000, label: "1K", colour: "#c8434c", shape: "disc" },
  { value: 5_000, label: "5K", colour: "#3f7fc4", shape: "disc" },
  { value: 10_000, label: "10K", colour: "#43a06c", shape: "disc" },
  { value: 25_000, label: "25K", colour: "#7e5bb5", shape: "disc" },
  { value: 50_000, label: "50K", colour: "#d98b3a", shape: "disc" },
  { value: 100_000, label: "100K", colour: "#39414d", shape: "disc" },
  { value: 250_000, label: "250K", colour: "#d05a92", shape: "disc" },
  { value: 500_000, label: "500K", colour: "#2fa5a0", shape: "disc" },
  { value: 1_000_000, label: "1M", colour: "#d8a83e", shape: "disc" },
  { value: 5_000_000, label: "5M", colour: "#b03a3a", shape: "disc" },
  { value: 10_000_000, label: "10M", colour: "#3556b5", shape: "disc" },
  { value: 25_000_000, label: "25M", colour: "#2f8f5b", shape: "disc" },
  { value: 50_000_000, label: "50M", colour: "#6a3fb0", shape: "disc" },
  { value: 100_000_000, label: "100M", colour: "#c9701f", shape: "disc" },
  { value: 250_000_000, label: "250M", colour: "#c4437a", shape: "disc" },
  { value: 500_000_000, label: "500M", colour: "#1f8fa8", shape: "disc" },
  { value: 1_000_000_000, label: "1B", colour: "#8a6a2f", shape: "plaque" },
  { value: 2_500_000_000, label: "2.5B", colour: "#7d5a8f", shape: "plaque" },
  { value: 5_000_000_000, label: "5B", colour: "#2f6f8a", shape: "plaque" },
  { value: 7_500_000_000, label: "7.5B", colour: "#8a4a3a", shape: "plaque" },
  { value: 10_000_000_000, label: "10B", colour: "#3f7a5a", shape: "plaque" },
  { value: 25_000_000_000, label: "25B", colour: "#6a5f8a", shape: "plaque" },
  { value: 50_000_000_000, label: "50B", colour: "#8a7a35", shape: "plaque" },
  { value: 100_000_000_000, label: "100B", colour: "#7a3a52", shape: "plaque" },
  { value: 1_000_000_000_000, label: "1T", colour: "#2a3340", shape: "plaque" },
] as const;

/** The denomination with exactly this value, if the rack has one. */
export function denomination(value: number): Denomination | null {
  return DENOMINATIONS.find((chip) => chip.value === value) ?? null;
}

/**
 * The chips worth offering at a table, largest first.
 *
 * Everything up to what the table will take. Pieces below the minimum bet stay
 * in the drawer rather than being filtered out — they are how a player reaches
 * a figure that is not round, and a rack that only held the useful sizes would
 * make every bet a multiple of the minimum.
 *
 * Largest first because that is the order a stack is built in and the order a
 * player thinks in: they reach for the biggest piece that fits and work down.
 */
export function rackFor(maxBet: number): Denomination[] {
  return DENOMINATIONS.filter((chip) => chip.value <= maxBet).reverse();
}

/**
 * An amount, as the pieces it would actually be made of.
 *
 * Greedy from the top, which is how a dealer makes change and how a player
 * builds a stake. `limit` caps how many pieces come back — a stack of forty
 * chips is not something anybody can read, and past about six the picture stops
 * telling you anything the figure beside it does not.
 *
 * The remainder is returned rather than hidden. A caller that cannot draw the
 * whole amount needs to know it is showing part of one, and the honest thing to
 * put beside a truncated stack is the total.
 */
export function breakIntoChips(
  amount: number,
  limit: number = 6,
): { chips: Denomination[]; remainder: number } {
  const chips: Denomination[] = [];
  let left = Math.max(0, Math.floor(amount));

  while (left > 0 && chips.length < limit) {
    const piece = DENOMINATIONS.findLast((chip) => chip.value <= left);
    if (!piece) break;
    chips.push(piece);
    left -= piece.value;
  }

  return { chips, remainder: left };
}
