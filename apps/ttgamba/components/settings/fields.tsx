"use client";

/**
 * The pieces every settings tab is built out of.
 *
 * They live apart from any one tab because a settings page is a list of
 * labelled values however it is divided up, and a tab that invents its own
 * spacing for that is how two tabs stop looking like one page.
 */

import { useId } from "react";
import { CaretDownIcon } from "@phosphor-icons/react/dist/csr/CaretDown";

import { Panel } from "@/components/stage";

/** A titled panel. The heading is what a tab's sections are told apart by. */
export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Panel className="flex flex-col gap-3">
      <h2 className="text-sm font-medium">{title}</h2>
      {children}
    </Panel>
  );
}

/**
 * A section that stays shut until it is asked for.
 *
 * For the parts of settings that are read occasionally and are long when they
 * are open — a section like that costs every visit the scroll past it, whether
 * or not anyone wanted it. Closed, it is one row; the page above it stays where
 * a player expects to find it.
 *
 * Controlled, rather than holding its own open flag, because opening is not
 * only something the player does: the page can have a reason to show what just
 * landed in here. See `changed` in ./account.tsx.
 *
 * ── Why the drawer is a grid ──────────────────────────────────────────────
 * There is no animating to `height: auto`, and the content's height is not
 * something this knows — it is a list that grows. A one-row grid can be
 * transitioned from `0fr` to `1fr` instead, which resolves to exactly the
 * content's height at both ends, so the drawer slides to whatever is inside it
 * without anything measuring it first.
 *
 * The inner element must keep `overflow-hidden`: it is what allows the grid
 * item to be smaller than its content, and without it the row refuses to
 * collapse and the drawer never shuts. Padding goes *inside* that, too — on the
 * item itself it would survive the collapse and leave a gap under every closed
 * drawer.
 * ─────────────────────────────────────────────────────────────────────────
 */
export function Drawer({
  title,
  aside,
  open,
  onToggle,
  children,
}: {
  title: string;
  /**
   * What the header says while the drawer is shut. A section nobody can see
   * into has to be able to say it has something worth opening for — otherwise
   * hiding it is just hiding it.
   */
  aside?: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const panel = useId();

  return (
    <Panel className="flex flex-col">
      <h2 className="text-sm font-medium">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={panel}
          className="group flex w-full cursor-pointer items-center gap-2 text-left"
        >
          {/*
            Two elements, because the two changes run at different speeds: the
            caret turns with the drawer it describes, while its hover colour is
            a colour change like every other in the app, at 120ms (DESIGN.md).
          */}
          <span className="flex shrink-0 text-ink-muted transition-colors duration-120 ease-out group-hover:text-ink-soft">
            <CaretDownIcon
              size={14}
              weight="bold"
              aria-hidden
              className={`transition-transform duration-[var(--tt-drawer-time)] ease-out ${
                open ? "" : "-rotate-90"
              }`}
            />
          </span>
          {title}
          {aside ? <span className="ml-auto flex items-center">{aside}</span> : null}
        </button>
      </h2>

      <div
        id={panel}
        /*
          Shut, this is still on the page — it has to be, or there would be
          nothing to slide. `inert` is what keeps that from being a trap: no
          tab stop, nothing announced, so a closed drawer is closed to the
          keyboard and a screen reader as well as to the eye.
        */
        inert={!open}
        className={`grid transition-[grid-template-rows] duration-[var(--tt-drawer-time)] ease-out ${
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="overflow-hidden">
          <div className="pt-3">{children}</div>
        </div>
      </div>
    </Panel>
  );
}

/** `Field` is a `dt`/`dd` pair, so it needs a description list around it. */
export function Fields({ children }: { children: React.ReactNode }) {
  return <dl className="flex flex-col gap-3">{children}</dl>;
}

/**
 * One labelled value. `null` is not an error — most of these are unknown until
 * the client reports them, and some stay unknown forever (a player in no
 * faction, an account with no Discord linked).
 */
export function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  const empty = value === null || value === undefined || value === "";

  return (
    <div className="flex items-center justify-between gap-4 border-b border-edge/50 pb-3 last:border-0 last:pb-0">
      <dt className="text-sm text-ink-soft">{label}</dt>
      <dd className={`min-w-0 truncate text-sm ${mono ? "font-mono tabular-nums" : ""}`}>
        {empty ? <Pending /> : value}
      </dd>
    </div>
  );
}

/**
 * A value that is not there yet, or not there at all. One glyph for both,
 * because the page cannot tell them apart and inventing a spinner for the
 * first would make the second look broken.
 */
export function Pending({ wide }: { wide?: boolean }) {
  return (
    <span className={`text-ink-muted ${wide ? "text-base" : ""}`} aria-label="Unknown">
      —
    </span>
  );
}
