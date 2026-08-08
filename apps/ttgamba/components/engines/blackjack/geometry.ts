/**
 * The table, as numbers.
 *
 * One coordinate system, shared by the drawing and by everything that has to
 * land on top of it. The felt is an SVG with a fixed `viewBox`; the seats and
 * the cards are ordinary HTML absolutely positioned over the same rectangle.
 * Both read their positions out of this file, so a card dealt to seat 3 lands
 * on the betting circle painted for seat 3 rather than near it.
 *
 * ── Why the cards are not in the SVG ──────────────────────────────────────
 * The SVG is furniture: it is drawn once and never changes. The cards move
 * every frame of a deal, carry text that has to hint and antialias like text,
 * and want a 3D flip — all of which the browser does better, faster and with
 * fewer surprises in HTML than in SVG. Splitting them costs one shared
 * coordinate system, which is this file.
 *
 * ── Why one unit means the same thing on both axes ────────────────────────
 * The felt is locked to the `viewBox`'s aspect ratio by CSS, so one viewBox
 * unit is the same number of screen pixels horizontally and vertically. That
 * is what makes `unit()` below work: a card can be moved 300 units left or 300
 * units down with the same expression, and a `rotate` never shears. Break the
 * aspect lock and every diagonal on this table goes crooked.
 *
 * ── Angles ────────────────────────────────────────────────────────────────
 * Measured in degrees from *straight down*, positive towards the right. Zero
 * is the seat facing the dealer; -66 and +66 are the ends of the arc. Down is
 * the direction that matters here — a player's seat, their circle, their
 * cards and their name are all on one ray from the middle of the table — and
 * measuring from it means the number in a seat's position is the number a
 * reader can picture.
 */

/**
 * The drawing's own rectangle. Everything below is in these units.
 *
 * ── Why it is this shape ──────────────────────────────────────────────────
 * The window's frame is locked to 1.6, so the pane a game gets is always about
 * 1.62 whatever size the player drags it to. This is 1.61, which is as near
 * the same as makes no difference — meaning the felt fills the pane in both
 * directions rather than leaving a band of empty room along one edge.
 *
 * It was wider than that to begin with, on the reasoning that the leftover
 * height was where the betting and action keypads would go. It bought the
 * wrong thing: the leftover was a fixed *fraction* of the pane, so it was
 * nearly nothing on a small window and a wasteland on a large one, and all it
 * did in between was make the table smaller than it needed to be. The keypads
 * are a flex sibling of the box and take their own height when they arrive, at
 * which point the table gives up exactly as much as they need and no more.
 *
 * The cost is that the table is a little smaller on a medium window than it
 * would be at a wider ratio, which is the trade this shape is bought with —
 * what it buys is room *inside* the table for a name plate under every seat.
 */
export const VIEW = { w: 1000, h: 620 } as const;

/**
 * The table: a half-ellipse with the flat edge at the top, where the dealer
 * stands, bulging down towards the players.
 *
 * `ry` is a little under `rx` rather than equal to it. A true half-disc is
 * what the table *is*, and a half-disc is what you get looking straight down
 * at one — but nobody plays blackjack from directly above. Foreshortening it
 * slightly is what makes the drawing read as a table seen from a chair, and it
 * buys back the vertical room that a dealer, a shoe and a row of controls all
 * want out of a window whose short edge can be 406px.
 */
export const TABLE = { cx: 500, cy: 132, rx: 452, ry: 424 } as const;

/** The padded leather roll around the arc, as a thickness. */
export const BUMPER = 26;

/** The dealer's wooden strip along the flat edge, where the tray and shoe sit. */
export const RAIL = 34;

/**
 * The bands of the layout, as fractions of the table's radius.
 *
 * Ordered outwards from the dealer, which is the order they are printed in on
 * a real table: what the dealer must do, what the game pays, what insurance
 * pays, then the player's own half — cards, circle, and the player.
 *
 * These are fractions rather than coordinates because every one of them is an
 * arc concentric with the table's edge. A number here is "how far out", and
 * `point` turns it into somewhere.
 */
