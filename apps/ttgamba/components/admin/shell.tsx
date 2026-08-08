"use client";

/**
 * The admin panel's frame: who is allowed in, and the tabs across the top.
 *
 * Built to the same shape as the banker desk (components/banker/shell.tsx) so
 * the two read as one app, but the guard here means something different and the
 * difference is worth being blunt about.
 *
 * ── One of these tabs is guarded here, and one is guarded properly ────────
 * Sound, Game Data and Titles do not touch the server at all. Every one of them
 * is a `postMessage` from the browser to the game client (lib/userapp.ts), and
 * there is no round trip in which a role could be checked — so for those three,
 * the role check below is the whole of the gate, and it is one a determined
 * player could get around.
 *
 * That is acceptable because of what is on the other side of it: playing a
 * sound on their own machine, reading the data their own client already sent
 * them, and drawing text on their own screen. All of it is something the player
 * could do by pointing the game at a user app of their own — the client is the
 * boundary there, not this page. Those tools are behind a role because they are
 * noise for everyone else, not because they are dangerous.
 *
 * **Games is not one of those.** It writes rows every player in the casino then
 * reads, so it goes through server functions that re-read the caller's role from
 * the database before doing anything (lib/catalogue.ts, lib/auth.ts) — the same
 * arrangement as the banker desk, where hiding the panel is cosmetic and the
 * server is what actually refuses. Anything else added here that moves a
 * balance, changes a role or writes a row belongs on that side of the line, not
 * this one.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useState } from "react";
import { BroomIcon } from "@phosphor-icons/react/dist/csr/Broom";
import { LockKeyIcon } from "@phosphor-icons/react/dist/csr/LockKey";
import { Tabs, Tooltip, type Tab } from "@tt/window";

import { Panel, Stage, Tag } from "@/components/stage";
import { flushQueryCache } from "@/lib/catalogue";
import { ROLE_LABELS, ROLE_TONES } from "@/lib/desk";
import { useDeskAction, useStaff } from "@/lib/staff";

const TABS: Tab[] = [
  // `exact`, because `/admin` is a prefix of every other tab.
  { href: "/admin", label: "Sound", exact: true },
  { href: "/admin/games", label: "Games" },
  { href: "/admin/data", label: "Game Data" },
  { href: "/admin/titles", label: "Titles" },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const { admin, ready, role } = useStaff();

  // Nothing until the role is known — as on the desk, a loader that appears and
  // leaves inside 100ms is a flicker rather than information (DESIGN.md), and a
  // refusal shown in the meantime would be wrong for everyone allowed in.
  if (!ready) return null;

  if (!admin) return <NoAccess />;

  return (
    <Stage
      title="Admin Tools"
      blurb="Talk to the game client directly: play a sound, read what it is sending, and try out on-screen text."
      aside={
        <div className="flex items-center gap-2">
          <FlushCache />
          {role ? <Tag tone={ROLE_TONES[role]}>{ROLE_LABELS[role]}</Tag> : null}
        </div>
      }
    >
      <Tabs label="Admin tools" tabs={TABS} />
      {children}
    </Stage>
  );
}

/**
 * What anyone else sees if they find the address — including a banker, who has
 * a desk but not these. Toned as a closed door rather than an error: nothing has
 * gone wrong, and there is nothing here they were missing out on.
 */
function NoAccess() {
  return (
    <Stage title="Admin Tools" blurb="Administrators only.">
      <Panel className="flex items-start gap-3">
        <LockKeyIcon size={20} className="mt-0.5 shrink-0 text-ink-muted" aria-hidden />
        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-medium">You do not have access to the admin tools</h2>
          <p className="text-sm text-ink-soft">
            These are for whoever maintains ttGamba. If you had access a moment ago, your role
            has been changed — nothing needs reloading, and the rest of the app works as it did.
          </p>
        </div>
      </Panel>
    </Stage>
  );
}

/**
 * Throw the query cache away.
 *
 * Here rather than on a tab of its own because it is not a tool, it is a
 * recovery: something looks stale, and this is how you rule the cache out. The
 * whole app's cached rows go, which for ttGamba is the games catalogue and the
 * user roles — never a balance, which is not cached (lib/db.ts).
 *
 * No confirmation step. Cached data is a copy of what the database already
 * says, so the worst this can do is make the next few queries slower, and a
 * dialog guarding an action that cannot lose anything only teaches people to
 * click through dialogs.
 */
function FlushCache() {
  const { run, busy, failure } = useDeskAction();
  const [cleared, setCleared] = useState<number | null>(null);

  // The confirmation clears itself. It is a full stop, not something to dismiss.
  useEffect(() => {
    if (cleared === null) return;
    const timer = setTimeout(() => setCleared(null), 4000);
    return () => clearTimeout(timer);
  }, [cleared]);

  const flush = () => {
    void run(flushQueryCache).then((result) => {
      if (result) setCleared(result.deleted);
    });
  };

  return (
    <div className="flex items-center gap-2">
      {failure ? <span className="text-xs text-loss">{failure.message}</span> : null}
      {cleared !== null ? (
        <span className="text-xs text-felt-hi">
          {cleared === 0 ? "Nothing cached" : `Cleared ${cleared}`}
        </span>
      ) : null}
      <Tooltip label="Throw away every cached row. Safe at any time — the database is the source.">
        <button
          type="button"
          onClick={flush}
          disabled={busy}
          className={`flex items-center gap-1.5 rounded-control border px-2.5 py-1.5 text-xs transition-colors duration-120 ease-out ${
            busy
              ? "cursor-default border-edge text-ink-muted/60"
              : "cursor-pointer border-edge bg-tone-2 text-ink-soft hover:border-edge-strong hover:bg-raised-hover hover:text-ink"
          }`}
        >
          <BroomIcon size={13} className={busy ? "animate-refresh" : undefined} aria-hidden />
          Clear cache
        </button>
      </Tooltip>
    </div>
  );
}
