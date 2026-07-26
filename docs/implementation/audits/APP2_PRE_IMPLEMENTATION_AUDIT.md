# APP2 — Assets and Catalog Publication — Pre-Implementation Audit

## A. Executive verdict

**Verdict: `PASS_WITH_REQUIRED_DECISIONS`.** APP1 is closed and accepted as the
baseline; APP2 entry is clear on governance, database, and contract foundations.
APP2 engineering **may not begin with code**: two decision gates (`IMP-O002`
object storage, `IMP-O003` job runtime) and one design package come first. The
database is sufficient — **`NO_APP2_MIGRATION`** — every asset/catalog/
publication/job table already exists (DB0–DB10, frozen). The asset and catalog
modules are **persistence `SCAFFOLD`** only (repository + Drizzle adapter +
integration tests); no controller, use case, OpenAPI operation, frontend, or
worker handler exists yet. First checkpoint: **`APP2-DEC-STORAGE`** (§P). No
source, schema, migration, Figma, or dependency was changed by this audit.

## B. APP1 handoff and APP2 entry readiness

- APP1 `COMPLETE — PASS_WITH_FOLLOW_UPS`, zero blocking follow-ups; milestone
  **R0 achieved**. Closure Commit A `036043c1b1a4861c14977f6184d1841d8f9fc220`;
  Evidence Commit B `6fab243f59aafce1c5e4fc87263e6de1409abb55` (`git log`,
  unpushed). Reports: `reports/APP1-COMPLETION-REPORT.md`,
  `reports/APP1-CLOSURE-EVIDENCE.md`.
- Frozen baselines carried into APP2 (all unchanged):
  - OpenAPI SHA-256 `ae015dd65dc2f64c902145f19d5fa5fae6cd6423a54934c1126cd289e3d30946`.
  - API-client tree SHA-256 `89c1aace328eef1ee05a74950faa48bf907babece025a6abb9ca1baa1574502f`.
  - Database: **31 migrations, 78 tables, 833 physical columns**, fingerprint
    `4ca56a5967730d257edb34e72d6c40373156704cab7c87e3a684803c8321672f`.
- Contract surface today: only `staffSessionCreate`, `staffSessionDelete`,
  `staffSelfGet` + health. APP2 is the first phase to add asset/catalog APIs.
- Entry readiness: governance, testing harnesses (T01/DB7, T02A, T02B),
  gateway, logging, actor/audit context, generated-client pipeline all present.
  Gaps are the two decisions + design, not foundations.

## C. Canonical APP2 scope and exclusions

**In scope** (phase plan §4, roadmap §4 vertical slice): asset upload
authorization/metadata/inspection/derivatives + failure/retry visibility; Admin
product draft create/edit/list/detail/archive; publish/unpublish + validation;
public catalog list + product detail; SEO metadata, canonical URL,
public/private asset access; publication visibility + cache/revalidation.

**Out of scope** (plan §5 + explicit prompt list): customer authentication
(APP4), cart/checkout/payment/orders (APP7+), inventory reservation (APP8),
Design Studio / template authoring (APP3), gallery/content CMS beyond
APP2-owned catalog (APP11), search implementation (not required by APP2 —
list uses pagination/filter, not full-text search), general-purpose DAM,
production readiness (APP12). No APP3+ capability is imported.

## D. Current asset/catalog implementation inventory

Legend: `IMPLEMENTED` / `PARTIAL` / `SCAFFOLD` (persistence only) / `MISSING` /
`OUT_OF_SCOPE`.

| Concept | Module | Ctrl | UseCase | Repo iface | Drizzle repo | Tests | OpenAPI | Client | Admin UI | Storefront UI | Worker | Class |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Asset | `modules/asset` | — | — | ✓ | ✓ | int | — | — | — | — | — | `SCAFFOLD` |
| Asset derivative | `modules/asset` | — | — | ✓ | ✓ | int | — | — | — | — | — | `SCAFFOLD` |
| Asset inspection | `modules/asset` | — | — | ✓ | ✓ | int | — | — | — | — | — | `SCAFFOLD` |
| Product/Catalog | `modules/catalog` | — | — | ✓ | ✓ | int | — | — | — | — | — | `SCAFFOLD` |
| Category | `modules/catalog` | — | — | ✓ | ✓ | int | — | — | — | — | — | `SCAFFOLD` |
| Product media | `modules/catalog` | — | — | ✓ (`attachMedia`) | ✓ | int | — | — | — | — | — | `SCAFFOLD` |
| Product variant/SKU | `modules/catalog` | — | — | ✓ | ✓ | int | — | — | — | — | — | `SCAFFOLD` (scope §11) |
| Publication lifecycle | `modules/catalog` | — | — | ✓ (`changeStatus`) | ✓ | int | — | — | — | — | — | `SCAFFOLD` |
| Public catalog query | `modules/catalog` | — | — | ✓ (`findBySlug`) | ✓ | int | — | — | — | — | — | `SCAFFOLD` |
| Worker derivative processing | `apps/worker` | — | — | — | — | lifecycle | — | — | — | — | boot only | `MISSING` |
| Object storage | — | — | — | — | — | — | — | — | — | — | — | `MISSING` |

