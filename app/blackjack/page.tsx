import { ComingSoon, Stage, Tag } from "@/components/stage";
import { getGame } from "@/lib/games";

const game = getGame("blackjack");

export const metadata = { title: `${game.name} · ttGamba` };

export default function BlackjackPage() {
  return (
    <Stage title={game.name} blurb={game.blurb} aside={<Tag>{game.mode}</Tag>}>
      <ComingSoon what="The blackjack table" />
    </Stage>
  );
}
