# ADR-APP1-001 — Staff Authentication, Revocable Sessions, Cookies, and Abuse Prevention

- Status: Accepted
- Date: 2026-07-24
- Git HEAD: `6c472e03b1f5ae9c8b4e564c6ba96801ec47c630`
- Decision IDs: D-018 (`docs/12-DECISION-LOG.md`), BR-016 (`docs/04-BUSINESS-RULES.md`), REQ-IDN-001..004
- Implementation decision: IMP-D027 (resolves IMP-O001 / DEC-29)
- Evidence: controlled spikes (Windows + Linux `node:22` container) recorded in
  `docs/implementation/reports/APP1-DEC-AUTH-COMPLETION-REPORT.md` §C; temp
  workspace deleted, nothing committed.

## Context

APP1 delivers staff access for a **single active ADMIN operator with no role
matrix** (REQ-IDN-001, BR-016, D-018). The identity persistence already exists
(DB7): `admin_accounts` (state `ACTIVE|LOCKED|DISABLED`, one-active partial unique
index), `admin_credentials` (provider-abstract `credential_kind` + hashed/opaque
`credential_reference`, no CHECK until this ADR — DB4 COL-TBL002-02),
`admin_sessions` (unique `token_hash`, `expires_at`, `revoked_at`,
`client_metadata`), and `audit_events` (actor kinds `ADMIN|CUSTOMER|SYSTEM`,
CST-072). Repositories are wired (`apps/api/src/modules/identity`) with
`findByEmail`/`attachCredential`/`changeStatus` and session
`issue`/`revoke`/`revokeAllForAdmin`/`findActiveByTokenHash`. The APP0 platform
provides the `RequestContextService.bindActor()` seam (IMP-D021), the response
envelope + transport error codes (`UNAUTHORIZED`/`FORBIDDEN`/`TOO_MANY_REQUESTS`),
and redaction-before-serialize logging (IMP-D022).

This ADR resolves the only open blocking decision (IMP-O001/DEC-29) before any
backend code.

## Decision Drivers

- Topology (`LOCAL_DEVELOPMENT.md` §4–§7): admin is `admin.embroidery.local`,
  storefront is `embroidery.local` — same registrable domain, **different
  origin**; the browser calls `/api` **same-origin per host** through the Nginx
  gateway; the dev gateway is **plain HTTP**; the API trusts **one** proxy hop and
  reads `X-Forwarded-Proto`.
- The persisted model (`admin_sessions.token_hash` + `findActiveByTokenHash`)
  already commits to **server-side, revocable, opaque hashed sessions**;
  stateless-JWT-only auth would contradict it and is excluded.
- Supply-chain conservatism is a repository norm (CLAUDE.md §5/§9; APP0 rejected
  Java- and vendor-runtime dependencies). A zero-native-dependency primitive that
  behaves identically on Windows, glibc and musl containers is strongly preferred.
- Scale is one operator; login throughput is irrelevant, so a deliberately slow
  password hash is free.

## Decision

### 1. Login identifier — email

`admin_accounts.email` (unique, IDX-001). Normalization: `trim` + lowercase
(case-insensitive), NFKC, max **254** bytes (RFC 5321). The identifier is **never
logged** (redacted) and is **never echoed**. Login failure is generic regardless
of whether the email exists (no enumeration).

### 2. Password hashing — Node built-in `crypto.scrypt` (RFC 7914)

Parameters `N=2^17 (131072)`, `r=8`, `p=1`, `keylen=32`, per-hash 16-byte
`randomBytes` salt, `maxmem=256 MiB`. Self-describing stored string
`scrypt$N=131072,r=8,p=1$<saltB64>$<hashB64>` in `credential_reference`;
`credential_kind = 'password_scrypt'`. Verify decodes the stored parameters,
recomputes, and compares with `timingSafeEqual`. **Rehash-on-verify**: if the
stored parameters differ from the current policy, re-hash the presented password
after a successful verify. Password policy: **min 12** chars, **max 4096 bytes**
(reject longer — no silent truncation), NFKC, UTF-8, no forced composition
(NIST 800-63B length-over-complexity). Rationale over Argon2id: OWASP lists
scrypt `N=2^17,r=8,p=1` as acceptable; the built-in adds **zero** dependency and
**zero** native-addon supply-chain/install surface, and behaves identically
cross-platform (measured). Argon2id (`@node-rs/argon2`) is the reviewed,
benchmarked alternative, adoptable later with **no schema change** (the
`credential_reference` string is opaque and `credential_kind` records the
algorithm) via the same rehash-on-verify seam and an ADR update.

### 3. Session token