Only `identity` + `health` controllers exist (APP1/APP0). Database tables are
**not** completed application capability — the whole vertical (controller →
use case → OpenAPI → client → UI → worker → storage) is unbuilt.

## E. Database and repository readiness

All APP2 tables exist in the frozen DB0–DB10 baseline (`packages/database/src/schema/`):
`assets`, `asset_derivatives`, `asset_inspections` (asset/); `products`,
`categories`, `product_media`, `product_variants`, `skus`, `product_sides`,
`embroidery_areas` (catalog/); `background_job_attempts`, `outbox_events`,
`idempotency_records` (platform/). Lifecycle sets are locked in schema:
`ASSET_STATES` (UPLOADED→INSPECTING→ACCEPTED/REJECTED→DELETION_PENDING→DELETED),
`ASSET_DERIVATIVE_STATES` (PENDING/PROCESSING/READY/FAILED), `PRODUCT_STATES`
(DRAFT/PUBLISHED/ARCHIVED), `CATEGORY_STATES`, `OUTBOX_EVENT_STATES`,
`JOB_ATTEMPT_OUTCOMES`. Repository interfaces already expose the needed verbs:
`AssetRepository` (`register`, `recordInspection`, `registerDerivative`,
`completeDerivative`, `failDerivative`, `tombstone`, `findById`,
`findByStorageKey`, `listDerivatives`, `listInspections`); `ProductRepository`
/ `CategoryRepository` (`create`, `changeStatus`, `attachMedia`, `findBySlug`,
`loadStructure`, `addVariant`/`addSku`/`addSide`/`addArea`).

Per-behavior readiness (default **`NO_APP2_MIGRATION`**):

| APP2 behavior | Schema | Repo method | App guard | Query | Verdict |
|---|---|---|---|---|---|
| Register upload / metadata | ✓ | ✓ `register` | to build | — | schema sufficient |
| Record inspection outcome | ✓ | ✓ `recordInspection` | to build | — | schema sufficient |
| Derivative create/complete/fail | ✓ | ✓ | to build | — | schema sufficient |
| Product draft create/edit | ✓ | ✓ `create` | to build | — | schema sufficient |
| Publish / unpublish | ✓ `products.status` | ✓ `changeStatus` | to build | — | schema sufficient |
| Attach media | ✓ `product_media` | ✓ `attachMedia` | to build | — | schema sufficient |
| Public published-only list/detail | ✓ IDX-065 (`status='PUBLISHED'`) | partial `findBySlug` | to build | list query missing | repo query missing (code) |
| Two-phase asset tombstone | ✓ IDX-133 | ✓ `tombstone` | to build | — | schema sufficient |
| Job claim / attempt / dead-letter | ✓ outbox + attempts + idempotency | — | to build | claim repo missing | repo method missing (code, DEC-JOBS) |

No genuine schema gap found. Missing items are **application code**
(list query, job-claim repository), not persistence. **`NO_APP2_MIGRATION`**
unless a concrete gap surfaces inside a checkpoint spec; if one does, insert a
dedicated forward-only `APP2-DB01` change checkpoint before dependent code and
never edit an existing migration.

## F. Object-storage decision position — IMP-O002

**Classification: `ADR_REQUIRED`.** Repository evidence of *absence*:
`SYSTEM_ARCHITECTURE.md` §10 explicitly lists "concrete S3-compatible
object-storage product" as still requiring an ADR; there is **no** storage
adapter package, **no** MinIO/S3 service in any `infrastructure/compose/*.yml`,
and **no** storage key/endpoint/credential entry in `.env.example`. The schema
only defines an abstract `storage_key` reference (`assets.storage_key`,
`asset_derivatives.storage_key`, INV-10 "binary never enters PostgreSQL") and
`classification` (CUSTOMER_PRIVATE/PRODUCTION_SENSITIVE/PUBLIC, INV-09
private-by-default). The architecture *mentions* an "Object Storage Port" but
neither the production adapter, the upload contract, nor local parity is locked.