/*
  ── The paint block, and why it does not move as one ──────────────────────
  It sat high to begin with: a narrow gap under the dealer's rail and a wide
  empty band between the insurance stripe and the seats. Moving it down centres
  it, and it has now been moved twice.

  The first move took all four lines together. The second could not, and this
  is the constraint worth knowing before touching these numbers again: the
  insurance stripe is the last thing before the players' cards land, and the
  cards are at a fixed ring of their own. Pushing the stripe down as far as the
  three lines above it would bury it under every hand at the table.

  So the top three moved the full amount and the stripe moved barely at all —
  the gaps above it are wide and the gap below it is the one that has run out.
*/
export const RING = {
  /** "Dealer must stand on all 17s". */
  rules: 0.335,
  /** "BLACKJACK" — the big one. */
  title: 0.41,
  /** "Pays 3 to 2", set under it. */
  pays: 0.485,
  /** The insurance stripe, drawn as a thick arc with its text along the same path. */
  insurance: 0.545,
  /**
   * Where a player's cards land.
   *
   * Close enough to the circle below that the bottom of a hand covers the top
   * of it, which is what a dealt hand does on a real table — the layout is
   * printed to be played over, not to be looked at.
   */
  hand: 0.64,
  /**
   * The betting circle.
   *
   * The outermost thing on the ray. The player's name used to sit beyond it at
   * a ring of its own, and that was wrong in a way only the end seats showed:
   * out at ±66° the ray runs mostly sideways, so the plate slid out from under
   * its circle and sat beside it instead. It hangs straight down now — see
   * `plateAt` — which leaves this ring as the last one and the room below it
   * free for chips.
   */
  spot: 0.755,
} as const;

/** The betting circle, as a radius. Small: the cards and the chips go on it. */
export const SPOT_R = 22;

/**
 * The name plate under each seat.
 *
 * Deliberately roomy and deliberately not a box. What goes here is a player —
 * an avatar, a name that may be styled or coloured, a title they have earned —
 * and a bordered pill sized to today's content is a thing all of that would
 * have to be squeezed into. So it is an area rather than a container: nothing
 * is drawn around it, and the space is there whether or not it is filled yet.
 *
 * The width is what stops seven of them touching. At seven seats the circles
 * are about 131 units apart, so this is a shade under that and the space
 * between two plates is real rather than notional.
 */
export const PLATE = { w: 128, h: 34, gap: 7 } as const;

/** A playing card, in table units. 5:7, which is what a real one is. */
export const CARD = { w: 52, h: 72.8 } as const;

/**
 * How far apart cards in one hand sit, and how much each one is cocked over.
 *
 * ── Both were too much ────────────────────────────────────────────────────
 * The step was 17 against a card 52 wide, which left two thirds of every card
 * buried and a four-card hand reading as one thick card with a rank in the
 * corner. And the tilt *accumulated* — four degrees per card, so the fourth
 * card of a hand sat ten degrees off the first and the whole hand looked like
 * it had been dropped rather than dealt.
 *
 * A hand should be a neat overlapping row with just enough angle on it to look
 * placed by a person. One degree and a half, alternating around the middle,
 * is that; anything more compounds.
 */
export const FAN = { step: 23, tilt: 1.5 } as const;

/**
 * How much of a seat's angle a card takes on.
 *
 * Not all of it. Cards square to the player would have the outermost seat's
 * hand lying on its side, which is not what a dealt card looks like — a dealer
 * places cards roughly with the layout and lets the player turn them. A third
 * reads as "dealt towards you" while keeping every rank upright enough to be
 * read across the table.
 */
export const CARD_YAW = 0.32;

/** The shoe, on the dealer's rail. Every card starts its life here. */
export const SHOE = { x: 822, y: 149 } as const;

/**
 * Where dealt cards go to die.
 *
 * The in-table shuffler of a modern high-limit table: cards are swept into a
 * slot on the rail and never handled again. It is on the opposite side to the
 * shoe so that the two ends of a card's life are the two ends of the table,
 * and a player can see which way the game is flowing without being told.
 */
export const DISCARD = { x: 178, y: 149 } as const;

/** The middle of the dealer's own hand: clear of the rail, clear of the rules line. */
export const DEALER_HAND = { x: 500, y: 204 } as const;

/**
 * The chip tray, and therefore where money comes from and goes to.
 *
 * Every chip that leaves a betting circle travels here and every chip that
 * arrives in one comes from here, because that is where the house keeps its
 * float — see `ChipTray` in ./table.tsx, which draws it at this point. A
 * settlement where chips faded out on the spot would be chips *vanishing*; the
 * whole reason to animate it is to say who took them.
 */
export const TRAY = { x: 500, y: 146 } as const;