`crypto.randomBytes(32)` (256-bit CSPRNG), `base64url` in the cookie only;
stored as `sha256(token)` in `admin_sessions.token_hash` (unique IDX-003). The
raw token exists only in the cookie and in request memory — **never persisted,
never logged**. Lookup is by hash via `findActiveByTokenHash` (expiry enforced on
read). **Concurrent sessions are allowed** (the operator may sign in from several
machines — REQ-IDN "recoverable across machines"); each is independently
revocable; no cap in APP1. Revocation: logout revokes the current session;
lock/disable revokes all (`revokeAllForAdmin`).

### 4. Session lifetime

Idle timeout **30 min**, absolute timeout **12 h**. Expiry is enforced on read
(already implemented). **Sliding idle renewal, no explicit renew endpoint**
(rule: do not add a refresh endpoint by JWT convention): the guard extends
`expires_at = min(now + idle, created_at + absolute)` and only writes when less
than half the idle window remains (renewal threshold) to avoid a write per
request. This uses the existing `expires_at`/`updated_at` columns and one new
**repository method** (`extendExpiry`, code — **not** schema). Clock skew is not
trusted from the client; the server clock is authoritative. Logout and
lock/disable take effect immediately via revocation.

### 5. Cookie contract

Host-only (no `Domain`) so the admin cookie can never reach `embroidery.local`.

| Attribute | Production | Development |
|---|---|---|
| Name | `__Host-adm_session` | `adm_session` |
| Secure | yes | no (plain-HTTP gateway) |
| HttpOnly | yes | yes |
| SameSite | `Strict` | `Strict` |
| Path | `/` | `/` |
| Domain | omitted (host-only) | omitted |
| Max-Age | absolute timeout | absolute timeout |

`__Host-` requires `Secure`, impossible over dev HTTP, so the prefix and `Secure`
are enabled only when `STAFF_SESSION_COOKIE_SECURE=true`; **production fails fast**
if it is false (`BACKEND_CONVENTIONS.md` §16). Logout deletes the cookie with the
**same** attributes and `Max-Age=0`. The token is **never** stored in
`localStorage`/`sessionStorage`. `Secure` is derived from `X-Forwarded-Proto`
(one trusted hop); production trust-proxy config is re-decided with the production
gateway (FU-A04).

### 6. CSRF — layered, not SameSite alone

For every state-changing (non-GET) authenticated request: (a) `SameSite=Strict`
host-only cookie; (b) **Origin allowlist** (`Origin`/`Referer` must equal the
admin origin) rejecting with **403**; (c) **JSON-only** content type
(`application/json`) rejected with **415** otherwise, blocking cross-site HTML
form posts. Login is itself Origin-checked (login CSRF). Residual risk: a
compromised same-site subdomain is mitigated by the host-only cookie (storefront
cannot carry the admin cookie); a full anti-CSRF token is unnecessary at this
topology and is deferred to APP12 if the production topology changes. The spike
proved cross-origin login is refused (403) and same-origin succeeds.

### 7. Brute-force / rate limiting — in-process, transient

Dimensions: normalized **identifier**, source **IP** (first `X-Forwarded-For`
hop, one trusted proxy), and a **global** admin-login ceiling. Initial values:
identifier **5 / 15 min**, IP **20 / 15 min**, global **100 / 5 min** → **429
TOO_MANY_REQUESTS** with `Retry-After`. Storage is **in-process** (single API
replica in dev). **Limitation (documented):** counters reset on restart and are
not shared across replicas; distributed/persistent rate limiting is APP12
hardening (FU routed). **No automatic persistent account lockout** in APP1 (there
is no attempt/counter column and none is added — see Migration): the
`admin_accounts.LOCKED` state stays an explicit operator action. This keeps APP1
**migration-free**.

### 8. Bootstrap / first admin — out-of-band idempotent CLI

A dedicated administrative script (an `apps/api` command, e.g.
`pnpm --filter @embroidery/api staff:bootstrap`), **never** run on normal API
startup. It reads `STAFF_BOOTSTRAP_EMAIL`, `STAFF_BOOTSTRAP_PASSWORD` (env, never
argv, never logged) and `STAFF_BOOTSTRAP_DISPLAY_NAME`, hashes the password with
the §2 service, and creates the account + credential in one transaction. It is
**idempotent** and **refuses** when an `ACTIVE` admin already exists unless an
explicit `--rotate` recovery mode is used (rotate the single admin's credential,
using the `replaced_by` successor chain / `changeStatus`). The action is audited
(actor `SYSTEM`, `system_job_key = 'staff.bootstrap'`). No default credential;
production secret comes from an approved secret channel.

### 9. Password reset / recovery — operator recovery only

