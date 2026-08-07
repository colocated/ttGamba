-- CreateTable
CREATE TABLE "Request" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "amount" INTEGER NOT NULL,
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

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "action" TEXT NOT NULL,
    "actorVrpId" INTEGER,
    "actorName" TEXT,
    "actorRole" TEXT,
    "subjectVrpId" INTEGER,
    "subjectName" TEXT,
    "amount" INTEGER,
    "balanceAfter" INTEGER,
    "note" TEXT,
    "detail" TEXT,
    "requestId" INTEGER,
    CONSTRAINT "AuditEvent_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Request_kind_status_createdAt_idx" ON "Request"("kind", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Request_vrpId_createdAt_idx" ON "Request"("vrpId", "createdAt");

-- CreateIndex
CREATE INDEX "Request_status_handledAt_idx" ON "Request"("status", "handledAt");

-- CreateIndex
CREATE INDEX "AuditEvent_at_idx" ON "AuditEvent"("at");

-- CreateIndex
CREATE INDEX "AuditEvent_action_at_idx" ON "AuditEvent"("action", "at");

-- CreateIndex
CREATE INDEX "AuditEvent_actorVrpId_at_idx" ON "AuditEvent"("actorVrpId", "at");

-- CreateIndex
CREATE INDEX "AuditEvent_subjectVrpId_at_idx" ON "AuditEvent"("subjectVrpId", "at");

-- CreateIndex
CREATE INDEX "AuditEvent_requestId_idx" ON "AuditEvent"("requestId");
