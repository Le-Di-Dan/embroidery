# APP2-B02 — Catalog Draft Backend — Completion Report

**Checkpoint:** `APP2-B02` — implement the Catalog Draft backend and generate
its OpenAPI/client contract (`APP2-C02` merged in, so B02 owns both).
**Verdict:** `PASS`
**Status:** `COMPLETE — DELIVERED_FOR_REVIEW`
**Date:** 2026-07-31
**Implementation commit (A):** `14c80f06976c6f01344279e284fafeffc9a8ddda`

---

## A. Preflight and accepted chains, including B02-G01

`APP2_B02_PREFLIGHT = PASS`.

| Requirement | Observed |
|---|---|
| Branch | `production` |
| Entry `HEAD` | `fffa49581fde928e0453261630a96be021b78fd5` — `docs(app2): record B02 field-gate evidence`, the exact `APP2-B02-G01` evidence Commit B read from Git |
| Tracked / staged change | none |
| B02 implementation commit | none present |
| `pnpm quality` | `EXIT=0` |
| `pnpm check:openapi` | up to date (`e19c2f76…`) |
| `pnpm check:api-client` | up to date (`55de1cc1…`) |
| `pnpm check:figma-design-index` | 70 registry IDs |
| `node --test tools/check-figma-design-index.test.mjs` | 19 pass / 0 fail |
| `pnpm db:check:manifest` | all checks passed |
| `git diff --check` | clean |

**Excluded user-owned evidence.** `evidences/` (three screenshots from the A01
live test) stayed untracked and untouched; every `git add` used
`-- ':!evidences'`.

**Accepted chains verified from Git:** `APP2-B01` `a1cb712`+`ac81a2a`;
`APP2-DB01` `fc7f0a1`+`cdd7b86`; `APP2-I03` `6252e4d`+`ae5e65a`; `APP2-W01`
`7f01f94`+`6982e86`; `APP2-D02` `59be440`+`f3619db`; `APP2-A01`
`58164122df015b08393818db9a8309bc5863a851`+`6f12c4d`; `APP2-A01-C1`
`77691abcadae042646416f1f6171f107112fceee`+`bb4ebb9`; **`APP2-B02-G01`**
`356d6e771602b3a4f76b6ca54c2f2ea3449f3ded`+`fffa4958`.

---

## B. Canonical APP2 plan reconciliation

The plan says `APP2-B02 = Catalog draft backend + OpenAPI/client (≤5)` and that
`APP2-C02` is merged in. Delivered: exactly five operations, both the decorated
NestJS contract and the implementation, serving `APP2-A02` (list) and
`APP2-A03` (form/detail). Phase order `A01 → B02 → A02 → A03 → B03` is intact.

Thumbnail delivery was **not** substituted for any of this scope
(`FU-APP2-THUMBNAIL-01`, §P).

---

## C. Schema and domain audit

Recorded from source and the live catalog, before any edit.

