# APP1 — Pre-Implementation Audit

Operational audit for **APP1 — Staff Access and Application Shells**. Documentation
and planning only; no implementation. Companion to the phase plan
(`../phases/APP1-STAFF-ACCESS-AND-SHELLS.md`) and the completion report
(`../reports/APP1-PRE-IMPLEMENTATION-AUDIT-COMPLETION-REPORT.md`).

## 1. Scope and source precedence

Read per CLAUDE.md §2 order: charter, product requirements, scope/boundaries,
user journeys, business rules, security (§3 Admin access, §9 application security),
NFRs, glossary, decision log, acceptance principles; implementation README,
roadmap, traceability matrix, decision register; APP0 phase plan and X01 report;
architecture, repository structure, backend/frontend conventions, local
development; DB roadmap/README and the identity/audit DB artifacts. Where a topic
is delegated to a canonical implementation standard, that standard governs.

## 2. APP0 closure revalidation

- Initial HEAD `945aae3` (`docs(app0): record final closure evidence`); branch
  `production`; working tree clean; nothing pushed.
- APP0-X01 chain read from Git: Commit A `af4b569` (`docs(app0): close application
  delivery foundation`), Commit B `945aae3` (evidence + report). Report present at
  `../reports/APP0-X01-COMPLETION-REPORT.md`. APP0 = `COMPLETE`
  (`PASS_WITH_FOLLOW_UPS`); APP1 = `READY_FOR_ENGINEERING`, not started.
- Browser-free gates re-run at HEAD: `pnpm quality` = 0, `pnpm check:e2e` = 0,
  `pnpm check:openapi` = 0, `pnpm check:api-client` = 0. `pnpm quality:e2e` not
  re-run (browser cost); X01 §E proved it and this docs-only audit revalidated the
  browser-free set. **`APP0_CLOSURE_REVALIDATION = PASS`.**
- No APP1 implementation exists (no commit, route, controller, or app screen
  beyond the APP0 placeholder shells).

## 3. Canonical APP1 scope

- **Actors:** the single **ADMIN** operator (staff access) and **ANONYMOUS**
  public storefront visitors. Customer identity is APP4 and is out of scope.
- **Apps:** Admin (login + authenticated shell) and Storefront (public root
  shell), Admin leading by one capability (IMP-D007).
- **Authorization:** binary **authenticated-admin vs anonymous**. REQ-IDN-001
  locks *one active admin, no role matrix* — **no** permission matrix is built.
- **Session lifecycle:** issue on login, hashed-token lookup, expiry-on-read,
  explicit revoke on logout, revoke-all on lock/disable.
- **Audit:** login success/failure/logout events on `audit_events` via the
  `bindActor()` seam (IMP-D021), actor kind `ADMIN`, correlation id from B02.
- **Public routes:** the Storefront shell and all APP0 health endpoints remain
  anonymous and unaffected.
- **Worker:** none (first real worker work is APP2 / IMP-O003).
- **Migration:** none required (§7).
- **Design:** required — one `SUPPLEMENT` package (§5).

## 4. Design classification

**`SUPPLEMENT`** overall: **`NEW`** Admin login + authenticated shell (no existing
Figma artifact found — existing hi-fi covers Storefront discover/work/commission/
collections only), **`REUSE`** of the approved Storefront foundation for the
public shell (supplementing global error/loading/not-found). Delivered as one
phase package `APP1-D01` (IMP-D003); admin frontend checkpoints blocked until it
passes. No visual design produced in this audit.

## 5. Implementation inventory and gaps

