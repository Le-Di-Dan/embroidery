# APP2 — Assets and Catalog Publication

> **Status:** `AUDITED — PASS_WITH_REQUIRED_DECISIONS` (engineering `NOT_STARTED`).
> `APP2-PRE-AUDIT` complete — audit [`audits/APP2_PRE_IMPLEMENTATION_AUDIT.md`](../audits/APP2_PRE_IMPLEMENTATION_AUDIT.md),
> report [`reports/APP2-PRE-IMPLEMENTATION-AUDIT-COMPLETION-REPORT.md`](../reports/APP2-PRE-IMPLEMENTATION-AUDIT-COMPLETION-REPORT.md).
> Verdict `NO_APP2_MIGRATION`; two required decisions before any code
> (`IMP-O002` object storage → `APP2-DEC-STORAGE`; `IMP-O003` job runtime →
> `APP2-DEC-JOBS`), one design package (`APP2-D01`, Admin `NEW` + Storefront
> list/detail `SUPPLEMENT`). First checkpoint: **`APP2-DEC-STORAGE`**. The
> corrected 17-checkpoint map in §6.1 supersedes the §6 candidate slices.
>
> **`APP2-DEC-STORAGE` = `COMPLETE — CORRECTED, DELIVERED_FOR_REVIEW`** —
> object-storage + asset-intake architecture locked by **IMP-D028 /
> [`ADR-APP2-001`](../../adr/backend/ADR-APP2-001-OBJECT-STORAGE-AND-ASSET-INTAKE.md)**
> (S3-compatible / MinIO dev, AWS SDK v3, API-proxied streaming upload, two
> private buckets, server SHA-256, SVG rejected, proxied publication-gated
> delivery, `NO_APP2_MIGRATION`), verdict `PASS_WITH_PRODUCT_PARAMETERS`.
> **Corrected by `APP2-DEC-STORAGE-C1`** (report
> [`reports/APP2-DEC-STORAGE-C1-CORRECTION-REPORT.md`](../reports/APP2-DEC-STORAGE-C1-CORRECTION-REPORT.md)):
> the `assets` row is created **only after** the object is stored/measured
> (`UPLOADED` is post-upload, not a reservation; IDX-086 recovery-only); the HTTP
> transport is the **T1 single streaming multipart request** (`busboy` →
> `@aws-sdk/lib-storage` `Upload`); route-scoped nginx `client_max_body_size` +
> `proxy_request_buffering off`; server-authoritative SHA-256 (no client
> checksum); and `OBJECT_STORAGE_PUBLIC_BASE_URL` removed from APP2 scope. It
> adds a narrow **`APP2-I01`** object-storage foundation checkpoint before
> `APP2-B01` (map now **18 checkpoints**, §6.1).
> **Also corrected by `APP2-DEC-STORAGE-C2`** (report
> [`reports/APP2-DEC-STORAGE-C2-CORRECTION-REPORT.md`](../reports/APP2-DEC-STORAGE-C2-CORRECTION-REPORT.md)):
> upload idempotency locked to **model I1 — pre-stream durable allocation**
> (UUIDv7 `assetId`+key persisted in the `IN_PROGRESS` `idempotency_records.result`
> so a crash-retry recovers the same identity); **pre-stream fingerprint** (no
> content hash); full CW-01…CW-07 crash matrix; **`@aws-sdk/s3-request-presigner`
> removed** from the APP2 package set; `lib-storage` memory-bound policy + C1
> heap-claim corrected. Persisting the allocation is a **repository implementation
> gap** (owner `APP2-B01`), **not** a schema gap — `NO_APP2_MIGRATION` re-confirmed
> against the real 31-migration schema. `APP2-DEC-JOBS` and `APP2-D01` remain
> blocked pending required-decision review.
>
> **`APP2-DEC-STORAGE` accepted** by the Product Owner as
> `ACCEPTED_WITH_BLOCKED_IMPLEMENTATION_GAPS` (no `APP2-DEC-STORAGE-C3`; the
> one-correction governance rule below applies). Three storage issues are
> **routed** to the `APP2-B01` entry gate — `STORAGE-BLK-01` content-complete
> upload idempotency fingerprint, `STORAGE-BLK-02` versioned/discriminated
> idempotency result JSON shape, `STORAGE-BLK-03` expired-allocation reclaim /
> old-object cleanup ordering — they block `APP2-B01` and downstream asset
> intake but **not** `APP2-DEC-JOBS`, `APP2-D01`, or `APP2-I01`.
>
> **`APP2-DEC-JOBS` = `DELIVERED_FOR_REVIEW`** — the asynchronous job runtime is
> locked by **IMP-D029 /
> [`ADR-APP2-002`](../../adr/backend/ADR-APP2-002-ASYNCHRONOUS-JOB-RUNTIME.md)**:
> a **PostgreSQL-backed claim queue on the existing persistence** (`outbox_events`
> durable work signal + `background_job_attempts` + `FOR UPDATE SKIP LOCKED`
> claim + **visibility-timeout lease on `next_attempt_at`**; J2 Redis/BullMQ and
> J3 RabbitMQ rejected — second datastore, transactional-outbox invariant lost).
> **No new runtime dependency, `NO_APP2_MIGRATION`** (spike 23/23 vs the real
> 31-migration schema). At-least-once + idempotent creation/execution (not
> exactly-once). It inserts a narrow **`APP2-I02`** worker-runtime foundation
> checkpoint (poll/claim-lease driver, `event_type` handler registry, attempt
> seam, `FU-A07` worker logging/correlation, graceful shutdown replacing the
> keep-alive) between `APP2-DEC-JOBS`/`APP2-B01` and `APP2-W01` (map now
> **19 checkpoints**, §6.1). Report:
> [`reports/APP2-DEC-JOBS-COMPLETION-REPORT.md`](../reports/APP2-DEC-JOBS-COMPLETION-REPORT.md).
> **Corrected by `APP2-DEC-JOBS-C1`** (report
> [`reports/APP2-DEC-JOBS-C1-CORRECTION-REPORT.md`](../reports/APP2-DEC-JOBS-C1-CORRECTION-REPORT.md)):
> the original claim predicate/retry state contradicted IDX-088 (partial `WHERE
> status='PENDING'`). Locked state machine — **`PENDING` is the only automatic
> claim/retry state** (three column-distinguished sub-states); retryable failure
> returns the row to **`PENDING`** with a backoff `next_attempt_at` (never
> `FAILED`); `DISPATCHED`/`DEAD_LETTER` terminal; **`FAILED` reserved, never
> emitted/claimed** by the APP2 runtime. Ownership-guarded success/retry/terminal
> completion transactions (attempt + outbox mutation atomic, after the handler
> effect commits); `job_key=outbox_events.id`; expired-lease recovery records the
> crashed attempt (`WORKER_LEASE_EXPIRED`, CST-049 conflict-safe) then reclaims;
> no-heartbeat timeout invariant + `AbortSignal`; handler idempotency contract;
> policy-key set. `NO_APP2_MIGRATION`, no dependency; correction spike **25/25**.
> This is the **only** correction for `APP2-DEC-JOBS` (one-correction rule).
>
> **`APP2-D01` = `DELIVERED_FOR_PRODUCT_OWNER_REVIEW`** — the Assets and Catalog
> Publication design package is delivered as **one** package on the new Figma page
> **APP_02 (`419:3`)**, section **`APP2-D01 · Assets & Catalog Publication`
> (`423:3`)**: 27 screen/state frames + 2 annotation frames + 1 design-system
> supplement. Admin asset intake / product draft / catalog / publication are `NEW`;
> Storefront product list and detail are `SUPPLEMENT` (cloned from the **approved**
> APP1-D02 shells, which are unmodified). `GAP-D01` is supplemented in the product
> file as `FIG-DS-INPUT-APP2`; `GAP-D02` remains a local `ink/900 @45%` composition.
> All 30 new registry rows are `REVIEW_REQUIRED` and **no APP1 row is superseded**.
> Registry: [`FIGMA_DESIGN_INDEX.md`](../../design/FIGMA_DESIGN_INDEX.md) §4.3/§6.1b
> (69 registry IDs). Report:
> [`reports/APP2-D01-COMPLETION-REPORT.md`](../reports/APP2-D01-COMPLETION-REPORT.md).
> **No frontend checkpoint may implement from these rows until the Product Owner
> promotes them to `APPROVED_FOR_IMPLEMENTATION`.** See the §6.2 handoff.
>
> **Product Owner review outcome + `APP2-D01-C1` correction (2026-07-26):**
>
> ```text
> APP2-D01-ADMIN                       = COMPLETE — PRODUCT_OWNER_APPROVED — FROZEN
> APP2-D01-STOREFRONT-PRODUCT-LIST     = REJECTED_NODE_SET_REMOVED
>                                        SOURCE_AUTHORITY_CORRECTED_TO_UI02
> APP2-D01-STOREFRONT-PRODUCT-DETAIL   = NOT_APPROVED
>                                        WITHHELD_PENDING_UI03_RECONCILIATION
> APP2-D01                             = PARTIAL_PRODUCT_OWNER_APPROVAL
>                                        CORRECTION_COMPLETE (APP2-D01-C1)
> ```
>
> `APP2-D01-C1` deleted the four rejected card-grid frames, removed their registry
> authority, and made **UI02 – Discover Feed** the mandatory source of truth for
> `APP2-S01` (§6.2.1). Admin was verified unchanged (31/31 frozen nodes identical).
> Report:
> [`reports/APP2-D01-C1-STOREFRONT-SOURCE-CORRECTION-COMPLETION-REPORT.md`](../reports/APP2-D01-C1-STOREFRONT-SOURCE-CORRECTION-COMPLETION-REPORT.md).
> **APP2 engineering implementation has not started.**
>
> **Governance rule (locked here):** a checkpoint may receive **at most one
> correction**; after that, remaining defects become **named blockers** with an
> owner and an activation gate rather than a further correction chain.

