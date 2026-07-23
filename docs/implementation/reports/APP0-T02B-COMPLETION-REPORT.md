# APP0-T02B — Playwright E2E Foundation — Completion Report

**Checkpoint:** APP0-T02B · **Branch:** `production` · **Verdict:** `PASS`
**Implementation commit (A):** `a90a9f9aa9fa58540668d314045e6949956866cc` — `test(e2e): add Playwright gateway smoke foundation`

---

## A. Preflight and decision revalidation

- Initial HEAD `5c0daa546c749d17a63973e81754b12a8fcf11fb` (`docs(app0): record end-to-end decision evidence`); tree clean.
- DEC-E2E chain: decision `88ba26b9a44d0033c6cf373516e7884e87577fa9`, evidence `5c0daa5`; report present, verdict PASS; selected `@playwright/test 1.61.1` (IMP-D025).
- T02A baseline re-run — all exit 0: frontend-testing 10, admin 8 + build, storefront 8 + build, frontend static + build boundaries clean, `check:openapi` byte-identical, `check:api-client` hash `3ca2b2e…` unchanged.
- No existing Playwright/Cypress/WebdriverIO deps before this checkpoint.
- **`DEC_E2E_REVALIDATION = PASS`**.
- **Image-tag audit (DEC-E2E §2.1/§2.2 corrections):** `mcr.microsoft.com/playwright:v1.61.1-noble` exists (digest `sha256:5b8f294a…`), Node 24.17.0, browsers baked at `/ms-playwright` (chromium-1228, firefox-1532, webkit-2311). It **does not ship `@playwright/test`** (`require('@playwright/test')` → MODULE_NOT_FOUND); the npm package is installed separately and version-aligned. No mismatched `v1.61.0` image was used; no repo-owned image was needed.

## B. Locked implementation

- **Package:** `@embroidery/e2e-testing` (`packages/e2e-testing/`), private, `type: module`. **Version:** `@playwright/test` pinned exactly `1.61.1` (host CLI `Version 1.61.1`; container image `v1.61.1-noble`, browsers chromium-1228/firefox-1532/webkit-2311). Playwright is the E2E runner only; orchestrator unit tests use Jest (IMP-D016 intact).
- **Layout:** `playwright.config.ts`; `specs/{storefront,admin,api-readiness}.smoke.spec.ts` + `specs/support/smoke-test.ts` (portable, Playwright-only); `support/orchestration/*.mjs` (plain-Node) + `*.test.mjs` (Jest ESM); `scripts/{run-e2e,check-e2e}.mjs`; `README.md`.
- **Config:** 6 projects (storefront/admin × chromium/firefox/webkit), base URLs = gateway hostnames (never direct ports), `workers: 1` (one shared disposable environment; scaling path documented), retries `CI?1:0`, `trace: retain-on-failure`, `screenshot: only-on-failure`, `video: off`, HTML + list reporters, `timeout` 30 s / `expect` 10 s. **No `webServer`** — cleanup is owned by the wrapper, not Playwright.
- **Commands:** `e2e`/`e2e:smoke`/`e2e:full`/`e2e:headed`/`e2e:debug`/`e2e:report`/`e2e:install`/`check:e2e` (package) surfaced at root plus `quality:e2e`. `check:e2e` (browser-free static + `--list` + version pin) joined `pnpm quality`; **`pnpm quality` never launches a browser**.

## C. Orchestrator reuse / ownership matrix

| Concern | Canonical owner | Reused | Adapter added | Duplicate avoided |
|---|---|---|---|---|
| Disposable DB create/migrate/drop | `@embroidery/database/testing` (DB7/T01) | ✅ | thin `database.mjs` (label + refusal guard + baseline) | no second migration/lifecycle harness |
| Schema/fingerprint proof | `verifySchemaBaseline` | ✅ | — | — |
| Persistent-DB refusal | T01 `assertDisposableName` pattern | ✅ (re-expressed) | — | — |
| API runtime | `apps/api` built `dist/main.js` | ✅ | host-process start | no rebuilt API |
| Storefront / Admin | `next start` (production build) | ✅ | host-process start | no re-implemented server |
| Gateway | real `nginx.conf` + prod proxy-headers include | ✅ (mounted) | E2E routing template (upstreams only) | production semantics unchanged |
| Teardown orchestration | (E2E-specific) | — | `CleanupStack` (`.mjs`) | generic test-utils stack stays JIT/backend-neutral |

