# APP1 — Staff Access and Application Shells — Completion Report

## A. Executive verdict

**Final APP1 verdict: `PASS_WITH_FOLLOW_UPS`.** Every planned APP1 checkpoint is complete with evidence; every Product-Owner-facing checkpoint is accepted; the cross-layer acceptance suite (APP1-E01) and its correction (APP1-E01-C1) are review-accepted; every closure gate passes on a clean-tree re-run. The verdict is `PASS_WITH_FOLLOW_UPS` (not plain `PASS`) because a set of non-blocking follow-ups are routed to later phases (§M). **Zero blocking follow-ups.** No product capability, UI, schema, contract, or design artifact was changed by this closure — it is documentation, reconciliation, and baseline-lock only.

APP1 is the closure owner for milestone **R0**: with APP0 `COMPLETE` and APP1 now closed, **R0 is achieved** (foundation milestone; production readiness remains APP12 per IMP-D015).

## B. Phase scope and exclusions

**In scope (delivered):** single-operator staff authentication (scrypt, revocable opaque sessions, host-only `Strict` cookie, layered CSRF, in-process rate limit, out-of-band bootstrap CLI), authenticated-admin binary guard + authorization seam, current-staff context, Admin login screen + authenticated shell (app bar, nav, mobile drawer, loading/reconnect, session-expired modal), Storefront shared shell (responsive Full/Compact header, footer, mobile drawer, `<main>` slot, metadata) and not-found boundary (HTTP 404), and cross-layer acceptance through the real gateway.

**Explicitly excluded (not APP1):** business dashboard, Homepage implementation, product/catalog/customer/order capabilities, search implementation, customer auth, cart/checkout, Design Studio, any role/permission matrix (locked out by REQ-IDN-001), MFA/OTP delivery, self-service reset, and all APP2+ capabilities.

## C. Checkpoint / commit chain

Read from `git log` (full hashes). Two-commit protocol: implementation/decision commit + separate evidence commit. Branch `production`; **nothing pushed.**

