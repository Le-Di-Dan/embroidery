# APP1-DEC-AUTH — Staff Authentication and Session Architecture — Completion Report

Checkpoint `APP1-DEC-AUTH — Select and lock staff authentication and session
architecture`. Decision + controlled-spike only; no implementation. **Verdict:
`PASS`.** Resolves **IMP-O001** and **DEC-29** via **IMP-D027** / **ADR-APP1-001**.

## A. Preflight and audit revalidation

- Branch `production`. **Initial HEAD `6c472e03b1f5ae9c8b4e564c6ba96801ec47c630`**
  (`docs(app1): record pre-implementation audit evidence`), tree clean, unpushed.
- APP1-AUDIT chain from Git: Commit A `dad1b6587d34fea88fea1a64dd8b8dd9a2ff0fb8`,
  Commit B `6c472e0`. Report present:
  `reports/APP1-PRE-IMPLEMENTATION-AUDIT-COMPLETION-REPORT.md` (verdict PASS).
- APP0 `COMPLETE`; APP1 `READY_FOR_ENGINEERING`, not started; only APP1-DEC-AUTH
  was `READY`. No auth implementation source exists (grep hits were `.next` build
  artifacts + the redaction denylist). 31 migrations unchanged; identity module
  persistence-only.
- Gates (pre-commit and post-Commit-A): `pnpm quality` = 0, `check:openapi` = 0,
  `check:api-client` = 0, `check:e2e` = 0. **`APP1_AUDIT_REVALIDATION = PASS`.**
- Node `v22.14.0`, pnpm `11.5.2`, Docker `27.5.1`, npm registry reachable.

## B. Existing schema and constraints (no-role model)

| Table | Fields used | Repository methods |
|---|---|---|
| `admin_accounts` | `email` (uq), `status` `ACTIVE\|LOCKED\|DISABLED`, one-active partial uq, `replaced_by` | `create`,`findByEmail`,`findById`,`changeStatus`,`exists` |
| `admin_credentials` | `credential_kind` (no CHECK), `credential_reference` (hash/opaque), `rotated_at`,`revoked_at` | `attachCredential` |
| `admin_sessions` | `token_hash` (uq), `expires_at`, `revoked_at`, `updated_at`, `client_metadata` | `issue`,`revoke`,`revokeAllForAdmin`,`findActiveByTokenHash` |
| `audit_events` | `actor_kind`,`admin_id`,`system_job_key`,`action`,`target_*`,`reason`,`correlation_id` (CST-072) | audit writer |

Single active ADMIN, **no role matrix** (REQ-IDN-001/BR-016/D-018). Persisted
model already commits to server-side revocable hashed sessions.

## C. Candidate matrix and spike

Controlled spikes ran in an OS-temp workspace outside the repo (Windows + a
`node:22` Linux container), **deleted after**; nothing committed; no repo
dependency installed.

| Password option | Version / license | Install | Win p95 hash/verify | Linux p95 hash/verify | Notes |
|---|---|---|---|---|---|
| **scrypt (Node built-in)** ✅ | Node core (v22) | none | 310 / 327 ms | 248 / 247 ms | zero dep; identical cross-platform; async (loop not blocked) |
| @node-rs/argon2 (Argon2id) | 2.0.2 / MIT | prebuilt `win32-x64-msvc`,`linux-x64-gnu`, 2 s, no node-gyp | 41 / 36 ms | 21 / 19 ms | OWASP-first, faster; CJS-only (named-ESM fails), no `needsRehash` helper |
| argon2 (node-argon2) | 0.45.1 / MIT | node-gyp/native | — | — | reviewed only; heavier Win/musl build |
| bcrypt | — | — | — | — | 72-byte trap; comparison only |

Correctness (both spiked finalists): verify success/failure, Unicode (`NFKC`),
malformed-hash rejection, >4096-byte rejection, param-change rehash detection —
all pass. scrypt params `N=2^17,r=8,p=1,keylen=32,maxmem=256MiB` (OWASP-accepted).

**Cookie/session/CSRF contract spike** (pure Node http + mock store) proved the
locked contract is expressible: login → `204` + `Set-Cookie: adm_session=<token>;
Path=/; HttpOnly; SameSite=Strict; Max-Age=43200` (dev, no `Secure`); authed
`/me` → `200`; anonymous → `401`; cross-origin login (`Origin: evil`) → `403`;
logout → deletion cookie (`Max-Age=0`, same attrs) and next `/me` → `401`
(revoked); raw token never present in captured logs.

## D. Locked authentication decision (IMP-D027 / ADR-APP1-001)

- **Identifier:** email; trim+lowercase, NFKC, ≤254 B; never logged/echoed;
  generic failure (no enumeration).