| Area | Artifact | Classification | APP1 action |
|---|---|---|---|
| Identity schema | `admin_accounts`/`admin_credentials`/`admin_sessions` (DB7) | reusable | consume; no change |
| Identity repositories | `apps/api/src/modules/identity/**` (account + session, Drizzle, wired) | reusable | add use cases/controllers above them |
| Audit | `audit_events` + audit module | reusable | write login/logout/failure events |
| Actor/audit context | `bindActor()` seam, `AuditClock` (IMP-D021) | reusable (seam) | bind admin actor on authentication |
| Request context | `X-Request-ID` ALS (IMP-D020) | reusable | correlation only |
| Envelope + errors | global envelope + safe mapping (B03) | reusable | auth error mapping; FU-A02 stays deferred |
| Validation → `errors[]` | not yet implemented | placeholder | FU-A03 at `APP1-B01` |
| Generated client | Orval `axios-functions` + mutator (C02) | reusable | regenerate after B01/B02; FU-A08 |
| Admin shell | `apps/admin/src/app/layout.tsx` + placeholder `page.tsx` | placeholder | build shell (`APP1-A02`) |
| Storefront shell | `apps/storefront/src/app/**` (layout + placeholder) | placeholder | build shell (`APP1-S01`) |
| Auth guards/interceptors | none | missing | `APP1-B02` |
| Credential hashing / session token | none (provider open) | missing | `APP1-DEC-AUTH` → `APP1-B01` |
| Test harnesses | T01 (DB), T02A (RTL), T02B (Playwright) | reusable | reuse; no new harness |

## 6. Security audit

| Control | Position for APP1 |
|---|---|
| Credential storage | `admin_credentials.credential_reference` holds a hash/opaque ref only; plaintext never stored (D7-12). Kind CHECK-free until DEC-29. |
| Password/credential hashing | **open** → `APP1-DEC-AUTH` ADR (algorithm + params). |
| Session storage/authority | `admin_sessions.token_hash` + `findActiveByTokenHash` ⇒ **server-side, revocable, opaque hashed tokens**. Stateless-JWT-only auth is **excluded** by the persisted model. |
| Expiry/revocation | expiry-on-read; `revoke`/`revokeAllForAdmin` exist. |
| Login failure | enumeration- and timing-safe uniform response; `ADMIN_ACCOUNT_STATES` `LOCKED`/`DISABLED` handled. |
| Brute-force/rate-limit | **open** → `APP1-DEC-AUTH`: gateway/app-layer (no schema) is the default; persistent counters would require a DB checkpoint. No attempt/rate-limit table exists. |
| Cookie security / CSRF | **open** → `APP1-DEC-AUTH` (httpOnly/Secure/SameSite + CSRF strategy). |
| Audit logging | `audit_events` ready; redacted `summary`; correlation id required. |
| Secret/config | env/secret-managed; no hard-coded credential (`09 §3`). |
| First-admin bootstrap | REQ-IDN-001 replaceable identity, not hard-coded → procedure locked in `APP1-DEC-AUTH`. |
| MFA/password reset | MFA recommended not required; reset in/out decided by `APP1-DEC-AUTH`, else deferred. |

Locked and not reopened: request-id/context (IMP-D020), actor/audit (IMP-D021),
logging/redaction (IMP-D022), envelope (B03). Only IMP-O001/DEC-29 is genuinely
open and is isolated into `APP1-DEC-AUTH` before any backend code.

## 7. Database and persistence audit

| Use case | Owner | Tables | Existing repository/guard | Gap | Migration |
|---|---|---|---|---|---|
| Login | Identity | `admin_accounts`,`admin_credentials`,`admin_sessions`,`audit_events` | `findByEmail`, credential ref, `issue`; audit writer | credential *verification* (provider) + token generation | none |
| Logout | Identity | `admin_sessions`,`audit_events` | `revoke`; audit writer | logout use case | none |
| Refresh/renew | Identity | `admin_sessions` | `findActiveByTokenHash`,`issue`/`revoke` | renewal use case | none |
| Current-staff | Identity | `admin_sessions`,`admin_accounts` | `findActiveByTokenHash`,`findById` | guard/resolver | none |
| Lock/disable ⇒ revoke | Identity | `admin_accounts`,`admin_sessions` | `changeStatus`,`revokeAllForAdmin` | orchestration only | none |

DB0–DB10 migrations are immutable; no verified schema gap ⇒ **no DB checkpoint**
unless `APP1-DEC-AUTH` selects persistent lockout counters.

## 8. API audit (minimum set)