/**
 * How far to either side of the betting circle the side bets sit.
 *
 * Insurance on the left, whatever is riding on the hand on the right — far
 * enough out to clear the circle's painted ring, close enough to read as
 * belonging to that seat rather than to the one next door. They used to be two
 * words of text under the main stake, which was fine until they had to be paid
 * separately: a pile can be paid, a caption cannot.
 */
export const SIDE_PILE = 44;

/**
 * Where a seat's name plate goes, given its betting circle.
 *
 * Straight down the screen, not out along the seat's own ray. Radially is
 * where it belongs on a real table and it is what this did first, and it fails
 * at the ends of the arc: at ±66° the ray is running mostly sideways, so the
 * plate walks out from under its circle and ends up beside it — next to the
 * *neighbouring* seat's circle, which is worse than merely untidy.
 *
 * Down is right for the same reason the text on the layout is upright: this is
 * a table seen from a chair, and the thing under a circle on screen reads as
 * belonging to it however far round the arc it sits.
 */
export function plateAt(spot: Point): Point {
  return { x: spot.x, y: spot.y + SPOT_R + PLATE.gap + PLATE.h / 2 };
}

/**
 * How the seats are spread along the arc.
 *
 * `SPAN` is the whole of the playable arc and `PITCH` is the most room any one
 * seat is given. A full table divides the span; a quiet one spaces its seats
 * out at the pitch instead of stranding two players at opposite ends of a
 * table built for seven. The two cross at seven seats, which is blackjack's
 * maximum — so a full table is exactly the span, evenly divided.
 */
export const SEAT_SPAN = 132;
export const SEAT_PITCH = 34;

/**
 * Where each seat sits, in degrees from straight down.
 *
 * Always symmetrical about the middle, and always in seat order left to right
 * — which is the order a dealer deals in and the order the seat numbers run.
 */
export function seatAngles(count: number): number[] {
  if (count <= 1) return [0];

  const span = Math.min(SEAT_SPAN, SEAT_PITCH * (count - 1));
  const step = span / (count - 1);
  return Array.from({ length: count }, (_, index) => -span / 2 + index * step);
}

export type Point = { x: number; y: number };

/** Somewhere on the table: an angle, and how far out along it. */
export function point(degrees: number, ring: number): Point {
  const radians = (degrees * Math.PI) / 180;
  return {
    x: TABLE.cx + TABLE.rx * ring * Math.sin(radians),
    y: TABLE.cy + TABLE.ry * ring * Math.cos(radians),
  };
}

/**
 * An arc across the table, for a stripe or for text to sit on.
 *
 * Always drawn left to right — from the negative angle to the positive one —
 * because text on a path runs the way the path does, and a layout that read
 * backwards would be a puzzle rather than a table. The sweep flag is 0, which
 * in SVG's y-down space is the way round that bulges towards the player, so a
 * line of text dips in the middle exactly as the table's own edge does.
 */
export function arc(ring: number, degrees: number = SEAT_SPAN / 2 + 6): string {
  const from = point(-degrees, ring);
  const to = point(degrees, ring);
  return `M ${from.x} ${from.y} A ${TABLE.rx * ring} ${TABLE.ry * ring} 0 0 0 ${to.x} ${to.y}`;
}

/**
 * The direction "along the arc" at a given angle, as a unit vector.
 *
 * What a hand of cards fans along. Following the arc rather than fanning
 * horizontally is the difference between a hand that belongs to a seat and one
 * that happens to be near it.
 */
export function tangent(degrees: number): Point {
  const radians = (degrees * Math.PI) / 180;
  const x = TABLE.rx * Math.cos(radians);
  const y = -TABLE.ry * Math.sin(radians);
  const length = Math.hypot(x, y);
  return { x: x / length, y: y / length };
}

/**
 * Which side of the seat's centre a split hand sits on, as a sign.
 *
 * Used both to decide which way a hand's cards fan as it grows past its
 * opening two (`cardAt`) and where its score badge sits clear of them
 * (`./hands.tsx`). A hand with nothing to be on either side of — unsplit, or
 * the true middle of a three-way split — reads as the right side, which is
 * the direction every hand grew in before there was such a thing as a second
 * one.
 */
export function handSide(hand: number, hands: number): -1 | 1 {
  if (hands <= 1) return 1;
  return hand - (hands - 1) / 2 < 0 ? -1 : 1;
}

