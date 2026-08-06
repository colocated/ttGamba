import { ComingSoon, Stage, Tag } from "@/components/stage";
import { getGame } from "@/lib/games";

const game = getGame("cross-the-road");

export const metadata = { title: `${game.name} · ttGamba` };

export default function CrossTheRoadPage() {
  return (
    <Stage title={game.name} blurb={game.blurb} aside={<Tag>{game.mode}</Tag>}>
      <ComingSoon what="The lane runner and cash-out ladder" />
    </Stage>
  );
}
