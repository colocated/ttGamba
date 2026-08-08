"use client";

/**
 * Every card on the table, what each hand adds up to, and the light around a
 * seat once its round has been settled.
 *
 * Driven entirely by the round the server sent. There is no local model of the
 * game here and there must not be one: a hand exists because the server says a
 * card was dealt into it, and the only thing this file decides is where on the
 * felt that card lands.
 *
 * ── How the reveal animates ───────────────────────────────────────────────
 * The dealer's face-down card is rendered at the same index whether or not it
 * has been turned — `null` before, the real code after — so React keeps the
 * same element and the card *flips* rather than being swapped for a different
 * one. Rendering "a face-down card" and "the hole card" as two separate
 * elements would mean the reveal was one card vanishing and another flying in
 * from the shoe, which is not what turning a card over looks like.
 *
 * ── How the deal gets its rhythm ──────────────────────────────────────────
 * The server deals the whole opening round in one transition, so every card of
 * it arrives in a single poll and every card would fly out of the shoe at the
 * same instant — which reads as a hand appearing, not as dealing.
 *
 * So the stagger is worked out here, from the position each card holds in the
 * deal: round the table, dealer's up card, round again, hole card. That is the
 * order the server drew them in (`startDeal`), so the delay each card is given
 * is not a guess about what happened — it is what happened, replayed at a
 * speed a person can follow. Cards that arrive later, a hit or a split, are not
 * part of that sequence and land immediately.
 */

import { useEffect, useState } from "react";

import { Chip } from "@/components/chip";
import { verdictOf, type RoundView, type SeatRound } from "@/lib/blackjack/round";
import { isNatural, total } from "@/lib/blackjack/rules";
import { breakIntoChips } from "@/lib/denominations";
import { formatChipsShort } from "@/lib/format";
import { Card, type CardPhase } from "./card";
import {
  cardAt,
  dealerCardAt,
  handSide,
  place,
  point,
  RING,
  SIDE_PILE,
  TRAY,
  unit,
  VIEW,
  type Point,
} from "./geometry";

/** How long between one card of the opening deal and the next. */
const DEAL_STEP = 95;

export function Hands({
  round,
  angles,
  phase,
}: {
  round: RoundView;
  /** Where each seat sits on the arc, in seat order. */
  angles: number[];
  /** `swept` clears the table — the round has ended and the cards go. */
  phase: CardPhase;
}) {
  /*
    The seats that were dealt to, in dealing order. The stagger below is
    expressed in terms of this list, so a seat that joined but did not bet does
    not leave a gap in the rhythm.
  */
  const playing = round.seats.filter((seat) => seat.hands.length > 0);
  const order = new Map(playing.map((seat, index) => [seat.seat, index]));
  const dealt = playing.length;

  return (
    <>
      {round.seats.map((seat) => {
        const degrees = angles[seat.seat - 1];
        if (degrees === undefined) return null;
        return (
          <Aura key={`aura-${seat.seat}`} seat={seat} degrees={degrees} phase={phase} />
        );
      })}

      <DealerCards round={round} phase={phase} dealt={dealt} />

      {round.seats.map((seat) => {
        const degrees = angles[seat.seat - 1];
        if (degrees === undefined) return null;
        return (
          <SeatCards
            key={seat.seat}
            seat={seat}
            degrees={degrees}
            phase={phase}
            place={order.get(seat.seat) ?? 0}
            dealt={dealt}
            roundId={round.id}
            /*
              Which of *this* seat's hands is being decided right now, or
              `null` if it is nobody's turn here — a spectator, a seat between
              turns, or the whole table once the dealer takes over. Only
              means anything once there is more than one hand to tell apart;
              see `SeatCards`.
            */
            activeHand={round.turn?.seat === seat.seat ? round.turn.hand : null}
          />
        );
      })}
    </>
  );
}

/**
 * Where a card sits in the opening deal, as a delay.
 *
 * `pass` is which time round the table it was (0 or 1), `at` is how far round.
 * The dealer takes the seat after the last player on each pass, which is
 * exactly where they take theirs. Anything that is not part of the opening two
 * gets no delay at all — a hit is one card and it should land when it arrives.
 */
function dealDelay(pass: number, at: number, dealt: number): number {
  return (pass * (dealt + 1) + at) * DEAL_STEP;
}

