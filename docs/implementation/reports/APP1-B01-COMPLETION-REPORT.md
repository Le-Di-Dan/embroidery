# APP1-B01 — Staff Session Authentication — Completion Report

**Checkpoint:** APP1-B01 (backend) · **Verdict:** `COMPLETE`,
`DELIVERED_FOR_HUMAN_REVIEW` · **Date:** 2026-07-25 · **Not pushed.**

## A. Preflight

- Branch: `production`. Initial HEAD: `c721ae5` (`docs(app1): record APP1-D01
  design evidence`).
- DEC-AUTH chain: Commit A `741dadd` (`docs(app1): select staff authentication
  architecture`), evidence B `061c00c`; report verdict **PASS** (IMP-D027 /
  ADR-APP1-001).
- D01 chain: Commit A `ca611a9` (`design(app1): deliver staff access and shell
  design package`), evidence B `c721ae5`; report present. D01 does not block B01.
- APP0 remains `COMPLETE`; APP1-B01 was `READY, NOT STARTED`; APP1-B02
  `NOT STARTED`. No prior staff-auth source existed. Working tree clean.
- 31 existing migrations immutable; no persistent rate-limit/lockout schema
  exists or is required.
- `B01_PREFLIGHT = PASS` — baseline `git diff --check`, dist-boundary,
  `check:openapi`, `check:api-client` green before implementation.

## B. Locked implementation

- Endpoints (exactly two): `POST /api/staff/session` → `staffSession_create`;
  `DELETE /api/staff/session` → `staffSession_delete`.
- Module: canonical `apps/api/src/modules/identity` with `domain` /
  `application` / `infrastructure` / `presentation` / `config` layers and a new
  `apps/api/src/cli/staff-bootstrap.ts` command. Registered in `AppModule`.
- Guard `AuthenticatedAdminGuard` exists and is the only protector of logout;
  `StaffOriginGuard` + `StaffJsonBodyGuard` enforce CSRF/content-type.
- No business logic in the controller (validation, cookie, headers, error
  mapping only); no persistence access in guards except via the session service.

## C. Password and session evidence

- scrypt `N=131072,r=8,p=1,keylen=32`, 16-byte CSPRNG salt, `maxmem=256 MiB`.
  Self-describing `scrypt$N=…,r=…,p=…$<saltB64>$<hashB64>`; `credential_kind =
  password_scrypt`. NFKC, max 4096 bytes (reject, no truncation),
  `timingSafeEqual`, rehash-on-verify when parameters are obsolete. Malformed
  stored hash → safe verification failure, never an exception. No sync scrypt.
- Session token `randomBytes(32)` base64url in the cookie only; only
  `sha256(token)` persisted (`admin_sessions.token_hash`). Lookup by hash.
- Lifetime: idle 30 min, absolute 12 h; expiry enforced on read; sliding renewal
  in the guard, extending only past the half-idle threshold and never beyond the
  absolute ceiling; no explicit renew endpoint. Concurrent sessions allowed.
- Cookie: `HttpOnly; SameSite=Strict; Path=/`, host-only (no `Domain`),
  `Max-Age` = absolute timeout; `__Host-adm_session` + `Secure` in production
  (fail-fast when `STAFF_SESSION_COOKIE_SECURE=false`), `adm_session` in dev.
  Deletion cookie matches attributes with `Max-Age=0`. Never in browser storage;
  never in a response body.

## D. Security controls

- Origin allowlist (exact `scheme://host[:port]`, no substring; absent =
  non-browser allowed, foreign/`null` rejected → 403). JSON-only login (else
  415). No wildcard credentialed CORS.
- In-process limiter: identifier 5/15 min, IP 20/15 min, global 100/5 min → 429
  + `Retry-After`; hashed keys (no plaintext email/IP retained); bounded map,
  window pruning, clock/`reset` seams. Documented limitation: resets on restart,
  not shared across replicas (distributed → APP12). No DB, no schema.
- Enumeration/timing safety: unknown account runs one current-parameter dummy
  scrypt; wrong-password / unknown / LOCKED / DISABLED all return the same
  `401 STAFF_LOGIN_FAILED`; no account-existence signal in code/message/body.
