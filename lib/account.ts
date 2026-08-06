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

import { prisma } from "./db";
import type { Role } from "./generated/prisma/enums";

export type Account = {
  vrpId: number;
  role: Role;
  chips: number;
};

/**
 * Read a player's account, creating it the first time they open the app.
 *
 * Creating on read is what makes a new player's settings page work without a
 * sign-up step they have no way to complete from inside the game. A fresh row
 * is a `player` with no chips, which is the same thing as having no row — so
 * the write grants nothing that reading did not already imply.
 */
export async function getAccount(vrpId: number): Promise<Account> {
  return prisma.user.upsert({
    where: { vrpId },
    create: { vrpId },
    // Nothing to reconcile: every other column is the casino's own record, and
    // opening a page is not a reason to touch it.
    update: {},
    select: { vrpId: true, role: true, chips: true },
  });
}
