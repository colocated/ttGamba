"use client";

/**
 * The banker panel's frame: who is allowed in, and the tabs across the top.
 *
 * The guard here is presentation, not protection. Every function behind these
 * tabs re-reads the caller's role from the database before it does anything
 * (lib/auth.ts), so a page that has gone stale can ask for whatever it likes
 * and be refused. What this does is make sure a demoted banker stops being
 * *shown* a desk — see lib/staff.ts for how quickly, and why a reload is not
 * an option for making it happen.
 */

import { createContext, useCallback, useContext } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LockKeyIcon } from "@phosphor-icons/react/dist/csr/LockKey";

import { Panel, Stage, Tag } from "@/components/stage";
import { getDeskStats, type DeskStats } from "@/lib/banker";
import type { Caller } from "@/lib/desk";
import { ROLE_LABELS, ROLE_TONES } from "@/lib/desk";
import { useDeskCall, useStaff, type Query } from "@/lib/staff";

/**
 * How often the tab badges catch up with the queues behind them.
 *
 * A banker leaves this panel open and expects requests to appear in it. Slow
 * enough not to be chatty, quick enough that "nothing has come in" is a fact
 * rather than a guess — and it is only the counts that move, so nothing a
 * banker is reading is disturbed by it.
 */
const STATS_POLL = 20_000;

const TABS = [
  { href: "/banker", label: "Stats", exact: true },
  { href: "/banker/deposits", label: "Deposits", queue: "deposit" },
  { href: "/banker/withdrawals", label: "Withdrawals", queue: "withdrawal" },
  { href: "/banker/players", label: "Player Lookup" },
  { href: "/banker/audit", label: "Audit Log" },
] as const;

/**
 * The desk figures, fetched once for the whole panel.
 *
 * They are the tab badges *and* the front page, and fetching them in the shell
 * means the two are never a poll out of step with each other — and the stats
 * tab costs no query of its own.
 */
const StatsContext = createContext<Query<DeskStats> | null>(null);

export function useDeskStats(): Query<DeskStats> {
  const value = useContext(StatsContext);
  if (!value) throw new Error("useDeskStats is only available inside the banker shell");
  return value;
}

export function BankerShell({ children }: { children: React.ReactNode }) {
  const { staff, ready, role } = useStaff();
  const load = useCallback((caller: Caller) => getDeskStats(caller), []);
  const stats = useDeskCall(load, STATS_POLL);

  // Nothing until the role is known. In game this is a moment, and the app's
  // rule is that a loader appearing and leaving inside 100ms is a flicker
  // rather than information (DESIGN.md). Showing a refusal in the meantime
  // would be worse: it would be wrong for everyone who is allowed in.
  if (!ready) return null;

  if (!staff) return <NoAccess />;

  return (
    <StatsContext.Provider value={stats}>
      <Stage
        title="Banker Menu"
        blurb="Take in deposits, pay out withdrawals, and see what the house owes."
        aside={role ? <Tag tone={ROLE_TONES[role]}>{ROLE_LABELS[role]}</Tag> : null}
      >
        <TabBar pending={stats.data?.pending} />
        {children}
      </Stage>
    </StatsContext.Provider>
  );
}

/**
 * What a player sees if they find the address.
 *
 * Toned as a closed door rather than an error — nothing has gone wrong, they
 * are simply not staff — and it names no figures, no queues and no other
 * player. It is also what a banker lands on the instant their role is taken
 * away, mid-session, which is why it explains itself rather than just refusing.
 */
function NoAccess() {
  return (
    <Stage title="Banker Menu" blurb="Staff only.">
      <Panel className="flex items-start gap-3">
        <LockKeyIcon size={20} className="mt-0.5 shrink-0 text-ink-muted" aria-hidden />
        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-medium">You do not have access to the desk</h2>
          <p className="text-sm text-ink-soft">
            The banker desk is for the app&apos;s maintenance team. If you had access a moment
            ago, your role has been changed — nothing needs reloading, and the rest of ttGamba
            works as it did.
          </p>
        </div>
      </Panel>
    </Stage>
  );
}

/**
 * The tabs.
 *
 * Links rather than local state, so each tab is somewhere a banker can be sent
 * and somewhere the back button understands. It also means switching tabs is a
 * navigation, which is what re-checks the role (lib/staff.ts) — clicking around
 * the panel is exactly the "few clicks" in which a revoked role takes effect.
 */
function TabBar({ pending }: { pending?: Record<string, number> }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Banker desk" className="-mb-px flex gap-1 overflow-x-auto border-b border-edge">
      {TABS.map((tab) => {
        // `exact` is only on the index: every other tab is a prefix of nothing,
        // but `/banker` is a prefix of all of them.
        const active = "exact" in tab && tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
        const waiting = "queue" in tab ? (pending?.[tab.queue] ?? 0) : 0;

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
            {waiting > 0 ? (
              <span
                className="rounded-chip border border-chip/50 bg-chip/10 px-1.5 py-0.5 font-mono text-[11px] tabular-nums leading-none text-chip"
                title={`${waiting} waiting`}
              >
                {waiting}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