## 1. Outcome

Deliver the first full business vertical slice: Admin uploads/processes assets, creates and publishes catalog products, and Storefront server-renders only published products.

## 2. Dependencies

APP1 complete; object-storage and worker adapter choices must be available or selected in this phase through approved ADR/checkpoint.

## 3. Design policy

Audit current homepage/discovery/detail designs and Admin coverage. Public screens may be `REUSE` or `SUPPLEMENT`; Admin asset/catalog screens are likely `NEW/SUPPLEMENT`. Any required design is completed as one APP2 package before frontend coding.

Design, when required, is delivered as one complete phase package and is not split into coding checkpoints.

## 4. In scope

- Asset upload authorization, metadata, inspection, derivatives, failure/retry visibility.
- Admin product draft creation, editing, list/detail, archive where allowed.
- Product publication/unpublication and validation.
- Public catalog list and product detail.
- SEO metadata, canonical URL, public/private asset access.
- Publication visibility and cache/revalidation behavior.

## 5. Out of scope

- Design template authoring.
- Design Studio.
- Inventory reservation.
- Requests, quotation, payment, order.
- General-purpose DAM beyond product/catalog needs.

## 6. Candidate engineering checkpoints

These are planning slices. Execute and review one at a time. Any backend slice remains subject to the maximum of five tightly related HTTP endpoints.