**Runtime-loadability (IMP-D018):** orchestration is plain-Node `.mjs`; `@embroidery/database/testing` loads from its compiled `dist`. `@embroidery/test-utils` is JIT TypeScript, so the wrapper owns a small local `CleanupStack` rather than deep-importing raw TS from Node. Confirmed: `node scripts/run-e2e.mjs` loads and runs with no `MODULE_NOT_FOUND`.

## D. Implementation Commit A evidence

- Hash `a90a9f9aa9fa58540668d314045e6949956866cc`; **32 files, +1933 / −4**.
- New: `packages/e2e-testing/**` (28 files), `tools/check-e2e-boundaries.mjs`, `infrastructure/compose/docker-compose.e2e.yml`, `infrastructure/nginx/e2e/templates/development.conf.template`. Modified: `.gitignore` (E2E artifacts), `package.json` (E2E + `quality:e2e` scripts; `check:e2e` in `quality`), `pnpm-lock.yaml` (Playwright).
- No change to `apps/*/src`, `apps/api` features, `apps/worker`, database migrations/schema, `packages/api-client/src/generated`, `packages/contracts/openapi`, or production Nginx/Compose.
- Dependencies: `@playwright/test` (dev, exact) + workspace `@embroidery/database` (dep, imported by the DB adapter). No Cypress/WebdriverIO/Selenium/Puppeteer/MSW/axe.

## E. Disposable environment evidence

- Compose project per run: `emb-e2e-<runId>` (`docker-compose.e2e.yml`): ephemeral (tmpfs) `postgres:16.14-alpine` with `POSTGRES_INITDB_ARGS=--locale=C --encoding=UTF8` (baseline-critical) + real `nginx:1.27.3-alpine` gateway. Apps/API are host processes. Default ports (all overridable, dev ports avoided): pg 5544, api 4400, storefront 4310, admin 4311, gateway 8090.
- Disposable DB name e.g. `embroidery_db7_e2e_<runId>_<pid>` (canonical harness, persistent-DB refusal guard). **31 canonical migrations** applied; **`verifySchemaBaseline` passed** (DB6 live-tables + fingerprint gate) → **78 tables**, frozen fingerprint `4ca56a5967730d257edb34e72d6c40373156704cab7c87e3a684803c8321672f`. The persistent `embroidery` DB is never targeted.
- Hostname resolution needs no hosts-file edit: host runner uses Chromium `--host-resolver-rules`; the Linux container joins the Compose network and resolves the gateway hostnames via Docker DNS aliases. Gateway proxies to host apps via `host.docker.internal` (`extra_hosts: host-gateway`).
- Readiness gated on `postgres` health, API `/api/health/readiness` (`ready`), both `/healthz`, gateway self-health, and a Host-header routing preflight. Connection strings are redacted in every log line.
- Cleanup verified after every run: all five E2E ports closed, disposable DB dropped, Compose project `down -v`; no residual container/port/DB (checked via `docker ps -a` + `netstat`).

## F. Browser proof

| Run | Env | Projects | Tests | Result |
|---|---|---|---|---|
| Windows smoke | host (Chromium) | storefront-chromium, admin-chromium | 5 | PASS (~4.9 s) |
| Linux full matrix | `v1.61.1-noble` container, Compose network | all 6 (chromium+firefox+webkit) | 15 | PASS (~11.8 s) |

- All requests go through the real gateway on the gateway hostnames; the API-readiness assertion is issued from inside the page (gateway origin), proving it travels browser → gateway → API → disposable PostgreSQL, not the direct API port.
- Semantic locators only (`getByRole('heading', level 1)`); web-first assertions; **no `waitForTimeout`**; no owned-API mocking. Console/page errors are collected and asserted empty (benign favicon noise ignored). Linux container: `node -v` 24.17.0, `playwright --version` 1.61.1 (npm package installed inside; browsers baked in image).

## G. Failure and artifact proof

- **Controlled failure** (temporary spec, run outside committed specs, then reverted — the committed tree has no failing test): produced `trace.zip` + `test-failed-1.png` + `error-context.md` under `test-results/`; the HTML report names the failing project/test. Artifacts scanned — **no** connection string / password / DB name leaked. Artifacts deleted after capture; `test-results/`, `playwright-report/` are gitignored and never committed.
- **Environment-failure cleanup** (real runs via the `E2E_FAULT` seam): fault after DB provision → disposable DB dropped, Postgres container removed; fault after API start → API host process stopped **and** DB dropped. Both left no container, no open port, no residual DB. Playwright non-zero exit (deliberate failure) → full teardown still ran and verified.

