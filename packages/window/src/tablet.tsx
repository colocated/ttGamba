"use client";

import Link from "next/link";
// Deep imports, not the package root: the barrel is ~3000 icon modules and
// pulls all of them. Apps must also set `optimizePackageImports` — see
// `withUserApp` in ./next-config.ts.
import { ArrowClockwiseIcon } from "@phosphor-icons/react/dist/csr/ArrowClockwise";
import { DotsSixVerticalIcon } from "@phosphor-icons/react/dist/csr/DotsSixVertical";
import { MinusIcon } from "@phosphor-icons/react/dist/csr/Minus";
import { PushPinIcon } from "@phosphor-icons/react/dist/csr/PushPin";
import { TriangleIcon } from "@phosphor-icons/react/dist/csr/Triangle";
import { XIcon } from "@phosphor-icons/react/dist/csr/X";

import { usePlayer } from "@tt/userapp/gamedata";

import { InstallGuide } from "./install-guide";
import { OverlayHost } from "./overlay";
import { UpdateBanner } from "./update-banner";
import { useWindowFrame, type WindowCorner, type WindowFrameOptions } from "./use-window-frame";

const CORNERS: Record<WindowCorner, { className: string; cursor: string }> = {
  nw: { className: "left-0 top-0", cursor: "cursor-nwse-resize" },
  ne: { className: "right-0 top-0", cursor: "cursor-nesw-resize" },
  sw: { className: "left-0 bottom-0", cursor: "cursor-nesw-resize" },
  se: { className: "right-0 bottom-0", cursor: "cursor-nwse-resize" },
};

export type TabletProps = WindowFrameOptions & {
  /**
   * What the window calls itself, in the titlebar and on the minimised tab.
   *
   * A node rather than a string so an app can set part of it in an accent
   * colour, which is what ttGamba does — the plain string case is just a string.
   * Whatever this renders as, it should stay short: it shares the titlebar with
   * the controls, and it is the only thing naming the tab in the corner of a
   * screen that may have five user apps loaded on it.
   */
  brand: React.ReactNode;
  /** Plain-text name, for `aria-label`s and the install guide's copy. */
  appName: string;
  /**
   * The side navigation, given whether the titlebar's pin is currently set.
   * `Shelf` is the built-in one; anything taking a `pinned` boolean will do.
   *
   * Omit it and there is no shelf and no pin control in the titlebar. An app
   * with one page has nothing to navigate.
   */
  nav?: (pinned: boolean) => React.ReactNode;
  /**
   * Whether the nav is held open. The window does not keep this itself — it is
   * a remembered preference, and the app already owns a settings store to
   * remember it in.
   */
  navPinned?: boolean;
  onNavPinnedChange?: (pinned: boolean) => void;
  /**
   * A readout in the titlebar, left of the controls — the one figure that is
   * relevant on every page. Only rendered once the game client has answered.
   */
  status?: React.ReactNode;
  children: React.ReactNode;
};

/**
 * The floating window every user app draws itself inside.
 *
 * This is a skin: the behaviour is `useWindowFrame`, and an app that wants a
 * different frame should reach for that rather than forking this. What is here
 * is the arrangement — a draggable titlebar, controls grouped by what they do,
 * the shelf and the stage side by side, and the overlay host inside the frame
 * so modals cover the window rather than the game behind it.
 */