- **APP2-C01 — Asset contract:** Define upload-intent/authorization, completion, detail/list, and retry operations; no more than five endpoints.
- **APP2-B01 — Asset intake:** Implement asset metadata and authorized upload flow with signature/MIME/size validation boundaries.
- **APP2-W01 — Asset inspection and derivatives:** Implement one idempotent worker job family with attempt records, bounded retry, terminal failure, and object-storage safety.
- **APP2-A01 — Admin asset library:** Implement asset list/upload/status/retry capability using the real contract.
- **APP2-C02 — Catalog draft contract:** Define product list, detail, create, update, and archive operations as one bounded draft-management slice.
- **APP2-B02 — Catalog draft backend:** Implement product draft commands/queries, ownership, validation, repository tests, and safe errors.
- **APP2-A02 — Admin product list:** Implement list, filters/pagination, loading/empty/error and permission-aware actions.
- **APP2-A03 — Admin product form/detail:** Implement create/edit/detail with asset selection and server conflict handling.
- **APP2-C03 — Publication contract:** Define publish, unpublish, and publication-preview/readiness operations.
- **APP2-B03 — Publication backend:** Implement lifecycle checks, visibility, audit, cache/revalidation consequence and tests.
- **APP2-A04 — Admin publication interaction:** Implement publish readiness, confirmation, errors, status and unpublish behavior.
- **APP2-C04 — Public catalog contract:** Define public list and detail endpoints/read models.
- **APP2-B04 — Public catalog queries:** Implement published-only queries, SEO fields, pagination/filter semantics, and asset access mapping.
- **APP2-S01 — Storefront product list:** Implement server-first public catalog/discovery screen using approved design.
- **APP2-S02 — Storefront product detail:** Implement server-rendered product detail, gallery, metadata and not-found behavior.
- **APP2-E01 — Publication E2E:** Upload asset → process → create draft → publish → public list/detail visible → unpublish → public visibility removed.
- **APP2-X01 — Phase closure:** Close R1 Catalog Alpha and hand off catalog/template compatibility to APP3.