| Fact | Value |
|---|---|
| Tables | `products` (TBL-012), `product_media` (TBL-017), `categories` (TBL-011) |
| Lifecycle | `PRODUCT_STATES = DRAFT / PUBLISHED / ARCHIVED` (`ck_products__status_allowed`) |
| Canonical DRAFT | `status = 'DRAFT'`, already written by DB7's `drizzle-product.repository.ts` |
| Archive | `status = 'ARCHIVED'` + `archived_at` instant; DB7 stamps it on transition |
| NOT NULL, no default | `category_id`, `name`, `slug`, `base_price_amount`, `currency_code`, `status`, `is_display_out_of_stock`, `display_order`, `is_indexable` |
| Category relationship | `fk_products__category_id` (`restrict`); `categories` is **flat**, no parent column |
| Slug / code | `products.slug` `text`, `uq_products__slug` global across all states; no product code column exists |
| Product media | `(product_id, asset_id, role)` unique; `role ∈ GALLERY/THUMBNAIL/DETAIL`, `display_order` — both NOT NULL, no default |
| Partial uniqueness | none on `products`; `ix_products__category_display_id__published` is a partial **index** on `status='PUBLISHED'` (Q-01 scope) |
| Concurrency column | **none** — no `version`; `updated_at` is the only token |
| Soft delete | none; archive is the lifecycle state, not a delete flag |
| DB7 seam already delivered | `ProductRepository.create/addVariant/addSku/addSide/addArea/attachMedia/changeStatus/findById/findBySlug/loadStructure`; `CategoryRepository.create/changeStatus/findBySlug/findById` |
| Admin guard | `AuthenticatedAdminGuard` + `StaffOriginGuard` on state-changing routes (ADR-APP1-001 §6) |
| Envelope | `ApiSuccessCode` + platform interceptor; errors through the canonical filter |
| Cursor convention | `buildPage` / `decodeCursor` / `resolveLimit` from `@embroidery/persistence` (default 20, max 100) |
| Operation IDs | `<domainKey>_<methodKey>` from the controller class and method (APP0-B01) |

Also inspected as supporting evidence (not as an approval gate for backend work):
the Product Draft nodes `434:20`, `436:37`, `436:140`, `438:90`, `437:73`, the
Catalog list nodes `439:100`, `440:102`, `440:191` and the DS input `424:35`,
through the `APP2-D01` completion report — the Figma MCP server is not connected
in this session, so the live nodes could not be reopened. Nothing in B02 depends
on them: the field set is grounded in the schema and in IMP-D032.

---

## D. Draft field matrix

| Field | Column / table | Authority | Required on create? | Editable in DRAFT? | List filter/sort? | In detail? | Publication-only? | Null / empty semantics |
|---|---|---|---|---|---|---|---|---|
| `productId` | `products.id` | UUIDv7, server | server-generated | no | sort tie-breaker | yes | no | never null |
| `categorySlug` | `categories.slug` via `products.category_id` | IMP-D032 | **yes** (closed enum) | yes | **filter** | as `category.slug` | no | never null |
| `category.name` | — | IMP-D032 taxonomy | derived | — | no | yes | no | label only, never stored by B02 |
| `name` | `products.name` | schema NOT NULL | **yes** | yes | no | yes | no | trimmed, non-empty |
| `slug` | `products.slug` | IMP-D032 | derived from name | **no — immutable** | no | yes | no | never null |
| `description` | `products.description` | schema nullable | no | yes | no | yes | no | `null` clears; `""` normalised to absent |
| `basePriceAmount` | `products.base_price_amount` | IMP-D032 sentinel `0` | server default | yes | no | yes | B03 requires `> 0` | whole đồng string |
| `currencyCode` | `products.currency_code` | `ck_products__currency_allowed` | server `VND` | no | no | yes | no | never null |
| `status` | `products.status` | LC-04 | server `DRAFT` | via archive only | **filter** | yes | no | never null |
| `displayOrder` | `products.display_order` | IMP-D032 sentinel `0` | server default | **no in B02** | no | **no** | B03/B04 own public order | never null |
| `archivedAt` | `products.archived_at` | LC-04 | no | via archive only | no | yes, when archived | no | absent unless archived |
| `createdAt` / `updatedAt` | `products.*` | schema | server | no | `created_at DESC` sort | yes | no | never null |
| `media[]` | `product_media` | IMP-D032 | no (empty allowed) | yes (complete replacement) | no | yes, ordered | no | `[]` clears links only |
| `media[].role` | `product_media.role` | IMP-D032 | derived from position | derived | no | yes | no | `THUMBNAIL` first, else `GALLERY` |
| `is_display_out_of_stock` | `products.*` | DB7 create | server `false` | **no** | no | **no** | availability, not draft | not exposed |
| `is_indexable`, `seo_title`, `seo_description` | `products.*` | DB4 | server / untouched | **no** | no | **no** | **yes — B03/B04** | not exposed |

