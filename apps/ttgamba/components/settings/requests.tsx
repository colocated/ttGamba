"use client";

/**
 * The player's side of the desk: asking for chips, and taking it back.
 *
 * The banker's half of this conversation is in components/banker/, and the
 * small parts are shared with it — a status pill means the same thing on both
 * screens, which is the point of there being only one of them.
 *
 * ── Two kinds, and why the copy differs so much ───────────────────────────
 * A deposit costs the player nothing to ask for: chips are credited at the end,
 * when a banker has the cash in hand. A withdrawal takes the chips *now* and
 * holds them, so the balance in the titlebar drops the moment the request is
 * made and stays down until it settles. That is the correct behaviour — see
 * lib/requests.ts for why — but it is also the kind of thing a player reports
 * as a bug unless the screen said it was going to happen and then showed the
 * request sitting there afterwards. Both halves of that live in this file.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useId, useLayoutEffect, useRef, useState } from "react";

import { CloseButton, Overlay, useClose } from "@tt/window";
import { Button, ChipAmount, Empty, Problem, StatusPill, When } from "@/components/banker/ui";
import {
  AMOUNT_LIMIT,
  KINDS,
  QUICK_AMOUNTS,
  STATUSES,
  type RequestKind,
  type RequestRow,
} from "@/lib/desk";
import { formatChipCount, formatMagnitude } from "@/lib/format";
import type { Player } from "@tt/userapp/gamedata";
import { createRequest, cancelRequest } from "@/lib/requests";
import { useDeskAction } from "@/lib/staff";

/**
 * How each kind is explained before it is asked for.
 *
 * Written in the second person and in the order it happens to the player,
 * because the thing they are agreeing to is a sequence of events in the world —
 * meeting a banker — and not a state change in an app.
 */
const HOW: Record<RequestKind, { blurb: string; action: string }> = {
  deposit: {
    blurb:
      "Hand the cash to a banker in game. Your chips are credited when they mark it actioned — nothing arrives before that, and nothing leaves your wallet until you meet them.",
    action: "Request deposit",
  },
  withdrawal: {
    blurb:
      "These chips leave your balance now and are held until a banker pays the cash out in game. Cancel any time before they settle it and you get them straight back.",
    action: "Request withdrawal",
  },
};

/** How many finished requests stay on the settings page behind the live ones. */
const SETTLED_SHOWN = 3;

/**
 * Ask for chips to be moved.
 *
 * Everything it validates, the server validates again and better — `readAmount`
 * in lib/auth.ts is the authority. This is here so a player finds out before
 * they press rather than after, which is the only thing client-side validation
 * is ever for.
 */
export function RequestForm({
  kind,
  chips,
  player,
  onClose,
  onMade,
}: {
  kind: RequestKind;
  /** The balance, or `null` if it has not landed. Bounds a withdrawal. */
  chips: number | null;
  player: Player;
  /** The modal has finished leaving. Unmount it. */
  onClose: () => void;
  /** A request now exists. The page behind this is stale. */
  onMade: () => void;
}) {
  const field = useRef<HTMLInputElement>(null);

  /*
    A shell around the real thing, and the split is not cosmetic: `useClose`
    only works inside the overlay, and the form needs it — a submit that
    succeeds has to leave the same animated way a cancel does, rather than
    being yanked out from under the animation by the page behind it.
  */
  return (
    <Overlay onClose={onClose} label={`${KINDS[kind].label} request`} focus={field}>
      <Asking kind={kind} chips={chips} player={player} field={field} onMade={onMade} />
    </Overlay>
  );
}

