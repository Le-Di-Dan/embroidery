# syntax=docker/dockerfile:1
# Business API (NestJS) — build from the monorepo root context:
#   docker build -f infrastructure/docker/api.Dockerfile .
# Node 22 LTS, pinned. Do not use "latest".

FROM node:22.14.0-alpine AS base
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /app

# ---------------------------------------------------------------------------
# deps: install all workspace dependencies (cached until a manifest changes)
# ---------------------------------------------------------------------------
FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/storefront/package.json apps/storefront/
COPY apps/admin/package.json apps/admin/
COPY apps/api/package.json apps/api/
COPY apps/worker/package.json apps/worker/
COPY packages/api-client/package.json packages/api-client/
COPY packages/contracts/package.json packages/contracts/
COPY packages/design-document/package.json packages/design-document/
COPY packages/design-engine/package.json packages/design-engine/
COPY packages/domain-types/package.json packages/domain-types/
COPY packages/eslint-config/package.json packages/eslint-config/
# APP4-B01 added this package and the API's notification module imports it. A
# workspace package that is not copied here is not an importer of this install,
# so pnpm never creates its `node_modules` symlink — and the later `COPY . .`
# brings the sources without ever linking them. The dev target then fails to
# compile with `Cannot find module '@embroidery/notification-delivery'`
# (FU-APP4-DEV-API-IMAGE-01).
COPY packages/notification-delivery/package.json packages/notification-delivery/
COPY packages/observability/package.json packages/observability/
COPY packages/prettier-config/package.json packages/prettier-config/
COPY packages/styles/package.json packages/styles/
COPY packages/test-utils/package.json packages/test-utils/
COPY packages/typescript-config/package.json packages/typescript-config/
COPY packages/ui/package.json packages/ui/
COPY packages/validation/package.json packages/validation/
RUN pnpm install --frozen-lockfile

# ---------------------------------------------------------------------------
# dev: hot-reload development server (used by docker-compose.dev.yml)
# ---------------------------------------------------------------------------
FROM deps AS dev
COPY . .
# Workspace runtime packages ship TypeScript source; compile them to JS so both
# `tsc` and the Node runtime resolve @embroidery/database, @embroidery/persistence
# and @embroidery/object-storage to dist, not raw .ts. `@embroidery/api^...`
# selects every workspace dependency of the API *except* the API itself (which
# the dev server compiles from source), so a newly added workspace dependency is
# built here automatically instead of failing `nest build` with TS2307.
RUN pnpm --filter "@embroidery/api^..." build
ENV NODE_ENV=development
EXPOSE 4000
CMD ["pnpm", "--filter", "@embroidery/api", "dev"]

# ---------------------------------------------------------------------------
# build: compile to dist/
# ---------------------------------------------------------------------------
FROM deps AS build
COPY . .
# `@embroidery/api...` builds the API and its workspace dependencies
# (@embroidery/persistence, @embroidery/database) to dist first, so the API
# compiles against their declarations and runs against their compiled JS.
RUN pnpm --filter "@embroidery/api..." build

# ---------------------------------------------------------------------------
# prod-deps: production-only node_modules for the API workspace
# ---------------------------------------------------------------------------
FROM base AS prod-deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/storefront/package.json apps/storefront/
COPY apps/admin/package.json apps/admin/
COPY apps/api/package.json apps/api/
COPY apps/worker/package.json apps/worker/
COPY packages/api-client/package.json packages/api-client/
COPY packages/contracts/package.json packages/contracts/
COPY packages/design-document/package.json packages/design-document/
COPY packages/design-engine/package.json packages/design-engine/
COPY packages/domain-types/package.json packages/domain-types/
COPY packages/eslint-config/package.json packages/eslint-config/
COPY packages/observability/package.json packages/observability/
COPY packages/prettier-config/package.json packages/prettier-config/
COPY packages/styles/package.json packages/styles/
COPY packages/test-utils/package.json packages/test-utils/
COPY packages/typescript-config/package.json packages/typescript-config/
COPY packages/ui/package.json packages/ui/
COPY packages/validation/package.json packages/validation/
# The four workspace packages the API loads at RUNTIME must be importers of
# this install, or pnpm never creates their own `node_modules` (APP2-T01-C1).
# pnpm links in isolated mode: `@nestjs/common` for `@embroidery/persistence`
# lives at `packages/persistence/node_modules/@nestjs/common`, not at the root.
# `@embroidery/api...` (note the ellipsis) extends the filter to the API's
# workspace dependencies; without it only `apps/api/node_modules` is populated
# and `dist/main.js` dies on the first `require` out of a workspace package.
COPY packages/database/package.json packages/database/
COPY packages/notification-delivery/package.json packages/notification-delivery/
COPY packages/object-storage/package.json packages/object-storage/
COPY packages/persistence/package.json packages/persistence/
RUN pnpm install --frozen-lockfile --prod --filter "@embroidery/api..."

