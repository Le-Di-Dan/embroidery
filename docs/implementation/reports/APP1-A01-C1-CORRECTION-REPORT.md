# APP1-A01-C1 — Admin Login Readiness Correction Report

**Verdict:** PASS — all three Product-Owner runtime findings CLOSED.
**Status:** `APP1-A01 = COMPLETE — CORRECTED, DELIVERED_FOR_PRODUCT_OWNER_REVIEW`.
Not pushed. Two new commits after the A01 evidence commit.

## A. Preflight and original A01 revalidation

- Preflight HEAD: `930d0cd` (A01 evidence commit B). Working tree clean; branch `production`.
- A01 impl commit A: `27e57e3`; A01 evidence commit B: `930d0cd`.
- Backend baselines: B01 `1eeb7f3`, B01-C1 `1724905`, B02 `66e2854`, B02-C1 `673f1df`.
- `A01_ORIGINAL_REVALIDATION = PASS` (admin/api/api-client suites, builds, gates green at preflight).
- The runtime toggle failure remained authoritative despite passing unit tests.

## B. Product Owner runtime findings

- A01-FU01 — password toggle dead in the real browser.
- A01-FU02 — Admin not protected (anon reaches `/`; authed not redirected off `/login`).
- A01-FU03 — `docker compose up` does not create/reuse the dev admin → login not live-testable.

## C. Password-toggle root cause and correction (A01-FU01 = CLOSED)

Root cause is NOT the component (its click/Enter/Space/value/aria all pass on a
direct dev server). The Admin app **never hydrated through the gateway**
(`admin.embroidery.local`): Next 16 dev serves `/_next/*` — including the
Turbopack HMR WebSocket, which carries an `Origin` header — only to
allow-listed origins. The gateway host was not allow-listed, so the HMR
handshake failed (`upstream sent no valid HTTP/1.0 header`; browser
`Invalid status line`) and Turbopack aborted client bootstrap. With no
hydration the toggle was inert AND the un-hydrated `<form>` fell back to a
native `GET /login?email=…&password=…`, leaking credentials in the URL. A01
masked it by verifying on a production build (`next start`, no HMR).

Fix: `allowedDevOrigins: [ADMIN_HOST]` in `apps/admin/next.config.ts`
(env-driven, dev-only, ignored by prod builds); `ADMIN_HOST` passed to the
admin container. Real-browser result via the gateway: `hasReactFiber = true`;
`password → text → password` on mouse + Enter + Space; value preserved; 0
console errors. Temporary screenshots captured and removed before Commit C.

## D. Protected-route architecture (A01-FU02 = CLOSED)

Two layers: (1) `apps/admin/src/proxy.ts` (Next 16 `proxy`) — fast cookie
**presence** routing only; protected route w/o cookie → `/login`; `/login`
always allowed; cookie-bearing request passes through; matcher excludes
`_next`/static/`healthz`/favicon/`.well-known`. Cookie value never read.
(2) `apps/admin/src/server/*` authoritative resolver — forwards the incoming
`Cookie` to `GET /api/staff/me` (`staffSelfGet`); `(protected)` route group
layout calls `requireServerStaffSession()`; `/login` calls
`redirectAuthenticatedStaffFromLogin()`. 200→authenticated, 401→`/login`,
network/5xx→`unavailable` (error boundary, never a login redirect/loop).

## E. Automatic Compose bootstrap architecture (A01-FU03 = CLOSED)

Two one-shot services in the dev Compose (reuse the API image + the canonical
B01 CLI): `db-migrate` (runs `@embroidery/database db:migrate`) and
`staff-bootstrap` (`@embroidery/api staff:bootstrap`, idempotent ensure). Graph:
`postgres(healthy) → db-migrate(completed) → staff-bootstrap(completed) → admin`;
`api → db-migrate(completed)`. Acyclic. The public Admin is gated on a
successful bootstrap. `restart: no`, no ports, never behind the gateway.

## F. Development/production missing-env behavior

Discriminator: `NODE_ENV` (BACKEND_CONVENTIONS §16). `test`→strict dev policy;
`production`→lenient; unknown/empty→fail closed. Dev missing → exit non-zero,
readiness fails; prod missing → exit 0, skip, no mutation.

