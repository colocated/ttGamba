"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
// Deep imports, not the package root: the barrel is ~3000 icon modules and
// pulls all of them. See `withUserApp` in @tt/window/next-config.
import { GameControllerIcon } from "@phosphor-icons/react/dist/csr/GameController";
import { GearSixIcon } from "@phosphor-icons/react/dist/csr/GearSix";
import { ShieldStarIcon } from "@phosphor-icons/react/dist/csr/ShieldStar";
import { VaultIcon } from "@phosphor-icons/react/dist/csr/Vault";
import { Overlay, Shelf, useClose, type ShelfItem } from "@tt/window";

import { Button } from "@/components/banker/ui";
import { useHeldTable } from "@/lib/leaving";
import { useRail } from "@/lib/rail";
import { useStaff } from "@/lib/staff";

/**
 * ttGamba's shelf: the games on top, the ways out of them underneath.
 *
 * `Shelf` itself is the window's — the collapsing drawer, the hover, the active
 * state. This is only what goes in it, which for this app is a database read
 * rather than a list, and what happens when it is clicked from a table.
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

  const router = useRouter();
  const pathname = usePathname();

  /**
   * The table the player is at, if they are at one.
   *
   * Registered by whichever engine is on screen (lib/leaving.ts). `null` for
   * every other page in the app, which is why the shelf behaves exactly as it
   * always did outside a game.
   */
  const held = useHeldTable();

  /**
   * Where they asked to go, while they are being asked whether they mean it.
   *
   * ── This state, and only this state, decides whether the modal is up ──────
   * It used to be rendered on `asked && held`, and that was a loop with no way
   * out of it: confirming navigates, navigating unmounts the engine, the
   * engine's cleanup clears `held` — and the `Overlay` was torn down mid-exit,
   * so the `animationend` that calls `onClose` never fired and `asked` was
   * never cleared. Nothing looked wrong until the player came back to the game,
   * at which point the engine re-registered, `held` turned truthy again, and
   * the modal they had already answered was in front of them once more.
   * Forever.
   *
   * So the question owns its own lifetime, and everything it needs from the
   * table is read live rather than captured — a hand ending while the modal is
   * open has to change what the buttons promise.
   */
  const [asked, setAsked] = useState<ShelfItem | null>(null);

  return (
    <>
      <Shelf
        pinned={pinned}
        label="Games"
        /* Every entry in the top list is a game, so a game is what a bad icon name draws as. */
        fallbackIcon={GameControllerIcon}
        /*
          A seat is the one thing in this app that clicking the shelf can throw
          away, so it is the one thing the shelf asks about first. Anywhere else
          — and at a table for anyone who is only watching, who has nothing to
          give up — this answers `true` and the shelf navigates as it always
          has.
        */
        onNavigate={(item) => {
          if (!held) return true;
          setAsked(item);
          return false;
        }}
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

      {asked ? (
        <Overlay onClose={() => setAsked(null)} label="Leave the table?">
          <LeavingTable
            /*
              Read live, with the defaults a table that has gone away would
              leave behind. If the hold vanishes while the question is up — the
              poll stands them up, the table is swept — the modal degrades to
              the mildest version of itself and confirming simply navigates,
              which is the right answer for somebody who is no longer at a
              table anyway.
            */
            seated={held?.seated ?? false}
            midRound={held?.midRound ?? false}
            to={asked}
            /*
              Staying put is a destination too. Clicking the game you are
              already inside is how a player asks to go back up to its list of
              tables — there is no other control for it in the shelf — and it
              arrives here as a navigation to the route we are already on.
            */
            sameGame={pathname === asked.href}
            onConfirm={() => {
              const go = () => router.push(asked.href);
              if (held) held.leave(go);
              else go();
            }}
          />
        </Overlay>
      ) : null}
    </>
  );
}

/**
 * Asking whether they meant it.
 *
 * ── Why this is asked even when nothing is at stake ───────────────────────
 * It would be possible to skip the question between hands, when standing up
 * costs nothing but the chair. It is deliberately not skipped: a control that
 * asks sometimes and acts other times is one a player cannot build a habit
 * around, and the habit is the whole value of it. What changes with the state
 * of the table is what the confirmation *promises*, not whether it appears.
 */
function LeavingTable({
  seated,
  midRound,
  to,
  sameGame,
  onConfirm,
}: {
  /** In a chair, rather than standing at the rail. Decides what leaving costs. */
  seated: boolean;
  midRound: boolean;
  to: ShelfItem;
  sameGame: boolean;
  onConfirm: () => void;
}) {
  // Never the parent's `onClose` — that would skip the exit animation. See the
  // note at the top of @tt/window's overlay.tsx.
  const close = useClose();

  /*
    The button says what will actually happen, in the player's own terms.
    Mid-hand it is a promise about later, which is the one case where "yes"
    does not mean "now" — and saying so on the button is cheaper than a line of
    explanation nobody reads.
  */
  const label = midRound
    ? sameGame
      ? "Yes, leave after this hand"
      : `Yes, go to ${to.label} after this hand`
    : sameGame
      ? "Yes, back to the tables"
      : `Yes, go to ${to.label}`;

  /*
    Three situations and three different things at stake, so three sentences.
    A spectator has nothing to give up at all, and telling them their seat goes
    back to the table describes something that is simply not happening — which
    is worse than saying nothing, because it makes them hesitate over a
    decision that costs them nothing.
  */
  const what = !seated
    ? "You are only watching this one, so there is nothing to give up. It carries on without you either way."
    : midRound
      ? "Your seat is held until this hand finishes, and given up as soon as it does. The hand plays out either way — nothing you have staked on it is lost by leaving."
      : "Your seat goes back to the table for somebody else. You can sit down again whenever there is room.";

  return (
    <div className="flex flex-col gap-4 p-5">
      <div className="flex flex-col gap-2">
        <h2 className="text-base font-semibold tracking-tight">Leave the table?</h2>
        <p className="text-sm text-ink-soft">{what}</p>
      </div>

      <div className="flex flex-wrap justify-end gap-2">
        <Button onClick={close}>Stay at the table</Button>
        <Button
          tone="stop"
          onClick={() => {
            /*
              Told before dismissed. `leave` may unmount this whole subtree the
              moment it is called — it navigates — and a `close` after that
              would be setting state on something that has gone.
            */
            onConfirm();
            close();
          }}
        >
          {label}
        </Button>
      </div>
    </div>
  );
}
