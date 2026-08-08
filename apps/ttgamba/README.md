# ttGamba

An in-game casino for Transport Tycoon, loaded as a FiveM user app. Chips only,
never real money — see [PRODUCT.md](PRODUCT.md) for what the app is, and
[DESIGN.md](../../DESIGN.md) for how it is allowed to look.

One app in a workspace. The window it draws itself inside, and the bridge it
talks to the game client over, are [`@tt/window`](../../packages/window) and
[`@tt/userapp`](../../packages/userapp) — shared with every other user app here,
and the [workspace README](../../README.md) says which package a change belongs
in. What is left in this directory is the casino.

## Running it

```sh
pnpm install         # from the repository root; also generates the Prisma client
pnpm bas ttgamba     # build and serve — the usual way to test in game
pnpm dev ttgamba     # dev server, when you want Fast Refresh
```

Then point the in-game user app (F1) at the dev server's URL.

**It has to be run in game.** Every page reads the player out of the game
client, so when nothing answers — including in an ordinary browser tab — the
window shows `InstallGuide` (`@tt/window`) instead of the app: the steps for
loading it as a user app, with this deployment's own address to copy. That
doubles as how you hand ttGamba to a player, since sending them the link and
letting them open it lands them on the instructions.

There is no bypass today, which is worth knowing before reaching for one to
work on layout.

## Database

The store is Postgres, both in production and in development — self-hosted
alongside the app rather than reached over the network to a managed service,
which is what makes it worth being the same engine on both ends: `DATABASE_URL`
is the one variable either side reads, and there is no split between what the
app connects with and what the Prisma CLI does.

Local development needs a real Postgres reachable at whatever `.env`'s
`DATABASE_URL` names — `.env.example` has a one-line `docker run` for a
throwaway one. Production configuration and the deployment procedure are in
**[DEPLOYMENT.md](DEPLOYMENT.md)**.

### Changing the schema

Edit `prisma/schema.prisma`, then:

```sh
pnpm db:migrate --name what_changed
```

That writes a migration to `prisma/migrations/` and applies it to whatever
`DATABASE_URL` points at locally. Commit the migration as well as the schema —
it is the thing that gets deployed. `pnpm db:studio` opens a browser UI over
the same database if you want to poke at rows by hand — which is currently
also how you make someone a banker, since nothing in the app changes a role.
From the repository root that one is `pnpm db ttgamba`.

