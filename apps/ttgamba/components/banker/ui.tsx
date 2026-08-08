"use client";

/**
 * The desk's small parts.
 *
 * Everything here is shared by two or more tabs, and everything here obeys the
 * same house rules as the rest of the app: squared-off corners, no shadows, no
 * gradients, colour transitions at 120ms and nothing else moving unless it is
 * doing a job (DESIGN.md).
 */

import { PokerChipIcon } from "@phosphor-icons/react/dist/csr/PokerChip";
import { WarningIcon } from "@phosphor-icons/react/dist/csr/Warning";

import { Tooltip } from "@tt/window";
import { TONES } from "@/components/stage";
import type { Failure, RequestKind, RequestStatus } from "@/lib/desk";
import { KINDS, STATUSES } from "@/lib/desk";
import { formatAgo, formatChipCount, formatExactly, formatWhen } from "@/lib/format";

/** Where a request has got to. */
export function StatusPill({ status }: { status: RequestStatus }) {
  const { label, tone } = STATUSES[status];
  return (
    <span
      className={`shrink-0 rounded-chip border px-2 py-0.5 text-xs font-medium uppercase tracking-wide ${TONES[tone]}`}
    >
      {label}
    </span>
  );
}

/**
 * What a request would do to a balance.
 *
 * The sign is the whole point of the component: a queue of deposits and a
 * queue of withdrawals look identical otherwise, and a banker glancing at a
 * figure needs to know which way it is going before they read the number.
 * Colour carries it too, but never alone.
 */
export function ChipAmount({
  kind,
  amount,
  size = "base",
}: {
  kind: RequestKind;
  amount: number;
  size?: "base" | "large";
}) {
  const incoming = kind === "deposit";

  return (
    <span
      className={`flex shrink-0 items-center gap-1.5 font-mono tabular-nums ${
        size === "large" ? "text-2xl" : "text-sm"
      } ${incoming ? "text-felt-hi" : "text-chip"}`}
    >
      <PokerChipIcon size={size === "large" ? 20 : 14} weight="fill" aria-hidden />
      <span>
        {KINDS[kind].sign}
        {formatChipCount(amount)}
      </span>
      <span className="sr-only">chips, {KINDS[kind].noun}</span>
    </span>
  );
}

/** A bare chip figure with no direction to it — a balance, a total. */
export function ChipFigure({ amount, className = "" }: { amount: number; className?: string }) {
  return (
    <span className={`flex items-center gap-1.5 font-mono tabular-nums text-chip ${className}`}>
      <PokerChipIcon size={14} weight="fill" aria-hidden />
      {formatChipCount(amount)}
      <span className="sr-only">chips</span>
    </span>
  );
}

/**
 * When something happened, in both readings. The relative one is what a queue
 * is scanned by; the absolute one is a `Tooltip` away because "3d ago" is no
 * use in a dispute.
 */
export function When({ at, className = "" }: { at: number; className?: string }) {
  return (
    <Tooltip label={formatExactly(at)}>
      <time
        dateTime={new Date(at).toISOString()}
        className={`text-xs text-ink-muted ${className}`}
      >
        {formatAgo(at)}
      </time>
    </Tooltip>
  );
}

/** The absolute reading, for the log, where rows are read rather than scanned. */
export function Stamp({ at }: { at: number }) {
  return (
    <Tooltip label={formatExactly(at)}>
      <time
        dateTime={new Date(at).toISOString()}
        className="shrink-0 font-mono text-xs tabular-nums text-ink-muted"
      >
        {formatWhen(at)}
      </time>
    </Tooltip>
  );
}

/**
 * Something went wrong, said plainly.
 *
 * Every message on a `Failure` is written to be read by whoever pressed the
 * thing, so this renders it as-is rather than translating a reason code into
 * prose a second time (lib/desk.ts).
 */