Nothing outside this matrix entered the contract: no inventory, stock,
reservation, shipping, reviews, discount, SEO/publication field, generated copy,
fake category, fake SKU/code or fake slug. `BLOCKED_BY_ACCEPTED_GATE_CONTRADICTION`
did not arise — every G01 decision was implementable exactly as written.

---

## E. The five operation contracts

**`GET /api/admin/products` — `adminProduct_list`.** Keyset only: cursor,
`limit` (default 20, max 100, bounded in the DTO), ordering
`created_at DESC, id DESC` with the id tie-breaker DB5 requires. `hasNext` +
`nextCursor`; no offset, page number or total anywhere. Filters are exactly the
two the source proves: `status` (all three lifecycle values) and `categorySlug`
(closed enum, resolved to an id in the query). **No search filter was invented** —
there is no canonical text access path in DB5 for products, and a `search`
parameter is rejected as unknown. Summary items carry the safe fields A02 needs
plus a `primaryMedia` identity built only from `assetId`, `mediaType`,
`byteSize`, `status`, `createdAt`.

**Default filter behaviour, recorded exactly:** with no `status` the page
carries drafts, published and archived products alike. Silently hiding archived
rows would make an archive filter untestable and the list a lie about the
catalog.

**`GET /api/admin/products/:productId` — `adminProduct_detail`.** Identity, the
immutable slug, status, `{ slug, name }` category, every editable draft field,
price + `VND`, `updatedAt` token, timestamps, `archivedAt` when archived, and
the ordered media selection with safe Asset metadata.

**`POST /api/admin/products` — `adminProduct_create`.** 201. Strict body:
`categorySlug`, `name`, optional `description`. The client supplies no slug,
status, currency, price or display order. Category resolution and slug
derivation both happen **inside** the transaction. Created without media —
`PATCH` owns complete ordered replacement, and accepting it in two places would
mean two code paths that must agree about ordering forever. No publication row
or outbox event is written (asserted). No second idempotency model was invented:
no platform authority requires one for product create.

**`PATCH /api/admin/products/:productId` — `adminProduct_update`.** Strict,
non-empty, `expectedUpdatedAt` mandatory. Patches `name`, `description`
(`null` clears, `""` normalised to a clear), `basePriceAmount`, `categorySlug`
and `mediaAssetIds`. Renaming never changes the slug. Money is a decimal
**string**; a JSON number is rejected.

**`POST /api/admin/products/:productId/archive` — `adminProduct_archive`.** 200,
`expectedUpdatedAt` required, guarded `DRAFT → ARCHIVED` stamping `archived_at`.

---

## F. Product lifecycle and archive

Archive is proven, not asserted: the transition is guarded on both the source
state and the token; the archived product stays readable through detail **and**
through `?status=ARCHIVED`; its media links, the referenced Assets and their
derivatives all survive (row counts checked after the call); no publication
state is touched.

`PUBLISHED` is deliberately **not** archivable in B02 — withdrawing a published
product from the Storefront is unpublication, which `APP2-B03` owns — so it
returns `PRODUCT_ARCHIVE_NOT_ALLOWED` (409) rather than half-performing it.
Replay follows the same lifecycle convention: a second archive is a safe
conflict, not a silent success.

---

## G. Ownership and concurrency

**Ownership, recorded honestly.** `products` carries **no** owner, tenant, store
or `created_by_admin_id` column — asserted directly against
`information_schema` in the integration suite — because REQ-IDN-001 defines
exactly one Admin actor. The canonical Admin scope is therefore the whole
catalog, and the control that matters is authentication: every operation sits
behind `AuthenticatedAdminGuard`, and all five answer 401 without a live session
(asserted). No new ownership model or permission system was added, and no
operation authorizes on a product id alone — the guard runs first, always.

For the same reason **no audit actor is recorded on the row**: the existing
repository/domain contract has nowhere to put one. That is a schema fact, not an
omission this checkpoint chose.

