# Deploying ttGamba

The app is a Next.js server; the database is [Turso](https://turso.tech). This
covers getting the schema onto Turso and keeping it there, which is the part
with a wrinkle in it.

## The wrinkle, up front

**`prisma migrate deploy` does not work against Turso.** Prisma's schema engine
speaks `file:` and nothing else — hand it a `libsql://` URL and it fails with
`P1013: the scheme is not recognized`. Turso's own guide says the same thing:
"Prisma Migrate and Introspection workflows are currently not supported when
working with Turso."

So the schema reaches Turso in two moves:

1. **Author** migrations locally, against `dev.db`, with `prisma migrate dev`.
   This is where Prisma's tooling works normally.
2. **Apply** the SQL it generated to Turso with `pnpm db:deploy`.

## One-time setup

Install the [Turso CLI](https://docs.turso.tech/cli/installation), then:

```sh
turso auth login
turso db create ttgamba

turso db show ttgamba --url        # -> libsql://ttgamba-<org>.turso.io
turso db tokens create ttgamba     # -> the auth token
```

Give the hosting environment these two variables:

| Variable | Value |
| --- | --- |
| `TURSO_DATABASE_URL` | `libsql://ttgamba-<org>.turso.io` |
| `TURSO_AUTH_TOKEN` | The token from `turso db tokens create` |

These are Turso's own names, so their Vercel and Netlify integrations set them
for you — connect the integration and there is nothing to paste. `DATABASE_URL`
is not used in production; it is the local development file and the name the
Prisma CLI reads.

Tokens do not expire by default. Pass `--expiration 30d` if you would rather
they did, and remember that the app stops working when one lapses.

## Deploying

```sh
pnpm install          # postinstall runs `prisma generate`
pnpm build
```

Then, with `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` in the environment:

```sh
pnpm db:deploy
```

Run it **before** the new build starts serving, so the schema is never behind
the code reading it. It is safe to run when nothing has changed — it reports
`No pending migrations` and exits.

`db:deploy` runs `tt-db-deploy`, which is
[`@tt/db`](../../packages/db)'s migration deployer — shared with every app in
the workspace, because none of it is specific to this schema. It is a stand-in
for `prisma migrate deploy` rather than an alternative to it: same `migration.sql`
files, same order, same `_prisma_migrations` bookkeeping, same sha256
checksums. A database deployed this way is one `prisma migrate status`
recognises. It also:

- applies only what is missing, so it is idempotent;
- refuses to run if an already-applied migration's checksum has changed, which
  means someone edited history and the database cannot be reconciled by
  re-running it;
- refuses if a previous run died mid-migration, rather than guessing how far it
  got.

Turso's guide suggests piping the SQL in by hand instead:

```sh
turso db shell ttgamba < ./prisma/migrations/<timestamp>_init/migration.sql
```

That works, and is the fallback if the script is ever in doubt — but it records
nothing, so the second deploy re-applies the first migration and fails on
tables that already exist. Fine for the initial load, unhelpful thereafter.

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
old text and no amount of re-running the new one reconciles that — `db:deploy`
will stop rather than let it happen. Write a new migration instead.

Editing one that has only ever touched your own `dev.db` is fine; rebuild with
`prisma migrate reset` afterwards so the checksum on disk matches.

## Why this does not match Turso's Prisma guide

[Turso's guide](https://docs.turso.tech/sdk/ts/orm/prisma) is written for
Prisma 6. This project is on Prisma 7, where four things in it have changed.
Following the guide literally would break the build, so if you are comparing
the two, these differences are deliberate:

| Turso's guide (Prisma 6) | Here (Prisma 7) |
| --- | --- |
| `provider = "prisma-client-js"` | `provider = "prisma-client"`, with an explicit `output` |
| `previewFeatures = ["driverAdapters"]` | Driver adapters are standard; the flag no longer exists |
| `url` in the `datasource` block | Lives in `prisma.config.ts` |
| `new PrismaLibSQL(...)` | `new PrismaLibSql(...)` — the export was renamed, and the old spelling is `undefined` at runtime |

What the guide gets right, and what still holds, is the shape: one
`@libsql/client` for both ends, the adapter passed to `PrismaClient`, and
migrations authored locally because the CLI cannot reach Turso.

## Checking a deployment

```sh
turso db shell ttgamba "SELECT migration_name, finished_at FROM _prisma_migrations"
turso db shell ttgamba ".schema User"
```

`finished_at` being null on a row means that migration failed part-way and the
database needs looking at by hand.

## Before real chips move

`lib/account.ts` trusts the vRP ID the browser sends it, and server actions are
public endpoints. Nothing behind it can currently be changed, so this is
survivable today — but it must be fixed before deposits exist, or anyone can
read and create accounts for any player. The game client exposes each player's
`pkey` (public API key) to be checked server-side against the Tycoon API.
