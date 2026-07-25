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

Current values are recorded once, in [`10-MASTER-APPLICATION-ROADMAP.md`](./10-MASTER-APPLICATION-ROADMAP.md) §6, and are not duplicated here. As of APP1-B01: **APP0 = `COMPLETE`** (evidence [`reports/APP0-X01-COMPLETION-REPORT.md`](./reports/APP0-X01-COMPLETION-REPORT.md)), **APP1 = `ENGINEERING_IN_PROGRESS`** (`APP1-DEC-AUTH` complete — staff auth IMP-D027; `APP1-D01` `COMPLETE — ADMIN DESIGN APPROVED` (Admin login+shell approved for implementation, `FIG-APPROVAL-APP1-D01-ADMIN-001`, 13 rows promoted) — [`APP1-D01-COMPLETION-REPORT.md`](./reports/APP1-D01-COMPLETION-REPORT.md), registry [`FIGMA_DESIGN_INDEX.md`](../design/FIGMA_DESIGN_INDEX.md); **`APP1-B01` `COMPLETE — CORRECTED`** — staff session authentication, two endpoints, no migration, [`APP1-B01-COMPLETION-REPORT.md`](./reports/APP1-B01-COMPLETION-REPORT.md); validation corrected to the canonical Zod pipeline by `APP1-B01-C1` ([`APP1-B01-C1-CORRECTION-REPORT.md`](./reports/APP1-B01-C1-CORRECTION-REPORT.md)); **`APP1-B02` `COMPLETE — CORRECTED`** — current staff `GET /api/staff/me`, one endpoint, no migration, [`APP1-B02-COMPLETION-REPORT.md`](./reports/APP1-B02-COMPLETION-REPORT.md); success-data requirement corrected by `APP1-B02-C1` ([`APP1-B02-C1-CORRECTION-REPORT.md`](./reports/APP1-B02-C1-CORRECTION-REPORT.md)); **`APP1-A01` `COMPLETE — CORRECTED, DELIVERED_FOR_PRODUCT_OWNER_REVIEW`** — Admin `/login` screen, no migration, [`APP1-A01-COMPLETION-REPORT.md`](./reports/APP1-A01-COMPLETION-REPORT.md); **`APP1-A01-C1` `COMPLETE`** — login readiness correction (toggle hydration via dev gateway, route protection, automatic Compose bootstrap), [`APP1-A01-C1-CORRECTION-REPORT.md`](./reports/APP1-A01-C1-CORRECTION-REPORT.md); **`APP1-A01-C2` `COMPLETE`** — real isolated-Compose bootstrap-policy evidence (dev-fail/create/reuse/prod-skip/unknown-env) + result-line fix, [`APP1-A01-C2-CORRECTION-REPORT.md`](./reports/APP1-A01-C2-CORRECTION-REPORT.md); `APP1-A02` `BLOCKED_BY_PRODUCT_OWNER_A01_REVIEW`, `APP1-S01` `BLOCKED_BY_STOREFRONT_DESIGN_APPROVAL_AND_COVERAGE`, `APP1-E01` `BLOCKED`, `APP1-X01` `NOT_STARTED`), APP2–APP12 = `NOT_STARTED`.

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
