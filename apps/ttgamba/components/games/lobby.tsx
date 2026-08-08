"use client";

/**
 * Where you pick somewhere to sit.
 *
 * Two shapes out of one component, because they are the same list read two
 * ways. A multiplayer game shows its tables — which ones have room, and who is
 * already at them — and a player joins one. A singleplayer game has no tables
 * worth listing, because the table is made for whoever asks; what it shows
 * instead is the stakes, and picking one starts a private table immediately.
 *
 * A singleplayer game with only one set of stakes never gets here at all. There
 * would be nothing on the screen but a single button, so the server sits the
 * player down on the way past and the game loads in front of them (see
 * `getPlace` in lib/tables.ts).
 *
 * ── Why cards, and why one grid rather than a panel per tier ──────────────
 * A table is a place, and a grid of cards is how a floor plan reads: you scan
 * it for a gap. The list this replaced grouped tables under a heading carrying
 * the stakes, which meant the one figure a player picks a table by — what it
 * costs to sit there — was somewhere above whichever row they were looking at.
 * Each card carries its own limits, so a card is answerable on its own, and the
 * tier name is already in front of them as the first half of the table's name.
 *
 * The cards are deliberately roomy and mostly empty. A table is the sort of
 * thing that wants a photograph behind it, and that space is where one goes —
 * see `CARD`.
 *
 * ── Why there is no countdown anywhere in here ────────────────────────────
 * The lobby exists so that joining a game is a choice rather than a queue. A
 * shared game with one entrance has to gather players somehow, and the usual
 * answer is a timer that everyone waits out together — which means the quickest
 * way to play is to arrive just as one ends, and the second-quickest is to wait
 * a minute doing nothing. A grid of tables replaces that with a decision: sit at
 * a busy one, or start a quiet one. It is also where paid private tables go
 * when they arrive (PRODUCT.md) — they are a card here that not everyone can
 * take.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { PokerChipIcon } from "@phosphor-icons/react/dist/csr/PokerChip";

import { Panel } from "@/components/stage";
import type { TableRow, TierRow, TierView } from "@/lib/casino";
import type { Engine } from "@/lib/engines";
import { formatChipsShort } from "@/lib/format";

/**
 * The card, as a surface.
 *
 * ── The shape, and why it is not a centred stack ──────────────────────────
 * A lobby is a floor plan, and the thing a player is doing with it is picking
 * a place — so a card has to answer three questions at a glance and in this
 * order: what does it cost, is there room, and who is already there. Centred
 * text in a box answers none of them at a glance, because everything sits in
 * the same optical weight down the middle and the eye has to read it.
 *
 * So the content is left-aligned against a single strong right-hand anchor:
 * the table's own number, set large and dim. A casino floor labels its tables
 * and people say "table three" — the number is the card's name and its
 * ornament at once, which is the only kind of ornament DESIGN.md permits.
 *
 * Depth is surface tone only. There are no shadows, no gradients and no glow
 * anywhere in here; what separates a card from the stage is one tone step and
 * a hairline, and what marks it as pressable is that both move on hover.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * `w-full` is load-bearing and easy to lose. Two of these three cards are a
 * `<button>`, and a button has intrinsic sizing — `width: auto` resolves to
 * fit-content even on a block-level flex container, so without it the card
 * shrink-wraps its text instead of filling the grid cell it was given.
 */
const CARD =
  "group relative flex h-full w-full flex-col gap-3 overflow-hidden rounded-panel border border-edge bg-raised px-4 py-3.5 text-left transition-colors duration-120 ease-out";

/** Live, and pressable. Border and surface move together so the whole card lifts. */
const LIVE = "cursor-pointer hover:border-felt/70 hover:bg-raised-hover";

/**
 * The tier name, above the table's number.
 *
 * Small caps and letterspaced, which is the one place this app uses that
 * treatment: it makes the name read as a *class* of table rather than as a
 * title, which is what it is — every card under one tier repeats it.
 */
const TIER = "text-[11px] font-medium uppercase tracking-[0.14em] text-ink-muted";

/**
 * The table's number, as the card's anchor.
 *
 * Deliberately dim: it is the largest thing on the card and must not be the
 * loudest, or every card in the grid would shout its least useful field. It
 * warms a step on hover, which is most of what makes the card feel alive
 * without anything moving.
 */