**Concurrency.** No `version` column exists, so `updated_at` is the token, as
G01 accepted. `updatedAt` is exposed on create, detail, list, update and
archive; `PATCH` and archive require `expectedUpdatedAt`; the guard carries
identity + allowed state + token in **one** statement, and the repository
reports which of the three missed rather than re-reading outside the guard.
A stale token is `PRODUCT_VERSION_CONFLICT` (409) and the newer value is left
intact (asserted).

**One implementation detail worth the reviewer's attention.** The comparison
truncates to milliseconds:

```sql
date_trunc('milliseconds', products.updated_at) = $expected
```

`timestamptz` keeps microseconds, but the token a client receives is an ISO
string with milliseconds — so a caller can only ever echo a truncated value.
Comparing the raw column made **every** guarded write fail against a row whose
`updated_at` came from the column default; that is how the defect was found, and
the fix compares exactly what the client was given. `create` also writes
`created_at`/`updated_at` explicitly for the same reason.

---

## H. Ordered media behaviour

Complete ordered replacement, atomic with the field update, all-or-nothing.
Roles come from position and never from the client: first Asset → the single
`THUMBNAIL` at position 0, the rest → `GALLERY` at their zero-based request
position. `DETAIL` is never written (asserted against `select distinct role`).
An empty selection is allowed. Asset ids must be distinct.

Every selected Asset is read through the **Asset module's public repository
port** — never its tables — and must be `CATALOG_MEDIA` +
`PRODUCTION_SENSITIVE` + `ACCEPTED`. The lane check is a *scoped read*, so an
Asset outside it is reported as `PRODUCT_MEDIA_ASSET_NOT_FOUND` exactly as B01
does: this endpoint cannot be used to probe whether a customer's private artwork
exists. An accepted-lane Asset that inspection has not finished is a different,
retryable situation (`PRODUCT_MEDIA_ASSET_UNAVAILABLE`, 409).

Validation runs **before** the guarded write, so one invalid item costs nothing
and leaves the previous selection exactly as it was — asserted by checking that
neither the field nor the links nor `updatedAt` moved after a rejected call.
Removing media deletes links only; the Asset row, its status and its storage
facts are untouched (asserted). No derivative readiness requirement was added:
current domain authority does not require one for draft association, and adding
one merely because W01 produces derivatives would be a hidden new rule. The
selection is bounded at 12 items so the per-Asset validation loop is bounded too.

---

## I. Persistence and transactions

`AdminProductController` (HTTP only) → `ProductDraftService` /
`ProductDraftQuery` (orchestration and lifecycle) → `ProductDraftRepository`
(persistence only). Each write is one `TransactionManager.runInTransaction`; the
repository opens none of its own (DEC-DB7-006). No object-storage or network
call happens inside a transaction. No generic CRUD generator.

A **new** `ProductDraftRepository` port carries the operations DB7 does not
have — keyset list, guarded update, guarded archive, ordered media replacement,
media read. This is not a renamed duplicate: DB7's `ProductRepository` is the
AGG-06 aggregate contract that Design, Approval and Production already depend on
through the placement hierarchy, and widening it would make each of them
recompile against a surface they do not use. Category lookup still goes through
the existing `CategoryRepository.findBySlug`.

`CatalogDraftModule` is separate from the DB7 `CatalogModule` for the same
reason `AssetIntakeModule` is separate from `AssetModule`: a suite that only
exercises the repositories should not have to stand up authentication and a
controller. Media reads a page's Assets in one round trip (`findMediaFor`), so
the list has no N+1.

---

## J. Errors and security

