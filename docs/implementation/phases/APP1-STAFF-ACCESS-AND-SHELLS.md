# APP1 — Staff Access and Application Shells

> **Status:** `ENGINEERING_IN_PROGRESS`. Pre-implementation audit complete
> (`../audits/APP1_PRE_IMPLEMENTATION_AUDIT.md`); `APP1-DEC-AUTH` is **COMPLETE**
> (IMP-D027, ADR-APP1-001 — report
> `../reports/APP1-DEC-AUTH-COMPLETION-REPORT.md`); `APP1-D01` is
> **`DELIVERED_FOR_HUMAN_REVIEW`** (report
> `../reports/APP1-D01-COMPLETION-REPORT.md`; registry
> `../../design/FIGMA_DESIGN_INDEX.md` — all new frames `REVIEW_REQUIRED`).
> `APP1-B01` (backend) is **COMPLETE — CORRECTED** (report
> `../reports/APP1-B01-COMPLETION-REPORT.md`; two staff-session endpoints,
> `NO_MIGRATION_REQUIRED`; validation corrected to the canonical Zod pipeline by
> `APP1-B01-C1`, report `../reports/APP1-B01-C1-CORRECTION-REPORT.md`).
> `APP1-B02` is **COMPLETE — CORRECTED** (current staff `GET /api/staff/me`; report
> `../reports/APP1-B02-COMPLETION-REPORT.md`; `NO_MIGRATION_REQUIRED`; success-data
> requirement corrected by `APP1-B02-C1`, `../reports/APP1-B02-C1-CORRECTION-REPORT.md`). The frontend
> checkpoints `APP1-A01/A02` remain `BLOCKED_BY_DESIGN_APPROVAL` and `APP1-S01`
> `BLOCKED_BY_STOREFRONT_DESIGN_APPROVAL_AND_COVERAGE` until the
> APP1-D01 entries are promoted to `APPROVED_FOR_IMPLEMENTATION` (`A01` also needs
> `B01` ✓; `A02` needs `B02` ✓; `S01` also needs the Storefront shell promoted).
> All others `NOT_STARTED` per §7. Phase status is owned by
> `../10-MASTER-APPLICATION-ROADMAP.md` §6.

## 1. Outcome

Deliver secure single-operator staff authentication and an authenticated Admin
shell, and establish a public Storefront shell. This phase turns the APP0
identity persistence and audit/actor foundation into a working, revocable admin
session and the two application shells every later phase renders inside. It is
the closure owner for milestone **R0** (`../09-RELEASE-AND-MILESTONE-POLICY.md`).

## 2. Dependencies

- APP0 `COMPLETE` (`../reports/APP0-X01-COMPLETION-REPORT.md`).
- **IMP-O001 / DEC-29 (auth mechanism) — RESOLVED** by `APP1-DEC-AUTH` (IMP-D027,
  `../../adr/backend/ADR-APP1-001-STAFF-AUTHENTICATION-AND-SESSIONS.md`): built-in
  `crypto.scrypt`, server-side revocable opaque sessions, host-only `Strict`
  cookie, layered CSRF, in-process rate limiting, out-of-band bootstrap CLI.
- Identity persistence already exists (DB7): `admin_accounts` (TBL-001),
  `admin_credentials` (TBL-002), `admin_sessions` (TBL-003), `audit_events`
  (TBL-072); repositories are wired in `apps/api/src/modules/identity`. **No
  schema change is required by APP1** (§6, audit §7).

## 3. Design policy

Phase classification: **`SUPPLEMENT`** — a mix of **`NEW`** Admin surfaces (login
screen, authenticated shell) with no existing design artifact, and **`REUSE`**
of the approved Storefront foundation for the public shell. Per IMP-D003 the
design is produced and reviewed as **one coherent phase package** (`APP1-D01`),
not split into coding checkpoints; admin frontend checkpoints are **blocked until
that package passes**. Storefront reuses approved navigation/foundation where
complete and supplements only the global error/loading/not-found conventions.

## 4. In scope

- Staff login, logout, session renewal/refresh, and current-staff context.
- **Authenticated-admin authorization** — a binary guard (valid live session ⇒
  the single admin actor), with an extensible authorization seam for later
  phases. **There is no role/permission matrix**: REQ-IDN-001 locks *exactly one
  active admin, no role matrix* (`../../04-BUSINESS-RULES.md` BR-016,
  `../../12-DECISION-LOG.md` D-018). See §10 reconciliation.
