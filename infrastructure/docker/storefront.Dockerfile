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
# The public browser origin (IMP-D050 / APP4-B05). Optional at build time since
# `APP12-H02`, and required at run time exactly as before.
#
# APP11-S04 needed it here because `next build` prerendered the statically
# generated segments, so the export step resolved `metadataBase` and every
# canonical URL and read this variable exactly as a request would. H02's nonce
# CSP made every route render per request (see `apps/storefront/src/app/layout.tsx`),
# which removed that build-time read: measured by building this stage with the
# argument omitted, which now succeeds where it used to fail.
#
# The consequence is worth stating, because it is an improvement rather than a
# loosening: a Storefront image is no longer origin-specific, so one build can be
# promoted across environments instead of being rebuilt per host. Nothing became
# permissive — `getStorefrontPublicOrigin` still has no default and no fallback,
# so a container started without the variable answers 500 on `/sitemap.xml` and
# `/robots.txt` with "STOREFRONT_PUBLIC_ORIGIN is not set" rather than publishing
# a guessed host. Verified against this image.
#
# Still declared with NO default: a placeholder would be the fallback the SEO
# authority forbids. Supply it explicitly when a build should bake one:
#
#   docker build --build-arg STOREFRONT_PUBLIC_ORIGIN=https://... -f ... .
#
# It is public configuration — it appears in every canonical tag the store serves
# — so passing it as a build argument leaks nothing. Never do this with a secret:
# build arguments are recorded in the image history.
ARG STOREFRONT_PUBLIC_ORIGIN
ENV STOREFRONT_PUBLIC_ORIGIN=${STOREFRONT_PUBLIC_ORIGIN}
# The three PUBLIC values Next INLINES into the client bundle at build time
# (`APP12-H02` §14/§15).
#
# They were missing here, and that was a real defect rather than an omission of
# convenience. `readContactHandoffConfig` reads
# `process.env.NEXT_PUBLIC_ZALO_CONTACT_URL` as a static member expression
# precisely so Next can substitute it — which means the substitution happens
# during `next build`, from the environment of the *builder*. With no build
# argument the builder saw nothing, `undefined` was compiled into the bundle,
# and no amount of runtime environment on the container could ever bring the
# footer's contact dock back. The development stack hid it completely: `next dev`
# re-reads the environment per request, so the same variables passed at run time
# worked there and only there.
#
# Changing any of these therefore REQUIRES A REBUILD. That is Next.js behaviour,
# not a repository choice, and it is why they are build arguments rather than
# container environment.
#
# All three are non-secret by construction — every visitor reads them in the page
# source — so passing them as build arguments leaks nothing. Never do this with a
# secret: build arguments are recorded in the image history.
#
# The two contact URLs have NO default, deliberately: unset means "omit that
# CTA", which is the delivered fail-closed behaviour (`APP10-I01`). The API base
# path defaults to the documented gateway path because the browser must call the
# API same-origin whatever else is configured.
ARG NEXT_PUBLIC_ZALO_CONTACT_URL
ENV NEXT_PUBLIC_ZALO_CONTACT_URL=${NEXT_PUBLIC_ZALO_CONTACT_URL}
ARG NEXT_PUBLIC_MESSENGER_CONTACT_URL
ENV NEXT_PUBLIC_MESSENGER_CONTACT_URL=${NEXT_PUBLIC_MESSENGER_CONTACT_URL}
ARG NEXT_PUBLIC_API_BASE_PATH=/api
ENV NEXT_PUBLIC_API_BASE_PATH=${NEXT_PUBLIC_API_BASE_PATH}
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
