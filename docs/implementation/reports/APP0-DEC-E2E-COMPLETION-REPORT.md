# APP0-DEC-E2E — End-to-End Test Stack Decision — Completion Report

**Checkpoint:** APP0-DEC-E2E · **Branch:** `production` · **Verdict:** `PASS`
**Decision commit (A):** `88ba26b9a44d0033c6cf373516e7884e87577fa9` — `docs(app0): select end-to-end test stack`
**Selected:** Playwright Test `@playwright/test 1.61.1` (Apache-2.0). Resolves `IMP-O005(b)` via `IMP-D025`.

---

## A. Preflight and T02A revalidation

- Initial HEAD `2feedff9253ff1e18e21602457861654f1152a79` (`docs(app0): record APP0-T02A completion evidence`); working tree clean.
- T02A implementation `711b9ea522f07dd611d8846dddf6f187cda93657`; evidence `2feedff` (both present in `git log -15`).
- Revalidation commands and exit codes (all `0`):

| Command | Exit | Result |
|---|---:|---|
| `git branch --show-current` / `rev-parse HEAD` / `status --short` | 0 | `production`, HEAD `2feedff`, clean |
| `git show --stat`/`diff-tree` `711b9ea` | 0 | 43 files; smoke tests under `apps/<app>/test/**` |
| `pnpm --filter @embroidery/frontend-testing test` | 0 | 4 suites / 10 tests |
| `pnpm --filter @embroidery/admin test` / `build` | 0 | 4 suites / 8 tests; `next build` OK |
| `pnpm --filter @embroidery/storefront test` / `build` | 0 | 4 suites / 8 tests; `next build` OK |
| `node tools/check-frontend-test-boundaries.mjs` | 0 | clean (jsdom components, Node smoke; none under `src`) |
| `node tools/check-frontend-build-boundary.mjs` | 0 | clean, 2238 built files, no test code |
| `pnpm check:openapi` / `check:api-client` | 0 | artifact up to date; tree hash `3ca2b2e…` unchanged |

- **`T02A_REVALIDATION = PASS`** — evidence commit exists, tests live under `apps/<app>/test/**`, no support under `src`, jsdom/Node split intact, `.next` boundary clean, api-client import proof preserved, tree clean after revalidation.

## B. Existing E2E / infrastructure audit

- **Apps/ports:** storefront `next` `:3000`, admin `:3001`, API NestJS `:4000` (all loopback in debug); `next build` emits `output: 'standalone'` (T02A-proven).
- **Gateway topology (D-036):** Nginx routes by hostname (`embroidery.local`, `admin.embroidery.local`); `/api/*` forwarded unchanged to the API global prefix `api`; Next apps own `/healthz` outside `/api`. API health: `GET /api/health`, `GET /api/health/readiness`.
- **Compose:** `infrastructure/compose/docker-compose.{dev,debug}.yml` + `infrastructure/nginx/nginx.conf`; `pnpm docker:dev:up` brings up gateway + apps + postgres.
- **Disposable DB harness (T01/DB7):** `@embroidery/database/testing` `createDisposableDatabase()` (names `embroidery_db7_*`, migrates, `.drop()`) + `@embroidery/test-utils` `CleanupStack`; `apps/api/test/support/api-integration-context.ts` boots the real `AppModule` against it with a persistent-DB refusal guard (`assertDisposableName`).
- **No-auth state:** no authentication implemented in APP0; home pages expose stable `h1` markers (`Embroidery Commerce Storefront` / `… Admin`).
- **Existing browser/E2E tooling:** none — `grep` over all manifests/`turbo.json` found no Playwright/Cypress/WebdriverIO/Selenium/Puppeteer/axe. Greenfield E2E tier.

## C. Candidate matrix

| Criterion | Playwright Test 1.61.1 | Cypress 15.19.0 | WebdriverIO 9.30.0 |
|---|---|---|---|
| License / Node | Apache-2.0 / ≥18 | MIT / ^20\|^22\|≥24 | MIT / ≥18.20 |
| Freshness (npm `time.modified`) | 2026-07-23 | 2026-07-21 | 2026-07-21 |
| Engines: Chromium / Firefox / WebKit | ✓ / ✓ / ✓ | ✓ / ✓ / ✗ (no WebKit) | ✓ / ✓ / ✓ (via drivers) |
| Official Docker image (pinned) | ✓ `mcr…/playwright:v1.61.1-noble` | partial (`cypress/included`) | ✗ (compose your own) |
| Multi-app projects (admin+storefront) | native `projects` | 1 baseUrl; `cy.origin` friction | capabilities matrix |
| TS specs out of the box | ✓ bundled transform | ✗ needs `typescript` + `tsconfig` | ✓ |
| Trace / screenshot / video / HTML report | ✓ all | screenshot/video; no trace-viewer | plugins |
| Parallel workers / sharding | ✓ / ✓ | limited (paid Cloud parallelization) | ✓ |
| `webServer` + `request` (API) fixtures | ✓ | partial | partial |
| Runner separation from Jest (unit tier) | ✓ (browser only) | ✓ | ✓ |

