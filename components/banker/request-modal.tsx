"use client";

/**
 * One request, opened out.
 *
 * This is where a banker actually decides something, so it carries everything
 * that bears on the decision and nothing that does not: who asked (as they
 * were at the time), what the account looks like *now*, what has already
 * happened to the request, and the moves still available.
 *
 * The moves come from the same table the server enforces (`STAFF_MOVES` in
 * lib/desk.ts), so a button that is not on screen is also a call that would be
 * refused. The interface never knows a rule the server does not.
 */

import { useCallback, useState } from "react";

import { CloseButton, Overlay } from "@/components/overlay";
import { getRequest, moveRequest } from "@/lib/banker";
import type { Caller, RequestStatus } from "@/lib/desk";
import { describeAction, KINDS, NOTE_LIMIT, ROLE_LABELS, STAFF_MOVES, STATUSES } from "@/lib/desk";
import { formatChipCount } from "@/lib/format";
import { useDeskAction, useDeskCall } from "@/lib/staff";
import { Button, ChipAmount, Detail, factionLabel, Problem, Skeleton, Stamp, StatusPill, When } from "./ui";

/** What each move is called on the button that makes it. */
const MOVE_LABELS: Record<RequestStatus, string> = {
  pending: "Reopen",
  approved: "Approve",
  closed: "Mark actioned",
  denied: "Deny",
  cancelled: "Cancel",
};

const MOVE_TONES: Record<RequestStatus, "quiet" | "go" | "stop"> = {
  pending: "quiet",
  approved: "go",
  closed: "go",
  denied: "stop",
  cancelled: "quiet",
};

