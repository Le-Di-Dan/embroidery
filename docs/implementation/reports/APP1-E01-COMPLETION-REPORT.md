# APP1-E01 — Staff Access and Shared-Shell Cross-Layer Acceptance — Completion Report

**Checkpoint:** APP1-E01 (integration / cross-layer acceptance) · **Status:** `DELIVERED_FOR_REVIEW`
**Scope:** deterministic browser evidence for the implemented APP1 journeys across gateway → Admin/Storefront (Next) → API (Nest) → PostgreSQL → session cookie → automatic bootstrap → generated contracts. No new product capability, no redesign.

## A. Preflight and accepted phase chain

Initial `HEAD` (before Commit A): `063b0dbca23a24047f238cca5846172b6161b796` (S01B evidence). Branch `production`, clean tree.

Accepted implementation/evidence chain (all read from Git):

| Checkpoint | Implementation | Evidence / notes |
|---|---|---|
| A01 / A01-C1 / A01-C2 | `27e57e3` / `9aabbf0` / `32a7854` | `2145137`, `9f01083`; A01 `COMPLETE — CORRECTED — PRODUCT_OWNER_ACCEPTED` |
| A02 | `67fd9f6` | `9310940`; `COMPLETE — PRODUCT_OWNER_ACCEPTED` |
| D02 | `eb57ad2` | `f4f336a`; `COMPLETE — PRODUCT_OWNER_ACCEPTED` |
| S01A | `0b11fbb` | `ae6206b`; `COMPLETE — PRODUCT_OWNER_ACCEPTED` |
| S01B | `f45821b` | `063b0db`; Product Owner live test PASSED (this prompt) → `COMPLETE — PRODUCT_OWNER_ACCEPTED` |
| B01 / B01-C1 | `1eeb7f3` / `1724905` | `COMPLETE — CORRECTED` |
| B02 / B02-C1 | `66e2854` / `673f1df` | `COMPLETE — CORRECTED` |

Artifact baseline (verified unchanged, §K): OpenAPI SHA-256 `ae015dd6…30946`; generated API-client tree SHA-256 `89c1aace…4502f`.

Preflight gates: `pnpm quality` **exit 0**; `check:openapi` / `check:api-client` / `check:figma-design-index` pass; `git diff --check` clean. E2E foundation baseline: the APP0 host smoke had **one** stale failure — `admin.smoke` asserted the removed APP0 heading `Embroidery Commerce Admin` at `/`, but the accepted A01-C1/A02 route protection now redirects the unauthenticated `/` to `/login` (heading `Đăng nhập`). This is a stale test assertion superseded by accepted APP1 behavior, corrected within E01 (§N). **`E01_PREFLIGHT = PARTIAL`** (one known, explained, E01-correctable item; everything else green) → proceeded.

## B. E01 environment and isolation

Canonical stack via the APP0-T02B orchestrator (`packages/e2e-testing`), extended for APP1: real Nginx gateway, real Admin + Storefront (`next start`, production builds), real Nest API (`dist/main.js`), ephemeral PostgreSQL (tmpfs), disposable database via the DB7/T01 harness, real `adm_session` cookie, generated API contracts.

Isolation: unique Compose project `emb-e2e-<runId>`; disposable DB `embroidery_db7_e2e_<runId>_*` (never the persistent dev DB — refusal guard); non-dev ports (pg 5544, api 4400, storefront 4310, admin 4311, gateway 8090); fresh browser context per test; safe test Admin under `*.example.test`; no host-file changes; teardown in `finally` with straggler verification. Runs proved **0 residual containers / networks / volumes** and the normal `embroidery-dev` project (6 containers) untouched.

APP1 extensions (Commit A): the orchestrator seeds one bootstrap Admin via the **accepted** `staff-bootstrap` CLI (create-or-reuse, `NODE_ENV=test`) with per-run random credentials under `*.example.test`; the API is wired with `STAFF_ALLOWED_ORIGINS` (gateway origin) and `STAFF_SESSION_COOKIE_SECURE=false`; the Admin app with `INTERNAL_API_BASE_URL`. Credentials and the disposable DB URL reach the specs only through the child process environment; nothing is logged or committed.

## C. Compose/bootstrap journey (E01-J01)

Executed the canonical isolated-Compose smoke harness `pnpm smoke:app1-bootstrap` (`tools/smoke-app1-bootstrap-compose.mjs`) — **8/8 passed**:

- `dev-missing-env` → `FAILED_MISSING_ENV_DEVELOPMENT`, exit 1, readiness gate fails, 0 admins/credentials, Admin not running.
- `dev-partial-missing` (password) → `FAILED_MISSING_ENV_DEVELOPMENT`, exit 1, 0 admins.
- `dev-create` → `CREATED`, exit 0, 1 admin/credential, readiness passes, Admin running.
- `dev-reuse` → `REUSED_EXISTING`, exit 0, credential hash unchanged.
- `prod-missing-env` / `prod-partial-missing` → `SKIPPED_MISSING_ENV_PRODUCTION`, exit 0, no mutation.
- `unknown-env` → `FAILED_BOOTSTRAP`, exit 1.
- `residue-cleanup` → 0 containers / 0 volumes / 0 networks; normal dev stack 6 containers.

The E01 suite additionally proves the create path live: every run logged `admin bootstrap CREATED` before the API started, and all downstream services reached readiness through the gateway.

## D. Admin routing / login / current-staff journey (E01-J02/J03)

`specs/app1/admin-auth.spec.ts` (host/Chromium, real gateway `http://admin.embroidery.local:8090`):

- **Anonymous matrix:** `/` → `/login` (200, heading `Đăng nhập`); `/login` renders (no loop); an unknown protected route → `/login`; infra path `/healthz` returns 200 (`service: admin`), never redirected (proxy matcher exclusion).
- **Login + identity:** valid credentials → `204`, landing `/`, shell visible. Cookie `adm_session`: `HttpOnly=true`, `SameSite=Strict`, `Path=/`, `Secure=false` (dev HTTP), `domain=admin.embroidery.local` (host-only, no leading dot). `GET /api/staff/me` → 200; UI identity matches API; response `data` keys are exactly `id`/`email`/`displayName`. Zero client-side current-staff calls on load (server-seeded — no mount duplication). Refresh stays authenticated; `/login` while authenticated → `/`.
- **Logout (J05):** `Đăng xuất` → `DELETE /api/staff/session` `204` → `/login`; the protected `/` is gated again; `/login` stays available.

Statuses and final URLs recorded; no cookie value, token, or password captured.

## E. Failure / rate-limit journey (E01-J04)

`specs/app1/admin-rate-limit.spec.ts` (fresh non-existent identifier — the real Admin is never rate-limited for other tests):

- **Invalid credentials (in admin-auth):** wrong password and unknown account both show the identical generic alert `Email hoặc mật khẩu không đúng…` (no enumeration); URL stays `/login` with empty query — no native GET fallback; email/password never appear in the URL.
- **Identifier boundary (locked policy 5 / 15 min):** attempts 1–5 → `401`; the 6th → `429` with a present, usable `Retry-After` (non-negative seconds). The approved rate-limit UI appears (`Bạn đã thử đăng nhập quá nhiều lần…`) and the submit control is disabled (`Thử lại sau ít phút`). Exactly 6 POSTs were sent — no automatic/duplicate resubmit.

## F. Logout journey (E01-J05)

Covered in §D: `DELETE /api/staff/session` `204`, cookie invalidated, safe client identity cleared, redirect `/login`, post-logout `/` re-gated, `/login` still available. Logout under network failure is classified in §H (shell stays, safe retry).

## G. Forced expiry / revocation journey (E01-J06)

`specs/app1/admin-session-lifecycle.spec.ts`. The A02-deferred journey, using the safe disposable-DB session-mutation seam (`support/session-store.ts` — `@embroidery/database` client on the disposable DB only; no production revocation endpoint added):

- Login → 1 live session. `forceExpireAllAdminSessions()` moves the ACTIVE session's expiry into the past → 0 live sessions; `GET /api/staff/me` now → `401`.
- A legitimate client re-validation of the now-stale (>30s) query (dispatched reconnect + visibility events — no app-internal hook) surfaces the **approved session-expired `alertdialog`** (`Phiên đăng nhập đã hết hạn`). The shell stays recognizable (banner visible), background is blocked (body scroll lock), focus is trapped in the dialog. **Escape does not dismiss; the backdrop does not dismiss.** The single action (`Đăng nhập lại`) navigates to `/login`.
- **Initial expired-session navigation:** after expiry, a fresh `GET /` resolves server-side to `401` and **redirects to `/login` with no modal** — proving the modal is a client-only, already-authenticated concern.

## H. API/network classification journey (E01-J07)

Deterministic browser-side interception (shared services never stopped):

