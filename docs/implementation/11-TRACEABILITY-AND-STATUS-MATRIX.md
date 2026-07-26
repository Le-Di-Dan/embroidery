# Traceability and Status Matrix

## 1. Purpose

This matrix provides stage-level traceability. Exact requirement, lifecycle, table, query, design node, endpoint, and test IDs are added during each phase audit.

The canonical backend module/bounded-context ownership map (reconciled at APP0-C01) is owned by [`../architecture/SYSTEM_ARCHITECTURE.md`](../architecture/SYSTEM_ARCHITECTURE.md) §8 (logical ownership + dependency direction) and [`../architecture/REPOSITORY_STRUCTURE.md`](../architecture/REPOSITORY_STRUCTURE.md) §11/§11a (physical placement + packages). This matrix does not duplicate that map.

## 2. Phase matrix

| Phase | Backend modules/capabilities | Admin surface | Storefront/customer surface | Worker/integration | Milestone |
|---|---|---|---|---|---|
| APP0 | Cross-cutting application foundation | Shell foundation only | Shell foundation only | Harness/observability/spikes | R0 |
| APP1 | Staff identity, sessions, roles, permissions, audit actor | Login, shell, navigation, forbidden/session states | Public shell | Session/security support | R0 |
| APP2 | Asset, catalog, publication | Asset library, product list/form/detail/publication | Product list/detail | Asset inspection/derivatives | R1 |
| APP3 | Template, design session/version/document | Template list/editor/publication | 2D Design Studio | Autosave/processing as required | R2 |
| APP4 | Customer, contact verification, secure grant, notification core | Customer/contact/secure-link operational views | Verification/secure entry | Notification intent/attempt delivery | R3 prerequisite (contributes to R3; R3 closes at APP6) |
| APP5 | Customer-owned product, request, request asset, moderation/transition | Request queue/detail/moderation | Request creation/status | Asset consequences/notifications | R3 |
| APP6 | Design case/version/review/approval, quotation | Review workbench, quote editor/history | Secure review, approval, quote response | Notification delivery | R3 |
| APP7 | Payment obligation/attempt/callback, order conversion | Payment/reconciliation/order view | Deposit checkout/status | Provider webhook/reconciliation/outbox | R4 |
| APP8 | Inventory hold/reservation, production job/attempt | Inventory and production board | Bounded order status | Worker claims/retries | R4 |
| APP9 | Remaining payment, fulfillment/shipping freeze, completion | Fulfillment/payment/completion operations | Remaining payment/order completion status | Provider/notification consequences | R4 |
| APP10 | Profile, merge, notification operations, agreements | Customer ops, merge, delivery attempts | Profile/contact preferences where in scope | Zalo/Messenger simple handoff | R5 |
| APP11 | Gallery, content, SEO metadata | Content/gallery management | Homepage/discovery/gallery/content | Asset derivatives/revalidation | R5 |
| APP12 | Cross-cutting hardening | UAT and operational tooling | UAT/accessibility/performance | Monitoring, backup/restore/deployment | R6 |

## 3. Status values

Use:

- `NOT_STARTED`
- `DESIGN_AUDIT`
- `DESIGN_IN_PROGRESS`
- `READY_FOR_ENGINEERING`
- `ENGINEERING_IN_PROGRESS`
- `REVIEW_REQUIRED`
- `BLOCKED`
- `COMPLETE`

Do not mark a phase `COMPLETE` based only on design, backend, or frontend completion.