export function Problem({ failure, onRetry }: { failure: Failure; onRetry?: () => void }) {
  return (
    <div className="flex items-center gap-3 rounded-panel border border-loss/40 bg-loss/10 px-4 py-3">
      <WarningIcon size={18} weight="fill" className="shrink-0 text-loss" aria-hidden />
      <p className="min-w-0 flex-1 text-sm text-ink-soft">{failure.message}</p>
      {onRetry && failure.reason !== "forbidden" ? (
        <button
          type="button"
          onClick={onRetry}
          className="shrink-0 cursor-pointer rounded-control border border-edge bg-tone-2 px-2.5 py-1 text-xs transition-colors duration-120 ease-out hover:bg-raised-hover"
        >
          Try again
        </button>
      ) : null}
    </div>
  );
}

/**
 * Nothing to show.
 *
 * Toned as information rather than as a problem: an empty deposit queue is the
 * desk being on top of things, and the same panel painted in warning colours
 * would read as a fault every quiet evening.
 */
export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-panel border border-dashed border-edge px-4 py-8 text-center text-sm text-ink-soft">
      {children}
    </div>
  );
}

/**
 * A row that is not there yet.
 *
 * Grey bars rather than a spinner, and only ever *instead of* a first load —
 * a list that already has rows on it keeps them while it refetches, because
 * blanking a queue every few seconds is harder to read than one that is
 * briefly out of date (lib/staff.ts).
 */
export function Skeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-2" aria-hidden>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="h-14 rounded-panel border border-edge bg-tone-2" />
      ))}
    </div>
  );
}

/** One labelled value in a detail panel. */
export function Detail({
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
    <div className="flex items-baseline justify-between gap-4 border-b border-edge/50 pb-2 last:border-0 last:pb-0">
      <dt className="shrink-0 text-xs uppercase tracking-wide text-ink-muted">{label}</dt>
      <dd className={`min-w-0 truncate text-sm ${mono ? "font-mono tabular-nums" : ""}`}>
        {empty ? <span className="text-ink-muted">—</span> : value}
      </dd>
    </div>
  );
}

/** The desk's button. `tone` picks what pressing it means. */
export function Button({
  onClick,
  tone = "quiet",
  disabled,
  title,
  children,
  type = "button",
}: {
  /**
   * The event is passed on so a caller can read a modifier off it — the
   * table's "stand up", where shift means leave the room rather than the
   * chair. Ignored by almost every caller, which is why it stays optional
   * rather than becoming the reason every handler grows a parameter.
   */
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  tone?: "quiet" | "go" | "stop";
  disabled?: boolean;
  /**
   * A hover label, for a button whose visible text cannot say everything — a
   * modifier it also answers to, or why it is disabled right now. Rendered as
   * a `Tooltip`, not the native `title` attribute — see that component for
   * why, and keep this to a phrase, never something the player has to know
   * to use the button at all.
   */
  title?: string;
  children: React.ReactNode;
  type?: "button" | "submit";
}) {
  const tones = {
    quiet: "border-edge bg-tone-2 text-ink-soft hover:bg-raised-hover hover:text-ink",
    go: "border-felt bg-felt/15 text-felt-hi hover:bg-felt/25",
    stop: "border-loss/60 bg-loss/10 text-loss hover:bg-loss/20",
  } as const;

  return (
    <Tooltip label={title}>
      <button
        type={type}
        onClick={onClick}
        disabled={disabled}
        className={`rounded-control border px-3 py-2 text-sm font-medium transition-colors duration-120 ease-out ${
          disabled ? "cursor-not-allowed border-edge bg-tone-2 text-ink-muted/60" : `cursor-pointer ${tones[tone]}`
        }`}
      >
        {children}
      </button>
    </Tooltip>
  );
}

/** How a faction reads, or nothing if they are not in one. */
export function factionLabel(name: string | null, tag: string | null): string | null {
  if (!name) return null;
  return tag ? `${name} [${tag}]` : name;
}
