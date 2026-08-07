import { GameStage } from "@/components/games/stage";
import { Panel, Stage } from "@/components/stage";
import { prisma } from "@/lib/db";
import { toGameRow } from "@/lib/rows";

/**
 * One game.
 *
 * Every game is this route. There used to be a page per game — `/blackjack`,
 * `/roulette` — and there cannot be any more: which games exist is something an
 * administrator decides at runtime (lib/catalogue.ts), and a file cannot be
 * written for a game that does not exist yet.
 *
 * The row is read here, on the server, rather than left to the client's poll.
 * Not for speed: it is what lets the tab title and the stage header be right on
 * the first frame instead of appearing a beat later, on a page whose whole job
 * is to be opened from the shelf and glanced at. Nothing about a game's name is
 * private, so this read needs no caller — the *state* of the game, which is
 * everything else on the page, does and asks separately.
 */

async function findGame(slug: string) {
  return prisma.game.findUnique({ where: { slug } });
}

export async function generateMetadata({ params }: PageProps<"/play/[slug]">) {
  const { slug } = await params;
  const game = await findGame(slug);
  return { title: game ? `${game.name} · ttGamba` : "ttGamba" };
}

export default async function GamePage({ params }: PageProps<"/play/[slug]">) {
  const { slug } = await params;
  const game = await findGame(slug);

  /*
    A slug with no game behind it is answered with a page rather than
    `notFound()`. This app is a full-screen iframe holding the game's input
    focus, and everything that throws during render is treated with suspicion
    here for that reason — see the note on the root redirect in next.config.ts
    for what one of those cost once. A panel inside the window also leaves the
    shelf on screen, which is the way out of it.
  */
  if (!game) {
    return (
      <Stage title="No such game" blurb="Nothing in the casino answers to that address.">
        <Panel className="flex flex-col gap-2">
          <h2 className="text-sm font-medium">
            <span className="font-mono">/play/{slug}</span> is not a game
          </h2>
          <p className="text-sm text-ink-soft">
            It may have been renamed or taken out of the shelf. Everything the casino currently
            offers is in the shelf on the left.
          </p>
        </Panel>
      </Stage>
    );
  }

  return <GameStage game={toGameRow(game)} />;
}
