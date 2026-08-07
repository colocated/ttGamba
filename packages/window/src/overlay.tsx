"use client";

/**
 * Things that cover the window.
 *
 * A modal here cannot be `fixed`. The app is handed the entire game viewport
 * and draws a small floating window inside it, so anything positioned against
 * the viewport would black out the player's view of the world and put a scrim
 * over parts of the screen the app does not own. It also cannot simply be
 * `absolute` inside the page: the stage is a scroll container, so `inset-0`
 * there covers the scrolled *content* rather than what is on screen, and a
 * modal opened halfway down a list would appear somewhere above it.
 *
 * So the frame carries a host of its own, sized to the window, and modals are
 * portalled into it. `OverlayHost` is rendered once by the tablet;
 * `Overlay` is what a feature reaches for.
 *
 * ── Leaving ───────────────────────────────────────────────────────────────
 * A modal animates both ways, which means the moment it is dismissed and the
 * moment it stops existing are no longer the same moment. `Overlay` owns the
 * gap: every close runs through it, it plays the exit, and only then does it
 * tell the parent — whose `onClose` still means what it always did, "take this
 * off the page".
 *
 * The consequence for anything rendered inside one: call `useClose`, never the
 * `onClose` you passed in. Reaching past the overlay to the parent's own
 * handler skips the animation, and it is the sort of thing that works when it
 * is written and looks like a rendering bug three months later.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { createContext, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { XIcon } from "@phosphor-icons/react/dist/csr/X";

const OVERLAY_ID = "tt-overlay";

/**
 * How anything inside a modal asks to be let out.
 *
 * It exists because of the exit animation. The parent's `onClose` unmounts the
 * modal on the spot, which is the right thing for it to mean — but it cannot
 * be what a close button calls any more, or the panel would vanish rather than
 * leave. This is the animated way, and `Overlay` calls the parent's `onClose`
 * once the panel has actually gone.
 *
 * The default is a no-op so that calling it outside a modal is inert rather
 * than a crash. Nothing should, but a component that can be rendered both in
 * and out of one should not have to know which it is in.
 */
const CloseContext = createContext<() => void>(() => {});

/** Dismiss the modal this is inside, animation and all. */
export function useClose(): () => void {
  return useContext(CloseContext);
}

/**
 * The layer modals land in. Rendered by the tablet inside the window frame, so
 * it inherits exactly the window's bounds.
 *
 * Transparent and inert until something is portalled in — `pointer-events-none`
 * is what keeps it from swallowing every click on the app underneath, and each
 * overlay turns them back on for itself.
 */
export function OverlayHost() {
  return <div id={OVERLAY_ID} className="pointer-events-none absolute inset-0 z-40" />;
}

/**
 * A modal over the window.
 *
 * ── Escape ────────────────────────────────────────────────────────────────
 * Escape is already spoken for: the boot script binds it to `pin`, handing
 * control back to the game, and that binding is deliberately installed outside
 * React so it survives the app failing (lib/bootstrap.ts). It must keep
 * working — but while a modal is open, Escape means "close this".
 *
 * The listener below is registered in the *capture* phase on `window`, so it
 * runs before the boot script's bubble-phase listener on the same target, and
 * `stopPropagation` keeps the event from ever reaching it. Close the modal and
 * the app-level binding is back, untouched.
 * ─────────────────────────────────────────────────────────────────────────
 */
