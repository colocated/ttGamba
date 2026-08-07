-- Chips move out of `User` and into a table of their own.
--
-- The point is caching, not tidiness: a balance is written on every settled
-- request and every payout, so while it sat on `User` the role and identity
-- beside it could never be cached either. See prisma/schema.prisma.

-- CreateTable
CREATE TABLE "Balance" (
    "vrpId" INTEGER NOT NULL PRIMARY KEY,
    "chips" BIGINT NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Balance_vrpId_fkey" FOREIGN KEY ("vrpId") REFERENCES "User" ("vrpId") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Carry every existing balance across. This runs *before* the column is
-- dropped, and it is the whole reason this migration is written by hand:
-- `prisma migrate dev` would have generated the drop alone and taken every
-- player's chips with it.
INSERT INTO "Balance" ("vrpId", "chips", "updatedAt")
SELECT "vrpId", "chips", CURRENT_TIMESTAMP FROM "User";

-- DropColumn
-- A plain DROP COLUMN rather than the table rebuild Prisma usually emits for
-- SQLite: `Request` holds a foreign key into `User`, and dropping and renaming
-- the table underneath it is a great deal more to get wrong. Supported since
-- SQLite 3.35; this database is on 3.45.
ALTER TABLE "User" DROP COLUMN "chips";