- Audit actor identity for admin actions via the APP0 `bindActor()` seam
  (IMP-D021) and `audit_events`.
- Admin login screen, authenticated shell, navigation, account menu,
  current-user display, forbidden/access-denied and session-expired states.
- Storefront root shell: layout, metadata, header/footer, and global
  error/loading/not-found conventions.
- Cookie/session security, CSRF and session-fixation controls as locked by
  `APP1-DEC-AUTH`.

## 5. Out of scope

- Customer account registration, verification, profile, and secure grants (APP4).
- Any role/permission matrix or multi-operator staff management (locked out by
  REQ-IDN-001; re-openable only by a future ADR that changes the identity model).
- Product/catalog, asset, design-studio, and all later feature surfaces and their
  navigation items (added by their owning phases).
- MFA/OTP delivery (provider is DEC-29/APP4-era; MFA is *recommended*, not
  required — `../../09-SECURITY-AND-ABUSE-PREVENTION.md` §3).
- Self-service email/OTP password reset. `APP1-DEC-AUTH` includes **operator
  credential rotation via the bootstrap CLI recovery mode** only; no reset flow.

## 6. Database and migration position

**No migration is required by APP1.** The three identity tables and
`audit_events` exist since DB7 (78-table baseline, fingerprint `4ca56a59…`), and
the domain repositories already expose every method the auth use cases need
(`create`/`findByEmail`/`attachCredential`/`changeStatus`; session
`issue`/`revoke`/`revokeAllForAdmin`/`findActiveByTokenHash`). `credential_kind`
is intentionally CHECK-free and now carries the value `password_scrypt` (IMP-D027;
still no CHECK — kept provider-abstract). `APP1-DEC-AUTH` confirmed
**`NO_MIGRATION_REQUIRED`**: rate limiting is **in-process/transient** (no counter
table), there is **no persistent account-lockout**, and sliding renewal reuses the
existing `expires_at`/`updated_at` columns via one new **repository method**
(`extendExpiry` — code, not schema). No DB checkpoint exists in APP1; any future
counter/lockout persistence would be a separate forward-only DB checkpoint
(IMP-D013, `../08-DATABASE-CHANGE-CONTROL.md`), never hidden in a backend checkpoint.

## 7. Checkpoint map

Planning slices. Execute and review exactly one at a time; stop for human review
after each. Backend checkpoints never exceed five tightly related endpoints
(IMP-D004); each frontend checkpoint owns one screen/capability (IMP-D005).

