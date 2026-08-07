"use client";

/**
 * The settings page's front tab: who the player is, what they are holding, and
 * what they have asked a banker for.
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
 * for are in components/settings/requests.tsx; this owns the query behind the
 * list, so that making a request and cancelling one both have somewhere to say
 * the page has moved on.
 *
 * The account's own particulars — the ids it is keyed on, and the role it
 * carries — are a tab along, in components/settings/identifiers.tsx. Those are
 * looked up once, when something has gone wrong, and had no business sitting
 * between a balance and the button that changes it.
 *
 * Nothing here handles the game client being absent entirely. The tablet does
 * not render any page until it is connected, so by the time this mounts there
 * is a client; individual fields may still be unknown, which is a different
 * thing and handled below.
 */

import { useState } from "react";
import { PokerChipIcon } from "@phosphor-icons/react/dist/csr/PokerChip";

import { Problem, Skeleton } from "@/components/banker/ui";
import { Count } from "@/components/stage";
import { refreshChips, useChips } from "@/lib/chips";
import { STATUSES, type RequestKind } from "@/lib/desk";
import { formatChips, formatMoney } from "@/lib/format";
import { usePlayer } from "@tt/userapp/gamedata";
import { getMyRequests } from "@/lib/requests";
import { usePlayerCall } from "@/lib/staff";
import { Odometer } from "@tt/window";
import { Drawer, Field, Fields, Pending, Section } from "./fields";
import { RequestForm, RequestList } from "./requests";

export function Account() {
  const { player } = usePlayer();
  const { chips, failed } = useChips();
  /** Which request is being composed, if any. The modal is either or neither. */
  const [asking, setAsking] = useState<RequestKind | null>(null);
  /** The requests drawer. Shut on arrival — see the `Drawer` below. */
  const [showRequests, setShowRequests] = useState(false);
  const requests = usePlayerCall(getMyRequests);

  /**
   * A request has just been made or taken back. Both move the list, and a
   * withdrawal moves the balance as well — the chips are held the moment it is
   * asked for — so the figure in the titlebar is re-read rather than guessed
   * at from here (lib/chips.ts).
   *
   * The drawer is opened along with it. A withdrawal takes the chips the moment
   * it is asked for, and the balance in the titlebar drops to match; the reason
   * that does not read as the app losing someone's money is that the request is
   * sitting on screen underneath it, saying where they went. That argument is
   * the whole shape of components/settings/requests.tsx, and a drawer that
   * stayed shut over the answer would quietly undo it.
   *
   * Deliberately not also closing the modal. The form dismisses itself, which
   * is what lets it animate out; unmounting it from here the moment the data
   * changed would cut that short (components/overlay.tsx).
   */
  const changed = () => {
    requests.reload();
    refreshChips();
    setShowRequests(true);
  };

  /*
    What is still in a banker's hands. Settled requests are history and stay
    behind the drawer; these are the ones the player is waiting on, and the only
    reason the closed section has to ask for attention.
  */
  const waiting = requests.data?.filter((row) => STATUSES[row.status].open).length ?? 0;

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

      {/*
        Shut by default. It is the longest thing on the tab and the least often
        wanted — a player who has nothing outstanding has no reason to read a
        list of requests that already settled, and one who does is told so by
        the header without opening it.
      */}
      <Drawer
        title="Requests"
        aside={<RequestsAside waiting={waiting} failed={requests.failure !== null} />}
        open={showRequests}
        onToggle={() => setShowRequests((was) => !was)}
      >
        {requests.failure ? (
          <Problem failure={requests.failure} onRetry={requests.reload} />
        ) : null}
        {requests.data ? (
          <RequestList rows={requests.data} onChanged={changed} />
        ) : requests.loading ? (
          <Skeleton rows={2} />
        ) : null}
      </Drawer>

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
 * What the requests header says with the drawer shut.
 *
 * A closed section is only honest if it can tell the player when there is
 * something inside worth opening, and there are two of those: requests a banker
 * has not dealt with yet, and the list having failed to load at all. The second
 * matters more than it looks — the retry is behind the drawer, so a failure
 * that said nothing here would be a section that is simply empty forever.
 *
 * Nothing at all when there is neither. A header that always carries a badge is
 * a header nobody reads.
 */
function RequestsAside({ waiting, failed }: { waiting: number; failed: boolean }) {
  if (failed) return <span className="text-xs font-normal text-loss">Unavailable</span>;
  if (waiting === 0) return null;

  return <Count value={waiting} title={`${waiting} still open`} />;
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

function factionLabel(name: string | null, tag: string | null): string | null {
  if (!name) return null;
  return tag ? `${name} [${tag}]` : name;
}
