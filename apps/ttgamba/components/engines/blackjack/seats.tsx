"use client";

/**
 * The seats, worked into the table rather than listed beside it.
 *
 * Each one is a circle painted on the cloth with the player's name tucked
 * between it and the bumper — which is where both of those things are on a
 * real table, and which means a player looking for their own place looks at
 * the table rather than at a legend.
 *
 * ── Why these are HTML over the SVG and not in it ─────────────────────────
 * Because they are the only part of the felt that answers back. A seat can be
 * hovered, focused, pressed and read out, it holds a name of unknown length
 * that has to truncate, and it changes whenever somebody sits down or leaves.
 * All of that is a button, and a button is what it is written as — positioned
 * over the drawing by the same geometry the drawing was made from, so the
 * circle a player presses is the circle that was painted for them.
 *
 * ── One button covering two places ────────────────────────────────────────
 * A seat is a circle *and* a name plate hanging under it. They are one
 * control: the button is positioned on the circle and the plate is placed
 * against it by `plateAt`, so hovering either lights both and there is one
 * thing to press rather than a live circle beside a dead label.
 *
 * ── Nothing here is selectable ────────────────────────────────────────────
 * A seat label is paint on a table, and paint does not turn blue when you drag
 * across it. It matters more than it sounds: a player reaching for a card or a
 * chip drags across this constantly, and a table strewn with half-highlighted
 * words is the difference between a game and a web page.
 */

import { bettingOpen, verdictOf, type RoundView, type SeatVerdict } from "@/lib/blackjack/round";
import type { SeatRow } from "@/lib/casino";
import { PLATE, placeCentred, plateAt, point, RING, SPOT_R, unit } from "./geometry";

/**
 * What keeps light text legible on green with nothing drawn behind it.
 *
 * The plate deliberately has no box (see `PLATE`), which leaves the felt's own
 * highlight running underneath the words — bright enough in the middle of the
 * table that cream on green loses its edges. A shadow is the one thing that
 * fixes it without putting a container back.
 */
const LEGIBLE = { textShadow: "0 1px 3px rgba(3, 20, 12, 0.75)" } as const;

/**
 * A settled name's colour, brightened from the light around the seat.
 *
 * The same five outcomes and the same hues as `OUTCOME_LIGHT` in ./hands.tsx,
 * lifted a little because this is text on felt rather than a glow behind it —
 * the glow's own value would read as muddy at thirteen units.
 */
const NAME_LIGHT: Record<SeatVerdict["tone"] | "insured", string> = {
  blackjack: "#f7d99a",
  win: "#7ce0ab",
  push: "#f0d472",
  lose: "#ff8f95",
  insured: "#8dc0f0",
};

export function Seats({
  angles,
  taken,
  round,
  mine,
  watching,
  backing,
  busy,
  onTakeSeat,
  onBack,
}: {
  /** Where each seat sits on the arc, in seat order. */
  angles: number[];
  taken: SeatRow[];
  round: RoundView | null;
  /** Which chair this player is in, or null while they are only watching. */
  mine: number | null;
  watching: boolean;
  /** The seat whose hand this player is choosing a stake for, if any. */
  backing: number | null;
  busy: boolean;
  onTakeSeat: (position: number) => void;
  onBack: (position: number | null) => void;
}) {
  return (
    <>
      {angles.map((degrees, index) => {
        const position = index + 1;
        const player = taken.find((seat) => seat.position === position) ?? null;
        const inRound = round?.seats.find((entry) => entry.seat === position) ?? null;

        /*
          Backing somebody is only offered while the betting is open, only on a
          seat that has actually put chips down — the stake rides their hand,
          and a seat with no hand has nothing to ride — and never on your own
          chair, where it would be a larger bet wearing a disguise.
        */
        const backable =
          round !== null &&
          bettingOpen(round.phase) &&
          player !== null &&
          position !== mine &&
          (inRound?.hands.length ?? 0) > 0 &&
          !busy;

        return (
          <Seat
            key={position}
            position={position}
            degrees={degrees}
            player={player}
            mine={position === mine}
            /*
              An empty chair is pressable only for somebody who is not already
              in one — the same rule the bench has. Moving seats mid-hand is a
              different decision from picking one, and the table layer treats a
              move as a leave and a re-seat, so it stays out of here until
              there is a game to have an opinion about it.
            */
            takeable={watching && !player && !busy}
            backable={backable}
            /** Their turn: the one seat on the felt that should be looked at. */
            active={round?.turn?.seat === position}
            chosen={backing === position}
            /*
              How their round finished, once it has. The name is tinted to
              match the light around the seat, so the signal is carried by two
              things rather than by a colour in the background alone.
            */
            verdict={inRound ? verdictOf(inRound) : null}
            onTakeSeat={onTakeSeat}
            onBack={onBack}
          />
        );
      })}
    </>
  );
}

