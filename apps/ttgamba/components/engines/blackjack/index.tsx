"use client";

/**
 * Blackjack.
 *
 * ── Everything on screen is the server's answer ───────────────────────────
 * There is no model of the game in this file. A card is on the felt because
 * `readTable` said so, a hand is worth twenty because the same rules the server
 * settled with say so (lib/blackjack/rules.ts, shared on purpose), and a button
 * is on screen because the server listed it in `moves`. Nothing here decides
 * anything — which is what makes a browser with the console open no more useful
 * than one without.
 *
 * ── The poll is the dealer ────────────────────────────────────────────────
 * Nothing schedules a round. Reading the table is what turns its clock, so this
 * poll deals the cards, closes the betting, stands a player who wandered off
 * and pays the table out — see lib/blackjack.ts. That is why it runs several
 * times a second rather than at the lobby's five, and it is why a table nobody
 * is looking at is a table where nothing happens.
 *
 * It is also the heartbeat: the same call touches `seenAt`, so being at the
 * table is what holds the chair, exactly as it was before.
 *
 * ── The box ───────────────────────────────────────────────────────────────
 * This engine takes the whole pane (`EngineSurface` in ../registry) and carries
 * what the stage header used to. The box is app furniture and obeys DESIGN.md;
 * the felt inside it is a drawing of a table and does not.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowsOutIcon } from "@phosphor-icons/react/dist/csr/ArrowsOut";
import { EyeIcon } from "@phosphor-icons/react/dist/csr/Eye";
import { SignOutIcon } from "@phosphor-icons/react/dist/csr/SignOut";
import { SpinnerGapIcon } from "@phosphor-icons/react/dist/csr/SpinnerGap";

import { Tooltip } from "@tt/window";
import { Button, Problem } from "@/components/banker/ui";
import { Tag } from "@/components/stage";
import { makeMove, placeBackBet, placeStake, readTable, takeInsurance } from "@/lib/blackjack";
import type { RoundView, SeatRound } from "@/lib/blackjack/round";
import type { Move } from "@/lib/blackjack/rules";
import { settle } from "@/lib/chips";
import type { Caller } from "@/lib/desk";
import { ENGINES } from "@/lib/engines";
import { formatChipCount, formatChipsShort } from "@/lib/format";
import { holdTable } from "@/lib/leaving";
import { useDeskAction, usePlayerCall } from "@/lib/staff";
import type { EngineProps } from "../registry";
import { RoundBanner } from "./banner";
import type { CardPhase } from "./card";
import { useCountdown } from "./clock";
import { Controls } from "./controls";
import { seatAngles, VIEW } from "./geometry";
import { Hands } from "./hands";
import { Seats } from "./seats";
import { TableArt } from "./table";
import { Verdict } from "./verdict";

/**
 * How often the table is read.
 *
 * Fast, because this call *is* the dealer: every deadline in a round is
 * enforced by somebody reading the table, and at the lobby's five seconds a
 * twenty-second betting window would close somewhere between twenty and
 * twenty-five. It is also what the cards animate off, and a deal arriving in
 * one-second steps does not look like dealing.
 *
 * Comfortably inside the seat timeout (lib/casino.ts), so a player on a poor
 * connection keeps their chair through several missed calls.
 */
const TABLE_POLL = 1_200;

/**
 * How much of the payout phase is left when the cards are swept away.
 *
 * ── Read off the answer, never off the ticking clock ──────────────────────
 * This is compared against the remainder the *poll* returned, not against the
 * counting-down copy of it, and that is the whole point rather than a detail.
 *
 * The two are different clocks. `round` changes when an answer lands; the
 * countdown changes on its own two-hundred-millisecond interval. When the
 * dealer finishes, an answer arrives carrying the new `payout` phase and six
 * fresh seconds — but the countdown is still sitting on the zero it reached
 * during the dealer's turn, and stays there until its next tick. For that one
 * tick the two disagree, and a sweep asking "is it payout, and is the clock
 * nearly out" gets yes to both.
 *
 * That was the cards setting off for the discard slot and snapping back a
 * moment later: the sweep switched on, the countdown caught up, and it switched
 * off again. Comparing two fields of the *same answer* cannot do that, because
 * they were true at the same instant by construction.
 *
 * Wider than one poll on purpose. The window has to be longer than the gap
 * between reads or a badly-timed pair could step over it and the cards would
 * vanish without ever being swept.
 */