Sources: official npm package metadata (`npm view … version license engines.node time.modified`) and vendor docs; internet available, freshness **verified** (Playwright modified the day of this checkpoint).

## D. Browser spike evidence

Isolated OS-temp workspace (`%LOCALAPPDATA%\Temp\e2e-spike`, outside the repo/workspace globs), deleted before Commit A. Both Next apps served in **production** mode via `next start` from existing `.next` builds. Health/network proof used the real `/healthz` route (no API/Postgres needed for a foundation navigation smoke). No tracked repository file changed.

| Tool | Version | Browsers | Cases | Exit | Runtime | Artifacts | Deterministic | Notes |
|---|---|---|---:|---:|---:|---|---|---|
| Playwright | 1.61.1 | Chromium + WebKit | 5 | 0 | ~1.2s | trace.zip + screenshot on failure; HTML report | Yes (2 runs) | 3 projects (storefront-chromium/-webkit, admin-chromium); `getByRole` heading + `request` `/healthz` |
| Playwright (Linux) | 1.61.1 | Chromium + WebKit | 5 | 0 | ~1.7s | trace retain-on-failure | Yes | `mcr…/playwright:v1.61.1-noble`, `host.docker.internal` → host apps; image ships the package + browsers |
| Cypress | 15.19.0 | Electron (Chromium) | 3 | 0 | ~2s | screenshot on failure | Yes (2 runs) | required an extra `typescript` install **and** a `tsconfig.json` to load TS specs; single engine per run; no WebKit |

- **Headless:** proven for both (default). **Headed/debug:** Playwright ships `--headed`/`--debug`/trace-viewer; Cypress ships `open`. **Windows:** both green. **Linux/container:** selected finalist (Playwright) green in the official pinned image. **Determinism:** each finalist run twice, identical results.
- **Failure artifacts:** Playwright deliberate-fail trial produced `trace.zip` + `test-failed-1.png`; Cypress deliberate-fail produced `… (failed).png`.
- **Clean shutdown:** app servers stopped by PID; ports `3000`/`3001` confirmed closed (`curl` → `000`).
- **Temp cleanup:** spike workspace removed; `git status --short` empty and `git diff --check` clean after teardown.

## E. Decision

**Selected: Playwright Test `@playwright/test 1.61.1` (Apache-2.0).** Top reasons:

1. **Cross-engine incl. WebKit** — proven Chromium + WebKit on Windows and in the Linux image; the only finalist that drives a Safari approximation.
2. **Pinned official Linux image** (`mcr…/playwright:v1.61.1-noble`) with browsers preinstalled → deterministic CI parity (proven, exit 0).
3. **Native `projects`** cleanly models admin + storefront + the browser matrix from one root config (proven with 3 projects).
4. **Zero-extra-config TypeScript** (bundled transform) vs Cypress needing `typescript` + `tsconfig.json` (both failures observed in the spike).
5. **Rich debuggability** — trace-viewer, screenshot/video, HTML report, `webServer` orchestration, `request` fixture for API/health and future `storageState` auth.
6. **Clean tier separation** — Playwright is browser-only, so IMP-D016 (Jest sole unit/component runner) is untouched; no ADR-gated runner reopening.

**Rejected finalists.** *Cypress 15.19.0 (MIT):* no WebKit/real-Safari engine; heavier per-spec config (proven `typescript`+`tsconfig` requirement); weaker separate-origin ergonomics for the two-app (admin+storefront) topology; parallelization historically tied to paid Cloud. *WebdriverIO 9.30.0 (MIT, reviewed not spiked):* capable (WebDriver BiDi) but heavier driver/config surface and no official all-in-one pinned image, with no advantage over Playwright for this repo.

## F. APP0-T02B handoff

