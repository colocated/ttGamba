"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
// Deep imports, not the package root: the barrel is ~3000 icon modules and
// pulls all of them. See next.config.ts.
import { ArrowClockwiseIcon } from "@phosphor-icons/react/dist/csr/ArrowClockwise";
import { DotsSixVerticalIcon } from "@phosphor-icons/react/dist/csr/DotsSixVertical";
import { PokerChipIcon } from "@phosphor-icons/react/dist/csr/PokerChip";
import { PushPinIcon } from "@phosphor-icons/react/dist/csr/PushPin";

import { GEOMETRY_VARS } from "@/lib/bootstrap";
import { refreshChips, useChips } from "@/lib/chips";
import { formatChipCount, formatChips } from "@/lib/format";
import { usePlayer } from "@/lib/gamedata";
import { DEFAULT_SETTINGS, useSettings } from "@/lib/settings";
import { getData } from "@/lib/userapp";
import { InstallGuide } from "./install-guide";
import { Odometer } from "./odometer";
import { OverlayHost } from "./overlay";
import { Shelf } from "./shelf";
import { UpdateBanner } from "./update-banner";

/**
 * The window is a fixed size rather than a fraction of the viewport: the game
 * hands us the whole screen, and a full-bleed casino would bury the player's
 * view of the world. Usability over window size (README.md).
 *
 * The aspect ratio is locked, so resizing moves along one axis of variation
 * rather than a matrix of widths and heights. `MAX_WIDTH` is a sanity cap —
 * in practice the viewport is what players run into.
 *
 * These are the constraints; the starting width is a preference and lives in
 * `DEFAULT_SETTINGS`.
 */
const ASPECT = 1.6;
const MIN_WIDTH = 720;
const MAX_WIDTH = 2400;
/** Breathing room kept between the window and the edge of the game viewport. */
const VIEWPORT_MARGIN = 16;

type Point = { x: number; y: number };
/** Compass corner of the frame being dragged. */
type Corner = "nw" | "ne" | "sw" | "se";

const CORNERS: Record<Corner, { className: string; cursor: string }> = {
  nw: { className: "left-0 top-0", cursor: "cursor-nwse-resize" },
  ne: { className: "right-0 top-0", cursor: "cursor-nesw-resize" },
  sw: { className: "left-0 bottom-0", cursor: "cursor-nesw-resize" },
  se: { className: "right-0 bottom-0", cursor: "cursor-nwse-resize" },
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), Math.max(min, max));

const heightFor = (width: number) => Math.round(width / ASPECT);

