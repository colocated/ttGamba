"use client";

/**
 * Everything the game client has told us, as it told us.
 *
 * The rest of the app reads eight fields out of this and gives them names
 * (`Player` in lib/gamedata.ts). This is the other end of the same stream: the
 * raw pairs, so that "why is the faction blank" can be answered by looking
 * rather than by guessing which key it was supposed to arrive under.
 *
 * What each key means comes from lib/gamekeys.ts, which is a transcription of
 * the docs' own table. A key with no entry there is shown as such rather than
 * hidden — the docs describe their list as incomplete, and a key nobody wrote
 * down is one of the more interesting things this tab can find.
 *
 * ── Why there is a refresh button on a live view ──────────────────────────
 * The client pushes changes on its own, so this table is already live — a key
 * that moves in game moves here without anything being asked for. What it does
 * *not* do is fill itself in: the client sends only what changed, so a key that
 * has not moved since the app opened is a key this page has never seen. That is
 * what `getData` is for, and why the auto-refresh below is useful on a panel
 * that updates by itself. It re-sends the whole cache rather than a patch.
 *
 * The refresh does not light every row up, because a value that comes back
 * identical is not a change — see `changedAt` in lib/gamedata.ts.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useState } from "react";
import { ArrowClockwiseIcon } from "@phosphor-icons/react/dist/csr/ArrowClockwise";
import { MagnifyingGlassIcon } from "@phosphor-icons/react/dist/csr/MagnifyingGlass";

import { Panel, Tag } from "@/components/stage";
import { Empty } from "@/components/banker/ui";
import { Drawer } from "@/components/settings/fields";
import { formatExactly } from "@/lib/format";
import { useGameData, usePlayer, type Connection } from "@tt/userapp/gamedata";
import { DOCUMENTED_KEYS, describeKey } from "@tt/userapp/gamekeys";
import { getData } from "@tt/userapp";

/** How often the whole cache can be re-asked for. `null` is "only when I press it". */
const INTERVALS: readonly { label: string; ms: number | null }[] = [
  { label: "Off", ms: null },
  { label: "1s", ms: 1_000 },
  { label: "5s", ms: 5_000 },
  { label: "15s", ms: 15_000 },
];

/**
 * Five seconds by default. A `getData` is a local `postMessage` and costs
 * nothing measurable, and a diagnostic panel that needs to be told to look is a
 * panel that shows you the state of things five minutes ago.
 */
const DEFAULT_INTERVAL = 5_000;

/** How long a changed row stays marked. */
const FRESH = 6_000;

/** How often the "changed 4s ago" column is re-read against the clock. */
const TICK = 1_000;

type Order = "key" | "recent";

/**
 * The connection, as a label. `waiting` and `absent` are the store's words for
 * two states a person would describe the same way, and this tab is the one
 * place in the app where telling them apart is the point.
 */
const CONNECTION: Record<Connection, string> = {
  connected: "Live",
  waiting: "Waiting for the client",
  absent: "No client",
};

