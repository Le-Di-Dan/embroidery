# APP1 — Staff Access and Application Shells

> **Status:** `ENGINEERING_IN_PROGRESS`. Pre-implementation audit complete
> (`../audits/APP1_PRE_IMPLEMENTATION_AUDIT.md`); `APP1-DEC-AUTH` is **COMPLETE**
> (IMP-D027, ADR-APP1-001 — report
> `../reports/APP1-DEC-AUTH-COMPLETION-REPORT.md`); `APP1-D01` is
> **`COMPLETE — ADMIN DESIGN APPROVED`** (report
> `../reports/APP1-D01-COMPLETION-REPORT.md`; registry
> `../../design/FIGMA_DESIGN_INDEX.md` — 13 Admin frames `APPROVED_FOR_IMPLEMENTATION`,
> Storefront + annotation frames still unapproved).
> `APP1-B01` (backend) is **COMPLETE — CORRECTED** (report
> `../reports/APP1-B01-COMPLETION-REPORT.md`; two staff-session endpoints,
> `NO_MIGRATION_REQUIRED`; validation corrected to the canonical Zod pipeline by
> `APP1-B01-C1`, report `../reports/APP1-B01-C1-CORRECTION-REPORT.md`).
> `APP1-B02` is **COMPLETE — CORRECTED** (current staff `GET /api/staff/me`; report
> `../reports/APP1-B02-COMPLETION-REPORT.md`; `NO_MIGRATION_REQUIRED`; success-data
> requirement corrected by `APP1-B02-C1`, `../reports/APP1-B02-C1-CORRECTION-REPORT.md`).
> The Product Owner approved the APP1 Admin login + shell designs, recorded at
> `APP1-A01` (approval `docs/design/approvals/APP1-D01-ADMIN-DESIGN-APPROVAL.md`), promoting
> the 13 Admin registry rows to `APPROVED_FOR_IMPLEMENTATION`; `APP1-D01` is now
> **COMPLETE — ADMIN DESIGN APPROVED**. **`APP1-A01` is
> `COMPLETE — CORRECTED, DELIVERED_FOR_PRODUCT_OWNER_REVIEW`** (Admin `/login`
> screen; report `../reports/APP1-A01-COMPLETION-REPORT.md`). **`APP1-A01-C1` is
> COMPLETE** — login readiness correction (password-toggle hydration through the
> dev gateway, bidirectional route protection, automatic Compose admin bootstrap;
> no migration; live-tested through `admin.embroidery.local`), report
> `../reports/APP1-A01-C1-CORRECTION-REPORT.md`. **`APP1-A01-C2` is COMPLETE** —
> real isolated-Compose evidence for the bootstrap environment policy (8/8 cases,
> zero residue) closing the A01-C1 evidence gap; report
> `../reports/APP1-A01-C2-CORRECTION-REPORT.md`. The Product Owner completed the
> A01 live test and accepted it, so **`APP1-A01` is
> `COMPLETE — CORRECTED — PRODUCT_OWNER_ACCEPTED`**. The Product Owner also
> live-tested and accepted A02, so **`APP1-A02` is
> `COMPLETE — PRODUCT_OWNER_ACCEPTED`** — authenticated Admin shell (protected-
> layout shell, one server-hydrated current-staff query, logout, client
> session-expiry modal, mobile drawer; no migration; live-tested through
> `admin.embroidery.local`), report `../reports/APP1-A02-COMPLETION-REPORT.md`.
> **`APP1-D02` is `DELIVERED_FOR_PRODUCT_OWNER_REVIEW`** — Storefront shell &
> not-found design SUPPLEMENT (standalone desktop/tablet/mobile shell, mobile
> navigation-open, desktop/mobile `/404`; Figma page `APP_01` section `405:2224`;
> all rows `REVIEW_REQUIRED`; `FIG-STOREFRONT-NOTFOUND` gap closed), report
> `../reports/APP1-D02-COMPLETION-REPORT.md`. `APP1-S01` remains
> `BLOCKED_BY_PRODUCT_OWNER_APP1_D02_REVIEW`;
> `APP1-E01` is `BLOCKED_BY_APP1_A02_PRODUCT_OWNER_REVIEW_AND_APP1_S01`. All others
> `NOT_STARTED` per §7. Phase status is owned
> by `../10-MASTER-APPLICATION-ROADMAP.md` §6.
>
> **A01 handoff (for A02):** the mobile-error design frame
> `FIG-ADMIN-LOGIN-MOBILE-ERROR` (383:9) shows the mobile visual language for both
> field-validation and generic auth failure; at runtime they stay distinct
> (`400 errors[]` → field messages; `401 STAFF_LOGIN_FAILED` → one generic
> form-level alert). `FU-A14` (first interactive-screen accessibility scan) was
> addressed at `APP1-A01`. Token gaps `FU-A15` (`$color-text-inverse`,
> `$color-action-disabled`) and local breakpoint `FU-A16` are recorded in the A01 report.

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
| **APP1-D01** | design | **COMPLETE — ADMIN DESIGN APPROVED** — 16 frames in `APP_01` (`375:11`): Admin login (all states), Admin authenticated shell (header/nav/account/logout/loading/session-expired), Storefront reuse map + responsive/impl annotations. Canonical registry `FIGMA_DESIGN_INDEX.md` + governance + `check:figma-design-index`. Product Owner approved the 13 Admin login+shell rows (`APPROVED_FOR_IMPLEMENTATION`, recorded at `APP1-A01`); Storefront + annotation frames remain unapproved. Report `../reports/APP1-D01-COMPLETION-REPORT.md`. Resolves FU-A19; decides FU-A20. | APP0 |
| **APP1-B01** | backend | **COMPLETE** — Staff session open/close + auth primitives: password (scrypt) + session services, authenticated-admin **guard/session-resolution**, `extendExpiry`/`findActiveCredential`/`rotateCredential` (code-only, no migration), out-of-band `staff:bootstrap` CLI; endpoints `POST /api/staff/session` + `DELETE /api/staff/session` = **2 endpoints**. Login-success/failure(SYSTEM)/logout audit, timing-/enumeration-safe errors, in-process rate limit, layered CSRF, `bindActor()`. T01 integration + security tests; OpenAPI + client regenerated. Resolved FU-A03; first check of FU-A08. Report `../reports/APP1-B01-COMPLETION-REPORT.md`. | APP1-DEC-AUTH |
| **APP1-B02** | backend | **COMPLETE — CORRECTED** — Current-staff `GET /api/staff/me` (operation ID `staffSelf_get`) = **1 endpoint**, consuming the B01 guard; success `200` `data` made **required** in OpenAPI/client by `APP1-B02-C1` (`../reports/APP1-B02-C1-CORRECTION-REPORT.md`); `@CurrentStaff()` decorator + `GetCurrentStaffQuery` project the guard-resolved session to `{id,email,displayName}` (no second lookup); sliding-renewal and negative (401 missing/malformed/duplicate/unknown/revoked/idle/absolute/LOCKED/DISABLED) tests; no ordinary-read audit; `Cache-Control: no-store`, no `Set-Cookie`; **no explicit renew endpoint**. `NO_MIGRATION_REQUIRED`. OpenAPI + client regenerated. Re-checked FU-A08. Report `../reports/APP1-B02-COMPLETION-REPORT.md`. | APP1-B01 |
| **APP1-A01** | frontend | **COMPLETE — CORRECTED — PRODUCT_OWNER_ACCEPTED** — Admin `/login` screen; server shell + client `staff-auth` feature; default/submitting/validation/auth-failed/rate-limited/network/success states; `staffSessionCreate`; RTL component + a11y + boundary tests; no migration. Product Owner approval recorded (approvals/APP1-D01-ADMIN-DESIGN-APPROVAL.md), 13 Admin rows promoted; live test passed and accepted. Resolves FU-A14; corrected by `APP1-A01-C1`/`-C2`. Report `../reports/APP1-A01-COMPLETION-REPORT.md`. | APP1-B01, APP1-D01 |
| **APP1-A01-C1** | frontend/correction | **COMPLETE** — login readiness correction closing the Product-Owner runtime findings: password-toggle hydration through the dev gateway (`allowedDevOrigins`), bidirectional Admin route protection (`proxy.ts` + server session resolver + `(protected)` group), automatic one-shot Compose `db-migrate` + `staff-bootstrap` with idempotent create/reuse and dev-fail/prod-skip env policy. Also fixed the double-`/api` base and API origin/cookie env. No migration; live-tested through `admin.embroidery.local` (204 login, `adm_session`). Opens follow-up FU-A17 (repo-wide `/api` base reconciliation). Report `../reports/APP1-A01-C1-CORRECTION-REPORT.md`. | APP1-A01 |
| **APP1-A01-C2** | test/correction | **COMPLETE** — real isolated-Compose evidence for the bootstrap environment policy (closes the A01-C1 §H/§M evidence gap): test-only `docker-compose.smoke.yml` override + `tools/smoke-app1-bootstrap-compose.mjs` harness run 8/8 throwaway-project cases (dev missing-env `up --wait` non-zero + readiness blocked, dev partial-missing fail, create/reuse with no rotation, prod missing/partial skip, unknown-env fail-closed), zero residual resources, normal dev stack untouched. Uncovered + fixed a genuine result-line observability defect (`{ logger: false }` silenced the Nest `Logger`). No migration; no UI/auth change. Report `../reports/APP1-A01-C2-CORRECTION-REPORT.md`. | APP1-A01-C1 |
| **APP1-A02** | frontend | **DELIVERED_FOR_PRODUCT_OWNER_REVIEW** — authenticated Admin shell in the protected route-group layout: app bar (brand, current-staff identity, logout), desktop sidebar nav, mobile navigation drawer, main content slot, loading/reconnect status, client session-expiry modal. One server-hydrated `staffSelfGet` per navigation (no mount duplicate); `staffSessionDelete` logout; SCSS-only via `@embroidery/styles`; RTL component + a11y + drawer + boundary tests; live-tested through `admin.embroidery.local`; no migration. Report `../reports/APP1-A02-COMPLETION-REPORT.md`. | APP1-B02, APP1-D01, APP1-A01-C1 |
| **APP1-S01** | frontend | **Storefront application shell** — root layout, header/footer, metadata foundation, global not-found boundary, SCSS/token integration. Public; no auth. **Split (frontend checkpoint-size rule) into two reviewable slices:** `APP1-S01A` (shared shell + responsive navigation) and `APP1-S01B` (not-found boundary). May land FU-A20 (stylelint hook). | APP1-D01, APP1-D02 |
| **APP1-S01A** | frontend | **Shared Storefront shell + responsive navigation** — server-first root layout owning `StorefrontShell` (header · `<main id="main-content">` slot · footer), responsive Full/Compact header, presentational primary nav (routes unbuilt → non-interactive), presentational non-submitting search affordance, focus-trapped/scroll-locked mobile drawer (`410:2311`), skip link. Consumes the five approved D02 shell rows `FIG-STOREFRONT-SHELL-DESKTOP-DEFAULT`, `FIG-STOREFRONT-SHELL-TABLET-DEFAULT`, `FIG-STOREFRONT-SHELL-MOBILE-DEFAULT`, `FIG-STOREFRONT-SHELL-MOBILE-NAVOPEN`, `FIG-STOREFRONT-SHELL-NOTES` (approval `approvals/APP1-D02-STOREFRONT-DESIGN-APPROVAL.md`). SCSS-only via `@embroidery/styles`; local breakpoint (FU-A16); local scrim (GAP-D02). No not-found, no business capability, no API/schema change. | APP1-A02, APP1-D02 |
| **APP1-S01B** | frontend | **Storefront not-found boundary** — `not-found.tsx` rendered inside the S01A shell, home/discover recovery, from the two approved D02 not-found rows (`FIG-STOREFRONT-NOTFOUND`, `-MOBILE`). Not started; blocked by the S01A Product Owner review. | APP1-S01A |
| **APP1-E01** | integration/E2E | **Access E2E** through the real gateway on a disposable DB (T01/T02B): valid login, invalid login, session expiry/renewal, logout, protected-route denial, and audit-actor propagation; deterministic staff fixture, no committed token. | APP1-A02, APP1-S01 |
| **APP1-X01** | closure | Phase closure audit (security/contract/UI/logs), R0 evaluation, and APP2 handoff. | APP1-E01 |