const NUMBER =
  "font-mono text-4xl font-semibold leading-none tabular-nums text-tone-6 transition-colors duration-120 ease-out group-hover:text-edge-strong";

/**
 * Seats, as seats.
 *
 * A "3/5" is a fraction to be read; five marks with three filled is a picture
 * of a table, and it is understood before it is read. The figure is still
 * printed beside it — colour and shape are never the only carrier of a fact
 * anybody picks a table by.
 *
 * Squares rather than the obvious poker chips: DESIGN.md rules out anything
 * fully round, and a square seat reads as a place at a table well enough that
 * the rule costs nothing here.
 */
function Seats({ taken, seats }: { taken: number; seats: number }) {
  return (
    <span className="flex items-center gap-2">
      <span className="flex items-center gap-1" aria-hidden>
        {Array.from({ length: seats }, (_, index) => (
          <span
            key={index}
            className={`h-2 w-2 rounded-[2px] transition-colors duration-120 ease-out ${
              index < taken ? "bg-felt-hi" : "bg-tone-5"
            }`}
          />
        ))}
      </span>
      <span className="font-mono text-[11px] tabular-nums text-ink-muted">
        {taken}/{seats}
      </span>
    </span>
  );
}

/**
 * What it costs to sit here — the figure a player actually chooses by, so it is
 * the one thing on the card in the currency colour.
 *
 * Shortened, because two full figures with their separators do not fit across a
 * card and would wrap into a second line of digits. No `Tooltip` for the exact
 * pair — every use of this sits inside the card's own button, and a second
 * focusable, hoverable thing nested inside one interactive control is a worse
 * trade than the precision. The table states its limits again once somebody is
 * actually sat at it, which is the one place the exact figure has to be exact.
 */
function Limits({ tier }: { tier: TierRow }) {
  return (
    <span className="flex items-baseline gap-1.5 font-mono text-sm tabular-nums text-chip">
      <PokerChipIcon size={13} weight="fill" className="translate-y-px" aria-hidden />
      {formatChipsShort(tier.minBet)} – {formatChipsShort(tier.maxBet)}
      <span className="font-sans text-[11px] text-ink-muted">a bet</span>
      <span className="sr-only">chips</span>
    </span>
  );
}

/** The line along the bottom: who is here, or what is about to be. */
function Foot({ children, tone }: { children: React.ReactNode; tone?: "quiet" | "felt" }) {
  return (
    <span
      className={`line-clamp-1 border-t border-edge/70 pt-2.5 text-xs ${
        tone === "felt" ? "text-felt-hi" : "text-ink-muted"
      }`}
    >
      {children}
    </span>
  );
}

/**
 * How the cards are laid out.
 *
 * `auto-fill` rather than a breakpoint, because the thing that varies here is
 * not the viewport — the window is a fixed-ratio frame the player drags to the
 * size they like, inside a game that is always full screen, so every Tailwind
 * breakpoint is permanently "on" and none of them describe this pane. Columns
 * are counted against the space actually available instead.
 */
const GRID = "grid grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-3";

/** The head of every card: the tier, and the table's number. */
function Head({
  name,
  number,
  marker,
}: {
  name: string;
  /** The table's number, or a word for a card that has no table yet. */
  number: React.ReactNode;
  /** A note about *why* this table is here, when there is one. */
  marker?: React.ReactNode;
}) {
  return (
    <span className="flex items-start justify-between gap-3">
      <span className="flex min-w-0 flex-col gap-1.5">
        <span className={TIER}>{name}</span>
        {marker}
      </span>
      <span className={NUMBER}>{number}</span>
    </span>
  );
}

