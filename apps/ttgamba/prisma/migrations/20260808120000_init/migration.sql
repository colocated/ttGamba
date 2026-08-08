-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('superadmin', 'banker', 'player');

-- CreateEnum
CREATE TYPE "RequestKind" AS ENUM ('deposit', 'withdrawal');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('pending', 'approved', 'closed', 'denied', 'cancelled');

-- CreateTable
CREATE TABLE "User" (
    "vrpId" INTEGER NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'player',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("vrpId")
);

-- CreateTable
CREATE TABLE "Balance" (
    "vrpId" INTEGER NOT NULL,
    "chips" BIGINT NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Balance_pkey" PRIMARY KEY ("vrpId")
);

-- CreateTable
CREATE TABLE "Request" (
    "id" SERIAL NOT NULL,
    "kind" "RequestKind" NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'pending',
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
    "handledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Game" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "blurb" TEXT,
    "icon" TEXT NOT NULL DEFAULT 'PokerChip',
    "engine" TEXT NOT NULL,
    "inRail" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Game_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tier" (
    "id" SERIAL NOT NULL,
    "gameId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "minBet" BIGINT NOT NULL,
    "maxBet" BIGINT NOT NULL,
    "seats" INTEGER NOT NULL DEFAULT 5,
    "floor" INTEGER NOT NULL DEFAULT 1,
    "minDecks" INTEGER NOT NULL DEFAULT 4,
    "maxDecks" INTEGER NOT NULL DEFAULT 6,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Table" (
    "id" SERIAL NOT NULL,
    "tierId" INTEGER NOT NULL,
    "number" INTEGER NOT NULL,
    "overflow" BOOLEAN NOT NULL DEFAULT false,
    "ownerVrpId" INTEGER,
    "state" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "emptiedAt" TIMESTAMP(3),

    CONSTRAINT "Table_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TableSeat" (
    "id" SERIAL NOT NULL,
    "tableId" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "vrpId" INTEGER NOT NULL,
    "playerName" TEXT,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "seenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TableSeat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shoe" (
    "id" SERIAL NOT NULL,
    "tableId" INTEGER NOT NULL,
    "decks" INTEGER NOT NULL DEFAULT 4,
    "cards" TEXT NOT NULL,
    "cursor" INTEGER NOT NULL DEFAULT 0,
    "cut" INTEGER NOT NULL DEFAULT 0,
    "shuffles" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shoe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" SERIAL NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "action" TEXT NOT NULL,
    "actorVrpId" INTEGER,
    "actorName" TEXT,
    "actorRole" "Role",
    "subjectVrpId" INTEGER,
    "subjectName" TEXT,
    "amount" BIGINT,
    "balanceAfter" BIGINT,
    "note" TEXT,
    "detail" TEXT,
    "requestId" INTEGER,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Request_kind_status_createdAt_idx" ON "Request"("kind", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Request_vrpId_createdAt_idx" ON "Request"("vrpId", "createdAt");

-- CreateIndex
CREATE INDEX "Request_status_handledAt_idx" ON "Request"("status", "handledAt");

-- CreateIndex
CREATE UNIQUE INDEX "Game_slug_key" ON "Game"("slug");

-- CreateIndex
CREATE INDEX "Game_position_idx" ON "Game"("position");

-- CreateIndex
CREATE INDEX "Tier_gameId_position_idx" ON "Tier"("gameId", "position");

-- CreateIndex
CREATE INDEX "Table_ownerVrpId_idx" ON "Table"("ownerVrpId");

-- CreateIndex
CREATE UNIQUE INDEX "Table_tierId_number_key" ON "Table"("tierId", "number");

-- CreateIndex
CREATE INDEX "TableSeat_vrpId_idx" ON "TableSeat"("vrpId");

-- CreateIndex
CREATE UNIQUE INDEX "TableSeat_tableId_position_key" ON "TableSeat"("tableId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "TableSeat_tableId_vrpId_key" ON "TableSeat"("tableId", "vrpId");

-- CreateIndex
CREATE UNIQUE INDEX "Shoe_tableId_key" ON "Shoe"("tableId");

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

-- AddForeignKey
ALTER TABLE "Balance" ADD CONSTRAINT "Balance_vrpId_fkey" FOREIGN KEY ("vrpId") REFERENCES "User"("vrpId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Request" ADD CONSTRAINT "Request_vrpId_fkey" FOREIGN KEY ("vrpId") REFERENCES "User"("vrpId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tier" ADD CONSTRAINT "Tier_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Table" ADD CONSTRAINT "Table_tierId_fkey" FOREIGN KEY ("tierId") REFERENCES "Tier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TableSeat" ADD CONSTRAINT "TableSeat_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "Table"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shoe" ADD CONSTRAINT "Shoe_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "Table"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request"("id") ON DELETE SET NULL ON UPDATE CASCADE;

