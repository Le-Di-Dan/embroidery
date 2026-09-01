# APP12-C01-C1 — Database Category Source-of-Truth Correction

**Parent:** `APP12-C01` — Dynamic Public Category Contract and Inventory Read
**Phase:** APP12 — Hardening, UAT and Production Readiness
**Date:** 2026-09-01

---

## A. Verdict

```text
APP12-C01-C1 = COMPLETE
PARENT_APP12-C01 = COMPLETE_AFTER_C1
CORRECTION_USED = 1 / 1
NEXT_CHECKPOINT = APP12-C02
```

No C2. `ROADMAP_STATUS = LOCKED`, `CHECKPOINTS = 38`, `APP12-C03` untouched in the
roadmap.

---

## B. Root cause

The Product Owner's finding is correct and the framing is the important part: the
defect was **architectural, not cosmetic**.

`APP12-C01` did real work — it removed the four-value enum from six contract
seams, deleted four generated enums and shipped `publicCategory_list`. Then it
stopped at the contract boundary and wrote the four historical slugs back into
both applications as `legacy-category-slugs.ts`, reasoning that "the Storefront
half is `APP12-C03`'s" and that preserving behaviour was the conservative choice.

That reasoning was wrong twice.

**It mistook the deliverable for the contract.** `IMP-D059` locks
`CATEGORY_MODEL = DYNAMIC` as a property of the *system*, not of the OpenAPI
document. A dynamic contract in front of a compiled frontend taxonomy satisfies
the schema and not the requirement. From the operator's chair nothing had changed:
publishing a category still required a source edit, a build and a deployment,
which is precisely the condition `IMP-D059` §1 exists to forbid.

**It mistook "unchanged behaviour" for safety.** The behaviour being preserved was
already broken, and the C01 report said so in its own words while calling it
acceptable: four Discover chips, four Admin options, four compiled sitemap URLs, a
breadcrumb that dropped its crumb for any other category, and — the sharpest case
— `ao-thun` rendering as `Chưa xác định` in the Admin product list. The database
had held that category since before `APP11-S04-C1`. Preserving that was not
conservatism; it was carrying a known defect forward under a removal-owner
comment.

The deeper cause is that C01 treated **"where a value is declared"** as a layering
detail rather than as the decision. Once a category slug or name exists in source,
that source is an authority, whatever the comment above it says. A file named
`legacy-category-slugs.ts` with a removal owner is still a second taxonomy — and
the repository had already proved the two could diverge.

This correction removes the second authority rather than annotating it, and adds a
gate so it cannot return one convenience constant at a time.

---

## C. Repository-wide category-value audit

Scanned mechanically across `apps/storefront`, `apps/admin`, `apps/api`,
`apps/worker`, `packages/api-client`, `packages/contracts`, `packages/database`,
`packages/persistence`, `tools`, tests, docs and migrations — not limited to the
files the C01 report listed.

Searched: `APP2_CATEGORY_SLUGS`, `APP2_CATEGORY_TAXONOMY`, `LegacyCategorySlug`,
`legacy-category-slugs`, `DISCOVER_CATEGORY_SLUGS`, `PRODUCT_CATEGORY_*`, the four
slugs, the four Vietnamese labels, and the structural equivalents (fixed slug
arrays, fixed label arrays, `Record<CategorySlug, string>`, slug-to-label maps,
`switch (categorySlug)`, static category href arrays, static sitemap category
entries, category-specific source guards, test helpers exporting canonical
category values).

### C.1 Classification and disposition

| Class | Before (C01 state) | After | Disposition |
|---|---|---|---|
| **A. `PRODUCTION_RUNTIME_AUTHORITY`** | 13 modules | **0** | All removed (C.2). |
| **B. `PRODUCTION_PRESENTATION_DATA`** defining identity/name/order | 4 maps | **0** | All removed (C.3). |
| **C. `TEST_FIXTURE_DATA`** | many | many | Allowed. Canonical-membership assertions replaced by dynamic invariants (§N); every new fixture uses arbitrary values. |
| **D. `HISTORICAL_MIGRATION_DATA`** | migration `0033` | unchanged | Allowed and **not edited**. |
| **E. `HISTORICAL_DOCUMENTATION`** | reports, decisions, phase plans | unchanged | Allowed; history is not rewritten. |
| **F. `DESIGN_SAMPLE_CONTENT`** | Figma copy | unchanged | Allowed, non-authoritative. |

### C.2 Class A — every production runtime authority, and what happened to it