- **Login network failure:** the login POST is aborted → safe login error `Hiện chưa thể đăng nhập. Vui lòng thử lại.`; stays on `/login` (not misread as auth failure).
- **Later current-staff 5xx:** `/api/staff/me` fulfilled `500` on the stale re-validation → shell stays with the reconnecting status `Mất kết nối tạm thời…`; the **expiry modal never appears** (dependency failure ≠ expiry).
- **Logout network failure:** the logout DELETE is aborted → shell stays (still on `/`), safe logout error + retry available (not signed out on a transient failure).

The three classes are visibly distinct: `401` → expiry/redirect, `429` → rate-limit UI, network/5xx → reconnect/safe-error. The initial *server-side* current-staff dependency failure (server-to-server, not browser-interceptable, and the shared API is never stopped mid-suite) remains covered by the A02 component/integration tests and the resolver's redirect-vs-throw design; E01 proves the observable outcomes above (§N).

## I. Storefront shell journey (E01-J08)

`specs/app1/storefront-shell.spec.ts` at 1440 / 1024 / 390 (real gateway `http://embroidery.local:8090`):

- Root 200; one `banner` / `main` / `contentinfo` and a valid skip link (`#main-content`) at every breakpoint.
- 1440 = Full header (inline primary nav visible, drawer trigger hidden). 1024 & 390 = Compact header (drawer trigger visible).
- 390 mobile drawer: opens (dialog visible, `aria-expanded=true`, `body` scroll locked); **Escape** closes → focus returns to the trigger, scroll restored; reopen → **backdrop** click closes → focus returns.
- No horizontal overflow at any breakpoint; 0 hydration/app-code console errors (favicon noise ignored).

## J. Storefront not-found journey (E01-J09)

`specs/app1/storefront-not-found.spec.ts` (unmatched `/__app1-e01-not-found__`, never registered as a route):

- HTTP **404**; approved heading `Không tìm thấy trang`; one shared shell (`banner`/`nav`/`main`/`h1`/`contentinfo`); decorative `404` present; the invalid path is never echoed into the page.
- Primary recovery links `/` (exact match distinguishes it from the brand link); secondary `Khám phá tác phẩm` is honestly unavailable (`aria-disabled` span + `Sắp ra mắt`, not a link). Primary click reaches `/`; valid `/` stays 200 and `/healthz` 200 (`service: storefront`).
- 390: no horizontal overflow; the mobile drawer still opens and Escape closes with focus return. Only the document's own 404-status console line tolerated (benign).

## K. Contract / database / security / build evidence (E01-J10)

- OpenAPI SHA-256 **unchanged** `ae015dd65dc2f64c902145f19d5fa5fae6cd6423a54934c1126cd289e3d30946`.
- Generated API-client tree SHA-256 **unchanged** `89c1aace328eef1ee05a74950faa48bf907babece025a6abb9ca1baa1574502f` (`check:api-client` up to date).
- Database baseline **unchanged**: **31** migrations, **78** tables (833 physical columns), canonical fingerprint `4ca56a5967730d257edb34e72d6c40373156704cab7c87e3a684803c8321672f` — the disposable-DB schema-baseline proof passed in every E01 run; `pnpm db:check:manifest` all checks passed.
- Figma registry consistent (`check:figma-design-index`).
- Builds/boundaries: `pnpm quality` **exit 0** (format, lint, typecheck, all package tests, file-size, styles, figma, frontend-boundaries, `check:e2e`, spike-boundaries, openapi, api-client, db-manifest); `pnpm quality:e2e` **exit 0** (browser-free `check:e2e` + 3-engine container smoke). No test secret, credential, cookie value, or screenshot committed; no isolated-Compose residue.

## L. Commit A evidence

Commit A: `3b4f31e3df8cd08e61a192ba9af085d027d9c7e6` — `test(app1): add cross-layer acceptance suite` (17 files, +854/−15).

Files (integration suite + minimal harness corrections only; no completion report):

- New: `packages/e2e-testing/specs/app1/` — 5 specs (`admin-auth`, `admin-rate-limit`, `admin-session-lifecycle`, `storefront-shell`, `storefront-not-found`) + `support/` (`app1-test.ts` fixtures, `admin-auth.ts` login/logout, `session-store.ts` disposable-DB session seam).
- Modified: `support/orchestration/config.mjs` (per-run Admin credentials), `environment.mjs` (bootstrap Admin + staff-auth/internal-API env; raised **IP/global** ceilings only), `playwright-runner.mjs` (forward creds/DB env), `scripts/run-e2e.mjs` (`--app1` mode), `playwright.config.ts` (two host/Chromium E01 projects), `eslint.config.mjs` (ignore transient run artifacts), `specs/admin.smoke.spec.ts` (stale-assertion correction), `package.json` (root + package `e2e:app1` script).