function DealerCards({
  round,
  phase,
  dealt,
}: {
  round: RoundView;
  phase: CardPhase;
  dealt: number;
}) {
  /*
    One slot per card the dealer holds, plus one for the card still face down.
    Keyed by position rather than by card, which is what lets the hole card turn
    over in place when it stops being a secret.
  */
  const slots: (string | null)[] = [...round.dealer.cards];
  if (round.dealer.hole) slots.push(null);

  return (
    <>
      {slots.map((card, index) => {
        // The second card is the hole card: dealt face down, turned later.
        const hole = index === 1;
        return (
          <Card
            key={index}
            card={card}
            at={dealerCardAt(index)}
            faceUp={card !== null}
            dealtFaceUp={!hole}
            phase={phase}
            delay={index < 2 ? dealDelay(index, dealt, dealt) : 0}
          />
        );
      })}

      {round.dealer.cards.length > 0 && !round.dealer.hole ? (
        <Score
          at={{ x: dealerCardAt(0).x - 62, y: dealerCardAt(0).y }}
          cards={round.dealer.cards}
          natural={round.dealer.natural}
          phase={phase}
        />
      ) : null}
    </>
  );
}

function SeatCards({
  seat,
  degrees,
  phase,
  place: at,
  dealt,
  roundId,
  activeHand,
}: {
  seat: SeatRound;
  degrees: number;
  phase: CardPhase;
  /** How far round the table this seat is, for the deal's rhythm. */
  place: number;
  dealt: number;
  /** Which round is on the table — see `Pile`'s "leaving" state. */
  roundId: number;
  /** Which of this seat's hands is being decided right now, or `null`. */
  activeHand: number | null;
}) {
  /*
    ── Which hand gets to be the one you're looking at ───────────────────────
    Only a *split* seat has anything to tell apart — a single hand is always
    the one being played, and lighting it up would be pointing at the only
    thing on the table. `activeHand` is `null` for every seat except whoever's
    turn it actually is, so this is also `false` between turns and once the
    dealer takes over: nothing is "not the active hand" when nothing is
    active, and every hand goes back to reading equally once there is a
    result on all of them to compare.
  */
  const showActive = seat.hands.length > 1 && activeHand !== null;

  return (
    <>
      {seat.hands.map((hand, handIndex) =>
        hand.cards.map((card, cardIndex) => (
          <Card
            key={`${handIndex}-${cardIndex}`}
            card={card}
            at={cardAt(degrees, cardIndex, handIndex, seat.hands.length)}
            faceUp
            dealtFaceUp
            phase={phase}
            /*
              Only the opening two of the first hand are part of the deal. A
              third card is a hit and a second hand is a split, and both of
              those are a single card arriving on its own.
            */
            delay={handIndex === 0 && cardIndex < 2 ? dealDelay(cardIndex, at, dealt) : 0}
            dim={showActive && handIndex !== activeHand}
          />
        )),
      )}

      {seat.hands.map((hand, handIndex) => {
        if (hand.cards.length === 0) return null;

        /*
          Anchored to whichever card sits on the side this hand's *cards*
          never grow towards (`handSide` — the same test `cardAt` uses to
          decide which way a hit fans), so the badge stays clear of a hand
          that keeps drawing rather than sitting over a corner that used to
          be safe when every hand only ever grew to the right.
        */
        const side = handSide(handIndex, seat.hands.length);
        const anchor = cardAt(degrees, side === -1 ? 1 : 0, handIndex, seat.hands.length);

        return (
          <Score
            key={handIndex}
            at={{ x: anchor.x + (side === -1 ? 50 : -50), y: anchor.y - 36 }}
            cards={hand.cards}
            natural={isNatural(hand.cards, hand.fromSplit)}
            phase={phase}
            active={showActive && handIndex === activeHand}
            dim={showActive && handIndex !== activeHand}
          />
        );
      })}

      <Wager seat={seat} degrees={degrees} phase={phase} roundId={roundId} />
    </>
  );
}

/**
 * What a hand is worth, beside it.
 *
 * Soft totals say so — "soft 17" is a different hand from a hard 17 and is
 * played differently, and a table that prints only the number is withholding
 * the half that matters. A natural says `BJ` rather than 21, for the same
 * reason the rules keep them apart: it is not a 21, it is a blackjack.
 */