## H. Validation matrix

| Command | Exit | Result |
|---|---:|---|
| `pnpm --filter @embroidery/e2e-testing typecheck` / `lint` | 0 | clean |
| `pnpm --filter @embroidery/e2e-testing test` | 0 | 4 suites / **14** (cleanup-stack, DB guard, redact, net) |
| `pnpm check:e2e` | 0 | boundary clean; 15 tests collected; version pinned 1.61.1 |
| `pnpm e2e:smoke` (Windows, Chromium) | 0 | **5** passed; cleanup verified |
| `pnpm e2e:full` (Linux, 3 engines) | 0 | **15** passed; cleanup verified |
| `E2E_FAULT=after-db` / `=after-api` `e2e:smoke` | 1 | injected failure → DB dropped, services stopped, no residue |
| `pnpm --filter admin/storefront/frontend-testing test` | 0 | 8 / 8 / 10 preserved |
| `pnpm --filter admin/storefront build`, `--filter api build` | 0 | production builds OK |
| `node tools/check-e2e-boundaries.mjs` | 0 | static + **797** built files clean |
| `node tools/check-frontend-build-boundary.mjs` / `check-api-dist-boundary.mjs` | 0 | 2238 / 257 files clean |
| `pnpm check:openapi` / `check:api-client` | 0 | byte-identical; tree hash unchanged |
| `node tools/check-file-size.mjs` / `git diff --check` | 0 | clean (largest new file 162 lines) |
| `pnpm quality` (dev Postgres up) | 0 | full chain green, **no browser launched**; 78 tables |

## I. Deviations / follow-ups

- **FU-1 (non-blocking):** `workers: 1` (one shared disposable environment). Per-worker DB isolation is a documented future scaling path, not implemented in the foundation.
- **FU-2 (non-blocking):** API runs `NODE_ENV=test` (built `dist`), because `production` rejects the local non-TLS disposable DB + dev password by design; the apps run `NODE_ENV=production`.
- **FU-3 (informational):** the E2E gateway template mirrors production routing with only upstream targets parameterized; the shared proxy-headers include is the real production file (mounted), so it cannot drift. Keep in sync if production routing changes.
- **FU-4 (deferred):** accessibility beyond semantic locators (keyboard smoke needs an interactive element; `@axe-core/playwright`) deferred to the first interactive feature — the static foundation pages have no meaningful focusable control.

## J. Acceptance matrix

| Gate group | Evidence | Result |
|---|---|---|
| Decision chain revalidated; exact 1.61.1; image/browser alignment; image≠npm-package note | §A, §B | PASS |
| One canonical orchestrator; no per-spec process/DB; plain-Node boundary | §B, §C | PASS |
| Canonical disposable DB reused; refusal; 31 migrations; 78 tables + fingerprint | §C, §E | PASS |
| Real gateway for storefront + admin + API readiness (not direct ports) | §E, §F | PASS |
| Windows Chromium + Linux Chromium/Firefox/WebKit; semantic locators; no sleeps; no owned mocking | §F | PASS |
| Failure trace + screenshot; artifacts ignored/cleaned; no secret leakage | §G | PASS |
| Success + Playwright-failure + service-start-failure cleanup; no residue | §E, §G | PASS |
| `pnpm quality` browser-free; `quality:e2e` present; existing tests preserved; build boundaries | §B, §H | PASS |
| OpenAPI + generated client unchanged; no schema/migration/feature change | §D, §H | PASS |

## K. Scope confirmation

No authentication, no feature E2E journeys, no visual-regression baselines, no accessibility certification, no CI workflow redesign, no production deployment change, no schema/migration change, no generated-client/OpenAPI change. APP0-R01 not started.

## L. Evidence closure

- Implementation commit `a90a9f9aa9fa58540668d314045e6949956866cc` (frozen; post-commit smoke re-run green; boundaries + tree-clean re-confirmed).
- Evidence commit subject: `docs(app0): record APP0-T02B completion evidence`.
- Pre-Commit-B tree: clean except the staged phase doc + DEC-E2E correction note and this untracked report.
- Push status: **NOT PUSHED**.
- Verdict: **`PASS`**.