| # | Module | What it held | Disposition |
|---|---|---|---|
| 1 | `packages/database/src/schema/catalog/categories.ts` | `APP2_CATEGORY_TAXONOMY`, `APP2_CATEGORY_SLUGS`, `App2CategorySlug` | Moved to a test-only `__historical__` fixture |
| 2 | `packages/database/src/index.ts` | re-exported both to every consumer | Exports removed |
| 3 | `apps/api/.../domain/product-draft.policy.ts` | re-exported both **and** `categoryNameOf(slug)` | Re-exports and the label lookup deleted |
| 4 | `apps/api/.../application/product-projection.ts` | built the Admin category **name** from the compiled taxonomy | Reads the joined row's `name` |
| 5 | `apps/storefront/.../model/legacy-category-slugs.ts` | the four slugs | **File deleted** |
| 6 | `apps/storefront/.../model/discover-categories.ts` | `DISCOVER_CATEGORY_SLUGS`, `CATEGORY_LABELS`, `DISCOVER_CATEGORIES`, `toDiscoverCategorySlug` | Rewritten: pure functions over an API inventory |
| 7 | `apps/storefront/.../model/discover-selection.ts` | narrowed `?category=` against the four | Narrows against the live inventory, syntax as fallback |
| 8 | `apps/storefront/.../storefront-seo/model/public-static-routes.ts` | four compiled `?category=` sitemap URLs | Category URLs removed from the fixed inventory |
| 9 | `apps/admin/.../model/legacy-category-slugs.ts` | the four slugs | **File deleted** |
| 10 | `apps/admin/.../model/product-category-options.ts` | `PRODUCT_CATEGORY_SLUGS`, `PRODUCT_CATEGORY_OPTIONS` | Rewritten: `toProductCategoryOptions(inventory)` |
| 11 | `apps/admin/.../model/product-filters.ts` | `PRODUCT_CATEGORY_FILTER_OPTIONS` (4 hard-coded) | Rewritten: `toProductCategoryFilterOptions(inventory)` |
| 12 | `apps/admin/.../model/product-form-values.ts` | narrowed a product's own category against the four | Syntax guard only |
| 13 | `tools/check-storefront-route-authority.mjs` | `categorySlugs: ['thu-bong', …]` — a **governance** authority | Replaced by a slug-*pattern* fact (§20) |

### C.3 Class B — slug-to-label maps

| Module | Disposition |
|---|---|
| `apps/admin/.../model/product-category.ts` (`LABEL`, `parseProductCategory`, `productCategoryLabel`) | **File deleted**; the list and table render `product.category.name` |
| `apps/admin/.../model/product-copy.ts` `category: { thuBong, khan, quanAo, khac, unknown }` | Block removed |
| `apps/storefront/.../model/discover-categories.ts` `CATEGORY_LABELS` | Removed; labels are `category.name` |
| `apps/admin/.../model/product-filters.ts` inline option labels | Removed |

### C.4 Deliberately left alone, with the reason

- **`APP2_CATEGORY_STATUS = 'PUBLISHED'`** (28 call sites). This is a **status**,
  not a category: the lifecycle has no `ACTIVE` literal, so "publicly visible"
  maps onto `PUBLISHED`. §2 explicitly permits code to own the status vocabulary,
  and renaming 28 sites would be the broad refactor §14 warns against.
- **`tools/smoke-app2-*.mjs`, `tools/explain-q01-fixture.mjs`** — APP2-era
  checkpoint evidence scripts, `HISTORICAL_SCOPED`. Class C/E.
- **Migration `0033`** — unedited, per §36.

---

## D. Source-of-truth architecture

```text
categories table          ← the only authority for slug, name, status,
   │                        archived_at, is_indexable, display_order
   ▼
DrizzlePublicCategoryRepository     status='PUBLISHED' AND archived_at IS NULL
   │                                (in the SQL, so no caller can forget it)
   ▼
PublicCategoryQuery                 cap check, projection, no re-sort
   │
   ▼
GET /api/public/categories          publicCategory_list · no-store · unpaged
   │                                { slug, name, isIndexable, displayOrder }
   ▼
@embroidery/api-client              publicCategoryList()  — no value enum
   │
   ├─► Storefront (server, per request)
   │     • category-inventory.server.ts → Discover chips, labels, order
   │     • …                            → ?category= membership
   │     • sitemap-inventory.server.ts  → category URLs (isIndexable only)
   │     • Product breadcrumb / CTA     → from the Product's own category row
   │
   └─► Admin (browser, TanStack Query, 15 s staleTime)
         • category-inventory.service.ts → form options, filter options
         • product.category.name          → rendered label
```

Code owns: the slug shape, the status vocabulary, the visibility predicate, the
ordering rule, the contract, the degraded states, and the `Tất cả` UI option.
The database owns every category value.

---

## E. Runtime legacy-module removal

```text
deleted: apps/storefront/src/features/product-discovery/model/legacy-category-slugs.ts
deleted: apps/admin/src/features/products/model/legacy-category-slugs.ts
deleted: apps/admin/src/features/products/model/product-category.ts
```

`LegacyCategorySlug` runtime usage: **0**. `legacy-category-slugs` imports: **0**.
No similarly named symbol survives — the names were removed, not renamed, so there
is nothing to argue about.

The historical values now live in
`packages/database/src/schema/catalog/__historical__/app2-category-fixture.ts`
(`APP2_HISTORICAL_CATEGORIES`, `APP2_HISTORICAL_CATEGORY_SLUGS`,
`APP2_HISTORICAL_CATEGORY_STATUS`), read by exactly three suites — the ones that
assert what migration `0033` did. The `__historical__` directory name is what the
anti-hardcode gate matches on, so a production import of it fails the build.

