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

import { useCallback, useEffect, useRef, useState } from "react";
import { CaretDownIcon } from "@phosphor-icons/react/dist/csr/CaretDown";
import { CheckIcon } from "@phosphor-icons/react/dist/csr/Check";
import { MagnifyingGlassIcon } from "@phosphor-icons/react/dist/csr/MagnifyingGlass";
import { MinusCircleIcon } from "@phosphor-icons/react/dist/csr/MinusCircle";
import { PencilSimpleIcon } from "@phosphor-icons/react/dist/csr/PencilSimple";
import { PlusCircleIcon } from "@phosphor-icons/react/dist/csr/PlusCircle";
import { ShieldStarIcon } from "@phosphor-icons/react/dist/csr/ShieldStar";
import { CloseButton, Overlay } from "@tt/window";

import { Panel, TONES } from "@/components/stage";
import { lookupPlayer, setRole } from "@/lib/banker";
import type { Caller, Role } from "@/lib/desk";
import {
  describeAction,
  KINDS,
  ROLE_LABELS,
  ROLES,
  SHAPE_TONES,
  type ActionShape,
  type AuditRow,
} from "@/lib/desk";
import { formatChipCount } from "@/lib/format";
import { useDeskAction, useDeskCall, useStaff } from "@/lib/staff";
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
            <p className="flex items-center gap-1.5 text-xs text-ink-muted">
              <RoleControl vrpId={data.vrpId} role={data.role} onChanged={reload} />
              <span>· account opened</span>
              <When at={data.createdAt} />
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
          <ul className="flex flex-col gap-0.5">
            {data.events.map((event) => (
              <li key={event.id}>
                <ActivityRow event={event} subjectVrpId={data.vrpId} />
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

/**
 * The role, and — for an administrator — a way to change it.
 *
 * To anyone else this is the plain text it has always been. Hiding the control
 * is presentation: `setRole` re-reads the caller's role server-side on every
 * call (lib/auth.ts), so a banker who finds this in the bundle still gets a
 * closed door.
 *
 * It is here rather than in the admin panel because this is the page where you
 * already have the player in front of you — their balance, their requests, what
 * they have done. Deciding someone should be a banker is a decision made while
 * looking at exactly that.
 */
function RoleControl({
  vrpId,
  role,
  onChanged,
}: {
  vrpId: number;
  role: Role;
  onChanged: () => void;
}) {
  const { admin } = useStaff();
  const { run, busy, failure, clear } = useDeskAction();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  /*
    Dismissal, for a menu that is not a modal.

    `Overlay` is the app's answer for anything that covers the window, and it is
    the wrong shape here — a scrim over the whole tablet to change one field
    would read as a far bigger decision than this is. So this is a plain popover,
    and it takes on the two jobs the overlay would have done: Escape closes it,
    and a press outside closes it.

    `pointerdown` rather than `click`, so the press that lands on something else
    closes this before that thing acts on it.
  */
  useEffect(() => {
    if (!open) return;

    const away = (event: PointerEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // Kept off the boot script's Escape → pin, which would otherwise hand
      // control back to the game as well as closing this. Same reasoning as
      // components/overlay.tsx.
      event.stopPropagation();
      setOpen(false);
    };

    window.addEventListener("pointerdown", away, true);
    window.addEventListener("keydown", escape, true);
    return () => {
      window.removeEventListener("pointerdown", away, true);
      window.removeEventListener("keydown", escape, true);
    };
  }, [open]);

  if (!admin) return <span>{ROLE_LABELS[role]}</span>;

  const choose = (next: Role) => {
    setOpen(false);
    if (next === role) return;
    void run((caller) => setRole(caller, vrpId, next)).then((result) => {
      // The profile is re-read rather than patched in place: the change also
      // writes an audit event, and that panel is on the same screen.
      if (result) onChanged();
    });
  };

  return (
    <span ref={box} className="relative inline-flex">
      <button
        type="button"
        onClick={() => {
          clear();
          setOpen((was) => !was);
        }}
        disabled={busy}
        aria-haspopup="listbox"
        aria-expanded={open}
        title="Change this player's role"
        className={`-my-0.5 flex items-center gap-1 rounded-chip border px-1.5 py-0.5 transition-colors duration-120 ease-out ${
          busy
            ? "cursor-default border-edge text-ink-muted/60"
            : "cursor-pointer border-edge text-ink-soft hover:border-edge-strong hover:bg-tone-2 hover:text-ink"
        }`}
      >
        {ROLE_LABELS[role]}
        <CaretDownIcon
          size={10}
          weight="bold"
          className={`transition-transform duration-120 ease-out ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>

      {open ? (
        <ul
          role="listbox"
          aria-label="Role"
          /*
            Squared off and opaque, on the drawer tone — it floats over the
            translucent stage, and a see-through menu over a see-through window
            is the game showing through two layers of text (DESIGN.md).
          */
          className="absolute left-0 top-full z-20 mt-1 flex min-w-40 animate-sheet flex-col gap-0.5 rounded-panel border border-edge-strong bg-drawer p-1"
        >
          {ROLES.map((option) => {
            const current = option === role;
            return (
              <li key={option}>
                <button
                  type="button"
                  role="option"
                  aria-selected={current}
                  onClick={() => choose(option)}
                  className={`flex w-full cursor-pointer items-center gap-2 rounded-control px-2 py-1.5 text-left text-xs transition-colors duration-120 ease-out ${
                    current ? "bg-tone-3 text-ink" : "text-ink-soft hover:bg-tone-2 hover:text-ink"
                  }`}
                >
                  {/* A fixed-width slot, so the labels line up whether or not
                      one of them is carrying the tick. */}
                  <span className="flex w-3 shrink-0 justify-center">
                    {current ? <CheckIcon size={11} weight="bold" aria-hidden /> : null}
                  </span>
                  {ROLE_LABELS[option]}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      {/* Refusals land beside the control that caused them rather than at the
          top of the page — "you cannot change your own role" is about this
          button. */}
      {failure ? <span className="ml-1.5 text-loss">{failure.message}</span> : null}
    </span>
  );
}

/** The glyph for each shape of action. */
const SHAPE_ICONS: Record<ActionShape, typeof PlusCircleIcon> = {
  create: PlusCircleIcon,
  modify: PencilSimpleIcon,
  destroy: MinusCircleIcon,
};

/** Just the text colour of each shape, for a glyph that carries no fill of its own. */
const SHAPE_TEXT: Record<ActionShape, string> = {
  create: "text-felt-hi",
  modify: "text-settled",
  destroy: "text-loss",
};

/**
 * One line of the trail, and everything behind it.
 *
 * The list is scanned far more often than it is read, so the shape of an event
 * — something made, something changed, something taken away — is carried by a
 * coloured glyph before the words are reached. Colour is never the only signal:
 * the label says the same thing in text, because a log is exactly the sort of
 * screen somebody reads in a hurry and exactly the wrong place to make them
 * tell two similar greens apart.
 *
 * Pressing a row opens what is underneath it. The list deliberately shows very
 * little, and everything the row actually recorded — the amount, the balance it
 * left behind, who did it, the note they left — is one press away rather than
 * crammed into a line that would then be unscannable.
 */
function ActivityRow({ event, subjectVrpId }: { event: AuditRow; subjectVrpId: number }) {
  const [open, setOpen] = useState(false);
  const { label, shape, admin } = describeAction(event.action);
  const Glyph = SHAPE_ICONS[shape];

  // Somebody other than the player themself acted on them. A role change is the
  // obvious case, and which administrator made it is the point of recording it.
  const byOther = event.actorVrpId !== null && event.actorVrpId !== subjectVrpId;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="See what was recorded"
        className="flex w-full cursor-pointer items-center gap-2.5 rounded-control px-2 py-1.5 text-left transition-colors duration-120 ease-out hover:bg-tone-2"
      >
        <Glyph size={15} weight="fill" className={`shrink-0 ${SHAPE_TEXT[shape]}`} aria-hidden />

        <span className="min-w-0 flex-1 truncate text-sm">
          {label}
          {byOther ? (
            <span className="text-ink-muted"> · by {event.actorName ?? event.actorVrpId}</span>
          ) : null}
        </span>

        {/* Administrator actions reached past the desk, so they are marked
            rather than left looking like the ordinary business around them. */}
        {admin ? (
          <span
            title="An administrator action"
            className="flex shrink-0 items-center gap-1 rounded-chip border border-loss/50 bg-loss/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-loss"
          >
            <ShieldStarIcon size={9} weight="fill" aria-hidden />
            Admin
          </span>
        ) : null}

        <Stamp at={event.at} />
      </button>

      {open ? (
        <Overlay onClose={() => setOpen(false)} label={label}>
          <EventDetail event={event} label={label} shape={shape} admin={admin} />
        </Overlay>
      ) : null}
    </>
  );
}

/** Everything the row recorded, in the order it reads as a sentence. */
function EventDetail({
  event,
  label,
  shape,
  admin,
}: {
  event: AuditRow;
  label: string;
  shape: ActionShape;
  admin: boolean;
}) {
  const Glyph = SHAPE_ICONS[shape];

  return (
    <>
      <header className="flex shrink-0 items-center gap-2.5 border-b border-edge px-4 py-3">
        <Glyph size={18} weight="fill" className={SHAPE_TEXT[shape]} aria-hidden />
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold tracking-tight">{label}</h2>
        {admin ? (
          <span
            className={`rounded-chip border px-2 py-1 text-xs uppercase tracking-wide ${TONES[SHAPE_TONES.destroy]}`}
          >
            Admin
          </span>
        ) : null}
        <CloseButton />
      </header>

      <dl className="flex min-h-0 flex-col gap-2 overflow-y-auto p-4 text-sm">
        <Field label="When" value={new Date(event.at).toLocaleString("en-GB")} />
        <Field label="Action" value={event.action} mono />
        <Field
          label="By"
          value={
            event.actorVrpId === null
              ? "the app itself"
              : `${event.actorName ?? "unnamed"} (${event.actorVrpId})${
                  event.actorRole ? ` · ${ROLE_LABELS[event.actorRole]}` : ""
                }`
          }
        />
        <Field
          label="To"
          value={
            event.subjectVrpId === null
              ? null
              : `${event.subjectName ?? "unnamed"} (${event.subjectVrpId})`
          }
        />
        <Field
          label="Amount"
          value={event.amount === null ? null : `${formatChipCount(event.amount)} chips`}
          mono
        />
        <Field
          label="Balance after"
          value={
            event.balanceAfter === null ? null : `${formatChipCount(event.balanceAfter)} chips`
          }
          mono
        />
        <Field label="Request" value={event.requestId === null ? null : `#${event.requestId}`} mono />
        <Field label="Note" value={event.note} />
        {/* Whatever the action chose to write down — a role change's from and
            to, a flush's key count. Shown raw: it differs per action, and a
            shape this panel had to be taught is one it would get wrong the
            first time somebody added another. */}
        <Field label="Detail" value={event.detail} mono />
      </dl>
    </>
  );
}

/** A labelled line, or nothing at all when there is nothing to say. */
function Field({ label, value, mono }: { label: string; value: string | null; mono?: boolean }) {
  if (!value) return null;

  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-edge/50 pb-2 last:border-0">
      <dt className="shrink-0 text-xs text-ink-muted">{label}</dt>
      <dd className={`min-w-0 break-words text-right ${mono ? "font-mono text-xs tabular-nums" : ""}`}>
        {value}
      </dd>
    </div>
  );
}
