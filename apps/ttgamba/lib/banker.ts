"use server";

/**
 * The banker desk, server side.
 *
 * Every function here is the same shape: authorise, validate, act in one
 * transaction, write it down. `authorise` re-reads the caller's role from the
 * database on every single call and never trusts anything the page sent — see
 * lib/auth.ts for why that matters more here than anywhere else in the app.
 *
 * Nothing returns a raw row. What crosses to the browser is the shape declared
 * in lib/desk.ts, built by lib/rows.ts, so a column added later is not served
 * to every banker's browser by accident.
 */

import { record, type Db } from "./audit";
import { authorise, FORBIDDEN, readId, readNote, readVrpId, type Caller } from "./auth";
import { prisma } from "./db";
import {
  FLOW_ACTIONS,
  holdsChips,
  PAGE_SIZE,
  requestAction,
  STAFF_MOVES,
  STATUS_ORDER,
  type AuditRow,
  type Outcome,
  type Page,
  type RequestKind,
  type RequestRow,
  type RequestStatus,
  type Role,
} from "./desk";
import { NO_CHIPS, toAuditRow, toChips, toChipsTotal, toRequestRow } from "./rows";

const DAY = 24 * 60 * 60 * 1000;

/** Statuses that still want a banker's attention. */
const OPEN: RequestStatus[] = ["pending", "approved"];

// ── Stats ──────────────────────────────────────────────────────────────────

export type DeskStats = {
  /** Chips sitting in players' balances — what they can still gamble with. */
  chipsInPlay: number;
  /**
   * Chips taken out of balances and promised to open withdrawals. Not spendable
   * by anyone, and not yet paid out either. See lib/requests.ts.
   */
  chipsHeld: number;
  /** Accounts that have ever opened the app. */
  players: number;
  pending: Record<RequestKind, number>;
  approved: Record<RequestKind, number>;
  /** Chips that came into existence in the last 24 hours, and left it. */
  intake24h: number;
  exfill24h: number;
  /** Requests of either kind settled in the last 24 hours. */
  settled24h: number;
};

/**
 * The numbers on the front page.
 *
 * `chipsInPlay + chipsHeld` is the casino's total liability: every chip that
 * exists is in one of the two. They are reported apart rather than summed
 * because they behave differently — the first is exposure to the tables, the
 * second is a queue of cash a banker still has to hand over.
 *
 * The 24-hour figures come off the audit trail rather than the request table,
 * so anything else that is ever taught to move chips into or out of existence
 * is counted the moment it declares a `flow` in lib/desk.ts, with nothing here
 * to change.
 */
export async function getDeskStats(caller: Caller): Promise<Outcome<DeskStats>> {
  const who = await authorise(caller);
  if (!who) return FORBIDDEN;

  const since = new Date(Date.now() - DAY);

  const [wallets, open, intake, exfill, settled] = await Promise.all([
    prisma.user.aggregate({ _sum: { chips: true }, _count: { _all: true } }),
    prisma.request.groupBy({
      by: ["kind", "status"],
      where: { status: { in: OPEN } },
      _count: { _all: true },
      _sum: { amount: true },
    }),
    prisma.auditEvent.aggregate({
      _sum: { amount: true },
      where: { action: { in: FLOW_ACTIONS.intake }, at: { gte: since } },
    }),
    prisma.auditEvent.aggregate({
      _sum: { amount: true },
      where: { action: { in: FLOW_ACTIONS.exfill }, at: { gte: since } },
    }),
    prisma.request.count({ where: { status: "closed", handledAt: { gte: since } } }),
  ]);

  const pending: Record<RequestKind, number> = { deposit: 0, withdrawal: 0 };
  const approved: Record<RequestKind, number> = { deposit: 0, withdrawal: 0 };
  /*
    Summed as `bigint` and converted once at the end rather than per group. A
    sum of chip figures is the one place a total can be larger than any figure
    that went into it, so it is the last thing that should be doing its
    arithmetic in doubles.
  */
  let chipsHeld = NO_CHIPS;

  for (const group of open) {
    if (group.status === "pending") pending[group.kind] = group._count._all;
    if (group.status === "approved") approved[group.kind] = group._count._all;
    // Only withdrawals hold anything. A pending deposit is a promise of chips
    // that do not exist yet, so it is not a liability to count.
    if (group.kind === "withdrawal") chipsHeld += group._sum.amount ?? NO_CHIPS;
  }

  return {
    ok: true,
    data: {
      chipsInPlay: toChipsTotal(wallets._sum.chips),
      chipsHeld: toChips(chipsHeld),
      players: wallets._count._all,
      pending,
      approved,
      intake24h: toChipsTotal(intake._sum.amount),
      exfill24h: toChipsTotal(exfill._sum.amount),
      settled24h: settled,
    },
  };
}

