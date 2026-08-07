"use client";

/**
 * The window's behaviour, with no markup attached.
 *
 * `Tablet` is a skin over this hook. Everything that took work to get right —
 * the four-phase minimise, geometry derived against a live viewport, pointer
 * capture that survives a drag leaving the frame, and the rules about what a
 * user app may never do to its own document — is here, so an app that wants a
 * different-looking window can have one without reimplementing any of it.
 *
 * See README.md, "Changing the way an app looks", level 3.
 */

// The namespace import is for the `React.PointerEvent` / `React.CSSProperties`
// types below. This module has no JSX, so it is a `.ts` file and does not get
// the ambient React the JSX transform brings with it.
import type * as React from "react";
import { useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";

import { getData, pin, closeApp } from "@tt/userapp";
import { useTrigger } from "@tt/userapp/gamedata";

import { GEOMETRY_VARS } from "./bootstrap";
import { DEFAULT_WINDOW_SETTINGS, type WindowSettings } from "./window-settings";

/**
 * The window is a fixed size rather than a fraction of the viewport: the game
 * hands us the whole screen, and a full-bleed app would bury the player's view
 * of the world. Usability over window size.
 *
 * The aspect ratio is locked, so resizing moves along one axis of variation
 * rather than a matrix of widths and heights. `maxWidth` is a sanity cap — in
 * practice the viewport is what players run into.
 */
const ASPECT = 1.6;
const MIN_WIDTH = 720;
const MAX_WIDTH = 2400;
/** Breathing room kept between the window and the edge of the game viewport. */
const VIEWPORT_MARGIN = 16;
/** Matches `--animate-refresh`, so the icon lands upright rather than cut off. */
const REFRESH_SPIN = 500;

type Point = { x: number; y: number };
/** Compass corner of the frame being dragged. */
export type WindowCorner = "nw" | "ne" | "sw" | "se";
/** Open, collapsed, or somewhere between the two. */
export type WindowPhase = "open" | "minimising" | "minimised" | "restoring";

/** What an app's settings store has to look like from in here. */
export type WindowSettingsSource = () => {
  settings: WindowSettings;
  update: (patch: Partial<WindowSettings>) => void;
  ready: boolean;
};

export type WindowFrameOptions = {
  /**
   * The app's `store.useSettings`, not a store of its own — see
   * window-settings.ts for why the window does not keep one.
   *
   * A hook passed as an option is unusual, and safe here because it is called
   * unconditionally on every render of this hook, exactly as if it were written
   * inline.
   */
  useWindowSettings: WindowSettingsSource;
  aspect?: number;
  minWidth?: number;
  maxWidth?: number;
  viewportMargin?: number;
  /**
   * The game keybind that puts the window away and brings it back. One of the
   * four the game ships with — `square`, `triangle`, `circle`, `cross` — or any
   * name the app has registered with `registerTrigger`. `null` switches it off.
   */
  restoreTrigger?: string | null;
  /** Extra work on refresh — re-reading a balance, say. Runs after `getData`. */
  onRefresh?: () => void;
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), Math.max(min, max));