export function Tablet({
  brand,
  appName,
  nav,
  navPinned = false,
  onNavPinnedChange,
  status,
  children,
  ...frameOptions
}: TabletProps) {
  /*
    Destructured rather than kept as one `frame` object: `useWindowFrame`
    returns `frameRef` alongside everything else, and `react-hooks/refs` treats
    any member access on an object holding a ref as reading a ref during render.
    Keep it whole and every `frame.phase` below is a lint error.
  */
  const {
    frameRef,
    style,
    phase,
    dragging,
    refreshing,
    ready,
    onAnimationEnd,
    titlebar,
    grip,
    restore,
    minimise,
    hide,
    refresh,
  } = useWindowFrame(frameOptions);

  /*
    Everything below the titlebar depends on the game client. Apps read the
    player out of it, and pages go on to look that player up — so without a
    client there is no page worth rendering, only a series of components
    discovering the same absence separately. The frame stays: it is the player's
    window, and the titlebar is how they close it.
  */
  const { connection } = usePlayer();

  return (
    <div className="fixed inset-0">
      <div
        ref={frameRef}
        style={style}
        /*
          ── Why the chrome suppresses hydration warnings ──────────────────────
          Everything about the frame and its controls is derived from `ready` —
          the geometry here, the disabled state on every button below. `ready` is
          false on the server and false again on the client's first render, so a
          cold load agrees with itself: the HTML carries `disabled=""` on all
          three controls and the var()-based fallback geometry, and that is
          exactly what the first client render asks for.

          What React reports instead is a *re-hydration*: `ready` flips true a
          tick after mount, the DOM is updated to match, and Fast Refresh then
          re-hydrates the subtree against a DOM that has already moved on. It
          fires on almost every edit to anything this file imports, it says
          nothing about the built app, and chasing it down costs more than it has
          ever been worth.

          The cost of silencing it: a genuine server/client divergence in the
          window geometry or the controls would now go unreported. Weighed
          against a warning that has never once been real, and worth remembering
          if this frame ever hydrates visibly wrong.
          ─────────────────────────────────────────────────────────────────────
        */
        suppressHydrationWarning
        onAnimationEnd={onAnimationEnd}
        className={`absolute flex flex-col overflow-hidden rounded-panel border border-edge-strong bg-stage ${
          phase === "minimising"
            ? "animate-window-out"
            : phase === "restoring"
              ? "animate-window-in"
              : ""
        }`}
      >
        <header
          {...titlebar}
          className={`flex shrink-0 touch-none select-none items-center gap-2 px-3 py-2.5 ${
            dragging ? "cursor-grabbing" : "cursor-grab"
          }`}
        >
          <DotsSixVerticalIcon size={16} weight="bold" className="text-ink-muted" aria-hidden />
          <span className="text-sm font-semibold tracking-tight">{brand}</span>

          {/*
            The window paints from the boot script's geometry before React has
            attached anything to it. `ready` is the moment the controls start
            working, and dimming them until then is the honest signal — the
            alternative is chrome that looks live and swallows presses.
          */}
          <div className="ml-auto flex items-center gap-2">
            {/* No client, no player, no readout — same condition as the pin. */}
            {connection === "connected" && status}

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
              {nav && connection === "connected" && (
                <ChromeButton
                  onClick={() => onNavPinnedChange?.(!navPinned)}
                  pressed={navPinned}
                  label={navPinned ? "Let the shelf collapse" : "Keep the shelf open"}
                  disabled={!ready}
                  className={navPinned ? "text-ink-soft" : "text-ink-muted"}
                >
                  <PushPinIcon size={16} weight={navPinned ? "fill" : "regular"} aria-hidden />
                </ChromeButton>
              )}
            </div>

            {/*
              The window controls, kept in a group of their own with a hairline
              in front of them. Refresh and the shelf toggle change what is in
              the window; these two take the window away, and a player reaching
              for one should not be able to hit the other by being a few pixels
              out. Minimise then close, in the order every desktop puts them.
            */}
            <div className="flex items-center gap-0.5 border-l border-edge pl-2">
              <ChromeButton
                onClick={minimise}
                label="Minimise to the corner"
                disabled={!ready}
                className="text-ink-muted"
              >
                <MinusIcon size={16} aria-hidden />
              </ChromeButton>

              <ChromeButton
                onClick={hide}
                label="Close — press F1 to bring it back"
                disabled={!ready}
                className="text-ink-muted"
              >
                <XIcon size={16} aria-hidden />
              </ChromeButton>
            </div>
          </div>
        </header>

        <UpdateBanner />

        <div className="relative flex min-h-0 flex-1">
          {connection === "connected" ? (
            <>
              {nav?.(navPinned)}
              {/* The stage — whichever page the nav selected renders in here. */}
              <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>
            </>
          ) : (
            // `waiting` renders nothing rather than a spinner. In game it lasts
            // a frame or two, and a loader that appears and leaves inside
            // 100ms is a flicker, not information.
            connection === "absent" && <InstallGuide appName={appName} />
          )}
        </div>

        {/*
          Where modals land. Inside the frame so they cover the window rather
          than the game behind it, and outside the stage's scroll container so
          they stay put when the page under them is scrolled. See overlay.tsx.
        */}
        <OverlayHost />

        {/*
          Corner grips. They sit above everything so a grip is never swallowed
          by the titlebar's drag handler or the shelf drawer.
        */}
        {(Object.keys(CORNERS) as WindowCorner[]).map((corner) => (
          <div
            key={corner}
            role="presentation"
            {...grip(corner)}
            className={`group absolute z-30 h-4 w-4 touch-none ${CORNERS[corner].className} ${CORNERS[corner].cursor}`}
          >
            {/* One corner carries the hint; finding it there teaches all four. */}
            {corner === "se" && <ResizeGrip />}
          </div>
        ))}
      </div>

      {/*
        Only once the window has finished leaving. The two never overlap, which
        is what makes the pair read as one object moving rather than two things
        crossfading — and it means neither has to be positioned against the
        other to sell it.
      */}
      {phase === "minimised" && (
        <MinimisedTab
          brand={brand}
          appName={appName}
          onOpen={restore}
          trigger={frameOptions.restoreTrigger}
        />
      )}
    </div>
  );
}

