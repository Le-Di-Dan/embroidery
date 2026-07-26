# Master Application Roadmap

## 1. Strategy

The implementation stage is ordered by dependency and business value. Admin authoring/operations lead the Storefront by one capability; both are completed inside the same business phase. Design is audited per phase and produced as a whole package only when needed.

## 2. Ordered phases

| Phase | Name | Primary outcome | Design expectation |
|---|---|---|---|
| APP0 | Application Delivery Foundation | Reviewable delivery system, Swagger/OpenAPI, generated client, SCSS foundation, testing and technical spikes. | `NONE` except technical UI/style verification. |
| APP1 | Staff Access and Application Shells | Secure Admin login, permission-aware shell, Storefront shell. | Audit; likely `SUPPLEMENT` for Admin shell. |
| APP2 | Assets and Catalog Publication | Admin publishes products/assets; Storefront lists and displays published products. | Audit existing public UI; Admin likely `NEW/SUPPLEMENT`. |
| APP3 | Design Templates and 2D Design Studio | Admin publishes compatible templates; customer creates watermark-protected 2D customization. | Audit existing studio design; package gaps as one phase. |
| APP4 | Customer Identity, Verification, Secure Access and Notification Core | Customer/contact foundation and secure links support later review/payment journeys. | Limited customer-facing package if missing; Admin operations may need design. |
| APP5 | Custom Requests and Customer-Owned Products | Customer submits embroidery request; Admin triages and manages it. | Whole request journey package when gaps exist. |
| APP6 | Design Review, Approval and Quotation | Versioned design review, secure approval and immutable quotation workflow. | Whole Admin/customer review and quotation package. |
| APP7 | Deposit Payment and Order Creation | Verified deposit converts approved quote into an order safely. | Payment/status package only after provider UX is known. |
| APP8 | Inventory Reservation and Production Operations | Order reserves inventory and moves through production with concurrency safety. | Mostly Admin; design package if production board absent. |
| APP9 | Remaining Payment, Fulfillment and Completion | Remaining obligation, fulfillment freeze, completion/cancellation/refund according to locked policy. | Customer order/payment and Admin fulfillment package. |
| APP10 | Customer Operations and Communication | Profiles, merge, notification operations, simple Zalo/Messenger handoff. | Admin/customer operations package as needed. |
| APP11 | Gallery, Content, SEO and Store Presentation | Public content/discovery and operational content management. | Reuse existing public designs; supplement CMS/Admin gaps. |
| APP12 | Hardening, UAT and Production Readiness | Security, resilience, performance, observability, runbooks and go-live evidence. | No broad redesign; only defect corrections. |

## 3. Dependency chain

```text
APP0
→ APP1
→ APP2
→ APP3
→ APP4
→ APP5
→ APP6
→ APP7
→ APP8
→ APP9
→ APP10
→ APP11
→ APP12
```

Some discovery/design work for the next phase may run while engineering implements the current phase, but implementation dependencies remain ordered unless an explicit re-plan proves independence.

## 4. First implementation target

After APP0 and APP1 foundations, the first full business vertical slice is:

```text
Admin login
→ upload/process asset
→ create product draft
→ publish product
→ Storefront server-renders product list/detail
→ unpublish removes public visibility
```

This slice proves authentication, authorization, application services, persistence, object storage, worker processing, Swagger/client, Admin, Storefront, SSR/SEO, SCSS, gateway, logging and E2E integration.

## 5. Phase planning depth

Detailed candidate checkpoints are in `phases/APP*.md`. They are a roadmap, not authorization to execute more than one checkpoint at a time.

Exact endpoints may be corrected during the phase contract audit when repository truth requires it, but corrections must preserve:

- Phase outcome.
- Five-endpoint maximum.
- Human review boundaries.
- Existing lifecycle/database semantics.
- Vertical delivery order.

## 6. Current phase status

This section is the canonical phase-status record for the application stage. Status values come from `11-TRACEABILITY-AND-STATUS-MATRIX.md` §3.

