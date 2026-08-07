"use client";

/**
 * The account's particulars: the ids it is keyed on, and the role it carries.
 *
 * A tab of its own because of how it gets used. Nobody opens settings to read
 * their Steam id — they open it because a banker or an admin has asked them
 * for one, which happens rarely and never at the same moment as a deposit. On
 * the front tab it was five rows of noise under the thing people actually came
 * for; here it is a page that answers exactly one question.
 *
 * Everything but the role comes from the game client, and any of it may be
 * unknown — an account with no Discord linked has no Discord id, and that is
 * not a failure. See `Field` in ./fields.tsx.
 *
 * No panel heading: the tab is the heading, as on the banker desk.
 */

import { Panel, Tag } from "@/components/stage";
import { useChips } from "@/lib/chips";
// How a role reads to a player, who has never heard the word `superadmin`.
// Shared with the banker desk, which labels the same three roles.
import { ROLE_LABELS, ROLE_TONES } from "@/lib/desk";
import { usePlayer } from "@tt/userapp/gamedata";
import { Field, Fields } from "./fields";

export function Identifiers() {
  const { player } = usePlayer();
  const { role } = useChips();

  return (
    <Panel>
      <Fields>
        <Field label="vRP ID" value={player.vrpId} mono />
        <Field label="Discord ID" value={player.discordId} mono />
        <Field label="Steam ID" value={player.steamId} mono />
        <Field label="Source ID" value={player.sourceId} mono />
        <Field
          label="Role"
          // The role is the database's answer, so it is blank until that
          // lands — showing "Player" while it loads would be a guess that
          // happens to be right most of the time, which is the worst kind.
          value={role ? <Tag tone={ROLE_TONES[role]}>{ROLE_LABELS[role]}</Tag> : null}
        />
      </Fields>
    </Panel>
  );
}
