# APP12-C01 — Dynamic Public Category Contract and Inventory Read

> ## ⚠ CORRECTION NOTICE — superseded in part by `APP12-C01-C1`
>
> **Verdict revised:** `APP12-C01 = COMPLETE_AFTER_C1` · `CORRECTION_USED = 1 / 1` · no C2.
>
> The Product Owner inspected this delivery and **rejected** it. The contract half
> below is accepted and stands. What was rejected is §N — the decision to keep the
> four historical slugs compiled into both applications behind two
> `legacy-category-slugs.ts` shims with removal deferred to `APP12-C03`/`APP12-A01`.
>
> A dynamic OpenAPI contract in front of a static frontend taxonomy is not a
> dynamic implementation. The system cannot claim `CATEGORY_MODEL = DYNAMIC` while
> production source carries a second compiled-in category inventory. The defect is
> architectural, not cosmetic.
>
> **These specific claims in this report are superseded and must not be relied on:**
>
> | Claim in this report | Superseded by `APP12-C01-C1` |
> |---|---|
> | "No frontend behaviour changed" | Frontend behaviour **had to** change; leaving it unchanged was the defect. |
> | "Two temporary modules … removal owner `APP12-C03` / `APP12-A01`" | Both modules **deleted**. A removal-owner comment does not make a runtime taxonomy acceptable. |
> | "The same four Discover chips in the same order with the same labels" | Discover renders **every** published category from `GET /api/public/categories`, labelled by the row's `name`, ordered by `display_order`. |
> | "The same four Admin category options and filter chips" | Both are database-backed, at runtime. |
> | "The same static sitemap category routes" | Sitemap category URLs are composed from the live inventory, filtered to `isIndexable = true`. |
> | "The same `UNKNOWN` fallback that already renders today for `ao-thun` products" | Removed. A category's name is data; the Admin renders `category.name`. Mapping a real category to `Chưa xác định` was itself a defect. |
> | "The same breadcrumb rule (a Product outside the four still drops its category crumb)" | The breadcrumb resolves for **any** well-formed category slug; only a malformed slug drops the crumb. |
> | §S "Storefront half remains open, owner `APP12-C03`" | The Storefront half is **closed by `APP12-C01-C1`**. `APP12-C03` remains open as the final dynamic-category SEO/route-authority **verification** checkpoint. |
>
> **New authority:** `CATEGORY_VALUE_SOURCE_OF_TRUTH = DATABASE` (`IMP-D062`).
> Correction report:
> [`APP12-C01-C1-COMPLETION-REPORT.md`](./APP12-C01-C1-COMPLETION-REPORT.md).
>
> Everything below is the original record and is **not** rewritten: the contract
> delta, the `publicCategory_list` operation, the visibility semantics, the slug
> authority, the release-gate integration and the validation evidence all stand as
> delivered.

**Phase:** APP12 — Hardening, UAT and Production Readiness
**Type:** Backend / OpenAPI contract · public category read · generated client
**Date:** 2026-09-01

---

## A. Verdict

```text
APP12-C01 = COMPLETE_AFTER_C1   (revised; was COMPLETE — see the correction notice above)
CORRECTION_USED = 1 / 1          (APP12-C01-C1; no C2)
NEXT_CHECKPOINT = APP12-C02
```

Entry authority consumed unchanged: `APP12-P01`, `APP12-G01`, `APP12-G02`
(`COMPLETE_AFTER_C1`), `APP12-D01`, `APP12-DB01` — none reopened.
`ROADMAP_STATUS = LOCKED`, `CHECKPOINTS = 38`.

---

## B. Preflight category-contract blast radius

Measured mechanically, not estimated. Every seam that named the closed APP2
taxonomy:

### B.1 The source of the enum

| Location | Role |
|---|---|
| `packages/database/src/schema/catalog/categories.ts` | `APP2_CATEGORY_SLUGS` / `APP2_CATEGORY_TAXONOMY` — the single source migration 0033 provisioned from |
| `apps/api/src/modules/catalog/domain/product-draft.policy.ts` | re-exports it into the Catalog module |

