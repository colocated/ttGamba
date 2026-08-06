import { redirect } from "next/navigation";

import { GAMES } from "@/lib/games";

/**
 * There is no lobby yet, so opening the app drops the player onto the first
 * game in the shelf.
 */
export default function RootPage() {
  redirect(GAMES[0].href);
}