`CURRENT_RUNTIME_IMPORTERS_OF_APP2_CATEGORY_VALUE_SET = 0`.

---

## F. Storefront Discover correction

Chain, per request (`force-dynamic`, so no build-time freeze):

```text
categories → publicCategory_list → publicCategoryList() →
fetchCategoryInventoryOnServer() → DiscoverPage → DiscoverCategoryNav
```

- **Chips** — one per row, in the API's `display_order`-then-`slug` order,
  **never re-sorted** in the client (a second sort is the one that silently wins).
- **Labels** — `category.name`, the operator's own text.
- **`Tất cả`** — kept in the copy catalog as UI state meaning *omit the query*.
  No `all` row exists or may exist in the database (§10).
- **Selection** — `resolveDiscoverSelection(params, inventory)`: syntax first,
  then membership **against the live inventory**. A category published a minute
  ago resolves; one archived a minute ago stops resolving.
- **Degraded state** — the inventory reader returns `undefined` on failure
  (*unknown*, not *empty*). The chip row renders `Chưa thể tải danh mục.`; the
  selection falls back to slug **syntax** so an API blip never 404s a valid
  category. No remembered list is ever substituted (§31).

The Discover page issues one product request and one category request per render;
both start together rather than serially.

---

## G. Product breadcrumb / continuation correction

Both surfaces dropped their membership test entirely.

The justification is a fact about the system, not a relaxation: a Product is
publicly visible **only** when its category is `PUBLISHED` and not archived — the
public read enforces that in SQL, in the same statement that returns the product.
Discover lists from the same table with the same predicate. So a category slug
arriving on a public Product response is, by construction, one
`/kham-pha?category=` will render. Asking a compiled list for permission could
only ever produce the failure it was meant to prevent, from the other side.

What remains is a **syntax** guard, because the slug is interpolated into a URL the
page publishes to crawlers.

```text
well-formed slug  → Khám phá / category.name / Product   (crumb + JSON-LD + CTA)
malformed slug    → Khám phá / Product                   (CTA → unfiltered Discover)
```

The crumb label is `category.name`, so a rename changes it with no deployment and
the URL is unchanged. Every href goes through `buildDiscoverHref`, so the crumb,
the chips and the sitemap cannot disagree about how a category is addressed.

---

## H. Sitemap correction

`PUBLIC_STATIC_ROUTES` no longer contains any category URL. `composeSitemap` takes
the category inventory as a second argument and inserts one URL per **indexable**
category immediately after `/kham-pha` — located by route id, not by array
position.

```text
PUBLISHED + isIndexable=true   → sitemap URL   ✓
PUBLISHED + isIndexable=false  → Discover yes, sitemap no
DRAFT / ARCHIVED               → absent from both
```

Preserved: the 50 000-URL bound, now applied over **three** sources (fixed routes
+ category URLs + entity inventory) before anything is emitted; fail-closed
behaviour — the category read propagates its failure exactly as the entity read
does, because silently dropping every category URL would tell a crawler those
feeds were delisted; deterministic ordering; the Product/Gallery entries
untouched.

---

## I. Admin Product category correction

- **Options** — `toProductCategoryOptions(inventory)`; the `<select>` offers what
  the database publishes, in its order, labelled by `name`.
- **Filter** — `toProductCategoryFilterOptions(inventory)`; `Tất cả danh mục`
  plus one option per category. `ProductCategoryFilter` is a `string`.
- **Rendered label** — `product.category.name` directly, in both the table and
  the card list. The slug-to-label map and the `UNKNOWN` fallback are gone: a
  category's name is data, and mapping a real category to `Chưa xác định` was the
  defect.
- **Form seeding** — a product's own category is kept whatever it is; only a
  malformed slug becomes "not chosen". Previously, opening a product filed under
  a real category the build did not know **silently cleared its category field**,
  and saving would have moved the product.
- **URL filter normalisation** — by shape, not membership: membership cannot be
  checked synchronously before the inventory loads, and guessing would drop a
  valid filter on every page load. A well-formed unknown slug is sent and the API
  answers with an empty page.
- **Degraded state** — `[]`, which yields the `Tất cả` option alone and the form
  placeholder alone. Never a remembered list.

An `AdminProductSummaryResponse` already carried `category.name`; the API side of
this is §4 of C.2 — the projection stopped inventing the name from a constant.

---

## J. Admin inventory semantic decision — **Case A**

**No new operation was added.**

`CategoryResolver.requireBySlug` accepts a category only when its row is
`PUBLISHED`. The set of categories a product may be filed under is therefore
exactly what `GET /api/public/categories` returns (`PUBLISHED` and not archived).
Offering a wider list would offer options the write path refuses, and duplicating
the read would create two answers to one question — which §16 forbids without a
reason.

The read carries no customer data and no secret: slug, name, indexability and
display order are the same facts served to anonymous visitors.

**Recorded obligation for `APP12-C02`.** Two Admin needs appear the moment C02
introduces category creation, publication and archival — and not before, because
today no application path can create a category in any state but `PUBLISHED`:

1. a management list showing `DRAFT` and `ARCHIVED` categories;
2. a Product **filter** able to name an archived category, so an operator can
   still find the products left behind under one.

Both want `GET /api/admin/categories`. `APP12-C02` must add it and repoint the
Admin Product filter at it. Adding it here would have been an operation with no
reachable state behind it. This is written in the docblock of
`apps/admin/src/features/products/services/category-inventory.service.ts`, beside
the decision it constrains.

---

## K. API / OpenAPI / generated-client delta

```text
OpenAPI paths       117 → 117   (0)
OpenAPI operations  129 → 129   (0)
OpenAPI schemas     254 → 254   (0)
public operations    44 →  44   (0)
generated client                 unchanged (tree hash 24aa033e…)
category value enum              none, before and after
```

`openapi:check` and `check:generated` both report *up to date* — Case A added no
operation, so the contract this correction consumes is exactly the one `APP12-C01`
published.

API source changes are internal only:

- `product-draft.policy.ts` — taxonomy re-exports and `categoryNameOf()` removed;
- `category-resolver.service.ts` — already shape-then-row at C01, unchanged here;
- `ProductDraft` gained `categoryName`, selected from the already-joined
  `categories` row in the draft and publication repositories, so the Admin
  projection can carry the real name. One more selected column, not one more
  query.

---

## L. Dynamic add-without-code-change proof

`apps/api/test/integration/dynamic-category-lifecycle.integration.spec.ts`,
against a disposable PostgreSQL. **13 tests, all passing.**

The design is the evidence: the application is booted **once** in `beforeAll`, and
every category is created *afterwards* by inserting a row. Nothing rebuilds,
restarts or re-imports. A compiled taxonomy anywhere in the running process would
make these assertions impossible — a stronger claim than "the source holds no
list", which §P covers separately.

| Proof | Result |
|---|---|
| a category absent before its row exists | ✓ |
| served the moment the row exists, process unchanged | ✓ |
| accepted by the public Product filter immediately | ✓ (200) |
| accepted by the Admin Product filter immediately | ✓ (not 400 — the contract accepts it; only the session is missing) |
| archiving removes it on the next read | ✓ |

```text
SOURCE_EDIT_REQUIRED_TO_ADD_CATEGORY = false
```

Live confirmation (§R) closes the loop end to end: two categories seeded into the
dev database appeared in Discover, the Admin filter, the Admin create selector and
`/sitemap.xml` with no source change and no rebuild of either frontend.

---

## M. Dynamic rename proof

Same suite. With a published Product filed under the category:

```text
before:  category = { slug: 'mu-luoi-trai', name: 'Mũ lưỡi trai' }
UPDATE categories SET name = 'Mũ lưỡi trai cao cấp'
after:   category = { slug: 'mu-luoi-trai', name: 'Mũ lưỡi trai cao cấp' }
```

- the public Product detail carries the new name;
- the inventory carries the new name, from the same row;
- **the slug is unchanged**, so the URL is stable and the Product stays reachable
  at `?categorySlug=mu-luoi-trai`;
- no source edit.

No published slug was changed (§27).

---

## N. Dynamic ordering / indexability proof

**Ordering.** `mu-luoi-trai` (display order 7) is inserted *first* and sorts
*first alphabetically*; `tui-vai` (display order 3) is inserted second. The API
returns `tui-vai` first — only the column explains that. Changing the column to 99
re-orders the next read.

**Indexability.** A `PUBLISHED` + `is_indexable = false` category is listed and
reported non-indexable; flipping the column flips the next read. The Storefront
applies the SEO half: Discover renders it, the sitemap does not (§H, and the
composition suite asserts both).

**Anti-canonical-fixture rule (§25).** Every category-membership assertion in the
repository was replaced with a dynamic invariant. The fixtures now use
`mu-luoi-trai`, `tui-vai`, `ao-khoac`, `danh-muc-2026` — values no migration ever
seeded — precisely so a test cannot quietly become the place the taxonomy is
declared. The migration-`0033` upgrade suites keep asserting the historical rows,
inside that historical scope and against the `__historical__` fixture.

Representative rewrites:

| Was | Now |
|---|---|
| "derives the four slugs from the contract enum" | "renders one chip per database row, labelled by the row name" |
| "offers five choices, `Tất cả` first" | "leads with `Tất cả`, which carries no slug because it is not a category" |
| "narrows only contract slugs" | "answers membership from the rows it was given" |
| "renders the approved category labels **from the slug, not the server name**" | "renders the category name the server sent, **never one rebuilt from the slug**" |
| "falls back to 'not chosen' for a category this build does not know" | "keeps a category this build has never heard of" |
| "omits the category crumb when the Catalog slug is not a Discover filter" | "advertises the category crumb for a category no build knew about" |
| "advertises exactly the four canonical category states" | "advertises one URL per indexable category, and no compiled list" |
| "narrows the category … before building an href" | "holds no compiled category list in …" |

---

## O. Test seed strategy