function Seat({
  position,
  degrees,
  player,
  mine,
  takeable,
  backable,
  active,
  chosen,
  verdict,
  onTakeSeat,
  onBack,
}: {
  position: number;
  degrees: number;
  player: SeatRow | null;
  mine: boolean;
  takeable: boolean;
  /** Their hand can be ridden — pressing selects it for the keypad. */
  backable: boolean;
  /** It is this seat's turn to act. */
  active: boolean;
  /** This is the seat currently selected for a back bet. */
  chosen: boolean;
  /** How their round finished, or null while it is still being played. */
  verdict: SeatVerdict | null;
  onTakeSeat: (position: number) => void;
  onBack: (position: number | null) => void;
}) {
  const spot = point(degrees, RING.spot);
  const plate = plateAt(spot);

  const size = SPOT_R * 2;
  const style = {
    ...placeCentred(spot, size, size),
    width: unit(size),
    height: unit(size),
  } as React.CSSProperties;

  /*
    The plate's position, expressed against the button's own box — which is the
    circle, so this is `plateAt`'s offset and never a guess.
  */
  const plateStyle = {
    left: unit(size / 2 + (plate.x - spot.x) - PLATE.w / 2),
    top: unit(size / 2 + (plate.y - spot.y) - PLATE.h / 2),
    width: unit(PLATE.w),
    height: unit(PLATE.h),
    gap: unit(6),
  } as React.CSSProperties;

  const name = player ? player.playerName ?? `Player ${player.vrpId}` : null;

  const body = (
    <>
      {/*
        The betting circle. Painted, so it is there whether anyone is in it or
        not — and the one thing on the felt that says whose turn it is, because
        a table where you have to read names to find that out is a table where
        somebody always misses their turn.
      */}
      <span
        style={{ borderWidth: unit(active ? 3.4 : 2.4) }}
        className={`absolute inset-0 rounded-full transition-colors duration-200 ease-out ${
          active
            ? "border-solid border-[#7ce0ab] bg-[#7ce0ab]/15"
            : chosen
              ? "border-solid border-[#7ce0ab] bg-[#7ce0ab]/10"
              : mine
                ? "border-solid border-[#f0d089] bg-[#f0d089]/10"
                : player
                  ? "border-solid border-[#e8e0cc]/55"
                  : takeable
                    ? "border-dashed border-[#e8e0cc]/35 group-hover:border-[#7ce0ab] group-hover:bg-[#7ce0ab]/12 group-focus-visible:border-[#7ce0ab]"
                    : "border-dashed border-[#e8e0cc]/22"
        } ${backable ? "group-hover:border-[#7ce0ab]" : ""}`}
      />

      <span
        style={{ fontSize: unit(15) }}
        className={`relative font-mono font-semibold leading-none tabular-nums transition-colors duration-200 ease-out ${
          mine
            ? "text-[#f0d089]"
            : player
              ? "text-[#e8e0cc]/70"
              : takeable
                ? "text-[#e8e0cc]/40 group-hover:text-[#7ce0ab]"
                : "text-[#e8e0cc]/25"
        }`}
      >
        {position}
      </span>

      {/*
        The name plate, hanging under the circle. No border, no fill and no
        clipping — see `PLATE`: what belongs here is a person, and everything
        still to come (coloured names, titles, a real avatar) needs the room
        more than it needs a frame.
      */}
      <span style={plateStyle} className="absolute flex items-center justify-center">
        {player ? (
          <>
            <Avatar name={name ?? ""} mine={mine} />
            <span
              style={{
                ...LEGIBLE,
                fontSize: unit(13),
                /*
                  ── One source for the colour, in both directions ───────────
                  Settled seats take their outcome's colour, and everyone else
                  takes their resting one — but *both* are set here rather than
                  the outcome being inline and the resting colour being a
                  `text-*` class.

                  With the two split, going red faded and coming back snapped:
                  removing an inline property and adding a class in the same
                  render does not reliably give the transition two values to
                  work between, so only one of the two changes animated. One
                  property with two values animates both ways, every time.

                  Inline also keeps it on the same palette the light around the
                  seat is drawn from (./hands.tsx), so the two cannot drift
                  apart into a green name over a red glow.
                */
                color: verdict
                  ? NAME_LIGHT[verdict.insured ? "insured" : verdict.tone]
                  : mine
                    ? "#f7d99a"
                    : "#eee7d6",
              }}
              className="min-w-0 truncate text-left font-semibold leading-none transition-colors duration-500 ease-out"
            >
              {name}
            </span>
            {mine ? (
              <span
                style={{ ...LEGIBLE, fontSize: unit(9.5) }}
                className="shrink-0 font-bold uppercase tracking-[0.12em] text-[#f0d089]/80"
              >
                You
              </span>
            ) : null}
          </>
        ) : (
          <span
            style={{ ...LEGIBLE, fontSize: unit(11) }}
            className={`truncate font-semibold uppercase tracking-[0.16em] leading-none transition-colors duration-200 ease-out ${
              takeable ? "text-[#e8e0cc]/55 group-hover:text-[#7ce0ab]" : "text-[#e8e0cc]/30"
            }`}
          >
            {takeable ? "Sit here" : "Empty seat"}
          </span>
        )}
      </span>
    </>
  );

  if (!takeable && !backable) {
    return (
      <span style={style} className="group absolute flex select-none items-center justify-center">
        {body}
      </span>
    );
  }

  /*
    One control, two meanings, and which one it has is never ambiguous: an empty
    chair can only be sat in, and an occupied one can only be backed. There is
    no seat where both are on offer, so there is no press whose result a player
    has to guess at.
  */
  const label = takeable
    ? `Sit in seat ${position}`
    : chosen
      ? `Stop backing seat ${position}`
      : `Back ${player?.playerName ?? `seat ${position}`}`;

  return (
    /*
      No `Tooltip` here, unlike everywhere else — this button is positioned
      absolutely against the felt itself (`style`, from `placeCentred`), and
      `Tooltip` wraps its trigger in a `position: relative` span. Nest one
      inside the other and the button starts positioning itself against that
      new wrapper instead of the felt, which is every seat landing in the
      corner of the table. `backable`'s hover ring (above) is what carries
      the affordance instead — a colour change is a smaller thing to notice
      than an explanation, but it does not fight the geometry to say it.
    */
    <button
      type="button"
      onClick={() => (takeable ? onTakeSeat(position) : onBack(chosen ? null : position))}
      style={style}
      className="group absolute flex cursor-pointer select-none items-center justify-center"
    >
      {body}
      <span className="sr-only">{label}</span>
    </button>
  );
}

/**
 * Somewhere for a face to go.
 *
 * An initial on a tile until there are avatars to put here — which is a
 * placeholder, but a placeholder that is exactly the size and shape of the
 * thing that replaces it, so arriving at real pictures moves nothing else on
 * the table. Squared off rather than round: a round one would be a second
 * circle inside a seat that already has one, and the betting circle is the
 * circle that means something.
 */
function Avatar({ name, mine }: { name: string; mine: boolean }) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";

  return (
    <span
      style={{ width: unit(17), height: unit(17), borderRadius: unit(3.5), fontSize: unit(10) }}
      className={`flex shrink-0 items-center justify-center font-bold leading-none ${
        mine ? "bg-[#f0d089] text-[#123322]" : "bg-[#e8e0cc]/18 text-[#e8e0cc]/85"
      }`}
      aria-hidden
    >
      {initial}
    </span>
  );
}