export function Overlay({
  onClose,
  label,
  focus,
  children,
}: {
  onClose: () => void;
  /** Names the dialog for anyone who cannot see its heading. */
  label: string;
  /**
   * Where focus should land, for a modal that exists to be typed into. Left
   * alone it is the panel itself, which is right for one that is read before it
   * is acted on — landing on a control there would skip past what it says.
   */
  focus?: React.RefObject<HTMLElement | null>;
  children: React.ReactNode;
}) {
  const host = useHost();
  const panel = useRef<HTMLDivElement>(null);
  /**
   * The modal is on its way out. Every route to a closed modal — Escape, the
   * scrim, a close button, a form that has finished — sets this rather than
   * calling `onClose`, so all of them leave the same way.
   */
  const [leaving, setLeaving] = useState(false);

  const close = useCallback(() => setLeaving(true), []);

  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      close();
    };

    window.addEventListener("keydown", escape, true);
    return () => window.removeEventListener("keydown", escape, true);
  }, [close]);

  // Move focus in, and put it back where it was on the way out — otherwise
  // closing a modal opened from a list leaves focus on the document body and
  // the next Tab starts again from the top of the page.
  //
  // This runs after the children's own effects, which is why a field cannot
  // simply claim focus for itself on mount — whatever it did would be undone
  // here a moment later. Hence `focus`.
  useEffect(() => {
    const returnTo = document.activeElement as HTMLElement | null;
    (focus?.current ?? panel.current)?.focus();
    return () => returnTo?.focus?.();
  }, [focus]);

  if (!host) return null;

  return createPortal(
    <div
      className={`absolute inset-0 flex items-center justify-center p-6 ${
        // Inert on the way out. The panel is still on screen for the length of
        // the animation, and a press landing on a modal that has already been
        // dismissed would act on something the player has finished with.
        leaving ? "pointer-events-none" : "pointer-events-auto"
      }`}
    >
      {/*
        The scrim. A press on it closes, which is the shortcut everyone
        already knows; it is `aria-hidden` because the same escape is on the
        keyboard and a screen reader does not need a second copy of it.
      */}
      <button
        type="button"
        aria-hidden
        tabIndex={-1}
        onClick={close}
        className={`absolute inset-0 cursor-default bg-tone-0/70 ${
          leaving ? "animate-scrim-out" : "animate-scrim"
        }`}
      />

      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        /*
          The unmount is hung off the animation finishing rather than a timer,
          so the two cannot drift apart when the duration changes — including
          the 1ms it drops to under reduced motion, which still fires this.

          Guarded on the target because animations *inside* the panel bubble
          through here too: a balance rolling in an open modal would otherwise
          close it.
        */
        onAnimationEnd={(event) => {
          if (!leaving || event.target !== event.currentTarget) return;
          onClose();
        }}
        className={`relative flex max-h-full w-full max-w-xl flex-col overflow-hidden rounded-panel border border-edge-strong bg-raised outline-none ${
          leaving ? "animate-sheet-out" : "animate-sheet"
        }`}
      >
        <CloseContext.Provider value={close}>{children}</CloseContext.Provider>
      </div>
    </div>,
    host,
  );
}

/**
 * The dismiss control in a modal's header.
 *
 * Here rather than in each modal because it has to go through `useClose` to
 * animate, and a close button that quietly bypasses that is exactly the bug
 * this file is arranged to prevent.
 */
export function CloseButton() {
  const close = useClose();

  return (
    <button
      type="button"
      onClick={close}
      title="Close"
      className="shrink-0 cursor-pointer rounded-control p-1 text-ink-muted transition-colors duration-120 ease-out hover:bg-tone-2 hover:text-ink"
    >
      <XIcon size={16} aria-hidden />
      <span className="sr-only">Close</span>
    </button>
  );
}

/**
 * The host element, once there is a document to find it in.
 *
 * A store rather than state set from an effect: the element is not React's to
 * own, it never changes for the life of the page, and reading it on the first
 * client render means the modal portals immediately rather than a frame late.
 * The empty subscribe is honest — there is nothing to be notified about.
 *
 * `getElementById` returns the same node on every call, so repeat reads give an
 * identical snapshot and never look like a change.
 */
function useHost(): HTMLElement | null {
  return useSyncExternalStore(
    () => () => {},
    () => document.getElementById(OVERLAY_ID),
    () => null,
  );
}