| Layer | Mechanism | Cleanup |
|---|---|---|
| Unit / component | in-memory fixture objects | none needed |
| API integration | **disposable** PostgreSQL (`createApiIntegrationContext`) — provisioned, migrated and dropped per suite; refuses by name to run against the development database | automatic |
| Live verification | two rows inserted into the **development** database | explicit `DELETE`, verified (§R.4) |

Never production. No migration file touched. No fixture value became a runtime
constant — the anti-hardcode gate would fail the build if one did.

---

## P. Anti-hardcode regression gate

`tools/check-category-source-of-truth.mjs` + `tools/check-category-source-of-truth.test.mjs`.

Scans eight production `src` trees — **2 324 files** — and fails on:

1. **banned imports** — `legacy-category-slugs`, anything under `__historical__/`,
   the APP2 fixture (static *and* dynamic `import()`);
2. **banned symbols** — `APP2_CATEGORY_SLUGS`, `APP2_CATEGORY_TAXONOMY`,
   `APP2_HISTORICAL_*`, `LEGACY_CATEGORY_SLUGS`, `LegacyCategorySlug`,
   `DISCOVER_CATEGORY_SLUGS`, `PRODUCT_CATEGORY_SLUGS`, `PRODUCT_CATEGORY_OPTIONS`,
   `PRODUCT_CATEGORY_FILTER_OPTIONS`, `App2CategorySlug`;
3. **category-value literals** — two or more distinct historical slugs *or* labels
   as string literals in one file.

Structural and import-based rather than a plain grep, per §40. Comments are
stripped first, so the prose documenting this correction does not trip it; the
threshold of two distinguishes a list from an illustration. It deliberately does
**not** scan migrations, the `__historical__` fixture, tests, docs, reports or the
APP2-era smoke scripts — those record history, and failing them would be the gate
mistaking history for authority.

Its own suite (27 tests) proves it can actually fail: on a slug array, a
slug-to-label map, a label list, a `switch` over slugs, every banned import and
every banned symbol — and that it passes a single illustrative slug, prose naming
all four, the slug-shape rule, arbitrary fixture values and the
`DRAFT`/`PUBLISHED`/`ARCHIVED` status vocabulary.

```text
node tools/check-category-source-of-truth.mjs
→ 2324 production source file(s) scanned; no compiled category values,
  no legacy taxonomy imports, no slug-to-label maps.
```

---

## Q. Hard-code audit counts

```text
PRODUCTION_RUNTIME_CATEGORY_VALUE_CONSTANTS_BEFORE = 13
PRODUCTION_RUNTIME_CATEGORY_VALUE_CONSTANTS_AFTER  = 0

PRODUCTION_RUNTIME_SLUG_TO_LABEL_MAPS_BEFORE = 4
PRODUCTION_RUNTIME_SLUG_TO_LABEL_MAPS_AFTER  = 0

LEGACY_CATEGORY_RUNTIME_MODULES_BEFORE = 3
LEGACY_CATEGORY_RUNTIME_MODULES_AFTER  = 0

CURRENT_RUNTIME_IMPORTERS_OF_APP2_CATEGORY_VALUE_SET = 0
```

**How "before" was measured.** `APP12-C01` was never committed (`PUSHED = false`),
so `HEAD` is `APP12-DB01` and git cannot isolate the intermediate state. The
"before" column is therefore the **enumeration** in §C.2 and §C.3 — every module
named individually and verifiable against this diff — not an aggregate grep of a
state that no longer exists. The "after" figures are machine-measured by the gate
across 2 324 files, and every surviving textual mention of a banned symbol in
production source is a **comment** explaining its removal (verified: 5 occurrences,
all in docblocks; the gate strips comments before measuring).

---

## R. Live Playwright evidence

Environment: dev Compose stack. The API image was rebuilt (it bakes in
`packages/database`); `apps/storefront/src` and `apps/admin/src` are bind-mounted,
and the Admin container was restarted to pick up the change.

### R.1 Seed (§39)

```text
mu-luoi-trai | Mũ lưỡi trai | PUBLISHED | is_indexable=true  | display_order=7
tui-vai      | Túi vải      | PUBLISHED | is_indexable=false | display_order=8
```

Test data, not defaults. Deleted afterwards (§R.4).

### R.2 Customer surfaces — 1440 and 390

| Surface | Observed |
|---|---|
| `GET /api/public/categories` | 7 categories, `no-store`, `display_order` order: `ao-thun`(1), `mu-luoi-trai`(7), `tui-vai`(8, **isIndexable false**), `thu-bong`(10), `khan`(20), `quan-ao`(30), `khac`(90) |
| `/kham-pha` @1440 | `Tất cả` + **7** chips, labels from `name`, hrefs from `slug`, in `display_order` order — including `Áo thun`, which no build had ever rendered |
| `/kham-pha` @390 | chip row scrolls horizontally, no layout regression (screenshot taken and reviewed) |
| `/kham-pha?category=ao-thun` | active chip `Áo thun`, canonical `…/kham-pha?category=ao-thun`, feed filtered to that category |
| `/san-pham/ao-thun-cotton` | breadcrumb **Khám phá → Áo thun → Áo thun cotton**, crumb href `/kham-pha?category=ao-thun`; `BreadcrumbList` JSON-LD carries all three levels with the absolute category URL; continuation CTA `Khám phá Áo thun` → `/kham-pha?category=ao-thun` |
| `/sitemap.xml` | 6 category URLs — `ao-thun`, `mu-luoi-trai`, `thu-bong`, `khan`, `quan-ao`, `khac` — in `display_order` order; **`tui-vai` absent** (published, non-indexable) |

