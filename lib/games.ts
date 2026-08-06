/**
 * The game registry.
 *
 * Deliberately holds data only — no icon components — so that server
 * components (pages) and the client-side shelf can both import it. The shelf
 * maps `icon` onto a Phosphor component.
 */

export type GameId = "blackjack" | "roulette" | "cross-the-road";

export type Game = {
  id: GameId;
  name: string;
  href: string;
  icon: "spade" | "poker-chip" | "road";
  /** One-liner shown in the stage header. */
  blurb: string;
  /** How many players share a round. Singleplayer games start on demand. */
  mode: "multiplayer" | "singleplayer";
};

export const GAMES: readonly Game[] = [
  {
    id: "blackjack",
    name: "Blackjack",
    href: "/blackjack",
    icon: "spade",
    blurb: "Beat the dealer to 21 without going bust.",
    mode: "multiplayer",
  },
  {
    id: "roulette",
    name: "Roulette",
    href: "/roulette",
    icon: "poker-chip",
    blurb: "Back a number, a colour, or a spread of the wheel.",
    mode: "multiplayer",
  },
  {
    id: "cross-the-road",
    name: "Cross the Road",
    href: "/cross-the-road",
    icon: "road",
    blurb: "Cash out before the traffic gets you.",
    mode: "singleplayer",
  },
];

export function getGame(id: GameId): Game {
  const game = GAMES.find((candidate) => candidate.id === id);
  if (!game) throw new Error(`Unknown game: ${id}`);
  return game;
}