const SWEEP_AT = 1_800;

/** The room the table stands in. The pit's dark, and the lamp over the felt. */
const ROOM = [
  "radial-gradient(58% 44% at 50% 26%, rgba(232,196,106,0.11), transparent 72%)",
  "radial-gradient(124% 96% at 50% 6%, #1c2836 0%, #121a23 50%, #090d13 100%)",
].join(", ");

/**
 * The phases in which chips on the table cannot be walked away from.
 *
 * Betting is not one of them — a bet can be pulled right up to the deal — and
 * neither is the payout, by which point everything has already been settled and
 * paid. What is left is the part of a round a player is genuinely *in*.
 */
const COMMITTED: RoundView["phase"][] = ["dealt", "insurance", "playing", "dealer"];

export function BlackjackTable({ game, tier, table, seat, onTakeSeat, onLeave, busy }: EngineProps) {
  const seatCount = Math.max(1, Math.min(tier.seats, ENGINES.blackjack.maxSeats));
  const angles = useMemo(() => seatAngles(seatCount), [seatCount]);

  const fetcher = useCallback((caller: Caller) => readTable(caller, table.id), [table.id]);
  const { data: view, failure, reload } = usePlayerCall(fetcher, TABLE_POLL);
  const { run, busy: acting } = useDeskAction();

  /*
    The phase's remaining time, ticking. The server sends how long is left
    rather than when it ends, so nothing here has to reconcile two clocks —
    see ./clock.ts.
  */
  const countdown = useCountdown(view?.left ?? null);

  /*
    ── Keep the titlebar's balance honest ────────────────────────────────────
    The chip store is what the titlebar reads (lib/chips.ts) and it is only ever
    written by an answer from the server. This is an answer from the server, and
    it arrives every poll — so feeding it in is what makes a bet show up in the
    titlebar rather than sitting on the figure the page loaded with until
    somebody pressed refresh.

    Keyed on the *fields* rather than the object: a new object arrives on every
    poll and settling on each one would write local storage several times a
    second for a number that had not moved.
  */
  const account = view?.account;
  const chips = account?.chips ?? null;
  const role = account?.role ?? null;
  const vrpId = account?.vrpId ?? null;

  useEffect(() => {
    if (vrpId === null || role === null || chips === null) return;
    settle({ vrpId, role, chips });
  }, [vrpId, role, chips]);

  const round = view?.round ?? null;
  const mySeat = view?.seat ?? seat;
  const watching = mySeat === null;
  const mine: SeatRound | null =
    round && mySeat !== null ? round.seats.find((entry) => entry.seat === mySeat) ?? null : null;

  /** Which seat's hand this player is putting chips behind, while they choose how much. */
  const [backing, setBacking] = useState<number | null>(null);

  /**
   * A stand-up asked for at this table and not yet visible on it.
   *
   * ── Why this is the engine's and not the page's ───────────────────────────
   * Because the engine is the one that finds out first. The page's `busy` ends
   * when the mutation answers, which is well before the seat is seen to go, and
   * the obvious repair — hold it until `getPlace` says `lobby` — waits on the
   * *slow* poll: five seconds, against the 1.2 of `readTable` (`TABLE_POLL`).
   * That is a button locked for four seconds after the thing it was waiting for
   * had already happened, which is a worse lie than the one it replaced.
   *
   * `watching` is read off this engine's own poll, so it is the earliest honest
   * answer available anywhere in the app — and it ends this by arithmetic, with
   * no effect and nothing to clear.
   */
  const [standingUp, setStandingUp] = useState(false);

  /** Asked to stand, and this table still has us in a chair. */
  const leaving = standingUp && !watching;

  const leave = useCallback(
    (options?: { stay?: boolean }) => {
      setStandingUp(true);
      onLeave(options);
    },
    [onLeave],
  );

  const takeSeat = useCallback(
    (position: number) => {
      /*
        Sitting down forgets it. `watching` going false is the *start* of being
        seated as well as the end of standing up, so without this, taking a
        chair after standing up would satisfy `leaving` again and lock the
        button over a request that finished long ago.
      */
      setStandingUp(false);
      onTakeSeat(position);
    },
    [onTakeSeat],
  );

  /*
    Both halves come out of the same answer, so they cannot contradict each
    other for a frame. See `SWEEP_AT`.
  */
  const sweeping =
    view !== null && view.round.phase === "payout" && view.left !== null && view.left <= SWEEP_AT;
  const cardPhase: CardPhase = sweeping ? "swept" : "dealt";

  /*
    Chips at risk: a hand in a live round, or somebody else's hand being ridden.
    This is what stops a player standing up mid-round, and what the shelf's
    confirmation promises to wait for.
  */
  const committed =
    round !== null &&
    COMMITTED.includes(round.phase) &&
    ((mine?.hands.length ?? 0) > 0 || (view?.backing.length ?? 0) > 0);

  const act = useCallback(
    (call: (caller: Caller) => Promise<unknown>) => {
      void run(call as Parameters<typeof run>[0]).then(() => reload());
    },
    [run, reload],
  );

  const stake = useCallback(
    (amount: number) => act((caller) => placeStake(caller, table.id, amount)),
    [act, table.id],
  );
  const backStake = useCallback(
    (position: number, amount: number) =>
      act((caller) => placeBackBet(caller, table.id, position, amount)),
    [act, table.id],
  );
  const insure = useCallback(
    (amount: number) => act((caller) => takeInsurance(caller, table.id, amount)),
    [act, table.id],
  );
  const move = useCallback(
    (which: Move) => act((caller) => makeMove(caller, table.id, which)),
    [act, table.id],
  );

  // Backing a seat that has stopped existing — they pulled their bet, or the
  // round ended — is not a state to leave a keypad pointed at.
  const backable =
    backing !== null && round !== null && round.seats.some((entry) => entry.seat === backing);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {failure ? <Problem failure={failure} onRetry={reload} /> : null}

      <div
        style={{ backgroundImage: ROOM }}
        /*
          `felt-room` is the query container everything inside the box is sized
          and gated against — the felt's own width, and the cramped notice
          (app/globals.css). On the box rather than the sizer so the chrome,
          which is a sibling of the sizer, is inside it too.
        */
        className="felt-room relative min-h-0 flex-1 overflow-hidden rounded-panel border border-edge"
      >
        <div className="absolute inset-0 flex items-center justify-center">
          {/* `shrink-0` so the flex container cannot undo the width just computed. */}
          <div
            style={{ width: `min(100cqw, 100cqh * ${(VIEW.w / VIEW.h).toFixed(5)}, 1400px)` }}
            className="shrink-0"
          >
            {/*
              The felt. Locked to the drawing's ratio — which is what makes one
              table unit the same length on both axes, and therefore what lets
              every card be positioned, sized and flown in the units the table
              was drawn in. A query container, so `cqw` means "a hundredth of
              the felt" to everything inside it.
            */}
            <div
              style={{ aspectRatio: `${VIEW.w} / ${VIEW.h}` }}
              className="relative w-full [container-type:inline-size]"
            >
              <TableArt />
              <Seats
                angles={angles}
                taken={view?.seats ?? table.seats}
                round={round}
                mine={mySeat}
                watching={watching}
                backing={backing}
                busy={busy || acting || leaving}
                onTakeSeat={takeSeat}
                onBack={setBacking}
              />
              {round ? <Hands round={round} angles={angles} phase={cardPhase} /> : null}
              {/*
                Keyed on the round, so a new hand gets a new element and the
                animation plays again. Without it React would keep the last
                one, its animation already finished, and the second round of a
                session would settle in silence.
              */}
              {round ? (
                <Verdict key={round.id} round={round} seat={mySeat} mine={mine} />
              ) : null}
            </div>
          </div>
        </div>

        <Cramped />

        <Chrome
          game={game.name}
          tier={`${tier.name} ${table.number}`}
          limits={{ min: tier.minBet, max: tier.maxBet }}
          watching={watching}
          seat={mySeat}
          committed={committed}
          roundId={round?.id ?? 0}
          busy={busy}
          leaving={leaving}
          onLeave={leave}
          banner={
            round ? (
              <RoundBanner
                round={round}
                /*
                  Said to the room, so it needs somebody in it. Read off the
                  seats rather than off the round: a table where one player has
                  just sat down and nobody has bet has no round to speak of, and
                  that is exactly the moment the banner has something to say.
                */
                seated={(view?.seats ?? table.seats).length > 0}
                countdown={countdown}
                mine={mySeat}
              />
            ) : null
          }
        />
      </div>

      {view && round ? (
        <Controls
          round={round}
          seat={mySeat}
          mine={mine}
          chips={view.account.chips}
          limits={view.limits}
          moves={view.moves}
          busy={busy || acting}
          backing={
            backable && backing !== null
              ? {
                  seat: backing,
                  staked: view.backing.find((bet) => bet.seat === backing)?.amount ?? 0,
                }
              : null
          }
          onStake={stake}
          onBackStake={(amount) => {
            if (backing !== null) backStake(backing, amount);
          }}
          onStopBacking={() => setBacking(null)}
          onInsure={insure}
          onMove={move}
        />
      ) : null}
    </div>
  );
}