- Public error contract: 400 `BAD_REQUEST` + `errors[]` (FU-A03), 401
  `STAFF_LOGIN_FAILED` / `UNAUTHORIZED`, 403 `FORBIDDEN`, 415
  `UNSUPPORTED_MEDIA_TYPE`, 429 `TOO_MANY_REQUESTS`, 500 generic. `204` carries
  no envelope/body.
- Redaction denylist extended (`credentialreference`, `rawtoken`, `tokenhash`,
  `settoken`); login body, Set-Cookie, tokens, passwords never logged.

## E. Persistence and transactions

- Code-only repository additions on existing tables (no migration, no schema
  change): `AdminAccountRepository.findActiveCredential` /
  `rotateCredential` (supersede-then-insert, transaction-guarded), and
  `AdminSessionRepository.extendExpiry` (ACTIVE-only slide).
- Login issues the session (and any rehash) in one `TransactionManager`
  transaction; the bootstrap creates account + credential in one transaction;
  logout revokes the current session in one transaction. Lock/disable →
  `revokeAllForAdmin` cascade wired in `StaffAccountStatusService` and tested.
- Migration verdict: **`NO_MIGRATION_REQUIRED`** — 31 migrations untouched.

## F. Audit and actor binding

- Events: `staff.login.succeeded` (ADMIN), `staff.login.failed` (SYSTEM,
  redacted reason class), `staff.logout` (ADMIN), `staff.access.rejected`
  (ADMIN), `staff.sessions.revoked_all` (SYSTEM), `staff.credential.bootstrapped`
  / `.rotated` (SYSTEM). Failed login actor is SYSTEM, never ANONYMOUS.
- `bindActor(createAdminActor(id))` runs exactly once, only after a verified
  credential (login) or resolved session (guard); nothing is bound on rejection.
  Request-id correlation retained on every event. No raw email/password/token in
  any audit row (asserted in tests).

## G. HTTP / OpenAPI / client evidence

- 204 responses with `Set-Cookie` and `Cache-Control: no-store`; token never in
  JSON. Cookie security scheme (`adminSession`) documented for logout; login
  request schema `StaffLoginRequest` (password `writeOnly`, no real secret
  example); 400/401/403/415/429 documented; `Retry-After` response header on 429.
- OpenAPI regenerated deterministically (twice, byte-identical). SHA-256:
  `3e7c739510c4c32091b4feb2a6749227b4e82520a059cee1e5968f02893acbdc`.
- Generated client regenerated deterministically. Tree hash:
  `9189d7c3a2c74ac6aa12167d07a1f171bfa39247d707fad2cfca980aeb548b16`.
  `staffSessionCreate(body, options)` takes the login body (FU-A08 first
  request-body op); `staffSessionDelete(options)` takes no cookie/token arg; no
  request-id injection; no TanStack hooks. `check:api-client` non-mutating.

## H. Integration and cleanup

- Real `AppModule` on disposable PostgreSQL via `createApiIntegrationContext`
  (T01) and `createPersistenceTestContext`; all canonical migrations applied;
  78-table baseline, fingerprint `4ca56a59…`.
- Disposable databases (masked): `embroidery_db7_b01-http_…`,
  `embroidery_db7_b01-cascade_…`, `embroidery_db7_b01-persistence_…`; the
  persistent `embroidery` database is refused by the harness guard and unchanged.
- Cleanup on success and failure via `CleanupStack`; no residue, no committed
  credentials, tokens, or DB metadata.

## I. Commit A evidence

- Commit A: `1eeb7f322b2c6662afdd2ce69a2b8fc1aaf4301a` —
  `feat(api): add staff session authentication`.
- 54 files (implementation only): identity module (domain/application/
  infrastructure/presentation/config), `cli/staff-bootstrap.ts`,
  `bootstrap/app.module.ts`, platform error-code/mapper (+415, business code) &
  redaction, two APP0 guard-test updates (openapi count, bindActor allowlist),
  `openapi-document.config.ts`, OpenAPI artifact, generated client + client test,
  `apps/api/package.json` (`staff:bootstrap`), `.env.example`,
  `LOCAL_DEVELOPMENT.md`.
