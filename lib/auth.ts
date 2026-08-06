import "server-only";

/**
 * The boundary. Everything arriving from a browser is checked here.
 *
 * ── Trust, and what is still missing ──────────────────────────────────────
 * The `vrpId` in a `Caller` is whatever the browser said it was. lib/account.ts
 * and README.md both already say this, and it is the outstanding piece of work
 * before real chips move: the game client exposes each player's `pkey` (public
 * API key) to be checked server-side against the Tycoon API, and until that
 * exists a determined player can claim to be anyone — including a banker.
 *
 * That is a bigger hole now than it was yesterday, because the desk this file
 * guards can move balances. It is deliberately not closed here by guessing at
 * an API this repository has no documentation for. What *is* done here is the
 * shape that makes closing it a one-line change: every route into the desk
 * calls `authorise`, so `pkey` verification has exactly one place to land, and
 * nothing downstream needs to know it happened.
 *
 * Until then, treat the panel as protected by a role check and not by
 * authentication.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * ── Why the role is re-read every single time ─────────────────────────────
 * Never from a cache, never from anything the client passed in. A banker who
 * has just been demoted is holding a page that still believes it is a banker's
 * page, and the only thing standing between that page and the database is this
 * function. The interface hides the panel promptly (lib/chips.ts) but hiding is
 * cosmetic; this is the part that actually stops it.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { prisma } from "./db";
import { AMOUNT_LIMIT, NOTE_LIMIT, type Caller, type Failure } from "./desk";
import type { Role } from "./generated/prisma/enums";

/**
 * Re-exported so server modules can take a `Caller` without reaching into the
 * shared vocabulary for it. The definition lives in lib/desk.ts because the
 * panel builds one and this file checks it.
 */
export type { Caller };

/** A caller the database agrees is allowed to be here. */
export type Authorised = { vrpId: number; name: string | null; role: Role };

/** The roles the banker panel is for. `player` is everyone else. */
export const STAFF: readonly Role[] = ["superadmin", "banker"];

/**
 * Everyone with an account. Self-service routes — a player asking for a
 * deposit, or taking their own request back — pass this rather than skipping
 * the check, so that when identity is finally verified there is nothing left
 * that goes around it.
 */
export const ANYONE: readonly Role[] = ["superadmin", "banker", "player"];

export const FORBIDDEN: Failure = {
  ok: false,
  reason: "forbidden",
  message: "You no longer have access to the banker desk.",
};

/**
 * Check a caller against the roles a route is for.
 *
 * Returns `null` rather than throwing so the caller can hand the panel a
 * `Failure` it knows how to render — see the note on `Failure` in lib/desk.ts
 * for why a thrown error is not good enough here.
 */
export async function authorise(
  caller: Caller,
  roles: readonly Role[] = STAFF,
): Promise<Authorised | null> {
  const vrpId = readVrpId(caller?.vrpId);
  if (vrpId === null) return null;

  const account = await prisma.user.findUnique({
    where: { vrpId },
    select: { role: true },
  });
  if (!account || !roles.includes(account.role)) return null;

  return { vrpId, name: readName(caller?.name), role: account.role };
}

// ── Reading what the browser sent ──────────────────────────────────────────

/**
 * A vRP id, or `null`.
 *
 * `Number.isSafeInteger` rather than `isFinite`: this is a primary key that
 * goes into a `WHERE`, and a fractional or absurd value is a caller doing
 * something other than using the app.
 */
export function readVrpId(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) return null;
  return value;
}

/**
 * A row id, or `null`. Same shape as a vRP id — a positive whole number — and
 * named apart from it because the two are different things that would read as
 * interchangeable at the call site.
 */
export function readId(value: unknown): number | null {
  return readVrpId(value);
}

/**
 * A number of whole chips inside the sanity bound, or `null`.
 *
 * Zero is rejected along with everything negative — a request to move no chips
 * is not a small request, it is a malformed one.
 */
export function readAmount(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) return null;
  if (value <= 0 || value > AMOUNT_LIMIT) return null;
  return value;
}

/**
 * A free-text note, trimmed and capped, or `null` for nothing worth storing.
 * Stored and rendered as text — nothing here interprets it.
 */
export function readNote(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().slice(0, NOTE_LIMIT);
  return trimmed === "" ? null : trimmed;
}

/** A character name or other short label from the client. */
export function readName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().slice(0, 100);
  return trimmed === "" ? null : trimmed;
}
