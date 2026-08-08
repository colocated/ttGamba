/**
 * A tooltip, drawn rather than borrowed.
 *
 * No `"use client"` — nothing here is a client-only hook (`useId` runs on the
 * server fine), and the reveal is CSS. Marking it client-only would force a
 * boundary onto every server-rendered page furniture piece that uses one
 * (`Count`, `TitlebarLink`) for no reason this component actually needs.
 *
 * ── Why this exists at all ─────────────────────────────────────────────────
 * The window is not a tab in a browser. It is an iframe handed a game
 * client's whole viewport (see the workspace README, "What must not
 * change") — there is no browser chrome around it, and nothing here can
 * assume one exists. The native `title` attribute depends on that chrome to
 * draw anything: it is the *browser's* tooltip, rendered by the browser,
 * outside the page. Ask for it here and the browser side of that contract is
 * missing, so nothing appears. Same story for a native `<select>`'s dropdown,
 * `alert`, `confirm`, `prompt` — anything that is normally the platform's job
 * to draw around the page is a job every app built on this window has to do
 * for itself instead. This is that job, done once.
 *
 * It lives here and not in an app because the problem is the window's, not
 * any one app's — every app this frame ever holds inherits the same missing
 * browser chrome. `Count` and `TitlebarLink` in this package both needed it
 * before a second app existed to share it with.
 *
 * ── Why it is CSS and not a portal ─────────────────────────────────────────
 * `:hover` and `:focus-visible` already know when to show this and when to
 * take it away, including every dismissal case a hand-rolled version would
 * have to reinvent — the mouse leaves, focus moves on, the element scrolls
 * out from under the pointer. Building that in React means a listener, a
 * timer and a cleanup path for each. This has none of that, and nothing here
 * can be left open by a component unmounting mid-animation, because there is
 * no state to be caught holding.
 *
 * The trade is that it cannot escape its own stacking context or measure
 * whether it has room — it always opens toward `side` and never flips. Fine
 * for a label a couple of words long living beside the thing it describes,
 * which is the only kind of tooltip this window has ever needed; a menu or a
 * panel is a different control and belongs in `Overlay`, not here.
 *
 * ── Why the trigger is cloned rather than wrapped ──────────────────────────
 * Wrapping the trigger in a second focusable element would give a button its
 * own tooltip *and* a redundant tab stop in front of it that does nothing on
 * its own. Cloning the single child instead means there is only ever one
 * focusable thing here: whatever was handed in, made focusable if it was not
 * one already. `:has(:focus-visible)` on the wrapper is what reads that
 * child's own focus state back out, so the reveal works identically whether
 * the trigger was a `<button>` all along or a bare `<span>` this made one of.
 */

import { cloneElement, isValidElement, useId, type ReactElement } from "react";

/** Tags the platform already made focusable — these keep their own tab stop. */
const FOCUSABLE_TAGS = new Set(["a", "button", "input", "select", "textarea"]);

const SIDE = {
  top: "bottom-full left-1/2 mb-2 -translate-x-1/2",
  bottom: "top-full left-1/2 mt-2 -translate-x-1/2",
} as const;

export function Tooltip({
  label,
  side = "top",
  className = "",
  children,
}: {
  /**
   * The supplementary text. Kept to a few words — this is a tooltip, not a
   * panel. `null`/`undefined`/`""` renders no tooltip at all — a caller
   * whose text is conditional (a reason a button is disabled, say) can
   * always wrap unconditionally rather than branching on whether there is
   * one, and still get `className` applied to the same wrapper either way.
   */
  label?: string | null;
  side?: keyof typeof SIDE;
  /**
   * For the *wrapper*, not the trigger — the trigger keeps whatever classes
   * it already had. Only needed when the trigger is itself a sized flex
   * item (`flex-1`, and the like): that sizing belongs to whichever element
   * is the direct flex child, and wrapping the trigger in a plain `<span>`
   * moves that element one level up without moving the class that was
   * written for it. See `TallButton` in ttGamba's blackjack gutter.
   */
  className?: string;
  /** Exactly one element — see "Why the trigger is cloned rather than wrapped". */
  children: ReactElement<{
    tabIndex?: number;
    "aria-describedby"?: string;
  }>;
}) {
  const id = useId();

  if (!isValidElement(children)) return children;

  if (!label) {
    return className ? <span className={className}>{children}</span> : children;
  }

  const tag = typeof children.type === "string" ? children.type : null;
  const alreadyFocusable = tag !== null && FOCUSABLE_TAGS.has(tag);

  const trigger = cloneElement(children, {
    "aria-describedby": id,
    ...(alreadyFocusable ? {} : { tabIndex: children.props.tabIndex ?? 0 }),
  });

  return (
    <span className={`group/tooltip relative inline-block ${className}`}>
      {trigger}
      <span
        id={id}
        role="tooltip"
        className={`pointer-events-none absolute z-30 whitespace-nowrap rounded-control border border-edge-strong bg-tone-0 px-2 py-1 text-xs font-medium leading-none text-ink opacity-0 scale-95 transition-[opacity,scale] duration-120 ease-out group-hover/tooltip:opacity-100 group-hover/tooltip:scale-100 group-has-[:focus-visible]/tooltip:opacity-100 group-has-[:focus-visible]/tooltip:scale-100 ${SIDE[side]}`}
      >
        {label}
      </span>
    </span>
  );
}