| Code | Status |
|---|---|
| `PRODUCT_NOT_FOUND` | 404 |
| `PRODUCT_DRAFT_INVALID` | 400 |
| `PRODUCT_CATEGORY_INVALID` | 400 |
| `PRODUCT_CURSOR_INVALID` | 400 |
| `PRODUCT_MEDIA_DUPLICATE` | 400 |
| `PRODUCT_MEDIA_ASSET_NOT_FOUND` | 400 |
| `PRODUCT_NOT_EDITABLE` | 409 |
| `PRODUCT_VERSION_CONFLICT` | 409 |
| `PRODUCT_SLUG_CONFLICT` | 409 |
| `PRODUCT_MEDIA_ASSET_UNAVAILABLE` | 409 |
| `PRODUCT_ARCHIVE_NOT_ALLOWED` | 409 |

All carried as transport-free data and translated at exactly one point in the
controller. Messages are written once and never interpolated at a call site; a
test scans every message for SQL keywords, constraint names, table names, actor
identifiers, storage vocabulary and stack markers. Global 5xx wire behaviour is
unchanged — anything unrecognised propagates to the platform filter, which is
the correct treatment for an unreviewed failure.

The projection is the other half of the boundary: a serialized detail response
is scanned for `storageKey`, `bucket`, `minio`, `checksum`, `sha256`,
`derivative`, `inspection`, `categoryId`, `isIndexable`, `seoTitle`,
`displayOrder` and any URL — all absent.

---

## K. Unit tests

**53 unit tests, no Docker.**

| Suite | Covers |
|---|---|
| `domain/product-slug.spec.ts` (13) | every frozen IMP-D032 vector, the `đ`-before-NFD rule, ASCII kebab-case, the 80-char cap without a trailing separator, determinism, the id-derived collision fallback and its cap behaviour |
| `presentation/schemas/admin-product.request.spec.ts` (14) | strict create/patch/archive/list schemas, every server-owned field rejected, non-empty name, mandatory token, "at least one change", explicit `null` description, money as a string with fractional/negative/separated/oversized rejected, ordered and empty media, bounded limit, all three status filters, unknown query parameters (`offset`, `search`) rejected, non-UUID path rejected |
| `application/product-projection.spec.ts` (11) | category by slug with the taxonomy label, no category id, money as a string, ISO token, primary media, ordered media, **no URL**, no storage/checksum/SEO/`displayOrder` leak, `archivedAt` only when archived, absent description |
| `domain/product-draft.errors.spec.ts` (15) | every code's exact status and payload shape, message redaction, error-type narrowing, and the editable/archivable lifecycle predicates |

---

## L. PostgreSQL integration

**21 tests, all 33 migrations, disposable database, canonical repositories and
transactions, synthetic catalog Assets.** Every case in §17 is covered:

| §17 | Where |
|---|---|
| 1–3 create DRAFT / only allowed fields / no publication effect | "creates the canonical DRAFT with every locked default", "creates no publication or outbox effect" |
| 4–8 list, cursor continuation, stable order, status filter, invalid cursor | "lists a created draft…", "filters by lifecycle status and by category slug", "rejects a malformed cursor…" |
| 9–10 detail, safe 404 | "returns one draft by id and a safe not-found…" |
| 11–14 one field, several fields, unknown field, empty patch | "updates one editable field…", "updates several editable fields atomically", "rejects an unknown patch field and an empty patch at the contract" |
| 15 non-editable state | "refuses to edit a product that is not a DRAFT" |
| 16 concurrency conflict | "rejects a stale concurrency token without overwriting the newer value" |
| 17–21 ordered replacement, duplicate, missing, non-ACCEPTED, foreign lane | "replaces the media selection in request order…", "rejects a duplicate, missing, unaccepted or foreign asset" |
| 22 one invalid item rolls back all | "rolls the whole update back when one media item is invalid" |
| 23 removal keeps Asset facts | "removes only the link when media is cleared, never the asset" |
| 24–26 archive succeeds / conflicts / deletes nothing | "archives a draft, keeps everything, and refuses a second archive", "reports an unknown product and a stale token distinctly on archive" |
| 27 scope | "scopes reads to the single canonical Admin catalog" (§G) |
| 28 rollback leaves nothing partial | "leaves no partial mutation when the transaction rolls back" |
| 29 guards use database truth | "guards on database truth, not on a value the caller supplied" — all three miss reasons |
| 30 zero residue | disposable name asserted; final sweep found 0 `embroidery_db7_*` databases |

