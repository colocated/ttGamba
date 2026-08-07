"use client";

/**
 * Player lookup.
 *
 * A vRP ID goes in and everything the app knows about that account comes back.
 * That is thinner than it sounds and deliberately so: ttGamba stores no copy of
 * a player's name, faction or Discord (prisma/schema.prisma), because the game
 * client answers all of those live and a mirror would only ever be a stale
 * version of what the player is already looking at. What is here instead is the
 * casino's own record — the balance, the role, the requests — plus whichever
 * identity was captured the last time they used the desk.
 */

import { useCallback, useState } from "react";
import { MagnifyingGlassIcon } from "@phosphor-icons/react/dist/csr/MagnifyingGlass";

import { Panel } from "@/components/stage";
import { lookupPlayer } from "@/lib/banker";
import type { Caller } from "@/lib/desk";
import { describeAction, KINDS, ROLE_LABELS } from "@/lib/desk";
import { formatChipCount } from "@/lib/format";
import { useDeskCall } from "@/lib/staff";
import {
  ChipAmount,
  ChipFigure,
  Detail,
  Empty,
  factionLabel,
  Problem,
  Skeleton,
  Stamp,
  StatusPill,
  When,
} from "./ui";

export function Lookup() {
  const [query, setQuery] = useState("");
  const [target, setTarget] = useState<number | null>(null);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const parsed = Number(query.trim());
    // An unparseable id never reaches the server. The lookup would refuse it
    // anyway, but a round trip to be told "that is not a number" is a round
    // trip spent saying what the box already knows.
    setTarget(Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null);
  };

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={submit} className="flex gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-control border border-edge bg-tone-2 px-3 focus-within:border-edge-strong">
          <MagnifyingGlassIcon size={16} className="shrink-0 text-ink-muted" aria-hidden />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            inputMode="numeric"
            placeholder="vRP ID"
            aria-label="vRP ID"
            className="min-w-0 flex-1 bg-transparent py-2 font-mono text-sm tabular-nums text-ink outline-none placeholder:font-sans placeholder:text-ink-muted"
          />
        </div>
        <button
          type="submit"
          className="shrink-0 cursor-pointer rounded-control border border-edge bg-tone-2 px-4 py-2 text-sm font-medium text-ink-soft transition-colors duration-120 ease-out hover:bg-raised-hover hover:text-ink"
        >
          Look up
        </button>
      </form>

      {target === null ? (
        <Empty>Enter a player&apos;s vRP ID to see their account, requests and history.</Empty>
      ) : (
        // Keyed on the id so a second lookup starts clean rather than showing
        // the previous player's figures while the next ones load.
        <Profile key={target} vrpId={target} />
      )}
    </div>
  );
}

function Profile({ vrpId }: { vrpId: number }) {
  const load = useCallback((caller: Caller) => lookupPlayer(caller, vrpId), [vrpId]);
  const { data, failure, loading, reload } = useDeskCall(load);

  if (failure && !data) return <Problem failure={failure} onRetry={reload} />;
  if (!data) return loading ? <Skeleton rows={4} /> : null;

  return (
    <div className="flex flex-col gap-4">
      <Panel className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-0.5">
            <h2 className="text-base font-semibold tracking-tight">
              {data.identity?.name ?? `vRP ${data.vrpId}`}
            </h2>
            <p className="text-xs text-ink-muted">
              {ROLE_LABELS[data.role]} · account opened <When at={data.createdAt} />
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <ChipFigure amount={data.chips} className="text-xl" />
            {data.held > 0 ? (
              <span className="text-xs text-ink-muted">
                + {formatChipCount(data.held)} held for withdrawal
              </span>
            ) : null}
          </div>
        </div>

        <dl className="flex flex-col gap-2 border-t border-edge pt-3">
          <Detail label="vRP ID" value={data.vrpId} mono />
          <Detail label="Discord ID" value={data.identity?.discordId} mono />
          <Detail label="Steam ID" value={data.identity?.steamId} mono />
          <Detail
            label="Faction"
            value={factionLabel(
              data.identity?.factionName ?? null,
              data.identity?.factionTag ?? null,
            )}
          />
          <Detail label="Deposited, lifetime" value={formatChipCount(data.deposited)} mono />
          <Detail label="Withdrawn, lifetime" value={formatChipCount(data.withdrawn)} mono />
        </dl>

        {data.identity ? (
          // The identity above is a copy, and saying when it was taken is the
          // difference between "this is who they are" and "this is who they
          // were the last time they asked us for something".
          <p className="text-xs text-ink-muted">
            Identity as captured on their last request, <When at={data.identity.at} />.
          </p>
        ) : (
          <p className="text-xs text-ink-muted">
            This player has never used the desk, so there is no name or Discord ID on file.
          </p>
        )}
      </Panel>

      <Panel className="flex flex-col gap-3">
        <h3 className="text-sm font-medium">Requests</h3>
        {data.requests.length === 0 ? (
          <p className="text-sm text-ink-soft">Nothing yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {data.requests.map((row) => (
              <li
                key={row.id}
                className="flex items-center gap-3 rounded-control border border-edge bg-tone-2 px-3 py-2"
              >
                <span className="shrink-0 text-sm">{KINDS[row.kind].label}</span>
                <StatusPill status={row.status} />
                <When at={row.createdAt} className="ml-auto shrink-0" />
                <ChipAmount kind={row.kind} amount={row.amount} />
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel className="flex flex-col gap-3">
        <h3 className="text-sm font-medium">Recent activity</h3>
        {data.events.length === 0 ? (
          <p className="text-sm text-ink-soft">Nothing recorded.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {data.events.map((event) => (
              <li key={event.id} className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate text-sm">
                  {describeAction(event.action).label}
                  {/* Who did it, when it was not the player themself — a role
                      change is the obvious case, and knowing which banker made
                      it is the whole point of recording it. */}
                  {event.actorVrpId !== null && event.actorVrpId !== data.vrpId ? (
                    <span className="text-ink-muted"> · by {event.actorName ?? event.actorVrpId}</span>
                  ) : null}
                </span>
                <Stamp at={event.at} />
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
