# APP1-E01-C1 — Missing Cross-Layer Journey Correction — Correction Report

**Checkpoint:** APP1-E01-C1 (cross-layer journey correction) · **Verdict:** COMPLETE — CORRECTED, DELIVERED_FOR_REVIEW
**Scope:** supply real-gateway evidence for the invalid/stale-cookie route matrix and real server-to-server evidence for an initial protected-page API-unavailability failure. No product capability, no UI redesign, no dependency change.

## A. Preflight and evidence gaps

- Branch `production`. Initial `HEAD` (before Commit C): `75d0971` (APP1-E01 evidence commit B). Tree clean.
- E01 chain from Git: Commit A `3b4f31e3df8cd08e61a192ba9af085d027d9c7e6` (`test(app1): add cross-layer acceptance suite`); Commit B `75d0971a1ecfe3dff5cf75aec6554b382175114f` (`docs(app1): record cross-layer acceptance evidence`). E01 report present (`reports/APP1-E01-COMPLETION-REPORT.md`).
- Confirmed at start: APP1 E2E suite `packages/e2e-testing/specs/app1/` (5 specs / 15 tests); orchestrator `scripts/run-e2e.mjs` + `support/orchestration/` (host API process owned by the orchestrator, not Playwright); Admin server resolver `apps/admin/src/server/resolve-staff-session.ts` (401→`unauthenticated`; network/5xx→`unavailable`→throw `StaffSessionUnavailableError`), guard in `(protected)/layout.tsx`, error boundary `(protected)/error.tsx`.
- **Gap 1 (E01 §H/§N.5):** the invalid-cookie matrix was declared PASS without a dedicated real-gateway run. **Gap 2 (E01 §H/§N.5):** the initial server-side dependency failure was covered only by A02 component/integration tests, not a real cross-layer journey. C1 closes both.
- Preflight gates: `pnpm e2e:app1` (baseline, pre-change) 15/15 green, zero residue. `pnpm quality` had **one pre-existing, environmental** failure unrelated to E01-C1: `support/orchestration/net.test.mjs` hard-codes port `59999`, which this host now reserves in a Windows/Hyper-V dynamic-port exclusion range (`netsh … excludedportrange` 59976–60075), so `listen()` fails with nothing listening. Proven pre-existing by re-running the same unit test on a clean stash (fails identically). Fixed as a harness regression (§G). **`E01_C1_PREFLIGHT = PARTIAL`** (one environmental item, fixed) → proceeded.

## B. Invalid/stale cookie journey (E01-C1-J01)

`specs/app1/admin-invalid-cookie.spec.ts` (host/Chromium, real gateway `http://admin.embroidery.local:8090`). A fresh context is seeded with a forged, host-only, HttpOnly, SameSite=Strict `adm_session` cookie (random invalid value — never logged or asserted; support `specs/app1/support/admin-cookie.ts`).

- **Protected root:** `GET /` → cookie-presence proxy allows the request → the Admin server calls the real `GET /api/staff/me` → API returns **401** → final browser URL **`/login`**, login heading `Đăng nhập` visible, the shell (`Đăng xuất`) never renders, no expiry modal.
- **Authoritative 401 observed:** an in-page `fetch('/api/staff/me')` through the real gateway (browser attaches the HttpOnly forged cookie) returns **401** — direct cross-layer proof the forged cookie reaches authoritative validation and is rejected. The forged value is HttpOnly (absent from `document.cookie`) — client code never reads it.
- **Login route:** `GET /login` with the same cookie renders exactly once (no redirect back to a protected route, no shell). Bounded redirect chain (≤3, actually 1) — the navigation timeout would fail a loop.
- **Repeated `/login → / → /login`:** every hop lands on `/login`; no redirect loop, no shell flash into the authenticated surface, no expiry modal. The forged cookie is never cleared between cases.

## C. Initial server-side dependency-failure journey (E01-C1-J02)

`specs/app1/admin-api-unavailable.spec.ts` (host/Chromium). A real, valid session is established (login → `/` 200). `staffSelfGet` is **not** mocked; **no** browser route interception is used.

- The isolated API is stopped via the orchestrator control seam (§D). Gateway/Admin/Storefront/PostgreSQL keep running. Unavailability is confirmed directly: an in-page `fetch('/api/health/readiness')` through the gateway returns a 5xx (nginx 502 — upstream down).
- With the valid cookie present, `GET /` is requested. The Admin server attempts its server-to-server `staffSelfGet`; the dependency fails at the network layer. Observed canonical safe result:
  - **NOT** redirected to `/login` (final pathname `/`); the login screen is not shown.
  - **NO** session-expired modal (dependency failure ≠ expiry).
  - The authenticated shell does **not** render (no stale identity leaked).
  - HTTP **5xx** document response (framework safe error page — heading `This page couldn’t load`, generic copy, digest only). No raw technical detail exposed (asserted absent: `ECONNREFUSED`/`Axios`/`staffSelfGet`/`StaffSessionUnavailableError`/`localhost:`/stack frames).