- **Password:** built-in `crypto.scrypt` `N=2^17,r=8,p=1,keylen=32`, 16-B salt,
  string `scrypt$N=…,r=…,p=…$salt$hash`, `credential_kind='password_scrypt'`,
  `timingSafeEqual`, rehash-on-verify; policy min 12 / max 4096 B, NFKC.
  Argon2id is the reviewed no-migration upgrade (opaque `credential_reference`).
- **Token/session:** `randomBytes(32)` base64url, stored `sha256` in `token_hash`;
  raw never persisted/logged; concurrent sessions allowed; logout revokes one,
  lock/disable `revokeAllForAdmin`.
- **Lifetime:** idle 30 min / absolute 12 h; expiry-on-read; **sliding renewal in
  the guard, no renew endpoint**; write only past the half-idle threshold via a
  new `extendExpiry` repo method (code, not schema).
- **Cookie:** host-only `__Host-adm_session` (prod: `Secure`+`SameSite=Strict`+
  `HttpOnly`+`Path=/`) / `adm_session` (dev HTTP, no `Secure`); prod fails fast if
  `STAFF_SESSION_COOKIE_SECURE=false`; never in web storage; logout deletes with
  matching attrs.
- **CSRF:** layered — `SameSite=Strict` host-only cookie + Origin allowlist (403)
  + JSON-only (415); login Origin-checked; residual risk documented (not SameSite
  alone).
- **Rate limiting:** in-process/transient — identifier 5/15 min, IP 20/15 min,
  global 100/5 min → 429 + `Retry-After`; resets on restart / not cross-replica
  (documented, APP12); **no persistent lockout**.
- **Bootstrap/recovery:** out-of-band idempotent `staff:bootstrap` CLI, env secret
  (never argv/log), refuses an existing ACTIVE admin except `--rotate`; audited
  SYSTEM. No self-service email/OTP reset in APP1.
- **Guard/actor order:** cookie→sha256→`findActiveByTokenHash`→account ACTIVE→
  sliding-extend→`bindActor(createAdminActor(id))`→admit. Anonymous protected →
  401; failed login enumeration/timing-safe (generic 401 + dummy verify).
- **Audit:** `staff.login.succeeded` (ADMIN), `staff.login.failed` (**SYSTEM**,
  never ANONYMOUS), `staff.logout` (ADMIN), `staff.sessions.revoked_all`,
  `staff.access.rejected`, `staff.credential.bootstrapped/.rotated`; no raw
  identifier/password/token stored; renewal not audited.
- **Errors:** 401 `STAFF_LOGIN_FAILED` (uniform for unknown/wrong/disabled/locked),
  429 `TOO_MANY_REQUESTS`, 401 `UNAUTHORIZED`, 403 `FORBIDDEN` (reserved), 400
  `BAD_REQUEST` + `errors[]` (**FU-A03**).

## E. Migration and checkpoint correction

**Migration verdict: `NO_MIGRATION_REQUIRED`.** Every concern maps to an existing
column/method; additions are code only (`password_scrypt` value, `extendExpiry`
method, in-process limiter). DB0–DB10 immutable; no counter/lockout table added.

**Sequencing fix (prompt §2 — logout must not precede session authentication):**
the guard/session-resolution moves into B01.

| Checkpoint | Endpoints | Contents |
|---|---|---|
| **APP1-B01** | `POST /api/staff/session` (login), `DELETE /api/staff/session` (logout) — **2** | scrypt password service, session service, authenticated-admin guard, `extendExpiry`, `staff:bootstrap` CLI, rate limiter, audit, `bindActor` |
| **APP1-B02** | `GET /api/staff/me` (current-staff) — **1** | consumes B01 guard; sliding renewal + negative tests; **no renew endpoint** |

Both ≤3 endpoints (IMP-D004). Ordering `DEC-AUTH ✓ → {B01, D01} → B02 → A01 →
A02 → S01 → E01 → X01`.

## F. B01 implementation handoff

- **Use cases:** `authenticate-staff` (verify credential, issue session, bind
  actor, audit), `revoke-session` (logout), plus the `bootstrap-admin` CLI use
  case. Guard `AuthenticatedAdminGuard` + session-resolution service.
- **Endpoints:** `staffSession_create` (login), `staffSession_delete` (logout).
- **Dependencies:** none new (Node `crypto`). Do **not** install `argon2`/
  `@node-rs/argon2` (upgrade path only).
- **Config/env (validated at startup, fail-fast):** `STAFF_SESSION_COOKIE_SECURE`,
  `STAFF_SESSION_IDLE_TIMEOUT_MINUTES=30`, `STAFF_SESSION_ABSOLUTE_TIMEOUT_HOURS=12`,
  `STAFF_LOGIN_RATE_LIMIT_*`, `STAFF_PASSWORD_MIN_LENGTH=12`; CLI:
  `STAFF_BOOTSTRAP_EMAIL/PASSWORD/DISPLAY_NAME`.