// ── Queues ─────────────────────────────────────────────────────────────────

/**
 * One kind's queue.
 *
 * Ordered oldest-first while the filter is the open statuses, because that is
 * a queue and a queue is served in the order people joined it. Any filter that
 * lets settled requests in is an archive instead, and reads newest-first.
 *
 * Paged on `id` rather than `createdAt`: it is unique and monotonic with
 * creation, so the cursor can never straddle two rows made in the same
 * millisecond and skip one.
 */
export async function listRequests(
  caller: Caller,
  input: { kind: RequestKind; statuses?: RequestStatus[]; cursor?: number | null },
): Promise<Outcome<Page<RequestRow>>> {
  const who = await authorise(caller);
  if (!who) return FORBIDDEN;

  const kind = input?.kind;
  if (kind !== "deposit" && kind !== "withdrawal") {
    return { ok: false, reason: "invalid", message: "Unknown request type." };
  }

  const asked = Array.isArray(input?.statuses) ? input.statuses : null;
  const statuses = asked
    ? STATUS_ORDER.filter((status) => asked.includes(status))
    : [...STATUS_ORDER];
  if (statuses.length === 0) return { ok: true, data: { rows: [], more: false } };

  const queue = statuses.every((status) => OPEN.includes(status));
  const cursor = typeof input?.cursor === "number" ? input.cursor : null;

  const rows = await prisma.request.findMany({
    where: {
      kind,
      status: { in: statuses },
      ...(cursor === null ? {} : { id: queue ? { gt: cursor } : { lt: cursor } }),
    },
    orderBy: { id: queue ? "asc" : "desc" },
    take: PAGE_SIZE + 1,
  });

  // One row over the page size is how we know there is another page, without
  // paying for a count of the whole table.
  const more = rows.length > PAGE_SIZE;
  return { ok: true, data: { rows: rows.slice(0, PAGE_SIZE).map(toRequestRow), more } };
}

export type RequestDetail = {
  request: RequestRow;
  /** The player's account as it stands now — not as it was when they asked. */
  account: { role: Role; chips: number } | null;
  /** Chips this player has held against their *other* open withdrawals. */
  heldElsewhere: number;
  /** Everything that has happened to this request, oldest first. */
  history: AuditRow[];
};

/** One request, with enough around it to make a decision on. */
export async function getRequest(
  caller: Caller,
  requestId: number,
): Promise<Outcome<RequestDetail>> {
  const who = await authorise(caller);
  if (!who) return FORBIDDEN;

  const id = readId(requestId);
  if (id === null) return { ok: false, reason: "invalid", message: "Unknown request." };

  const request = await prisma.request.findUnique({ where: { id } });
  if (!request) return { ok: false, reason: "gone", message: "That request no longer exists." };

  const [account, held, history] = await Promise.all([
    prisma.user.findUnique({
      where: { vrpId: request.vrpId },
      select: { role: true, chips: true },
    }),
    prisma.request.aggregate({
      _sum: { amount: true },
      where: { vrpId: request.vrpId, kind: "withdrawal", status: { in: OPEN }, id: { not: id } },
    }),
    prisma.auditEvent.findMany({ where: { requestId: id }, orderBy: { id: "asc" } }),
  ]);

  return {
    ok: true,
    data: {
      request: toRequestRow(request),
      account: account && { role: account.role, chips: toChips(account.chips) },
      heldElsewhere: toChipsTotal(held._sum.amount),
      history: history.map(toAuditRow),
    },
  };
}

/**
 * Advance a request, and move the chips if this is the move that moves them.
 *
 * The whole thing is one transaction with a compare-and-swap at its centre:
 * the update matches on the status that was just read, so two bankers pressing
 * Action at the same moment cannot both credit the player. The one that loses
 * is told, rather than silently doing nothing.
 *
 * A denial needs a note. It is the one outcome the player will want explained,
 * and a bare "Denied" is how a desk generates the conversation it exists to
 * avoid having.
 */