Unresolved parameters the decision must lock (do not invent here): SDK/client,
bucket model, endpoint addressing, credential/config, public/private access,
**upload strategy** (API multipart-proxy vs presigned direct vs
initiation/finalization hybrid), object-key format, content-type validation,
checksum policy (schema wants `sha256:<64hex>`), size limits, orphan cleanup,
local MinIO behavior, production adapter boundary. The audit **recommends
evaluating** these against security, gateway body limits, checksum integrity,
MinIO/local parity, testability, cleanup, Admin UX — it does not select an
approach. → checkpoint **`APP2-DEC-STORAGE`** before any asset API.

## G. Queue/job-runtime decision position — IMP-O003

**Classification: `ADR_REQUIRED` (foundation already present; runtime
mechanism unchosen).** APP2 is the earliest phase with real async work
(`APP2-W01`). The **database-backed claim path is fully designed**:
`ADR-DB5-003` (Accepted) specifies skip-locked exclusive claim (GRD-029,
CC-25), partial claimable indexes, and names asset processing as query Q-26;
`outbox_events` implements `FOR UPDATE SKIP LOCKED` with a column-scoped
mutable dispatch set (CST-099); `background_job_attempts` is the append-only
attempt/dead-letter record (CST-049/CST-098); `idempotency_records` is the
double-execution arbiter (CST-048). What is **not** locked by ADR is the
concrete runtime choice: `.env.example` states "Queue/broker configuration is
an open decision"; the worker emits no jobs. The decision must compare at
minimum **database-backed claim queue** (strongly favored by the existing
DB investment) vs **external broker**, by ADR, before `APP2-W01`. Do not
install Redis/RabbitMQ/BullMQ or add a DB queue here. → checkpoint
**`APP2-DEC-JOBS`** before `APP2-W01`.

## H. Worker and observability readiness

`apps/worker/src` contains only `bootstrap/` (`worker.module.ts`,
`worker-lifecycle.service.ts` + specs) — no claim loop, job handler,
object-storage access, or concurrency config. `FU-A07` (worker structured
logging + out-of-request correlation) is **not** done: `IMP-D022` logging is
API-local; the worker has no request context (correlation must be
job/attempt-scoped, not `X-Request-ID`). Recommendation: worker
logging/correlation is a **narrow prerequisite folded into `APP2-DEC-JOBS`**
(which defines the correlation seam) and realized inside `APP2-W01`; do **not**
create a broad worker-foundation phase. `FU-A07` = an `APP2-W01` acceptance item.

## I. API/contract checkpoint decomposition

Correction (evidence-based): `IMP-D019` generates OpenAPI **from decorated
NestJS controllers**, so a contract-only checkpoint that writes no controller
cannot produce the committed artifact. The plan's separate `C0x` contract vs
`B0x` backend split is therefore **merged** — each backend checkpoint defines
its OpenAPI + regenerates the client + implements + integration-tests within
one review boundary (the APP1-B01 precedent). All ≤5 endpoints (IMP-D004).

| CP | Method/path (provisional) | Purpose | Actor | Transition/query | Deps | DB | Storage/Job | FE consumer |
|---|---|---|---|---|---|---|---|---|
| B01 | `POST /api/assets` intent · `POST /api/assets/{id}/complete` · `GET /api/assets/{id}` · `GET /api/assets` · `POST /api/assets/{id}/retry` | Authorized upload + metadata + list/detail + retry (≤5) | ADMIN | UPLOADED→(INSPECTING) | DEC-STORAGE | assets | storage | A01 |
| W01 | (no HTTP) worker job | Inspect + derive; attempts/retry/dead-letter | SYSTEM | ACCEPTED/REJECTED, derivative READY/FAILED | B01, DEC-JOBS | assets, asset_derivatives, asset_inspections, outbox, attempts | storage + claim | A01 status |
| B02 | `POST /api/products` · `GET /api/products` · `GET /api/products/{id}` · `PATCH /api/products/{id}` · `POST /api/products/{id}/archive` | Draft management (≤5) | ADMIN | DRAFT edits, →ARCHIVED | B01 (media) | products, categories, product_media | — | A02/A03 |
| B03 | `POST /api/products/{id}/publish` · `POST /api/products/{id}/unpublish` · `GET /api/products/{id}/publish-readiness` | Publication lifecycle + readiness | ADMIN | DRAFT↔PUBLISHED | B02 | products | revalidation | A04 |
| B04 | `GET /api/public/products` · `GET /api/public/products/{slug}` | Published-only public read models + SEO | ANON | Q on `status='PUBLISHED'` | B03 | products, categories, product_media, assets | public derivative access | S01/S02 |