The Product Detail line is the defect closing: `APP11-S04` advertised that URL
while Discover 404'd it, `S04-C1` deleted the crumb, and it is now an ordinary
three-level trail.

### R.3 Admin surfaces — 1440

Signed in with the operator account the user supplied for this run only (never
echoed, logged, written to a report or passed as a command-line argument).

| Surface | Before restart (stale build) | After |
|---|---|---|
| Product list category filter | `Tất cả danh mục` + **4** compiled options | `Tất cả danh mục` + **7** database options, `display_order` order |
| Product list rows | `ao-thun` rendered **`Chưa xác định`** | renders **`Áo thun`** |
| `/products/new` category selector | 4 options | `Chọn danh mục` + **7** database options |

### R.4 Cleanup

```sql
DELETE FROM categories WHERE slug IN ('mu-luoi-trai','tui-vai') AND id IN (…);
-- verified: 5 rows remain (ao-thun, thu-bong, khan, quan-ao, khac) — the
-- pre-existing development data, untouched.
```

### R.5 One environment note, pre-existing

`/sitemap.xml` answered **500** until `STOREFRONT_PUBLIC_ORIGIN` was supplied. That
is the documented IMP-D050 fail-closed behaviour with the variable unset in the
dev `.env`, and it predates this correction. It was set **in the shell for the
verification run only** — `.env` was not written (`CLAUDE.md` §8a).

---

## S. Files changed

### Deleted (3)

```text
apps/storefront/src/features/product-discovery/model/legacy-category-slugs.ts
apps/admin/src/features/products/model/legacy-category-slugs.ts
apps/admin/src/features/products/model/product-category.ts
```

### New — runtime (5)

```text
packages/database/src/schema/catalog/__historical__/app2-category-fixture.ts   (test-only data)
apps/storefront/src/features/product-discovery/model/category-slug-shape.ts
apps/storefront/src/features/product-discovery/services/category-inventory.server.ts
apps/admin/src/features/products/model/category-slug-shape.ts
apps/admin/src/features/products/services/category-inventory.service.ts
apps/admin/src/features/products/hooks/use-category-inventory-query.ts
```

### New — tooling and tests (3)

```text
tools/check-category-source-of-truth.mjs
tools/check-category-source-of-truth.test.mjs
apps/api/test/integration/dynamic-category-lifecycle.integration.spec.ts
```

### Modified — API (7)

```text
apps/api/src/modules/catalog/domain/product-draft.policy.ts
apps/api/src/modules/catalog/domain/public-category.policy.ts
apps/api/src/modules/catalog/domain/repositories/product-draft.repository.ts
apps/api/src/modules/catalog/application/product-projection.ts
apps/api/src/modules/catalog/infrastructure/persistence/product-draft-row.mapper.ts
apps/api/src/modules/catalog/infrastructure/persistence/drizzle-product-draft.repository.ts
apps/api/src/modules/catalog/infrastructure/persistence/drizzle-product-publication.repository.ts
```

### Modified — database package (5)

```text
packages/database/src/index.ts
packages/database/src/schema/catalog/categories.ts
packages/database/src/schema/catalog-draft-categories.spec.ts
packages/database/src/schema/catalog-draft-categories.integration.spec.ts
packages/database/src/schema/catalog-draft-categories-upgrade.integration.spec.ts
```

### Modified — Storefront (8)

```text
src/app/kham-pha/page.tsx
src/app/sitemap.ts
src/features/product-discovery/index.ts
src/features/product-discovery/model/discover-categories.ts
src/features/product-discovery/model/discover-copy.ts
src/features/product-discovery/model/discover-selection.ts
src/features/product-discovery/model/discover-query-keys.ts
src/features/product-discovery/components/discover-category-nav.tsx
src/features/product-discovery/components/discover-feed-screen.tsx
src/features/product-discovery/hooks/use-discover-feed.ts
src/features/product-discovery/services/discover-catalog.client.ts
src/features/product-discovery/services/discover-catalog.server.ts
src/features/product-detail/model/product-breadcrumb.ts
src/features/product-detail/components/detail-continue-discover.tsx
src/features/storefront-seo/model/public-static-routes.ts
src/features/storefront-seo/model/sitemap-composition.ts
src/features/storefront-seo/services/sitemap-inventory.server.ts
```

### Modified — Admin (9)

```text
src/features/products/model/product-category-options.ts
src/features/products/model/product-filters.ts
src/features/products/model/product-form-values.ts
src/features/products/model/product-copy.ts
src/features/products/model/product-query-keys.ts
src/features/products/components/product-filter-bar.tsx
src/features/products/components/product-form-fields.tsx
src/features/products/components/product-card-list.tsx
src/features/products/components/product-table.tsx
src/features/products/components/product-list-screen.tsx
src/features/products/components/product-create-screen.tsx
src/features/products/components/product-edit-form.tsx
```