### B.2 Contract seams that published it (all four widened)

| Seam | Was | Now |
|---|---|---|
| `PublicCategoryResponse.slug` | `enum: [thu-bong, khan, quan-ao, khac]` | pattern-validated string |
| `AdminProductCategoryResponse.slug` | same enum | pattern-validated string |
| `GET /api/public/products?categorySlug` | `z.enum(APP2_CATEGORY_SLUGS)` + `@ApiQuery enum` | pattern-validated string |
| `GET /api/admin/products?categorySlug` | same | pattern-validated string |
| `CreateProductBody.categorySlug` | `z.enum(APP2_CATEGORY_SLUGS)` | pattern-validated string |
| `UpdateProductBody.categorySlug` | `z.enum(APP2_CATEGORY_SLUGS).optional()` | pattern-validated string |

The two Admin **write bodies** are included deliberately. Leaving them enum-typed
would have kept an operator unable to file a Product into a category the store
actually holds — the ceiling `IMP-D059` removed, still standing in the one place
it bites hardest.

### B.3 Runtime resolution

`apps/api/src/modules/catalog/application/category-resolver.service.ts` gated on
enum membership *before* the database lookup. That check is now a **shape**
check; the row lookup and `PRODUCT_CATEGORY_INVALID` are unchanged.

### B.4 Generated-client consumers (the compile-time blast radius)

Four generated enums existed and all four are now gone:
`PublicProductListCategorySlug`, `AdminProductListCategorySlug`,
`CreateProductBodyCategorySlug`, `UpdateProductBodyCategorySlug`.

| Consumer | App | Disposition |
|---|---|---|
| `product-discovery/model/discover-categories.ts` | storefront | shim (`APP12-C03`) |
| `product-detail/model/product-breadcrumb.ts` | storefront | comment only — already read the feature list, not the enum |
| `storefront-seo/model/public-static-routes.ts` | storefront | unchanged — reads `DISCOVER_CATEGORY_SLUGS` |
| `products/model/product-category-options.ts` | admin | shim (`APP12-A01`) |
| `products/model/product-category.ts` | admin | shim (`APP12-A01`) |
| `products/model/product-filters.ts` | admin | shim (`APP12-A01`) |
| `packages/api-client/src/catalog.ts` | client boundary | two value re-exports removed, one operation added |
| `packages/api-client/src/public-api.smoke.test.ts` | client | assertion directly invalidated — repaired |
| `apps/storefront/test/unit/product-breadcrumb-model.test.ts` | storefront | imported the enum — repaired to read the feature list |

### B.5 Persistence, checked and left alone

`categories` (TBL-011) already carries `status`, `archived_at`, `is_indexable`,
`display_order`, `name` and a globally unique `slug` (CST-011 / IDX-010). The
dynamic model needed **nothing** the schema did not already have — which is why
this checkpoint adds no migration.

### B.6 Not in scope, confirmed still stale

`tools/check-route-authority.mjs`-class Storefront route assumptions and the
static sitemap category routes still hard-code four slugs. Owner remains
`APP12-C03`; not touched here.

---

## C. Dynamic slug authority

```text
CATEGORY_SLUG_PATTERN   = ^[a-z0-9]+(?:-[a-z0-9]+)*$
CATEGORY_SLUG_MAX_LENGTH = 80
```

Declared once, in `apps/api/src/modules/catalog/domain/category-slug.ts`.

**This refines the expression written in `IMP-D059` §3 and is reported, not
applied silently** (`CLAUDE.md` §2). That decision wrote
`CATEGORY_SLUG_RULE = ^[a-z0-9-]+$` while also requiring the rule be "consistent
with existing public route authority and the repository ASCII slug derivation".
Those two clauses are not the same expression. The repository has no shared slug
validator — each bounded context declares its own — and all of them are
byte-for-byte `^[a-z0-9]+(?:-[a-z0-9]+)*$`:

- `public-product.request.ts` (`PUBLIC_PRODUCT_SLUG_PATTERN`)
- `public-product-media.request.ts`, `public-side-background.request.ts`
- `public-design-template.policy.ts`
- `admin-gallery-entry.policy.ts` / `public-gallery-entry.policy.ts`

Prompt §3 permits "the exact repository-equivalent ASCII slug rule if a canonical
shared validator already exists", so the repository rule was implemented. The
refinement is **strictly narrower on exactly the values the store can never
mint**: a leading hyphen, a trailing hyphen and a doubled hyphen (`-ao`, `ao-`,
`ao--thun`). Every value `IMP-D059` intended remains valid, `ao-thun` included,
and `deriveProductSlugBase` cannot produce a rejected value. Recorded as
`IMP-D061` §1 for Product Owner visibility.

---

## D. Public category inventory operation

```text
operationId = publicCategory_list
path        = GET /api/public/categories
module      = CatalogPublicModule (CTX-CAT)
delta       = +1 public HTTP operation (hard max 1)
```

| Property | Value |
|---|---|
| Authentication | none — no guard decorator, `security` absent from the artifact |
| Parameters | none (only the platform `X-Request-ID` header) |
| Pagination | none — inventory, not a feed |
| Cache | `Cache-Control: no-store` |
| Envelope code | `PUBLIC_CATEGORY_LIST_READ` |
| Failure | `503 PUBLIC_CATEGORY_INVENTORY_TOO_LARGE` above 500 entries — fails rather than truncating |
| Item shape | `{ slug, name, isIndexable, displayOrder }` |

Ordering: `display_order ASC, slug ASC`, in the SQL. **Total**, because `slug` is
globally unique under CST-011 — two categories sharing a `display_order` still
come back in the same order on every request. Insertion order is never relied on
and no in-memory sort exists to become a second ordering authority.

`displayOrder` is exposed because the operator's editorial position is the
ordering authority a client would otherwise have to invent. The physical category
UUID is **not** exposed, and neither is `description`, `seoTitle`,
`seoDescription`, `status`, `archived_at`, `created_at` or `updated_at` — the
repository never selects them, so no projection could leak one.

A **dedicated** item schema was used rather than widening
`PublicCategoryResponse`: the embedded Product category is a name and a slug, and
adding an SEO directive plus a sort key there would have put both on every
product summary, every product detail and every type derived from them, for no
consumer.

Files: `domain/public-category.policy.ts`, `domain/public-category.errors.ts`,
`domain/repositories/public-category.repository.ts`,
`infrastructure/persistence/drizzle-public-category.repository.ts`,
`application/public-category.projection.ts`,
`application/public-category.query.ts`,
`presentation/schemas/public-category.response.ts`,
`presentation/public-category.controller.ts`.

No Admin category operation was added. The module that serves this read wires
`PUBLIC_CATEGORY_REPOSITORY` only; `CATEGORY_REPOSITORY` — which creates rows and
changes status — stays in `CatalogModule` and is not injectable here. That is a
composition fact, and the contract suite asserts it.

---

## E. Embedded Product category widening

`PublicCategoryResponse` and `AdminProductCategoryResponse` keep their field
names, their `{ slug, name }` shape, their required lists and their absence of a
category id. Only `slug` changed: `enum` → `pattern`. No Product response was
redesigned and no product payload grew a field.

---

## F. Public Product filter widening

`?categorySlug=` accepts any pattern-valid slug, bounded at 80 characters,
`.strict()` unchanged so an unknown query parameter is still a 400.

**Runtime resolution is filtered, never unfiltered.** `PublicProductQuery` passes
the slug through to `listPublished`, which adds `eq(categories.slug, …)` to the
same published/non-archived join it already applied. A slug naming no public
category therefore matches nothing and the page is empty. The keyset cursor is
still bound to the filter it was issued under.