| ID | Type | Scope (summary) | Predecessors |
|---|---|---|---|
| **APP1-DEC-AUTH** | decision | **COMPLETE** — resolved IMP-O001/DEC-29: built-in `crypto.scrypt` hashing, server-side revocable opaque sessions (`admin_sessions.token_hash`), host-only `Strict` cookie, layered CSRF (Origin + JSON-only), in-process rate limiting, out-of-band bootstrap CLI; migration verdict `NO_MIGRATION_REQUIRED`. IMP-D027, `../../adr/backend/ADR-APP1-001-STAFF-AUTHENTICATION-AND-SESSIONS.md`. | APP0 |
| **APP1-D01** | design | **DELIVERED_FOR_HUMAN_REVIEW** — 16 frames in `APP_01` (`375:11`): Admin login (all states), Admin authenticated shell (header/nav/account/logout/loading/session-expired), Storefront reuse map + responsive/impl annotations. Canonical registry `FIGMA_DESIGN_INDEX.md` created + governance + `check:figma-design-index`. New frames `REVIEW_REQUIRED`; A01/A02/S01 blocked pending approval. Report `../reports/APP1-D01-COMPLETION-REPORT.md`. Resolves FU-A19; decides FU-A20. | APP0 |
| **APP1-B01** | backend | **COMPLETE** — Staff session open/close + auth primitives: password (scrypt) + session services, authenticated-admin **guard/session-resolution**, `extendExpiry`/`findActiveCredential`/`rotateCredential` (code-only, no migration), out-of-band `staff:bootstrap` CLI; endpoints `POST /api/staff/session` + `DELETE /api/staff/session` = **2 endpoints**. Login-success/failure(SYSTEM)/logout audit, timing-/enumeration-safe errors, in-process rate limit, layered CSRF, `bindActor()`. T01 integration + security tests; OpenAPI + client regenerated. Resolved FU-A03; first check of FU-A08. Report `../reports/APP1-B01-COMPLETION-REPORT.md`. | APP1-DEC-AUTH |
| **APP1-B02** | backend | **COMPLETE — CORRECTED** — Current-staff `GET /api/staff/me` (operation ID `staffSelf_get`) = **1 endpoint**, consuming the B01 guard; success `200` `data` made **required** in OpenAPI/client by `APP1-B02-C1` (`../reports/APP1-B02-C1-CORRECTION-REPORT.md`); `@CurrentStaff()` decorator + `GetCurrentStaffQuery` project the guard-resolved session to `{id,email,displayName}` (no second lookup); sliding-renewal and negative (401 missing/malformed/duplicate/unknown/revoked/idle/absolute/LOCKED/DISABLED) tests; no ordinary-read audit; `Cache-Control: no-store`, no `Set-Cookie`; **no explicit renew endpoint**. `NO_MIGRATION_REQUIRED`. OpenAPI + client regenerated. Re-checked FU-A08. Report `../reports/APP1-B02-COMPLETION-REPORT.md`. | APP1-B01 |
| **APP1-A01** | frontend | **Admin login screen** — one screen; idle/pending/invalid-credential/locked/disabled/recoverable-error states; RTL component tests. Resolves FU-A14 (accessibility scan on the first interactive screen). | APP1-B01, APP1-D01 |
| **APP1-A02** | frontend | **Admin application shell** — layout, navigation, account menu, current-user display, route protection, access-denied route, session-expiry handling, logout, responsive behavior; component tests. | APP1-B02, APP1-D01 |
| **APP1-S01** | frontend | **Storefront application shell** — root layout, header/footer, metadata foundation, global error/loading/not-found, SCSS/token integration. Public; no auth. May land FU-A20 (stylelint hook). | APP1-D01 |
| **APP1-E01** | integration/E2E | **Access E2E** through the real gateway on a disposable DB (T01/T02B): valid login, invalid login, session expiry/renewal, logout, protected-route denial, and audit-actor propagation; deterministic staff fixture, no committed token. | APP1-A02, APP1-S01 |
| **APP1-X01** | closure | Phase closure audit (security/contract/UI/logs), R0 evaluation, and APP2 handoff. | APP1-E01 |

Ordering: `DEC-AUTH ✓ → {B01, D01} → B02 → A01 → A02 → S01 → E01 → X01`. With
`DEC-AUTH` complete, `APP1-B01` (backend) and `APP1-D01` (design, no engineering
predecessor) are **independently `READY`** and may proceed in parallel under
phase-level design governance (IMP-D003); neither starts implementation until
human review. Admin leads Storefront by one capability (IMP-D007): `S01` follows
the Admin shell. `APP1-E01` seeds a deterministic staff fixture through the
`staff:bootstrap` CLI against the disposable T01/DB7 database and authenticates via
the login endpoint to obtain Playwright `storageState`; no token/account is
committed.

## 7a. APP1-D01 design references (Figma registry)

The `APP1-D01` design package is delivered in Figma page `APP_01` (`371:3`), section
`375:11`, and registered in the canonical registry
[`../../design/FIGMA_DESIGN_INDEX.md`](../../design/FIGMA_DESIGN_INDEX.md). All new
frames are `REVIEW_REQUIRED`. **Implementation may not use a `REVIEW_REQUIRED`
entry** — `APP1-A01/A02/S01` are blocked until a human promotes the relevant rows to
`APPROVED_FOR_IMPLEMENTATION`.

- **NEW — Admin login** (`APP1-A01`): `FIG-ADMIN-LOGIN-DESKTOP-DEFAULT`,
  `FIG-ADMIN-LOGIN-DESKTOP-SUBMITTING`, `FIG-ADMIN-LOGIN-DESKTOP-VALIDATION`,
  `FIG-ADMIN-LOGIN-DESKTOP-AUTHFAILED`, `FIG-ADMIN-LOGIN-DESKTOP-RATELIMITED`,
  `FIG-ADMIN-LOGIN-MOBILE-DEFAULT`, `FIG-ADMIN-LOGIN-MOBILE-ERROR`.
