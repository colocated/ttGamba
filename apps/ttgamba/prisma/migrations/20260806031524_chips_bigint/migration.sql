-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AuditEvent" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "action" TEXT NOT NULL,
    "actorVrpId" INTEGER,
    "actorName" TEXT,
    "actorRole" TEXT,
    "subjectVrpId" INTEGER,
    "subjectName" TEXT,
    "amount" BIGINT,
    "balanceAfter" BIGINT,
    "note" TEXT,
    "detail" TEXT,
    "requestId" INTEGER,
    CONSTRAINT "AuditEvent_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_AuditEvent" ("action", "actorName", "actorRole", "actorVrpId", "amount", "at", "balanceAfter", "detail", "id", "note", "requestId", "subjectName", "subjectVrpId") SELECT "action", "actorName", "actorRole", "actorVrpId", "amount", "at", "balanceAfter", "detail", "id", "note", "requestId", "subjectName", "subjectVrpId" FROM "AuditEvent";
DROP TABLE "AuditEvent";
ALTER TABLE "new_AuditEvent" RENAME TO "AuditEvent";
CREATE INDEX "AuditEvent_at_idx" ON "AuditEvent"("at");
CREATE INDEX "AuditEvent_action_at_idx" ON "AuditEvent"("action", "at");
CREATE INDEX "AuditEvent_actorVrpId_at_idx" ON "AuditEvent"("actorVrpId", "at");
CREATE INDEX "AuditEvent_subjectVrpId_at_idx" ON "AuditEvent"("subjectVrpId", "at");
CREATE INDEX "AuditEvent_requestId_idx" ON "AuditEvent"("requestId");
CREATE TABLE "new_Request" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "amount" BIGINT NOT NULL,
    "vrpId" INTEGER NOT NULL,
    "playerName" TEXT,
    "discordId" TEXT,
    "steamId" TEXT,
    "factionName" TEXT,
    "factionTag" TEXT,
    "note" TEXT,
    "handledByVrpId" INTEGER,
    "handledByName" TEXT,
    "handledAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Request_vrpId_fkey" FOREIGN KEY ("vrpId") REFERENCES "User" ("vrpId") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Request" ("amount", "createdAt", "discordId", "factionName", "factionTag", "handledAt", "handledByName", "handledByVrpId", "id", "kind", "note", "playerName", "status", "steamId", "updatedAt", "vrpId") SELECT "amount", "createdAt", "discordId", "factionName", "factionTag", "handledAt", "handledByName", "handledByVrpId", "id", "kind", "note", "playerName", "status", "steamId", "updatedAt", "vrpId" FROM "Request";
DROP TABLE "Request";
ALTER TABLE "new_Request" RENAME TO "Request";
CREATE INDEX "Request_kind_status_createdAt_idx" ON "Request"("kind", "status", "createdAt");
CREATE INDEX "Request_vrpId_createdAt_idx" ON "Request"("vrpId", "createdAt");
CREATE INDEX "Request_status_handledAt_idx" ON "Request"("status", "handledAt");
CREATE TABLE "new_User" (
    "vrpId" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "role" TEXT NOT NULL DEFAULT 'player',
    "chips" BIGINT NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_User" ("chips", "createdAt", "role", "updatedAt", "vrpId") SELECT "chips", "createdAt", "role", "updatedAt", "vrpId" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