| Checkpoint | Type | Impl/decision | Evidence | Verdict | Report |
|---|---|---|---|---|---|
| APP1 pre-audit | audit | `dad1b6587d34fea88fea1a64dd8b8dd9a2ff0fb8` | `6c472e03b1f5ae9c8b4e564c6ba96801ec47c630` | accepted | `APP1-PRE-IMPLEMENTATION-AUDIT-COMPLETION-REPORT.md` |
| APP1-DEC-AUTH | decision | `741dadd18bf2cebf7ab50ef4231e63c2f5855a9b` | `061c00cc33eb9864713495b267f577188603f12a` | PASS (IMP-D027) | `APP1-DEC-AUTH-COMPLETION-REPORT.md` |
| APP1-D01 | design | `ca611a9ff6672091dce9695b065e654d441e489e` | `c721ae5a84c3f3cce41a5ba89040e722efeadf7e` | PO-ACCEPTED (13 rows) | `APP1-D01-COMPLETION-REPORT.md` |
| APP1-B01 | backend | `1eeb7f322b2c6662afdd2ce69a2b8fc1aaf4301a` | `08a70e9279d0e27c1225c9a753f09b78ed12dbaf` | COMPLETE — CORRECTED | `APP1-B01-COMPLETION-REPORT.md` |
| APP1-B01-C1 | correction | `1724905c8a697ecad3fc4b30f7d059836990e085` | `c3f7026d63d652734926c934eb3ccb24bc82219f` | PASS | `APP1-B01-C1-CORRECTION-REPORT.md` |
| APP1-B02 | backend | `66e2854183ddba8b701360e1f3ee97ea08ee18cf` | `c99c9f4e69ae057cf2f8ed0755ba5c9091fd9f20` | COMPLETE — CORRECTED | `APP1-B02-COMPLETION-REPORT.md` |
| APP1-B02-C1 | correction | `673f1dff39b735e5c184e520d24098088895aba2` | `be52c084b757b3b9dd60e34b573f139e74634e0c` | PASS | `APP1-B02-C1-CORRECTION-REPORT.md` |
| APP1-A01 | frontend | `27e57e3535fb2732c2b580bad59d8de7ac8dc4aa` | `930d0cd28df0559b59abcbbfc304967d7ff05649` | PO-ACCEPTED (corrected) | `APP1-A01-COMPLETION-REPORT.md` |
| APP1-A01-C1 | correction | `9aabbf066fef05e6b7c222645f3f30f053e09c1c` | `2145137101353df82bee79c85068a08480950262` | COMPLETE | `APP1-A01-C1-CORRECTION-REPORT.md` |
| APP1-A01-C2 | test/correction | `32a7854490e79a75c7cdc71c43ce9070cfa4a2b3` | `9f01083c0cbc1e25b54a2899f0aa76658b99911c` | COMPLETE | `APP1-A01-C2-CORRECTION-REPORT.md` |
| APP1-A02 | frontend | `67fd9f60b6989dcaa6a57eaf1c86f9a8b18b878f` | `9310940c4346ab37a0e5f851642768b10d26ef9b` | PO-ACCEPTED | `APP1-A02-COMPLETION-REPORT.md` |
| APP1-D02 | design | `eb57ad2548d120819e11b81970f7f3c412d48121` | `f4f336a0f4602fbde5af7bd556dc664ec4b0f285` | PO-ACCEPTED (7 rows) | `APP1-D02-COMPLETION-REPORT.md` |
| APP1-S01A | frontend | `0b11fbb0d2202cb4fe477b8fc26408079f67ed8d` | `ae6206b3fb4efd0734c5aadc20823aeef146d182` | PO-ACCEPTED | `APP1-S01A-COMPLETION-REPORT.md` |
| APP1-S01B | frontend | `f45821b546a883f818763ad3f1279913cdb09b5a` | `063b0dbca23a24047f238cca5846172b6161b796` | PO-ACCEPTED | `APP1-S01B-COMPLETION-REPORT.md` |
| APP1-E01 | integration/E2E | `3b4f31e3df8cd08e61a192ba9af085d027d9c7e6` | `75d0971a1ecfe3dff5cf75aec6554b382175114f` | REVIEW-ACCEPTED (corrected) | `APP1-E01-COMPLETION-REPORT.md` |
| APP1-E01-C1 | correction | `8d247b4ce104e1df33338f1593f141a727586ef8` | `84b02b3a68d04b1bde2609069556007cd6bfe0f6` | COMPLETE (PASS_WITH_FOLLOW_UPS) | `APP1-E01-C1-CORRECTION-REPORT.md` |
| APP1-X01 | closure | this report (Commit A; exact hash recorded in `APP1-CLOSURE-EVIDENCE.md`) | `APP1-CLOSURE-EVIDENCE.md` | PASS_WITH_FOLLOW_UPS | this report |

Parent `APP1-S01` = `COMPLETE — PRODUCT_OWNER_ACCEPTED` (S01A + S01B). 16 delivery checkpoints + closure; every implementation/decision commit has a paired evidence commit or report.

## D. Product Owner and review acceptance

- **Product-Owner live-tested and accepted:** A01 (corrected), A02, D01 (13 Admin rows), D02 (7 Storefront rows), S01A, S01B → parent S01.
- **Review-accepted:** E01 (cross-layer acceptance) and E01-C1 (`PASS_WITH_FOLLOW_UPS` — the two missing failure journeys closed with real cross-layer evidence).
- Backend B01/B02 and their C1 corrections are accepted at the engineering gate (contract + integration + security tests).

## E. Admin capability baseline (frozen)

