# ttGamba

An in-game casino for Transport Tycoon, loaded as a FiveM user app. Chips only,
never real money — see [PRODUCT.md](PRODUCT.md) for what the app is, and
[DESIGN.md](DESIGN.md) for how it is allowed to look.

## Running it

```sh
pnpm install     # also generates the Prisma client
pnpm dev
```

Then point the in-game user app (F1) at the dev server's URL.

**It has to be run in game.** Every page reads the player out of the game
client, so when nothing answers — including in an ordinary browser tab — the
window shows `components/install-guide.tsx` instead of the app: the steps for
loading it as a user app, with this deployment's own address to copy. That
doubles as how you hand ttGamba to a player, since sending them the link and
letting them open it lands them on the instructions.

There is no bypass today, which is worth knowing before reaching for one to
work on layout.

## Database

The store is [Turso](https://tur.so) in production and a local SQLite file in
development. Turso is libSQL, which is SQLite, so both ends are the same
database engine reached two different ways — one `@libsql/client` covers both
and nothing in the app branches on which is in use.

Copy `.env.example` to `.env` and you have a working `dev.db` — nothing else to
set up locally. Production configuration and the Turso deployment procedure are
in **[DEPLOYMENT.md](DEPLOYMENT.md)**, along with why `prisma migrate deploy`
cannot be used and where this project deliberately departs from Turso's
published Prisma guide.

### Changing the schema

Edit `prisma/schema.prisma`, then:

```sh
pnpm db:migrate --name what_changed
```

That writes a migration to `prisma/migrations/` and applies it to `dev.db`.
Commit the migration as well as the schema — it is the thing that gets
deployed. `pnpm db:studio` opens a browser UI over the same file if you want to
poke at rows by hand — which is currently also how you make someone a banker,
since nothing in the app changes a role.

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

## What is a user app?

Transport Tycoon is a FiveM server, and a user app is a web page loaded in an
embed over the game. It gets the whole viewport, which is why this one draws
itself as a floating window rather than filling the screen.

The client feeds the page a stream of key/value data — who the player is, what
they are carrying, where they are — and takes instructions back via
`window.parent.postMessage`. Both directions are wrapped in
[`lib/userapp.ts`](lib/userapp.ts); the player themself is read out of that
stream by [`lib/gamedata.ts`](lib/gamedata.ts). Neither invents anything the
client does not send, so both are worth reading before adding a feature that
needs game state.

Official docs: <https://ttycoon.eu/userapps/docs>
