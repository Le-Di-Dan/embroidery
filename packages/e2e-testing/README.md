# @embroidery/e2e-testing

Cross-application **browser end-to-end** suite (Playwright), locked by
`APP0-DEC-E2E` (IMP-D025) and implemented by APP0-T02B. A separate test tier
from Jest (the unit/component runner, IMP-D016) — Playwright drives real
browsers only.

## What it proves

One foundation smoke through the **real Nginx gateway**: the Storefront and
Admin home pages render, both `/healthz` endpoints are healthy, and
`/api/health/readiness` is `ready` against a **disposable** PostgreSQL — every
request travelling browser → gateway → app/API. No feature journeys, no auth.

## Architecture

`scripts/run-e2e.mjs` is the single canonical orchestrator. It owns the whole
lifecycle and cleans up in `finally` (and on SIGINT/SIGTERM) — Playwright's own
web-server shutdown is **not** relied upon (insufficient on Windows):

1. ephemeral PostgreSQL + real Nginx gateway via
   `infrastructure/compose/docker-compose.e2e.yml` (project `emb-e2e-<runId>`);
2. a **disposable** database from the canonical DB7/T01 harness
   (`@embroidery/database/testing`) — persistent-DB refusal + schema baseline;
3. the API (`node dist/main.js`, `NODE_ENV=test` so the local non-TLS disposable
   DB is permitted) and both Next apps (`next start`, production build) as host
   processes;
4. Playwright against the gateway hostnames (never direct app ports);
5. teardown of every process/container/database, verified.

Hostname resolution needs **no hosts-file edit**: on the host, Chromium uses
`--host-resolver-rules`; in the Linux container, `--add-host` provides DNS for
all engines.

## Commands (run from the repo root)

| Command | What it does |
|---|---|
| `pnpm check:e2e` | browser-free: static boundary + `playwright --list` + version pin |
| `pnpm e2e:smoke` | Chromium Storefront + Admin, host runner |
| `pnpm e2e:full` | Chromium + Firefox + WebKit, pinned Linux container |
| `pnpm e2e` | alias of the smoke run |
| `pnpm e2e:headed` / `e2e:debug` | Chromium, headed / inspector |
| `pnpm e2e:report` | open the last HTML report |
| `pnpm quality:e2e` | `check:e2e` then the full matrix |

`pnpm quality` never launches a browser; E2E is a separate tier.

## Browser install

`@playwright/test` is pinned to `1.61.1`. The official image
`mcr.microsoft.com/playwright:v1.61.1-noble` ships **browsers only** — the npm
package is installed separately and version-aligned. For a host run, install
browsers once with `pnpm --filter @embroidery/e2e-testing e2e:install`.

## Boundaries

E2E code never lives under an app/API `src`, is never an app runtime
dependency, and never appears in a production build — enforced by
`tools/check-e2e-boundaries.mjs` (static in `check:e2e`; build scan post-build).
Artifacts (`test-results/`, `playwright-report/`) are gitignored and never
committed.