Capability-oriented, not CRUD-exhaustive; no endpoint multiplication.

## J. Admin frontend decomposition

Split by one screen / bounded capability (IMP-D005); each needs approved Figma
(none exists yet → `APP2-D01`, see §L). States limited to APP2 scope.

| CP | Screen/capability | Backend | Figma (APP2-D01) | Key states | Test scope |
|---|---|---|---|---|---|
| A01 | Asset library — upload/list/status/retry | B01, W01 | Admin asset | empty, uploading, processing, ready, failed, retry | component + browser |
| A02 | Product list — filters/pagination/actions | B02 | Admin product list | loading, empty, list, permission-aware actions | component + browser |
| A03 | Product form/detail — create/edit + asset select | B02 | Admin product form | loading, validation, saving, conflict, success | component + browser |
| A04 | Publication interaction — publish/unpublish | B03 | Admin publish states | readiness, confirm, publishing, publish-conflict, unpublished | component + browser |

No single "giant Product Management" screen. Admin leads Storefront.

## K. Storefront frontend decomposition

Shell + not-found are `REUSE` (APP1-D02 approved). Product list/detail are
**new public surfaces**; split list and detail (IMP-D005).

| CP | Capability | Class | Backend | Figma | Concerns |
|---|---|---|---|---|---|
| S01 | Published product list | `SUPPLEMENT`/`NEW` | B04 | APP2-D01 list | SSR, server fetch ownership, cache/revalidate, pagination/filter, empty, metadata/canonical |
| S02 | Published product detail | `SUPPLEMENT`/`NEW` | B04 | APP2-D01 detail | SSR, gallery via approved derivative, slug handling, SEO/canonical, not-found for unpublished/missing, unpublish removes visibility |

No search/cart/wishlist/customer-auth. Missing/unpublished product → the
approved 404 boundary (S01B). Public gallery uses the **watermarked/public
derivative**, never the private original (INV-09/22).

## L. Design classification and Figma evidence

Registry (`FIGMA_DESIGN_INDEX.md`) queried. `APPROVED_FOR_IMPLEMENTATION`
today: APP1-D01 (13 Admin rows) + APP1-D02 (7 Storefront shell/404 rows) + DS
catalog. **No product-list, product-detail, or Admin asset/catalog node is
approved.** Homepage/Discover/Collections hi-fi exist only as **DRAFT /
REFERENCE_ONLY** (UI02/UI05) — not proven `REUSE`.

| Surface | Classification | Evidence |
|---|---|---|
| Storefront shell / not-found | `REUSE` | FIG-STOREFRONT-SHELL-* / FIG-STOREFRONT-NOTFOUND (APPROVED, APP1-D02) |
| Storefront product list | `SUPPLEMENT` | DRAFT Homepage/Discover/Collections references; no approved list node |
| Storefront product detail | `SUPPLEMENT`/`NEW` | UI03 Work Detail DRAFT; no approved detail node |
| Admin asset/catalog surfaces | `NEW` | no Figma node exists |
| Processing/error states | `NEW` | part of Admin asset/publication package |

Confirms the prior documentation audit (Public REUSE/SUPPLEMENT, Admin NEW).
No DRAFT/REVIEW_REQUIRED node is promoted here; no approval claimed without
Product Owner evidence. → one coherent phase-level design checkpoint
**`APP2-D01`** (Admin asset/catalog `NEW` + Storefront list/detail
`SUPPLEMENT`), delivered as one package before dependent frontend, not split
into coding-style micro-checkpoints (IMP-D003).

## M. Testing/E2E strategy

Reuse canonical harnesses only — no second DB or E2E harness. Ownership:
storage-adapter contract tests (against local MinIO once DEC-STORAGE locks it);
upload security/validation tests; disposable-DB (T01/DB7) application
integration for asset/catalog/publication; worker idempotency/retry tests
(claim + attempt + dead-letter); publication lifecycle + **negative
public-visibility** tests (draft/unpublished never public); Admin component
(T02A) + browser tests; Storefront SSR list/detail tests; cross-layer gateway
E2E (`APP2-E01`, reuses `@embroidery/e2e-testing` orchestrator, adds a
disposable object-storage service); orphan/cleanup behavior; contract/hash
gates (`check:openapi`, `check:api-client`) on every backend checkpoint.
Real deps by journey: PostgreSQL (all backend), object storage
(asset/publication/E2E), worker (W01/E01), gateway + browser (E01).