Real constraints did their job during development: `ck_assets__kind_allowed`
rejected an invented `DESIGN_ARTWORK` seed, which is exactly why the foreign-lane
case now uses a real `CUSTOMER_UPLOAD` + `CUSTOMER_PRIVATE` asset.

---

## M. API and gateway tests

**14 API tests** on the canonical Nest harness: all five operations; 401 for
every one of them without a session; the canonical envelope with `requestId` and
`timestamp`; strict path, query and body validation; 201 on create; 200/404 on
detail; 200/409 on patch; archive success and conflict; safe media metadata with
**no `thumbnailUrl`** and no storage or internal field; and no public or
Storefront product route (`/api/products`, `/api/public/products`,
`/api/admin/categories` all 404).

**6 gateway tests** (`tools/nginx-catalog-draft-seam.test.mjs`, Docker-free):
no product-specific Nginx location exists in any template; the streaming upload
seam still applies to exactly one location; the Admin host proxies `/api/` and
preserves `X-Request-ID`; the gateway exposes no object storage; and it adds no
public catalog route.

**One finding recorded rather than papered over.** The Storefront host also
proxies `/api/` to the API, so an Admin product URL is *reachable* there. The
control is the session cookie, which is host-only (`__Host-adm_session`,
ADR-APP1-001 §5) — a Storefront page never carries it and the API answers 401.
The test asserts that arrangement explicitly instead of claiming a host
isolation the gateway does not implement.

---

## N. OpenAPI and client artifacts

| Artifact | Before | After |
|---|---|---|
| OpenAPI SHA-256 | `e19c2f76a800b9382d3e013e34759df5b9cd9090de021b5f3b2be7a5cfbf5c8f` | `b789cc9983dc583e9ee59469d00885a74198c8f8997f70436273d1d856ef7e8c` |
| API-client tree SHA-256 | `55de1cc158cf5ab112dae8e8c63f45fe5fee9de1d36aedbb222f0fcec0a6216b` | `66d1c991c6b3846321def3d8d70708f1409593a562599321394e51ae3abb52c3` |
| Paths | 7 | 10 |
| Operations | 8 | 13 |

Exactly five new operation IDs: `adminProduct_list`, `adminProduct_create`,
`adminProduct_detail`, `adminProduct_update`, `adminProduct_archive`.

Changed generated files: `packages/contracts/openapi/openapi.generated.json`
(+1119), `packages/api-client/src/generated/embroidery-api.ts` (+103),
`packages/api-client/src/generated/embroidery-api.schemas.ts` (+186). **All
additions, zero deletions — no unrelated contract churn.** Documented per
operation: cookie auth, path/query parameters, the cursor response, strict DTOs,
status and error responses, the `expectedUpdatedAt` conflict behaviour and the
ordered media request/response. No thumbnail operation or field was added.

---

## O. Migration, dependency and artifact boundaries

| Artifact | State |
|---|---|
| Database schema / migrations / fingerprint | **unchanged** — 33 migrations, 78 tables, 833 columns, 190 CHECKs, `82864268…`; `pnpm db:check:manifest` passes |
| Figma registry | **unchanged** — 70 IDs |
| `apps/admin`, `apps/storefront` | untouched |
| `apps/worker`, `packages/object-storage` | untouched |
| Nginx / Compose | untouched (§M proves the absence) |
| Asset-intake behaviour | untouched |
| Dependencies / lockfile | **none added** |

**Three edits outside `apps/api/src/modules/catalog/**` are disclosed here
rather than buried:**

1. `apps/api/src/bootstrap/app.module.ts` — registers `CatalogDraftModule`;
   without it the operations do not exist.
