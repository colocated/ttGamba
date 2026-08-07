"use client";

// Deep imports, not the package root: the barrel is ~3000 icon modules and
// pulls all of them. See `withUserApp` in @tt/window/next-config.
import { GameControllerIcon } from "@phosphor-icons/react/dist/csr/GameController";
import { GearSixIcon } from "@phosphor-icons/react/dist/csr/GearSix";
import { ShieldStarIcon } from "@phosphor-icons/react/dist/csr/ShieldStar";
import { VaultIcon } from "@phosphor-icons/react/dist/csr/Vault";
import { Shelf } from "@tt/window";

import { useRail } from "@/lib/rail";
import { useStaff } from "@/lib/staff";

/**
 * ttGamba's shelf: the games on top, the ways out of them underneath.
 *
 * `Shelf` itself is the window's — the collapsing drawer, the hover, the active
 * state. This is only what goes in it, which for this app is a database read
 * rather than a list.
 */
export function GameShelf({ pinned }: { pinned: boolean }) {
  /*
    The shelf is on screen on every page, which makes it the right place to
    watch the role from: the hook re-reads it on each navigation, so clicking
    around anywhere in the app is what makes a revoked banker role take effect
    — including the entry below disappearing. See lib/staff.ts.
  */
  const { staff, admin } = useStaff();

  /*
    The games are rows rather than a constant, so the top half of the shelf
    arrives a beat after the bottom half. Nothing is drawn in the meantime —
    not a row of placeholders — because the icons themselves are fetched by
    name and land over the same beat, so a skeleton would be a second thing
    flickering rather than a way of hiding the first.
  */
  const { games } = useRail();

  return (
    <Shelf
      pinned={pinned}
      label="Games"
      /* Every entry in the top list is a game, so a game is what a bad icon name draws as. */
      fallbackIcon={GameControllerIcon}
      primary={(games ?? []).map((game) => ({
        href: `/play/${game.slug}`,
        icon: game.icon,
        label: game.name,
      }))}
      secondary={[
        /*
          Above the desk, and narrower than it: the tools are for whoever
          maintains the app, not for whoever works the queue. Same caveat as
          below about hiding versus protecting, with the difference spelled out
          in components/admin/shell.tsx — nothing behind these tabs reaches the
          server at all.
        */
        admin ? { href: "/admin", icon: ShieldStarIcon, label: "Admin Tools" } : null,
        /*
          Above settings, and only for staff. Hiding it is presentation, not
          protection — everything behind it re-checks the role server-side on
          every call (lib/auth.ts), so a player who guesses the address gets a
          closed door rather than a desk.
        */
        staff ? { href: "/banker", icon: VaultIcon, label: "Banker Menu" } : null,
        { href: "/settings", icon: GearSixIcon, label: "Settings" },
      ]}
    />
  );
}