function Score({
  at,
  cards,
  natural,
  phase,
  active,
  dim,
}: {
  at: Point;
  cards: string[];
  natural: boolean;
  /** `swept` takes it off the felt with the hand it belongs to. */
  phase: CardPhase;
  /** This is the hand being decided right now — see `SeatCards`. */
  active?: boolean;
  /** A split's other hand, while this one is being decided. */
  dim?: boolean;
}) {
  const hand = total(cards);
  const bust = hand.value > 21;
  const soft = hand.soft && hand.value <= 21 && !natural;

  /*
    A soft total is written `19 (s)`, not `s19`. The number is the thing being
    read and it goes first — a prefix makes the eye parse a letter before it
    reaches the figure, and `s19` reads as a label rather than as nineteen.
    The qualifier is smaller and dimmer for the same reason.
  */
  const width = soft ? 58 : 44;

  return (
    <span
      style={{
        ...place({ x: at.x - width / 2, y: at.y - 10 }),
        width: unit(width),
        height: unit(20),
        borderRadius: unit(3),
        /*
          The ring a dealer never needs, because they only ever have the one
          hand in front of them to mean. A glow rather than a heavier border —
          it reads as a light landing on this badge specifically, which is
          what "this is the one" is actually saying, where a thicker outline
          would just read as a bigger box. `box-shadow` is banned everywhere
          outside the felt (DESIGN.md); this is the felt.
        */
        boxShadow: active ? "0 0 0 1.5px #7ce0ab, 0 0 9px 2px rgba(124, 224, 171, 0.55)" : undefined,
      }}
      /*
        ── `items-center`, and it has to be ──────────────────────────────────
        This was `items-baseline` so the small `(s)` would sit on the same
        baseline as the figure. It does — and baseline alignment positions the
        whole group against the *line box* rather than centring it in the
        badge, so the text rode high against the top border and left a gap
        underneath. Centring the group and keeping the baseline *inside* it
        gets both: the pair sits together, and the pair sits in the middle.
      */
      className={`pointer-events-none absolute flex select-none items-center justify-center border font-mono font-semibold leading-none tabular-nums transition-[opacity,box-shadow] duration-300 ease-out ${
        dim ? "opacity-45" : "opacity-100"
      } ${phase === "swept" ? "animate-clear" : ""} ${
        natural
          ? "border-[#f0d089]/70 bg-[#2a1f08]/90 text-[#f0d089]"
          : bust
            ? "border-[#e0575f]/60 bg-[#2a0d10]/90 text-[#ff8f95]"
            : "border-[#0a2a1b]/80 bg-[#05130c]/85 text-[#e8e0cc]"
      }`}
    >
      <span style={{ gap: unit(2.5) }} className="flex items-baseline">
        <span style={{ fontSize: unit(11.5) }}>{natural ? "BJ" : hand.value}</span>
        {/*
          No `title` — this whole badge is `pointer-events-none` (a hand's
          score sits over the felt, and letting it catch the pointer would
          steal clicks meant for the seat or the betting circle beneath it),
          so nothing here has ever actually been hoverable. A native tooltip
          on an element that cannot receive `:hover` was always dead weight.
        */}
        {soft ? (
          <span style={{ fontSize: unit(8.5) }} className="opacity-65">
            (s)
          </span>
        ) : null}
      </span>
    </span>
  );
}

/** The colour a settled seat is lit in. */
export const OUTCOME_LIGHT = {
  blackjack: "#f0d089",
  win: "#5fd39a",
  push: "#e6c15a",
  lose: "#e0575f",
  insured: "#6aa9ec",
} as const;

/**
 * The light around a seat once its round has been settled.
 *
 * ── Why a light and not a label ───────────────────────────────────────────
 * A word in a box is read, and reading is the slowest thing a player can be
 * asked to do at the moment a table settles — seven seats resolving at once is
 * seven labels to work through. Colour around the seat is understood before it
 * is read, and it is understood for every seat at the same time, which is what
 * a player actually wants from a settled table: who did well, at a glance.
 *
 * Two layers, because one is flat. A soft radial pool says *where*, and a
 * slowly turning sweep over it gives the whole thing the drift of something
 * live rather than a coloured circle that switched on. The name plate is
 * tinted to match (./seats.tsx), so the signal is never only a colour in the
 * background — and the figures are still printed on the felt beside it.
 */
