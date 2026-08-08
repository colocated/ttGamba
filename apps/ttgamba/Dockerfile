# syntax=docker/dockerfile:1
#
# Build from the REPOSITORY ROOT, not from this directory:
#
#   docker build -f apps/ttgamba/Dockerfile \
#     --build-arg BUILD_COMMIT=$(git rev-parse --short HEAD) -t ttgamba .
#
# The context has to include the lockfile, pnpm-workspace.yaml and packages/,
# none of which are reachable from in here.

FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /repo

# ── Dependencies ──────────────────────────────────────────────────────────────
# Manifests only, so this layer is rebuilt when dependencies change and not when
# a component does.
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/ttgamba/package.json      apps/ttgamba/
COPY packages/db/package.json       packages/db/
COPY packages/userapp/package.json  packages/userapp/
COPY packages/window/package.json   packages/window/
# `postinstall` runs `prisma generate`, which reads the schema — so the schema
# has to be here before install, not after it. Copying the whole directory
# rather than the one file also brings the migrations, which are what
# `db:deploy` runs and are worth having in the image.
COPY apps/ttgamba/prisma apps/ttgamba/prisma
# `ttgamba...` is the app and everything it depends on — the three workspace
# packages come along, anything else in apps/ does not.
RUN pnpm install --frozen-lockfile --filter ttgamba...

# ── Build ─────────────────────────────────────────────────────────────────────
FROM base AS build
# There is no .git in the context, so the build id has no commit to read. Passing
# it keeps a player's "I'm on build X" traceable to a revision; without it the
# id is still unique, just anonymous. See packages/window/src/next-config.ts.
ARG BUILD_COMMIT=nogit
ENV BUILD_COMMIT=$BUILD_COMMIT
# `lib/db.ts` builds its Prisma singleton at module scope, so merely importing
# it — which `next build` does for every route, /play/[slug] included — throws
# without a URL, real database or not. This placeholder is never opened: `pg`'s
# `Pool` connects lazily, and the route that imports it is `force-dynamic` (see
# that page), so nothing queries it before the container is thrown away. Same
# shape as `.env.example`'s `DATABASE_URL`, deliberately — the real one is
# runtime-only (see DEPLOYMENT.md) and never belongs in this layer.
ENV DATABASE_URL=postgresql://placeholder:placeholder@localhost:5432/placeholder
# The whole installed tree, symlinks and all — pnpm's node_modules is a graph of
# them and copying the directories individually would break it.
COPY --from=deps /repo ./
COPY . .
RUN pnpm --filter ttgamba build

# ── Runtime ───────────────────────────────────────────────────────────────────
FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Standalone output in a workspace is rooted at the *workspace*, so the server
# lands at apps/ttgamba/server.js and its node_modules at the top. Unpacking it
# anywhere but the working root would break every traced path inside it.
COPY --from=build /repo/apps/ttgamba/.next/standalone ./
COPY --from=build /repo/apps/ttgamba/.next/static     ./apps/ttgamba/.next/static
COPY --from=build /repo/apps/ttgamba/public           ./apps/ttgamba/public

# `node` exists in the base image already; the app has no reason to be root.
USER node

EXPOSE 3000
CMD ["node", "apps/ttgamba/server.js"]