---

## G. Admin Product filter widening

`listProductsQuerySchema.categorySlug` widened identically. Admin semantics for
unknown, inactive or archived categories are unchanged — the filter has always
been a predicate over rows, and an unmatched predicate has always produced an
empty page. This is compatibility for the existing Admin Product operations
only; **no Admin category CRUD was added** (`APP12-C02`).

---

## H. Unknown/non-public category semantics

This is the one deliberate behavioural consequence of removing the enum, and it
is stated plainly rather than buried.

| Input | Before C01 | After C01 |
|---|---|---|
| `?categorySlug=khan` (public) | 200, filtered | 200, filtered — unchanged |
| `?categorySlug=ao-thun` (public, fifth) | **400** | 200, filtered |
| `?categorySlug=khong-ton-tai` (well-formed, unknown) | **400** | **200, empty page** |
| `?categorySlug=AO-THUN` / `ao_thun` / `ao thun` / `-ao` | 400 | 400 — unchanged |
| Admin `POST/PATCH` with unknown or inactive slug | `PRODUCT_CATEGORY_INVALID` | `PRODUCT_CATEGORY_INVALID` — unchanged |

The enum-era 400 for a well-formed unknown slug is **not retainable** under a
dynamic model, for two reasons:

1. Refusing it requires a compiled-in taxonomy — precisely the ceiling this
   checkpoint removes.
2. It would make the public endpoint an **enumeration oracle**: a 400 for
   `sap-ra-mat` and a 200 for `ao-thun` tells an anonymous caller which
   categories the store holds in draft.

The failure mode that actually matters — an invalid category silently returning
the *whole unfiltered catalogue* — does not occur and is asserted against over
HTTP (§R). Malformed input is still refused at the boundary before reaching a
WHERE clause.

---

## I. Fifth-category proof

`apps/api/test/integration/public-category-api.integration.spec.ts`, against a
**disposable** PostgreSQL the harness provisions, migrates and drops.

```text
slug   = ao-thun
name   = Áo thun
status = PUBLISHED
```

Proved, in one suite, over real HTTP through the real Nest application:

| Claim | Evidence |
|---|---|
| inventory returns it | listed with `{ slug, name, isIndexable: true, displayOrder }` |
| contract accepts its slug | filed through the **real** `ProductDraftService` create seam |
| embedded Product category can publish it | published through the **real** `ProductPublicationService`; `GET /api/public/products/{slug}` returns `category = { slug: 'ao-thun', name: 'Áo thun' }` |
| Product filter accepts/resolves it | `GET /api/public/products?categorySlug=ao-thun` returns only that category's products |

Independently confirmed live over the dev gateway against the **existing**
development data, which has held `ao-thun` since before `APP11-S04-C1` (§R).

**No business category data was mutated.** Every row in the suite lives in a
disposable database; nothing inserts, publishes, archives, renames, re-orders or
reassigns in the development database. `APP12-G03` owns representative UAT data.

---

## J. Visibility/indexability matrix

Proved as **rows against real SQL**, not against a fake:

| Category state | In inventory | `isIndexable` reported |
|---|---|---|
| `PUBLISHED`, `is_indexable = true` | ✅ included | `true` |
| `PUBLISHED`, `is_indexable = false` | ✅ included | `false` |
| `DRAFT` | ❌ excluded | — |
| `ARCHIVED` (`archived_at` set) | ❌ excluded | — |

Predicate: `status = 'PUBLISHED' AND archived_at IS NULL` — the same two terms
every public Product read already joins on. There is **no**
`eq(categories.isIndexable, true)` anywhere in the adapter; that absence is the
point, and the query suite asserts a non-indexable row survives projection.

The response carries the indexability fact `APP12-C03` needs, so the SEO decision
requires no second read and cannot re-derive the rule differently.

---

## K. OpenAPI delta