2. `packages/database/src/index.ts` (+31) — re-exports the IMP-D032 category
   taxonomy, draft sentinels and media-role constants as **values**. They were
   only reachable through the `schema` namespace, which `BACKEND_CONVENTIONS`
   §3 keeps out of application code, and re-declaring them in the backend would
   create exactly the fork IMP-D032 warns about. This is an export-surface
   change: **no schema, table, column or migration is touched**.
3. `tools/check-file-size.mjs` (+5) and
   `apps/api/src/openapi/build-openapi-document.spec.ts` — two baselines that
   B02 legitimately moves; see §R.

---

## P. Thumbnail follow-up routing

```text
FU-APP2-THUMBNAIL-01 = ROUTED_TO_APP2-T01
                       NONBLOCKING_FOR_APP2-B02/A02/A03
APP2-T01             = ROUTED — NOT PLANNED_FOR_EXECUTION
```

W01 already creates private derivatives and A01 honestly shows placeholders;
authenticated delivery and placeholder replacement are a separate supplement.
B02 added no thumbnail endpoint, no `thumbnailUrl` on any DTO, no A01 change, no
object-storage change, no MinIO exposure and no presigning. `APP2-T01` is **not**
a predecessor of B02, A02 or A03, was not implemented, and is not marked
complete.

---

## Q. Commit A evidence

```text
14c80f06976c6f01344279e284fafeffc9a8ddda
feat(api): add catalog draft management
30 files changed, 4935 insertions(+), 4 deletions(-)
```

New — `apps/api/src/modules/catalog/`: `catalog-draft.module.ts`;
`domain/{product-draft.errors, product-draft.policy, product-slug}.ts`;
`domain/repositories/product-draft.repository.ts`;
`application/{category-resolver.service, product-draft.query,
product-draft.service, product-media-selection.service, product-projection}.ts`;
`infrastructure/persistence/{drizzle-product-draft.repository,
product-draft-row.mapper}.ts`;
`presentation/admin-product.controller.ts`;
`presentation/schemas/{admin-product.request, admin-product.response}.ts`.

New tests: `domain/{product-slug, product-draft.errors}.spec.ts`;
`application/product-projection.spec.ts`;
`presentation/schemas/admin-product.request.spec.ts`;
`apps/api/test/integration/{catalog-draft, catalog-draft-api}.integration.spec.ts`;
`tools/nginx-catalog-draft-seam.test.mjs`.

Modified: `apps/api/src/bootstrap/app.module.ts`;
`apps/api/src/openapi/build-openapi-document.spec.ts`;
`packages/database/src/index.ts`; `tools/check-file-size.mjs`; `package.json`
(three scripts); and the three generated artifacts.

---

## R. Validation matrix

| Command | Result |
|---|---|
| `pnpm --filter @embroidery/persistence lint` | clean |
| `pnpm --filter @embroidery/persistence typecheck` | clean |
| `pnpm --filter @embroidery/persistence test` | 112 passed / 9 suites |
| `pnpm --filter @embroidery/api lint` | clean |
| `pnpm --filter @embroidery/api typecheck` | clean |
| `pnpm --filter @embroidery/api test` | **1232 passed / 98 suites** |
| `pnpm --filter @embroidery/api build` | clean |
| `pnpm test:catalog-draft:integration` | 21 passed |
| `pnpm test:catalog-draft:api` | 14 passed |
| `pnpm test:catalog-draft:gateway` | 6 passed / 0 failed |
| `pnpm openapi:generate` | 10 paths, 13 operations, 22 schemas |
| `pnpm check:openapi` | up to date |
| `pnpm api-client:generate` | 2 files, tree hash `66d1c991…` |
| `pnpm check:api-client` | up to date |
| `pnpm check:frontend-boundaries` | clean |
| `pnpm check:spike-boundaries` | clean |
| `pnpm check:e2e` | clean, 32 tests collect |
| `pnpm check:figma-design-index` | 70 registry IDs |
| `node --test tools/check-figma-design-index.test.mjs` | 19 pass / 0 fail |
| `pnpm db:check:manifest` | all checks passed |
| `node tools/check-file-size.mjs` | passed |
| `pnpm quality` | **`EXIT=0`** |
| `git diff --check` | clean |

