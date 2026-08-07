"use client";

/**
 * The tabs across the top of a panel.
 *
 * Links rather than local state, so each tab is somewhere a player can be sent
 * and somewhere the back button understands. It also means switching tabs is a
 * navigation — which matters to an app that re-checks a role on one, since
 * clicking around is then what makes a revoked role take effect.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Count } from "./layout";

export type Tab = {
  href: string;
  label: string;
  /**
   * Match the path exactly. Only a section's index needs it: every other tab is
   * a prefix of nothing, but `/settings` is a prefix of all of them.
   */
  exact?: boolean;
  /** A figure worth carrying beside the label. Nothing is drawn at zero. */
  badge?: number;
  /** What that figure means, on hover. */
  badgeTitle?: string;
};

export function Tabs({ label, tabs }: { label: string; tabs: readonly Tab[] }) {
  const pathname = usePathname();

  return (
    <nav aria-label={label} className="-mb-px flex gap-1 overflow-x-auto border-b border-edge">
      {tabs.map((tab) => {
        const active = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);

        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={`flex shrink-0 items-center gap-2 border-b-2 px-3 py-2 text-sm transition-colors duration-120 ease-out ${
              active
                ? "border-felt-hi font-medium text-ink"
                : "border-transparent text-ink-soft hover:border-edge-strong hover:text-ink"
            }`}
          >
            {tab.label}
            {tab.badge ? <Count value={tab.badge} title={tab.badgeTitle} /> : null}
          </Link>
        );
      })}
    </nav>
  );
}