## G. Bootstrap idempotency and security

Closed status set: CREATED / REUSED_EXISTING / SKIPPED_MISSING_ENV_PRODUCTION /
FAILED_MISSING_ENV_DEVELOPMENT / FAILED_EXISTING_ADMIN_MISMATCH /
FAILED_EXISTING_ADMIN_NOT_ACTIVE / FAILED_BOOTSTRAP. Reuse never rotates/re-hashes;
a different active admin → mismatch; LOCKED/DISABLED match → not-active. Only
variable NAMES are ever printed; never the password/credential.

## H. Real Compose/browser live-test evidence

Live URL: `http://admin.embroidery.local/login` (gateway :80). Chromium (Playwright).
- Route matrix: anon `/`→307 `/login`; `/login`→200; authed `/`→200 (placeholder);
  authed `/login`→307 `/`; `/api/staff/me` w/ cookie→200; cookie+API-down→500 (not `/login`).
- Toggle: `password→text→password` (mouse/Enter/Space), hydrated, 0 errors.
- Invalid login (`admin@example.test` + wrong pw): 401 → generic
  "Email hoặc mật khẩu không đúng…" (no enumeration); URL unchanged (no native GET).
- Valid login (dev admin): `POST /api/staff/session` → **204**; cookie **`adm_session`**
  (`HttpOnly; SameSite=Strict; Path=/`, host-only, no Secure in dev); authed `/`→200.
- Compose smokes: CREATE→1 ACTIVE admin + 1 credential (empty→created);
  REUSE→exit 0, no duplicate/rotation; DEV missing-env→`FAILED_MISSING_ENV_DEVELOPMENT` exit 1;
  PROD missing-env→`SKIPPED_MISSING_ENV_PRODUCTION` exit 0.

## I. Tests and build boundaries

New/updated: password-toggle component suite; route-protection suites
(resolver / access-guard / proxy); source-boundary (no token parse/hash/bearer,
no web storage); api-base helper; bootstrap policy + ensure unit suites; Compose
contract test; api-client public-boundary smoke. `pnpm quality` green.

## J. Contract and database integrity

OpenAPI hash `ae015dd6…` and generated-client tree `89c1aace…` UNCHANGED — only
public re-exports added (`staffSelfGet`, `StaffSelfGet200`). `NO_MIGRATION_REQUIRED`;
db-migrate applies the committed canonical migrations idempotently; 78 public
tables (canonical baseline). No generated files edited.

## K. Correction Commit C evidence

Commit C: `9aabbf0` — `fix(app1): correct Admin login readiness`.

## L. Validation matrix

`pnpm quality` = PASS. admin typecheck/lint/test PASS; api typecheck/lint/test
PASS; api-client PASS; check:openapi/api-client/styles/figma/e2e/file-size PASS;
Compose config valid; live login 204.

## M. Deviations / follow-ups

- Discovered pre-existing defects fixed to unblock live login (FU03): (1) **double
  `/api`** — axios base (`/api`, `http://api:4000/api`) doubled the generated
  operations' `/api` prefix → `/api/api/…` 404; fixed with `toApiOriginBase` in the
  admin config only. (2) API not receiving `STAFF_ALLOWED_ORIGINS` /
  `STAFF_SESSION_COOKIE_SECURE` → 403 origin rejection; wired via Compose.
- FU-A17: reconcile the `/api` base-path duplication repo-wide (storefront + shared
  env/D-036 docs) in a dedicated change; only admin corrected here.
- Dev missing-env readiness-block verified via the `service_completed_successfully`
  dependency + Compose-contract test (not by tearing down the working stack).

## N. Acceptance matrix

- A01-FU01 = CLOSED · A01-FU02 = CLOSED · A01-FU03 = CLOSED.
- APP1-A01-C1 verdict = PASS.

## O. Scope confirmation

No schema/migration/generated/Figma/Storefront-source/A02-shell change.
Canonical host `admin.embroidery.local` preserved; no `admin.localhost`; existing
Compose workflow preserved. Nginx template unchanged (net).

## P. Evidence closure

Two new commits after `930d0cd`. Not pushed. APP1-A02 remains blocked pending
Product Owner acceptance of A01.