Measured from the committed artifact, before and after.

```text
paths      116 -> 117   (+1)
operations 128 -> 129   (+1)
schemas    252 -> 254   (+2)
public ops  43 ->  44   (+1)
admin/staff/health       unchanged (80 / 3 / 2)
```

Added: `GET /api/public/categories` → `publicCategory_list`;
`PublicCategoryListResponse`, `PublicCategoryInventoryItemResponse`.

Widened (no count change): `PublicCategoryResponse.slug`,
`AdminProductCategoryResponse.slug`, `CreateProductBody.categorySlug`,
`UpdateProductBody.categorySlug`, and the public and Admin Product
`categorySlug` query parameters — each now
`{ type: 'string', pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$' }`.

Not published: any category write contract; any Ready-Made order contract. Both
asserted absent by the contract suite.

---

## L. Generated-client delta

Regenerated canonically with `pnpm --filter @embroidery/api-client generate`
(Orval, IMP-D023). **No generated file was hand-edited**; `check:generated`
confirms the tree hash.

```text
removed: PublicProductListCategorySlug
         AdminProductListCategorySlug
         CreateProductBodyCategorySlug
         UpdateProductBodyCategorySlug
added:   publicCategoryList()
         PublicCategoryListResponse
         PublicCategoryInventoryItemResponse
         PublicCategoryListResult
changed: the six widened seams now type `string`
```

Curated boundary (`packages/api-client/src/catalog.ts`): the two value
re-exports of the removed enums are gone, each with a comment stating why;
`publicCategoryList` and its two response types now cross. The boundary carries
**no** category value enum, because there is no longer a compile-time taxonomy to
carry.

---

## M. Release-gate integration

```text
before:  public 43   DENY 31   ALLOW 12
after:   public 44   DENY 31   ALLOW 13
```

`publicCategory_list` is classified `ALLOW` (Wave-1 public read): it publishes
published, non-archived category names and slugs — browsing metadata the
Ready-Made catalogue needs — and names no custom capability. Withholding it would
leave Wave 1 unable to render its own category navigation.

Updated together, so none can drift:

- `docs/implementation/APP12-RELEASE-WAVE-AUTHORITY.md` §3 (inventory row +
  amendment note) and §7 (the 31-of-44 / 13-`ALLOW` statement);
- `apps/api/src/platform/release-gate/wave2-operation-authority.ts` — the runtime
  transcription;
- `apps/api/src/platform/release-gate/release-gate.contract.spec.ts` — the
  literal counts.

**Unchanged:** the 31 `DENY` operations, one for one.
`publicSecureLink_resolve` remains `DENY` as a whole operation, and
`SECURE_LINK_REOPEN_OBLIGATION` still names `APP12-B04` as the owner of the
scope-sensitive conversion. The release flag
(`CUSTOM_EMBROIDERY_RELEASE_ENABLED`) was not touched, and no `G02` route
behaviour was reopened. `ORDER_ACCESS` is not implemented here.

The gate suite enumerates the **real** route table from the composed container
and asks the **real** guard, so the new route was classified by the same
mechanism that classifies every other one: 11 tests, all passing.

---

## N. Frontend compatibility

No frontend behaviour changed. The generated-client change broke compilation in
six modules; each was repaired with the smallest adaptation that preserves
current runtime behaviour.

Two temporary modules were added, each stating its removal owner in its own
docblock:

| File | Removal owner |
|---|---|
| `apps/storefront/src/features/product-discovery/model/legacy-category-slugs.ts` | **`APP12-C03`** |
| `apps/admin/src/features/products/model/legacy-category-slugs.ts` | **`APP12-A01`** |

Each holds the four historical slugs as a frozen copy of what the contract used
to say. Each says explicitly that it is **not** category authority, must not gain
a fifth entry, and must not be imported by anything new.

