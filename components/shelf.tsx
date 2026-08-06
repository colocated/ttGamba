"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
// Deep imports, not the package root — see next.config.ts. The `Icon` type is
// safe to take from the barrel: types are erased, so nothing is pulled in.
import type { Icon } from "@phosphor-icons/react";
import { GearSixIcon } from "@phosphor-icons/react/dist/csr/GearSix";
import { PokerChipIcon } from "@phosphor-icons/react/dist/csr/PokerChip";
import { RoadHorizonIcon } from "@phosphor-icons/react/dist/csr/RoadHorizon";
import { SpadeIcon } from "@phosphor-icons/react/dist/csr/Spade";
import { VaultIcon } from "@phosphor-icons/react/dist/csr/Vault";

import { GAMES, type Game } from "@/lib/games";
import { useStaff } from "@/lib/staff";

const ICONS: Record<Game["icon"], Icon> = {
  spade: SpadeIcon,
  "poker-chip": PokerChipIcon,
  road: RoadHorizonIcon,
};

/** Collapsed: an icon ladder. Expanded: icons plus labels. */
const RAIL = 52;
const DRAWER = 188;
/** Rows keep their expanded width so labels clip rather than reflow. */
const ROW_WIDTH = DRAWER - 16;

/**
 * The side shelf. It rests as a bare icon ladder on the same surface as the
 * stage — nothing distinguishes the two until there is a reason to look — and
 * draws out on hover to show labels.
 *
 * Unpinned, the drawer floats over the stage. Pinned — via the toggle in the
 * titlebar — it holds a column of its own and the stage narrows to make room.
 */
export function Shelf({ pinned }: { pinned: boolean }) {
  const [hovered, setHovered] = useState(false);
  const open = pinned || hovered;

  /*
    The shelf is on screen on every page, which makes it the right place to
    watch the role from: the hook re-reads it on each navigation, so clicking
    around anywhere in the app is what makes a revoked banker role take effect
    — including the entry below disappearing. See lib/staff.ts.
  */
  const { staff } = useStaff();

  return (
    // The spacer: this is what the stage is measured against. Only pinning
    // changes it, so hovering never reflows the page underneath.
    <div
      className="relative z-10 shrink-0 transition-[width] duration-220 ease-out"
      style={{ width: pinned ? DRAWER : RAIL }}
    >
      <nav
        aria-label="Games"
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
        <ul className="flex flex-col gap-0.5" style={{ width: ROW_WIDTH }}>
          {GAMES.map((game) => (
            <li key={game.id}>
              <ShelfLink
                href={game.href}
                icon={ICONS[game.icon]}
                label={game.name}
                open={open}
              />
            </li>
          ))}
        </ul>

        <ul className="flex flex-col gap-0.5 border-t border-edge pt-2" style={{ width: ROW_WIDTH }}>
          {/*
            Above settings, and only for staff. Hiding it is presentation, not
            protection — everything behind it re-checks the role server-side on
            every call (lib/auth.ts), so a player who guesses the address gets
            a closed door rather than a desk.
          */}
          {staff ? (
            <li>
              <ShelfLink href="/banker" icon={VaultIcon} label="Banker Menu" open={open} />
            </li>
          ) : null}
          <li>
            <ShelfLink href="/settings" icon={GearSixIcon} label="Settings" open={open} />
          </li>
        </ul>
      </nav>
    </div>
  );
}

function ShelfLink({
  href,
  icon: Glyph,
  label,
  open,
}: {
  href: string;
  icon: Icon;
  label: string;
  open: boolean;
}) {
  const pathname = usePathname();
  // Sub-routes count as the section being open — the banker desk's tabs are
  // pages of their own, and the shelf should not go dark the moment one is
  // opened.
  const active = pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      title={open ? undefined : label}
      className={`flex items-center gap-2.5 rounded-control px-2.5 py-2 text-sm transition-colors duration-120 ease-out ${
        active ? "bg-tone-3 font-medium text-ink" : "text-ink-soft hover:bg-tone-2 hover:text-ink"
      }`}
    >
      <Glyph size={18} weight={active ? "fill" : "regular"} className="shrink-0" aria-hidden />
      <Label open={open}>{label}</Label>
    </Link>
  );
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
