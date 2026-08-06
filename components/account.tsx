"use client";

/**
 * The settings page's account view.
 *
 * Two sources meet here and they arrive at different times and can each fail
 * on their own: the game client, which knows who the player is, and the
 * database, which knows what the casino owes them. Neither blocks the other —
 * the page renders its shape immediately and fills in as each lands.
 *
 * The casino's half comes from the store the titlebar reads too, so arriving
 * here does not re-ask for a balance already on screen (lib/chips.ts).
 *
 * Nothing here handles the game client being absent entirely. The tablet does
 * not render any page until it is connected, so by the time this mounts there
 * is a client; individual fields may still be unknown, which is a different
 * thing and handled below.
 */

import { PokerChipIcon } from "@phosphor-icons/react/dist/csr/PokerChip";

import { useChips } from "@/lib/chips";
import { formatChips, formatMoney } from "@/lib/format";
import { usePlayer } from "@/lib/gamedata";
import { Odometer } from "./odometer";
import { Panel, Tag } from "./stage";

/** How the role reads to a player, who has never heard the word `superadmin`. */
const ROLE_LABELS = {
  superadmin: "Administrator",
  banker: "Banker",
  player: "Player",
} as const;

export function Account() {
  const { player } = usePlayer();
  const { chips, role, failed } = useChips();

  return (
    <div className="flex flex-col gap-4">
      <Section title="Character">
        <Field label="Name" value={player.name} />
        <Field label="Faction" value={factionLabel(player.factionName, player.factionTag)} />
      </Section>

      <Section title="Identity">
        <Field label="vRP ID" value={player.vrpId} mono />
        <Field label="Discord ID" value={player.discordId} mono />
        <Field label="CFX ID" value={player.cfxId} mono />
        <Field
          label="Role"
          // The role is the database's answer, so it is blank until that
          // lands — showing "Player" while it loads would be a guess that
          // happens to be right most of the time, which is the worst kind.
          value={role ? <Tag>{ROLE_LABELS[role]}</Tag> : null}
        />
      </Section>

      <Section title="Balances">
        <Chips chips={chips} failed={failed} />
        <div className="grid grid-cols-2 gap-3">
          <Money label="Wallet" amount={player.wallet} />
          <Money label="Bank" amount={player.bank} />
        </div>
      </Section>
    </div>
  );
}

/**
 * The chip balance, and the way in. It leads the section because chips are the
 * only currency ttGamba actually deals in — wallet and bank are the game's,
 * shown for context because a player deciding whether to deposit wants to see
 * what they have to deposit *from*.
 */
function Chips({ chips, failed }: { chips: number | null; failed: boolean }) {
  return (
    <div className="flex items-end justify-between gap-4 rounded-panel border border-edge bg-tone-2 p-4">
      <div className="flex flex-col gap-1">
        <span className="text-xs uppercase tracking-wide text-ink-muted">Chips</span>
        <span className="flex items-center gap-2 font-mono text-2xl tabular-nums text-chip">
          <PokerChipIcon size={22} weight="fill" aria-hidden />
          {failed ? (
            <span className="text-base text-loss">Unavailable</span>
          ) : chips === null ? (
            <Pending wide />
          ) : (
            <Odometer value={chips} format={formatChips} />
          )}
        </span>
      </div>

      {/*
        Inert on purpose — the deposit flow is a conversation with a banker and
        has not been designed yet. It is here because the balance is the place
        a player will look for it, and a button that is visibly present and
        explains itself beats a balance with no apparent way to change it.
      */}
      <button
        type="button"
        disabled
        title="Deposits open once the banker hand-off is built"
        className="shrink-0 cursor-not-allowed rounded-control border border-edge bg-raised px-3 py-2 text-sm font-medium text-ink-muted"
      >
        Deposit
      </button>
    </div>
  );
}

/** An in-game balance. Read-only — the game owns these numbers. */
function Money({ label, amount }: { label: string; amount: number | null }) {
  return (
    <div className="flex flex-col gap-1 rounded-panel border border-edge bg-tone-2 px-4 py-3">
      <span className="text-xs uppercase tracking-wide text-ink-muted">{label}</span>
      <span className="font-mono text-base tabular-nums">
        {amount === null ? <Pending /> : formatMoney(amount)}
      </span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Panel className="flex flex-col gap-3">
      <h2 className="text-sm font-medium">{title}</h2>
      <dl className="flex flex-col gap-3">{children}</dl>
    </Panel>
  );
}

/**
 * One labelled value. `null` is not an error — most of these are unknown until
 * the client reports them, and some stay unknown forever (a player in no
 * faction, an account with no Discord linked).
 */
function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  const empty = value === null || value === undefined || value === "";

  return (
    <div className="flex items-center justify-between gap-4 border-b border-edge/50 pb-3 last:border-0 last:pb-0">
      <dt className="text-sm text-ink-soft">{label}</dt>
      <dd className={`min-w-0 truncate text-sm ${mono ? "font-mono tabular-nums" : ""}`}>
        {empty ? <Pending /> : value}
      </dd>
    </div>
  );
}

/**
 * A value that is not there yet, or not there at all. One glyph for both,
 * because the page cannot tell them apart and inventing a spinner for the
 * first would make the second look broken.
 */
function Pending({ wide }: { wide?: boolean }) {
  return (
    <span className={`text-ink-muted ${wide ? "text-base" : ""}`} aria-label="Unknown">
      —
    </span>
  );
}

function factionLabel(name: string | null, tag: string | null): string | null {
  if (!name) return null;
  return tag ? `${name} [${tag}]` : name;
}