Current values are recorded once, in [`10-MASTER-APPLICATION-ROADMAP.md`](./10-MASTER-APPLICATION-ROADMAP.md) §6, and are not duplicated here. As of APP1-X01: **APP0 = `COMPLETE`** (evidence [`reports/APP0-X01-COMPLETION-REPORT.md`](./reports/APP0-X01-COMPLETION-REPORT.md)), **APP1 = `COMPLETE — PASS_WITH_FOLLOW_UPS`** (closed at `APP1-X01`, zero blocking follow-ups — [`reports/APP1-COMPLETION-REPORT.md`](./reports/APP1-COMPLETION-REPORT.md), evidence [`reports/APP1-CLOSURE-EVIDENCE.md`](./reports/APP1-CLOSURE-EVIDENCE.md); milestone **R0 achieved**) (`APP1-DEC-AUTH` complete — staff auth IMP-D027; `APP1-D01` `COMPLETE — ADMIN DESIGN APPROVED` (Admin login+shell approved for implementation, `FIG-APPROVAL-APP1-D01-ADMIN-001`, 13 rows promoted) — [`APP1-D01-COMPLETION-REPORT.md`](./reports/APP1-D01-COMPLETION-REPORT.md), registry [`FIGMA_DESIGN_INDEX.md`](../design/FIGMA_DESIGN_INDEX.md); **`APP1-B01` `COMPLETE — CORRECTED`** — staff session authentication, two endpoints, no migration, [`APP1-B01-COMPLETION-REPORT.md`](./reports/APP1-B01-COMPLETION-REPORT.md); validation corrected to the canonical Zod pipeline by `APP1-B01-C1` ([`APP1-B01-C1-CORRECTION-REPORT.md`](./reports/APP1-B01-C1-CORRECTION-REPORT.md)); **`APP1-B02` `COMPLETE — CORRECTED`** — current staff `GET /api/staff/me`, one endpoint, no migration, [`APP1-B02-COMPLETION-REPORT.md`](./reports/APP1-B02-COMPLETION-REPORT.md); success-data requirement corrected by `APP1-B02-C1` ([`APP1-B02-C1-CORRECTION-REPORT.md`](./reports/APP1-B02-C1-CORRECTION-REPORT.md)); **`APP1-A01` `COMPLETE — CORRECTED, DELIVERED_FOR_PRODUCT_OWNER_REVIEW`** — Admin `/login` screen, no migration, [`APP1-A01-COMPLETION-REPORT.md`](./reports/APP1-A01-COMPLETION-REPORT.md); **`APP1-A01-C1` `COMPLETE`** — login readiness correction (toggle hydration via dev gateway, route protection, automatic Compose bootstrap), [`APP1-A01-C1-CORRECTION-REPORT.md`](./reports/APP1-A01-C1-CORRECTION-REPORT.md); **`APP1-A01-C2` `COMPLETE`** — real isolated-Compose bootstrap-policy evidence (dev-fail/create/reuse/prod-skip/unknown-env) + result-line fix, [`APP1-A01-C2-CORRECTION-REPORT.md`](./reports/APP1-A01-C2-CORRECTION-REPORT.md); Product Owner completed the A01 live test → **`APP1-A01` `COMPLETE — CORRECTED — PRODUCT_OWNER_ACCEPTED`**; Product Owner live-tested and accepted A02 → **`APP1-A02` `COMPLETE — PRODUCT_OWNER_ACCEPTED`** — authenticated Admin shell (protected-layout shell, one server-hydrated current-staff query, logout, client session-expiry modal, mobile drawer; no migration; `staffSelfGet`/`staffSessionDelete` — [`APP1-A02-COMPLETION-REPORT.md`](./reports/APP1-A02-COMPLETION-REPORT.md)); Product Owner reviewed and PASSED the D02 package → **`APP1-D02` `COMPLETE — PRODUCT_OWNER_ACCEPTED`** — Storefront shell & not-found design SUPPLEMENT (seven §4.2 rows `APPROVED_FOR_IMPLEMENTATION`, `FIG-APPROVAL-APP1-D02-STOREFRONT-001` — [`APP1-D02-COMPLETION-REPORT.md`](./reports/APP1-D02-COMPLETION-REPORT.md)); the Product Owner live-tested and accepted S01A → **`APP1-S01A` `COMPLETE — PRODUCT_OWNER_ACCEPTED`** (shared shell + responsive navigation, focus-trapped mobile drawer, honest non-interactive nav/search, SCSS-only — [`APP1-S01A-COMPLETION-REPORT.md`](./reports/APP1-S01A-COMPLETION-REPORT.md)); the Product Owner live-tested and accepted S01B → **`APP1-S01B` `COMPLETE — PRODUCT_OWNER_ACCEPTED`** (Storefront not-found boundary — canonical `app/not-found.tsx` inside the accepted shell, HTTP 404, safe Vietnamese copy, `/` primary recovery + honestly-unavailable secondary, SCSS-only, no API/schema change — [`APP1-S01B-COMPLETION-REPORT.md`](./reports/APP1-S01B-COMPLETION-REPORT.md)), so the parent **`APP1-S01` `COMPLETE — PRODUCT_OWNER_ACCEPTED`**; **`APP1-E01` `COMPLETE — CORRECTED — REVIEW_ACCEPTED`** (staff access & shared-shell cross-layer acceptance; 17 tests; corrected by **`APP1-E01-C1` `COMPLETE`** — invalid/stale-cookie route matrix and initial protected-page API-unavailability journeys, test/harness only — [`APP1-E01-C1-CORRECTION-REPORT.md`](./reports/APP1-E01-C1-CORRECTION-REPORT.md)), **`APP1-X01` `COMPLETE`** (phase closure `PASS_WITH_FOLLOW_UPS`)), APP2–APP12 = `NOT_STARTED` (**APP2 `APP2-PRE-AUDIT` complete** — `AUDITED — PASS_WITH_REQUIRED_DECISIONS`, `NO_APP2_MIGRATION`; [`audits/APP2_PRE_IMPLEMENTATION_AUDIT.md`](./audits/APP2_PRE_IMPLEMENTATION_AUDIT.md); **`APP2-DEC-STORAGE` `COMPLETE — CORRECTED, DELIVERED_FOR_REVIEW`** — object-storage/asset-intake locked by IMP-D028 / `ADR-APP2-001` (`PASS_WITH_PRODUCT_PARAMETERS`, `NO_APP2_MIGRATION`, adds `APP2-I01` foundation → 18 checkpoints), **corrected by `APP2-DEC-STORAGE-C1`** (post-object `UPLOADED` insert / storage-first two-transaction lifecycle; T1 `busboy`+`lib-storage` streaming multipart; route-scoped nginx `proxy_request_buffering off`; server-only SHA-256; `OBJECT_STORAGE_PUBLIC_BASE_URL` removed — [`reports/APP2-DEC-STORAGE-C1-CORRECTION-REPORT.md`](./reports/APP2-DEC-STORAGE-C1-CORRECTION-REPORT.md)) **and `APP2-DEC-STORAGE-C2`** (upload idempotency model I1 pre-stream durable allocation + pre-stream fingerprint / CW-01…CW-07; presigner removed from the APP2 set; `lib-storage` memory bounds + C1 heap-claim corrected; repository implementation gap not schema gap — [`reports/APP2-DEC-STORAGE-C2-CORRECTION-REPORT.md`](./reports/APP2-DEC-STORAGE-C2-CORRECTION-REPORT.md)); **`APP2-DEC-STORAGE` accepted** as `ACCEPTED_WITH_BLOCKED_IMPLEMENTATION_GAPS` (no C3; `STORAGE-BLK-01..03` routed to the `APP2-B01` entry gate); **`APP2-DEC-JOBS` `COMPLETE — CORRECTED, DELIVERED_FOR_REVIEW`** — asynchronous job runtime locked by IMP-D029 / `ADR-APP2-002` (PostgreSQL-backed claim queue on the existing persistence — `outbox_events` + `background_job_attempts` + `FOR UPDATE SKIP LOCKED` + visibility-timeout lease on `next_attempt_at`; Redis/BullMQ and RabbitMQ rejected; `NO_APP2_MIGRATION`, no new dependency; `PASS_WITH_CONFIG_PARAMETERS`; adds narrow `APP2-I02` worker-runtime foundation owning `FU-A07` → map 19 checkpoints — [`reports/APP2-DEC-JOBS-COMPLETION-REPORT.md`](./reports/APP2-DEC-JOBS-COMPLETION-REPORT.md)); **corrected by `APP2-DEC-JOBS-C1`** (`PENDING` is the only automatic claim/retry state matching partial index IDX-088; retryable failure returns to `PENDING`+backoff, `FAILED` reserved/never emitted; ownership-guarded atomic completion transactions; expired-lease evidence; no-heartbeat invariant; spikes 23/23 + 25/25 — [`reports/APP2-DEC-JOBS-C1-CORRECTION-REPORT.md`](./reports/APP2-DEC-JOBS-C1-CORRECTION-REPORT.md)); `APP2-DEC-JOBS` review accepted, unblocking `APP2-D01`/`APP2-I02`; **`APP2-D01` `DELIVERED_FOR_PRODUCT_OWNER_REVIEW`** — Assets & Catalog Publication design package on Figma page **APP_02** (`419:3`) section `423:3`, 27 screen/state frames + 2 annotations + 1 DS supplement (`FIG-DS-INPUT-APP2`); Admin `NEW` + Storefront list/detail `SUPPLEMENT` cloned from the approved APP1-D02 shells with **no APP1 row superseded**; 30 new `REVIEW_REQUIRED` rows → registry **69 IDs**; handoff §6.2 of the phase plan — [`reports/APP2-D01-COMPLETION-REPORT.md`](./reports/APP2-D01-COMPLETION-REPORT.md); `APP2-A01..A04`/`APP2-S01`/`APP2-S02` `BLOCKED_BY_D01_APPROVAL_AND_BACKEND`, `APP2-I01`/`APP2-I02` ready, `APP2-B01` blocked by `STORAGE-BLK-01..03`; a checkpoint may receive at most one correction — this is it).

## 4. Required phase traceability additions

Each phase completion report must map:

- Product requirement IDs.
- Business rule IDs.
- Lifecycle/transition IDs.
- Database tables/guards/queries used.
- Figma sections/nodes used.
- OpenAPI operation IDs.
- Frontend routes/screens.
- Worker job names.
- Test suites/E2E journeys.
- Commit hashes.
- Deferred work and owning phase.