/**
 * What is left of the window when it is minimised.
 *
 * Bottom-right, because bottom-left is the minimap. That corner is occupied on
 * every player's screen for the whole time they are in the world, which makes
 * it the one place a persistent box cannot go — it is not a matter of taste,
 * and moving it back would cover the thing the player is steering by.
 *
 * It names the app because a player may have up to five user apps loaded at
 * once, and an unlabelled box in the corner of the screen is a thing to worry
 * about rather than a thing to press.
 *
 * ── The two ways back, and what each of them actually does ────────────────
 * Pressing this is the direct one, and it only works once the player has the
 * app's focus — minimising handed it to the game, and F1 is what takes it back.
 * That is the same F1 that reopens a closed app, so it is a key worth knowing
 * either way.
 *
 * The keybind is the other, and it works without focus, because a trigger is
 * data the client sends rather than a click the app receives. What it cannot do
 * is hand focus over: there is no command for that in the protocol — `pin` and
 * `close` both give focus away and nothing gives it back. So it restores the
 * window to the screen, and F1 is still what makes it clickable. That is
 * genuinely useful on its own: a glance at a balance without leaving the game.
 * ─────────────────────────────────────────────────────────────────────────
 */
function MinimisedTab({
  brand,
  appName,
  onOpen,
  trigger,
}: {
  brand: React.ReactNode;
  appName: string;
  onOpen: () => void;
  trigger?: string | null;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Open ${appName}`}
      /*
        Higher off the bottom edge than the window's own margin, because FiveM
        prints its build watermark — "FiveM (b3258) (Beta)" — along the bottom
        of the screen and at 16px the tab lands on top of it. That text is the
        client's, not ours, and covering it is not this app's call to make.
      */
      className="absolute bottom-12 right-4 flex animate-tab-in cursor-pointer items-center gap-2.5 rounded-panel border border-edge bg-drawer px-3 py-2 transition-colors duration-120 ease-out hover:border-edge-strong"
    >
      <span className="text-sm font-semibold tracking-tight">{brand}</span>

      {/* Nothing to promise if the app switched the keybind off. */}
      {trigger === null ? null : (
        <>
          <span className="h-4 w-px shrink-0 bg-edge" aria-hidden />

          <span className="flex items-center gap-1.5 text-xs text-ink-soft">
            Click or press
            {/*
              A keycap rather than the word. The bind is named Triangle after
              the shape, and the shape is what a player sees in the keybinds
              menu — but only after they have set it, which is why the title says
              where. It may well be unbound, and then this is the half of the
              hint that does nothing.

              Only the default bind has a glyph. Anything else an app registers
              is named rather than drawn, because there is no shape to draw.
            */}
            <span
              title={`${capitalise(trigger ?? "triangle")} — set the bind under Settings › Keybinds › FiveM`}
              className="inline-flex h-4 shrink-0 items-center justify-center rounded-chip border border-edge-strong bg-tone-3 px-1 text-[10px] text-ink"
            >
              {(trigger ?? "triangle") === "triangle" ? (
                <TriangleIcon size={9} weight="fill" aria-hidden />
              ) : (
                capitalise(trigger ?? "")
              )}
            </span>
            to open
          </span>
        </>
      )}
    </button>
  );
}

const capitalise = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

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
 * A titlebar control. Presses are kept off the titlebar's drag handler —
 * without that, clicking one would also start dragging the window.
 *
 * Exported because an app adding its own titlebar widget through `status` needs
 * it to behave like the built-in ones; `TitlebarLink` is the same thing for
 * something that navigates.
 */
export function ChromeButton({
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
      /*
        `disabled` is `!ready`, and this is the element React actually names when
        the frame re-hydrates. The flag does not cascade from the frame — it
        covers one element's own attributes and nothing below it — so it has to
        be repeated here. Reasoning in full on the frame in `Tablet`.
      */
      suppressHydrationWarning
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
 * A titlebar readout that navigates — a balance that opens the page where it can
 * be topped up, say. As `ChromeButton`, it keeps its presses off the drag
 * handler; without that, pressing it would also drag the window.
 */
export function TitlebarLink({
  href,
  title,
  className = "",
  children,
}: {
  href: string;
  title?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      onPointerDown={(event) => event.stopPropagation()}
      title={title}
      className={`flex items-center gap-1.5 rounded-chip border border-edge bg-tone-2 px-2 py-1 font-mono text-xs tabular-nums transition-colors duration-120 ease-out hover:bg-tone-3 ${className}`.trim()}
    >
      {children}
    </Link>
  );
}
