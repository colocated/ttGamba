"use client";

/**
 * The audit log: everything the app has written down, newest first.
 *
 * The filters are the feature. A log nobody can narrow is a log nobody reads,
 * and the three questions it actually gets asked are "what happened to this
 * player", "who has been approving deposits" and "what happened around this
 * time" — which is action, player and a date range.
 *
 * The action list comes from the registry in lib/desk.ts, so a game wired up
 * later appears in the filter the moment it declares its events. Rows carrying
 * an action the registry has since forgotten still render, under their raw key;
 * a log that hides what it does not recognise is quietly wrong.
 */

import { useCallback, useMemo, useState } from "react";
import { ArrowClockwiseIcon } from "@phosphor-icons/react/dist/csr/ArrowClockwise";

import { listAudit } from "@/lib/banker";
import type { AuditRow, Caller, Outcome } from "@/lib/desk";
import { AUDIT_ACTION_KEYS, AUDIT_ACTIONS, describeAction, flowOf, ROLE_LABELS } from "@/lib/desk";
import { formatChipCount } from "@/lib/format";
import { useAccumulated, useDeskCall, type Paged } from "@/lib/staff";
import { Empty, Problem, Skeleton, Stamp } from "./ui";

export function AuditLog() {
  const [action, setAction] = useState("");
  const [player, setPlayer] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const [cursor, setCursor] = useState<number | null>(null);

  /*
    The filters as the server wants them. Memoised on the raw strings so that
    typing in the vRP ID box is what changes the query — an object rebuilt
    every render would make `load` a new function every render, and the query
    behind it would never stop firing.
  */
  const filter = useMemo(() => {
    const vrpId = Number(player.trim());
    return {
      action: action === "" ? null : action,
      vrpId: Number.isSafeInteger(vrpId) && vrpId > 0 ? vrpId : null,
      from: from === "" ? null : new Date(from).getTime(),
      to: to === "" ? null : new Date(to).getTime(),
    };
  }, [action, player, from, to]);

  /*
    Any change of filter is a different question, so it starts from the top.

    Adjusted during render rather than from an effect: the cursor has to be
    back at `null` in the same pass that builds `load`, or the first page of
    the new filter is fetched from the old filter's cursor and silently skips
    everything above it.
  */
  const [asked, setAsked] = useState(filter);
  if (asked !== filter) {
    setAsked(filter);
    setCursor(null);
  }

  // Stamped with the cursor it was fetched for — see `Paged` in lib/staff.ts.
  const load = useCallback(
    async (caller: Caller): Promise<Outcome<Paged<AuditRow>>> => {
      const result = await listAudit(caller, { ...filter, cursor });
      return result.ok ? { ok: true, data: { from: cursor, page: result.data } } : result;
    },
    [filter, cursor],
  );

  const { data, failure, loading, reload } = useDeskCall(load);
  const rows = useAccumulated(data);
  const more = data?.page.more ?? false;

  const clear = () => {
    setAction("");
    setPlayer("");
    setFrom("");
    setTo("");
  };

  const filtered = action !== "" || player !== "" || from !== "" || to !== "";
  const first = loading && rows.length === 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 rounded-panel border border-edge bg-tone-2 p-3">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Labelled label="Action">
            <select
              value={action}
              onChange={(event) => setAction(event.target.value)}
              className="w-full cursor-pointer rounded-control border border-edge bg-tone-1 px-2 py-1.5 text-sm text-ink outline-none"
            >
              <option value="">Everything</option>
              {AUDIT_ACTION_KEYS.map((key) => (
                <option key={key} value={key}>
                  {AUDIT_ACTIONS[key].label}
                </option>
              ))}
            </select>
          </Labelled>

          <Labelled label="Player (vRP ID)">
            <input
              value={player}
              onChange={(event) => setPlayer(event.target.value)}
              inputMode="numeric"
              placeholder="Anyone"
              className="w-full rounded-control border border-edge bg-tone-1 px-2 py-1.5 font-mono text-sm tabular-nums text-ink outline-none placeholder:font-sans placeholder:text-ink-muted"
            />
          </Labelled>

          <Labelled label="From">
            <input
              type="datetime-local"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              className="w-full rounded-control border border-edge bg-tone-1 px-2 py-1.5 font-mono text-sm text-ink outline-none"
            />
          </Labelled>

          <Labelled label="To">
            <input
              type="datetime-local"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              className="w-full rounded-control border border-edge bg-tone-1 px-2 py-1.5 font-mono text-sm text-ink outline-none"
            />
          </Labelled>
        </div>

        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={clear}
            disabled={!filtered}
            className="cursor-pointer rounded-control px-2 py-1 text-xs text-ink-soft transition-colors duration-120 ease-out hover:text-ink disabled:cursor-default disabled:text-ink-muted/60"
          >
            Clear filters
          </button>

          <button
            type="button"
            onClick={() => {
              setCursor(null);
              reload();
            }}
            className="flex cursor-pointer items-center gap-1.5 rounded-control border border-edge bg-tone-1 px-2.5 py-1.5 text-xs text-ink-soft transition-colors duration-120 ease-out hover:bg-raised-hover hover:text-ink"
          >
            <ArrowClockwiseIcon
              size={14}
              className={loading ? "animate-refresh" : undefined}
              aria-hidden
            />
            Refresh
          </button>
        </div>
      </div>

      {failure ? <Problem failure={failure} onRetry={reload} /> : null}

      {first ? (
        <Skeleton rows={5} />
      ) : rows.length === 0 ? (
        <Empty>
          {filtered
            ? "Nothing matches those filters."
            : "Nothing has happened yet. Every action across the app lands here as it is built."}
        </Empty>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {rows.map((row) => (
            <li key={row.id}>
              <Entry row={row} />
            </li>
          ))}
        </ul>
      )}

      {more ? (
        <button
          type="button"
          onClick={() => setCursor(rows[rows.length - 1]?.id ?? null)}
          disabled={loading}
          className="cursor-pointer rounded-control border border-edge bg-tone-2 px-3 py-2 text-sm text-ink-soft transition-colors duration-120 ease-out hover:bg-raised-hover hover:text-ink disabled:cursor-default disabled:text-ink-muted"
        >
          {loading ? "Loading…" : "Load more"}
        </button>
      ) : null}
    </div>
  );
}