Expected dependency change: **none** (the session seam reuses the existing `@embroidery/database` dependency).

## M. Validation matrix

| Gate | Result |
|---|---|
| `pnpm e2e:app1` (full E01 suite) — run 1 | 15/15 passed (1.3m) |
| `pnpm e2e:app1` — run 2 | 15/15 passed (1.3m), no flaky retries (retries=0) |
| `pnpm smoke:app1-bootstrap` (J01) | 8/8 passed |
| Residue after runs | 0 containers / 0 networks / 0 volumes; dev stack 6 intact |
| `pnpm quality` | exit 0 |
| `pnpm quality:e2e` | exit 0 |
| `check:openapi` / `check:api-client` / `check:figma-design-index` | pass, hashes unchanged |
| `pnpm db:check:manifest` | pass (78 tables / fingerprint unchanged) |
| `git diff --check` | clean |

E01 Playwright: 2 host/Chromium projects, 5 specs, **15 tests**; both full runs green.

## N. Deviations / follow-ups

1. **APP0 smoke correction (minimal, proven):** `admin.smoke.spec.ts` asserted the removed pre-protection heading at `/`; updated to the accepted behavior (unauthenticated `/` → `/login`, heading `Đăng nhập`). Root cause: the APP0-T02B smoke predates A01-C1/A02 route protection. The authenticated shell and full route matrix are proven authoritatively by the E01 admin specs. No app behavior changed.
2. **Suite location:** §23 lists `tests/e2e/**` illustratively; the actual E2E foundation is `packages/e2e-testing/` (§16 "extend the existing foundation"), which is where the suite lives.
3. **Rate-limit dimension isolation:** the E2E API keeps the **identifier** limit at the locked default (5/15 min — the boundary under test) but raises the **IP/global** ceilings, because a single-host harness shares one source IP and those orthogonal abuse ceilings would otherwise couple independent journeys. The tested policy is unchanged.
4. **Client re-validation timing:** the current-staff query is server-seeded with a 30 s freshness window, so J06/J07 wait for genuine staleness then dispatch real reconnect/visibility events — no app-internal test hook was added.
5. **Initial server-side dependency failure (J07):** the server-to-server current-staff-unavailable path is not browser-interceptable and the shared API is never stopped mid-suite; it stays covered by the A02 component/integration tests. All other J07 classes are injected in-browser.
6. Runner scope: the E01 auth/session/responsive journeys are host/Chromium (they need disposable-DB access); the container 3-engine matrix continues to cover the cross-browser smoke.

No production source, schema, migration, contract, Figma, or dependency change.

## O. Acceptance matrix

All 50 §28 criteria satisfied: APP1 chains verified; S01B Product Owner acceptance recorded; isolated env for destructive journeys; dev DB/stack untouched; dev create/reuse + dev-missing-fail + prod-missing-skip; anonymous/authenticated/invalid-cookie route matrices; valid login 204; cookie attributes correct; identity matches; no duplicate initial current-staff call; generic invalid-login; credentials absent from URL; identifier 429 + Retry-After UI; logout 204 + post-logout protection; forced expiry/revocation + non-dismissable modal; initial expired → redirect without modal; 401/429/network/5xx distinct; storefront shell 1440/1024/390; drawer a11y; unknown route 404; recovery to `/`; valid routes 200; no hydration errors; OpenAPI/client/DB unchanged; Figma consistent; build/test boundaries; suite twice green; no flaky retry hides failure; zero residue; no secret/screenshot committed; `quality:e2e` and `quality` pass; no new product capability; Commit A integration-only; exactly two commits; not pushed; X01 not started.

## P. Scope confirmation

No new endpoint, UI state, Storefront/Admin page, database table/migration, session feature, monitoring stack, or deployment system was added. Only the E2E suite, isolated fixtures, one raised harness ceiling, and two minimal test corrections (stale APP0 smoke assertion; artifact lint-ignore).

## Q. Evidence closure

APP1-E01 is technically complete and delivered for review. Statuses: A01/A02/D02/S01A/S01B/S01 `COMPLETE — PRODUCT_OWNER_ACCEPTED`; **`APP1-E01 = DELIVERED_FOR_REVIEW`**; `APP1-X01 = BLOCKED_BY_APP1_E01_REVIEW`. APP1 is **not** closed. Two commits only; working tree clean; not pushed.
