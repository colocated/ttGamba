"use client";

/**
 * One kind's queue: deposits or withdrawals, oldest first.
 *
 * The list is deliberately thin — a name, an id, a figure and how long it has
 * been sitting there. Everything a decision actually needs is a press away in
 * the modal, and putting it in the row instead would make a queue of twenty
 * requests something to read rather than something to scan.
 */

import { useCallback, useMemo, useState } from "react";
import { ArrowClockwiseIcon } from "@phosphor-icons/react/dist/csr/ArrowClockwise";

import { listRequests } from "@/lib/banker";
import type { Caller, Outcome, RequestKind, RequestRow, RequestStatus } from "@/lib/desk";
import { KINDS } from "@/lib/desk";
import { useAccumulated, useDeskCall, type Paged } from "@/lib/staff";
import { RequestModal } from "./request-modal";
import { ChipAmount, Empty, Problem, Skeleton, StatusPill, When } from "./ui";

/** The working queue: everything a banker still has something to do about. */
const OPEN: RequestStatus[] = ["pending", "approved"];

export function Queue({ kind }: { kind: RequestKind }) {
  const [archive, setArchive] = useState(false);
  const [cursor, setCursor] = useState<number | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);

  const statuses = useMemo(() => (archive ? undefined : OPEN), [archive]);

  // Stamped with the cursor it was fetched for — see `Paged` in lib/staff.ts
  // for why the stamp is what makes "load more" safe.
  const load = useCallback(
    async (caller: Caller): Promise<Outcome<Paged<RequestRow>>> => {
      const result = await listRequests(caller, { kind, statuses, cursor });
      return result.ok ? { ok: true, data: { from: cursor, page: result.data } } : result;
    },
    [kind, statuses, cursor],
  );

  const { data, failure, loading, reload } = useDeskCall(load);
  const rows = useAccumulated(data);
  const more = data?.page.more ?? false;

  /** Back to the top of the list, and ask again. */
  const refresh = useCallback(() => {
    setCursor(null);
    reload();
  }, [reload]);

  const first = loading && rows.length === 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Toggle
            active={!archive}
            onClick={() => {
              setArchive(false);
              setCursor(null);
            }}
          >
            Open
          </Toggle>
          <Toggle
            active={archive}
            onClick={() => {
              setArchive(true);
              setCursor(null);
            }}
          >
            All
          </Toggle>
        </div>

        <button
          type="button"
          onClick={refresh}
          title="Check for new requests"
          className="flex cursor-pointer items-center gap-1.5 rounded-control border border-edge bg-tone-2 px-2.5 py-1.5 text-xs text-ink-soft transition-colors duration-120 ease-out hover:bg-raised-hover hover:text-ink"
        >
          <ArrowClockwiseIcon size={14} className={loading ? "animate-refresh" : undefined} aria-hidden />
          Refresh
        </button>
      </div>

      {failure ? <Problem failure={failure} onRetry={reload} /> : null}

      {first ? (
        <Skeleton />
      ) : rows.length === 0 ? (
        <Empty>
          {archive
            ? `No ${KINDS[kind].noun} requests have ever been made.`
            : `Nothing waiting. New ${KINDS[kind].noun} requests appear here as players make them.`}
        </Empty>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((row) => (
            <li key={row.id}>
              <Row row={row} onOpen={() => setOpenId(row.id)} />
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

      {openId === null ? null : (
        <RequestModal
          requestId={openId}
          onClose={() => setOpenId(null)}
          // A settled request usually leaves the open queue, so the list it
          // came from is stale the moment the modal acts on it.
          onMoved={refresh}
        />
      )}
    </div>
  );
}

/**
 * One request in the queue.
 *
 * A button rather than a row with a button in it: the whole thing is the
 * target, which is what makes a queue quick to work through, and it gets
 * keyboard focus and Enter for free.
 */
function Row({ row, onOpen }: { row: RequestRow; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-3 rounded-panel border border-edge bg-raised px-4 py-3 text-left transition-colors duration-120 ease-out hover:border-edge-strong hover:bg-raised-hover"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-medium">
            {/* A request always has a player, even when the client never told
                us their name — the id is the identity, the name is a label. */}
            {row.playerName ?? `vRP ${row.vrpId}`}
          </span>
          <StatusPill status={row.status} />
        </div>

        <div className="flex min-w-0 items-center gap-3 font-mono text-xs text-ink-muted">
          <span className="shrink-0">vRP {row.vrpId}</span>
          {row.discordId ? (
            <span className="truncate" title={`Discord ${row.discordId}`}>
              Discord {row.discordId}
            </span>
          ) : null}
          <When at={row.createdAt} className="shrink-0" />
        </div>
      </div>

      <ChipAmount kind={row.kind} amount={row.amount} />
    </button>
  );
}

function Toggle({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`cursor-pointer rounded-control border px-2.5 py-1.5 text-xs transition-colors duration-120 ease-out ${
        active
          ? "border-edge-strong bg-tone-3 text-ink"
          : "border-edge bg-tone-2 text-ink-soft hover:bg-raised-hover hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}