Byte-for-byte unchanged behaviour: the same four Discover chips in the same order
with the same labels and hrefs; the same breadcrumb rule (a Product outside the
four still drops its category crumb); the same static sitemap category routes;
the same four Admin category options and filter chips; the same `UNKNOWN`
fallback that already renders today for `ao-thun` products.

**Not implemented here, and asserted not implemented:** dynamic Discover filters,
a dynamic sitemap, Admin category UI.

---

## O. DB / Figma / runtime boundaries

```text
migrations            = 38   (delta 0)
DB schema delta       = 0
category table delta  = 0
category rows changed = 0
Figma                 = unchanged (APP12-D01 = 21/21 APPROVED_FOR_IMPLEMENTATION)
Ready-Made API        = not started
Storefront dynamic    = not started (APP12-C03)
Admin category CRUD   = not started (APP12-C02)
G03 UAT data          = not seeded
```

Migration `0038` was neither modified nor added to. No design work was performed
and no Figma node was opened.

---

## P. Files changed

### New — API (11)

```text
apps/api/src/modules/catalog/domain/category-slug.ts
apps/api/src/modules/catalog/domain/public-category.policy.ts
apps/api/src/modules/catalog/domain/public-category.errors.ts
apps/api/src/modules/catalog/domain/repositories/public-category.repository.ts
apps/api/src/modules/catalog/infrastructure/persistence/drizzle-public-category.repository.ts
apps/api/src/modules/catalog/application/public-category.projection.ts
apps/api/src/modules/catalog/application/public-category.query.ts
apps/api/src/modules/catalog/application/public-category.query.spec.ts
apps/api/src/modules/catalog/presentation/schemas/public-category.response.ts
apps/api/src/modules/catalog/presentation/public-category.controller.ts
apps/api/src/modules/catalog/presentation/public-category.contract.spec.ts
apps/api/test/integration/public-category-api.integration.spec.ts
```

### New — frontend shims (2)

```text
apps/storefront/src/features/product-discovery/model/legacy-category-slugs.ts
apps/admin/src/features/products/model/legacy-category-slugs.ts
```

### Modified — API (9)

```text
apps/api/src/modules/catalog/catalog-public.module.ts
apps/api/src/modules/catalog/application/category-resolver.service.ts
apps/api/src/modules/catalog/presentation/public-product.controller.ts
apps/api/src/modules/catalog/presentation/admin-product.controller.ts
apps/api/src/modules/catalog/presentation/schemas/public-product.request.ts
apps/api/src/modules/catalog/presentation/schemas/public-product.response.ts
apps/api/src/modules/catalog/presentation/schemas/admin-product.request.ts
apps/api/src/modules/catalog/presentation/schemas/admin-product.response.ts
apps/api/src/platform/release-gate/wave2-operation-authority.ts
```

### Modified — tests repaired (4)

```text
apps/api/src/platform/release-gate/release-gate.contract.spec.ts
apps/api/src/modules/catalog/presentation/public-product.contract.spec.ts
apps/api/src/modules/catalog/presentation/schemas/admin-product.request.spec.ts
packages/api-client/src/public-api.smoke.test.ts
apps/storefront/test/unit/product-breadcrumb-model.test.ts
```

### Modified — frontend (4)

```text
apps/storefront/src/features/product-discovery/model/discover-categories.ts
apps/admin/src/features/products/model/product-category-options.ts
apps/admin/src/features/products/model/product-category.ts
apps/admin/src/features/products/model/product-filters.ts
```

### Modified — contract and client (3, two generated)

```text
packages/contracts/openapi/openapi.generated.json   (generated)
packages/api-client/src/generated/embroidery-api.ts (generated)
packages/api-client/src/generated/embroidery-api.schemas.ts (generated)
packages/api-client/src/catalog.ts
```

### Modified — documentation (6)