export function Lobby({
  tiers,
  engine,
  onSitAtTable,
  onSitAtTier,
  busy,
}: {
  tiers: TierView[];
  engine: Engine;
  onSitAtTable: (tableId: number) => void;
  onSitAtTier: (tierId: number) => void;
  busy: boolean;
}) {
  if (tiers.length === 0) {
    return (
      <Panel className="flex flex-col gap-2">
        <h2 className="text-sm font-medium">Nothing to sit at</h2>
        <p className="text-sm text-ink-soft">
          This game has no table limits set, so there is nowhere to play it. An administrator adds
          them under Admin Tools › Games.
        </p>
      </Panel>
    );
  }

  if (engine.mode === "singleplayer") {
    return (
      <ul className={GRID}>
        {tiers.map((tier) => (
          <li key={tier.id}>
            <StakeCard tier={tier} onSit={() => onSitAtTier(tier.id)} busy={busy} />
          </li>
        ))}
      </ul>
    );
  }

  return (
    <ul className={GRID}>
      {tiers.flatMap((tier) =>
        /*
          A tier with no tables at all is a moment rather than a state: the
          floor opens them on the way through this very read, so this is what
          the frame before that looks like. Said plainly rather than left
          blank, because a gap in the grid looks like a fault.
        */
        tier.tables.length === 0
          ? [
              <li key={`tier-${tier.id}`}>
                <OpeningCard tier={tier} />
              </li>,
            ]
          : tier.tables.map((table) => (
              <li key={table.id}>
                <TableCard
                  table={table}
                  tier={tier}
                  seats={Math.min(tier.seats, engine.maxSeats)}
                  onSit={() => onSitAtTable(table.id)}
                  busy={busy}
                />
              </li>
            )),
      )}
    </ul>
  );
}

/**
 * One table, as somewhere to sit — or to stand and watch.
 *
 * The whole card is the button. A card with a `Sit` control on it would be a
 * box the size of a postcard with one live corner, and every press landing
 * anywhere else would do nothing.
 *
 * A full table is still pressable, and that is deliberate: pressing opens the
 * table rather than seating anybody (components/games/seats.tsx), and a full
 * table is precisely the one worth watching.
 */
function TableCard({
  table,
  tier,
  seats,
  onSit,
  busy,
}: {
  table: TableRow;
  tier: TierRow;
  seats: number;
  onSit: () => void;
  busy: boolean;
}) {
  const taken = table.seats.length;
  const full = taken >= seats;

  const who = table.seats.map((seat) => seat.playerName ?? `Player ${seat.vrpId}`).join(", ");

  return (
    <button
      type="button"
      onClick={onSit}
      disabled={busy}
      className={`${CARD} ${busy ? "cursor-not-allowed" : LIVE}`}
    >
      <Head
        name={tier.name}
        number={table.number}
        marker={
          /*
            Worth saying which tables are here because the others filled up: it
            answers "why is there suddenly a table 4", and it is the one that
            goes away again when the table empties.

            No `Tooltip` — this sits inside the card's own button, and a
            second focusable, hoverable thing nested inside one interactive
            control is a worse trade than the badge staying a plain label.
            "Extra" is short on explanation on its own, but the card it sits
            on is a single press either way, so there is nothing this could
            tell a player that changes what pressing it does.
          */
          table.overflow ? (
            <span className="w-fit rounded-chip border border-edge bg-tone-2 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-ink-muted">
              Extra
            </span>
          ) : undefined
        }
      />

      <span className="flex flex-col gap-2">
        <Limits tier={tier} />
        <Seats taken={taken} seats={seats} />
      </span>

      <Foot>{full ? "Full — open to watch" : taken === 0 ? "Nobody here yet" : who}</Foot>
    </button>
  );
}

/**
 * One set of stakes, for a game that makes a table per player.
 *
 * The same card minus the things a private table cannot have: nobody to count,
 * and no number to tell it apart, because it does not exist until this is
 * pressed. The number's place carries a chip instead, so the grid keeps its
 * rhythm rather than leaving a hole where every other card has its anchor.
 */
function StakeCard({ tier, onSit, busy }: { tier: TierRow; onSit: () => void; busy: boolean }) {
  return (
    <button
      type="button"
      onClick={onSit}
      disabled={busy}
      className={`${CARD} ${busy ? "cursor-not-allowed" : LIVE}`}
    >
      <Head
        name={tier.name}
        number={
          <PokerChipIcon
            size={34}
            weight="fill"
            className="text-tone-6 transition-colors duration-120 ease-out group-hover:text-edge-strong"
            aria-hidden
          />
        }
      />

      <span className="flex flex-col gap-2">
        <Limits tier={tier} />
      </span>

      <Foot tone="felt">A table of your own, starting now</Foot>
    </button>
  );
}

/** The frame between a tier having no tables and the floor opening one. */
function OpeningCard({ tier }: { tier: TierRow }) {
  return (
    <div className={`${CARD} border-dashed`}>
      <Head name={tier.name} number={<span className="text-ink-muted/40">–</span>} />

      <span className="flex flex-col gap-2">
        <Limits tier={tier} />
      </span>

      <Foot>Opening a table…</Foot>
    </div>
  );
}
