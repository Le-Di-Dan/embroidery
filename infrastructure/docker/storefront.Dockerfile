# syntax=docker/dockerfile:1
# Storefront (Next.js) — build from the monorepo root context:
#   docker build -f infrastructure/docker/storefront.Dockerfile .
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
ENV NODE_ENV=development
# Workspace runtime packages ship TypeScript source and resolve to `dist`
# (IMP-D018), so they must be compiled inside the image before Next can resolve
# them. `@embroidery/storefront^...` selects every workspace dependency of the
# Storefront *except* the Storefront itself, so a newly added one is built here
# automatically rather than failing the dev server with a module-not-found —
# which is exactly how `APP3-S02` found this, after adding
# `@embroidery/design-document` and `@embroidery/design-engine`. The Admin image
# needed it first, at `APP3-A03`, for the same two packages.
RUN pnpm --filter "@embroidery/storefront^..." build
EXPOSE 3000
CMD ["pnpm", "--filter", "@embroidery/storefront", "dev"]

# ---------------------------------------------------------------------------
# build: produce the standalone production output
# ---------------------------------------------------------------------------
FROM deps AS build
COPY . .
ENV NODE_ENV=production
# Same reason as the dev stage: the Storefront's workspace dependencies resolve
# to `dist`, so they are compiled before `next build` runs. Omitting it here
# would leave the production image unbuildable while dev worked.
RUN pnpm --filter "@embroidery/storefront^..." build
# The public browser origin (IMP-D050 / APP4-B05), needed at BUILD time as well
# as at run time since APP11-S04: the root layout resolves `metadataBase` from it,
# and `next build` prerenders the statically generated segments — so the export
# step reads it exactly as a request would.
#
# Declared with NO default, deliberately. A placeholder here would be the
# fallback the SEO authority forbids, silently baking one host into an image run
# against another; without one the image build fails closed with the same message
# a misconfigured request produces. Supply it explicitly:
#
#   docker build --build-arg STOREFRONT_PUBLIC_ORIGIN=https://... -f ... .
#
# It is public configuration — it appears in every canonical tag the store serves
# — so passing it as a build argument leaks nothing. Never do this with a secret:
# build arguments are recorded in the image history.
ARG STOREFRONT_PUBLIC_ORIGIN
ENV STOREFRONT_PUBLIC_ORIGIN=${STOREFRONT_PUBLIC_ORIGIN}
RUN pnpm --filter @embroidery/storefront build

# ---------------------------------------------------------------------------
# runner: minimal production image, non-root
# ---------------------------------------------------------------------------
FROM node:22.14.0-alpine AS runner
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
WORKDIR /app
USER node
COPY --from=build --chown=node:node /app/apps/storefront/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/storefront/.next/static ./apps/storefront/.next/static
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/healthz || exit 1
CMD ["node", "apps/storefront/server.js"]