## 6.1 Corrected checkpoint map (APP2-PRE-AUDIT)

The §6 candidate slices are corrected here from repository truth (see the audit
§O). Contract-only `C0x` slices are **merged into their backend checkpoint** —
`IMP-D019` generates OpenAPI from decorated NestJS controllers, so a
contract-only checkpoint that writes no controller cannot produce the committed
artifact. Prerequisites (decisions + design) are added. `NO_APP2_MIGRATION`
(no `APP2-DB01` unless a later spec proves a concrete schema gap). Order is
dependency-correct and acyclic; Admin leads Storefront; worker follows the
decisions; no frontend before `APP2-D01` approval; no backend checkpoint >5
endpoints.

| # | ID | Type | Scope | Predecessors |
|---|---|---|---|---|
| 1 | APP2-PRE-AUDIT | audit | this audit | APP1-X01 |
| 2 | APP2-DEC-STORAGE | decision | object-storage ADR (IMP-O002) | PRE-AUDIT |
| 3 | APP2-DEC-JOBS | decision | job-runtime ADR (IMP-D029/`ADR-APP2-002`): PostgreSQL claim queue on existing persistence, visibility-timeout lease, `NO_APP2_MIGRATION` (IMP-O003) — **`DELIVERED_FOR_REVIEW`** | PRE-AUDIT |
| 3b | APP2-I02 | foundation | Worker job-runtime foundation — poll loop + claim/lease **driver** (`OutboxEventStore.claimBatch` `next_attempt_at` lease extension), `event_type` handler registry, attempt-recording seam, **`FU-A07`** worker structured logging + out-of-request correlation (`{job_kind}:{job_key}:{attempt_no}` `AsyncLocalStorage` over IMP-D022), SIGTERM/SIGINT graceful shutdown replacing the no-op keep-alive; no asset job family (IMP-D029) | DEC-JOBS |
| 4 | APP2-D01 | design | Admin asset/catalog `NEW` + Storefront list/detail `SUPPLEMENT` (one package) — **`DELIVERED_FOR_PRODUCT_OWNER_REVIEW`**, section `423:3` on page APP_02, 30 `REVIEW_REQUIRED` rows (§6.2) | PRE-AUDIT |
| 4b | APP2-I01 | foundation | Object-storage foundation — `packages/object-storage` (port + S3 adapter over `client-s3`/`lib-storage` **only, no presigner** + key helpers + contract tests), pinned MinIO Compose service + bucket bootstrap, config contract + `.env.example` keys, route-scoped nginx upload support (`client_max_body_size` + `proxy_request_buffering off`), `lib-storage` memory-bound policy (IMP-D028 / C1 / C2) | DEC-STORAGE |
| 5 | APP2-B01 | backend | Asset intake API — T1 streaming multipart upload, I1 pre-stream durable idempotency allocation + pre-stream fingerprint (claim-with-allocation repo extension), post-object `UPLOADED` insert + guarded `→INSPECTING`, one-transition outbox `append`, CW-01…CW-07 tests, + OpenAPI/client (≤5). **Entry gate resolves `STORAGE-BLK-01..03`** (upload fingerprint / idempotency result JSON shape / expired-allocation cleanup ordering). | I01 |
| 6 | APP2-W01 | worker | Asset inspection/derivatives job family handler + image-processing library decision (uses I02 runtime) | B01, I02 |
| 7 | APP2-A01 | frontend | Admin asset library | B01, W01, D01 |
| 8 | APP2-B02 | backend | Catalog draft backend + OpenAPI/client (≤5) | B01 |
| 9 | APP2-A02 | frontend | Admin product list | B02, D01 |
| 10 | APP2-A03 | frontend | Admin product form/detail | B02, D01 |
| 11 | APP2-B03 | backend | Publication backend + OpenAPI/client (≤3) | B02 |
| 12 | APP2-A04 | frontend | Admin publication interaction | B03, D01 |
| 13 | APP2-B04 | backend | Public catalog queries + OpenAPI/client (≤2) | B03 |
| 14 | APP2-S01 | frontend | Storefront product list | B04, D01 |
| 15 | APP2-S02 | frontend | Storefront product detail | B04, D01 |
| 16 | APP2-E01 | E2E | publication cross-layer journey | S01, S02 |
| 17 | APP2-X01 | closure | close R1 Catalog Alpha; APP3 handoff | E01 |

