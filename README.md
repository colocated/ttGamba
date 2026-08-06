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
poke at rows by hand.

### Before real chips move

`lib/account.ts` trusts the vRP ID the browser sends it. That is survivable
today — the only things behind it are a role and a chip balance that nothing
can yet change — but it must be fixed before the deposit flow exists. The
client exposes each player's `pkey` (public API key) for exactly this, to be
checked server-side against the Tycoon API. The module is deliberately a single
function so that check has one place to go.

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