export function useWindowFrame({
  useWindowSettings,
  aspect = ASPECT,
  minWidth = MIN_WIDTH,
  maxWidth = MAX_WIDTH,
  viewportMargin = VIEWPORT_MARGIN,
  restoreTrigger = "triangle",
  onRefresh,
}: WindowFrameOptions) {
  const frameRef = useRef<HTMLDivElement>(null);
  /** Where inside the titlebar the pointer grabbed, so the window doesn't jump. */
  const grabOffset = useRef<Point | null>(null);
  /** The corner opposite the one being dragged — it stays put while resizing. */
  const resizeAnchor = useRef<{ corner: WindowCorner; point: Point } | null>(null);
  const [dragging, setDragging] = useState(false);
  /** Spins the refresh icon, so a soft refresh isn't silent. */
  const [refreshing, setRefreshing] = useState(false);
  /**
   * Where the window is between open and collapsed.
   *
   * Four states rather than a flag, because minimising animates and so the
   * moment it is asked for and the moment it has happened are no longer the
   * same moment — the same problem a modal has, solved the same way
   * (overlay.tsx). `minimising` and `restoring` are the window on screen playing
   * an animation; the frame is only taken down once the exit has actually
   * finished.
   *
   * Session state rather than a remembered setting: minimising is something a
   * player does to get on with the game, not a preference about how the app
   * should open next time.
   */
  const [phase, setPhase] = useState<WindowPhase>("open");
  const router = useRouter();

  const heightFor = (width: number) => Math.round(width / aspect);

  /**
   * Back to full size. Every route in goes through here — the corner tab and
   * the keybind both — and it is a no-op from anywhere but `minimised`, so a
   * stray trigger during the animation cannot start a second one.
   */
  const restore = () =>
    setPhase((current) => (current === "minimised" ? "restoring" : current));

  // Window geometry is remembered across reloads, so it reads from the app's
  // settings store rather than local state. Writes there are debounced, which is
  // what makes it safe to call these per pointer move.
  const { settings, update: updateSettings, ready } = useWindowSettings();
  const requestedWidth = settings.windowWidth;

  /** `null` until the first drag — CSS centres the window up to that point. */
  const origin: Point | null =
    settings.windowX === null || settings.windowY === null
      ? null
      : { x: settings.windowX, y: settings.windowY };

  const setOrigin = (point: Point) => updateSettings({ windowX: point.x, windowY: point.y });
  const setRequestedWidth = (value: number) => updateSettings({ windowWidth: value });

  /**
   * Refresh content without tearing the document down.
   *
   * Nothing here unloads the document, and nothing here may. A user app is a
   * full-screen iframe that holds input focus while it is open, so a page that
   * fails to come back leaves an invisible surface over the whole game: the
   * player cannot reach the userapp controls to hide it, and there is no app
   * left to hand control back. There is no safe way to offer that from inside,
   * so it is not offered — picking up a new build is the job of the userapp's
   * own URL bar, which cannot be broken by anything we render.
   *
   * This re-pulls the game client's data cache and re-fetches the server
   * components, which is what "refresh my content" actually means here.
   * `onRefresh` is where an app adds anything of its own.
   */
  const refresh = () => {
    getData();
    onRefresh?.();
    router.refresh();
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), REFRESH_SPIN);
  };

  /**
   * Out of the way, but still on screen.
   *
   * `pin` is what makes this a minimise rather than a close: it hands input
   * back to the game while leaving the app rendered, so a corner tab is
   * something the player can still see. `close` would take the whole surface
   * away and there would be nothing left to draw the tab on.
   *
   * The window itself is hidden rather than unmounted, so whatever is on the
   * stage survives the round trip — a half-filled form is still half-filled
   * when it comes back.
   *
   * `pin` fires now rather than when the animation finishes. The game should
   * respond to the press immediately; the window catching up over the next
   * fifth of a second is the app's business, not something to make the player
   * wait through before they can steer.
   */
  const minimise = () => {
    setPhase("minimising");
    pin();
  };

  /**
   * Gone, until F1.
   *
   * `close` already hands focus back as well as hiding the app — it is one
   * command doing both (`@tt/userapp`) — so the `pin` after it is belt and
   * braces rather than a second half of the job. Worth knowing that `pin`'s own
   * description is "keeps the web app on screen": if this ever leaves the
   * window visible instead of hiding it, that line is the one to drop.
   */
  const hide = () => {
    closeApp();
    pin();
  };

  /*
    The restore keybind, `triangle` by default.

    ── What it cannot do ─────────────────────────────────────────────────────
    It cannot give the app focus. Nothing can. The protocol has `pin` and
    `close` and both hand focus *away*; there is no command anywhere in it that
    takes focus back, and the sample app the docs link does not have one either.
    F1 is the only route in, and that is the client's key rather than ours.

    So this is a visibility toggle, not a focus toggle. Restored, the window is
    on screen and readable — a glance at a balance without leaving the game —
    and F1 is still what makes it clickable.
    ─────────────────────────────────────────────────────────────────────────

    ── Why it acts on any open window, focused or not ────────────────────────
    This was briefly gated on the app having focus, on the reasoning that the
    key is a way out of the app while you are *in* it. That was wrong, and
    wrong in the most common path there is: the key restores a minimised
    window, but restoring cannot take focus back — so the window it just
    reopened is pinned, and the very next press had nothing to act on. The key
    worked once and then went dead.

    A bind is also the game's rather than the app's, so whether it is even
    delivered while the app is holding the keyboard is the client's business.
    Gating on a state we cannot bring about, to guard against a press that may
    never arrive, bought nothing and cost the toggle.

    So: open goes away, minimised comes back, and there is no third answer.
  */
  useTrigger(restoreTrigger ?? "", () => {
    if (restoreTrigger === null) return;
    if (phase === "minimised") restore();
    else if (phase === "open") minimise();
  });

  // Size and position are *derived* against the live viewport rather than
  // corrected after the fact, so a game resolution change can never leave the
  // window hanging off screen — there is no stale state to catch up.
  const [viewportWidth, viewportHeight] = useViewport();
  const ceiling = Math.min(
    maxWidth,
    viewportWidth - viewportMargin,
    (viewportHeight - viewportMargin) * aspect,
  );
  const width = clamp(requestedWidth, minWidth, ceiling);
  const height = heightFor(width);
  const position = origin && {
    x: clamp(origin.x, 0, viewportWidth - width),
    y: clamp(origin.y, 0, viewportHeight - height),
  };

  // Escape → pin is not handled here. It is the player's only way out of a
  // focused app, so it is installed by the boot script instead, where it works
  // even if this hook never runs. See bootstrap.ts.

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

  const startResize =
    (corner: WindowCorner) => (event: React.PointerEvent<HTMLElement>) => {
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
    const fromY = (north ? anchor.y - event.clientY : event.clientY - anchor.y) * aspect;

    // The anchored corner is fixed, so the gap between it and the viewport edge
    // is a hard ceiling on how far the window can grow this gesture.
    const reach = Math.min(
      ceiling,
      west ? anchor.x : viewportWidth - anchor.x,
      (north ? anchor.y : viewportHeight - anchor.y) * aspect,
    );

    const next = clamp(Math.max(fromX, fromY), minWidth, reach);
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
  const fallbackWidth = `var(${GEOMETRY_VARS.width}, ${DEFAULT_WINDOW_SETTINGS.windowWidth}px)`;
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
        height: `calc(${fallbackWidth} / ${aspect})`,
        left: `var(${GEOMETRY_VARS.left}, 50%)`,
        top: `var(${GEOMETRY_VARS.top}, 50%)`,
        transform: `var(${GEOMETRY_VARS.transform}, translate(-50%, -50%))`,
      };

  /*
    Minimised, the frame is hidden in place rather than taken down — but only
    once the exit has played, which is why this reads `phase` and not "is it
    minimised". Inline rather than a `hidden` class: the element already carries
    `flex`, and two utilities setting `display` on one element are settled by
    whichever Tailwind happened to emit last, which is not something a component
    gets to decide. A style attribute simply wins.
  */
  const style: React.CSSProperties =
    phase === "minimised" ? { ...frameStyle, display: "none" } : frameStyle;

  /**
   * The frame is taken down when the exit finishes rather than on a timer, so
   * the two cannot drift apart when the duration changes — including the 1ms it
   * drops to under reduced motion, which still fires this.
   *
   * Guarded on the target because everything inside the window bubbles its
   * animations through here: a refresh icon's spin, a balance rolling in the
   * titlebar, a modal landing. Without it, refreshing the page would minimise it.
   */
  const onAnimationEnd = (event: React.AnimationEvent<HTMLElement>) => {
    if (event.target !== event.currentTarget) return;
    if (phase === "minimising") setPhase("minimised");
    else if (phase === "restoring") setPhase("open");
  };

  return {
    frameRef,
    style,
    phase,
    dragging,
    refreshing,
    /** False until stored settings have been read — dim the controls until then. */
    ready,
    onAnimationEnd,
    /** Spread onto the draggable titlebar. */
    titlebar: {
      onPointerDown: startDrag,
      onPointerMove: onDrag,
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
    },
    /** Spread onto each corner grip. */
    grip: (corner: WindowCorner) => ({
      onPointerDown: startResize(corner),
      onPointerMove: onResize,
      onPointerUp: endResize,
      onPointerCancel: endResize,
    }),
    restore,
    minimise,
    hide,
    refresh,
  };
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