Ordering: `DEC-AUTH ✓ → {B01, D01} → B02 → A01 → A02 → S01(A→B) → E01 → X01`. With
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
- **SUPPLEMENT — Storefront shell & not-found** (`APP1-D02`, for `APP1-S01`):
  delivered in Figma page `APP_01` (`371:3`), section `APP1-D02 · Storefront Shell &
  Not-found` (`405:2224`), all rows `REVIEW_REQUIRED`. Standalone, implementation-
  ready shared shell extracted from the approved Homepage (`183:7`/`189:266`/`191:412`)
  and composed from DS `FIG-DS-HEADER` (Full ≥1024 / Compact <1024), `FIG-DS-FOOTER`,
  `FIG-DS-MOBILEMENU`, `FIG-DS-BUTTON` (`FIG-DS-NAVLINK`/`FIG-DS-SEARCHBAR` embedded):
  - `FIG-STOREFRONT-SHELL-DESKTOP-DEFAULT` (`405:2225`),
    `FIG-STOREFRONT-SHELL-TABLET-DEFAULT` (`405:3733`),
    `FIG-STOREFRONT-SHELL-MOBILE-DEFAULT` (`405:3786`),
    `FIG-STOREFRONT-SHELL-MOBILE-NAVOPEN` (`410:2311`) — desktop/tablet/mobile shell
    (header · `<main>` page-content slot · footer) + mobile navigation-open drawer.
  - `FIG-STOREFRONT-NOTFOUND` (`411:2337`, desktop) + `FIG-STOREFRONT-NOTFOUND-MOBILE`
    (`411:3851`) — shared-shell `/404` boundary with safe copy and home/discover
    recovery actions; tablet `/404` documented as interpolation (no dedicated frame).
  - `FIG-STOREFRONT-SHELL-NOTES` (`412:2396`) — ownership, responsive, interaction,
    and accessibility annotations.

  **S01 implementation handoff:** implement the shared Storefront route/layout that
  renders every route into the `<main>` slot; the responsive header (Full ≥1024,
  Compact <1024) with a focus-trapped, scroll-locked, Escape/backdrop-dismissible
  mobile drawer; the compact mobile footer; the skip-link; and the `/404` not-found
  boundary with home/discover recovery. Shell owns landmarks and no page `<h1>`;
  each page owns its own `<h1>` and content. SCSS-only via `@embroidery/styles`
  tokens; local breakpoint (no global breakpoint token, consistent with Admin
  FU-A16); scrim via local composition (`ink/900 @45%`, GAP-D02). Do **not**
  implement Homepage or any business capability. **The Product Owner reviewed the
  D02 package in Figma and PASSED it** (approval record
  `approvals/APP1-D02-STOREFRONT-DESIGN-APPROVAL.md`); the seven D02 rows are
  `APPROVED_FOR_IMPLEMENTATION`. `APP1-S01` is split into `APP1-S01A` (shared shell +
  responsive navigation — consumes the five shell rows in registry §4.2) and
  `APP1-S01B` (not-found boundary — consumes `FIG-STOREFRONT-NOTFOUND` and its
  mobile row); S01A is implemented first and S01B is blocked by the S01A review.
