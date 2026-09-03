# syntax=docker/dockerfile:1
# Storefront (Next.js) — build from the monorepo root context:
#   docker build -f infrastructure/docker/admin.Dockerfile .
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
# Workspace runtime packages ship TypeScript source and resolve to `dist`
# (IMP-D018), so they must be compiled inside the image before Next can resolve
# them. `@embroidery/admin^...` selects every workspace dependency of the Admin
# *except* the Admin itself, so a newly added one is built here automatically
# rather than failing the dev server with a module-not-found — which is exactly
# how `APP3-A03` found this, after adding `@embroidery/design-document` and
# `@embroidery/design-engine`. Mirrors the API image, which needed it first.
RUN pnpm --filter "@embroidery/admin^..." build
ENV NODE_ENV=development
EXPOSE 3001
CMD ["pnpm", "--filter", "@embroidery/admin", "dev"]

# ---------------------------------------------------------------------------
# build: produce the standalone production output
# ---------------------------------------------------------------------------
FROM deps AS build
COPY . .
ENV NODE_ENV=production
# Same reason as the dev stage: the Admin's workspace dependencies resolve to
# `dist`, so they are compiled before `next build` runs.
RUN pnpm --filter "@embroidery/admin^..." build
# The one PUBLIC value Next INLINES into the client bundle at build time
# (`APP12-H02` §14). `browser-api-client.ts` reads it as a static member
# expression so Next can substitute it, which means the substitution happens
# here, from the builder's environment — not at run time from the container's.
# Changing it requires a rebuild; that is Next.js behaviour, not a choice.
#
# Non-secret: it is a same-origin path every staff browser already sends. It
# defaults to the documented gateway path rather than being left empty, because
# the browser must reach the API same-origin whatever else is configured.
ARG NEXT_PUBLIC_API_BASE_PATH=/api
ENV NEXT_PUBLIC_API_BASE_PATH=${NEXT_PUBLIC_API_BASE_PATH}
RUN pnpm --filter @embroidery/admin build

# ---------------------------------------------------------------------------
# runner: minimal production image, non-root
# ---------------------------------------------------------------------------
FROM node:22.14.0-alpine AS runner
ENV NODE_ENV=production
ENV PORT=3001
ENV HOSTNAME=0.0.0.0
WORKDIR /app
USER node
COPY --from=build --chown=node:node /app/apps/admin/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/admin/.next/static ./apps/admin/.next/static
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3001/healthz || exit 1
CMD ["node", "apps/admin/server.js"]
