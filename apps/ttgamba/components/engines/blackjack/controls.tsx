"use client";

/**
 * The gutter: everything under the felt.
 *
 * ── This is app chrome, not table ─────────────────────────────────────────
 * DESIGN.md's carve-out stops at the box's edge and these are outside it, so
 * the panels, the buttons and the readouts are flat and squared off. The
 * *chips* are the exception and are exempt on their own terms: a chip is a
 * drawing of a physical object, and one drawn as a flat square with an 8px
 * radius would be a token, not money.
 *
 * ── One strip, one question ───────────────────────────────────────────────
 * The left half shows exactly one thing at a time, chosen by the phase: the
 * rack while the betting is open, four buttons while it is your turn, an
 * insurance question when the dealer shows an ace. Everything else is a line of
 * text saying what the table is waiting for.
 *
 * Every control on screen at once with most of them disabled is a row a player
 * has to read before every decision, and a row that is mostly grey teaches them
 * to stop looking at it.
 *
 * The right half never changes: what is being staked, and what is in the bank.
 * Those are the two numbers a player checks between every hand, and a number
 * that moves around the screen is a number that gets missed.
 *
 * ── A fixed height, given to every phase rather than borrowed from one ────
 * The old version sized this strip to whichever phase happened to be tallest —
 * the rack, in practice — and let everything else sit in the leftover space.
 * That meant the *rack's* proportions were an accident of what the buttons
 * needed, and grew this a pixel at a time whenever either changed.
 *
 * Now the height is decided first and every phase is stretched to fill it
 * (`h-full` the whole way down). A phase gets exactly this much room to work
 * with, not whatever the busiest one left over — which is also what let the
 * four move buttons become something worth pressing rather than four labels
 * squeezed into a single line's height.
 */

import { useState } from "react";
import type { Icon } from "@phosphor-icons/react";
import { ArrowsSplitIcon } from "@phosphor-icons/react/dist/csr/ArrowsSplit";
import { CheckCircleIcon } from "@phosphor-icons/react/dist/csr/CheckCircle";
import { HandCoinsIcon } from "@phosphor-icons/react/dist/csr/HandCoins";
import { HandPalmIcon } from "@phosphor-icons/react/dist/csr/HandPalm";
import { InfoIcon } from "@phosphor-icons/react/dist/csr/Info";
import { PlusCircleIcon } from "@phosphor-icons/react/dist/csr/PlusCircle";
import { PokerChipIcon } from "@phosphor-icons/react/dist/csr/PokerChip";
import { ProhibitIcon } from "@phosphor-icons/react/dist/csr/Prohibit";
import { ShieldCheckIcon } from "@phosphor-icons/react/dist/csr/ShieldCheck";
import { StackPlusIcon } from "@phosphor-icons/react/dist/csr/StackPlus";
import { XCircleIcon } from "@phosphor-icons/react/dist/csr/XCircle";

import { Tooltip } from "@tt/window";
import { Chip } from "@/components/chip";
import type { RoundView, SeatRound } from "@/lib/blackjack/round";
import type { Move } from "@/lib/blackjack/rules";
import { rackFor } from "@/lib/denominations";
import { formatChipCount, formatChips, formatChipsShort } from "@/lib/format";

/** The label under a move, its full explanation, and the icon it presses with. */
const MOVES: Record<Move, { label: string; hint: string; icon: Icon }> = {
  hit: { label: "Hit", hint: "Take another card", icon: PlusCircleIcon },
  stand: { label: "Stand", hint: "Keep what you have", icon: HandPalmIcon },
  double: {
    label: "Double",
    hint: "Double your stake and take exactly one card",
    icon: StackPlusIcon,
  },
  split: {
    label: "Split",
    hint: "Play the pair as two hands, for a second stake",
    icon: ArrowsSplitIcon,
  },
};

/**
 * What pressing a control means, as a colour. Shared by every button in the
 * gutter so a player learns it once: green moves the hand forward, red ends
 * it or gives something back, everything else is a plain choice.
 */
const TONE = {
  go: "border-felt/70 bg-felt/15 text-felt-hi hover:border-felt hover:bg-felt/25",
  stop: "border-loss/70 bg-loss/10 text-loss hover:border-loss hover:bg-loss/20",
  quiet: "border-edge bg-tone-2 text-ink-soft hover:border-edge-strong hover:bg-raised-hover hover:text-ink",
} as const;