function Aura({
  seat,
  degrees,
  phase,
}: {
  seat: SeatRound;
  degrees: number;
  phase: CardPhase;
}) {
  const verdict = verdictOf(seat);
  if (!verdict) return null;

  const spot = point(degrees, RING.spot);
  const light = verdict.insured ? OUTCOME_LIGHT.insured : OUTCOME_LIGHT[verdict.tone];
  const size = 190;

  return (
    <span
      style={{
        ...place({ x: spot.x - size / 2, y: spot.y - size / 2 }),
        width: unit(size),
        height: unit(size),
        "--light": light,
      } as React.CSSProperties}
      className={`pointer-events-none absolute select-none mix-blend-screen ${
        phase === "swept" ? "animate-clear" : ""
      }`}
      aria-hidden
    >
      {/* The pool: says where, and breathes. */}
      <span
        style={{
          background:
            "radial-gradient(closest-side, color-mix(in srgb, var(--light) 62%, transparent), transparent 72%)",
        }}
        className="absolute inset-0 animate-aura-pool rounded-full"
      />
      {/*
        The sweep: a conic band turning behind the pool. This is the half that
        makes it read as light rather than as a coloured circle, and it is
        deliberately faint — it is a drift, not a beacon.
      */}
      <span
        style={{
          background:
            "conic-gradient(from 0deg, transparent 0deg, color-mix(in srgb, var(--light) 38%, transparent) 70deg, transparent 150deg, color-mix(in srgb, var(--light) 22%, transparent) 240deg, transparent 320deg)",
          maskImage: "radial-gradient(closest-side, #000 20%, transparent 78%)",
          WebkitMaskImage: "radial-gradient(closest-side, #000 20%, transparent 78%)",
        }}
        className="absolute inset-0 animate-aura-sweep rounded-full"
      />
    </span>
  );
}

/**
 * The chips in the betting circle, and anybody riding them.
 *
 * ── A stack, not a number ─────────────────────────────────────────────────
 * The stake is drawn as the pieces it is actually made of, stacked in the
 * circle the way they would be on a table. A figure in a box is quicker to
 * write and tells a player nothing at a glance: five hundred thousand and five
 * million are the same shape, and the whole reason a casino uses coloured chips
 * is that a stack says what is at risk across the table without reading
 * anything.
 *
 * The figure is printed under it anyway. Colour is never the only carrier of
 * something a player is betting money on.
 */
function Wager({
  seat,
  degrees,
  phase,
  roundId,
}: {
  seat: SeatRound;
  degrees: number;
  phase: CardPhase;
  roundId: number;
}) {
  const spot = point(degrees, RING.spot);

  /*
    ── Three piles, because they are settled three different ways ────────────
    The stake, the insurance and whatever is riding on the hand all win and lose
    independently: a player can lose their hand and win their insurance in the
    same breath, and that is the entire point of insurance rather than an edge
    case. They were one stack with the other two written beside it as text,
    which was fine right up until the money had to move — a pile can be paid
    and a caption cannot, and paying a backer by growing the player's stack
    would be showing somebody else's winnings on their chips.
  */
  const settled = seat.hands.some((hand) => hand.outcome !== null);

  const staked = seat.hands.reduce((sum, hand) => sum + hand.bet, 0);
  const paid = seat.hands.reduce((sum, hand) => sum + hand.returned, 0);

  const backed = seat.backers.reduce((sum, backer) => sum + backer.amount, 0);
  const backPaid = seat.backers.reduce((sum, backer) => sum + backer.returned, 0);

  /*
    ── Always mounted, even at zero ──────────────────────────────────────────
    This used to return early — and each side pile had its own `> 0` guard —
    whenever there was nothing to draw, which is the right instinct for a seat
    that has simply never bet. It stopped being right the moment a pile needed
    to animate *leaving*: a `Pile` that gets unmounted the instant its amount
    hits zero never gets a frame to play that animation in, which is exactly
    what happened to a cancelled bet.

    `Pile` already renders nothing once it truly has nothing to show — see its
    `chips.length === 0` check — so leaving it mounted here costs three cheap
    components that return `null` on a seat nobody has bet on, in exchange for
    every pile getting the chance to see its own amount go to zero and leave
    accordingly.
  */
  return (
    <>
      <Pile
        at={spot}
        staked={staked}
        returned={paid}
        settled={settled}
        phase={phase}
        size={STACK.size}
        tone="text-[#f7d99a]"
        roundId={roundId}
      />

      <Pile
        at={{ x: spot.x - SIDE_PILE, y: spot.y }}
        staked={seat.insurance}
        returned={seat.insuranceReturned}
        settled={settled}
        phase={phase}
        size={SIDE_STACK}
        tone="text-[#bcc9d8]"
        note="ins"
        roundId={roundId}
      />

      <Pile
        at={{ x: spot.x + SIDE_PILE, y: spot.y }}
        staked={backed}
        returned={backPaid}
        settled={settled}
        phase={phase}
        size={SIDE_STACK}
        tone="text-[#7ce0ab]"
        note="beh"
        roundId={roundId}
      />
    </>
  );
}

