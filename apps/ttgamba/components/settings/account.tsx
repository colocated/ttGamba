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
 * It is also where chips cross the in-game boundary, because the balance is
 * where a player looks for that. The form and the list of what they have asked
 * for are in components/requests.tsx; this owns the query behind the list, so
 * that making a request and cancelling one both have somewhere to say the
 * page has moved on.
 *
 * Nothing here handles the game client being absent entirely. The tablet does
 * not render any page until it is connected, so by the time this mounts there
 * is a client; individual fields may still be unknown, which is a different
 * thing and handled below.
 */

import { useState } from "react";
import { PokerChipIcon } from "@phosphor-icons/react/dist/csr/PokerChip";

import { Problem, Skeleton } from "@/components/banker/ui";
import { refreshChips, useChips } from "@/lib/chips";
// How a role reads to a player, who has never heard the word `superadmin`.
// Shared with the banker desk, which labels the same three roles.
import { ROLE_LABELS, ROLE_TONES, type RequestKind } from "@/lib/desk";
import { formatChips, formatMoney } from "@/lib/format";
import { usePlayer } from "@/lib/gamedata";
import { getMyRequests } from "@/lib/requests";
import { usePlayerCall } from "@/lib/staff";
import { Odometer } from "./odometer";
import { RequestForm, RequestList } from "./requests";
import { Panel, Tag } from "./stage";

export function Account() {
  const { player } = usePlayer();
  const { chips, role, failed } = useChips();
  /** Which request is being composed, if any. The modal is either or neither. */
  const [asking, setAsking] = useState<RequestKind | null>(null);
  const requests = usePlayerCall(getMyRequests);

  /**
   * A request has just been made or taken back. Both move the list, and a
   * withdrawal moves the balance as well — the chips are held the moment it is
   * asked for — so the figure in the titlebar is re-read rather than guessed
   * at from here (lib/chips.ts).
   *
   * Deliberately not also closing the modal. The form dismisses itself, which
   * is what lets it animate out; unmounting it from here the moment the data
   * changed would cut that short (components/overlay.tsx).
   */
  const changed = () => {
    requests.reload();
    refreshChips();
  };

  return (
    <div className="flex flex-col gap-4">
      <Section title="Character">
        <Fields>
          <Field label="Name" value={player.name} />
          <Field label="Faction" value={factionLabel(player.factionName, player.factionTag)} />
        </Fields>
      </Section>

      <Section title="Balances">
        <Chips chips={chips} failed={failed} onAsk={setAsking} />
        <div className="grid grid-cols-2 gap-3">
          <Money label="Wallet" amount={player.wallet} />
          <Money label="Bank" amount={player.bank} />
        </div>
      </Section>

      <Section title="Requests">
        {requests.failure ? (
          <Problem failure={requests.failure} onRetry={requests.reload} />
        ) : null}
        {requests.data ? (
          <RequestList rows={requests.data} onChanged={changed} />
        ) : requests.loading ? (
          <Skeleton rows={2} />
        ) : null}
      </Section>

      <Section title="Identity">
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
      </Section>

      {asking === null ? null : (
        <RequestForm
          kind={asking}
          chips={chips}
          player={player}
          onClose={() => setAsking(null)}
          onMade={changed}
        />
      )}
    </div>
  );
}

/**
 * The chip balance, and both ways across the boundary. It leads the section
 * because chips are the only currency ttGamba actually deals in — wallet and
 * bank are the game's, shown for context because a player deciding whether to
 * deposit wants to see what they have to deposit *from*.
 *
 * Deposit carries the colour and withdraw does not, which is the one asymmetry
 * worth building in: felt green is the app's action colour, a deposit is the
 * press that leads somewhere, and two identically weighted buttons beside a
 * balance is a decision where there did not need to be one.
 */
function Chips({
  chips,
  failed,
  onAsk,
}: {
  chips: number | null;
  failed: boolean;
  onAsk: (kind: RequestKind) => void;
}) {
  /*
    A withdrawal comes out of a balance, so there has to be one to come out of.
    A deposit does not care — it is chips arriving — and stays available even
    when the balance could not be read at all.
  */
  const canWithdraw = chips !== null && chips > 0;
  const why = failed
    ? "Your chip balance is unavailable"
    : chips === null
      ? "Waiting for your chip balance"
      : "You have no chips to withdraw";

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

      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={() => onAsk("withdrawal")}
          disabled={!canWithdraw}
          title={canWithdraw ? undefined : why}
          className={`rounded-control border px-3 py-2 text-sm font-medium transition-colors duration-120 ease-out ${
            canWithdraw
              ? "cursor-pointer border-edge bg-tone-3 text-ink-soft hover:bg-raised-hover hover:text-ink"
              : "cursor-not-allowed border-edge bg-tone-2 text-ink-muted/60"
          }`}
        >
          Withdraw
        </button>

        <button
          type="button"
          onClick={() => onAsk("deposit")}
          className="cursor-pointer rounded-control border border-felt bg-felt/15 px-3 py-2 text-sm font-medium text-felt-hi transition-colors duration-120 ease-out hover:bg-felt/25"
        >
          Deposit
        </button>
      </div>
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
      {children}
    </Panel>
  );
}

/** `Field` is a `dt`/`dd` pair, so it needs a description list around it. */
function Fields({ children }: { children: React.ReactNode }) {
  return <dl className="flex flex-col gap-3">{children}</dl>;
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
