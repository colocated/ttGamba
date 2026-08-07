"use client";

/**
 * The front page of the desk: what the house owes, and what has moved today.
 *
 * Every figure here is read from the shell's single stats call, so the tab
 * badges and this page can never disagree (components/banker/shell.tsx).
 */

import { ArrowDownIcon } from "@phosphor-icons/react/dist/csr/ArrowDown";
import { ArrowUpIcon } from "@phosphor-icons/react/dist/csr/ArrowUp";
import { PokerChipIcon } from "@phosphor-icons/react/dist/csr/PokerChip";

import { Panel } from "@/components/stage";
import { formatChipCount } from "@/lib/format";
import { Empty, Problem, Skeleton } from "./ui";
import { useDeskStats } from "./shell";

export function DeskStatsPage() {
  const { data, failure, loading, reload } = useDeskStats();

  if (failure && !data) return <Problem failure={failure} onRetry={reload} />;
  if (!data) return loading ? <Skeleton rows={2} /> : <Empty>No figures to show.</Empty>;

  const total = data.chipsInPlay + data.chipsHeld;
  const waiting = data.pending.deposit + data.pending.withdrawal;
  const taken = data.approved.deposit + data.approved.withdrawal;

  return (
    <div className="flex flex-col gap-4">
      {/* A refetch that fails behind figures already on screen is not something
          a banker can act on, so it is reported quietly rather than replacing
          the page (see lib/staff.ts). */}
      {failure ? <Problem failure={failure} onRetry={reload} /> : null}

      {/*
        Chips in circulation leads, because it is the only number on this page
        that is a liability: every one of them is a promise the house has made.
      */}
      <Panel className="flex flex-col gap-3">
        <div className="flex items-end justify-between gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-xs uppercase tracking-wide text-ink-muted">
              Chips in circulation
            </span>
            <span className="flex items-center gap-2 font-mono text-3xl tabular-nums text-chip">
              <PokerChipIcon size={26} weight="fill" aria-hidden />
              {formatChipCount(total)}
            </span>
          </div>
          <span className="text-right text-xs text-ink-muted">
            across {data.players} {data.players === 1 ? "account" : "accounts"}
          </span>
        </div>

        {/*
          The split matters: held chips have already left a player's balance
          and are waiting on a banker to hand over the cash. They are not
          spendable by anyone, so counting them as "in play" would overstate
          what the tables are exposed to.
        */}
        <dl className="grid grid-cols-2 gap-3 border-t border-edge pt-3">
          <Split label="In play" value={data.chipsInPlay} hint="Spendable by players." />
          <Split
            label="Held for withdrawal"
            value={data.chipsHeld}
            hint="Taken out of balances, not yet paid out."
          />
        </dl>
      </Panel>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Tile
          label="Awaiting review"
          value={waiting}
          unit={waiting === 1 ? "request" : "requests"}
          hint={`${data.pending.deposit} deposit, ${data.pending.withdrawal} withdrawal`}
          loud={waiting > 0}
        />
        <Tile
          label="Approved, not actioned"
          value={taken}
          unit={taken === 1 ? "request" : "requests"}
          hint={`${data.approved.deposit} deposit, ${data.approved.withdrawal} withdrawal`}
        />
      </div>

      <Panel className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-medium">Last 24 hours</h2>
          <span className="text-xs text-ink-muted">
            {data.settled24h} {data.settled24h === 1 ? "request" : "requests"} settled
          </span>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Flow
            label="Intake"
            amount={data.intake24h}
            hint="Chips created against in-game cash taken in."
            direction="in"
          />
          <Flow
            label="Exfill"
            amount={data.exfill24h}
            hint="Chips destroyed against in-game cash paid out."
            direction="out"
          />
        </div>

        {/*
          The number a banker actually wants: whether the house took chips on
          or gave them back. Spelled out rather than left as arithmetic between
          the two tiles above it.
        */}
        <p className="border-t border-edge pt-3 text-sm text-ink-soft">
          Net{" "}
          <span
            className={`font-mono tabular-nums ${
              data.intake24h >= data.exfill24h ? "text-felt-hi" : "text-loss"
            }`}
          >
            {data.intake24h >= data.exfill24h ? "+" : "−"}
            {formatChipCount(Math.abs(data.intake24h - data.exfill24h))}
          </span>{" "}
          chips {data.intake24h >= data.exfill24h ? "into" : "out of"} circulation.
        </p>
      </Panel>
    </div>
  );
}

function Split({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs uppercase tracking-wide text-ink-muted">{label}</dt>
      <dd className="font-mono text-lg tabular-nums text-ink">{formatChipCount(value)}</dd>
      <p className="text-xs text-ink-muted">{hint}</p>
    </div>
  );
}

function Tile({
  label,
  value,
  unit,
  hint,
  loud,
}: {
  label: string;
  value: number;
  unit: string;
  hint: string;
  /** There is something to do. Colour, not a badge — this is a count, not an alarm. */
  loud?: boolean;
}) {
  return (
    <Panel className="flex flex-col gap-1">
      <span className="text-xs uppercase tracking-wide text-ink-muted">{label}</span>
      <span className="flex items-baseline gap-2">
        <span
          className={`font-mono text-2xl tabular-nums ${loud ? "text-chip" : "text-ink"}`}
        >
          {value}
        </span>
        <span className="text-sm text-ink-soft">{unit}</span>
      </span>
      <span className="text-xs text-ink-muted">{hint}</span>
    </Panel>
  );
}

function Flow({
  label,
  amount,
  hint,
  direction,
}: {
  label: string;
  amount: number;
  hint: string;
  direction: "in" | "out";
}) {
  const Glyph = direction === "in" ? ArrowDownIcon : ArrowUpIcon;

  return (
    <div className="flex flex-col gap-1 rounded-panel border border-edge bg-tone-2 px-4 py-3">
      <span className="text-xs uppercase tracking-wide text-ink-muted">{label}</span>
      <span
        className={`flex items-center gap-1.5 font-mono text-xl tabular-nums ${
          direction === "in" ? "text-felt-hi" : "text-loss"
        }`}
      >
        <Glyph size={16} weight="bold" aria-hidden />
        {formatChipCount(amount)}
      </span>
      <span className="text-xs text-ink-muted">{hint}</span>
    </div>
  );
}