It does **not** regenerate the client. With this project's config, `prisma
migrate dev` applies the SQL and stops, so `lib/generated/prisma` still
describes the old schema and new models fail to typecheck. Follow it with:

```sh
pnpm exec prisma generate
```

## The banker desk

The app cannot reach in-game money, so chips only cross that boundary by way of
a person: a player asks, a banker meets them in the world, and cash goes one way
while chips go the other. `/banker` is where that queue is worked, and it is
reachable only by a `banker` or a `superadmin`.

Three ideas are worth knowing before touching it:

**Requests move through statuses, and only chips-at-the-end is irreversible.**
`pending → approved → closed`, or `pending → denied`; a player may `cancel`
their own until it is settled. Which moves are legal lives in `STAFF_MOVES`
(`lib/desk.ts`) and is enforced server-side by the same table the buttons are
built from, so the interface never knows a rule the server does not.

**Deposits credit at the end; withdrawals debit at the start.** A deposit
credits nothing until a banker marks it actioned, because the in-game cash has
not been handed over yet. A withdrawal takes the chips out of the balance the
moment it is asked for and *holds* them — otherwise a player could ask to cash
out, lose it all at blackjack while the request sits in the queue, and leave the
banker owing cash against a balance that no longer covers it. Held chips come
back in full on a denial or a cancellation. `lib/requests.ts` has the long
version.

**Everything is written down.** `lib/audit.ts` records an event for every action
that moves a balance, changes a permission, or advances a request, and never
updates or deletes one — a mistake is corrected by a further event. Names are
copied onto the row at the time, so the trail still reads correctly after a
rename or a demotion. The action registry is in `lib/desk.ts`; a game that
starts taking bets adds its keys there and calls `record`, and the audit tab
picks them up with nothing else to change.

### Before real chips move

`lib/auth.ts` trusts the vRP ID the browser sends it. Every desk route
re-reads the caller's *role* from the database on every call and cannot be
talked out of it — so removing someone's banker role locks them out
immediately, and the interface catches up within a click or two — but the
**identity** behind that role is still the browser's word for it. Nothing else
in the app authenticates either, and the desk inherits that rather than
introducing it.

That is the outstanding piece of work before this is trusted with real
balances. The client exposes each player's `pkey` (public API key) for exactly
this, to be checked server-side against the Tycoon API. `authorise` in
`lib/auth.ts` is deliberately the single door every route goes through — player
self-service included — so that check has one place to go.

## Games, tables and shoes

Which games exist is not in the source. `/admin/games` is where they are
arranged — name, icon, address, engine, and whether the shelf lists them — and
the shelf, the games index and every route under `/play` are readers over those
rows. There is one page for all of them, `app/play/[slug]/page.tsx`, because a
file cannot be written for a game an administrator has not invented yet.

Three layers, and it is worth knowing which one you are in:

**A game** is a definition. It holds no state and no rules; `engine` names the
code that plays it.

**A tier** is a class of table — "Blackjack, 1M–10M, five seats, keep one open"
— and it is the layer the admin panel actually edits. Tables are not configured
directly because a fixed list of them fills up: `floor` is how many stand open
at all times, and when every table in a tier is occupied the app opens another
beyond it, which is taken away again when it empties.

**A table** is somewhere to sit. It owns the seats, the round in progress and
the shoe. Singleplayer games have tables too — one each, made on demand, never
listed — so that an engine never has to know which kind of game it is playing.

A seat is *held* by the game page's poll rather than released when a player
leaves: the window is an iframe the game can take away, so there is no goodbye
to listen for. One that goes quiet is swept, and the last seat leaving a table
throws its shoe away — the next player to sit down gets a fresh cut rather than
inheriting somebody else's count. `lib/tables.ts` is that whole lifecycle and
`lib/shoe.ts` is the cards, which never leave the server.

### Adding an engine

`lib/engines.ts` is the list of what this build can play, and it is data only,
because `"use server"` modules import it. Add an entry there, then a component
in `components/engines/` and a line in its registry — the map is typed against
the registry, so forgetting the second half is a type error rather than a blank
screen.

The `engine` field in the admin panel is deliberately free text and not a
dropdown. A game can be set up before its engine has been written, and a name
that resolves to nothing is reported to whoever opens the game — *Game engine
"blackjack2k4k" does not exist* — rather than being unsayable.

## What is a user app?

Transport Tycoon is a FiveM server, and a user app is a web page loaded in an
embed over the game. It gets the whole viewport, which is why this one draws
itself as a floating window rather than filling the screen.

The client feeds the page a stream of key/value data — who the player is, what
they are carrying, where they are — and takes instructions back via
`window.parent.postMessage`. Both directions are wrapped in
[`@tt/userapp`](../../packages/userapp); the player themself is read out of that
stream by `@tt/userapp/gamedata`. Neither invents anything the
client does not send, so both are worth reading before adding a feature that
needs game state.

`@tt/userapp/gamekeys` is a transcription of the docs' data table
— what each key is and what it means — and is reference text for the admin
panel rather than something the app runs on. The docs call that list incomplete,
so treat a missing entry as a gap in the table and not as a key that cannot
arrive.

Official docs: <https://ttycoon.eu/userapps/docs>

The site refuses requests without a browser `User-Agent`, so `curl` needs one
spoofed to read it.

## Admin tools

`/admin` is a `superadmin`-only panel. **Games** is where the shelf is arranged
(above); the other three tabs talk to the game client directly — playing the
curated sound effects, watching the client's data cache fill in, and building
the four on-screen text commands (`info`, `popup`, `oneliner`, `message`)
against a live preview of the action being posted.

The two halves are guarded differently and it matters. Nothing behind Sound,
Game Data or Titles reaches the server, so there is no `authorise` call and the
role check in `components/admin/shell.tsx` is the whole of the gate — which is
sound only because everything there is something the player's own client would
already do for them. Games is not like that: it writes rows every player then
reads, so it goes through `lib/catalogue.ts`, which re-reads the caller's role
on every call like the banker desk does. Anything added to that panel that moves
a balance or writes a row belongs on the second side of that line.