type Tone = keyof typeof TONE;

export function Controls({
  round,
  seat,
  mine,
  chips,
  limits,
  moves,
  busy,
  backing,
  onStake,
  onBackStake,
  onStopBacking,
  onInsure,
  onMove,
}: {
  round: RoundView;
  /** The player's chair, or null while watching. */
  seat: number | null;
  /** Their entry in this round, if they are in it. */
  mine: SeatRound | null;
  chips: number;
  limits: { min: number; max: number };
  moves: Move[];
  busy: boolean;
  /** A seat whose hand this player has chosen to ride, and what is on it already. */
  backing: { seat: number; staked: number } | null;
  onStake: (amount: number) => void;
  onBackStake: (amount: number) => void;
  onStopBacking: () => void;
  onInsure: (amount: number) => void;
  onMove: (move: Move) => void;
}) {
  const staked = mine?.hands.reduce((sum, hand) => sum + hand.bet, 0) ?? 0;

  return (
    <div className="flex h-32 shrink-0 items-stretch gap-3">
      <div className="flex min-w-0 flex-1 overflow-hidden rounded-panel border border-edge bg-tone-1 px-4 py-3">
        <div className="min-w-0 flex-1">
          <Body
            round={round}
            seat={seat}
            mine={mine}
            staked={staked}
            chips={chips}
            limits={limits}
            moves={moves}
            busy={busy}
            backing={backing}
            onStake={onStake}
            onBackStake={onBackStake}
            onStopBacking={onStopBacking}
            onInsure={onInsure}
            onMove={onMove}
          />
        </div>
      </div>

      <Balance chips={chips} />
    </div>
  );
}

function Body({
  round,
  seat,
  mine,
  staked,
  chips,
  limits,
  moves,
  busy,
  backing,
  onStake,
  onBackStake,
  onStopBacking,
  onInsure,
  onMove,
}: {
  round: RoundView;
  seat: number | null;
  mine: SeatRound | null;
  staked: number;
  chips: number;
  limits: { min: number; max: number };
  moves: Move[];
  busy: boolean;
  backing: { seat: number; staked: number } | null;
  onStake: (amount: number) => void;
  onBackStake: (amount: number) => void;
  onStopBacking: () => void;
  onInsure: (amount: number) => void;
  onMove: (move: Move) => void;
}) {
  /*
    Riding somebody else's hand comes first, because choosing a seat to back is
    something a player does deliberately — they pressed that seat — and the rack
    should answer the question they just asked rather than whichever one the
    phase would otherwise have picked.
  */
  if (backing) {
    return (
      <Rack
        staked={backing.staked}
        chips={chips}
        limits={limits}
        busy={busy}
        heading={`Backing seat ${backing.seat}`}
        note="Rides their first hand. Never doubles or splits with them."
        onCommit={onBackStake}
        onDone={onStopBacking}
      />
    );
  }

  if (moves.length > 0) {
    return (
      /*
        No wrap. The old row wrapped a set of small buttons onto a second line
        under enough of a squeeze, which is fine for a box that grows with its
        contents and fatal for one that no longer does (see the file header) —
        a wrapped second line would have nowhere to go but off the bottom.
        Shrinking four buttons to a narrow window is the same information at a
        smaller size; wrapping them changes the shape of the control entirely.
      */
      <div className="flex h-full items-stretch gap-2">
        {(["hit", "stand", "double", "split"] as Move[])
          .filter((move) => moves.includes(move))
          .map((move) => (
            <MoveButton key={move} move={move} busy={busy} onClick={() => onMove(move)} />
          ))}
      </div>
    );
  }

  if (round.phase === "insurance") {
    if (!mine || mine.hands.length === 0) {
      return <Says>The dealer is offering insurance.</Says>;
    }
    if (mine.insuranceAnswered) {
      return (
        <Says>
          {mine.insurance > 0
            ? `Insured for ${formatChipCount(mine.insurance)}. Waiting for the table.`
            : "No insurance. Waiting for the table."}
        </Says>
      );
    }

    /*
      Half the stake, which is the rule and also the only amount that breaks
      even when the dealer turns over a ten. Declining is a press rather than a
      wait: the table stops asking as soon as everybody has answered, so saying
      no is doing the others a favour.
    */
    const half = Math.floor(mine.hands[0].bet / 2);
    return (
      <div className="flex h-full items-center gap-4">
        <ShieldCheckIcon size={28} weight="duotone" className="shrink-0 text-[#e0c05a]" aria-hidden />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-sm font-medium text-ink">Dealer shows an ace</span>
          <span className="text-xs text-ink-muted">Insurance pays 2 to 1, and closes with the phase.</span>
        </div>
        {/* `self-stretch`: the row centres the text beside it, but a question with
            two ways to answer gets the same full-height buttons as everything
            else that presses — see `TallButton`. */}
        <div className="flex shrink-0 items-stretch gap-2 self-stretch">
          <TallButton
            icon={ShieldCheckIcon}
            label={`Insure ${formatChipsShort(half)}`}
            tone="go"
            disabled={busy || chips < half}
            onClick={() => onInsure(half)}
          />
          <TallButton
            icon={ProhibitIcon}
            label="No thanks"
            tone="quiet"
            disabled={busy}
            onClick={() => onInsure(0)}
          />
        </div>
      </div>
    );
  }

  if (round.phase === "waiting" || round.phase === "betting") {
    if (seat === null) {
      return (
        <Says>
          {round.phase === "waiting"
            ? "Nothing is being played. Take a seat, or press an occupied one to back their hand."
            : "Press an occupied seat to back their hand while the betting is open."}
        </Says>
      );
    }

    return (
      <Rack
        staked={staked}
        chips={chips}
        limits={limits}
        busy={busy}
        heading="Your bet"
        onCommit={onStake}
      />
    );
  }

  if (seat === null) return <Says>Watching this hand.</Says>;

  /*
    A seat with no hand in a round already dealt is somebody who sat down
    mid-shoe. Nothing is broken — they are simply not in this one — and saying
    so plainly beats a disabled rack that looks like it ought to work.
  */
  if (!mine || mine.hands.length === 0) {
    return <Says>You sat down mid-hand. The next round is yours.</Says>;
  }

  if (round.phase === "payout") return <Says>Paying out.</Says>;
  if (round.phase === "dealer") return <Says>The dealer is playing their hand.</Says>;

  return <Says>Waiting for the other players.</Says>;
}

