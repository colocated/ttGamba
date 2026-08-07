import "server-only";

/**
 * Database rows, flattened into what crosses to the browser.
 *
 * Its own module because both lib/requests.ts and lib/banker.ts need it and
 * both are `"use server"` files, which may only export functions the client is
 * allowed to call. A shared helper cannot live in either.
 *
 * Three jobs, and all of them are about the boundary rather than convenience:
 * dates become epoch milliseconds (see lib/desk.ts for why), chip figures
 * become `number`, and the shape is written out field by field. The explicit
 * list is the point — a column added to the schema later does not silently
 * start being served to every browser that asks for a queue.
 *
 * ── bigint stops here ─────────────────────────────────────────────────────
 * Chips are `BigInt` columns, because Prisma's `Int` is 32 bits and this
 * server's players deal in billions (prisma/schema.prisma). Above this file
 * they are plain `number`s, and that conversion happens once, here, rather
 * than everywhere a figure is formatted or compared.
 *
 * It is lossless because `AMOUNT_LIMIT` keeps every figure four orders of
 * magnitude inside `Number.MAX_SAFE_INTEGER` — the long version is on that
 * constant in lib/desk.ts. Not a `Number()` sprinkled where the types
 * complained: it is the one place the two number systems are allowed to meet.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { AuditRow, RequestRow } from "./desk";
import type { AuditEvent, Request } from "./generated/prisma/client";

/** A stored chip figure, as the rest of the app counts. */
export function toChips(value: bigint): number {
  return Number(value);
}

/** The same, for a column that is allowed to be empty. */
export function toChipsOrNull(value: bigint | null): number | null {
  return value === null ? null : Number(value);
}

/**
 * A `_sum` from an aggregate.
 *
 * Prisma answers `null` when there were no rows to add up, which is a different
 * shape from the zero it means — the desk's figures are "chips held across
 * every open withdrawal", and none of them is nought, not unknown.
 */
export function toChipsTotal(sum: bigint | null): number {
  return sum === null ? 0 : Number(sum);
}

/** Nothing, in the number system the columns use. */
export const NO_CHIPS = BigInt(0);

/**
 * A chip figure on its way *into* the database.
 *
 * The mirror of `toChips`, and the reason it is a function rather than a
 * `BigInt()` at each call site: every amount reaching it has been through
 * `readAmount` (lib/auth.ts), which is what guarantees it is a whole number
 * `BigInt` will accept rather than something that throws mid-transaction.
 */
export function toStored(value: number): bigint {
  return BigInt(value);
}

export function toRequestRow(row: Request): RequestRow {
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    amount: toChips(row.amount),
    vrpId: row.vrpId,
    playerName: row.playerName,
    discordId: row.discordId,
    steamId: row.steamId,
    factionName: row.factionName,
    factionTag: row.factionTag,
    note: row.note,
    handledByVrpId: row.handledByVrpId,
    handledByName: row.handledByName,
    handledAt: row.handledAt ? row.handledAt.getTime() : null,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  };
}

export function toAuditRow(row: AuditEvent): AuditRow {
  return {
    id: row.id,
    at: row.at.getTime(),
    action: row.action,
    actorVrpId: row.actorVrpId,
    actorName: row.actorName,
    actorRole: row.actorRole,
    subjectVrpId: row.subjectVrpId,
    subjectName: row.subjectName,
    amount: toChipsOrNull(row.amount),
    balanceAfter: toChipsOrNull(row.balanceAfter),
    note: row.note,
    detail: row.detail,
    requestId: row.requestId,
  };
}