APP1 includes **credential rotation via the bootstrap CLI recovery mode**; it does
**not** include an email/OTP self-service reset (no provider; MFA/OTP deferred to
APP4-era DEC-29 scope).

### 10. Guard and actor binding order

`cookie extract → sha256 → findActiveByTokenHash(now) → load account & assert
ACTIVE → (expiry enforced on read) → sliding-extend past threshold →
bindActor(createAdminActor(account.id)) → guard admits → controller/use case`.
Anonymous (no/invalid cookie) on a protected route → **401**; the guard binds
nothing. Current-staff source is the resolved account (`id`, `email`,
`displayName`). Logout resolves then revokes and clears the cookie. Audit
metadata is read via `AuditMetadataFactory` (bound actor + `requestId`). The
guard/session service is owned by the identity module’s presentation/application
layers (no business logic in the guard — `BACKEND_CONVENTIONS.md` §22).

### 11. Audit taxonomy (writes to `audit_events`, CST-072-valid)

| Action | actor_kind | ref | target | reason |
|---|---|---|---|---|
| `staff.login.succeeded` | ADMIN | admin_id | admin account | — |
| `staff.login.failed` | SYSTEM | `staff.auth` | `admin_login` (constant) | redacted code (`INVALID_CREDENTIALS`/`ACCOUNT_NOT_ACTIVE`/`RATE_LIMITED`) |
| `staff.logout` | ADMIN | admin_id | session | — |
| `staff.sessions.revoked_all` | SYSTEM | `staff.auth` | admin account | lock/disable cascade |
| `staff.access.rejected` | ADMIN | admin_id | session | `ACCOUNT_NOT_ACTIVE` (valid session, account disabled mid-session) |
| `staff.credential.bootstrapped` / `.rotated` | SYSTEM | `staff.bootstrap` | admin account | — |

Failed login uses `SYSTEM` (the auth subsystem records the security signal) — not
`ANONYMOUS`, which is never persisted (IMP-D021). The **raw identifier, password
and token are never written**; the normalized identifier is not stored (only the
redacted reason class + `correlation_id` + timestamp). Session renewal is not
audited (not security-significant beyond the audited login).

### 12. Error contract (activates FU-A03)

- Login failure → **401** `STAFF_LOGIN_FAILED`, generic message, **identical** for
  unknown-account / wrong-password / disabled / locked (enumeration-safe). Unknown
  account still performs a **dummy scrypt verify** to equalize timing.
- Rate limited → **429** `TOO_MANY_REQUESTS` + `Retry-After`.
- Unauthenticated protected route (no/expired/revoked session) → **401**
  `UNAUTHORIZED`.
- Authenticated-without-permission → **403** `FORBIDDEN` (reserved; the guard
  distinguishes 401 no-identity vs 403 identity-without-permission for later
  phases).
- Malformed request body → **400** `BAD_REQUEST` with field-level `errors[]`
  (**FU-A03**).

## Migration verdict — `NO_MIGRATION_REQUIRED`

Every decision concern maps to an existing column or repository method; the only
additions are **code** (a `password_scrypt` credential kind value, one
`extendExpiry` repository method, an in-process rate limiter). No schema change,
no new migration (DB0–DB10 immutable). See the completion report §B/§E.

## Consequences

- Positive: zero new production dependency for hashing; provider decision closed
  without weakening the DB4/DB7 abstraction; Argon2id remains a no-migration
  upgrade path; server-side sessions give true revocation and lock/disable
  cascade; host-only `Strict` cookie + Origin + JSON-only gives layered CSRF at
  this topology.
- Negative / accepted: in-process rate limiting and no persistent lockout are
  weaker than a distributed design (documented, APP12); scrypt at these params is
  ~250–330 ms per hash (acceptable for a single operator); a sliding-renewal write
  adds one occasional session update per active window.

## Alternatives considered

- **Argon2id via `@node-rs/argon2` 2.0.2 (MIT)** — OWASP first preference, faster
  in the spike (p95 ~20–40 ms), clean prebuilt binaries (`win32-x64-msvc`,
  `linux-x64-gnu`, no node-gyp). Rejected as the APP1 default only on
  dependency-minimization: it is CJS-only (named-ESM import fails) and exposes no
  `needsRehash` helper (manual PHC parse). Retained as the documented upgrade.
- **`argon2` (node-argon2) 0.45.1** — node-gyp/native build, heavier Windows/musl
  install story; not spiked beyond version/license review.
- **bcrypt** — 72-byte input trap and weaker memory-hardness; comparison only.
- **Stateless JWT sessions** — contradicts the persisted revocable-session model;
  excluded.