- No dependency added; `pnpm-lock.yaml` unchanged. No `packages/database` or
  `packages/persistence` change (repo methods live in the identity module).

## J. Validation matrix

| Command | Exit | Result |
|---|---|---|
| `pnpm quality` | 0 | PASS (all gates) |
| `pnpm --filter @embroidery/api test` | 0 | 75 suites / 864 tests pass |
| `pnpm --filter @embroidery/api typecheck` | 0 | clean |
| `pnpm --filter @embroidery/api lint` | 0 | clean |
| `pnpm --filter @embroidery/api build` | 0 | dist built |
| `node tools/check-api-dist-boundary.mjs` | 0 | 301 files, no test code |
| `pnpm check:openapi` | 0 | up to date |
| `pnpm check:api-client` | 0 | up to date (non-mutating) |
| `pnpm --filter @embroidery/api-client test` | 0 | 31 tests pass |
| `pnpm check:e2e` | 0 | boundary clean |
| `git diff --check` | 0 | clean |
| OpenAPI generate ×2 | 0 | byte-identical |
| API client generate ×2 | 0 | identical tree hash |
| production plain-Node boot smoke | 0 | context boots + secure-cookie fail-fast |
| secret/redaction scan | 0 | no secret in src/dist/diff |

B01 adds **69 unit + 18 integration** focused tests (password, token, cookie,
origin, limiter, validation, resolution, use case, error mapping, config, HTTP
flow, repository additions, bootstrap, lock cascade).

## K. Deviations / follow-ups

- **Validation library**: the ADR mentions Zod, but the repo has no Zod and no
  global validation pipe (an open decision — `app-config.ts`). B01 hand-rolls a
  small login validator producing the canonical `errors[]` shape (FU-A03),
  adding **no dependency**. Follow-up: adopt a validation library by ADR if/when
  the decision is taken (non-blocking).
- **Audit target kind**: `AUDIT_TARGET_KINDS` has no `SESSION`; logout/session
  events use `ADMIN_ACCOUNT` (the polymorphic target has no FK). No schema
  change; consistent with the closed set. Non-blocking.
- **`staff.access.rejected` audit** fires only for the valid-session /
  disabled-account case (the security-significant one); ordinary invalid
  sessions return 401 without an audit write. Matches ADR intent.
- Production trust-proxy remains the APP0 single-hop dev value (FU-A04, APP12).

## L. Acceptance matrix

- Auth mechanism (scrypt, no dependency; token; cookie; CSRF; rate limit;
  bootstrap; guard; actor binding; audit; errors): **all satisfied** (§B–F).
- Contract (OpenAPI + client deterministic, committed; FU-A03; FU-A08; no
  hooks): **satisfied** (§G).
- Evidence (real AppModule, disposable PG, migrations/fingerprint, cleanup,
  persistent DB unchanged, no committed secret): **satisfied** (§H, §J).
- Scope (exactly two endpoints; no schema/migration; no UI/worker/gateway;
  Commit A implementation-only): **satisfied**.

## M. Scope confirmation

No `GET /api/staff/me` (APP1-B02), no renew endpoint, no Admin/Storefront UI, no
customer auth, no role/permission code, no MFA/OTP/reset, no persistent
rate-limit counters, no schema/migration, no distributed limiting, no gateway or
worker change.

## N. Evidence closure

- Commit A (implementation): `1eeb7f322b2c6662afdd2ce69a2b8fc1aaf4301a`.
- Commit B (this evidence): `docs(app1): record APP1-B01 completion evidence` —
  report + phase/roadmap/traceability/README status only.
- Pre-Commit-B tree: clean; exactly two new commits since `c721ae5`.
- Push status: **NOT PUSHED**.
- Verdict: **APP1-B01 = COMPLETE**, delivered for human review.
- APP1-B02 = `READY, NOT STARTED`.