export function GameDataTable() {
  const { data, changedAt, at } = useGameData();
  const { connection } = usePlayer();
  const [filter, setFilter] = useState("");
  const [order, setOrder] = useState<Order>("key");
  const [every, setEvery] = useState<number | null>(DEFAULT_INTERVAL);
  /** Keys whose full value is on show. Long ones are clamped until asked for. */
  const [opened, setOpened] = useState<ReadonlySet<string>>(() => new Set());
  /** The list of documented keys that have not turned up. Shut by default — it is long. */
  const [unseenOpen, setUnseenOpen] = useState(false);
  const now = useNow();

  useEffect(() => {
    if (every === null) return;
    const timer = setInterval(() => getData(), every);
    return () => clearInterval(timer);
  }, [every]);

  const needle = filter.trim().toLowerCase();
  const matches = (key: string) =>
    needle === "" ||
    key.toLowerCase().includes(needle) ||
    (describeKey(key)?.blurb.toLowerCase().includes(needle) ?? false);

  const keys = Object.keys(data)
    .filter((key) => matches(key) || String(data[key]).toLowerCase().includes(needle))
    .sort((a, b) =>
      order === "recent"
        ? (changedAt[b] ?? 0) - (changedAt[a] ?? 0) || a.localeCompare(b)
        : a.localeCompare(b),
    );

  const total = Object.keys(data).length;
  /*
    Documented, but never sent this session. Mostly this is not a fault — half
    the table only arrives when the situation calls for it — but "the key I was
    waiting for has never once turned up" is the question this panel gets opened
    to answer, and scrolling a list of what *is* there cannot answer it.
  */
  const unseen = DOCUMENTED_KEYS.filter((key) => !(key in data) && matches(key));

  const toggle = (key: string) => {
    setOpened((current) => {
      const next = new Set(current);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <Panel className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-medium">Client cache</h2>
            <Tag tone={connection === "connected" ? "good" : "muted"}>
              {CONNECTION[connection]}
            </Tag>
          </div>

          <span className="text-xs text-ink-muted">
            {/*
              The last message, not the last change. On a quiet screen those are
              minutes apart, and only one of them answers "is the client still
              there".
            */}
            {at === null ? (
              "Nothing received yet"
            ) : (
              <>
                Last message <Since at={at} now={now} />
              </>
            )}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-control border border-edge bg-tone-2 px-3 focus-within:border-edge-strong">
            <MagnifyingGlassIcon size={16} className="shrink-0 text-ink-muted" aria-hidden />
            <input
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder="Filter keys, values and descriptions"
              aria-label="Filter keys, values and descriptions"
              className="min-w-0 flex-1 bg-transparent py-2 text-sm text-ink outline-none placeholder:text-ink-muted"
            />
          </div>

          <button
            type="button"
            onClick={() => getData()}
            title="Ask the client to re-send its whole cache"
            className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-control border border-edge bg-tone-2 px-2.5 py-2 text-xs text-ink-soft transition-colors duration-120 ease-out hover:bg-raised-hover hover:text-ink"
          >
            <ArrowClockwiseIcon size={14} aria-hidden />
            Refresh
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase tracking-wide text-ink-muted">Sort</span>
            <Choice active={order === "key"} onClick={() => setOrder("key")}>
              Name
            </Choice>
            <Choice active={order === "recent"} onClick={() => setOrder("recent")}>
              Recent
            </Choice>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs uppercase tracking-wide text-ink-muted">Auto refresh</span>
            {INTERVALS.map((option) => (
              <Choice
                key={option.label}
                active={every === option.ms}
                onClick={() => setEvery(option.ms)}
              >
                {option.label}
              </Choice>
            ))}
          </div>
        </div>
      </Panel>

      {total === 0 ? (
        <Empty>
          The client has not sent anything yet. In game this fills itself in within a frame or
          two — press Refresh if it does not.
        </Empty>
      ) : keys.length === 0 ? (
        <Empty>
          Nothing matches <span className="font-mono">{filter.trim()}</span>. {total} keys are
          cached.
        </Empty>
      ) : (
        // Not `Panel`: rows are edge to edge, and the padding a panel brings
        // would have to be undone by a class that only wins by stylesheet
        // order. Same surface, spelled out.
        <div className="flex flex-col rounded-panel border border-edge bg-raised">
          <div className="flex items-baseline justify-between gap-3 border-b border-edge px-4 py-3">
            <h2 className="text-sm font-medium">
              {keys.length === total ? `${total} keys` : `${keys.length} of ${total} keys`}
            </h2>
            <span className="text-xs text-ink-muted">
              Press a row for the whole value and what the docs say it is
            </span>
          </div>

          <ul className="flex flex-col">
            {keys.map((key) => (
              <Row
                key={key}
                name={key}
                value={data[key]}
                changedAt={changedAt[key]}
                now={now}
                open={opened.has(key)}
                onToggle={() => toggle(key)}
              />
            ))}
          </ul>
        </div>
      )}

      {unseen.length > 0 ? (
        <Drawer
          title="Documented, not seen this session"
          aside={<span className="text-xs text-ink-muted">{unseen.length}</span>}
          open={unseenOpen}
          onToggle={() => setUnseenOpen((current) => !current)}
        >
          <p className="pb-3 text-sm text-ink-soft">
            Keys the docs name that this client has never sent. Most of these are not a fault —
            half the table only arrives when the situation calls for it, and there is no vehicle
            key while nobody is in a vehicle. It is the one worth searching for that matters.
          </p>

          <ul className="flex flex-col gap-2">
            {unseen.map((key) => {
              const doc = describeKey(key);

              return (
                <li key={key} className="flex items-baseline gap-3">
                  <span className="w-44 shrink-0 truncate font-mono text-xs text-ink-muted" title={key}>
                    {key}
                  </span>
                  <span className="min-w-0 flex-1 text-xs text-ink-muted">{doc?.blurb}</span>
                </li>
              );
            })}
          </ul>
        </Drawer>
      ) : null}
    </div>
  );
}

/**
 * One key.
 *
 * A button rather than a row with a button in it: the whole line is the target,
 * because at this density anything smaller is a thing to aim at.
 */
function Row({
  name,
  value,
  changedAt,
  now,
  open,
  onToggle,
}: {
  name: string;
  value: string | number | boolean;
  /** When it last moved, or `undefined` for a key seen exactly once. */
  changedAt?: number;
  now: number;
  open: boolean;
  onToggle: () => void;
}) {
  const text = String(value);
  const fresh = changedAt !== undefined && now - changedAt < FRESH;
  const doc = describeKey(name);

  return (
    <li className="border-b border-edge/50 last:border-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full cursor-pointer flex-col gap-1 px-4 py-2 text-left transition-colors duration-120 ease-out hover:bg-tone-2"
      >
        <span className="flex w-full items-start gap-3">
          <span
            className={`w-44 shrink-0 truncate font-mono text-xs ${
              fresh ? "text-felt-hi" : "text-ink-soft"
            }`}
            title={name}
          >
            {name}
          </span>

          <span
            className={`min-w-0 flex-1 whitespace-pre-wrap break-all font-mono text-xs ${
              // Empty strings are how the client says "none" — a faction nobody
              // is in, a Discord that was never linked. Drawn as absence rather
              // than as a blank cell, which reads as a bug.
              text === "" ? "text-ink-muted" : "text-ink"
            } ${open ? "" : "line-clamp-2"}`}
          >
            {text === "" ? "(empty)" : text}
          </span>

          <span className="w-20 shrink-0 text-right text-xs text-ink-muted">
            {changedAt === undefined ? "—" : <Since at={changedAt} now={now} fresh={fresh} />}
          </span>
        </span>

        {/*
          The docs' own description, behind the same press that unclamps the
          value. On the row it would double the height of every line for prose
          nobody is reading twice; one press away it is there when a key turns
          out to be a mystery, which is most of what this tab is for.
        */}
        {open ? (
          <span className="pl-3 text-xs text-ink-muted">
            {doc ? (
              <>
                <span className="font-mono text-ink-soft">{doc.type}</span> — {doc.blurb}
              </>
            ) : (
              "Not in the docs' table. The docs call that list incomplete, so this is the client volunteering something nobody wrote down."
            )}
          </span>
        ) : null}
      </button>
    </li>
  );
}

/**
 * How long ago, to the second.
 *
 * `formatAgo` in lib/format.ts stops at "just now" for anything under a minute,
 * which is the right answer for a queue of requests and the wrong one here —
 * the whole question this column answers is which of these moved in the last few
 * seconds.
 */
function Since({ at, now, fresh }: { at: number; now: number; fresh?: boolean }) {
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  const reading =
    seconds < 1
      ? "now"
      : seconds < 60
        ? `${seconds}s ago`
        : seconds < 3600
          ? `${Math.floor(seconds / 60)}m ago`
          : `${Math.floor(seconds / 3600)}h ago`;

  return (
    <time
      dateTime={new Date(at).toISOString()}
      title={formatExactly(at)}
      className={fresh ? "text-felt-hi" : undefined}
    >
      {reading}
    </time>
  );
}

/** A small exclusive choice — sort order, refresh interval. Same part as the desk's. */
function Choice({
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
      className={`cursor-pointer rounded-control border px-2 py-1 text-xs transition-colors duration-120 ease-out ${
        active
          ? "border-edge-strong bg-tone-3 text-ink"
          : "border-edge bg-tone-2 text-ink-soft hover:bg-raised-hover hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

/**
 * The clock, re-read once a second.
 *
 * Every relative reading on this page is computed against it, so one interval
 * keeps the whole table honest rather than each row holding a timer. It only
 * runs while this tab is mounted, which is the only place anything is counting
 * seconds.
 */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), TICK);
    return () => clearInterval(timer);
  }, []);

  return now;
}