export function Tablet({ children }: { children: React.ReactNode }) {
  const frameRef = useRef<HTMLDivElement>(null);
  /** Where inside the titlebar the pointer grabbed, so the window doesn't jump. */
  const grabOffset = useRef<Point | null>(null);
  /** The corner opposite the one being dragged — it stays put while resizing. */
  const resizeAnchor = useRef<{ corner: Corner; point: Point } | null>(null);
  const [dragging, setDragging] = useState(false);
  /** Spins the refresh icon, so a soft refresh isn't silent. */
  const [refreshing, setRefreshing] = useState(false);
  const router = useRouter();

  // Window geometry and the shelf toggle are remembered across reloads, so
  // they read from the settings store rather than local state. Writes there
  // are debounced, which is what makes it safe to call these per pointer move.
  const { settings, update: updateSettings, ready } = useSettings();
  const { windowWidth: requestedWidth, shelfPinned } = settings;

  /*
    Everything below the titlebar depends on the game client. Every page reads
    the player out of it, and the settings page goes on to look that player up
    in the database — so without a client there is no page worth rendering,
    only a series of components discovering the same absence separately. The
    frame stays: it is the player's window, and the titlebar is how they close
    it.
  */
  const { connection } = usePlayer();
  /** `null` until the first drag — CSS centres the window up to that point. */
  const origin: Point | null =
    settings.windowX === null || settings.windowY === null
      ? null
      : { x: settings.windowX, y: settings.windowY };

  const setOrigin = (point: Point) =>
    updateSettings({ windowX: point.x, windowY: point.y });
  const setRequestedWidth = (value: number) => updateSettings({ windowWidth: value });

  /**
   * Refresh content without tearing the document down.
   *
   * Nothing here unloads the document, and nothing here may. This app is a
   * full-screen iframe that holds input focus while it is open, so a page
   * that fails to come back leaves an invisible surface over the whole game:
   * the player cannot reach the userapp controls to hide it, and there is no
   * app left to hand control back. There is no safe way to offer that from
   * inside, so it is not offered — picking up a new build is the job of the
   * userapp's own URL bar, which cannot be broken by anything we render.
   *
   * This re-pulls the game client's data cache and re-fetches the server
   * components, which is what "refresh my content" actually means here. The
   * chip balance is asked for once per app load and would otherwise sit on its
   * cached figure, so it is re-read here too — this is the only way a player
   * has to pull in a deposit a banker just made.
   */
  const refresh = () => {
    getData();
    refreshChips();
    router.refresh();
    // Matches the `animate-refresh` duration, so the icon lands back upright
    // rather than being cut off part-rotation.
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 500);
  };

  // Size and position are *derived* against the live viewport rather than
  // corrected after the fact, so a game resolution change can never leave the
  // window hanging off screen — there is no stale state to catch up.
  const [viewportWidth, viewportHeight] = useViewport();
  const ceiling = Math.min(
    MAX_WIDTH,
    viewportWidth - VIEWPORT_MARGIN,
    (viewportHeight - VIEWPORT_MARGIN) * ASPECT,
  );
  const width = clamp(requestedWidth, MIN_WIDTH, ceiling);
  const height = heightFor(width);
  const position = origin && {
    x: clamp(origin.x, 0, viewportWidth - width),
    y: clamp(origin.y, 0, viewportHeight - height),
  };

  // Escape → pin is not handled here. It is the player's only way out of a
  // focused app, so it is installed by the boot script instead, where it works
  // even if this component never mounts. See lib/bootstrap.ts.

  /**
   * Switch off the centring transform by pinning the frame to its current
   * on-screen rect, otherwise the first pointer move snaps it to the top-left.
   */
  const materialise = () => {
    const frame = frameRef.current;
    if (!frame) return null;
    const rect = frame.getBoundingClientRect();
    setOrigin({ x: rect.left, y: rect.top });
    return rect;
  };

  const startDrag = (event: React.PointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    const rect = materialise();
    if (!rect) return;

    // `select-none` only stops the titlebar's *own* text being picked up. The
    // gesture still begins a selection, which then runs on into the stage and
    // highlights the page under the window. Suppressing the compatibility
    // mouse events is what actually stops it starting.
    event.preventDefault();

    grabOffset.current = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onDrag = (event: React.PointerEvent<HTMLElement>) => {
    const offset = grabOffset.current;
    if (!offset) return;

    setOrigin({
      x: clamp(event.clientX - offset.x, 0, viewportWidth - width),
      y: clamp(event.clientY - offset.y, 0, viewportHeight - height),
    });
  };

  const endDrag = (event: React.PointerEvent<HTMLElement>) => {
    grabOffset.current = null;
    setDragging(false);
    releaseCapture(event);
  };

  const startResize = (corner: Corner) => (event: React.PointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    const rect = materialise();
    if (!rect) return;

    resizeAnchor.current = {
      corner,
      point: {
        x: corner.includes("e") ? rect.left : rect.right,
        y: corner.startsWith("s") ? rect.top : rect.bottom,
      },
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    // As in `startDrag` — a resize drag would otherwise select the page too.
    event.preventDefault();
    event.stopPropagation();
  };

  const onResize = (event: React.PointerEvent<HTMLElement>) => {
    const grab = resizeAnchor.current;
    if (!grab) return;

    const { corner, point: anchor } = grab;
    const west = corner.includes("w");
    const north = corner.startsWith("n");

    // Both axes propose a width; take the larger so a diagonal drag tracks the
    // pointer rather than lagging behind on whichever axis moved less.
    const fromX = west ? anchor.x - event.clientX : event.clientX - anchor.x;
    const fromY = (north ? anchor.y - event.clientY : event.clientY - anchor.y) * ASPECT;

    // The anchored corner is fixed, so the gap between it and the viewport edge
    // is a hard ceiling on how far the window can grow this gesture.
    const reach = Math.min(
      ceiling,
      west ? anchor.x : viewportWidth - anchor.x,
      (north ? anchor.y : viewportHeight - anchor.y) * ASPECT,
    );

    const next = clamp(Math.max(fromX, fromY), MIN_WIDTH, reach);
    setRequestedWidth(next);
    setOrigin({
      x: west ? anchor.x - next : anchor.x,
      y: north ? anchor.y - heightFor(next) : anchor.y,
    });
  };

  const endResize = (event: React.PointerEvent<HTMLElement>) => {
    resizeAnchor.current = null;
    releaseCapture(event);
  };

  /*
    Until stored settings have been read, geometry comes from the CSS variables
    the boot script set from storage before this ever painted. They hold the
    same numbers React is about to render, so the handover is invisible —
    without them the window would open at the default size and jump. The
    fallbacks in each `var()` are what a first-time player gets.
  */
  const fallbackWidth = `var(${GEOMETRY_VARS.width}, ${DEFAULT_SETTINGS.windowWidth}px)`;
  const frameStyle: React.CSSProperties = ready
    ? {
        width,
        height,
        left: position ? position.x : "50%",
        top: position ? position.y : "50%",
        transform: position ? "none" : "translate(-50%, -50%)",
      }
    : {
        width: fallbackWidth,
        height: `calc(${fallbackWidth} / ${ASPECT})`,
        left: `var(${GEOMETRY_VARS.left}, 50%)`,
        top: `var(${GEOMETRY_VARS.top}, 50%)`,
        transform: `var(${GEOMETRY_VARS.transform}, translate(-50%, -50%))`,
      };

  return (
    <div className="fixed inset-0">
      <div
        ref={frameRef}
        style={frameStyle}
        className="absolute flex flex-col overflow-hidden rounded-panel border border-edge-strong bg-stage"
      >
        <header
          onPointerDown={startDrag}
          onPointerMove={onDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          className={`flex shrink-0 touch-none select-none items-center gap-2 px-3 py-2.5 ${
            dragging ? "cursor-grabbing" : "cursor-grab"
          }`}
        >
          <DotsSixVerticalIcon size={16} weight="bold" className="text-ink-muted" aria-hidden />
          <span className="text-sm font-semibold tracking-tight">
            tt<span className="text-felt-hi">Gamba</span>
          </span>

          {/*
            The window paints from the boot script's geometry before React has
            attached anything to it. `ready` is the moment the controls start
            working, and dimming them until then is the honest signal — the
            alternative is chrome that looks live and swallows presses.
          */}
          <div className="ml-auto flex items-center gap-2">
            {/* No client, no player, no balance — same condition as the pin. */}
            {connection === "connected" && <ChipCount />}

            <div className="flex items-center gap-0.5">
              <ChromeButton
                onClick={refresh}
                label="Refresh content"
                disabled={!ready}
                className={refreshing ? "text-felt-hi" : "text-ink-muted"}
              >
                <ArrowClockwiseIcon
                  size={16}
                  className={refreshing ? "animate-refresh" : undefined}
                  aria-hidden
                />
              </ChromeButton>

              {/* Nothing to pin open while the shelf is not on screen. */}
              {connection === "connected" && (
                <ChromeButton
                  onClick={() => updateSettings({ shelfPinned: !shelfPinned })}
                  pressed={shelfPinned}
                  label={shelfPinned ? "Let the shelf collapse" : "Keep the shelf open"}
                  disabled={!ready}
                  className={shelfPinned ? "text-ink-soft" : "text-ink-muted"}
                >
                  <PushPinIcon size={16} weight={shelfPinned ? "fill" : "regular"} aria-hidden />
                </ChromeButton>
              )}
            </div>
          </div>
        </header>

        <UpdateBanner />

        <div className="relative flex min-h-0 flex-1">
          {connection === "connected" ? (
            <>
              <Shelf pinned={shelfPinned} />
              {/* The stage — whichever page the shelf selected renders in here. */}
              <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>
            </>
          ) : (
            // `waiting` renders nothing rather than a spinner. In game it lasts
            // a frame or two, and a loader that appears and leaves inside
            // 100ms is a flicker, not information (DESIGN.md).
            connection === "absent" && <InstallGuide />
          )}
        </div>

        {/*
          Where modals land. Inside the frame so they cover the window rather
          than the game behind it, and outside the stage's scroll container so
          they stay put when the page under them is scrolled. See
          components/overlay.tsx.
        */}
        <OverlayHost />

        {/*
          Corner grips. They sit above everything so a grip is never swallowed
          by the titlebar's drag handler or the shelf drawer.
        */}
        {(Object.keys(CORNERS) as Corner[]).map((corner) => (
          <div
            key={corner}
            role="presentation"
            onPointerDown={startResize(corner)}
            onPointerMove={onResize}
            onPointerUp={endResize}
            onPointerCancel={endResize}
            className={`group absolute z-30 h-4 w-4 touch-none ${CORNERS[corner].className} ${CORNERS[corner].cursor}`}
          >
            {/* One corner carries the hint; finding it there teaches all four. */}
            {corner === "se" && <ResizeGrip />}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * The "you can drag this" hint: a triangle of dots hugging the corner, the
 * shorthand every OS window manager already uses for a resize grip.
 *
 * Colour is the only thing that moves on hover — no shadow, no scale — which
 * is the house rule (DESIGN.md).
 */
function ResizeGrip() {
  return (
    <svg
      viewBox="0 0 12 12"
      className="h-full w-full text-ink-muted transition-colors duration-120 ease-out group-hover:text-ink-soft"
      fill="currentColor"
      aria-hidden
    >
      {/* Rows fill out towards the corner, so the cluster points into it. */}
      {[
        [2.5, 9.5],
        [6, 9.5],
        [9.5, 9.5],
        [6, 6],
        [9.5, 6],
        [9.5, 2.5],
      ].map(([cx, cy]) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={0.9} />
      ))}
    </svg>
  );
}

/**
 * The chip balance, in the titlebar.
 *
 * It lives in the chrome rather than on a page because it is the one number
 * that is relevant on every one of them — a player mid-hand should not have to
 * leave the table to find out what they are playing with.
 *
 * A link, not a readout: settings is where the deposit lives, and a balance a
 * player is unhappy with should be one press away from the thing that changes
 * it. The figure itself comes from a store shared with that page, so opening it
 * costs nothing (lib/chips.ts).
 */
function ChipCount() {
  const { chips, failed } = useChips();

  return (
    <Link
      href="/settings"
      // As with ChromeButton: without this, pressing it also drags the window.
      onPointerDown={(event) => event.stopPropagation()}
      title={
        chips === null
          ? failed
            ? "Chip balance unavailable"
            : "Reading your chip balance"
          : `${formatChips(chips)} — open settings to deposit`
      }
      className={`flex items-center gap-1.5 rounded-chip border border-edge bg-tone-2 px-2 py-1 font-mono text-xs tabular-nums transition-colors duration-120 ease-out hover:bg-tone-3 ${
        // Unknown is not zero, and a dash in the currency colour reads like a
        // balance rather than the absence of one.
        chips === null ? "text-ink-muted" : "text-chip"
      }`}
    >
      <PokerChipIcon size={13} weight="fill" aria-hidden />
      {/* The glyph names the unit for anyone who can see it; this is the rest. */}
      {chips === null ? <span>—</span> : <Odometer value={chips} format={formatChipCount} />}
      <span className="sr-only">chips</span>
    </Link>
  );
}

/**
 * A titlebar control. Presses are kept off the titlebar's drag handler —
 * without that, clicking one would also start dragging the window.
 */
function ChromeButton({
  onClick,
  label,
  pressed,
  disabled,
  className,
  children,
}: {
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
  label: string;
  pressed?: boolean;
  disabled?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={onClick}
      aria-pressed={pressed}
      disabled={disabled}
      title={label}
      className={`rounded-control p-1 transition-colors duration-120 ease-out ${
        disabled
          ? "cursor-default text-ink-muted/40"
          : `cursor-pointer hover:bg-tone-2 hover:text-ink ${className ?? ""}`
      }`}
    >
      {children}
      <span className="sr-only">{label}</span>
    </button>
  );
}

/**
 * Live viewport size. Unbounded during server render and hydration — the
 * markup must not depend on a size the server cannot know — which simply means
 * nothing is clamped until the first client render.
 */
function useViewport(): [number, number] {
  const size = useSyncExternalStore(
    (onChange) => {
      window.addEventListener("resize", onChange);
      return () => window.removeEventListener("resize", onChange);
    },
    // A string so repeat calls return an equal snapshot; an object would look
    // like a change on every read and re-render forever.
    () => `${window.innerWidth}x${window.innerHeight}`,
    () => "",
  );

  if (!size) return [Infinity, Infinity];
  const [w, h] = size.split("x");
  return [Number(w), Number(h)];
}

function releaseCapture(event: React.PointerEvent<HTMLElement>) {
  if (event.currentTarget.hasPointerCapture(event.pointerId)) {
    event.currentTarget.releasePointerCapture(event.pointerId);
  }
}