Automatic Admin bootstrap (dev missing-env fail / prod missing-env skip / create / reuse); `POST /api/staff/session` (login → 204), `DELETE /api/staff/session` (logout → 204/401), `GET /api/staff/me` (current staff → 200 `{id,email,displayName}`); HttpOnly, host-only, `SameSite=Strict`, `Path=/` session cookie (`adm_session` dev / `__Host-adm_session` prod); bidirectional route protection (cookie-presence proxy + authoritative server resolver); login/logout; later session-expiry modal (non-dismissable); safe error classification (401 vs 429 vs network/5xx). Admin shell: protected shared layout, desktop/mobile shell, mobile drawer, loading/reconnect state, session-expired state, one server-hydrated current-staff resolution per navigation.

## F. Storefront capability baseline (frozen)

Shared shell: desktop Full header, tablet/mobile Compact header, desktop/tablet footer, mobile footer, focus-trapped mobile drawer, `<main id="main-content">` slot, SSR + metadata preservation. Not-found: App Router `not-found.tsx` boundary → HTTP 404, desktop/tablet/mobile behavior, safe recovery to `/`, shared-shell integration. SCSS-only via `@embroidery/styles`. Non-interactive nav/search where routes are unbuilt (no dead anchors, no invented routes).

## G. Cross-layer baseline (frozen)

Proven through the real gateway → Next → Nest → PostgreSQL on a disposable DB: bootstrap policies (8/8), anonymous/authenticated/invalid-cookie route matrices, valid/invalid login, identifier rate limit (5→401, 6th→429 + Retry-After), logout, forced expiry/revocation, invalid/stale cookie (authoritative 401), initial protected-page API outage (safe framework 5xx — not `/login`, no expiry modal, no raw detail) + API recovery, Storefront responsive shell (1440/1024/390) + 404, and contract/DB/build/security boundaries. **7 specs / 17 tests, two runs green (retries 0).**

## H. Design baseline (frozen)

- Admin: `FIG-APPROVAL-APP1-D01-ADMIN-001` — 13 Admin rows `APPROVED_FOR_IMPLEMENTATION`, unchanged.
- Storefront: `FIG-APPROVAL-APP1-D02-STOREFRONT-001` — 7 Storefront rows `APPROVED_FOR_IMPLEMENTATION`.
- Homepage shell-reference rows remain `SUPERSEDED`; `FIG-STOREFRONT-NOTFOUND` is `APPROVED_FOR_IMPLEMENTATION` (not MISSING); no duplicate IDs; deep links consistent.
- `pnpm check:figma-design-index` **PASS** (**39 registry IDs**, 39 node rows, 6 registry tables; 27 `APPROVED_FOR_IMPLEMENTATION`, 6 `SUPERSEDED`); `node --test tools/check-figma-design-index.test.mjs` PASS. No Figma mutation in this closure.

## I. Contract / API-client baseline (frozen)

- OpenAPI SHA-256 **unchanged** `ae015dd65dc2f64c902145f19d5fa5fae6cd6423a54934c1126cd289e3d30946` (`check:openapi` PASS).
- Generated API-client tree SHA-256 **unchanged** `89c1aace328eef1ee05a74950faa48bf907babece025a6abb9ca1baa1574502f` (`check:api-client` PASS).
- Public staff operations present: `staffSessionCreate`, `staffSessionDelete`, `staffSelfGet`. No generated file edited.

## J. Database baseline (frozen)

`NO_APP1_SCHEMA_OR_MIGRATION_CHANGE`. **31 migrations, 78 tables, 833 physical columns**, canonical fingerprint `4ca56a5967730d257edb34e72d6c40373156704cab7c87e3a684803c8321672f` — `pnpm db:check:manifest` all checks passed; the disposable-DB schema-baseline proof passed in every E01 run. Identity tables (`admin_accounts`, `admin_credentials`, `admin_sessions`, `audit_events`) exist since DB7; APP1 added only code-level repository methods.

## K. Test / quality baseline (fresh, this closure)

