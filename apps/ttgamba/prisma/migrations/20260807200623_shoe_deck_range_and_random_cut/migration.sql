-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Shoe" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tableId" INTEGER NOT NULL,
    "decks" INTEGER NOT NULL DEFAULT 4,
    "cards" TEXT NOT NULL,
    "cursor" INTEGER NOT NULL DEFAULT 0,
    "cut" INTEGER NOT NULL DEFAULT 0,
    "shuffles" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Shoe_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "Table" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Shoe" ("cards", "createdAt", "cursor", "decks", "id", "shuffles", "tableId", "updatedAt") SELECT "cards", "createdAt", "cursor", "decks", "id", "shuffles", "tableId", "updatedAt" FROM "Shoe";
DROP TABLE "Shoe";
ALTER TABLE "new_Shoe" RENAME TO "Shoe";
CREATE UNIQUE INDEX "Shoe_tableId_key" ON "Shoe"("tableId");
CREATE TABLE "new_Tier" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "gameId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "minBet" BIGINT NOT NULL,
    "maxBet" BIGINT NOT NULL,
    "seats" INTEGER NOT NULL DEFAULT 5,
    "floor" INTEGER NOT NULL DEFAULT 1,
    "minDecks" INTEGER NOT NULL DEFAULT 4,
    "maxDecks" INTEGER NOT NULL DEFAULT 6,
    "position" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Tier_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Tier" ("createdAt", "floor", "gameId", "id", "maxBet", "minBet", "name", "position", "seats", "updatedAt") SELECT "createdAt", "floor", "gameId", "id", "maxBet", "minBet", "name", "position", "seats", "updatedAt" FROM "Tier";
DROP TABLE "Tier";
ALTER TABLE "new_Tier" RENAME TO "Tier";
CREATE INDEX "Tier_gameId_position_idx" ON "Tier"("gameId", "position");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
