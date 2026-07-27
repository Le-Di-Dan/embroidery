# syntax=docker/dockerfile:1
# Worker (NestJS application context) — build from the monorepo root context:
#   docker build -f infrastructure/docker/worker.Dockerfile .
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
# The worker loads these two at runtime; omitting them from the workspace here
# leaves their own node_modules uninstalled.
COPY packages/database/package.json packages/database/
COPY packages/persistence/package.json packages/persistence/
COPY packages/object-storage/package.json packages/object-storage/
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
# dev: hot-reload development runtime (used by docker-compose.dev.yml)
# ---------------------------------------------------------------------------
FROM deps AS dev
COPY . .
# Workspace runtime packages ship TypeScript source; compile them to JS so both
# `tsc` and the Node runtime resolve @embroidery/database, @embroidery/persistence
# and @embroidery/object-storage to dist, not raw .ts. `@embroidery/worker^...`
# selects every workspace dependency of the worker *except* the worker itself
# (which the dev server compiles from source), so a newly added workspace
# dependency is built here automatically instead of failing at startup.
RUN pnpm --filter "@embroidery/worker^..." build
ENV NODE_ENV=development
CMD ["pnpm", "--filter", "@embroidery/worker", "dev"]

# ---------------------------------------------------------------------------
# build: compile to dist/
# ---------------------------------------------------------------------------
FROM deps AS build
COPY . .
# `@embroidery/worker...` builds the worker and its workspace dependencies
# (@embroidery/persistence, @embroidery/database) to dist first, so the worker
# compiles against their declarations and runs against their compiled JS.
RUN pnpm --filter "@embroidery/worker..." build

# ---------------------------------------------------------------------------
# process-test: APP2-I02-FD1 real-process fixtures (test-only)
#
# Runs the genuine worker runtime as PID 1 so an uncooperative handler's fatal
# `process.exit(1)` terminates a real Linux process. Built only by
# `pnpm test:worker-runtime:fatal-process`; the `runner` stage below copies
# nothing from here, so no fixture reaches the production image, and normal
# Compose never references this target.
# ---------------------------------------------------------------------------
FROM build AS process-test
RUN pnpm --filter @embroidery/worker exec tsc -p test/process/tsconfig.fixtures.json
WORKDIR /app/apps/worker
CMD ["node", "dist-process-test/test/process/fixtures/uncooperative-worker.fixture.js"]

# ---------------------------------------------------------------------------
# prod-deps: production-only node_modules for the worker workspace
# ---------------------------------------------------------------------------
FROM base AS prod-deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/storefront/package.json apps/storefront/
COPY apps/admin/package.json apps/admin/
COPY apps/api/package.json apps/api/
COPY apps/worker/package.json apps/worker/
COPY packages/api-client/package.json packages/api-client/
# The worker loads these two at runtime; omitting them from the workspace here
# leaves their own node_modules uninstalled.
COPY packages/database/package.json packages/database/
COPY packages/persistence/package.json packages/persistence/
COPY packages/object-storage/package.json packages/object-storage/
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
# `...` includes the worker's workspace dependencies. Without it only
# `apps/worker/node_modules` is populated, and `packages/persistence/dist`
# cannot resolve its own `@nestjs/common` at runtime — the image starts and
# dies immediately. (Found by the APP2-I02-C1 signal smoke, the first thing to
# actually run this stage; the development stack uses the `dev` target.)
RUN pnpm install --frozen-lockfile --prod --filter "@embroidery/worker..."

# ---------------------------------------------------------------------------
# runner: minimal production image, non-root
# No HTTP surface yet: container health is process liveness. A dedicated
# liveness probe arrives with the queue/broker decision (open decision O-001).
# ---------------------------------------------------------------------------
FROM node:22.14.0-alpine AS runner
ENV NODE_ENV=production
WORKDIR /app
USER node
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=prod-deps --chown=node:node /app/apps/worker/node_modules ./apps/worker/node_modules
COPY --from=build --chown=node:node /app/apps/worker/dist ./apps/worker/dist
COPY --from=build --chown=node:node /app/apps/worker/package.json ./apps/worker/package.json
# Workspace runtime packages: node_modules symlinks resolve to these compiled
# outputs (raw src/*.ts is never shipped or loaded at runtime).
COPY --from=build --chown=node:node /app/packages/database/dist ./packages/database/dist
COPY --from=build --chown=node:node /app/packages/database/package.json ./packages/database/package.json
COPY --from=prod-deps --chown=node:node /app/packages/database/node_modules ./packages/database/node_modules
COPY --from=build --chown=node:node /app/packages/persistence/dist ./packages/persistence/dist
COPY --from=build --chown=node:node /app/packages/persistence/package.json ./packages/persistence/package.json
# Each workspace package resolves its own dependencies through its own
# `node_modules` (pnpm does not hoist), so shipping `dist` without it produces
# an image that cannot start.
COPY --from=prod-deps --chown=node:node /app/packages/persistence/node_modules ./packages/persistence/node_modules
# APP2-I03: the worker verifies its private buckets at startup, so the shipped
# image needs the object-storage package's compiled output and its own AWS SDK
# dependencies. Omitting them produces an image that fails at its first import.
COPY --from=build --chown=node:node /app/packages/object-storage/dist ./packages/object-storage/dist
COPY --from=build --chown=node:node /app/packages/object-storage/package.json ./packages/object-storage/package.json
COPY --from=prod-deps --chown=node:node /app/packages/object-storage/node_modules ./packages/object-storage/node_modules
WORKDIR /app/apps/worker
CMD ["node", "dist/main.js"]
