# tt-userapps

Transport Tycoon user apps, and the two packages they are built out of.

```
apps/
  ttgamba/          The casino. See apps/ttgamba/README.md.
packages/
  userapp/          @tt/userapp — the game client bridge. No React components.
  window/           @tt/window  — the floating window, its chrome and its tokens.
  db/               @tt/db      — Turso wiring, Redis caching, migrations. No schema.
```

```sh
pnpm install
pnpm dev ttgamba            # or: pnpm dev --app ttgamba
pnpm bas ttgamba            # build and serve, for testing in game
pnpm db ttgamba             # Prisma Studio over that app's database
```

**`bas` is usually the one you want for in-game testing.** `next dev` pays for
Fast Refresh on every navigation, which is a poor trade when the loop is "make a
change, look at it in game, stop the game". `bas` builds once and serves the
production output — the same `server.js` the container runs, so what you test is
what ships. Turbopack's filesystem cache makes the second build far cheaper than
the first (~35s against ~135s here).

`dev`, `bas`, `start` and `db` take an app name and will not guess one — bare
`pnpm dev` lists what is here and exits, and an unknown name gets
*no app "x" detected* with the same list. Apps are discovered by reading
`apps/`, so adding one needs no edit to any root script. Anything after the app
name is passed straight through: `pnpm bas ttgamba --port 3001`. In a chained
command like `bas` those extra arguments go to the last step, since `--port` is
for the server rather than the build.

`pnpm db <app>` replaces running `prisma studio` by hand, which no longer has
one directory to be run from. It runs that app's own `db:studio`, so it picks up
that app's schema, its `prisma.config.ts` and its `.env` — and an app that owns
no database has no such script, which is what you are told, along with the
scripts it does have. Studio reads `DATABASE_URL` and never Turso, for the same
reason `db:migrate` does: the CLI is pointed at the local file by design.

`pnpm build` builds every app, which is what CI wants; one app is
`pnpm --filter <app> build`.

## Which package does this belong in?

**`@tt/userapp`** is the protocol and nothing else: the `postMessage` action
list, the inbound data stream, the player read out of it, and the transcription
of the docs' key table. It has no components and no CSS, so a server-side or
headless app can depend on it.

It exists because all of that is a transcription of somebody else's document
(<https://ttycoon.eu/userapps/docs>). When that readme changes, the edit should
happen once.

**`@tt/window`** is the frame every app draws itself inside — the titlebar, the
shelf, the modal host, the boot script, and the design tokens. Every app is
handed the whole game viewport and none of them may fill it, so this is shared
for the same reason the protocol is: it is the same problem each time.

**`@tt/db`** is how an app reaches Turso: URL and token resolution, the libSQL
driver adapter, one client per process across dev's hot reload, optional Redis
query caching, and the migration deployer that exists because `prisma migrate
deploy` cannot speak `libsql://`. All of that is identical in every app, and
none of it knows anything about a schema.

It deliberately does **not** hold a Prisma client. `prisma generate` builds one
from a single schema into the app that owns it, so its type cannot live in a
shared package — `createPrismaSingleton` is generic and takes a factory instead,
which keeps the app's models fully typed. `packages/db/README.md` covers that,
and where a cache extension would go.

**An app** owns everything that is about *that* app — its pages, its schema and
migrations, its rules. If a change is about the casino, it belongs in
`apps/ttgamba`.

## Changing the way an app looks

Four ways, cheapest first. Reach for the first one that does the job.

**1. Redeclare the tokens.** `@tt/window/tokens.css` is nothing but custom
properties, and Tailwind resolves whichever declaration comes last. An app's
own `globals.css` can restate any of them after the import and the whole window
changes with it — no TSX touched:

```css
@import "tailwindcss";
@import "@tt/window/base.css";
@import "@tt/window/tokens.css";
@source "../../../packages/window/src";

@theme {
  --color-felt: #6b4ea8;
  --radius-panel: 4px;
}
```

That `@source` line is not optional. Tailwind does not scan `node_modules`, so
without it every class name used inside `@tt/window` is absent from the built
stylesheet and the window renders unstyled.

**2. Pass different slots.** `Tablet` takes its brand, its status widget, its
navigation and its refresh behaviour as props. An app with no shelf passes no
`nav` and the pin control removes itself.

**3. Use the hook, drop the skin.** `useWindowFrame` is the whole of the
window's *behaviour* — geometry, dragging, resizing, the minimise state machine
— with no markup attached. `Tablet` is a skin over it, and an app that wants a
different frame can write its own against the same hook and keep everything in
[What must not change](#what-must-not-change) working.

**4. Copy the file.** Legitimate, and deliberately cheap: nothing in `Tablet`
inherits from the package once it has been copied into an app. A shared
component you cannot walk away from is worse than two that have diverged.

## What must not change

Some of `@tt/window` is not styling and not preference. A user app is an iframe
that is handed the entire game viewport and holds the player's input focus while
it is open, which makes a small number of things load-bearing:

- **The document background stays transparent.** Everything outside the window
  is the player's view of the world. `base.css`.
- **Escape → `pin` is installed outside React**, inline in the document head, so
  it survives the bundle failing to load. Without it a broken build is an
  invisible full-screen surface over a game the player can no longer click, with
  no way out. `bootstrap.ts`.
- **Nothing unloads the document.** No reloads, no `location` writes. The window
  cannot guarantee it comes back, and a page that fails to return strands the
  player in the same way. This is why the update banner asks rather than acts.
- **Reduced motion shortens animations, never removes them.** The minimise is
  committed by the frame's `animationend`; an animation that never runs never
  fires it, and the window would refuse to minimise at all.

An app that overrides one of these has a bug, not a style.

## Deploying

Each app builds to its own container image and its own GHCR package, so
visibility, retention and rollbacks are set per app rather than shared.
`.github/workflows/build.yml` builds only the apps a push actually touched — a
change under `packages/` counts as touching all of them.

```sh
docker build -f apps/ttgamba/Dockerfile \
  --build-arg BUILD_COMMIT=$(git rev-parse --short HEAD) \
  -t ttgamba .
```

The build context is the **repository root**, not the app directory — the
Dockerfile needs the lockfile, the workspace file and `packages/`. Running it
from inside `apps/ttgamba` will not work.