export function RequestModal({
  requestId,
  onClose,
  onMoved,
}: {
  requestId: number;
  onClose: () => void;
  /** The queue behind this is stale once a request has moved. */
  onMoved: () => void;
}) {
  const load = useCallback((caller: Caller) => getRequest(caller, requestId), [requestId]);
  const { data, failure, loading, reload } = useDeskCall(load);
  const { run, busy, failure: moveFailure } = useDeskAction();
  const [note, setNote] = useState("");

  const move = async (to: RequestStatus) => {
    const moved = await run((caller) => moveRequest(caller, { requestId, to, note }));
    if (!moved) return;
    setNote("");
    onMoved();
    // Stay open on purpose. A banker who has just approved something is very
    // often about to action it, and closing the modal would make them find the
    // same row again to do it.
    reload();
  };

  const request = data?.request;
  const moves = request ? STAFF_MOVES[request.status] : [];

  return (
    <Overlay onClose={onClose} label="Request details">
      <header className="flex shrink-0 items-start gap-3 border-b border-edge px-5 py-4">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="truncate text-base font-semibold tracking-tight">
              {request ? (request.playerName ?? `vRP ${request.vrpId}`) : "Request"}
            </h2>
            {request ? <StatusPill status={request.status} /> : null}
          </div>
          <p className="text-xs text-ink-soft">
            {request
              ? `${KINDS[request.kind].label} · asked for ${formatChipCount(request.amount)} chips`
              : "Loading…"}
          </p>
        </div>

        <CloseButton />
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
        {failure ? <Problem failure={failure} onRetry={reload} /> : null}

        {!data ? (
          loading ? (
            <Skeleton rows={4} />
          ) : null
        ) : (
          <>
            <div className="flex items-center justify-between gap-4 rounded-panel border border-edge bg-tone-2 px-4 py-3">
              <span className="text-xs uppercase tracking-wide text-ink-muted">
                {KINDS[data.request.kind].label}
              </span>
              <ChipAmount kind={data.request.kind} amount={data.request.amount} size="large" />
            </div>

            {/*
              Two sections, and the split is the point. The first is a copy
              taken when the request was made; the second is the account as it
              stands now. A banker checking that the person in front of them is
              the person who asked needs the first, and a banker deciding
              whether the balance covers it needs the second.
            */}
            <Section title="Player, as they were when they asked">
              <Fields>
                <Detail label="Name" value={data.request.playerName} />
                <Detail label="vRP ID" value={data.request.vrpId} mono />
                <Detail label="Discord ID" value={data.request.discordId} mono />
                <Detail label="Steam ID" value={data.request.steamId} mono />
                <Detail
                  label="Faction"
                  value={factionLabel(data.request.factionName, data.request.factionTag)}
                />
              </Fields>
            </Section>

            <Section title="Account now">
              <Fields>
                <Detail
                  label="Role"
                  value={data.account ? ROLE_LABELS[data.account.role] : null}
                />
                <Detail
                  label="Chips"
                  value={data.account ? formatChipCount(data.account.chips) : null}
                  mono
                />
                {/*
                  Only worth saying when it is not zero — on a quiet account it
                  is a row of dashes that teaches nothing, and on a busy one it
                  is the reason a balance looks lower than expected.
                */}
                {data.heldElsewhere > 0 ? (
                  <Detail
                    label="Held elsewhere"
                    value={`${formatChipCount(data.heldElsewhere)} on other withdrawals`}
                  />
                ) : null}
              </Fields>
            </Section>

            {data.request.note ? (
              <Section title="Note">
                <p className="whitespace-pre-wrap text-sm text-ink-soft">{data.request.note}</p>
              </Section>
            ) : null}

            <Section title="History">
              {data.history.length === 0 ? (
                <p className="text-sm text-ink-muted">Nothing recorded yet.</p>
              ) : (
                <ol className="flex flex-col gap-2">
                  {data.history.map((event) => (
                    <li key={event.id} className="flex flex-col gap-0.5">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="min-w-0 truncate text-sm">
                          {describeAction(event.action).label}
                          {event.actorName ? (
                            <span className="text-ink-muted"> · {event.actorName}</span>
                          ) : null}
                        </span>
                        <Stamp at={event.at} />
                      </div>
                      {event.note ? (
                        <p className="whitespace-pre-wrap text-xs text-ink-soft">{event.note}</p>
                      ) : null}
                    </li>
                  ))}
                </ol>
              )}
            </Section>

            <p className="text-xs text-ink-muted">
              Asked <When at={data.request.createdAt} />
              {data.request.handledByName && data.request.handledAt
                ? ` · last moved by ${data.request.handledByName}`
                : ""}
            </p>
          </>
        )}
      </div>

      {request && moves.length > 0 ? (
        <footer className="flex shrink-0 flex-col gap-3 border-t border-edge bg-tone-2 px-5 py-4">
          <p className="text-xs text-ink-soft">{STATUSES[request.status].blurb}</p>

          <label className="flex flex-col gap-1">
            <span className="text-xs uppercase tracking-wide text-ink-muted">
              Note — required to deny
            </span>
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={NOTE_LIMIT}
              rows={2}
              placeholder="Why, or anything the next banker should know."
              className="resize-none rounded-control border border-edge bg-tone-1 px-3 py-2 text-sm text-ink placeholder:text-ink-muted"
            />
          </label>

          {moveFailure ? <Problem failure={moveFailure} /> : null}

          <div className="flex flex-wrap gap-2">
            {moves.map((to) => (
              <Button
                key={to}
                tone={MOVE_TONES[to]}
                // The server refuses a denial with no note too — this is so a
                // banker finds out before they press it rather than after.
                disabled={busy || (to === "denied" && note.trim() === "")}
                onClick={() => move(to)}
              >
                {MOVE_LABELS[to]}
              </Button>
            ))}
          </div>

          {/*
            Said out loud because it is the one irreversible press on the
            screen, and "Mark actioned" does not look like it moves money.
          */}
          {moves.includes("closed") ? (
            <p className="text-xs text-ink-muted">
              {request.kind === "deposit"
                ? `Marking this actioned credits ${formatChipCount(request.amount)} chips. Take the in-game cash first.`
                : `The chips are already held. Marking this actioned means you have paid the in-game cash out.`}
            </p>
          ) : null}
        </footer>
      ) : null}
    </Overlay>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-xs font-medium uppercase tracking-wide text-ink-muted">{title}</h3>
      {children}
    </section>
  );
}

/** `Detail` is a `dt`/`dd` pair, so it needs a description list around it. */
function Fields({ children }: { children: React.ReactNode }) {
  return <dl className="flex flex-col gap-2">{children}</dl>;
}