**Scripts created (§24 "create only missing B02 scripts"):**
`test:catalog-draft:integration`, `test:catalog-draft:api`,
`test:catalog-draft:gateway`. No substitution was needed — every other listed
command exists.

**Two baselines updated, and why they are not weakened tests.**
`build-openapi-document.spec.ts` pinned 7 paths / 8 operations; B02 adds 3 paths
and 5 operations, so it now pins **10 / 13** and additionally asserts all five
new operation IDs — a stricter test than before. `tools/check-file-size.mjs`
gained `generated` to its excluded-directory set: the Orval output crossed the
400-line hard limit, and it is regenerated from the OpenAPI artifact, guarded by
its own tree-hash drift gate, never hand-edited and impossible to split by
responsibility — exactly the case CLAUDE.md §6 provides for, alongside the
`migrations` and `__snapshots__` entries already there.

**Three real defects found by these tests and fixed, not worked around:**

1. **A 500 hiding in validation.** Zod runs refinements after a failed check, so
   `BigInt('250000.50')` threw a raw `SyntaxError` that would have escaped as a
   server fault instead of a 400. The refinement now re-tests the pattern.
2. **The concurrency guard never matched** (§G) — microsecond storage versus a
   millisecond token.
3. **`0.00` on the wire.** `numeric(14,2)` returns `0.00`, but VND has no minor
   unit and `ck_products__currency_scale` guarantees a whole number, so the
   projection renders whole đồng and only strips a scale that is genuinely all
   zeros.

**Environment.** Zero disposable database residue (final sweep: 0
`embroidery_db7_*`). No container was started or stopped; only the pre-existing
dev stack runs.

---

## S. Acceptance matrix

All 52 criteria are met. Those carrying a note:

| # | Criterion | Note |
|---|---|---|
| 6 | representability proven against all 33 migrations | §C; no migration needed |
| 9 | every G01 decision implemented exactly | §D/§E/§H; no contradiction arose |
| 12–13 | filters source-proven, no fake search | only `status` and `categorySlug`; `search` is rejected as unknown (§E) |
| 19–20 | canonical concurrency and safe 409 | `updated_at`, ms-truncated comparison (§G) |
| 30 | ownership/scope enforced | authentication is the scope; there is no ownership column (§G) |
| 37 | exactly five new operations | §N |
| 39–43 | frontend/worker/storage/DB/Figma/dependency untouched | §O, with three disclosed edits |

---

## T. A02/A03 handoff and scope closure

**A02 (product list)** can rely on: keyset paging with `hasNext`/`nextCursor`
and no total; `status` and `categorySlug` filters, with archived rows included
by default; safe summary fields plus a `primaryMedia` identity — and **no image
URL**, so the A01 placeholder treatment carries over unchanged.

**A03 (form/detail)** can rely on: a closed four-value `categorySlug` enum with
Vietnamese labels available client-side; a server-owned immutable slug; whole-đồng
money as a string, where `0` on a DRAFT means **`Chưa đặt giá`** and not a real
price; `updatedAt` as the token to echo as `expectedUpdatedAt`, with 409 to
handle; and complete ordered media replacement where position decides the role.

Not started and out of scope, as instructed: A02, A03, publication, public
catalog, Storefront, thumbnail delivery, product deletion, any sixth operation.

```text
APP2-B02 = COMPLETE — DELIVERED_FOR_REVIEW
APP2-A02 = READY — NOT STARTED
APP2-A03 = READY — NOT STARTED
APP2-B03 = BLOCKED_BY_APP2-B02
APP2-T01 = ROUTED — NOT PLANNED_FOR_EXECUTION
```
