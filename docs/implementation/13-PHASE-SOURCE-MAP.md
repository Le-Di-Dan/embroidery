# Phase Source Map

## 1. Purpose

This map identifies the minimum authoritative document families that each application phase must audit. Exact database filenames and completion commits must be resolved from repository truth at phase start.

Every phase also reads:

- `CLAUDE.md`.
- Root `README.md`.
- `docs/implementation/README.md`.
- `docs/implementation/10-MASTER-APPLICATION-ROADMAP.md`.
- Its detailed phase file in `docs/implementation/phases/`.
- `docs/design/FIGMA_DESIGN_INDEX.md` — the canonical Figma registry (query it before classifying design work; see §4).
- Relevant ADRs.
- Current completion reports/handoffs from prerequisite phases.
- `docs/database/DB_ROADMAP.md` only when confirming the database baseline or when the phase has a persistence dependency; do not require every checkpoint to read the full database corpus.

There is no root `ROADMAP.md`; the canonical roadmaps are `docs/database/DB_ROADMAP.md` and `docs/implementation/10-MASTER-APPLICATION-ROADMAP.md`.

## 2. Minimum sources by phase

| Phase | Product/business sources | Architecture/development sources | Database/design sources |
|---|---|---|---|
| APP0 | Project charter, scope, NFR, acceptance principles | System architecture, repository structure, backend/frontend/local-development conventions | Final DB application handoff; design vision/system/Figma architecture for tokens and editor spike |
| APP1 | Admin operations, security, NFR | System architecture, backend/frontend conventions | Identity/staff/role/permission/audit repository contracts; APP1 design audit |
| APP2 | Product requirements, user journeys, Admin operations, SEO/content, security | Backend/frontend conventions | Asset/catalog/publication tables, guards and query catalogs; public/Admin Figma audit |
| APP3 | Design Studio spec, product requirements, lifecycle, security/abuse prevention | System architecture, frontend/backend conventions | Template/design-session/version/document guards and queries; **the APP2-owned Figma closure baseline (`reports/APP2-CLOSURE-FIGMA-BASELINE.json`) — later phases append to the shared registry, never mutate an owned record**; **catalog product-side and embroidery-area placement geometry (`px_per_mm`, bounds, physical maxima) and the side-background asset relation**; **`product_media.role`, `asset_derivatives.kind` and `secure_access_grants.scope_kind` closed sets, which bound what `APP3-G01`/`G02`/`G04` may rule without a migration**; Design System and Studio Figma artifacts |
| APP4 | Business rules, security, Admin operations, user journeys | Backend conventions, NFR | Customer/contact/verification/secure-grant/notification contracts and guards; customer secure-flow design audit |
| APP5 | User journeys, business rules, order/design lifecycle, Admin operations | Backend/frontend conventions | Customer-owned-product/request/asset/moderation/transition ownership and guards; request-flow Figma audit |
| APP6 | Business rules, order/design lifecycle, security | Backend/frontend conventions | Design version/current pointer/approval/quotation/money contracts and immutability guards; review/quotation Figma audit |
| APP7 | Payment business rules, lifecycle, security, NFR | Backend conventions, provider ADR | Payment obligation/attempt/idempotency/order conversion guards, race tests and query paths; payment UX package |
| APP8 | Inventory/production lifecycle, Admin operations, NFR | Backend conventions, worker/queue ADR | Hold/reservation/order/production guards, lock order, concurrency and performance evidence; Admin operations package |
| APP9 | Payment/fulfillment/cancellation/refund rules, lifecycle, Admin operations | Backend/frontend conventions | Remaining obligation, shipping freeze, completion/refund guards; fulfillment design package |
| APP10 | Customer/privacy/admin operations, notification scope | Backend/frontend conventions | Customer merge/agreement/notification attempt guards and retention obligations; customer operations design audit |
| APP11 | SEO/content requirements, Storefront journeys, scope | Frontend conventions, performance/NFR | Gallery/content/asset/publication query paths; approved public UI and Design System |
| APP12 | Security, NFR, acceptance principles, all critical journeys | All architecture/development/operations docs | DB correctness/concurrency/performance/durability completion evidence; all approved design packages and phase reports |

## 3. Database handoff rule

At APP0 preflight, identify the final database stage status and canonical handoff files. Do not hard-code obsolete DB checkpoint assumptions into application code.

Application phases must preserve:

- Physical schema and migration immutability.
- Repository ownership.
- Transaction/application guards.
- Concurrency/lock-order behavior.
- Measured query/index decisions.
- Backup/restore/retention obligations.

## 4. Design evidence rule

A chat summary that “screens were designed” is not enough. Each phase must record exact Figma file/page/section/node references and approval status before classifying design as `REUSE`.

The authoritative source for those references is `docs/design/FIGMA_DESIGN_INDEX.md`. Therefore:

- Every phase design audit **queries the registry** before classifying design as `NONE / REUSE / SUPPLEMENT / NEW`.
- Every `REUSE` classification **cites exact registry IDs / direct node links** (not file- or page-level links). A surface with no `APPROVED_FOR_IMPLEMENTATION` registry entry is not proven `REUSE`.
- Every `NEW` / `SUPPLEMENT` design checkpoint **updates the registry** in the same checkpoint.
- Every frontend checkpoint **records the registry IDs it implemented** in its completion report.
