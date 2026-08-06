import { ComingSoon, Stage, Tag } from "@/components/stage";
import { getGame } from "@/lib/games";

const game = getGame("roulette");

export const metadata = { title: `${game.name} · ttGamba` };

export default function RoulettePage() {
  return (
    <Stage title={game.name} blurb={game.blurb} aside={<Tag>{game.mode}</Tag>}>
      <ComingSoon what="The roulette wheel and betting layout" />
    </Stage>
  );
}