export async function moveRequest(
  caller: Caller,
  input: { requestId: number; to: RequestStatus; note?: string },
): Promise<Outcome<RequestRow>> {
  const who = await authorise(caller);
  if (!who) return FORBIDDEN;

  const id = readId(input?.requestId);
  if (id === null) return { ok: false, reason: "invalid", message: "Unknown request." };

  const to = input?.to;
  if (!STATUS_ORDER.includes(to)) {
    return { ok: false, reason: "invalid", message: "Unknown status." };
  }

  const note = readNote(input?.note);
  if (to === "denied" && note === null) {
    return { ok: false, reason: "invalid", message: "Say why it was denied." };
  }

  const outcome = await prisma.$transaction(async (tx) => {
    const existing = await tx.request.findUnique({ where: { id } });
    if (!existing) return "gone" as const;
    if (!STAFF_MOVES[existing.status].includes(to)) return "conflict" as const;

    const moved = await tx.request.updateMany({
      where: { id, status: existing.status },
      data: {
        status: to,
        note: note ?? existing.note,
        handledByVrpId: who.vrpId,
        handledByName: who.name,
        handledAt: new Date(),
      },
    });
    if (moved.count !== 1) return "conflict" as const;

    const balanceAfter = await applyToBalance(tx, existing, to);

    await record(
      {
        action: requestAction(existing.kind, to),
        actor: { vrpId: who.vrpId, name: who.name, role: who.role },
        subject: { vrpId: existing.vrpId, name: existing.playerName },
        amount: existing.amount,
        balanceAfter,
        note,
        requestId: id,
        detail: { from: existing.status, to },
      },
      tx,
    );

    return tx.request.findUniqueOrThrow({ where: { id } });
  });

  if (outcome === "gone") {
    return { ok: false, reason: "gone", message: "That request no longer exists." };
  }
  if (outcome === "conflict") {
    return {
      ok: false,
      reason: "conflict",
      message: "Someone else moved that request first. Reopen it to see where it got to.",
    };
  }

  return { ok: true, data: toRequestRow(outcome) };
}

/**
 * The chips, for the one move in each kind's life that touches them.
 *
 * Deposits credit on the way out — the player has handed over in-game cash and
 * this is the chips going the other way. Withdrawals were already debited when
 * they were asked for, so settling one moves nothing and denying one gives the
 * held chips back. Everything else is paperwork.
 *
 * Returns the balance afterwards for the audit row, or `null` where no balance
 * was involved.
 */
async function applyToBalance(
  tx: Db,
  request: { kind: RequestKind; status: RequestStatus; amount: bigint; vrpId: number },
  to: RequestStatus,
): Promise<number | null> {
  if (request.kind === "deposit") {
    if (to !== "closed") return null;
    const credited = await tx.user.update({
      where: { vrpId: request.vrpId },
      data: { chips: { increment: request.amount } },
      select: { chips: true },
    });
    return toChips(credited.chips);
  }

  // A withdrawal only gives chips back, and only from a status that was still
  // holding them. Denying an already-denied one cannot reach here — the move
  // table forbids it — but the guard is what makes that a fact rather than a
  // reading of another file.
  if (to === "denied" && holdsChips(request.status)) {
    const refunded = await tx.user.update({
      where: { vrpId: request.vrpId },
      data: { chips: { increment: request.amount } },
      select: { chips: true },
    });
    return toChips(refunded.chips);
  }

  if (to === "closed") {
    const after = await tx.user.findUnique({
      where: { vrpId: request.vrpId },
      select: { chips: true },
    });
    return after ? toChips(after.chips) : null;
  }

  return null;
}

// ── Player lookup ──────────────────────────────────────────────────────────

export type PlayerProfile = {
  vrpId: number;
  role: Role;
  chips: number;
  /** Chips held against this player's open withdrawals. */
  held: number;
  createdAt: number;
  /**
   * The most recent thing we have written down about who they are — taken off
   * their latest request, because the app stores no copy of a player's
   * identity anywhere else on purpose (prisma/schema.prisma). A player who has
   * never used the desk has none, which is not an error.
   */
  identity: {
    name: string | null;
    discordId: string | null;
    steamId: string | null;
    factionName: string | null;
    factionTag: string | null;
    /** When that snapshot was taken. */
    at: number;
  } | null;
  /** Lifetime, over settled requests only. */
  deposited: number;
  withdrawn: number;
  requests: RequestRow[];
  events: AuditRow[];
};

