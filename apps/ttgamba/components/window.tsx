"use client";

import { PokerChipIcon } from "@phosphor-icons/react/dist/csr/PokerChip";
import { Odometer, Tablet, TitlebarLink } from "@tt/window";

import { refreshChips, useChips } from "@/lib/chips";
import { formatChipCount, formatChips } from "@/lib/format";
import { useSettings, updateSettings } from "@/lib/settings";
import { GameShelf } from "./shelf";

/**
 * ttGamba, as a window.
 *
 * Everything about how the window *behaves* is `@tt/window`. This is the four
 * things that are ttGamba's: what it is called, what its shelf holds, the one
 * figure worth carrying in the titlebar, and the fact that refreshing has to
 * re-read a balance as well as the page.
 */
export function Window({ children }: { children: React.ReactNode }) {
  const { settings } = useSettings();

  return (
    <Tablet
      appName="ttGamba"
      brand={
        <>
          tt<span className="text-felt-hi">Gamba</span>
        </>
      }
      /*
        The app's whole settings store, not a window-shaped slice of it. The
        window reads the three geometry fields and ignores the rest — see
        window-settings.ts for why it does not keep a store of its own.
      */
      useWindowSettings={useSettings}
      status={<ChipCount />}
      nav={(pinned) => <GameShelf pinned={pinned} />}
      navPinned={settings.shelfPinned}
      onNavPinnedChange={(shelfPinned) => updateSettings({ shelfPinned })}
      /*
        The chip balance is asked for once per app load and would otherwise sit
        on its cached figure. This is the only way a player has to pull in a
        deposit a banker just made.
      */
      onRefresh={refreshChips}
    >
      {children}
    </Tablet>
  );
}

/**
 * The chip balance, in the titlebar.
 *
 * It lives in the chrome rather than on a page because it is the one number
 * that is relevant on every one of them — a player mid-hand should not have to
 * leave the table to find out what they are playing with.
 *
 * A link, not a readout: settings is where the deposit lives, and a balance a
 * player is unhappy with should be one press away from the thing that changes
 * it. The figure itself comes from a store shared with that page, so opening it
 * costs nothing (lib/chips.ts).
 */
function ChipCount() {
  const { chips, failed } = useChips();

  return (
    <TitlebarLink
      href="/settings"
      title={
        chips === null
          ? failed
            ? "Chip balance unavailable"
            : "Reading your chip balance"
          : `${formatChips(chips)} — open settings to deposit`
      }
      // Unknown is not zero, and a dash in the currency colour reads like a
      // balance rather than the absence of one.
      className={chips === null ? "text-ink-muted" : "text-chip"}
    >
      <PokerChipIcon size={13} weight="fill" aria-hidden />
      {/* The glyph names the unit for anyone who can see it; this is the rest. */}
      {chips === null ? <span>—</span> : <Odometer value={chips} format={formatChipCount} />}
      <span className="sr-only">chips</span>
    </TitlebarLink>
  );
}