- **NEW — Admin shell** (`APP1-A02`): `FIG-ADMIN-SHELL-DESKTOP-DEFAULT`,
  `FIG-ADMIN-SHELL-DESKTOP-LOADING`, `FIG-ADMIN-SHELL-DESKTOP-SESSIONEXPIRED`,
  `FIG-ADMIN-SHELL-MOBILE-DEFAULT`, `FIG-ADMIN-SHELL-MOBILE-NAVOPEN`,
  `FIG-ADMIN-SHELL-MOBILE-SESSIONEXPIRED`.
- **Annotations:** `FIG-APP1D01-REUSE-MAP`, `FIG-APP1D01-RESPONSIVE-NOTES`,
  `FIG-APP1D01-IMPL-ANNOTATIONS`.
- **REUSE — Storefront shell** (`APP1-S01`): `FIG-STOREFRONT-SHELL-DESKTOP`,
  `FIG-STOREFRONT-SHELL-TABLET`, `FIG-STOREFRONT-SHELL-MOBILE` (all `DRAFT`), built
  from DS `FIG-DS-HEADER`, `FIG-DS-FOOTER`, `FIG-DS-MOBILEMENU`, `FIG-DS-NAVLINK`,
  `FIG-DS-SEARCHBAR`, `FIG-DS-BUTTON`. **`APP1-S01` is additionally blocked** until
  the Storefront shell rows are promoted from `DRAFT` and the missing shell-level
  boundary `FIG-STOREFRONT-NOTFOUND` is designed.
- **Design-system gaps recorded:** `FIG-DS-INPUT` (no Input component — login inputs
  composed from primitives), `FIG-DS-SCRIM-TOKEN` (no scrim token — overlay uses
  `ink/900 @45%`), `FIG-STOREFRONT-NOTFOUND` (no shell-level 404/error frame).

Registry integrity is enforced by `pnpm check:figma-design-index`
(`07-TESTING-AND-ACCEPTANCE-GATES.md` §6.1).

## 8. APP0 follow-up routing

Activated in APP1 and assigned to a checkpoint: **FU-A03** → `APP1-B01`;
**FU-A08** → `APP1-B01` (re-checked `APP1-B02`); **FU-A14** → `APP1-A01`;
**FU-A19** → `APP1-D01`; **FU-A20** → `APP1-D01`/`APP1-S01`. The package-boundary
items **FU-A01/FU-A02/FU-A05/FU-A12** are *gated on a package becoming
runtime-loadable*; APP1 does not require that, so they **remain deferred** with
unchanged ownership. All other follow-ups keep their APP2/APP3/APP12/documentation
owners (`APP0-…FOUNDATION.md` §11).

## 9. Critical end-to-end journey

The single admin logs in through the Admin UI, lands on a permitted shell, calls
a protected API through the generated client, is refused a request without a live
session (safe 401), and logs out cleanly — every step leaving a redacted audit
event with the correct admin actor and request-id correlation.

## 10. Reconciliation note (single-operator authorization)

The pre-audit revision of this plan named an "Authorization foundation /
permission resolver" and "permission-aware navigation." That contradicts the
**locked** identity model: REQ-IDN-001 mandates *exactly one active admin and no
role matrix* (`../../04-BUSINESS-RULES.md` BR-016, `../../12-DECISION-LOG.md`
D-018), and no roles/permissions table exists in the DB7 baseline. Per CLAUDE.md
§2 this contradiction is **reported, not silently resolved**: APP1 delivers a
binary **authenticated-admin** guard plus an extensible authorization seam;
per-feature permission codes are introduced by later phases **only** if a future
ADR changes the identity model. Navigation is authenticated-vs-anonymous, not
permission-filtered, in APP1.

## 11. Exit gate

- No mock authentication; the backend (not only the UI) enforces access.
- Sensitive/credential errors are redacted; login is enumeration/timing-safe.
- Admin and Storefront shells use global SCSS only (IMP-D010/D011).
- OpenAPI artifact and generated client are current; no schema drift.
- Login/logout/failure audit events verified with correct actor and correlation.
- Component, T01 integration, and `APP1-E01` E2E suites pass.
- No blocking follow-up; `APP1-X01` completion report and APP2 handoff exist.
- **R0** is evaluated at `APP1-X01`: it closes only if both APP0 and APP1 have
  passed. Production readiness is **not** claimed (IMP-D015, APP12).

## 12. Handoff

APP2 renders inside the Admin and Storefront shells and reaches protected APIs
through the authenticated-admin guard without changing the auth foundation. When
APP2 introduces real asynchronous work it also owns IMP-O003 (queue/broker) and
FU-A07 (worker logging/correlation).