/**
 * The strip along the top: which table this is, and the way out of it.
 *
 * ── Leaving is two presses ────────────────────────────────────────────────
 * Standing up makes you a spectator; pressing again is what takes you back to
 * the list of tables. A player who is done with a hand is very often not done
 * with the table — they want to sit one out and watch how the shoe is running —
 * and a single button that emptied the screen would make that impossible to
 * ask for. Shift skips the spectator step for people who are done.
 *
 * ── And never mid-hand ────────────────────────────────────────────────────
 * A seat with chips in a live round is part of that round. The request is held
 * rather than refused — the player says what they want once, the button greys
 * out to say it was heard, and it happens the moment the hand settles.
 */
function Chrome({
  game,
  tier,
  limits,
  watching,
  seat,
  committed,
  roundId,
  busy,
  leaving,
  onLeave,
  banner,
}: {
  game: string;
  tier: string;
  limits: { min: number; max: number };
  watching: boolean;
  seat: number | null;
  /** Chips are in the round in progress, so leaving has to wait for it. */
  committed: boolean;
  /** Which round is on the table. A queued stand-up expires with it. */
  roundId: number;
  busy: boolean;
  /**
   * The seat is being given up *now*, and the table has not yet said it is
   * gone. Worked out by the engine, which polls four times faster than the page
   * and so is the first to know — see `standingUp` in `BlackjackTable`.
   *
   * Distinct from `holding` below, and they say different things: that one is
   * waiting on the *table*, a hand that has to finish first and may take
   * twenty seconds, and the button explains it in words. This is waiting on the
   * request itself — under a second, no deadline to quote, and nothing to say
   * about it beyond that it is happening. Which is what DESIGN.md means by
   * animating "that the app is waiting".
   */
  leaving: boolean;
  onLeave: EngineProps["onLeave"];
  /** What the table is doing, centred between the two clusters. */
  banner: React.ReactNode;
}) {
  /**
   * A stand-up asked for mid-hand, waiting for the hand to finish.
   *
   * ── Why it remembers which round it was asked in ──────────────────────────
   * Because that is what lets it expire on its own. The obvious shape is to
   * clear the flag once it has been acted on, and the only place that could
   * happen is the effect below — where a `setState` is a cascading render the
   * linter refuses, and rightly.
   *
   * Tying the request to the round instead means nothing has to clear it: it is
   * *live* only while the round it was made in is still the round on the table,
   * and the next deal makes it stale by arithmetic. The effect fires once when
   * the hand settles, and a flag left lying about afterwards cannot do any harm
   * because nothing reads it any more.
   */
  const [queued, setQueued] = useState<Queued | null>(null);
  const pending = queued !== null && queued.round === roundId ? queued : null;
  /** Held, and the hand it is waiting on is still being played. */
  const holding = pending !== null && committed;

  const stand = useCallback(
    (toLobby: boolean) => onLeave(toLobby ? undefined : { stay: true }),
    [onLeave],
  );

  /*
    The hand settling is what releases the request. An effect because the signal
    is external — the poll, not anything the player did — and it writes no state
    of its own: it calls the parent's `onLeave` and leaves `queued` where it is,
    which the round check above makes safe.
  */
  useEffect(() => {
    if (!pending || committed) return;
    stand(pending.toLobby);
    // Whatever the player was on their way to. Run after the seat is released,
    // never before — see `leaveForShelf`.
    pending.then?.();
  }, [pending, committed, stand]);

  const askToStand = (event: React.MouseEvent) => {
    // A watcher has no chair to give up and nothing in the round, so their
    // press is the second one: back to the list, now.
    if (watching) {
      stand(true);
      return;
    }

    const toLobby = event.shiftKey;
    if (!committed) {
      stand(toLobby);
      return;
    }

    setQueued({ toLobby, round: roundId });
  };

  /**
   * Leaving because the shelf was clicked, rather than because this button was.
   *
   * ── The navigation waits with the seat ────────────────────────────────────
   * It did not, and that was wrong twice over. The confirmation promised to
   * leave *after this hand* and then moved the player immediately — and moving
   * them unmounted this component, which is the only thing holding the queued
   * stand-up. So the seat was never released at all: the chair stayed occupied
   * until the sweeper noticed the poll had stopped, and coming back to the tab
   * found them still sitting at the table.
   *
   * The reasoning at the time was that making the whole window sit on a table
   * the player had finished with was holding the wrong half. That was a
   * judgement about which is more annoying, and it skipped the part where the
   * thing it was holding *back* was the only thing that worked.
   *
   * So both wait. The modal said "after this hand", the button says it too
   * while it is happening, and when the hand settles the seat goes and the
   * navigation follows it — in that order, because the component doing the
   * standing has to still exist when it happens.
   */
  const leaveForShelf = useCallback(
    (then: () => void) => {
      if (watching || !committed) {
        onLeave();
        then();
        return;
      }

      setQueued({ toLobby: true, round: roundId, then });
    },
    [watching, committed, onLeave, roundId],
  );

  useEffect(
    () => holdTable({ seated: !watching, midRound: committed, leave: leaveForShelf }),
    [watching, committed, leaveForShelf],
  );

  /*
    The banner sits under the identity rather than over the middle of the felt.
    Centred, it was a small box floating above the dealer's head with nothing
    to belong to; here it reads as the second line of what the table is — this
    is the table, and this is what it is doing — and it has the room to be big
    enough to notice without covering any of the cloth that matters.
  */
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-3 p-2.5">
      <div className="flex min-w-0 flex-col items-start gap-2">
      <div className="pointer-events-auto flex min-w-0 items-center gap-2.5 rounded-control border border-edge bg-tone-1/85 px-2.5 py-1.5">
        <span className="shrink-0 text-sm font-semibold leading-none tracking-tight">{game}</span>

        <span className="felt-roomy contents">
          <span className="h-3.5 w-px shrink-0 bg-edge" aria-hidden />
          <span className="truncate text-xs leading-none text-ink-soft">{tier}</span>
          {/* `side="bottom"` — this badge sits at the very top of the felt. */}
          <Tooltip
            label={`${formatChipCount(limits.min)} – ${formatChipCount(limits.max)} chips a bet`}
            side="bottom"
            className="shrink-0"
          >
            <span className="font-mono text-xs leading-none tabular-nums text-chip">
              {formatChipsShort(limits.min)}–{formatChipsShort(limits.max)}
            </span>
          </Tooltip>
        </span>

        <span className="shrink-0">
          {watching ? (
            <Tag>
              <EyeIcon size={12} weight="fill" aria-hidden />
              Watching
            </Tag>
          ) : (
            <Tag tone="good">Seat {seat}</Tag>
          )}
        </span>
      </div>

        {/* Hidden when the box is too narrow to hold it — see `felt-roomy`. */}
        <div className="felt-roomy min-w-0">{banner}</div>
      </div>

      <div className="pointer-events-auto flex shrink-0 items-center gap-2">
        <Button
          onClick={askToStand}
          disabled={busy || holding || leaving}
          tone="stop"
          title={
            watching
              ? "Back to the list of tables"
              : holding
                ? "Waiting for this hand to finish"
                : leaving
                  ? "Giving up your seat"
                  : "Stand up and keep watching this table. Shift-click to leave for the table list."
          }
        >
          <span className="flex items-center gap-1.5">
            {/*
              Swapped for the icon rather than added beside it, so the button
              keeps its width and the label stays where the eye already is —
              a control changing state, not a control growing a part.
            */}
            {leaving ? (
              <SpinnerGapIcon size={14} className="animate-spin" aria-hidden />
            ) : (
              <SignOutIcon size={14} aria-hidden />
            )}
            {watching
              ? "Back to the tables"
              : holding
                ? /*
                    A queue made from the shelf is on its way somewhere else, and
                    saying "standing up" would understate it — the player is
                    about to be taken off this page entirely and should not be
                    surprised by it when the hand ends.
                  */
                  pending?.then
                  ? "Leaving after this hand"
                  : "Standing up after this hand"
                : leaving
                  ? "Standing up"
                  : "Stand up"}
          </span>
        </Button>
      </div>
    </div>
  );
}