Two backend checkpoints, ≤3 endpoints each (IMP-D004). **Superseded by
`APP1-DEC-AUTH` (§2 sequencing fix): the guard must exist before logout, so the
guard/session-resolution moves into `APP1-B01`.** Corrected split (canonical in
the phase plan §7): **`APP1-B01`** = guard + `POST /api/staff/session` (login) +
`DELETE /api/staff/session` (logout) = 2 endpoints; **`APP1-B02`** =
`GET /api/staff/me` (current-staff) = 1 endpoint, no explicit renew (sliding
renewal in the guard). All use the standard envelope, timing-safe errors,
`<domainKey>_<methodKey>` operation ids, drive the existing repositories, emit
audit events, carry T01 integration tests, and force OpenAPI + generated-client
regeneration. No speculative endpoints; no role/permission endpoints (REQ-IDN-001).

## 9. Frontend and shell audit

- **`APP1-A01` Admin login** — one screen; states idle/pending/invalid/locked/
  disabled/recoverable-error; RTL tests; accessibility scan (FU-A14); depends on
  B01 + D01.
- **`APP1-A02` Admin shell** — root layout, metadata, header/sidebar/nav, account
  menu + current-user, authenticated/anonymous split, access-denied route,
  session-expiry, logout, route protection, deep-link handling, providers,
  responsive; component tests; depends on B02 + D01.
- **`APP1-S01` Storefront shell** — root layout, header/footer, metadata, global
  error/loading/not-found, SCSS/token integration; public; depends on D01.
- Shell SCSS is global-only (IMP-D010/D011); production build excludes test code
  (T02A boundary). Async Server Components are proven via E2E, not jsdom (IMP-D024).

## 10. Checkpoint map and dependency graph

`DEC-AUTH → D01 → B01 → B02 → A01 → A02 → S01 → E01 → X01` (see phase plan §7 for
per-checkpoint scope/tests/artifacts/acceptance). Decision and design gate their
dependents; backend precedes client regeneration precedes frontend; cross-layer
E2E precedes closure. Small vertical increments; one human-review boundary each.

## 11. Testing plan

- **Backend:** unit + T01 disposable-DB integration; authorization/error/audit
  and enumeration/timing-safe tests; OpenAPI drift + client regeneration gates.
- **Frontend:** Jest + `next/jest` + RTL; node env for server logic, jsdom for
  client components; no live network (mocked Axios/generated ops).
- **E2E (`APP1-E01`):** Playwright through the real gateway on a disposable DB;
  public routes until auth exists, then deterministic staff fixtures; no committed
  token/account.
- **Security:** enumeration/timing, password/session/cookie, audit/redaction, and
  authorization-boundary tests. No invented coverage thresholds.

## 12. APP0 follow-up routing

Activated and assigned: FU-A03 → B01; FU-A08 → B01 (re-check B02); FU-A14 → A01;
FU-A19 → D01; FU-A20 → D01/S01. Package-boundary FU-A01/A02/A05/A12 are gated on a
runtime-loadable package that APP1 does not build ⇒ **remain deferred**, ownership
unchanged. All other follow-ups keep their existing owners.

## 13. Exit criteria

Per phase plan §11: all checkpoints complete; design accepted; staff access works
end-to-end with backend enforcement; shell routes/protection correct; OpenAPI and
client current with no schema drift; audit events and security controls verified;
component/integration/E2E green; no blocking follow-up; `APP1-X01` report and APP2
handoff; R0 evaluated (not claimed unless both APP0 and APP1 pass). No production
readiness claimed.

## 14. Risks

- **Auth-provider decision drift** — mitigate by resolving DEC-29 in `APP1-DEC-AUTH`
  before any backend code; the persisted model already constrains it to
  server-side revocable sessions.
- **Scope creep into a role matrix** — explicitly locked out by REQ-IDN-001 (§3, §6
  of the plan); reconciliation recorded (plan §10).
- **Hidden schema change** — forbidden; any counter/lockout persistence must be a
  separate forward-only DB checkpoint (IMP-D013).
- **Design blocking frontend** — `APP1-D01` must PASS before A01/A02; Storefront
  reuse limits the NEW surface to Admin only.