### Modified — tests (12)

```text
apps/storefront/test/unit/discover-model.test.ts
apps/storefront/test/unit/product-breadcrumb-model.test.ts
apps/storefront/test/unit/seo-sitemap-composition.test.ts
apps/storefront/test/components/discover-category-nav.test.tsx
apps/storefront/test/components/product-detail-continue.test.tsx
apps/storefront/test/smoke/discover-page.test.tsx
apps/storefront/test/smoke/seo-metadata-routes.test.ts
apps/storefront/test/smoke/seo-detail-metadata.test.tsx
apps/storefront/test/acceptance/app11-e01.acceptance.test.ts
apps/storefront/test/support/product-detail-fixture.ts
apps/admin/test/support/product-fixture.ts
apps/admin/test/components/product-create.test.tsx
apps/admin/test/components/product-list-filters.test.tsx
apps/admin/test/components/product-list-render.test.tsx
apps/admin/test/components/product-form-model.test.ts
apps/api/test/integration/public-catalog-api.integration.spec.ts
```

### Modified — tooling and documentation (8)

```text
tools/check-storefront-route-authority.mjs
docs/implementation/14-IMPLEMENTATION-DECISION-REGISTER.md      (IMP-D062)
docs/implementation/10-MASTER-APPLICATION-ROADMAP.md
docs/implementation/SCOPED_COMMAND_INDEX.md
docs/implementation/phases/APP12-HARDENING-UAT-PRODUCTION-READINESS.md
docs/implementation/phases/APP2-ASSETS-AND-CATALOG-PUBLICATION.md  (machine-checked fact)
docs/implementation/reports/APP12-C01-COMPLETION-REPORT.md         (correction notice)
docs/implementation/reports/APP11-CLOSURE-MATRIX.md                (follow-up closed)
docs/implementation/reports/APP12-C01-C1-COMPLETION-REPORT.md      (new)
```

---

## T. File-size evidence

```text
node tools/check-file-size.mjs --paths <all 93 changed source/test files>
→ Scoped file-size check passed (93 file(s), 3 above the review threshold).
```

| File | HEAD | Now | Note |
|---|---|---|---|
| `drizzle-product-draft.repository.ts` | 328 | 337 | already above 300 at HEAD; +9 for the `categoryName` column and its docblock |
| `admin-product.controller.ts` | 310 | 317 | already above 300 at HEAD; C01's `@ApiQuery` documentation |
| `check-storefront-route-authority.mjs` | 298 | 327 | crossed the review threshold with +29 lines explaining why no category value may live in a governance tool |

All far inside the 400-line hard limit. No unrelated historical file-size debt was
repaired. No giant dynamic-category file was created — the largest new file is the
gate at 268 lines.

---

## U. Validation

| # | Command | Result |
|---|---|---|
| 1 | `git diff --check` | clean |
| 2 | `pnpm --filter @embroidery/api exec tsc --noEmit` | PASS |
| 3 | `pnpm --filter @embroidery/database exec tsc --noEmit` | PASS |
| 4 | `pnpm --filter @embroidery/storefront exec tsc --noEmit` | PASS |
| 5 | `pnpm --filter @embroidery/admin exec tsc --noEmit` | PASS |
| 6 | `pnpm --filter @embroidery/api run openapi:check` | PASS — up to date, 0 delta |
| 7 | `pnpm --filter @embroidery/api-client run check:generated` | PASS — tree hash `24aa033e…` |
| 8 | `node tools/check-category-source-of-truth.mjs` | **PASS** — 2 324 files, 0 findings |
| 9 | `node --test tools/check-category-source-of-truth.test.mjs` | **27 passed** |
| 10 | `node tools/check-storefront-route-authority.mjs` | PASS (also repaired a pre-existing failure, §U.2) |
| 11 | `pnpm --filter @embroidery/api exec jest --testPathPatterns="dynamic-category-lifecycle"` | **13 passed** |
| 12 | `pnpm --filter @embroidery/api exec jest --testPathPatterns="public-category\|dynamic-category"` | **56 passed** |
| 13 | `pnpm --filter @embroidery/api exec jest --testPathPatterns="catalog\|product\|category\|release-gate"` | 926 passed, **1 pre-existing failure** |
| 14 | `pnpm --filter @embroidery/database exec jest --testPathPatterns="catalog-draft-categories.spec"` | **29 passed** |
| 15 | `pnpm --filter @embroidery/storefront exec jest` (full) | **2 171 passed, 120 suites, 0 failures** |
| 16 | `pnpm --filter @embroidery/admin exec jest` (full) | 1 838 passed, **6 pre-existing failures** |
| 17 | `node tools/check-file-size.mjs --paths <93 files>` | PASS (§T) |
| 18 | `npx prettier --check <93 files>` | PASS |
| 19 | `eslint` — api, database, storefront, admin | PASS (1 pre-existing, §U.1) |
| 20 | Live: Playwright Storefront @1440 + @390, Playwright Admin @1440, `sitemap.xml`, `publicCategory_list` | PASS (§R) |