/**
 * The rack: chips to press, a ticker of what they add up to, and the two ways
 * out of it.
 *
 * ── Why the stake is committed rather than dribbled ───────────────────────
 * Each press adds to a figure held right here, and only `Place bet` sends it. A
 * press that reached the server would mean one round costing four balance
 * movements and four lines in the audit trail, and a player who tapped five
 * chips and thought better of it having to be given four of them back.
 *
 * ── Cancel takes everything, committed or not ─────────────────────────────
 * Chips already on the table can be pulled right up until the cards come out,
 * which is what a real table allows and what a player who has changed their
 * mind is actually asking for. One button that clears both is one decision;
 * separate "undo the last press" and "pull the bet" controls would be two, and
 * the difference between them is not something anybody wants to think about
 * against a clock.
 *
 * ── The buttons live outside the drawer, not beside it ────────────────────
 * They used to share a row with the chips, which meant every chip a table's
 * limit added came at the buttons' expense — a high-roller room with a dozen
 * denominations on offer had less width to show them in than a low-stakes one,
 * which is backwards. They are their own column now, full height, so the
 * drawer gets the entire row regardless of how many pieces are on offer.
 */
function Rack({
  staked,
  chips,
  limits,
  busy,
  heading,
  note,
  onCommit,
  onDone,
}: {
  /** What is already on the table. The server's figure, not this one. */
  staked: number;
  chips: number;
  limits: { min: number; max: number };
  busy: boolean;
  heading: string;
  note?: string;
  onCommit: (amount: number) => void;
  onDone?: () => void;
}) {
  /*
    Pressed but not yet sent. Held *alongside* the committed stake rather than
    seeded from it, because the committed figure is the server's and can change
    underneath this — a round settling, a bet placed from another tab.
  */
  const [pending, setPending] = useState(0);
  const total = staked + pending;
  const rack = rackFor(limits.max);

  const short = total < limits.min && total > 0;
  const canCancel = total > 0 && !busy;

  return (
    <div className="flex h-full min-w-0 gap-3">
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-2.5">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
            {heading}
          </span>
          <span className="flex items-center gap-1.5 font-mono text-xl font-bold leading-none tabular-nums text-chip">
            <PokerChipIcon size={16} weight="fill" aria-hidden />
            {formatChipCount(total)}
          </span>
          <span className="text-[11px] text-ink-muted">
            {formatChipsShort(limits.min)}–{formatChipsShort(limits.max)} a bet
            {note ? ` · ${note}` : ""}
          </span>
        </div>

        {/*
          The drawer. Scrolls rather than wraps: a rack that reflows onto a
          second line changes the height of the gutter as the table's limits
          change, and the felt above it would resize with it mid-hand.

          ── Why it scrolls even on a table that doesn't need it to ─────────
          `overflow-x-auto` only reserves the scrollbar's strip of height once
          the chips actually spill past the edge — so a low-stakes table with
          six chips sat a few pixels lower than a high-roller one scrolling
          through twenty, because the low-stakes table never grew a scrollbar
          to eat into its height. `scroll` reserves that strip unconditionally,
          on every table, whether or not there is anything to scroll to. The
          chips sit at the same height everywhere now, at the cost of a
          scrollbar that is sometimes inert — worth it, since a table this
          casino runs without enough chips to fill the drawer is the rare one.

          ── Why this is taller than a chip ──────────────────────────────────
          Forcing the scrollbar didn't touch the other half of this: a box
          cannot have one axis scrolling and the other stated as `visible` —
          the spec computes the *other* axis to `auto` too the moment either
          one isn't `visible`, so this has always been a two-axis clip whether
          it says so or not. With a box sized exactly to the chip, that clip
          sat right on the chip's own edge, and the press-to-lift on a hovered
          chip (`hover:-translate-y-1`, four pixels) had nowhere to go but
          through the ceiling.

          Fixed at a height taller than the chips it holds instead, so the
          clip boundary sits above where a lifted chip actually reaches. The
          chips still sit at the bottom of it (`items-end`) so the row reads
          the same as it always did — the slack is invisible until something
          needs it.
        */}
        <div className="flex h-16 min-w-0 items-end gap-1.5 overflow-x-scroll overflow-y-hidden">
          {rack.map((piece) => {
            const reachable =
              total + piece.value <= limits.max && chips >= pending + piece.value && !busy;

            return (
              <button
                key={piece.value}
                type="button"
                disabled={!reachable}
                onClick={() => setPending((held) => held + piece.value)}
                className={`shrink-0 rounded-control transition-transform duration-120 ease-out ${
                  reachable
                    ? "cursor-pointer hover:-translate-y-1 focus-visible:-translate-y-1"
                    : "cursor-not-allowed opacity-30 grayscale"
                }`}
              >
                <Chip value={piece.value} size={46} />
              </button>
            );
          })}
        </div>
      </div>

      {/*
        Always here, at the same width, whether or not there is anything to
        commit or cancel — `Place bet` and `Cancel bet` used to appear and
        disappear with `total`, which meant the drawer beside them changed
        width on every press. Disabled says the same thing a missing button
        did without moving anything else in the row.
      */}
      <div className="flex shrink-0 items-stretch gap-2">
        <TallButton
          icon={HandCoinsIcon}
          label="Place bet"
          tone="go"
          disabled={busy || pending === 0 || short || chips < pending}
          title={
            short
              ? `This table takes ${formatChipCount(limits.min)} chips at least`
              : "Put these chips on the table"
          }
          onClick={() => {
            onCommit(total);
            setPending(0);
          }}
        />
        <TallButton
          icon={XCircleIcon}
          label="Cancel bet"
          tone="stop"
          disabled={!canCancel}
          title="Take everything back off the table"
          onClick={() => {
            setPending(0);
            if (staked > 0) onCommit(0);
          }}
        />
        {onDone ? (
          <TallButton
            icon={CheckCircleIcon}
            label="Done"
            tone="quiet"
            disabled={busy}
            title="Stop backing this seat"
            onClick={onDone}
          />
        ) : null}
      </div>
    </div>
  );
}