```text
docs/implementation/APP12-RELEASE-WAVE-AUTHORITY.md
docs/implementation/14-IMPLEMENTATION-DECISION-REGISTER.md   (IMP-D061)
docs/implementation/10-MASTER-APPLICATION-ROADMAP.md
docs/implementation/phases/APP12-HARDENING-UAT-PRODUCTION-READINESS.md
docs/implementation/SCOPED_COMMAND_INDEX.md
docs/implementation/reports/APP11-CLOSURE-MATRIX.md
docs/implementation/reports/APP12-C01-COMPLETION-REPORT.md  (new)
```

---

## Q. File-size evidence

```text
node tools/check-file-size.mjs --paths <all 33 changed source/test files>
→ Scoped file-size check passed (33 file(s), 1 above the review threshold).
```

The one review-threshold row is
`apps/api/src/modules/catalog/presentation/admin-product.controller.ts`:
**310 → 317** lines. It was **already** above the 300 review threshold at `HEAD`;
C01 added 7 lines of `@ApiQuery` documentation for the widened filter and it
remains far inside the 400-line hard limit. No unrelated historical file-size
debt was repaired (§24).

Every new file is well inside its limit; the largest are the contract spec (297)
and the integration spec (305), both under the 500-line test review threshold.

---

## R. Validation

Every command below was run and its result is reported as observed.

| # | Command | Result |
|---|---|---|
| 1 | `git diff --check` | clean (exit 0) |
| 2 | `pnpm --filter @embroidery/api exec tsc --noEmit` | PASS |
| 3 | `pnpm --filter @embroidery/api exec jest --testPathPatterns="public-category" --testPathIgnorePatterns=/node_modules/` | **30 passed**, 2 suites (`CMD-TEST-APP12-C01-UNIT`) |
| 4 | `pnpm --filter @embroidery/api exec jest --testPathPatterns="public-category-api[.]integration" …` | **13 passed** (`CMD-TEST-APP12-C01-API`) |
| 5 | `pnpm --filter @embroidery/api exec jest --testPathPatterns="catalog\|product\|category" --testPathIgnorePatterns="/node_modules/\|integration"` | 554 passed, **1 pre-existing failure** (see below) |
| 6 | `pnpm --filter @embroidery/api exec jest --testPathPatterns="release-gate"` | **11 passed** — DENY 31, ALLOW 13, total 44 |
| 7 | `pnpm --filter @embroidery/api run openapi:check` | PASS — "artifact is up to date" |
| 8 | `pnpm --filter @embroidery/api-client run generate` | regenerated, 2 files |
| 9 | `pnpm --filter @embroidery/api-client run check:generated` | PASS — tree hash `24aa033e…` |
| 10 | `pnpm --filter @embroidery/api-client exec tsc --noEmit` | PASS |
| 11 | `pnpm --filter @embroidery/api-client test` | **53 jest + 7 node:test passed** |
| 12 | `pnpm --filter @embroidery/storefront exec tsc --noEmit` | PASS |
| 13 | `pnpm --filter @embroidery/storefront exec jest --testPathPatterns="discover\|breadcrumb\|product-detail\|sitemap\|static-routes"` | **228 passed**, 18 suites |
| 14 | `pnpm --filter @embroidery/admin exec tsc --noEmit` | PASS |
| 15 | `pnpm --filter @embroidery/admin exec jest --testPathPatterns="product"` | 399 passed, **2 pre-existing failures** (see below) |
| 16 | `node tools/check-file-size.mjs --paths <33 files>` | PASS (§Q) |
| 17 | `npx prettier --check <33 files>` | PASS (3 files formatted, then clean) |
| 18 | `eslint` on every changed area of api / admin / storefront / api-client | PASS, no output |

Not run, and not needed: full monorepo, full worker, Playwright, UAT,
performance, Figma live.

### R.1 Live smoke

The dev API container bakes `packages/database` into its image (only
`apps/api/src` is bind-mounted), so it still held the **pre-DB01** database
package and failed to recompile on restart with six `CUSTOM_ORDER_STATES` errors
— a latent `APP12-DB01` environment condition, not a C01 defect, surfaced by the
restart. The image was rebuilt and the container recreated to restore the
environment; the stack is healthy.