/**
 * One stack of chips, and what happens to it when the hand is over.
 *
 * ── The figure is what the pile is worth *now* ────────────────────────────
 * Before the settlement that is the stake; after it, what came back. So a
 * winning pile grows — the chips arrive from the tray and the number under them
 * goes up to match — and a losing one is swept away with its number still
 * reading what it cost. That is the pile telling the story rather than a
 * separate line of commentary reporting on it.
 *
 * A push moves nothing at all, which is exactly what a push is.
 */
function Pile({
  at,
  staked,
  returned,
  settled,
  phase,
  size,
  tone,
  note,
  roundId,
}: {
  at: Point;
  staked: number;
  returned: number;
  /** The hand has been settled, so `returned` means something. */
  settled: boolean;
  phase: CardPhase;
  /** Chip diameter in table units. Side bets are drawn smaller than the stake. */
  size: number;
  /** The colour its figure is printed in. */
  tone: string;
  /**
   * Three letters marking a side pile, so it is not read as a second stake.
   * The pile is `pointer-events-none` (it sits over the felt, and letting it
   * catch the pointer would steal clicks meant for the seat beneath it), so
   * this is drawn rather than carried in a `title` — nothing here can be
   * hovered in the first place.
   */
  note?: string;
  /** Which round this pile belongs to — see the "leaving" state below. */
  roundId: number;
}) {
  /*
    Won, lost, or untouched. `returned` includes the stake, so anything above
    it is a payment and nothing at all is the house taking the lot.
  */
  const motion: "none" | "in" | "out" = !settled
    ? "none"
    : returned === 0
      ? "out"
      : returned > staked
        ? "in"
        : "none";

  const amount = settled && returned > 0 ? returned : staked;

  /*
    ── A cancelled bet doesn't just vanish ───────────────────────────────────
    `amount` is the server's figure, and the instant a cancelled stake reads
    zero there is nothing left here to draw — which is correct and, on its
    own, looks exactly like the chips being deleted rather than taken back.

    So the last nonzero amount this pile held *in this round* is kept around
    for exactly as long as `chip-retreat` needs to play, and drawn one last
    time while it does. Tied to `roundId` and not just "was nonzero", because
    a fresh round starts every pile at zero too — a seat that has not bet yet
    this round is not a bet leaving, and should not replay last round's stake
    sliding off the table.

    Every table watching this seat renders from the same round the server
    sent, so this plays for everyone looking at the felt, not only for
    whoever pressed Cancel.

    Adjusted during render rather than in an effect, on the pattern React
    itself recommends for "the state depends on a prop that just changed" —
    comparing against a snapshot of the last props seen, and correcting
    before this render commits. An effect runs after the browser has already
    painted the empty frame, and the chips would blink out and back in before
    the retreat animation ever got a chance to run; this lands the switch to
    the retreating amount in the very commit that drops to zero.
  */
  const [prev, setPrev] = useState({ amount, roundId });
  const [leaving, setLeaving] = useState<{ amount: number; roundId: number } | null>(null);

  if (prev.amount !== amount || prev.roundId !== roundId) {
    const was = prev;
    setPrev({ amount, roundId });

    if (was.roundId === roundId && was.amount > 0 && amount === 0 && !settled) {
      setLeaving({ amount: was.amount, roundId });
    } else if (leaving !== null) {
      // Either a real amount landed, or a new round started — either way,
      // nothing is being cancelled and any stale retreat is done being shown.
      setLeaving(null);
    }
  }

  const isLeaving = leaving !== null && leaving.roundId === roundId;
  const shown = isLeaving ? leaving.amount : amount;

  const { chips } = breakIntoChips(shown, STACK.max);

  /*
    How long the slowest chip in *this* stack takes to finish retreating —
    the base duration plus however much stagger the last piece was delayed
    by. Computed here rather than assumed, because a one-chip stack and a
    four-chip one do not take the same time to clear the felt, and both the
    timer that unmounts this pile and the label's own fade below need the
    real figure rather than a guess at the worst case.
  */
  const retreatMs = RETREAT_MS + Math.max(0, chips.length - 1) * STACK.stagger;

  // Clears the leaving pile once its retreat has actually played out.
  useEffect(() => {
    if (!leaving) return;
    const timer = window.setTimeout(() => setLeaving(null), retreatMs);
    return () => window.clearTimeout(timer);
  }, [leaving, retreatMs]);

  if (chips.length === 0) return null;

  const height = size + (chips.length - 1) * STACK.step;
  const width = size + 34;

  const travel = isLeaving
    ? "animate-chip-retreat"
    : motion === "none"
      ? "animate-chip-land"
      : motion === "in"
        ? "animate-from-tray"
        : "animate-to-tray";

  return (
    <span
      style={{
        ...place({ x: at.x - width / 2, y: at.y - height / 2 }),
        width: unit(width),
        // The vector to the house's float, from wherever this pile happens to
        // be. Set once here so every chip in the stack travels the same way.
        "--tray-x": unit(TRAY.x - at.x),
        "--tray-y": unit(TRAY.y - at.y),
        "--drop": unit(VIEW.h - at.y + 60),
      } as React.CSSProperties}
      className={`pointer-events-none absolute flex select-none flex-col items-center ${
        // A pile the house has taken is already gone; sweeping it again would
        // fade out something that has faded out.
        phase === "swept" && motion !== "out" ? "animate-clear" : ""
      }`}
    >
      <span style={{ height: unit(height) }} className="relative block w-full">
        {chips.map((piece, index) => {
          // Bottom of the stack first, so the largest piece ends up on top —
          // which is how a stack is built, and how one is paid out.
          const order = chips.length - 1 - index;
          return (
            <span
              key={`${piece.value}-${index}`}
              style={{
                bottom: unit(order * STACK.step),
                left: "50%",
                transform: "translateX(-50%)",
                animationDelay: `${order * STACK.stagger}ms`,
              }}
              className={`absolute ${travel}`}
            >
              <Chip value={piece.value} size={unit(size)} />
            </span>
          );
        })}
      </span>

      {/*
        ── The figure sits on a plate ────────────────────────────────────────
        It lands almost exactly on the betting circle's painted ring, and gold
        on a cream ring on green felt is three light things on top of each
        other. The plate is sized to the text rather than to the column, so it
        covers the ring exactly where the number crosses it and nowhere else.
      */}
      <span
        style={{
          fontSize: unit(10),
          marginTop: unit(2),
          gap: unit(3),
          paddingInline: unit(4),
          paddingBlock: unit(2),
          borderRadius: unit(4),
          /*
            `pile-out`'s own 520ms is timed to the settlement's `to-tray`,
            which travels much further than this ever does. Overriding just
            the duration — not the class, which still supplies the shape and
            the fill mode — keeps the label's fade finished at `retreatMs`,
            the same moment the slowest chip in the stack above it lands back
            in the gutter, rather than either outliving the chips it belongs
            to or cutting off mid-fade.
          */
          animationDuration: isLeaving ? `${retreatMs}ms` : undefined,
        }}
        /*
          A pile the house has taken loses its figure too, and so does one
          being cancelled — both are leaving and neither can travel with its
          chips. Without this the chips would go and the number they were
          worth would just sit there, orphaned above an empty circle.
        */
        className={`flex items-center bg-[#050f0a]/85 font-mono font-bold leading-none tabular-nums ${tone} ${
          motion === "out" || isLeaving ? "animate-pile-out" : ""
        }`}
      >
        {note ? (
          <span style={{ fontSize: unit(7.5) }} className="uppercase opacity-70">
            {note}
          </span>
        ) : null}
        {formatChipsShort(shown)}
      </span>
    </span>
  );
}

/**
 * How a stack in a betting circle is built.
 *
 * Four pieces at most. Past that a stack stops being a picture and becomes a
 * column to count, and the figure printed under it is the better answer anyway
 * — which is why `breakIntoChips` returns a remainder rather than pretending.
 */
const STACK = { size: 22, step: 4, max: 4, stagger: 90 } as const;

/**
 * How long `chip-retreat` takes, in step with app/globals.css.
 *
 * Kept here rather than read off the CSS because the timer that clears the
 * "leaving" pile has to know when the animation is *over*, and JavaScript has
 * no way to ask a `@keyframes` block its own duration. `STACK.stagger` is
 * already this file's copy of the same kind of number for the chip-landing
 * animation, so this is following existing form, not inventing a new one.
 */
const RETREAT_MS = 280;

/**
 * Side bets are drawn smaller than the stake.
 *
 * Not decoration: the stake is the hand and the other two are attached to it,
 * and three piles of identical chips around one circle would take three reads
 * to tell apart. Size does it in none.
 */
const SIDE_STACK = 15;
