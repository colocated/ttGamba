"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
// Deep imports, not the package root — see ./next-config.ts. The `Icon` type is
// safe to take from the barrel: types are erased, so nothing is pulled in.
import type { Icon } from "@phosphor-icons/react";

import { NamedIcon } from "./icon";
import { Tooltip } from "./tooltip";

/** Collapsed: an icon ladder. Expanded: icons plus labels. */
const RAIL = 52;
const DRAWER = 188;
/** Rows keep their expanded width so labels clip rather than reflow. */
const ROW_WIDTH = DRAWER - 16;

export type ShelfItem = {
  href: string;
  /**
   * A component for an entry whose glyph is known when the app is written, and
   * a name for one that is not — an icon an administrator typed, say. See
   * ./icon.tsx for why the two are loaded differently.
   */
  icon: Icon | string;
  label: string;
};

/**
 * The side shelf. It rests as a bare icon ladder on the same surface as the
 * stage — nothing distinguishes the two until there is a reason to look — and
 * draws out on hover to show labels.
 *
 * Unpinned, the drawer floats over the stage. Pinned — via the toggle in the
 * titlebar — it holds a column of its own and the stage narrows to make room.
 *
 * Both lists take `null`s and drop them, so a caller can write
 * `staff ? { ... } : null` inline rather than assembling an array first. An
 * entry hidden that way is *presentation*: whatever it leads to still has to
 * refuse the request server-side.
 */
export function Shelf({
  pinned,
  primary = [],
  secondary = [],
  label = "Sections",
  fallbackIcon,
  onNavigate,
}: {
  pinned: boolean;
  /** The top list — whatever this app is mostly for. */
  primary?: readonly (ShelfItem | null | undefined)[];
  /** The bottom list, under a hairline. Settings, tools, the way out. */
  secondary?: readonly (ShelfItem | null | undefined)[];
  /** Names the navigation for anyone who cannot see it. */
  label?: string;
  /** Drawn for a string icon that turns out not to name one. See ./icon.tsx. */
  fallbackIcon?: Icon;
  /**
   * Asked before the shelf navigates anywhere. Return `false` to stop it.
   *
   * For an app where leaving a page *costs* something — a seat at a table, a
   * half-finished form — and the player should be asked first. The shelf has
   * no way of knowing that and does not try to: it asks, and an app that
   * answers `false` has taken the decision over and is responsible for
   * navigating itself if the player agrees.
   *
   * It is asked for the entry the player is already on as well. Clicking the
   * section you are in is ordinarily a no-op, but for an app that can be
   * somewhere *within* a section — at a table inside a game — it is how a
   * player asks to go back up, and swallowing it here would make that
   * impossible to offer.
   *
   * A modifier-click is left alone. Opening a link in a new tab or window is
   * the browser's, not the app's, and it navigates nothing here.
   */
  onNavigate?: (item: ShelfItem) => boolean;
}) {
  const [hovered, setHovered] = useState(false);
  const open = pinned || hovered;

  const top = primary.filter(Boolean) as ShelfItem[];
  const bottom = secondary.filter(Boolean) as ShelfItem[];

  return (
    // The spacer: this is what the stage is measured against. Only pinning
    // changes it, so hovering never reflows the page underneath.
    <div
      className="relative z-10 shrink-0 transition-[width] duration-220 ease-out"
      style={{ width: pinned ? DRAWER : RAIL }}
    >
      <nav
        aria-label={label}
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => setHovered(false)}
        /*
          Focus opens the drawer for somebody tabbing through it, who has no
          pointer to hover with and would otherwise be reading a column of
          unlabelled icons.

          It has to be *keyboard* focus, and that is not a detail. Focus also
          arrives here without anybody asking: a modal returns it to whatever
          opened it when it closes (overlay.tsx), so dismissing a dialog
          launched from one of these links hands focus back to that link — and
          the drawer would slide open with no pointer anywhere near it, and
          nothing to ever fire `pointerleave` and close it again. It sat open
          until the shelf was hovered and unhovered to clear it.

          `:focus-visible` is exactly this distinction, already worked out by
          the browser: focus restored after a mouse interaction does not match
          it, focus that arrived by Tab does.
        */
        onFocus={(event) => {
          if (byKeyboard(event.target)) setHovered(true);
        }}
        onBlur={() => setHovered(false)}
        style={{ width: open ? DRAWER : RAIL }}
        className={`absolute inset-y-0 left-0 flex flex-col justify-between gap-4 overflow-hidden border-r p-2 transition-[width,background-color,border-color] duration-220 ease-out ${
          // Only the floating drawer needs a backing of its own; pinned, it is
          // part of the same surface as the stage.
          open && !pinned ? "border-edge bg-drawer" : "border-transparent"
        }`}
      >
        {/*
          Always rendered, even empty, so the bottom list stays pinned to the
          bottom — `justify-between` needs something above it to push against.
        */}
        <ul className="flex flex-col gap-0.5" style={{ width: ROW_WIDTH }}>
          {top.map((item) => (
            <li key={item.href}>
              <ShelfLink
                item={item}
                open={open}
                fallbackIcon={fallbackIcon}
                onNavigate={onNavigate}
              />
            </li>
          ))}
        </ul>

        {bottom.length > 0 && (
          <ul
            className="flex flex-col gap-0.5 border-t border-edge pt-2"
            style={{ width: ROW_WIDTH }}
          >
            {bottom.map((item) => (
              <li key={item.href}>
                <ShelfLink
                item={item}
                open={open}
                fallbackIcon={fallbackIcon}
                onNavigate={onNavigate}
              />
              </li>
            ))}
          </ul>
        )}
      </nav>
    </div>
  );
}

