"use server";

/**
 * The player's side of the desk: asking for chips, and taking it back.
 *
 * The settings page is where a player reaches all three: the two buttons beside
 * their chip balance open the form, and the list under it is what they see
 * afterwards (components/requests.tsx).
 *
 * ── When chips actually move ──────────────────────────────────────────────
 * The two kinds settle at opposite ends of their life, and the asymmetry is
 * deliberate.
 *
 * A **deposit** credits nothing until a banker marks it actioned. The player
 * has not handed over any in-game cash yet, and chips that appear before the
 * cash does are chips the casino has given away.
 *
 * A **withdrawal** debits the moment it is asked for. The alternative — debit
 * on settlement — lets a player ask to cash out 10,000, lose it at blackjack
 * while the request sits in the queue, and leave the banker holding a promise
 * against a balance that no longer covers it. So the chips come out up front
 * and are *held*: returned in full if the request is denied or cancelled,
 * consumed when it is actioned. A player's own balance is therefore what they
 * can still gamble with, which is the only reading of it that is never wrong.
 *
 * This is why the balance and the request table have to move together, and why
 * everything below is one transaction with a conditional update at the centre
 * of it rather than a read followed by a write.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { record } from "./audit";
import { ANYONE, authorise, FORBIDDEN, readAmount, readName, readNote, type Caller } from "./auth";
import { getAccount } from "./account";
import { prisma } from "./db";
import { holdsChips, requestAction, type Outcome, type RequestKind, type RequestRow } from "./desk";
import { toChips, toRequestRow, toStored } from "./rows";

/**
 * The character behind a request, as the client describes them right now.
 *
 * Copied onto the request so a banker reviewing it sees who asked, not who
 * holds the account by the time they get to it. Every field is optional
 * because the client is allowed not to know — see lib/gamedata.ts.
 *
 * The client's source id is not among them on purpose: it describes the
 * session the player happens to be in, and a request outlives that.
 */
export type Identity = {
  name?: string | null;
  discordId?: string | null;
  steamId?: string | null;
  factionName?: string | null;
  factionTag?: string | null;
};

/**
 * Ask for chips to be moved across the in-game boundary.
 *
 * A player may have as many open requests as they like, of either kind. That
 * is not an oversight: a deposit and a withdrawal in flight at once is a
 * perfectly ordinary thing to want, and rationing them would only invite
 * cancel-and-retry.
 */
export async function createRequest(
  caller: Caller,
  input: { kind: RequestKind; amount: number; identity?: Identity },
): Promise<Outcome<RequestRow>> {
  // Opening the app already does this; doing it again means a request can
  // never be the thing that discovers a player has no row.
  try {
    await getAccount(caller?.vrpId, caller?.name);
  } catch {
    return { ok: false, reason: "unknown-player", message: "That is not a player id." };
  }

  const who = await authorise(caller, ANYONE);
  if (!who) return FORBIDDEN;

  const kind = input?.kind;
  if (kind !== "deposit" && kind !== "withdrawal") {
    return { ok: false, reason: "invalid", message: "Unknown request type." };
  }

  const amount = readAmount(input?.amount);
  if (amount === null) {
    return { ok: false, reason: "invalid", message: "Enter a whole number of chips." };
  }

  const identity = input?.identity ?? {};
  const snapshot = {
    playerName: readName(identity.name) ?? who.name,
    discordId: readName(identity.discordId),
    steamId: readName(identity.steamId),
    factionName: readName(identity.factionName),
    factionTag: readName(identity.factionTag),
  };

  const result = await prisma.$transaction(async (tx) => {
    let balanceAfter: number | null = null;

    if (kind === "withdrawal") {
      /*
        The hold. A conditional update rather than read-then-write: two tabs
        cashing out at once would both pass a `chips >= amount` check made a
        moment earlier, and only the database can decide between them. `count`
        is how it reports which one lost.
      */
      const held = await tx.user.updateMany({
        where: { vrpId: who.vrpId, chips: { gte: toStored(amount) } },
        data: { chips: { decrement: toStored(amount) } },
      });
      if (held.count !== 1) return null;

      const after = await tx.user.findUniqueOrThrow({
        where: { vrpId: who.vrpId },
        select: { chips: true },
      });
      balanceAfter = toChips(after.chips);
    }

    const created = await tx.request.create({
      data: { kind, amount: toStored(amount), vrpId: who.vrpId, ...snapshot },
    });

    await record(
      {
        action: requestAction(kind, "pending"),
        actor: { vrpId: who.vrpId, name: who.name, role: who.role },
        subject: { vrpId: who.vrpId, name: snapshot.playerName },
        amount,
        balanceAfter,
        requestId: created.id,
      },
      tx,
    );

    return created;
  });

  if (!result) {
    return {
      ok: false,
      reason: "funds",
      message: "You do not have that many chips to withdraw.",
    };
  }

  return { ok: true, data: toRequestRow(result) };
}

/**
 * Take a request back.
 *
 * Open until it is settled, including once a banker has approved it — approval
 * is a banker saying they will do it, not the player losing the right to change
 * their mind. Held chips come back in the same transaction.
 */
export async function cancelRequest(
  caller: Caller,
  requestId: number,
  note?: string,
): Promise<Outcome<RequestRow>> {
  const who = await authorise(caller, ANYONE);
  if (!who) return FORBIDDEN;

  const id = typeof requestId === "number" && Number.isSafeInteger(requestId) ? requestId : null;
  if (id === null) return { ok: false, reason: "invalid", message: "Unknown request." };

  const outcome = await prisma.$transaction(async (tx) => {
    const existing = await tx.request.findUnique({ where: { id } });
    // Not theirs is reported as not existing. A player poking at ids should not
    // be able to learn which of them are real.
    if (!existing || existing.vrpId !== who.vrpId) return "gone" as const;
    if (!holdsChips(existing.status)) return "conflict" as const;

    // Compare-and-swap on the status we just read: if a banker settled it in
    // between, this matches nothing and the cancel loses, which is right —
    // the chips have already moved.
    const moved = await tx.request.updateMany({
      where: { id, status: existing.status },
      data: {
        status: "cancelled",
        note: readNote(note) ?? existing.note,
        handledByVrpId: who.vrpId,
        handledByName: who.name,
        handledAt: new Date(),
      },
    });
    if (moved.count !== 1) return "conflict" as const;

    let balanceAfter: number | null = null;
    if (existing.kind === "withdrawal") {
      const refunded = await tx.user.update({
        where: { vrpId: who.vrpId },
        data: { chips: { increment: existing.amount } },
        select: { chips: true },
      });
      balanceAfter = toChips(refunded.chips);
    }

    await record(
      {
        action: requestAction(existing.kind, "cancelled"),
        actor: { vrpId: who.vrpId, name: who.name, role: who.role },
        subject: { vrpId: who.vrpId, name: existing.playerName },
        amount: existing.amount,
        balanceAfter,
        note: readNote(note),
        requestId: id,
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
      message: "A banker has already settled that request.",
    };
  }

  return { ok: true, data: toRequestRow(outcome) };
}

/** A player's own requests, newest first. What the settings page lists. */
export async function getMyRequests(caller: Caller): Promise<Outcome<RequestRow[]>> {
  const who = await authorise(caller, ANYONE);
  if (!who) return FORBIDDEN;

  const rows = await prisma.request.findMany({
    where: { vrpId: who.vrpId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return { ok: true, data: rows.map(toRequestRow) };
}