/**
 * What is in the bank.
 *
 * Its own panel on the right, at a size that can be read without looking for
 * it. It is the one figure a player checks between every hand, and the titlebar
 * copy — which is what they had before — is six pixels tall and shares a row
 * with the close button.
 *
 * ── Short, with the real figure a hover away ──────────────────────────────
 * A balance is unbounded and this panel is not — spelled out in full, a
 * nine-figure fortune runs past the edge of a box sized for the common case.
 * `formatChipsShort` is built for exactly this trade: a glanceable `9.9B`
 * that never overflows, with the exact count a `Tooltip` away for the one
 * moment it actually matters, such as reconciling a deposit. Not a `title` —
 * see @tt/window's tooltip.tsx for why that never showed anything here.
 */
function Balance({ chips }: { chips: number }) {
  return (
    <div className="flex w-40 shrink-0 flex-col justify-center gap-1.5 rounded-panel border border-edge bg-tone-1 px-5 py-3">
      <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-ink-muted">
        Balance
      </span>
      <Tooltip label={formatChips(chips)}>
        <span className="flex cursor-help items-center gap-2 font-mono text-2xl font-bold leading-none tabular-nums text-chip">
          <PokerChipIcon size={19} weight="fill" className="shrink-0" aria-hidden />
          {formatChipsShort(chips)}
        </span>
      </Tooltip>
    </div>
  );
}