/**
 * Whether a focus landed on something because a person was navigating with the
 * keyboard, as opposed to being handed there by the page.
 *
 * The whole of the judgement is the browser's. `:focus-visible` is the same
 * rule it uses to decide whether to paint a focus ring, and it already knows
 * what the last interaction was — asking it is both less code and more correct
 * than tracking key presses here.
 */
function byKeyboard(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  try {
    return target.matches(":focus-visible");
  } catch {
    // A browser that does not know the selector throws rather than answering
    // false. Treating every focus as keyboard focus is what this replaced, so
    // falling back to it costs nothing there and keeps the drawer reachable.
    return true;
  }
}

function ShelfLink({
  item,
  open,
  fallbackIcon,
  onNavigate,
}: {
  item: ShelfItem;
  open: boolean;
  fallbackIcon?: Icon;
  onNavigate?: (item: ShelfItem) => boolean;
}) {
  const pathname = usePathname();
  // Sub-routes count as the section being open — a section's tabs are pages of
  // their own, and the shelf should not go dark the moment one is opened.
  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

  return (
    /*
      No label on screen at all while the shelf is collapsed to a rail of
      icons — `title={open ? undefined : item.label}` is doing real work
      here, not decoration, which is exactly the case `Tooltip` exists for.
      `side="right"` would be more at home on a rail down the left edge, but
      this primitive only opens up or down — `bottom` is the safer of the two
      against the shelf's own top edge.
    */
    <Tooltip label={open ? null : item.label} side="bottom" className="w-full">
      <Link
        href={item.href}
        onClick={(event) => {
          if (!onNavigate) return;
          /*
            Modifier-clicks are the browser's. Ctrl, ⌘, shift and a middle button
            all mean "open this somewhere else", which navigates nothing here and
            is not something an app should be asked to confirm.
          */
          if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          if (onNavigate(item) === false) event.preventDefault();
        }}
        aria-current={active ? "page" : undefined}
        className={`flex items-center gap-2.5 rounded-control px-2.5 py-2 text-sm transition-colors duration-120 ease-out ${
          active ? "bg-tone-3 font-medium text-ink" : "text-ink-soft hover:bg-tone-2 hover:text-ink"
        }`}
      >
        <ShelfGlyph icon={item.icon} active={active} fallbackIcon={fallbackIcon} />
        <Label open={open}>{item.label}</Label>
      </Link>
    </Tooltip>
  );
}

/** Fills solid on the entry you are on, whichever way the glyph was named. */
function ShelfGlyph({
  icon,
  active,
  fallbackIcon,
}: {
  icon: Icon | string;
  active: boolean;
  fallbackIcon?: Icon;
}) {
  const weight = active ? "fill" : "regular";
  if (typeof icon === "string") {
    return (
      <NamedIcon
        name={icon}
        size={18}
        weight={weight}
        className="shrink-0"
        fallback={fallbackIcon}
      />
    );
  }

  const Glyph = icon;
  return <Glyph size={18} weight={weight} className="shrink-0" aria-hidden />;
}

/** Fades in slightly behind the drawer so labels don't appear mid-slide. */
function Label({ open, children }: { open: boolean; children: React.ReactNode }) {
  return (
    <span
      className={`truncate transition-opacity duration-150 ease-out ${
        open ? "opacity-100 delay-75" : "opacity-0"
      }`}
    >
      {children}
    </span>
  );
}