Package tests (Jest + node --test): API **84 suites / 937**, Admin **23 / 141**, Storefront **11 / 53**, api-client **7 / 38** (+ generated-tree node tests), persistence **6 / 88**, database **5 / 152**, e2e-testing unit **4 / 14**, worker **2 / 6**, test-utils **1 / 5**, contracts **1 / 9**, frontend-testing **4 / 10**; styles foundation validation PASS. APP1 host/Chromium integration: **7 specs / 17 tests**; runs **A 17/17**, **C 17/17**, **D 17/17** (two consecutive clean greens C+D), with **one non-reproducible transient** in run B (the accepted E01 forced-expiry journey's `loginAsAdmin` step timed out waiting for the server-rendered shell under sustained host load — the closure ran many heavy Docker jobs back-to-back). Playwright **retries = 0** within every run; the flake did not reproduce across three subsequent runs and is routed (APP1-FU03, §M). General/APP0 3-engine container smoke: **15 passed**. Compose bootstrap smoke: **8/8**. `pnpm quality` **exit 0**; `pnpm quality:e2e` **exit 0** (first attempt; the WebKit 504 flake of FU02 did **not** reproduce).

## L. Security / cleanup

`APP1_SECRET_SCAN = PASS` — no password, raw cookie value, session token/hash, credential hash/salt, credentialed database URL, real personal email, user-facing stack trace, or temporary secret env in source, reports, E2E fixtures, or build output; fixtures are `*.example.test`. Post-validation: **0 residual APP1 test containers / networks / volumes**; the normal `embroidery-dev` project (6 containers) is unchanged. Temporary screenshots, env files, Playwright output, test-results, traces/videos, and isolated Compose artifacts removed. `git diff --check` clean.

## M. Deviations / follow-up routing

`APP1_BLOCKING_FOLLOW_UP_COUNT = 0`. All items have a concrete owner; none `TBD`/`future`/ownerless.

| ID | Origin | Description | Class | Owner / target | Disposition |
|---|---|---|---|---|---|
| APP1-FU01 | E01-C1 | Admin initial dependency-error UX — safe framework 5xx renders (not `/login`, no modal, no raw detail); custom `(protected)/error.tsx` copy does not surface because the guard throws in the layout above its own boundary | cosmetic, nonblocking | APP2 Admin UX hardening checkpoint | ROUTED_NONBLOCKING |
| APP1-FU02 | E01-C1 | Transient WebKit 504 gateway flake in `quality:e2e` (once); did **not** reproduce at closure (first attempt PASS) | infra reliability, nonblocking | APP0/infra E2E reliability | ROUTED_NONBLOCKING |
| APP1-FU03 | X01 | Non-reproducible `e2e:app1` transient: the accepted E01 forced-expiry `loginAsAdmin` step timed out waiting for the server-rendered shell under sustained host load (run B); passed on runs A/C/D, retries 0. A more load-tolerant login-wait in the E01 helper would harden it | E2E reliability, nonblocking | APP0/infra E2E reliability | ROUTED_NONBLOCKING |
| FU-A03 | APP0 | Login/session security primitives | — | APP1-B01 | CLOSED |
| FU-A08 | APP0 | Auth/audit verification | — | APP1-B01/B02 | CLOSED |
| FU-A14 | APP0 | Interactive-screen accessibility scan (login) | — | APP1-A01 (scan done); full-phase a11y → APP12 | CLOSED (broad a11y ACCEPTED_BASELINE → APP12) |
| FU-A15 | APP1-A01 | DS token gaps `$color-text-inverse`, `$color-action-disabled` | design-system | APP2 (design-system supplement) | ROUTED_NONBLOCKING |
| FU-A16 | APP1-A01/S01A | Shared breakpoint scale (local breakpoint used) | styles | APP2 (`@embroidery/styles`) | ROUTED_NONBLOCKING |
| FU-A17 | APP1-A01-C1 | Repo-wide `/api` base-path reconciliation (admin fixed locally) | config | APP2 | ROUTED_NONBLOCKING |
| FU-A19 | APP0 | Admin design package delivery | — | APP1-D01 | CLOSED |
| FU-A20 | APP0 | Stylelint hook | tooling | APP2 (`@embroidery/styles`/tooling) | ROUTED_NONBLOCKING |
| GAP-D01 / FIG-DS-INPUT | APP1-D01 | No DS Input component (login inputs composed from primitives) | design-system | APP2 (design-system supplement) | ROUTED_NONBLOCKING |
| GAP-D02 / FIG-DS-SCRIM-TOKEN | APP1-D01 | No scrim token (overlay uses `ink/900 @45%`) | design-system | APP2 (design-system supplement) | ROUTED_NONBLOCKING |
| Storefront footer/contact/policy/social content | APP1-S01A | Footer shows no fabricated content; real content deferred | content | APP11 (content/SEO) | ROUTED_NONBLOCKING |
| Storefront favicon | APP1-S01A/S01B | Placeholder favicon; branded asset deferred | asset | APP2 (Storefront capability) | ROUTED_NONBLOCKING |
| FU-A01/A02/A05/A12 | APP0 | Package-boundary items gated on a package becoming runtime-loadable | boundary | owners unchanged (APP0 register); not triggered by APP1 | SUPERSEDED (deferred, owned) |

## N. Acceptance matrix

All 39 §25 criteria satisfied: complete chain verified; every impl/decision commit has evidence; A01/A02/D02/S01 PO acceptances recorded; E01/E01-C1 review-accepted; capability scope + exclusions frozen; design approvals verified; Figma checks pass; OpenAPI + API-client hashes exact; staff operations present; DB 31 migrations / 78 tables / 833 columns / fingerprint exact; no schema drift; fresh test totals recorded; `quality` PASS; `quality:e2e` PASS (first attempt); `e2e:app1` PASS twice; retries 0; bootstrap 8/8; boundaries pass; secret scan PASS; zero isolated residue; dev stack untouched; every deviation reconciled; blocking count 0; every nonblocking follow-up owned; FU01/FU02 routed; APP2 handoff precise; APP2 not started; Commit A docs-only; Commit B evidence-only; evidence cites exact Commit A; main report ≤360 lines; exactly two closure commits; tree clean; not pushed.

## O. APP2 handoff

APP2 renders inside the accepted Admin and Storefront shells and reaches protected APIs through the authenticated-admin guard **without changing the auth foundation**. Baseline invariants APP2 must preserve: scrypt + revocable opaque sessions; host-only `Strict` HttpOnly cookie; bidirectional route protection (cookie-presence proxy + authoritative `staffSelfGet`); one server-hydrated current-staff resolution per navigation; not-found HTTP 404 inside the shared shell; OpenAPI `ae015dd6…`; API-client `89c1aace…`; DB fingerprint `4ca56a59…` (78 tables / 31 migrations); approved design state (D01 13 rows, D02 7 rows). APP2 owns IMP-O003 (queue/broker) + FU-A07 when it introduces real asynchronous work, and the design-system/styles follow-ups above. Use the canonical APP2 roadmap only.

## P. Scope confirmation

This closure changed **no** implementation source, test, Figma artifact, schema, migration, generated file, or dependency. It only added the closure completion report and evidence file and reconciled status pointers (roadmap, traceability, phase source map, phase plan, README).

## Q. Closure evidence

Evidence — commands, exact exits, counts, artifact hashes, DB metrics, residue proof — is recorded in the paired evidence file `APP1-CLOSURE-EVIDENCE.md`, which cites this report's Commit A hash. Final status: **`APP1 = COMPLETE — PASS_WITH_FOLLOW_UPS`**, **`APP1-X01 = COMPLETE`**, **`APP2 = NOT_STARTED`**. R0 achieved (APP0 + APP1). Two closure commits only; working tree clean; not pushed.