| Phase | Status | Evidence |
|---|---|---|
| APP0 | `COMPLETE` | Closed at `APP0-X01`; all 18 preceding checkpoints complete. Report: [`reports/APP0-X01-COMPLETION-REPORT.md`](./reports/APP0-X01-COMPLETION-REPORT.md); plan: [`phases/APP0-APPLICATION-DELIVERY-FOUNDATION.md`](./phases/APP0-APPLICATION-DELIVERY-FOUNDATION.md). |
| APP1 | `COMPLETE — PASS_WITH_FOLLOW_UPS` | **Closed at `APP1-X01`** (verdict `PASS_WITH_FOLLOW_UPS`; zero blocking follow-ups): report [`APP1-COMPLETION-REPORT.md`](./reports/APP1-COMPLETION-REPORT.md), evidence [`APP1-CLOSURE-EVIDENCE.md`](./reports/APP1-CLOSURE-EVIDENCE.md). Baselines frozen: OpenAPI `ae015dd6…`, API-client `89c1aace…`, DB 78 tables / 31 migrations / `4ca56a59…` (`NO_APP1_SCHEMA_OR_MIGRATION_CHANGE`); Figma D01 (13 rows) + D02 (7 rows) `APPROVED_FOR_IMPLEMENTATION`. Milestone **R0 achieved** (APP0 + APP1). Pre-implementation audit and `APP1-DEC-AUTH` decision complete. Plan: [`phases/APP1-STAFF-ACCESS-AND-SHELLS.md`](./phases/APP1-STAFF-ACCESS-AND-SHELLS.md); audit: [`audits/APP1_PRE_IMPLEMENTATION_AUDIT.md`](./audits/APP1_PRE_IMPLEMENTATION_AUDIT.md); reports: [`APP1-PRE-IMPLEMENTATION-AUDIT-COMPLETION-REPORT.md`](./reports/APP1-PRE-IMPLEMENTATION-AUDIT-COMPLETION-REPORT.md), [`APP1-DEC-AUTH-COMPLETION-REPORT.md`](./reports/APP1-DEC-AUTH-COMPLETION-REPORT.md). Staff auth locked by IMP-D027 / [`ADR-APP1-001`](../adr/backend/ADR-APP1-001-STAFF-AUTHENTICATION-AND-SESSIONS.md) (no migration). **`APP1-D01` = `COMPLETE — ADMIN DESIGN APPROVED`** (Product Owner approved the Admin login + shell designs; recorded at `APP1-A01` as `FIG-APPROVAL-APP1-D01-ADMIN-001`, 13 Admin registry rows promoted to `APPROVED_FOR_IMPLEMENTATION`; [`APP1-D01-COMPLETION-REPORT.md`](./reports/APP1-D01-COMPLETION-REPORT.md); registry [`FIGMA_DESIGN_INDEX.md`](../design/FIGMA_DESIGN_INDEX.md)). **`APP1-B01` = `COMPLETE — CORRECTED`** (staff session auth; two endpoints; `NO_MIGRATION_REQUIRED` — [`APP1-B01-COMPLETION-REPORT.md`](./reports/APP1-B01-COMPLETION-REPORT.md); validation corrected to the canonical Zod pipeline by `APP1-B01-C1` — [`APP1-B01-C1-CORRECTION-REPORT.md`](./reports/APP1-B01-C1-CORRECTION-REPORT.md)). **`APP1-B02` = `COMPLETE — CORRECTED`** (current staff `GET /api/staff/me`; one endpoint; `NO_MIGRATION_REQUIRED` — [`APP1-B02-COMPLETION-REPORT.md`](./reports/APP1-B02-COMPLETION-REPORT.md); success-data requirement corrected by `APP1-B02-C1` — [`APP1-B02-C1-CORRECTION-REPORT.md`](./reports/APP1-B02-C1-CORRECTION-REPORT.md)). **`APP1-A01` = `COMPLETE — CORRECTED, DELIVERED_FOR_PRODUCT_OWNER_REVIEW`** (Admin `/login` screen; approval recorded + 13 rows promoted; `staffSessionCreate`; no schema change — [`APP1-A01-COMPLETION-REPORT.md`](./reports/APP1-A01-COMPLETION-REPORT.md)). **`APP1-A01-C1` = `COMPLETE`** (login readiness correction — password-toggle hydration via the dev gateway, bidirectional route protection, automatic Compose admin bootstrap; no migration; live-tested through `admin.embroidery.local` — [`APP1-A01-C1-CORRECTION-REPORT.md`](./reports/APP1-A01-C1-CORRECTION-REPORT.md)). **`APP1-A01-C2` = `COMPLETE`** (real isolated-Compose evidence for the bootstrap environment policy — dev-fail readiness-block, create/reuse, prod-skip, unknown-env fail-closed, zero residue; a genuine result-line observability defect found and fixed — [`APP1-A01-C2-CORRECTION-REPORT.md`](./reports/APP1-A01-C2-CORRECTION-REPORT.md)). The Product Owner completed the A01 live test and accepted it, so **`APP1-A01` = `COMPLETE — CORRECTED — PRODUCT_OWNER_ACCEPTED`**. The Product Owner live-tested and accepted A02, so **`APP1-A02` = `COMPLETE — PRODUCT_OWNER_ACCEPTED`** (authenticated Admin shell — protected-layout shell, single server-hydrated current-staff query, logout, client session-expiry modal, mobile drawer; no migration — [`APP1-A02-COMPLETION-REPORT.md`](./reports/APP1-A02-COMPLETION-REPORT.md)). The Product Owner reviewed and PASSED the Storefront shell & not-found design SUPPLEMENT, so **`APP1-D02` = `COMPLETE — PRODUCT_OWNER_ACCEPTED`** (seven §4.2 rows `APPROVED_FOR_IMPLEMENTATION` under `FIG-APPROVAL-APP1-D02-STOREFRONT-001` — [`APP1-D02-COMPLETION-REPORT.md`](./reports/APP1-D02-COMPLETION-REPORT.md)). The Product Owner live-tested and accepted S01A, so **`APP1-S01A` = `COMPLETE — PRODUCT_OWNER_ACCEPTED`** (shared Storefront shell + responsive navigation; server-first layout, responsive Full/Compact header, focus-trapped mobile drawer, non-interactive nav + honest search, `<main>` slot; SCSS-only — [`APP1-S01A-COMPLETION-REPORT.md`](./reports/APP1-S01A-COMPLETION-REPORT.md)). The Product Owner live-tested and accepted S01B, so **`APP1-S01B` = `COMPLETE — PRODUCT_OWNER_ACCEPTED`** (Storefront not-found boundary — canonical `app/not-found.tsx` inside the accepted shell, unmatched URL → HTTP 404, safe Vietnamese copy with no path echo, `/` primary recovery, honestly-unavailable secondary; Server Component; SCSS-only; no API/schema change — [`APP1-S01B-COMPLETION-REPORT.md`](./reports/APP1-S01B-COMPLETION-REPORT.md)); with S01A accepted, the parent **`APP1-S01` = `COMPLETE — PRODUCT_OWNER_ACCEPTED`**. **`APP1-E01` = `COMPLETE — CORRECTED — REVIEW_ACCEPTED`** (staff access and shared-shell cross-layer acceptance; 17 tests; corrected by `APP1-E01-C1` — [`APP1-E01-COMPLETION-REPORT.md`](./reports/APP1-E01-COMPLETION-REPORT.md)). **`APP1-E01-C1` = `COMPLETE`** (the two missing cross-layer failure journeys — invalid/stale-cookie route matrix reaching authoritative 401, and initial protected-page API unavailability surfacing the safe framework 5xx boundary; test/harness only — [`APP1-E01-C1-CORRECTION-REPORT.md`](./reports/APP1-E01-C1-CORRECTION-REPORT.md)). **`APP1-X01` = `COMPLETE`** — phase closure, R0 evaluation, APP2 handoff. |
| APP2 | `NOT_STARTED` (engineering) — `AUDITED — PASS_WITH_REQUIRED_DECISIONS` | Pre-implementation audit complete (`APP2-PRE-AUDIT`): audit [`audits/APP2_PRE_IMPLEMENTATION_AUDIT.md`](./audits/APP2_PRE_IMPLEMENTATION_AUDIT.md), report [`reports/APP2-PRE-IMPLEMENTATION-AUDIT-COMPLETION-REPORT.md`](./reports/APP2-PRE-IMPLEMENTATION-AUDIT-COMPLETION-REPORT.md). Verdict `NO_APP2_MIGRATION`; asset/catalog modules are persistence `SCAFFOLD` only. Two required decisions before code — `IMP-O002` object storage (`ADR_REQUIRED` → `APP2-DEC-STORAGE`) and `IMP-O003` job runtime (`ADR_REQUIRED`, DB claim path pre-designed by `ADR-DB5-003` → `APP2-DEC-JOBS`) — plus one design package (`APP2-D01`, Admin `NEW` + Storefront list/detail `SUPPLEMENT`). Corrected checkpoint map in [`phases/APP2-ASSETS-AND-CATALOG-PUBLICATION.md`](./phases/APP2-ASSETS-AND-CATALOG-PUBLICATION.md) §6.1. **`APP2-DEC-STORAGE` = `COMPLETE — CORRECTED, DELIVERED_FOR_REVIEW`** — object-storage/asset-intake architecture locked by IMP-D028 / [`ADR-APP2-001`](../adr/backend/ADR-APP2-001-OBJECT-STORAGE-AND-ASSET-INTAKE.md) (S3-compatible/MinIO dev, AWS SDK v3, API-proxied streaming upload, two private buckets, server SHA-256, SVG rejected, proxied publication-gated delivery, `NO_APP2_MIGRATION`), verdict `PASS_WITH_PRODUCT_PARAMETERS`; adds a narrow `APP2-I01` object-storage foundation checkpoint before `APP2-B01` (map now **18 checkpoints**). Report: [`reports/APP2-DEC-STORAGE-COMPLETION-REPORT.md`](./reports/APP2-DEC-STORAGE-COMPLETION-REPORT.md). **Corrected by `APP2-DEC-STORAGE-C1`** (post-object `UPLOADED` insert / storage-first two-transaction lifecycle; T1 `busboy`+`lib-storage` streaming multipart transport; route-scoped nginx `proxy_request_buffering off`; server-only SHA-256; `OBJECT_STORAGE_PUBLIC_BASE_URL` removed) — [`reports/APP2-DEC-STORAGE-C1-CORRECTION-REPORT.md`](./reports/APP2-DEC-STORAGE-C1-CORRECTION-REPORT.md). **Corrected by `APP2-DEC-STORAGE-C2`** (upload idempotency model I1 pre-stream durable allocation + pre-stream fingerprint, CW-01…CW-07; `@aws-sdk/s3-request-presigner` removed from the APP2 set; `lib-storage` memory-bound policy + C1 heap-claim corrected; repository implementation gap not schema gap, `NO_APP2_MIGRATION` re-confirmed) — [`reports/APP2-DEC-STORAGE-C2-CORRECTION-REPORT.md`](./reports/APP2-DEC-STORAGE-C2-CORRECTION-REPORT.md). `APP2-DEC-JOBS` = `BLOCKED_BY_APP2_DEC_STORAGE_REVIEW`; `APP2-D01` blocked pending required-decision review. Product engineering not started. |
| APP3–APP12 | `NOT_STARTED` | Dependency-ordered per §3. |

APP0 closure is a **foundation** milestone, not a release: R0 closes at APP1 (`09-RELEASE-AND-MILESTONE-POLICY.md` §2) and production readiness remains APP12's (IMP-D015).