/**
 * One line of the trail.
 *
 * Read as a sentence: when, what, to whom, by whom, how much. The amount is
 * coloured by the direction the action moves chips in — which the registry
 * knows and the row does not, so an event with no flow gets no colour rather
 * than a misleading one.
 */
function Entry({ row }: { row: AuditRow }) {
  const { label, known } = describeAction(row.action);
  const flow = flowOf(row.action);

  return (
    <div className="flex flex-col gap-1 rounded-control border border-edge bg-raised px-3 py-2">
      <div className="flex items-baseline gap-3">
        <span className={`min-w-0 flex-1 truncate text-sm ${known ? "" : "font-mono text-ink-soft"}`}>
          {label}
        </span>
        {row.amount !== null ? (
          <span
            className={`shrink-0 font-mono text-sm tabular-nums ${
              flow === "intake" ? "text-felt-hi" : flow === "exfill" ? "text-loss" : "text-ink-soft"
            }`}
          >
            {flow === "intake" ? "+" : flow === "exfill" ? "−" : ""}
            {formatChipCount(row.amount)}
          </span>
        ) : null}
        <Stamp at={row.at} />
      </div>

      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-xs text-ink-muted">
        {row.subjectVrpId !== null ? (
          <span className="font-mono">
            {row.subjectName ?? "—"} <span className="text-ink-muted/70">#{row.subjectVrpId}</span>
          </span>
        ) : null}

        {/* Only worth naming when it was somebody else. A player cancelling
            their own request does not need "by themselves" after it. */}
        {row.actorVrpId !== null && row.actorVrpId !== row.subjectVrpId ? (
          <span>
            by {row.actorName ?? `#${row.actorVrpId}`}
            {row.actorRole ? ` (${ROLE_LABELS[row.actorRole]})` : ""}
          </span>
        ) : null}

        {row.balanceAfter !== null ? (
          <span className="font-mono">balance {formatChipCount(row.balanceAfter)}</span>
        ) : null}
      </div>

      {row.note ? (
        <p className="whitespace-pre-wrap border-t border-edge/50 pt-1 text-xs text-ink-soft">
          {row.note}
        </p>
      ) : null}
    </div>
  );
}

function Labelled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs uppercase tracking-wide text-ink-muted">{label}</span>
      {children}
    </label>
  );
}