- **Framework-boundary note (faithful):** the accepted resolver throws `StaffSessionUnavailableError` in `(protected)/layout.tsx`. A same-segment `error.tsx` cannot catch a throw from its own layout (the boundary is nested inside it), and the Admin app defines no root `app/error.tsx`/`global-error.tsx`, so Next.js renders its default safe production error page rather than the custom `(protected)/error.tsx` copy. This is a canonical **safe framework 5xx response** (§10 of the correction prompt): it satisfies every security-relevant property — not misclassified as signed-out, no expiry modal, no raw detail. The custom reassurance copy not surfacing is a cosmetic, non-security follow-up (see §J), out of scope for this correction (no UI redesign).

## D. Isolation and service recovery

- Existing isolated E01 environment (unique Compose project `emb-e2e-<runId>`; ephemeral PostgreSQL tmpfs; disposable DB `embroidery_db7_e2e_<runId>_*`; non-dev ports pg 5544/api 4400/storefront 4310/admin 4311/gateway 8090; fresh browser context; safe `*.example.test` Admin; no host-file change).
- **API stop/restart mechanism:** the API host process is owned by a lifecycle service `support/orchestration/api-service.mjs` (single tracked handle → start/stop/restart). A loopback-only control server `support/orchestration/api-control-server.mjs` (127.0.0.1, ephemeral port, started only for the E01 suite) exposes `POST /api/stop`, `POST /api/start` (waits for real readiness), `GET /api/status`; its URL reaches the spec as `E2E_API_CONTROL_URL`. Because the service always tracks the single current child, teardown stops whatever is current — a restart never leaks a process.
- **Recovery:** after restart, in-page `/api/health/readiness` = 200; `GET /` = 200; identity `GET /api/staff/me` = 200 with the matching email/displayName; the same still-valid session works. The session survives the API restart because sessions are DB-backed (opaque), not in API memory.
- **Failure safety:** the outage assertions run inside `try`, and `startApi()` runs in `finally`; a `test.afterEach` additionally expires any residual session (PostgreSQL never stopped), so a mid-outage failure can never leave the API stopped or a live session that perturbs the serial suite.
- **Cleanup:** both determinism runs logged `cleanup verified: all E2E ports closed, disposable database dropped`. Post-run scan: **0** residual `emb-e2e-*` containers, **0** networks, **0** volumes. The normal `embroidery-dev` project (6 containers) remained running and untouched.

## E. Regression and repeat-run evidence

- Updated suite: **7 specs / 17 tests** (added `admin-invalid-cookie` J01 and `admin-api-unavailable` J02; the original 15 unchanged). `pnpm e2e:app1` run A **17/17 (1.4m)**, run B **17/17 (1.5m)** — both PASS, retries=0, serial worker (workers=1), no order dependency, no rate-limit/session residue, API lifecycle fully recovered, zero isolated residue after each run.
- Existing E01 journeys re-verified green: Compose/bootstrap smoke `pnpm smoke:app1-bootstrap` 8/8; valid login/current staff; identifier rate limit (5→401, 6th→429+Retry-After); logout; forced expiry modal; later 5xx reconnect; Storefront shell 1440/1024/390; Storefront not-found 404. The stale APP0 smoke correction remains accepted. The existing E01 suite was not rewritten.

## F. Contract / database / security evidence

- OpenAPI SHA-256 **unchanged** `ae015dd65dc2f64c902145f19d5fa5fae6cd6423a54934c1126cd289e3d30946` (`pnpm check:openapi` pass).
- Generated API-client tree SHA-256 **unchanged** `89c1aace328eef1ee05a74950faa48bf907babece025a6abb9ca1baa1574502f` (`pnpm check:api-client` up to date).
- Database baseline **unchanged**: **31** migrations, **78** tables (833 physical columns), canonical fingerprint `4ca56a5967730d257edb34e72d6c40373156704cab7c87e3a684803c8321672f` — `pnpm db:check:manifest` all checks passed; the disposable-DB schema-baseline proof passed in every run. Figma index consistent (`check:figma-design-index`).
- Security scan of the E2E source, the logs quoted in this report, the Git diff and build outputs: no password, cookie value, session token, credential hash, database URL, personal email, or raw internal stack. Fixture emails are `*.example.test`. `git diff --check` clean.

