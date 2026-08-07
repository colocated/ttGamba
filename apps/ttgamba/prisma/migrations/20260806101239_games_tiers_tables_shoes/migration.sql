-- CreateTable
CREATE TABLE "Game" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "blurb" TEXT,
    "icon" TEXT NOT NULL DEFAULT 'PokerChip',
    "engine" TEXT NOT NULL,
    "inRail" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Tier" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "gameId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "minBet" BIGINT NOT NULL,
    "maxBet" BIGINT NOT NULL,
    "seats" INTEGER NOT NULL DEFAULT 5,
    "floor" INTEGER NOT NULL DEFAULT 1,
    "position" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Tier_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Table" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tierId" INTEGER NOT NULL,
    "number" INTEGER NOT NULL,
    "overflow" BOOLEAN NOT NULL DEFAULT false,
    "ownerVrpId" INTEGER,
    "state" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "emptiedAt" DATETIME,
    CONSTRAINT "Table_tierId_fkey" FOREIGN KEY ("tierId") REFERENCES "Tier" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TableSeat" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tableId" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "vrpId" INTEGER NOT NULL,
    "playerName" TEXT,
    "joinedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "seenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TableSeat_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "Table" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Shoe" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tableId" INTEGER NOT NULL,
    "decks" INTEGER NOT NULL DEFAULT 4,
    "cards" TEXT NOT NULL,
    "cursor" INTEGER NOT NULL DEFAULT 0,
    "shuffles" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Shoe_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "Table" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

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