Release-gate contract test (within #13): **DENY 31, ALLOW 13, total public 44** —
unchanged. `publicCategory_list` remains `ALLOW`;
`publicSecureLink_resolve` remains `DENY`; the release flag was not touched.

### U.1 Pre-existing failures, confirmed and not absorbed

Each was verified by re-running with the relevant changes stashed. Owner
`APP12-H01`.

| Suite | Failure | Cause |
|---|---|---|
| `apps/api/test/architecture/catalog-placement-boundary.spec.ts` | `DESIGN_MODULE` imports `AssetModule` | module-boundary drift; identical at HEAD |
| `apps/admin` × 5 suites (6 tests) | read `packages/api-client/src/index.ts` for operation names | the client boundary was split into per-domain barrels; `index.ts` is `export *` only. Identical with my changes stashed (1 832 vs 1 838 passing — this correction added 6) |
| `packages/database` category integration × 6 | assert a "34-migration chain" | the repo is at 38; part of the 22 pre-existing failures DB01 measured. Identical with `packages/database/src` stashed |
| `apps/admin` eslint × 1 | unused import in `request-quotation-bootstrap.test.tsx` | untouched file, unrelated feature, present at HEAD |

### U.2 Assertions repaired (directly invalidated)

| Assertion | Why invalid | Repair |
|---|---|---|
| 12 Storefront tests pinning the four-slug narrowing | the predicate and its list are gone | rewritten as dynamic invariants (§N) |
| 6 Admin tests pinning four options / the label map / the `UNKNOWN` fallback | same | rewritten against an arbitrary API inventory |
| `public-catalog-api` — "`khong-ton-tai` is a 400" | invalidated by the **parent** `APP12-C01`, missed there | now asserts 200 + empty page, and that a malformed slug is still 400 |
| `check-storefront-route-authority` — "`IMP-D038` is not LOCKED" | `APP12-P01` annotated the row `LOCKED — … SUPERSEDED IN PART BY IMP-D059`; the exact-match check made a correctly recorded supersession look unlocked. **Pre-existing**, repaired because §20 put this gate in scope | accepts `LOCKED` plus an annotation |

### U.3 One repository-integrity repair

A `git stash push`/`pop` on
`docs/implementation/14-IMPLEMENTATION-DECISION-REGISTER.md` (used to confirm a
pre-existing gate failure) corrupted the file, triplicating its `## 1. Locked
decisions` table. Detected by the route-authority gate reporting "no single
`IMP-D038` row", and repaired by reconstructing the file as HEAD plus the single
`IMP-D061` row. Verified: one `## 1. Locked decisions` heading, one `IMP-D038`
row, diff of `+1` line before this correction's own additions.

---

## V. Database / Figma / release-gate freeze

```text
migrations              = 38   (delta 0)
migration 0033          = unchanged
migration 0038          = unchanged
DB schema delta         = 0
category rows (business)= unchanged — 5, exactly as before (§R.4)
Figma                   = unchanged — APP12-D01 21/21 APPROVED_FOR_IMPLEMENTATION
OpenAPI                 = unchanged (117/129/254)
generated client        = unchanged
G02 DENY                = 31, unchanged
G02 ALLOW               = 13, unchanged
release flag            = untouched
Wave-2 isolation        = untouched
category mutation API   = none
Admin category CRUD UI  = none
```

`node tools/check-figma-design-index.mjs` was not re-run: no design file or
registry row was touched by this correction.

---

## W. Follow-up disposition

```text
legacy Storefront category shim        -> CLOSED_BY_APP12_C01_C1
legacy Admin Product category shim     -> CLOSED_BY_APP12_C01_C1
fixed Storefront category list         -> CLOSED_BY_APP12_C01_C1
fixed sitemap category values          -> CLOSED_BY_APP12_C01_C1
fixed breadcrumb membership            -> CLOSED_BY_APP12_C01_C1
route-authority fixed-category gate    -> CLOSED_BY_APP12_C01_C1
FU-APP11-S04-C1-02                     -> CLOSED (contract half APP12-C01,
                                          Storefront half APP12-C01-C1)

APP12-C02  OPEN — category mutation backend; MUST add GET /api/admin/categories
                  and repoint the Admin Product filter at it (§J)
APP12-A01  OPEN — category-management Admin UI
APP12-C03  OPEN — final dynamic-category runtime / SEO / gate verification.
                  Not marked complete; not removed from the locked roadmap.
```

**Opened by this correction:** none blocking. `APP12-C02`'s obligation in §J is
recorded in the decision register and in the service docblock it constrains.

---

## X. Roadmap

```text
APP12-C01 = COMPLETE_AFTER_C1
APP12-C02 = NEXT
```

`ROADMAP_STATUS = LOCKED` · `CHECKPOINTS = 38` · exactly one `NEXT` ·
`CORRECTION_USED = 1 / 1`, no C2. `APP12-C02` was not started, no category
mutation exists, `APP12-A01` and `APP12-C03` are not marked complete, no migration
was added, no production data was seeded, nothing was deployed and nothing was
pushed.