- **Tool/version:** `@playwright/test 1.61.1` (exact pin). **Package:** `@embroidery/e2e-testing` at `packages/e2e-testing/` (private; parallel to `@embroidery/frontend-testing`, `@embroidery/test-utils`). **Deps:** `@playwright/test` + browsers as devDependencies of that package only; no app dependency; browser install `pnpm --filter @embroidery/e2e-testing exec playwright install`, CI via the pinned `-noble` image.
- **Paths:** `packages/e2e-testing/playwright.config.ts`; specs `packages/e2e-testing/specs/**`; support/fixtures/orchestration/disposable-DB adapter `packages/e2e-testing/support/**`; artifacts `test-results/` + `playwright-report/` (gitignored, never committed).
- **Projects/base URLs:** `storefront` (`:3000`/gateway `embroidery.local`), `admin` (`:3001`/gateway `admin.embroidery.local`); primary run **through the real gateway**, direct ports as a documented debug fallback.
- **Startup:** one canonical orchestrator (`globalSetup` + repo/package script; `webServer` may own the two `next start` apps) composing gateway + admin + storefront + API + disposable Postgres; readiness-gated (`/api/health/readiness`, `/healthz`); teardown via `CleanupStack`. No per-spec process starting; no duplicated migration/DB lifecycle.
- **DB/data:** disposable DB via `@embroidery/database/testing` (unique per-run name, persistent-DB refusal guard); seed via approved API / fixture-seed adapter / canonical helper; no raw business SQL; cleanup on success + failure; worker parallelism bounded to DB isolation.
- **Auth:** APP0-T02B public routes only; future `storageState`/API session setup, deterministic users, role isolation, secrets from env/CI store, no committed tokens.
- **Network:** real app HTTP + owned API; interception only for non-owned/third-party/failure-sim; no live payment/shipping; no credentials in traces.
- **Locators/retry:** `getByRole`/`getByLabel`/text, `data-testid` last, auto-wait (no sleeps); retries CI-only + bounded; trace on retry/failure.
- **Browser matrix:** local smoke Chromium; CI-required Chromium (both projects); CI full/scheduled Chromium + Firefox + WebKit; no mobile emulation.
- **Artifacts:** screenshot only-on-failure, trace retain-on-failure/on-first-retry, HTML report; none committed.
- **Accessibility:** semantic locators + optional keyboard/focus smoke; `@axe-core/playwright` deferred (version locked at T02B after official review); no full-WCAG claim.
- **Commands/CI:** root `e2e` / `e2e:headed` / `e2e:debug` / `e2e:report` / `e2e:install` / `e2e:smoke` / `check:e2e`; E2E **not** in fast `pnpm quality`, runs in a separate `quality:e2e`/CI tier with install caching + per-project sharding.
- **Scope:** foundation + one Admin smoke + one Storefront smoke through the real gateway on a disposable environment, with artifact/debug proof — no broad feature E2E.

## G. Deviations / follow-ups

- **FU-1 (non-blocking):** startup mechanism (Compose vs bespoke orchestration script) is fixed as "single canonical orchestrator, disposable DB, real gateway"; the concrete Compose-vs-script choice is a T02B implementation detail. Owner: T02B.
- **FU-2 (non-blocking):** `@axe-core/playwright` version is not pinned here; lock only after official-source review in T02B. Owner: T02B.
- **FU-3 (informational):** WebdriverIO was reviewed from official metadata but not browser-spiked (rule requires ≥2 finalists spiked; Playwright + Cypress satisfied it). No blocking impact.
- **No ADR file** created in this checkpoint (consistent with IMP-D023/IMP-D024 precedent: the decision register entry is the authoritative record); the Commit-A allowed-file set excludes `docs/adr/**`.

## H. Acceptance matrix

| Gate group | Evidence | Result |
|---|---|---|
| T02A evidence chain revalidated; tree clean | §A | PASS |
| App/startup/DB topology audited; no existing E2E tooling | §B | PASS |
| ≥3 candidates reviewed; official sources; versions/licenses/freshness | §C | PASS |
| ≥2 finalists browser-spiked against real Admin + Storefront | §D | PASS |
| Windows + Linux/container + headless + failure-artifact + clean shutdown | §D | PASS |
| Temp artifacts removed; no tracked file changed | §D, §I | PASS |
| Browser matrix / paths / startup / DB / data / auth / network / locator / artifact / a11y / CI locked | §E, §F | PASS |
| Decision register updated (IMP-D025; IMP-O005(b) resolved) | §I, register | PASS |
| Commit A docs-only; no source/dependency/lockfile change | §I | PASS |

## I. Commit A changed files

Exactly three docs (`git diff --cached --name-only`):

- `docs/implementation/14-IMPLEMENTATION-DECISION-REGISTER.md` (IMP-D025 added; IMP-O005(b) marked resolved)
- `docs/implementation/07-TESTING-AND-ACCEPTANCE-GATES.md` (§5.1 Browser E2E stack)
- `docs/architecture/REPOSITORY_STRUCTURE.md` (`packages/e2e-testing` placement)

No change to `package.json`, `pnpm-lock.yaml`, `turbo.json`, `apps/**`, `packages/**`, `tools/**`, or `infrastructure/**`. `pnpm format:check` (edited docs), `check:file-size`, `check:styles`, `check:frontend-boundaries`, `git diff --check` all exit 0.

## J. Evidence closure

- Decision commit (A): `88ba26b9a44d0033c6cf373516e7884e87577fa9` — `docs(app0): select end-to-end test stack` (frozen; not amended).
- Evidence commit (B) subject: `docs(app0): record end-to-end decision evidence`.
- Pre-Commit-B tree: clean except the staged phase-doc status update and this untracked report.
- Push status: **NOT PUSHED**.
- Verdict: **`PASS`** (internet available, freshness verified → not capped at PASS_WITH_FOLLOW_UPS).

## K. Correction history (added by APP0-T02B)

The original spike evidence above stands. One implementation detail was corrected during T02B human review and confirmed against the real image: the official `mcr.microsoft.com/playwright:v1.61.1-noble` image provides **browser binaries and system dependencies only — not the `@playwright/test` npm package** (`require('@playwright/test')` in a clean image → MODULE_NOT_FOUND). T02B therefore installs the exact npm package (`1.61.1`) separately and version-aligns it with the image's baked browsers (chromium-1228/firefox-1532/webkit-2311); browser-binary caching is not claimed as an official recommendation. See `APP0-T02B-COMPLETION-REPORT.md` §A/§F.
