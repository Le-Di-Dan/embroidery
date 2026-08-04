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
| APP3 | Design Studio spec, product requirements, lifecycle, security/abuse prevention; **IMP-D041 placement rulings (`APP3-G01`), IMP-D042 Template lifecycle LC-24 + Product `TR-LC04-06` (`APP3-G02`) IMP-D043 anonymous Design Session ownership/transport/retention, closing `O-008` and the `design_sessions` half of `DP-RET-01` (`APP3-G03`), and IMP-D044 editor-safe media, asset eligibility, complexity and canonical derivative-metadata authority (`APP3-G04`)** | System architecture, frontend/backend conventions | Template/design-session/version/document guards and queries; **the APP2-owned Figma closure baseline (`reports/APP2-CLOSURE-FIGMA-BASELINE.json`) — later phases append to the shared registry, never mutate an owned record**; **catalog product-side and embroidery-area placement geometry (`px_per_mm`, bounds, physical maxima) and the side-background asset relation**; **`product_media.role`, `asset_derivatives.kind` and `secure_access_grants.scope_kind` closed sets, which bound what `APP3-G01`/`G02`/`G04` may rule without a migration — `APP3-G04` measured that `asset_derivatives` carries **no** intrinsic-dimension, media-type or byte-size column, so IMP-D044 contributes those four columns to `APP3-DB01` rather than reusing append-only `asset_inspections.detail` evidence — **delivered by migration `0034` (`APP3-DB01`), together with the placement `code`/`retired_at`/`superseded_by_id` authority and the referenced-row protection triggers**; **the controlled Inter v4.1 font assets vendored by `APP3-F01` at `packages/design-document/assets/fonts/inter/4.1/` — two unmodified WOFF2 binaries, the exact upstream OFL-1.1 `LICENSE.txt`, and the provenance and Vietnamese-coverage manifests bound to their SHA-256; the binaries are frozen evidence and may not be re-encoded, subset or renamed, and the `fontId = inter` runtime registry that consumes them is reserved for `APP3-P01`**; **the canonical Design Document contract owned by `packages/design-document` (`APP3-P01`) — schema v1, the nine IMP-D044 complexity constants, the APP0-R01 quantization scale of 10,000, RFC 8785 canonicalization, the document-migration registry, and the browser-safe root versus Node-only `/server` hashing split; every API that accepts or persists a Design Document consumes this package and none may re-implement serialization or hashing (ADR-DB1-012 §1)** — **`APP3-P01-C1` keys the decoded-pixel budget and the unique-media budget on `assetId`, allows exactly one `derivativeId` per Asset inside one document, and rejects a conflicting pair with `DERIVATIVE_METADATA_MISMATCH`, restoring the IMP-D044 rule rather than amending it**; **the geometry semantics locked as `IMP-D045` (`APP3-G05`) — top-left origin with y down, clockwise degrees, rotation and scale about the untransformed local-box centre with scale first, column-vector `Mlocal = T(centre) x R x S x T(-half)`, group-local child coordinates composed parent-outermost, `CONSERVATIVE_TRANSFORMED_AABB` bounds, blocking boundary-inclusive containment and `product_sides.px_per_mm` as the sole conversion authority. These are part of the semantic interpretation of `schemaVersion = 1`: a v1 document carries no pivot marker, so changing any of them is a schema-semantic event, never a refactor. The three APP0-R01 renderer adapters are comparative research evidence and contradict each other on pivot and group inheritance; they are not production authority**; Design System and Studio Figma artifacts |
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
