"use client";

/**
 * The panel's side of the desk: who is looking at it, and how it asks for
 * things.
 *
 * ── Losing the role while the app is open ─────────────────────────────────
 * Two things have to happen when a banker is demoted, and only one of them is
 * this file's job.
 *
 * The *enforcement* is entirely server-side and always has been: every desk
 * function re-reads the role from the database before it does anything (see
 * lib/auth.ts). A page that has gone stale can ask for whatever it likes and be
 * told no. Nothing here is load-bearing for that.
 *
 * What this does is stop the demoted banker being shown a desk at all, without
 * making them reload — which is the one thing the app cannot ask for, because
 * a reload that fails strands a player behind a full-screen iframe
 * (components/tablet.tsx). So the role is re-read as they move around the app,
 * and again the moment any call comes back refused. In practice a revoked role
 * disappears from the interface within a click or two of it being taken away.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";

import { refreshChips, revalidateAccount, useChips } from "./chips";
import type { Caller, Failure, Outcome, Page, Role } from "./desk";
import { usePlayer } from "./gamedata";

/**
 * How stale the role is allowed to get while someone is clicking around.
 *
 * Short enough that a revocation lands almost immediately, long enough that a
 * player rattling through the shelf does not fire a query per press. Every
 * check is one indexed read of one row.
 */
const ROLE_MAX_AGE = 3000;

export type Desk = {
  /** `null` until the game client has produced a player to speak for. */
  caller: Caller | null;
  role: Role | null;
  /** Whether the panel should be reachable at all. */
  staff: boolean;
  /**
   * The role has been answered at least once. Before this, `staff: false` means
   * "we have not asked yet" rather than "no" — which is why the panel renders
   * nothing rather than a refusal while it is false.
   */
  ready: boolean;
};

/**
 * Who is at the desk, re-checked as they move.
 *
 * Mounted by the shelf, which is on screen on every page, so the re-check runs
 * for every navigation in the app rather than only inside the panel. That
 * matters: the shelf's own Banker Menu entry is the thing that has to
 * disappear, and it would not if the check only ran on pages you need the role
 * to reach.
 */
export function useStaff(): Desk {
  const { player } = usePlayer();
  const { role } = useChips();
  const pathname = usePathname();

  useEffect(() => {
    revalidateAccount(ROLE_MAX_AGE);
  }, [pathname]);

  const caller = useMemo(
    () => (player.vrpId === null ? null : { vrpId: player.vrpId, name: player.name }),
    [player.vrpId, player.name],
  );

  return {
    caller,
    role,
    staff: role === "banker" || role === "superadmin",
    ready: role !== null,
  };
}

export type Query<T> = {
  data: T | null;
  failure: Failure | null;
  loading: boolean;
  /** Ask again. The same call, with whatever the world looks like now. */
  reload: () => void;
};

const OFFLINE: Failure = {
  ok: false,
  reason: "unavailable",
  message: "Could not reach the server. Try again in a moment.",
};

/**
 * A read only staff may make. Everything in the banker panel.
 *
 * Gated on the role as well as on the caller, so a banker who has just been
 * demoted stops asking rather than filling their panel with refusals on the way
 * out of it.
 */
export function useDeskCall<T>(
  fetcher: (caller: Caller) => Promise<Outcome<T>>,
  pollMs?: number,
): Query<T> {
  const { caller, staff, ready } = useStaff();
  return useCall(fetcher, caller, ready && staff, pollMs);
}

/**
 * A read any player may make of their own things — the settings page asking for
 * the requests they have made.
 *
 * Here, in the file named for the desk's staff, because it is the same
 * machinery and splitting it would leave two copies of the note below to keep
 * in step. The role is beside the point for these: the server works out what
 * "their own" means from the caller, and there is no role that changes the
 * answer (lib/requests.ts).
 */
export function usePlayerCall<T>(
  fetcher: (caller: Caller) => Promise<Outcome<T>>,
  pollMs?: number,
): Query<T> {
  const { caller } = useStaff();
  return useCall(fetcher, caller, true, pollMs);
}

/**
 * Run a read, and keep its answer.
 *
 * `fetcher` is expected to be stable — wrap it in `useCallback` at the call
 * site with the inputs it closes over. It is in the dependency list because it
 * *is* the query: changing the kind, the filter or the cursor changes the
 * function, and that is what re-runs it.
 *
 * A previous answer is kept on screen while the next one is in flight. A queue
 * that blanks itself every time it is polled is harder to read than one that
 * is briefly a few seconds out of date.
 *
 * ── Why `loading` is derived rather than set ──────────────────────────────
 * The obvious shape — flip a `loading` flag at the top of the effect — is a
 * synchronous `setState` inside an effect, which is a cascading render and
 * which the compiler's lint refuses outright. It is also unnecessary: what
 * "loading" actually means is "the answer on screen is not the answer to the
 * question currently being asked", and both halves of that are already in
 * render state. `token` is the question, and the settled state remembers which
 * question it answered. Comparing them is the flag, with nothing to keep in
 * step.
 * ─────────────────────────────────────────────────────────────────────────
 */