# ---------------------------------------------------------------------------
# runner: minimal production image, non-root
# ---------------------------------------------------------------------------
FROM node:22.14.0-alpine AS runner
ENV NODE_ENV=production
WORKDIR /app
USER node
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=prod-deps --chown=node:node /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build --chown=node:node /app/apps/api/dist ./apps/api/dist
COPY --from=build --chown=node:node /app/apps/api/package.json ./apps/api/package.json
# Workspace runtime packages: node_modules symlinks resolve to these compiled
# outputs (raw src/*.ts is never shipped or loaded at runtime).
#
# Each also brings its OWN `node_modules`. Under pnpm's isolated linking a
# package resolves its dependencies from its own directory, so shipping
# `packages/persistence/dist` without `packages/persistence/node_modules` gives
# a container that builds green and then exits on the first require with
# `Cannot find module '@nestjs/common'` — invisible to the development image,
# which serves TypeScript sources over a bind mount and never loads `dist`
# (APP2-T01-C1).
COPY --from=build --chown=node:node /app/packages/database/dist ./packages/database/dist
COPY --from=build --chown=node:node /app/packages/database/package.json ./packages/database/package.json
COPY --from=prod-deps --chown=node:node /app/packages/database/node_modules ./packages/database/node_modules
# The forward-only migration history itself: `.sql` files under
# `packages/database/migrations`, which `tsc` does not emit and `dist` therefore
# never contained. Without them the deployment migration step (`APP12-H02` §10)
# starts, resolves an empty directory and reports "up to date" against an
# unmigrated database — a silent success that is worse than a failure. The
# runner resolves this exact path from its own `__dirname`
# (`packages/database/src/cli/migrate-deployment.ts`).
COPY --from=build --chown=node:node /app/packages/database/migrations ./packages/database/migrations
# The seed datasets, for the same reason as the migrations above and found the
# same way — by running the real thing. `tsc` emits no `.json`, so
# `packages/database/seed` reached no image, and `staff-bootstrap` failed with
# `ENOENT: … app4-policy-configuration.seed.json` after successfully composing
# the whole application. The dataset loaders resolve this exact directory from
# the package root (`join(dirname(packageJsonPath), 'seed')`).
COPY --from=build --chown=node:node /app/packages/database/seed ./packages/database/seed
COPY --from=build --chown=node:node /app/packages/persistence/dist ./packages/persistence/dist
COPY --from=build --chown=node:node /app/packages/persistence/package.json ./packages/persistence/package.json
COPY --from=prod-deps --chown=node:node /app/packages/persistence/node_modules ./packages/persistence/node_modules
COPY --from=build --chown=node:node /app/packages/object-storage/dist ./packages/object-storage/dist
COPY --from=build --chown=node:node /app/packages/object-storage/package.json ./packages/object-storage/package.json
COPY --from=prod-deps --chown=node:node /app/packages/object-storage/node_modules ./packages/object-storage/node_modules
# APP4-B01: the API seals every delivery envelope through this package, so the
# runner needs its compiled output. No `node_modules` line — it has no runtime
# dependency of its own (node:crypto only), exactly like `domain-types`.
COPY --from=build --chown=node:node /app/packages/notification-delivery/dist ./packages/notification-delivery/dist
COPY --from=build --chown=node:node /app/packages/notification-delivery/package.json ./packages/notification-delivery/package.json
# APP12-H02: the three workspace packages the API loads at runtime that this
# stage had never shipped.
#
# The production API image could not start. `AppModule` -> `DesignModule` ->
# `CatalogPlacementReadModule` -> `product-placement-geometry` requires
# `@embroidery/design-engine`, added as an API runtime dependency at APP3 with no
# matching COPY here, so `dist/main.js` died on `MODULE_NOT_FOUND` before it
# listened. It is the exact failure this file already records twice — APP2-T01-C1
# for `persistence`, APP3-B01N for the worker's `domain-types` — and it was
# invisible for the same reason: the development image bind-mounts TypeScript
# sources and never loads `dist`, and nothing before H02 had started this stage.
#
# Derived from what the compiled output actually loads, not from the one error
# observed and not from the declared dependency list. `grep -rho
# 'require("@embroidery/[a-z-]*")' /app/apps/api/dist | sort -u` inside the built
# image reports exactly seven: database, design-document, design-engine,
# domain-types, notification-delivery, object-storage, persistence. Fixing only
# the package that happened to be required first would have produced the next
# `MODULE_NOT_FOUND` on the next boot.
#
# `@embroidery/contracts` is deliberately NOT among them and is deliberately not
# copied. It is a source-only package (`"main": "./src/index.ts"`, no build
# script) that the API imports types from; the emitted JavaScript contains no
# `require` for it, so shipping it would add an unbuildable path to the image to
# satisfy a dependency that does not exist at runtime.
#
# `design-engine` additionally brings its own `node_modules`, and that is not
# belt-and-braces. It depends on `@embroidery/design-document`, and pnpm links in
# isolated mode: the symlink lives at `packages/design-engine/node_modules/@embroidery/design-document`,
# never at the root. Shipping both `dist` directories without it produced an
# image where `require("@embroidery/design-engine")` still failed — with
# `Cannot find module '@embroidery/design-document'`, a package that was
# demonstrably present two directories away. The same trap APP2-T01-C1 recorded
# for `persistence`.
#
# `design-document` and `domain-types` need no such line: neither declares a
# dependency of any kind.
COPY --from=build --chown=node:node /app/packages/domain-types/dist ./packages/domain-types/dist
COPY --from=build --chown=node:node /app/packages/domain-types/package.json ./packages/domain-types/package.json
COPY --from=build --chown=node:node /app/packages/design-document/dist ./packages/design-document/dist
COPY --from=build --chown=node:node /app/packages/design-document/package.json ./packages/design-document/package.json
COPY --from=build --chown=node:node /app/packages/design-engine/dist ./packages/design-engine/dist
COPY --from=build --chown=node:node /app/packages/design-engine/package.json ./packages/design-engine/package.json
COPY --from=prod-deps --chown=node:node /app/packages/design-engine/node_modules ./packages/design-engine/node_modules
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:4000/api/health || exit 1
WORKDIR /app/apps/api
CMD ["node", "dist/main.js"]
