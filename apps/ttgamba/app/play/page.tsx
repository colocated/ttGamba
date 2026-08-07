import { GamesIndex } from "@/components/games/index-page";

export const metadata = { title: "Games · ttGamba" };

/**
 * Where the app opens.
 *
 * `/` redirects here (next.config.ts). It used to redirect to the first game in
 * the shelf, which it could do because the shelf was a constant in the source;
 * it is a database table now, so there is no first game at build time and the
 * redirect has to land somewhere that does not depend on one.
 *
 * That constraint turned out to be the better answer anyway. Opening on
 * blackjack told every player that blackjack was the point of the app, and
 * opening on a list of what is on offer is what a casino floor actually looks
 * like from the door.
 */
export default function PlayPage() {
  return <GamesIndex />;
}