/** A line of plain text where a control would otherwise be. */
function Says({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full items-center gap-2.5">
      <InfoIcon size={16} className="shrink-0 text-ink-muted" aria-hidden />
      <span className="text-sm text-ink-soft">{children}</span>
    </div>
  );
}

/**
 * A move: hit, stand, double or split — full height, an icon over the label,
 * a colour that says what pressing it does before the word does. A thin skin
 * over `TallButton`; see there for the button itself.
 *
 * ── Why these fill the row and the rack's buttons don't ──────────────────
 * These are the whole control for this phase — four buttons and nothing
 * else — where the rack's buttons sit beside a drawer of two dozen chips
 * doing most of the talking. A control that is the entire question gets to
 * take the entire row (`fill`); one that is answering a question the drawer
 * already asked gets to be exactly as wide as its label.
 */
function MoveButton({ move, busy, onClick }: { move: Move; busy: boolean; onClick: () => void }) {
  const { label, hint, icon } = MOVES[move];
  const tone: Tone = move === "hit" ? "go" : move === "stand" ? "stop" : "quiet";

  return (
    <TallButton icon={icon} label={label} tone={tone} disabled={busy} title={hint} fill onClick={onClick} />
  );
}

/**
 * The one button every pressable thing in the gutter is built from: hit,
 * stand, double, split, place a bet, cancel one, answer the insurance
 * question. Full height and an icon over the label, so a player learns the
 * shape once and every decision in the gutter looks like a decision.
 */
function TallButton({
  icon: ButtonIcon,
  label,
  tone,
  disabled,
  title,
  fill,
  onClick,
}: {
  icon: Icon;
  label: string;
  tone: Tone;
  disabled?: boolean;
  /** Rendered as a `Tooltip`, not the native `title` attribute — see that component. */
  title?: string;
  /** Share the row evenly rather than size to the label — see `MoveButton`. */
  fill?: boolean;
  onClick?: () => void;
}) {
  /*
    The sizing lives on whichever element ends up the direct flex child of
    the row this sits in — normally the button itself, but `Tooltip` wraps
    it in a `<span>` when there is a `title`, and that span is what actually
    needs `flex-1`/`min-w`. `h-full w-full` on the button is what makes it
    fill that wrapper exactly as it used to fill the row directly.
  */
  const sizing = `min-w-[72px] ${fill ? "flex-1" : "shrink-0"}`;

  const button = (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex h-full w-full flex-col items-center justify-center gap-1.5 rounded-control border px-3 transition-colors duration-120 ease-out ${
        disabled
          ? "cursor-not-allowed border-edge bg-tone-2 text-ink-muted/50"
          : `cursor-pointer active:translate-y-px ${TONE[tone]}`
      }`}
    >
      <ButtonIcon size={22} weight="bold" aria-hidden />
      <span className="text-[13px] font-semibold leading-none">{label}</span>
    </button>
  );

  return (
    <Tooltip label={title} className={sizing}>
      {button}
    </Tooltip>
  );
}

/*
  ── There is no clock down here ────────────────────────────────────────────
  There was, and it was the same number the banner over the table was already
  showing — two countdowns for one deadline, at opposite ends of the screen,
  which is one more than there is anything to count.

  The banner won because a phase's clock belongs to the *table*: it is what
  every seat is waiting on together, and a timer beside a player's own controls
  reads as being about them. See ./banner.tsx.
*/
