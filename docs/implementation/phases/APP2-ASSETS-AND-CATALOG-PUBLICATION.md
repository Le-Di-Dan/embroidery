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
> `APP2-B01` (map now **18 checkpoints**, §6.1). `APP2-DEC-JOBS` and `APP2-D01`
> remain blocked pending required-decision review.

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
| 3 | APP2-DEC-JOBS | decision | job-runtime ADR + worker correlation seam (IMP-O003) | PRE-AUDIT |
| 4 | APP2-D01 | design | Admin asset/catalog `NEW` + Storefront list/detail `SUPPLEMENT` (one package) | PRE-AUDIT |
| 4b | APP2-I01 | foundation | Object-storage foundation — `packages/object-storage` (port + S3 adapter over `client-s3`/`lib-storage`/presigner + key helpers + contract tests), pinned MinIO Compose service + bucket bootstrap, config contract + `.env.example` keys, route-scoped nginx upload support (`client_max_body_size` + `proxy_request_buffering off`) (IMP-D028 / C1) | DEC-STORAGE |
| 5 | APP2-B01 | backend | Asset intake API — T1 streaming multipart upload, post-object `UPLOADED` insert + guarded `→INSPECTING`, + OpenAPI/client (≤5) | I01 |
| 6 | APP2-W01 | worker | Asset inspection/derivatives job | B01, DEC-JOBS |
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