## 6.2 `APP2-D01` design handoff (per consuming checkpoint)

Source of truth: [`FIGMA_DESIGN_INDEX.md`](../../design/FIGMA_DESIGN_INDEX.md) §4.3
(Figma file `BQwqV8GdfUIELvsQDB1UQE`, page **APP_02** `419:3`, section `423:3`).
Cross-cutting behaviour is annotated in `FIG-APP2-ASSET-CATALOG-NOTES` (`450:404`)
and `FIG-APP2-REUSE-MAP` (`451:404`).

**Gate for every row below — `BLOCKED_BY_APP2_D01_PRODUCT_OWNER_APPROVAL`.** Each row
is `REVIEW_REQUIRED`; a frontend checkpoint must block until it is promoted to
`APPROVED_FOR_IMPLEMENTATION` with an approval evidence ID, and must record the
registry IDs it used in its completion report.

| Checkpoint | Registry IDs (states delivered) | Responsive evidence |
|---|---|---|
| **A01** Admin asset library | `FIG-ADMIN-ASSETS-DESKTOP-{DEFAULT,EMPTY,UPLOADING,PROCESSING,REJECTED}`, `FIG-ADMIN-ASSETS-MOBILE-{DEFAULT,UPLOAD}` | 1440 desktop (5 states) + 390 mobile (2 states); 1024 by annotation |
| **A02** Admin product form/detail | `FIG-ADMIN-PRODUCT-DRAFT-DESKTOP-{DEFAULT,VALIDATION,SAVING}`, `FIG-ADMIN-PRODUCT-DRAFT-MOBILE-DEFAULT`, `FIG-ADMIN-PRODUCT-MEDIA-SELECT-DESKTOP` | 1440 desktop (3 states + dialog) + 390 mobile |
| **A03** Admin product list | `FIG-ADMIN-CATALOG-DESKTOP-{DEFAULT,EMPTY}`, `FIG-ADMIN-CATALOG-MOBILE-DEFAULT` | 1440 desktop table + 390 mobile card list |
| **A04** Admin publication interaction | `FIG-ADMIN-PUBLICATION-DESKTOP-{READY,BLOCKED,CONFIRM-UNPUBLISH}`, `FIG-ADMIN-PUBLICATION-MOBILE` | 1440 desktop (3 states) + 390 mobile |
| **S01** Storefront product list / discover | **UI02 authority** — `FIG-UI02-DISCOVER-{SECTION,DESKTOP,TABLET,MOBILE}` (`208:538`, `208:2002`, `224:871`, `226:1038`) | 5-column / 3-column / 2-column **masonry** from UI02 |
| **S02** Storefront product detail | **Withheld** — `FIG-STOREFRONT-PRODUCT-DETAIL-{DESKTOP,TABLET,MOBILE,MEDIA-STATE}` are `NOT_APPROVED` / `NOT_IMPLEMENTATION_AUTHORITY` | pending UI03 reconciliation |

**Interaction and accessibility obligations (all six):** single `<h1>` per page; DS
`Input` supplement carries `<label for>` + `aria-describedby` help/error wiring;
validation summaries use `role="alert"` and per-field errors; progress/saving use
`role="status"` + `aria-live="polite"`; **upload progress is determinate (%)** while
**inspection progress is indeterminate — never a fabricated percentage**; dialogs use
`role="dialog"`/`alertdialog` with `aria-modal`, focus enter → trap → return, and
Escape/backdrop close; touch targets ≥44px; status is never conveyed by colour alone
(dot + text label); no 390px horizontal overflow.