/** Everything the app knows about one vRP id. */
export async function lookupPlayer(
  caller: Caller,
  vrpId: number,
): Promise<Outcome<PlayerProfile>> {
  const who = await authorise(caller);
  if (!who) return FORBIDDEN;

  const id = readVrpId(vrpId);
  if (id === null) {
    return { ok: false, reason: "invalid", message: "A vRP ID is a whole number." };
  }

  const account = await prisma.user.findUnique({ where: { vrpId: id } });
  if (!account) {
    return {
      ok: false,
      reason: "unknown-player",
      message: `Nobody with vRP ID ${id} has opened ttGamba.`,
    };
  }

  const [requests, held, deposited, withdrawn, events] = await Promise.all([
    prisma.request.findMany({ where: { vrpId: id }, orderBy: { id: "desc" }, take: PAGE_SIZE }),
    prisma.request.aggregate({
      _sum: { amount: true },
      where: { vrpId: id, kind: "withdrawal", status: { in: OPEN } },
    }),
    prisma.request.aggregate({
      _sum: { amount: true },
      where: { vrpId: id, kind: "deposit", status: "closed" },
    }),
    prisma.request.aggregate({
      _sum: { amount: true },
      where: { vrpId: id, kind: "withdrawal", status: "closed" },
    }),
    // Anything they did, or anything done to them.
    prisma.auditEvent.findMany({
      where: { OR: [{ actorVrpId: id }, { subjectVrpId: id }] },
      orderBy: { id: "desc" },
      take: PAGE_SIZE,
    }),
  ]);

  const latest = requests[0];

  return {
    ok: true,
    data: {
      vrpId: account.vrpId,
      role: account.role,
      chips: toChips(account.chips),
      held: toChipsTotal(held._sum.amount),
      createdAt: account.createdAt.getTime(),
      identity: latest
        ? {
            name: latest.playerName,
            discordId: latest.discordId,
            steamId: latest.steamId,
            factionName: latest.factionName,
            factionTag: latest.factionTag,
            at: latest.createdAt.getTime(),
          }
        : null,
      deposited: toChipsTotal(deposited._sum.amount),
      withdrawn: toChipsTotal(withdrawn._sum.amount),
      requests: requests.map(toRequestRow),
      events: events.map(toAuditRow),
    },
  };
}

// ── Audit log ──────────────────────────────────────────────────────────────

export type AuditFilter = {
  /** A registry key from lib/desk.ts, or nothing for every action. */
  action?: string | null;
  /** Matches the actor *or* the subject — "everything touching this player". */
  vrpId?: number | null;
  /** Epoch milliseconds, inclusive. */
  from?: number | null;
  to?: number | null;
  /** The `id` of the last row already on screen. */
  cursor?: number | null;
};

/**
 * The trail, newest first.
 *
 * Paged on `id` for the same reason the queues are: two events written inside
 * the same transaction share a timestamp to the millisecond, and a cursor on
 * `at` would drop one of them at a page boundary.
 */
export async function listAudit(
  caller: Caller,
  filter: AuditFilter = {},
): Promise<Outcome<Page<AuditRow>>> {
  const who = await authorise(caller);
  if (!who) return FORBIDDEN;

  const action = typeof filter?.action === "string" && filter.action !== "" ? filter.action : null;
  const subject = readVrpId(filter?.vrpId);
  const from = readTime(filter?.from);
  const to = readTime(filter?.to);
  const cursor = typeof filter?.cursor === "number" ? filter.cursor : null;

  const rows = await prisma.auditEvent.findMany({
    where: {
      ...(action === null ? {} : { action }),
      ...(subject === null ? {} : { OR: [{ actorVrpId: subject }, { subjectVrpId: subject }] }),
      ...(from === null && to === null
        ? {}
        : { at: { ...(from === null ? {} : { gte: from }), ...(to === null ? {} : { lte: to }) } }),
      ...(cursor === null ? {} : { id: { lt: cursor } }),
    },
    orderBy: { id: "desc" },
    take: PAGE_SIZE + 1,
  });

  const more = rows.length > PAGE_SIZE;
  return { ok: true, data: { rows: rows.slice(0, PAGE_SIZE).map(toAuditRow), more } };
}

function readTime(value: unknown): Date | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