function useCall<T>(
  fetcher: (caller: Caller) => Promise<Outcome<T>>,
  caller: Caller | null,
  /**
   * Whether this caller may ask at all. `false` is not a refusal — it is "do
   * not ask", which is what keeps a panel that is about to disappear from
   * painting an error over itself first.
   */
  allowed: boolean,
  /**
   * Ask again on a timer. For figures a banker leaves on screen and expects to
   * watch — a queue filling up behind them — rather than for anything they are
   * reading, where a list reordering itself mid-scan is a nuisance.
   */
  pollMs?: number,
): Query<T> {
  const [nonce, setNonce] = useState(0);

  /** The question being asked right now. A fresh identity per query. */
  const token = useMemo(() => ({ fetcher, caller, nonce }), [fetcher, caller, nonce]);

  const [settled, setSettled] = useState<{
    /** Which question this answers, or `null` for "none yet". */
    token: object | null;
    data: T | null;
    failure: Failure | null;
  }>({ token: null, data: null, failure: null });

  useEffect(() => {
    // Nothing to ask with, or nothing we would be allowed to ask for. Both
    // resolve on their own; asking anyway would only produce a refusal to
    // render over a panel that is about to disappear regardless.
    if (!caller || !allowed) return;

    let cancelled = false;

    token
      .fetcher(caller)
      .then((result) => {
        if (cancelled) return;
        if (result.ok) {
          setSettled({ token, data: result.data, failure: null });
        } else {
          // The previous answer stays put behind the failure. A queue that
          // empties itself because one poll was refused tells a banker their
          // work has vanished, which is a worse lie than being a moment stale.
          setSettled((previous) => ({ token, data: previous.data, failure: result }));
          // A refusal is the one answer worth acting on immediately: re-read
          // the role so the panel locks itself now rather than at the next
          // navigation.
          if (result.reason === "forbidden") refreshChips();
        }
      })
      .catch(() => {
        // A server function that throws arrives here as an opaque digest, so
        // there is nothing to inspect and nothing to say beyond "it did not
        // land". Anything the desk wants the panel to *understand* comes back
        // as a `Failure` instead — see lib/desk.ts.
        if (cancelled) return;
        setSettled((previous) => ({ token, data: previous.data, failure: OFFLINE }));
      });

    return () => {
      cancelled = true;
    };
  }, [token, caller, allowed]);

  useEffect(() => {
    if (!pollMs) return;
    const timer = setInterval(() => setNonce((value) => value + 1), pollMs);
    return () => clearInterval(timer);
  }, [pollMs]);

  const reload = useCallback(() => setNonce((value) => value + 1), []);

  return {
    data: settled.data,
    failure: settled.failure,
    loading: settled.token !== token,
    reload,
  };
}

/**
 * A page, stamped with the cursor it was asked for.
 *
 * The stamp is what makes "load more" safe. Without it, appending is a race:
 * the cursor has already moved on by the time a page lands, so anything that
 * reads the *current* cursor to decide between replacing the list and adding
 * to it can make the wrong call and show a page twice. Carrying the answer
 * along with the data removes the question.
 */
export type Paged<T> = { from: number | null; page: Page<T> };

/**
 * Fold successive pages into one list.
 *
 * Adjusts state during render rather than in an effect — the pattern the
 * odometer already uses (components/odometer.tsx), and the one React endorses
 * for state derived from a prop. An effect would be a render late, and the
 * compiler's lint refuses a synchronous `setState` in one anyway.
 *
 * `latest` is the identity that drives it: `useDeskCall` produces a fresh
 * object per settled query, so a page is folded in exactly once however many
 * times this re-renders in between.
 */
export function useAccumulated<T>(latest: Paged<T> | null): T[] {
  const [seen, setSeen] = useState<{ token: Paged<T> | null; rows: T[] }>({
    token: null,
    rows: [],
  });

  if (latest !== null && seen.token !== latest) {
    setSeen({
      token: latest,
      // `from: null` is the first page of a fresh question — a filter change, a
      // refresh — so it replaces rather than extends.
      rows: latest.from === null ? latest.page.rows : [...seen.rows, ...latest.page.rows],
    });
  }

  return seen.rows;
}

/**
 * Run a desk write.
 *
 * Separate from `useDeskCall` because a write is not a query: it fires on a
 * press rather than on a render, it must not run twice, and its failure
 * belongs beside the button that caused it rather than over the whole panel.
 */
export function useDeskAction(): {
  run: <T>(action: (caller: Caller) => Promise<Outcome<T>>) => Promise<T | null>;
  busy: boolean;
  failure: Failure | null;
  clear: () => void;
} {
  const { caller } = useStaff();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);

  const run = useCallback(
    async <T,>(action: (caller: Caller) => Promise<Outcome<T>>): Promise<T | null> => {
      if (!caller) return null;
      setBusy(true);
      setFailure(null);
      try {
        const result = await action(caller);
        if (result.ok) return result.data;
        setFailure(result);
        if (result.reason === "forbidden") refreshChips();
        return null;
      } catch {
        setFailure(OFFLINE);
        return null;
      } finally {
        setBusy(false);
      }
    },
    [caller],
  );

  const clear = useCallback(() => setFailure(null), []);

  return { run, busy, failure, clear };
}