**Domain semantics carried by the design:** asset states map `UPLOADED` → *Đã tải lên /
Đang chờ xử lý*, `INSPECTING` → *Đang xử lý*, `ACCEPTED` → *Sẵn sàng*, `REJECTED` →
*Không thể sử dụng*; only `ACCEPTED` media is selectable for a product; **Save Draft and
Publish are distinct actions**; drafts are never publicly visible; **unpublish removes
public visibility and is never deletion**; Storefront renders published products only,
using approved derivatives, never a private original.

**Exclusions (must not be implemented from this package):** customer account/auth,
wishlist/cart/checkout/payment, orders/shipping, reviews, inventory reservation,
working search, recommendations, Design Studio/3D, download/export, bulk import,
roles/permissions, analytics/worker dashboards. The reused Storefront shell contains a
search field and later-phase nav items — these stay **inert** in APP2. Unpublished or
missing products reuse the approved APP1-D02 `FIG-STOREFRONT-NOTFOUND`; APP2 adds no
not-found of its own.

### 6.2.1 `APP2-D01-C1` — Storefront discovery authority correction

The Product Owner **approved and froze Admin**, **rejected** the APP2 Storefront Product
List, and **withheld** Product Detail. `APP2-D01-C1` applied that ruling.

- **`APP2-S01` reads UI02 directly.** Primary authority: `FIG-UI02-DISCOVER-*`
  (`208:538` / `208:2002` / `224:871` / `226:1038`). Supporting: UI01 `183:7`,
  `189:266`, `191:412`, plus the approved APP1-D02 shell. Reuse policy
  **`REUSE_AND_SUPPLEMENT_ONLY`** — supplements may add published-only data, product
  title and detail link, approved-derivative image rules, and product-specific
  empty/loading/media-fallback data, but must **preserve UI02's masonry architecture**.
- **Locked invariants:** image-led Pinterest-inspired discovery; masonry **5 columns
  desktop / 3 tablet / 2 mobile**; varying card heights and editorial rhythm; artwork
  dominant with minimal catalog chrome; masonry is presentation only — **DOM reading
  order stays linear**.
- **Forbidden for `APP2-S01`:** equal-height ecommerce card grid; uniform 3-column
  desktop / 2-column tablet / single-column mobile retail cards; generic marketplace
  treatment; redesigning a covered capability because a registry title lacks the words
  "Product List"; treating `DRAFT` content maturity as absence of visual authority.
- **The four rejected card-grid nodes were deleted** (`444:204`, `445:204`, `445:210`,
  `446:223`) and their registry rows removed — there is **no active handoff path** to
  them. See `FIGMA_DESIGN_INDEX.md` §4.3.1 and §4.4.
- **`APP2-S02` is blocked beyond backend.** Its four frames remain in Figma unmodified
  but are `NOT_APPROVED` / `NOT_IMPLEMENTATION_AUTHORITY`. A **separate reconciliation
  checkpoint against UI03** (`261:1290` — `262:1291` / `273:1409` / `279:1504`) is
  required before S02 may be designed or implemented. UI02 is **not** the Product Detail
  authority.

**Open items to resolve before the dependent checkpoint ships:** maximum image bytes,
original retention, non-image source inclusion, uploaded-SVG handling (all four are
deliberately absent from the frames — supported formats are shown with **no numeric size
limit**), and the **public product URL pattern** (`/san-pham/<slug>` is drawn as a
proposal only; only the API path `/api/public/products/{slug}` is locked).

## 7. Critical end-to-end journey

Admin staff uploads a valid product image, sees processing complete, creates a product draft, publishes it, verifies it on Storefront HTML and UI, unpublishes it, and verifies public access is removed. Invalid/private assets never become public.

## 8. Exit gate

- Asset and catalog APIs documented in OpenAPI/client.
- Worker failure and retry are observable.
- Draft content is never public.
- Storefront is SSR/SEO-valid.
- E2E passes with real persistence/object-storage test adapters.

## 9. Handoff

APP3 receives published products, validated assets, and publication/read-model patterns for templates and studio bootstrapping.