/**
 * Where the nth card of a hand sits, and how far over it is cocked.
 *
 * ── Why this does not know how many cards are in the hand ─────────────────
 * Because a card that has been dealt does not move again. Centring a fan means
 * every card in it shifts each time another arrives, and a hand that shuffles
 * itself sideways on every hit is not what a table looks like — a dealer puts
 * a card down and it stays where it was put.
 *
 * So the offset is `index - 0.5`, which centres the *opening two* — the hand
 * every player has for most of every round — and grows outward from there.
 * Nothing moves, ever, and the common case is still the balanced one.
 *
 * ── Why "outward" and not "to the right" ───────────────────────────────────
 * It used to always be to the right, which is what a single hand does on a
 * real table and is exactly the wrong answer for a seat playing two at once:
 * the left hand of a split grows to the right too, which is to say it grows
 * *into* the right hand. A double down or a run of hits on the left hand and
 * the two fans met in the middle and read as one thick hand rather than two.
 *
 * So a card past the opening two grows towards `handSide` instead — away
 * from whatever hand sits on the other side of this one. The opening two
 * stay put either way (`index - 0.5`, unmirrored), so a freshly dealt or
 * freshly split hand looks the same regardless of which side it landed on;
 * only the cards a player draws into it grow apart rather than together.
 */
export function cardAt(
  degrees: number,
  index: number,
  /** Which of this seat's hands. A split seat plays two, side by side. */
  hand: number = 0,
  hands: number = 1,
): Point & { turn: number } {
  const middle = point(degrees, RING.hand);
  const along = tangent(degrees);
  const side = handSide(hand, hands);
  const offset = index <= 1 ? index - 0.5 : side * (index - 0.5);
  // Split hands sit either side of where the one hand would have been, along
  // the same arc — so a seat playing two still reads as one player's place.
  const spread = (hand - (hands - 1) / 2) * SPLIT_SPREAD;

  return {
    x: middle.x + along.x * (offset * FAN.step + spread),
    y: middle.y + along.y * (offset * FAN.step + spread),
    turn: degrees * CARD_YAW + offset * FAN.tilt,
  };
}

/**
 * How far apart a split seat's two hands sit, along the arc.
 *
 * Wide enough that the *opening two* of each hand — before `handSide` has
 * anything to do — sit with a card's width of clear felt between the two
 * hands at their closest, rather than the overlap a single hand's own cards
 * are allowed. Two hands are two things, and the gap between them has to
 * read as bigger than the gap inside either one, not merely be so on paper.
 */
export const SPLIT_SPREAD = 90;

/**
 * The same, for the dealer.
 *
 * Dead square, every card. A dealer's hand is laid out rather than held: they
 * put each card down in line with the last one, and the fan a *player's* hand
 * has is a consequence of somebody picking cards up. Giving the dealer a tilt
 * per card made a four-card hand look like it had been dropped on the table.
 */
export function dealerCardAt(index: number): Point & { turn: number } {
  return {
    x: DEALER_HAND.x + (index - 0.5) * FAN.step,
    y: DEALER_HAND.y,
    turn: 0,
  };
}

// ── Crossing into CSS ──────────────────────────────────────────────────────

/**
 * A table unit, as a length CSS can use.
 *
 * The felt declares itself a query container, so `cqw` is one hundredth of its
 * width — and its width is `VIEW.w` units. One unit is therefore `0.1cqw`, at
 * every window size, on both axes, with nothing to measure and no resize
 * listener anywhere. It is what lets a card be sized, positioned and flown
 * across the table in the same units the table was drawn in.
 */
export function unit(value: number): string {
  return `${(value * 0.1).toFixed(4)}cqw`;
}

/** A position as a percentage of the felt, for `left` and `top`. */
export function place(at: Point): { left: string; top: string } {
  return {
    left: `${((at.x / VIEW.w) * 100).toFixed(4)}%`,
    top: `${((at.y / VIEW.h) * 100).toFixed(4)}%`,
  };
}

/**
 * The same, for something positioned by its own middle.
 *
 * Given as the element's top-left corner rather than as a `translate(-50%)`,
 * because `translate` is what the deal animation moves — and a transform that
 * is carrying the layout cannot also carry the motion without the two having
 * to know about each other.
 */
export function placeCentred(at: Point, width: number, height: number) {
  return place({ x: at.x - width / 2, y: at.y - height / 2 });
}