/**
 * A departure waiting on the hand in progress.
 *
 * `round` is what makes it expire on its own: it is live only while the round
 * it was asked in is still the round on the table, so nothing has to clear it
 * and no `setState` has to happen inside an effect to do so.
 *
 * `then` is present when the request came from the shelf — somewhere else to be
 * once the seat has been given up. It is called *after* the stand, because
 * calling it first unmounts the component that was going to do the standing.
 */
type Queued = { toLobby: boolean; round: number; then?: () => void };

/**
 * What is shown when the window is too small to play in.
 *
 * A table is seven seats, a dealer and a card's worth of detail in every corner
 * of it, and below a certain size none of that survives. Not a layout to fix by
 * rearranging it — there is genuinely not enough room, and the honest thing is
 * to say so. The threshold is a container query in app/globals.css.
 */
function Cramped() {
  return (
    <div className="felt-cramped absolute inset-0 z-10 flex items-center justify-center bg-tone-0/85 p-6">
      <div className="flex max-w-sm flex-col items-center gap-2 text-center">
        <ArrowsOutIcon size={22} className="text-ink-muted" aria-hidden />
        <h2 className="text-sm font-medium">This table needs more room</h2>
        <p className="text-sm text-ink-soft">
          Drag a corner of the window out and the felt, the seats and the cards come back. Your
          seat is held either way.
        </p>
      </div>
    </div>
  );
}