## N. Follow-up routing

| Item | Decision | Owner |
|---|---|---|
| APP1-FU01 (Admin dependency-error UX) | `KEEP_ROUTED_LATER` — cosmetic; not consumed by APP2 capability | APP2 backlog, not a checkpoint owner |
| FU-A15 (text-inverse/action-disabled tokens) | `ACTIVATE_IN_APP2` — Admin NEW surfaces need them | `APP2-D01` |
| FU-A16 (shared breakpoint scale) | `ACTIVATE_IN_APP2` — new Admin/Storefront screens | `APP2-D01` |
| FU-A17 (`/api` base-path reconciliation) | `ACTIVATE_IN_APP2` — first new API surface consumes it | `APP2-B01` |
| FU-A20 (stylelint hook) | `KEEP_ROUTED_LATER` — infra hygiene, not APP2-triggered | APP0/infra |
| GAP-D01 / FIG-DS-INPUT | `ACTIVATE_IN_APP2` — Admin forms need an Input component | `APP2-D01` |
| GAP-D02 / FIG-DS-SCRIM-TOKEN | `ACTIVATE_IN_APP2` — Admin modals/overlays | `APP2-D01` |
| Storefront favicon | `KEEP_ROUTED_LATER` — cosmetic; APP11 presentation | APP11 |
| FU02/FU03 (WebKit-504 / e2e login flake) | `KEEP_ROUTED_LATER` — E2E reliability | APP0/infra |

APP2 is not overloaded: only items a genuine APP2 capability consumes are
activated, each with a concrete checkpoint owner.

## O. Corrected checkpoint map and dependencies

17 checkpoints (was ~18 candidate; contract/backend merged per §I, prerequisites
added). Acyclic; Admin leads Storefront; worker after decisions; no code before
design approval; no backend checkpoint >5 endpoints.

| # | ID | Type | Scope | APIs/screen | Predecessors | Review output | Migration | Figma |
|---|---|---|---|---|---|---|---|---|
| 1 | APP2-PRE-AUDIT | audit | this document | — | APP1-X01 | audit | no | no |
| 2 | APP2-DEC-STORAGE | decision | IMP-O002 storage ADR | — | PRE-AUDIT | ADR | no | no |
| 3 | APP2-DEC-JOBS | decision | IMP-O003 job-runtime ADR (+worker correlation seam) | — | PRE-AUDIT | ADR | no | no |
| 4 | APP2-D01 | design | Admin asset/catalog NEW + Storefront list/detail SUPPLEMENT (one package) | — | PRE-AUDIT | Figma+registry | no | creates |
| 5 | APP2-B01 | backend | Asset intake API + OpenAPI/client | ≤5 | DEC-STORAGE | code | no | no |
| 6 | APP2-W01 | worker | Asset inspection/derivatives job | — | B01, DEC-JOBS | code | no | no |
| 7 | APP2-A01 | frontend | Admin asset library | 1 screen | B01, W01, D01 | code | no | uses |
| 8 | APP2-B02 | backend | Catalog draft backend + OpenAPI/client | ≤5 | B01 | code | no | no |
| 9 | APP2-A02 | frontend | Admin product list | 1 screen | B02, D01 | code | no | uses |
| 10 | APP2-A03 | frontend | Admin product form/detail | 1 screen | B02, D01 | code | no | uses |
| 11 | APP2-B03 | backend | Publication backend + OpenAPI/client | ≤3 | B02 | code | no | no |
| 12 | APP2-A04 | frontend | Admin publication interaction | 1 capability | B03, D01 | code | no | uses |
| 13 | APP2-B04 | backend | Public catalog queries + OpenAPI/client | ≤2 | B03 | code | no | no |
| 14 | APP2-S01 | frontend | Storefront product list | 1 screen | B04, D01 | code | no | uses |
| 15 | APP2-S02 | frontend | Storefront product detail | 1 screen | B04, D01 | code | no | uses |
| 16 | APP2-E01 | E2E | publication cross-layer journey | — | S01, S02 | evidence | no | no |
| 17 | APP2-X01 | closure | close R1 Catalog Alpha; APP3 handoff | — | E01 | closure | no | no |

