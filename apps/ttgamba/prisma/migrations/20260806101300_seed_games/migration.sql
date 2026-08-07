-- The shelf, as it was before it was a table.
--
-- Blackjack, Roulette and Cross the Road used to be a constant in lib/games.ts
-- and three routes of their own. They are rows now, and this is that list moved
-- across, so an existing deployment comes up with the shelf it already had
-- rather than an empty one.
--
-- Seeded by a migration rather than by application code because there is no
-- moment in the app's life that means "first run" — every player opening the app
-- would have to check, and the check would outlive its usefulness by years. A
-- migration runs once, which is exactly the shape of the problem.
--
-- Every statement is guarded on the table being empty, so this seeds a fresh
-- database and does nothing at all to one an administrator has already arranged.
-- It cannot resurrect a game somebody deleted.

INSERT INTO "Game" ("slug", "name", "blurb", "icon", "engine", "inRail", "position", "createdAt", "updatedAt")
SELECT 'blackjack', 'Blackjack', 'Beat the dealer to 21 without going bust.', 'Spade', 'blackjack', 1, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "Game");

INSERT INTO "Game" ("slug", "name", "blurb", "icon", "engine", "inRail", "position", "createdAt", "updatedAt")
SELECT 'roulette', 'Roulette', 'Back a number, a colour, or a spread of the wheel.', 'PokerChip', 'roulette', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "Game" WHERE "slug" <> 'blackjack');

INSERT INTO "Game" ("slug", "name", "blurb", "icon", "engine", "inRail", "position", "createdAt", "updatedAt")
SELECT 'cross-the-road', 'Cross the Road', 'Cash out before the traffic gets you.', 'RoadHorizon', 'cross-the-road', 1, 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "Game" WHERE "slug" NOT IN ('blackjack', 'roulette'));

-- Stakes to go with them. Two for blackjack, so a tier list is something you can
-- see working the first time you open the lobby; one each for the others.

INSERT INTO "Tier" ("gameId", "name", "minBet", "maxBet", "seats", "floor", "position", "createdAt", "updatedAt")
SELECT "id", 'Low Roller', 100000, 5000000, 5, 1, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Game" WHERE "slug" = 'blackjack' AND NOT EXISTS (SELECT 1 FROM "Tier");

INSERT INTO "Tier" ("gameId", "name", "minBet", "maxBet", "seats", "floor", "position", "createdAt", "updatedAt")
SELECT "id", 'High Roller', 5000000, 1000000000, 5, 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Game" WHERE "slug" = 'blackjack' AND NOT EXISTS (SELECT 1 FROM "Tier" WHERE "name" <> 'Low Roller');

INSERT INTO "Tier" ("gameId", "name", "minBet", "maxBet", "seats", "floor", "position", "createdAt", "updatedAt")
SELECT "id", 'The Wheel', 100000, 500000000, 8, 1, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Game" WHERE "slug" = 'roulette' AND NOT EXISTS (SELECT 1 FROM "Tier" WHERE "gameId" = "Game"."id");

-- Floor zero: a singleplayer game has no lobby for tables to stand about in, so
-- one is opened when a player asks for it and taken away when they leave.
INSERT INTO "Tier" ("gameId", "name", "minBet", "maxBet", "seats", "floor", "position", "createdAt", "updatedAt")
SELECT "id", 'Standard', 100000, 100000000, 1, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Game" WHERE "slug" = 'cross-the-road' AND NOT EXISTS (SELECT 1 FROM "Tier" WHERE "gameId" = "Game"."id");