- **Repositories:** `findByEmail`,`findById`,`attachCredential`,`changeStatus`
  (accounts); `issue`,`revoke`,`revokeAllForAdmin`,`findActiveByTokenHash` +
  **new** `extendExpiry` (sessions).
- **Transactions:** login (issue session) and bootstrap (account+credential) are
  explicit transactions.
- **Audit/errors:** §D taxonomy and error contract. **Rate-limit seam** is an
  injectable in-process limiter (swappable for a distributed store in APP12).
- **Tests (T01 + security):** success/failure/enumeration/timing, disabled/locked,
  expired/revoked, logout revocation, lock cascade, rate-limit 429, cookie
  attributes, raw-token-absent-from-logs, OpenAPI drift + client regeneration.
- **Allowed files:** `apps/api/src/modules/identity/**`, an `apps/api` bootstrap
  script, `apps/api/test/**`, generated OpenAPI/client. **Exclusions:** no schema/
  migration, no frontend, no shell, no role/permission code, no new dependency.
- **Stop condition:** B01 complete + reviewed; do not start B02/A01.

## G. Follow-up routing

**FU-A03** (validation `errors[]`) → owned by **B01** (login body validation).
**FU-A08** (client ergonomics on the first real request body) → exercised in B01,
re-checked B02. Package-boundary **FU-A01/A02/A05/A12** are **not activated** (B01
adds no runtime-loadable package); ownership unchanged.

## H. Validation matrix

| Command | Exit |
|---|---|
| `pnpm quality` (pre + post-commit) | 0, 0 |
| `pnpm check:openapi` / `check:api-client` / `check:e2e` | 0 / 0 / 0 |
| `git diff --check` | 0 |

Official sources: OWASP Password Storage / Session Management cheat sheets, Node
`crypto` docs (scrypt RFC 7914), MDN Set-Cookie/`__Host-` prefix, npm registry
metadata for `@node-rs/argon2 2.0.2` (MIT) and `argon2 0.45.1` (MIT). Temp spike
deleted; no source/manifest/lockfile change.

## I. Acceptance matrix

| # | Criterion | Result |
|---|---|---|
| 1–3 | Audit chain verified; APP0 COMPLETE; APP1 not started | PASS |
| 4 | IMP-O001/DEC-29 resolved (IMP-D027) | PASS |
| 5–6 | Password algo/pkg/version/params locked; Win+Linux finalist spikes | PASS |
| 7–9 | Session entropy/hash/lifetimes; renewal (sliding, no endpoint); concurrent policy | PASS |
| 10–12 | Cookie; CSRF; rate-limit strategy/thresholds/storage | PASS |
| 13–14 | Bootstrap; recovery/reset scope | PASS |
| 15–17 | Guard/actor order; audit taxonomy; error contract | PASS |
| 18–19 | Schema support mapped; migration verdict explicit (none) | PASS |
| 20 | No migration/source implementation | PASS |
| 21–23 | B01/B02 corrected; logout after session auth; ≤3 endpoints | PASS |
| 24–25 | B01 handoff; FU-A03/FU-A08 routed | PASS |
| 26–27 | Official sources + metadata; temp spike removed | PASS |
| 28–35 | Commit A docs-only; report cites hash; two commits; clean; unpushed; not started | PASS |

## J. Commit A evidence

`docs(app1): select staff authentication architecture` —
**`741dadd18bf2cebf7ab50ef4231e63c2f5855a9b`** (5 files, +287 / −33).

```text
docs/adr/backend/ADR-APP1-001-STAFF-AUTHENTICATION-AND-SESSIONS.md
docs/development/LOCAL_DEVELOPMENT.md
docs/implementation/14-IMPLEMENTATION-DECISION-REGISTER.md
docs/implementation/audits/APP1_PRE_IMPLEMENTATION_AUDIT.md
docs/implementation/phases/APP1-STAFF-ACCESS-AND-SHELLS.md
```

No app/package/tool/database/infra/manifest/lockfile change.

## K. Evidence closure

- **APP1-DEC-AUTH = COMPLETE.** APP0 `COMPLETE`; APP1 `READY_FOR_ENGINEERING`, not
  started. Next READY: **`APP1-B01`** and **`APP1-D01`** (independent), `NOT_STARTED`.
- Commit B subject: `docs(app1): record authentication decision evidence`.
- Pre-Commit-B tree: clean but the report + roadmap/matrix/README status pointers.
- **Push status: NOT PUSHED** — all commits local on `production`.
- No production readiness claimed (IMP-D015, APP12).
