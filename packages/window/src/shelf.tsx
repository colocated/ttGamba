"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
// Deep imports, not the package root — see ./next-config.ts. The `Icon` type is
// safe to take from the barrel: types are erased, so nothing is pulled in.
import type { Icon } from "@phosphor-icons/react";

import { NamedIcon } from "./icon";

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
        onFocus={() => setHovered(true)}
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
              <ShelfLink item={item} open={open} fallbackIcon={fallbackIcon} />
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
                <ShelfLink item={item} open={open} fallbackIcon={fallbackIcon} />
              </li>
            ))}
          </ul>
        )}
      </nav>
    </div>
  );
}

function ShelfLink({
  item,
  open,
  fallbackIcon,
}: {
  item: ShelfItem;
  open: boolean;
  fallbackIcon?: Icon;
}) {
  const pathname = usePathname();
  // Sub-routes count as the section being open — a section's tabs are pages of
  // their own, and the shelf should not go dark the moment one is opened.
  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      title={open ? undefined : item.label}
      className={`flex items-center gap-2.5 rounded-control px-2.5 py-2 text-sm transition-colors duration-120 ease-out ${
        active ? "bg-tone-3 font-medium text-ink" : "text-ink-soft hover:bg-tone-2 hover:text-ink"
      }`}
    >
      <ShelfGlyph icon={item.icon} active={active} fallbackIcon={fallbackIcon} />
      <Label open={open}>{item.label}</Label>
    </Link>
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