```text
GET /api/public/categories                      -> 200, Cache-Control: no-store
  code = PUBLIC_CATEGORY_LIST_READ
  items = ao-thun(1) · thu-bong(10) · khan(20) · quan-ao(30) · khac(90)
GET /api/public/products?categorySlug=ao-thun   -> 200, returns "ao-thun-cotton"
GET /api/public/products?categorySlug=khong-ton-tai -> 200, items = []   (was 400)
GET /api/public/products?categorySlug=AO-THUN   -> 400                   (unchanged)
GET /kham-pha (storefront)                      -> 200                   (unchanged)
```

The first line is the checkpoint in one observation: the **real** development
database returns **five** categories, `ao-thun` included, over an operation whose
contract no longer denies it.

### R.2 Pre-existing failures, not absorbed

Both were confirmed pre-existing by re-running with the relevant C01 change
stashed. Neither is a category assertion; owner remains `APP12-H01` (§26).

| Suite | Failure | Cause |
|---|---|---|
| `apps/api/test/architecture/catalog-placement-boundary.spec.ts` | `DESIGN_MODULE` imports `AssetModule` | pre-existing module-boundary drift; fails identically at `HEAD` |
| `apps/admin/test/boundary/product-form-source.test.ts` (2) | reads `packages/api-client/src/index.ts` expecting operation names | the client boundary was split into per-domain barrels by a later checkpoint; `index.ts` is now `export *` only. Invalidated by that split, **not** by C01 — fails identically with `catalog.ts` stashed |

### R.3 Assertions repaired (directly invalidated by C01 only)

| Assertion | Why it was invalid | Repair |
|---|---|---|
| `public-api.smoke.test.ts` — "derives the public category slugs from the contract" | asserted the four members of a now-deleted enum | replaced with an inventory-operation assertion |
| `public-product.contract.spec.ts` — "accepts only the fixed public category taxonomy" | asserted `khong-ton-tai` is a 400 | now asserts well-formed slugs pass and malformed ones fail |
| `admin-product.request.spec.ts` — "rejects a category outside the closed APP2 taxonomy" | asserted `do-choi` is rejected at the boundary | now asserts the shape check, and names `CategoryResolver` as the owner of existence |
| `admin-product.request.spec.ts` — "accepts only a locked category slug" | asserted `nonsense` is rejected | now asserts the widened filter, `.strict()` unchanged |
| `release-gate.contract.spec.ts` — literal counts | 43/12 | 44/13, DENY 31 unchanged |
| `product-breadcrumb-model.test.ts` — imported the enum | enum deleted | reads `DISCOVER_CATEGORY_SLUGS` instead |

---

## S. Follow-up disposition

```text
FU-APP11-S04-C1-02
  contract portion                    -> CLOSED_BY_APP12_C01
  Storefront Discover/sitemap portion -> OPEN, owner APP12-C03
  Admin category options portion      -> OPEN, owner APP12-A01

route-authority fixed-category gate   -> OPEN, owner APP12-C03
```

Recorded in `reports/APP11-CLOSURE-MATRIX.md`. No Storefront work is claimed
closed: Discover still shows four chips, the breadcrumb still drops a fifth
category's crumb, and the static sitemap still lists four category routes. Two
new shim removals are now tracked in the same place, each named in its own file.

**Opened by this checkpoint:** none blocking. The `IMP-D059` slug-expression
refinement (§C) is recorded in `IMP-D061` §1 for Product Owner visibility rather
than as a follow-up, because it is a decision, not outstanding work.

---

## T. Roadmap

```text
APP12-C01 COMPLETE
APP12-C02 NEXT
```

`ROADMAP_STATUS = LOCKED` · `CHECKPOINTS = 38` · exactly one `NEXT`.
`APP12-C02` was not started. Nothing was pushed.