- The three prior Homepage shell-reference rows (`FIG-STOREFRONT-SHELL-DESKTOP`,
  `FIG-STOREFRONT-SHELL-TABLET`, `FIG-STOREFRONT-SHELL-MOBILE`) are `SUPERSEDED`
  by the standalone D02 shell rows above; the Homepage frames remain valid Homepage
  references and are **not** the shell implementation target.
- **Design-system gaps recorded:** `FIG-DS-INPUT` (no Input component — login inputs
  composed from primitives), `FIG-DS-SCRIM-TOKEN` (no scrim token — overlay uses
  `ink/900 @45%`). The former `FIG-STOREFRONT-NOTFOUND` gap is closed by APP1-D02.

Registry integrity is enforced by `pnpm check:figma-design-index`
(`07-TESTING-AND-ACCEPTANCE-GATES.md` §6.1).

## 8. APP0 follow-up routing

Activated in APP1 and assigned to a checkpoint: **FU-A03** → `APP1-B01`;
**FU-A08** → `APP1-B01` (re-checked `APP1-B02`); **FU-A14** → `APP1-A01`;
**FU-A19** → `APP1-D01`; **FU-A20** → `APP1-D01`/`APP1-S01`. New at
`APP1-A01-C1`: **FU-A17** — reconcile the generated-operations `/api` prefix vs
the `NEXT_PUBLIC_API_BASE_PATH`/`INTERNAL_API_BASE_URL` bases repo-wide
(Storefront + shared env/D-036 docs); the admin app is corrected locally via
`toApiOriginBase`, owner APP2. The package-boundary
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
