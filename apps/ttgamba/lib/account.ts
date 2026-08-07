"use server";

/**
 * The casino's side of a player: their role and their chips.
 *
 * Everything else the app shows about a player belongs to the game client and
 * is read straight from it (lib/gamedata.ts). This is the part the client
 * cannot answer, so it is the only part that touches the database.
 *
 * ── Trust ────────────────────────────────────────────────────────────────
 * The `vrpId` reaching this module is whatever the browser said it was. That
 * is fine for what happens here today — a role and a chip count that only ever
 * read `player` and `0` until a banker says otherwise — and it is *not* fine
 * for anything that moves value. Before the deposit flow is wired up, this
 * needs to verify the caller: the client exposes a `pkey` (the player's public
 * API key) for exactly that, checked server-side against the Tycoon API.
 *
 * Deliberately one function, so that check has one place to land.
 *
 * The interface caches what this returns (lib/chips.ts) and that cache is a
 * display copy, not a permission. Anything that moves chips belongs here as a
 * server function that re-reads, checks and writes the balance in one
 * transaction — never one that trusts a figure the client sent back.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { recordQuietly } from "./audit";
import { readName, readVrpId } from "./auth";
import { prisma } from "./db";
import type { Role } from "./generated/prisma/enums";
import { toChips } from "./rows";

export type Account = {
  vrpId: number;
  role: Role;
  chips: number;
};

/**
 * The account and the balance are read as two queries, never as one with
 * `include: { balance: true }`.
 *
 * That is the rule the split exists to make possible. `User` is cached
 * (lib/db.ts); `Balance` never is. A `User` read that pulled its balance in
 * through the relation would put a balance inside a cached row, where none of
 * the invalidation that protects the real one applies — the cache extension
 * does not see writes made through a relation.
 *
 * Two indexed primary-key reads, one of which is answered from Redis on the
 * common path.
 */
const SELECT = { vrpId: true, role: true } as const;

/**
 * Read a player's account, creating it the first time they open the app.
 *
 * Creating on read is what makes a new player's settings page work without a
 * sign-up step they have no way to complete from inside the game. A fresh row
 * is a `player` with no chips, which is the same thing as having no row — so
 * the write grants nothing that reading did not already imply.
 *
 * A read rather than an upsert, with the write only on the path where there is
 * genuinely nothing there. That is what lets the first open be an event worth
 * recording: an upsert cannot tell you whether it created anything, and a
 * trail that cannot say when an account appeared has a hole in it at the one
 * moment every other row hangs off. The cost is a race — two tabs opening at
 * once — which the create is wrapped for.
 *
 * `name` is only ever written down, never trusted. The interface calls this on
 * every navigation to re-read the role (lib/chips.ts), so it stays a single
 * indexed read on the common path.
 */
export async function getAccount(vrpId: number, name?: string | null): Promise<Account> {
  const id = readVrpId(vrpId);
  if (id === null) throw new Error("Not a vRP id");

  const existing = await prisma.user.findUnique({ where: { vrpId: id }, select: SELECT });
  if (existing) return { ...existing, chips: await readBalance(id) };

  try {
    // The balance is created with the account, so every `User` has exactly one
    // and nothing downstream has to allow for a missing row.
    const created = await prisma.user.create({
      data: { vrpId: id, balance: { create: {} } },
      select: SELECT,
    });
    const who = { vrpId: id, name: readName(name) };
    await recordQuietly({ action: "account.created", actor: who, subject: who });
    return { ...created, chips: 0 };
  } catch {
    // Lost the race with another tab, or the row appeared between the two
    // statements. Either way the account exists now, which is all the caller
    // asked for.
    const raced = await prisma.user.findUniqueOrThrow({ where: { vrpId: id }, select: SELECT });
    return { ...raced, chips: await readBalance(id) };
  }
}

/**
 * A balance on its own.
 *
 * `null` only for an account whose balance row has somehow gone; the two are
 * created together and the foreign key cascades, so it should not happen —
 * reading it as zero is the honest answer if it does, since a missing balance
 * is not chips somebody owns.
 */
async function readBalance(vrpId: number): Promise<number> {
  const row = await prisma.balance.findUnique({ where: { vrpId }, select: { chips: true } });
  return row ? toChips(row.chips) : 0;
}
