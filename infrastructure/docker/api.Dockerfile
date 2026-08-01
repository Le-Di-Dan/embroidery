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
# The three workspace packages the API loads at RUNTIME must be importers of
# this install, or pnpm never creates their own `node_modules` (APP2-T01-C1).
# pnpm links in isolated mode: `@nestjs/common` for `@embroidery/persistence`
# lives at `packages/persistence/node_modules/@nestjs/common`, not at the root.
# `@embroidery/api...` (note the ellipsis) extends the filter to the API's
# workspace dependencies; without it only `apps/api/node_modules` is populated
# and `dist/main.js` dies on the first `require` out of a workspace package.
COPY packages/database/package.json packages/database/
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
COPY --from=build --chown=node:node /app/packages/persistence/dist ./packages/persistence/dist
COPY --from=build --chown=node:node /app/packages/persistence/package.json ./packages/persistence/package.json
COPY --from=prod-deps --chown=node:node /app/packages/persistence/node_modules ./packages/persistence/node_modules
COPY --from=build --chown=node:node /app/packages/object-storage/dist ./packages/object-storage/dist
COPY --from=build --chown=node:node /app/packages/object-storage/package.json ./packages/object-storage/package.json
COPY --from=prod-deps --chown=node:node /app/packages/object-storage/node_modules ./packages/object-storage/node_modules
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:4000/api/health || exit 1
WORKDIR /app/apps/api
CMD ["node", "dist/main.js"]