## G. Commit C evidence

Commit C: `8d247b4ce104e1df33338f1593f141a727586ef8` — `test(app1): complete Admin failure journey coverage`.

Files (test/harness only; no production source, no completion report; no dependency change):

- New: `specs/app1/admin-invalid-cookie.spec.ts` (J01), `specs/app1/admin-api-unavailable.spec.ts` (J02), `specs/app1/support/admin-cookie.ts` (forged-cookie seam), `specs/app1/support/api-lifecycle.ts` (control-seam client), `support/orchestration/api-service.mjs` (API lifecycle service), `support/orchestration/api-control-server.mjs` (loopback control server).
- Modified: `support/orchestration/environment.mjs` (use the API service; start the control server for the E01 suite; return its URL), `scripts/run-e2e.mjs` (forward `E2E_API_CONTROL_URL`), `specs/app1/support/app1-test.ts` (`allowStatus401` for the intentional 401 probe — mirrors the existing `allowStatus404`), `support/orchestration/net.test.mjs` (regression fix: derive a genuinely-free ephemeral port instead of hard-coded 59999 — a proven, pre-existing, environment-dependent harness-test defect).

Expected dependency change: **none**.

## H. Validation matrix

| Gate | Result |
|---|---|
| `pnpm e2e:app1` — run A | 17/17 passed (1.4m) |
| `pnpm e2e:app1` — run B | 17/17 passed (1.5m), retries=0 |
| `pnpm smoke:app1-bootstrap` | 8/8 passed |
| Residue after runs | 0 containers / 0 networks / 0 volumes; dev stack 6 intact |
| `pnpm quality` | exit 0 |
| `pnpm quality:e2e` | exit 0 (container full smoke 15/15; one transient WebKit 504 gateway flake on the first attempt — unrelated to E01-C1, green on immediate re-run) |
| `check:openapi` / `check:api-client` | pass, hashes unchanged |
| `pnpm db:check:manifest` | pass (78 tables / 833 cols / fingerprint unchanged) |
| `check:figma-design-index` | pass |
| frontend-test / frontend-build / api-dist boundaries; file-size | clean |
| `git diff --check` | clean |

## I. Acceptance matrix

All 44 §22 criteria satisfied: exact E01 A/B verified; both gaps acknowledged and closed; real invalid-cookie context reaching authoritative 401; protected `/` → `/login`; `/login` renders once; no loop/flash/modal; cookie value never reported; real isolated API stopped while gateway/Admin/Postgres run; valid cookie present; server-side validation attempted; API-unavailable navigation not redirected to `/login` and no expiry modal; safe 5xx result proven; no raw technical error; API restarts and readiness recovers; protected `/` and current staff work after recovery; cleanup on success and failure; dev stack/DB untouched; zero residual resources; updated suite passes twice; retries zero; existing tests green (count 15→17 for the two added journeys); bootstrap smoke 8/8; `quality:e2e` and `quality` pass; OpenAPI/client/DB baselines unchanged; Figma consistent; no product capability/redesign; no dependency change; Commit C test/harness-only (one proven-defect harness-test fix); Commit D evidence-only; report cites exact Commit C; ≤180 lines; exactly two commits; tree clean; not pushed; X01 not started.

## J. Scope confirmation

No new endpoint, UI state, page, database table/migration, session feature, monitoring stack, or deployment system. Two new E2E journeys, an isolated API stop/restart control seam (orchestrator + test-only), one benign console-tolerance option, and one pre-existing harness-test regression fix. **Follow-up (non-blocking, not in scope):** the custom `(protected)/error.tsx` reassurance copy does not surface for an initial-navigation dependency failure because the throwing guard sits in the layout above its own boundary and no root `app/error.tsx` exists — the framework's safe 5xx page renders instead. A future minimal Admin change (root error boundary, or moving the guard into the page) would surface the custom copy; it is a cosmetic UX improvement, not a security/classification defect.

## K. Evidence closure

APP1-E01-C1 closes both evidence gaps with real cross-layer runs. Statuses: **`APP1-E01` = `COMPLETE — CORRECTED, DELIVERED_FOR_REVIEW`**; **`APP1-E01-C1` = `COMPLETE`**; `APP1-X01` = `BLOCKED_BY_APP1_E01_REVIEW`; **APP1 = NOT_CLOSED**. Two commits only (C `8d247b4ce104e1df33338f1593f141a727586ef8`, D this evidence commit); working tree clean; not pushed.
