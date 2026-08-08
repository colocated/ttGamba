# Deploying ttGamba

The app is a Next.js server; the database is Postgres, self-hosted alongside
it rather than reached over the network to a managed service. This used to be
[Turso](https://turso.tech), and that choice came with a wrinkle Postgres does
not have: Turso's schema engine only spoke `file:` and rejected `libsql://`
outright, so `prisma migrate deploy` could never reach it and this app carried
a hand-rolled deployer to work around that. Postgres speaks the same protocol
the schema engine already does, so there is nothing to work around — deploying
migrations here is the ordinary `prisma migrate deploy`.

## One-time setup

Provision a Postgres instance — a Coolify "Service" from its template gallery
if that's where the app itself runs, so both live on the same host and a query
is a local connection rather than a trip across the network. However it's
provisioned, you need one thing out of it:

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | `postgresql://<user>:<password>@<host>:5432/<database>` |

Same variable, both for the app at runtime and for the Prisma CLI locally —
unlike Turso, there is no second name for it.

## Deploying

```sh
pnpm install          # postinstall runs `prisma generate`
pnpm build
```

Then, with `DATABASE_URL` pointed at the real database:

```sh
pnpm db:deploy
```

Run it **before** the new build starts serving, so the schema is never behind
the code reading it. It is safe to run when nothing has changed — it reports
that there is nothing pending and exits. `db:deploy` is `prisma migrate
deploy`, unwrapped — same `migration.sql` files, same order, same
`_prisma_migrations` bookkeeping Prisma has always used.

**The container image does this step itself.** `apps/ttgamba/bin/entrypoint.mjs`
applies pending migrations before the server starts, so a Coolify (or any
container) deploy needs nothing run by hand — the steps above are for running
the app outside a container. It isn't `prisma migrate deploy` under the hood:
the image's standalone output deliberately has no CLI or query-engine binaries
in it, so `packages/db/src/migrate.mjs` talks to Postgres directly with `pg`
instead, doing the same bookkeeping. Set `SKIP_MIGRATIONS` to anything to boot
straight to the server instead — for a rollback to an image whose migrations
are already applied, or a multi-replica deploy where only one instance should
be the one to migrate.

## Changing the schema

```sh
# 1. Edit prisma/schema.prisma, then:
pnpm db:migrate --name what_changed

# 2. Commit BOTH the schema and the generated prisma/migrations/ directory.
#    The migration is the artefact that gets deployed; the schema alone
#    deploys nothing.

# 3. Ship, then apply:
pnpm db:deploy
```

Never edit a migration that has been deployed. The database was built by the
old text and no amount of re-running the new one reconciles that —
`prisma migrate deploy` will refuse rather than let it happen. Write a new
migration instead.

Editing one that has only ever touched your own local database is fine;
rebuild with `prisma migrate reset` afterwards so the checksum on disk matches.

## Checking a deployment

```sh
pnpm exec prisma migrate status
```

Or query `_prisma_migrations` directly against the database if you want the
raw rows — `finished_at` being null on one means it failed part-way and the
database needs looking at by hand.

## Before real chips move

`lib/account.ts` trusts the vRP ID the browser sends it, and server actions are
public endpoints. Nothing behind it can currently be changed, so this is
survivable today — but it must be fixed before deposits exist, or anyone can
read and create accounts for any player. The game client exposes each player's
`pkey` (public API key) to be checked server-side against the Tycoon API.