/** The form itself, inside the overlay so it can dismiss itself. */
function Asking({
  kind,
  chips,
  player,
  field,
  onMade,
}: {
  kind: RequestKind;
  chips: number | null;
  player: Player;
  field: React.RefObject<HTMLInputElement | null>;
  onMade: () => void;
}) {
  const close = useClose();
  const id = useId();
  const [entry, setEntry] = useState("");
  /** Where the caret should sit once a reformatted entry has been committed. */
  const caret = useRef<number | null>(null);
  const { run, busy, failure } = useDeskAction();

  const amount = read(entry);
  const problem = amount === null ? null : check(kind, amount, chips);
  // The vRP id is the account a request hangs off, and the game client is what
  // supplies it. Without one there is nobody to ask on behalf of, and the
  // server would refuse — so the button stays down rather than doing nothing.
  const ready = amount !== null && problem === null && !busy && player.vrpId !== null;

  /**
   * Retype the entry as the player edits it: separators in, anything that
   * cannot be part of an amount out.
   *
   * The caret has to be put back by hand afterwards. Rewriting the value moves
   * it to the end, so editing the middle of a figure would throw the cursor
   * away on every keystroke. It is measured in characters that *survive*
   * grouping, which is what keeps it in the same place when a comma appears to
   * the left of it.
   */
  const retype = (event: React.ChangeEvent<HTMLInputElement>) => {
    const raw = event.target.value;
    const at = event.target.selectionStart ?? raw.length;
    const kept = clean(raw.slice(0, at)).length;
    const next = group(clean(raw));

    caret.current = after(next, kept);
    setEntry(next);
  };

  useLayoutEffect(() => {
    if (caret.current === null) return;
    field.current?.setSelectionRange(caret.current, caret.current);
    caret.current = null;
  }, [entry, field]);

  /** Fill the field with an exact figure — a preset, or the whole balance. */
  const fill = (value: number) => {
    caret.current = null;
    setEntry(group(String(value)));
    field.current?.focus();
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!ready || amount === null) return;

    const made = await run((caller) =>
      createRequest(caller, {
        kind,
        amount,
        // Who they are *now*, copied onto the request so the banker who picks
        // it up sees the character that asked (lib/requests.ts).
        identity: {
          name: player.name,
          discordId: player.discordId,
          steamId: player.steamId,
          factionName: player.factionName,
          factionTag: player.factionTag,
        },
      }),
    );
    if (!made) return;

    onMade();
    close();
  };

  return (
    <form onSubmit={submit} className="flex min-h-0 flex-col">
      <header className="flex shrink-0 items-start gap-3 border-b border-edge px-5 py-4">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2 className="text-base font-semibold tracking-tight">{KINDS[kind].label} chips</h2>
          <p className="text-xs text-ink-soft">{HOW[kind].blurb}</p>
        </div>

        <CloseButton />
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
        {/*
          An explicit `for`/`id` pair rather than a wrapping `<label>`: the
          quickfills below are buttons, and a label may not contain interactive
          content other than the field it names — nesting them would make every
          preset press also poke the input.
        */}
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-4">
            <label htmlFor={id} className="text-xs uppercase tracking-wide text-ink-muted">
              Amount
            </label>
            {/*
              Only for a withdrawal. A deposit is bounded by in-game cash the
              app cannot see, so a ceiling here would be a guess — and the
              banker refusing it in person is the check that actually applies.
            */}
            {kind === "withdrawal" && chips !== null ? (
              <span className="text-xs text-ink-soft">{formatChipCount(chips)} available</span>
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            <input
              id={id}
              ref={field}
              value={entry}
              onChange={retype}
              // `text`, not `number`: the field takes `10b` and prints commas,
              // and a number input would refuse the first and strip the second.
              // `decimal` over `numeric` for the mode, so a phone keypad still
              // offers the separator key a shorthand like `1.5b` needs.
              type="text"
              inputMode="decimal"
              autoComplete="off"
              placeholder="10b"
              aria-invalid={problem !== null}
              aria-describedby={problem === null ? `${id}-reading` : `${id}-problem`}
              className="min-w-0 flex-1 rounded-control border border-edge bg-tone-1 px-3 py-2 text-right font-mono text-lg tabular-nums text-ink placeholder:text-ink-muted"
            />
            <span className="shrink-0 text-sm text-ink-soft">chips</span>

            {kind === "withdrawal" && chips !== null && chips > 0 ? (
              <Quick onClick={() => fill(chips)} active={amount === chips}>
                All
              </Quick>
            ) : null}
          </div>

          {/*
            The figure in words. `1,000,000,000` and `10,000,000,000` are the
            same shape at a glance and one of them is ten times the other —
            this is the line that catches it, and the reason the shorthand is
            safe to offer at all. Polite rather than assertive: it is a
            confirmation of what was typed, not news.
          */}
          <p
            id={`${id}-reading`}
            aria-live="polite"
            className={`text-xs ${amount === null ? "text-ink-muted" : "text-ink-soft"}`}
          >
            {amount === null
              ? "Type a figure, or use the shorthand — 10b is ten billion."
              : `${formatMagnitude(amount)} chips`}
          </p>

          {/*
            The round figures, because the alternative is typing thirteen
            digits into a field where one extra zero is a tenfold mistake.
            A preset larger than the balance is shown rather than hidden — a
            row that changes length as the balance moves is harder to aim at
            than one where the same button is always in the same place.
          */}
          <div className="flex flex-wrap gap-1.5">
            {QUICK_AMOUNTS.map((quick) => {
              const beyond = kind === "withdrawal" && chips !== null && quick.amount > chips;

              return (
                <Quick
                  key={quick.label}
                  onClick={() => fill(quick.amount)}
                  // Matched on the figure rather than the text, so a preset
                  // lights up whether it was pressed, typed out in full, or
                  // typed as shorthand.
                  active={amount === quick.amount}
                  disabled={beyond}
                  title={beyond ? "More than you have" : `${formatChipCount(quick.amount)} chips`}
                >
                  {quick.label}
                </Quick>
              );
            })}
          </div>

          {problem ? (
            <p id={`${id}-problem`} className="text-xs text-loss">
              {problem}
            </p>
          ) : null}
        </div>

        {failure ? <Problem failure={failure} /> : null}
      </div>

      <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-edge bg-tone-2 px-5 py-4">
        <Button onClick={close} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" tone="go" disabled={!ready}>
          {busy ? "Asking…" : HOW[kind].action}
        </Button>
      </footer>
    </form>
  );
}

/**
 * A one-press amount.
 *
 * `aria-pressed` rather than a purely visual highlight, because what it is
 * saying is "this is the figure in the field" — a state, not a press that
 * happened. Squared off and quiet: these sit under the field they fill and
 * must not out-shout the submit button (DESIGN.md).
 */
function Quick({
  onClick,
  active,
  disabled,
  title,
  children,
}: {
  onClick: () => void;
  active: boolean;
  disabled?: boolean;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-pressed={active}
      className={`shrink-0 rounded-control border px-2.5 py-1.5 font-mono text-xs tabular-nums transition-colors duration-120 ease-out ${
        disabled
          ? "cursor-not-allowed border-edge bg-tone-2 text-ink-muted/50"
          : active
            ? "cursor-pointer border-edge-strong bg-tone-3 text-ink"
            : "cursor-pointer border-edge bg-tone-2 text-ink-soft hover:bg-raised-hover hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

/**
 * What the player has asked for, and what became of it.
 *
 * Everything still live, then the last few that finished. The finished ones are
 * not clutter: a denial is how a player learns their chips came back, and a
 * banker's note is only readable here.
 */
export function RequestList({
  rows,
  onChanged,
}: {
  rows: RequestRow[];
  /** A request has moved, so the query behind this list is stale. */
  onChanged: () => void;
}) {
  const { run, busy, failure } = useDeskAction();
  /** Which row is mid-cancel, so only its own button says so. */
  const [leaving, setLeaving] = useState<number | null>(null);

  const cancel = async (id: number) => {
    setLeaving(id);
    const cancelled = await run((caller) => cancelRequest(caller, id));
    setLeaving(null);
    if (cancelled) onChanged();
  };

  const open = rows.filter((row) => STATUSES[row.status].open);
  const settled = rows.filter((row) => !STATUSES[row.status].open).slice(0, SETTLED_SHOWN);
  const shown = [...open, ...settled];

  if (shown.length === 0) {
    return <Empty>Nothing asked for yet. Deposit or withdraw above to start one.</Empty>;
  }

  return (
    <div className="flex flex-col gap-2">
      {failure ? <Problem failure={failure} /> : null}

      <ul className="flex flex-col gap-2">
        {shown.map((row) => (
          <li
            key={row.id}
            className="flex flex-col gap-2 rounded-panel border border-edge bg-tone-2 px-4 py-3"
          >
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{KINDS[row.kind].label}</span>
              <StatusPill status={row.status} />
              <span className="ml-auto">
                <ChipAmount kind={row.kind} amount={row.amount} />
              </span>
            </div>

            <div className="flex items-center gap-3">
              <When at={row.createdAt} />
              {/*
                Said on the row rather than in the status pill, because "Pending"
                does not explain a balance that is already lower than it was.
              */}
              {row.kind === "withdrawal" && STATUSES[row.status].open ? (
                <span className="text-xs text-ink-muted">Chips held until settled</span>
              ) : null}

              {STATUSES[row.status].open ? (
                <button
                  type="button"
                  onClick={() => cancel(row.id)}
                  disabled={busy}
                  className="ml-auto shrink-0 cursor-pointer rounded-control border border-edge bg-tone-1 px-2.5 py-1 text-xs text-ink-soft transition-colors duration-120 ease-out hover:bg-raised-hover hover:text-ink disabled:cursor-default disabled:text-ink-muted"
                >
                  {leaving === row.id ? "Cancelling…" : "Cancel"}
                </button>
              ) : null}
            </div>

            {row.note ? (
              <p className="whitespace-pre-wrap border-t border-edge/50 pt-2 text-xs text-ink-soft">
                {row.handledByName ? `${row.handledByName}: ` : ""}
                {row.note}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Reading what was typed ─────────────────────────────────────────────────

/*
  A chip figure is up to thirteen digits, and nobody types thirteen digits
  accurately. Three things make the field usable at that size, and they have to
  work together rather than fight:

  - **Shorthand.** `10b` is ten billion. `k`, `m`, `b` and `t` are the
    magnitudes players already say out loud, and `1.5b` is allowed because
    saying it is natural and the arithmetic below stays exact anyway.
  - **Separators as you type.** Commas go in on every keystroke, not on blur,
    because the moment a wrong figure is worth catching is while it is being
    entered.
  - **The words underneath.** Rendered from the *parsed* figure, so it reads
    back what the app understood rather than what was typed.

  `clean` and `group` are what the field shows; `read` is what the app acts on.
  Between them they never disagree, because `read` starts by undoing `group`.
*/

/** How many zeros each magnitude is worth. */
const MAGNITUDES: Record<string, number> = { k: 3, m: 6, b: 9, t: 12 };

/**
 * Strip an entry back to what can be part of an amount: digits, at most one
 * decimal point, and at most one magnitude letter at the end.
 *
 * Anything else is dropped rather than rejected. A field that refuses a
 * keystroke and a field that ignores it look identical to the person typing;
 * this is the version that cannot get stuck.
 */
function clean(text: string): string {
  let body = "";
  let point = false;
  let magnitude = "";

  for (const char of text.toLowerCase()) {
    // A magnitude ends the figure, so nothing may follow it.
    if (magnitude !== "") continue;

    if (char >= "0" && char <= "9") body += char;
    else if (char === "." && !point) {
      point = true;
      // A leading point is completed rather than dropped. Losing it turns
      // `.5b` into `5b` — five billion where five hundred million was meant,
      // silently, which is the exact mistake this field is arranged to catch.
      body += body === "" ? "0." : ".";
    } else if (char in MAGNITUDES && body !== "") magnitude = char;
  }

  return body + magnitude;
}

/** The same entry with thousands separators through its whole-number part. */
function group(text: string): string {
  const magnitude = text.slice(-1) in MAGNITUDES ? text.slice(-1) : "";
  const body = magnitude === "" ? text : text.slice(0, -1);
  const [whole, fraction] = body.split(".");

  const separated = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const rest = fraction === undefined ? "" : `.${fraction}`;

  return separated + rest + magnitude;
}

/**
 * The figure an entry means, or `null` for one that is not a figure yet.
 *
 * The magnitude is applied by *appending zeros to the digits*, not by
 * multiplying. `1.1 * 1e9` in floating point is 1100000000.0000002, which
 * would fail a whole-number check on a figure that is plainly whole; building
 * the digit string and converting once is exact for everything inside
 * `AMOUNT_LIMIT`.
 *
 * A shorthand finer than its magnitude — `1.5` with no suffix, `1.2345k` —
 * comes back fractional on purpose, and `check` is what says so.
 */
function read(text: string): number | null {
  const entry = text.replace(/,/g, "");
  if (entry === "") return null;

  const last = entry.slice(-1);
  const magnitude = last in MAGNITUDES ? last : "";
  const body = magnitude === "" ? entry : entry.slice(0, -1);

  const [whole, fraction = ""] = body.split(".");
  const digits = whole + fraction;
  if (digits === "") return null;

  const zeros = (magnitude === "" ? 0 : MAGNITUDES[magnitude]) - fraction.length;
  // Finer than the magnitude can express — `1.5` chips. Kept as a real number
  // so the reason it is refused can be said out loud.
  if (zeros < 0) return Number(`${whole}.${fraction}`);

  return Number(digits + "0".repeat(zeros));
}

/** Where the caret goes once `kept` grouping-proof characters have gone by. */
function after(text: string, kept: number): number {
  if (kept <= 0) return 0;

  let seen = 0;
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] !== ",") seen += 1;
    if (seen === kept) return i + 1;
  }

  return text.length;
}

/**
 * Why this amount cannot be asked for, or `null`.
 *
 * The balance check is skipped while the balance is unknown rather than
 * guessed at — the server holds the chips with a conditional update and will
 * refuse it properly if there are not enough (lib/requests.ts).
 */
function check(kind: RequestKind, amount: number, chips: number | null): string | null {
  if (!Number.isInteger(amount)) return "Chips come in whole numbers.";
  if (amount <= 0) return "Enter an amount above zero.";
  if (amount > AMOUNT_LIMIT) {
    return `The most that can be moved at once is ${formatChipCount(AMOUNT_LIMIT)} chips.`;
  }
  if (kind === "withdrawal" && chips !== null && amount > chips) {
    return `You only have ${formatChipCount(chips)} chips.`;
  }
  return null;
}