Optional `APP2-DB01` (forward-only) inserts before B01 **only if** a concrete
schema gap is proven in a later spec; none is proven now. Validation: no
backend checkpoint >5 APIs (B01=5, B02=5, B03=3, B04=2);
frontend one screen/bounded capability each; Admin (A01–A04) fully precedes
Storefront (S01–S02); worker (W01) begins only after DEC-STORAGE + DEC-JOBS;
no frontend before D01 approval; dependency graph acyclic.

## P. First checkpoint recommendation

**`APP2-DEC-STORAGE`** (decision, not code).

- **Why first:** it is the deepest blocker — the asset intake API shape
  (`APP2-B01`) depends on the upload strategy (proxy vs presigned vs hybrid),
  and every asset/worker/publication/public-media path resolves through the
  storage contract. Nothing asset-related can start until it is locked.
- **Resolves:** IMP-O002 — product/adapter, upload contract, key format,
  access policy, validation/size/checksum limits, MinIO local parity, prod
  adapter boundary.
- **Remains blocked after it:** `APP2-DEC-JOBS` (independent, can run in
  parallel), `APP2-D01`, and all B/A/S code.
- **Allowed file categories:** an ADR under `docs/adr/`
  (`ADR-APP2-00x-OBJECT-STORAGE.md`), decision-register/roadmap status updates,
  a compose object-storage service + `.env.example` keys **only when the ADR
  authorizes them** (that is a subsequent implementation checkpoint, not the
  decision). No asset code.
- **Required evidence:** option comparison against the §F criteria; local
  MinIO parity plan; test seam for the disposable E2E environment.
- **Human review questions:** presigned-direct vs API-proxied upload? object
  key format and tenancy? private-by-default access + signed public
  derivative delivery? size/type/checksum limits (or configurable)? orphan
  cleanup ownership?

The execution prompt for it is **not** written here (IMP-D014).

## Q. Entry-gate acceptance matrix

| # | Criterion | Status |
|---|---|---|
| 1 | APP1 closure chain verified | ✓ (§B) |
| 2 | APP2 canonical plan read fully | ✓ |
| 3 | Asset/catalog/worker/storage inventory complete | ✓ (§D) |
| 4 | DB readiness mapped per behavior | ✓ (§E) |
| 5 | Migration classification explicit (`NO_APP2_MIGRATION`) | ✓ |
| 6 | IMP-O002 classified with evidence | ✓ `ADR_REQUIRED` |
| 7 | IMP-O003 classified with evidence | ✓ `ADR_REQUIRED` |
| 8 | Worker logging/correlation readiness classified | ✓ (§H) |
| 9 | Asset security params identified without invention | ✓ (§F, §R) |
| 10 | Lifecycle transitions mapped to DB authority | ✓ (§E, §I) |
| 11 | API checkpoint counts compliant (≤5) | ✓ (§I, §O) |
| 12 | Admin frontend scopes bounded | ✓ (§J) |
| 13 | Storefront list/detail scopes bounded | ✓ (§K) |
| 14 | Design classification evidence-based | ✓ (§L) |
| 15 | Figma approval not overstated | ✓ (no DRAFT promoted) |
| 16 | APP1 follow-ups reconciled | ✓ (§N) |
| 17 | Testing reuses canonical harnesses | ✓ (§M) |
| 18 | Corrected dependency graph acyclic | ✓ (§O) |
| 19 | Admin leads Storefront ≤1 capability | ✓ (§O) |
| 20 | First checkpoint recommendation exact | ✓ `APP2-DEC-STORAGE` |
| 21–22 | No implementation prompt embedded; no source/schema/migration/Figma/dependency change | ✓ |

## R. Scope confirmation

This audit changed **no** implementation source, test, Figma artifact, schema,
migration, generated file, or dependency. It classifies APP2 asset-security
parameters (allowed media types, declared-vs-sniffed MIME, max size, image
dimensions, filename/object-key safety, checksum/dedupe, malformed-image/SVG
policy, executable/archive rejection, metadata stripping, derivative generation,
orphan cleanup, audit logging, authorization, rate limits) as
**must-lock-before-asset-API** and routes every unresolved limit to
`APP2-DEC-STORAGE` — none invented here, no hidden limits in implementation.
Verdict **`PASS_WITH_REQUIRED_DECISIONS`**; APP2 engineering not started.
