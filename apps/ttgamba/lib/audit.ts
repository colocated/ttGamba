import "server-only";

/**
 * Writing things down.
 *
 * Every action that moves a balance, changes a permission, or advances a
 * request leaves a row here, and the banker panel's audit tab is a reader over
 * those rows. The vocabulary — which actions exist and what they mean — is in
 * lib/desk.ts, so this module is only the act of recording.
 *
 * Two things the trail is built to survive:
 *
 * - **Renames.** Names are copied in at the time rather than joined at read
 *   time. A row has to still describe what happened when the account it names
 *   has been renamed, demoted, or is gone entirely.
 * - **Reversals.** Nothing is ever updated or deleted. A mistake is corrected
 *   by a further event, which is the only kind of correction that leaves the
 *   original visible.
 */

// The generated client's own runtime, which is where the list of members a
// transaction client does not have is defined. See `Db` below.
import type { ITXClientDenyList } from "@prisma/client/runtime/client";

import { prisma } from "./db";
import type { AuditAction } from "./desk";
import type { Role } from "./generated/prisma/enums";

/**
 * A handle that may be the client or an open transaction.
 *
 * Auditing inside the transaction that did the thing is the point: a request
 * that advanced and a trail that says it did not is a worse state than either
 * failing, and passing the transaction client here is what makes the two one
 * write.
 *
 * Deliberately **not** `Prisma.TransactionClient | typeof prisma`. That
 * generated type is `Omit<DefaultPrismaClient, ITXClientDenyList>` — the
 * *unextended* client — so once `prisma` carries an extension (lib/db.ts) the
 * union has one extended arm and one plain one, and every model method becomes
 * two call signatures TypeScript cannot reconcile. It surfaces as "This
 * expression is not callable" at every ordinary `db.thing.create()`.
 *
 * `Omit<typeof prisma, ITXClientDenyList>` is what `$transaction` hands a
 * callback on an extended client, and the full client is assignable to it. One
 * type covers both, and it tracks whatever extensions `prisma` gains.
 */
export type Db = Omit<typeof prisma, ITXClientDenyList>;

export type AuditEntry = {
  action: AuditAction;
  /** Who acted. Absent when the app acted on its own. */
  actor?: { vrpId: number; name: string | null; role?: Role | null } | null;
  /** Whose account it landed on. The actor themself, for anything self-service. */
  subject?: { vrpId: number; name?: string | null } | null;
  /**
   * Chips moved, always positive — the action says which way.
   *
   * Either number system is accepted, because call sites have one of each to
   * hand: an amount a player just typed is a `number`, and an amount read back
   * off a row is a `bigint`. Making each of them convert would be the same
   * conversion written twice, in the file that cares least.
   */
  amount?: number | bigint | null;
  /** The subject's balance afterwards, so the trail reads back as a ledger. */
  balanceAfter?: number | bigint | null;
  note?: string | null;
  /** Anything action-specific. Serialised to JSON; keep it small and flat. */
  detail?: Record<string, unknown> | null;
  requestId?: number | null;
};

/**
 * Write one event.
 *
 * Throws if the write fails, deliberately: inside a transaction that is the
 * behaviour you want, because a settled request with no trail is not an
 * acceptable outcome. Call sites where the audit is incidental to something
 * that must not fail — a player merely opening the app — catch it themselves.
 */
export async function record(entry: AuditEntry, db: Db = prisma): Promise<void> {
  await db.auditEvent.create({
    data: {
      action: entry.action,
      actorVrpId: entry.actor?.vrpId ?? null,
      actorName: entry.actor?.name ?? null,
      actorRole: entry.actor?.role ?? null,
      subjectVrpId: entry.subject?.vrpId ?? null,
      subjectName: entry.subject?.name ?? null,
      amount: stored(entry.amount),
      balanceAfter: stored(entry.balanceAfter),
      note: entry.note ?? null,
      detail: entry.detail ? JSON.stringify(entry.detail) : null,
      requestId: entry.requestId ?? null,
    },
  });
}

/** A chip column, whichever number system the caller had. */
function stored(value: number | bigint | null | undefined): bigint | null {
  if (value === null || value === undefined) return null;
  return BigInt(value);
}

/**
 * Write one event, and carry on if it fails.
 *
 * For trails hung off something that must succeed regardless — opening the app
 * creates an account, and a player should not be locked out because the log
 * table is unhappy. Anything that moves chips uses `record` instead, inside the
 * same transaction as the move.
 */
export async function recordQuietly(entry: AuditEntry, db: Db = prisma): Promise<void> {
  try {
    await record(entry, db);
  } catch {
    // Nothing useful to do here. The action itself succeeded, and reporting a
    // failed log write to a player would describe a problem they cannot act on.
  }
}
