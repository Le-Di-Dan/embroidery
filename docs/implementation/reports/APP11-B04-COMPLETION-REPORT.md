# APP11-B04 — Public SEO Sitemap Inventory — Completion Report

## A. Verdict

```text
APP11-B04            = COMPLETE
PO_DECISION_REQUIRED = NONE
NEXT_CHECKPOINT      = APP11-A01
```

One anonymous, path-agnostic, read-only operation was delivered. No migration,
no index, no worker, no Storefront runtime, no content-page API.

---

## B. Entry baseline

```text
OpenAPI paths      = 115
OpenAPI operations = 127
OpenAPI schemas    = 250

migrations         = 37
app.module.ts      = 339 lines
```

Verified at entry by reading the committed artifact, not assumed.

---

## C. Contract delivered

| Method | Path | Operation ID | Auth | Cache |
|---|---|---|---|---|
| `GET` | `/api/public/sitemap-entries` | `publicSitemapEntry_list` | anonymous | `no-store` |

Request: **no parameter of any kind.** No cursor, limit, offset, page or
filter; the only entry in the generated `parameters` array is the platform-wide
`X-Request-ID` header, added to every operation by the correlation decorator.

Response, inside the standard success envelope:

```json
{ "items": [ { "kind": "PRODUCT" | "GALLERY", "slug": "…", "updatedAt": "…" } ] }
```

`503` is the only documented failure, and it exists solely so the inventory can
never be silently truncated (§ H below and §26.19).

The operation id is the repository's canonical derived form: the controller is
`PublicSitemapEntryController`, the handler is `list`, so `operation-id.ts`
mints `publicSitemapEntry_list` with **no** `CONTROLLER_DOMAIN_KEYS` entry owed.
No existing B01/B02/B03/B03A operation id changed.

---

## D. Product inventory authority

`PublicProductRepository.listIndexable(limit)` was added to the **existing**
Catalog public read port and implemented in the existing
`DrizzlePublicProductRepository`. It applies exactly the three visibility terms
the two delivered public catalog reads apply, from the same constants:

```text
products.status      = PUBLIC_PRODUCT_VISIBLE_STATE   (= PUBLISHED)
categories.status    = APP2_CATEGORY_STATUS           (= ACTIVE)
categories.archived_at IS NULL
```

plus the one term this operation adds:

```text
products.is_indexable = true
```

Nothing was copied into an SEO module. The sitemap owns no product visibility
literal, reads no catalog table, and cannot become a second, laxer definition of
"publicly visible" — the smallest possible capability was added to the port that
already owns the predicate (`BACKEND_CONVENTIONS.md` §10), which is the route
§9.1 prescribes.

Consequences proved live: a `noindex` published product, a DRAFT product, an
unpublished product and a product whose category is archived are all absent,
each for the same reason the public Product Detail route would refuse or hide
it.

---

## E. Gallery inventory authority

`PublicGalleryEntryRepository.listIndexable(limit)` was added to the **existing**
public Gallery read port and implemented in the existing
`DrizzlePublicGalleryEntryRepository`. Three terms:

```text
gallery_entries.status       = PUBLIC_GALLERY_ENTRY_VISIBLE_STATE  (= PUBLISHED)
gallery_entries.is_indexable = true
EXISTS (one currently deliverable image, CATALOG_PREVIEW rendition)
```

The third term reuses `deliverableAssetSource(...)` from
`gallery-public-media-eligibility.ts` — the single `APP11-B03` definition already
consumed by the feed, the detail and the binary route. **No second gallery
eligibility definition was created**; the new `detailSource()` helper is the same
generator keyed on the detail rendition.

**The alignment is deliberately with the *detail* rendition, not the feed's.**
`/api/public/gallery-entries/{slug}` 404s when
`findPublishedBySlug(...).assets` is empty, and that array is filtered on
`CATALOG_PREVIEW`. Keying the sitemap on the feed's `THUMBNAIL` instead would
have made the two disagree in both directions. Proved live:

- an entry whose only deliverable rendition is the detail one **is** listed and
  its detail answers 200;
- tombstoning the last deliverable image removes the entry from the inventory
  **and** 404s the detail, in the same read;
- that removal changes nothing stored — the entry is still `PUBLISHED` and the
  curator's selection is untouched. A GET mutates nothing;
- restoring the image re-includes it, with no operator action.

---

## F. Static-route exclusion

The API emits **no path**. It publishes `kind` + `slug`; the Storefront maps a
kind to `/san-pham/[slug]` or `/bo-suu-tap/[slug]` itself. The contract suite
proves this structurally: no B04 source file (controller, query, projection,
response schema) contains `san-pham`, `bo-suu-tap`, `kham-pha`, `chinh-sach`,
`cua-hang`, `http://`, `https://`, `sitemap.xml` or `robots`, and the response
schema carries no `url`, `loc`, `path` or `canonicalUrl` property. The live
suite re-proves it on the wire.

`/`, `/kham-pha`, `/bo-suu-tap`, `/dich-vu`, `/cau-hoi-thuong-gap`, `/cua-hang`
and `/chinh-sach/*` are Storefront route authority and are absent. `APP11-S04` /
`APP11-S05` compose them.

`content_pages` is not queried and cannot be: `ContentPublicSeoModule` composes
neither `CONTENT_PAGE_REPOSITORY` nor `REDIRECT_RULE_REPOSITORY`, which the
contract suite asserts. The live suite inserts a `PUBLISHED`, `is_indexable`
`content_pages` row and proves the inventory stays empty.

---

## G. Query/index evidence — and the `IDX-067` correction

**`APP11-G01`'s claim that `IDX-067` is the sitemap-scan index is wrong for this
phase.** Verified against the live schema:

```text
ix_content_pages__published_indexable  ON content_pages (id)
  WHERE status = 'PUBLISHED' AND is_indexable          -- this is IDX-067
```

`IDX-067` covers **`content_pages`** — the content-page half of DB5's Q-06,
which `APP11-G01` itself removed from this phase. It is unused by B04.

The two indexes that actually serve the delivered scan already existed. Both
plans below are real `EXPLAIN` output from the running development PostgreSQL
(`postgres:16.14-alpine`).

**Product half — IDX-065**, whose schema comment already names Q-06
(`packages/database/src/schema/catalog/products.ts:109`):

```text
ix_products__category_display_id__published
  ON products (category_id, display_order, id) WHERE status = 'PUBLISHED'

->  Index Scan using ix_products__category_display_id__published on products p
      Filter: is_indexable
->  Index Scan using pk_categories on categories c
      Index Cond: (id = p.category_id)
      Filter: ((archived_at IS NULL) AND (status = 'ACTIVE'::text))
```

**Gallery half — IDX-066**, with the deliverability term as an indexed semi-join:

```text
ix_gallery_entries__display_id__published
  ON gallery_entries (display_order, id) WHERE status = 'PUBLISHED'

->  Nested Loop Semi Join
    ->  Index Scan using ix_gallery_entries__display_id__published on gallery_entries g
          Filter: is_indexable
    ->  Bitmap Index Scan on uq_gallery_entry_assets__entry_asset
    ->  Index Scan using pk_assets on assets a
    ->  Index Scan using uq_asset_derivatives__asset_kind__not_failed on asset_derivatives d
```

Every access path is an index scan; there is no sequential scan and no
application-side filtering over all rows.

**Stated honestly:** the development database currently holds 30 products and 0
gallery entries, so at *default* planner settings PostgreSQL chooses a
sequential scan on a one-page table, which is correct behaviour and not a defect.
The plans above were captured with `enable_seqscan = off` to prove the indexes
are **applicable to the predicates** — which is the claim being made. The
ordering (`ORDER BY slug`) is a sort rather than an index walk on both halves,
because IDX-065/IDX-066 are keyed on the editorial tuple; over a bounded
published set this is a sort of the already-filtered rows, not of the tables.

`APP11-B04` added **no index and no migration.** Migration count is unchanged at
37, asserted by both new suites.

---

## H. Pagination and the no-truncation guarantee

No pagination contract was added (§8). The endpoint is an inventory, not a feed.

There is no canonical repository-wide cap for a full inventory read —
`resolveLimit` in `@embroidery/persistence` is a *page-size* clamp for keyset
feeds and would have been the wrong tool, since clamping is exactly the silent
truncation this operation must never do. So B04 declares its own explicit cap:

> **Superseded by `APP11-B04-C1`.** The cap below was declared and checked
> *per kind*, which admitted 30 000 Products plus 30 000 gallery entries — 60 000
> URLs in one sitemap file — with neither kind tripping its own guard. The
> authority is now one combined bound, `PUBLIC_SITEMAP_MAX_TOTAL_ENTRIES`, and
> the numbers below read against that single total. See
> `APP11-B04-C1-COMPLETION-REPORT.md`.

```text
PUBLIC_SITEMAP_MAX_TOTAL_ENTRIES = 50_000   // the sitemap protocol's own per-file URL limit
FETCH_LIMIT_PER_SOURCE           = cap + 1
```

Each repository is asked for `cap + 1` and the two row counts are **summed**
before the check. A sum above the cap means the true inventory
exceeds what one response may carry, and the query **throws**
`PUBLIC_SITEMAP_INVENTORY_TOO_LARGE` → HTTP 503 before anything is projected. No
`.slice(...)` exists anywhere in the feature, asserted structurally. Reaching the
cap is the signal that a sitemap-index protocol has become necessary, which is a
contract change and therefore a checkpoint.

---

## I. HTTP budget reconciliation

```text
ORIGINAL_G01_FORECAST                          = +11   (115 -> 126)
APP11_B03A_DISCOVERED_DELTA                    = +2
APP11_ACTUAL_BACKEND_HTTP_DELTA_AFTER_B04      = +13
APP11_FINAL_BACKEND_OPERATION_COUNT_AFTER_B04  = 128
```

Recorded in the phase plan §7. The obsolete `+11` is not preserved: the estimate
did not anticipate that no delivered pipeline could mint a `PUBLIC`
`GALLERY_MEDIA` asset, and `APP11-B03A` closed that real blocker.

---

## J. OpenAPI / client delta

```text
                 before -> after
paths                115 -> 116     (+1)
operations           127 -> 128     (+1)
schemas              250 -> 252     (+2: PublicSitemapEntryResponse, PublicSitemapListResponse)
migrations            37 -> 37      (0)
app.module.ts        339 -> 339     (0 lines, and it does not name the new module)
```

```text
openapi.generated.json SHA-256 = 2cc30b364217e93a7381211ac2ba00f9baa951e2ec262a46df2d0e1defa5d384
api-client tree hash           = a19cb87a302342255aaaf8f114b86e3686a38c02a1ee448d46b942a2aa988a70
generated client               = 2 files, 9400 lines, 416664 bytes
```

Both artifacts were produced by the canonical tooling (`openapi:generate`,
`api-client generate`) and re-verified by their own checks
(`openapi:check`, `check:generated`). Nothing generated was hand-edited. The
client exposes `publicSitemapEntryList`; curated package exports remain
consumer-driven and untouched — `APP11-S04` may own Storefront exposure.

---

## K. Module composition

`app.module.ts` was **not touched**: 339 lines before and after, and it does not
mention the new module.

`ContentPublicSeoModule` is composed beneath the already-registered
`ContentModule`. CTX-CNT is the context that owns SEO — its own docblock reads
"SEO pages, redirects and agreements" — and an inventory of indexable URLs that
happens to read two other contexts belongs to neither Catalog nor Gallery;
hanging it off either would have made one the owner of the other's indexability.
`ContentModule` stays persistence-focused and declares no controller of its own,
and a Nest import is not transitive, so the modules that import `ContentModule`
for a repository see no change.

The new module is defined by what it cannot inject: no object storage, no Admin
provider, no write repository, no transaction manager, no publication port, and
not even its own parent's content-page and redirect ports. It imports
`CatalogPublicModule` and `GalleryPublicModule` for their read ports only.
`GalleryPublicModule` gained one `exports` entry — the read port, which takes no
lock and offers no write — mirroring exactly what `CatalogPublicModule` already
did for `APP11-B03`.

---

## L. File-size compliance

**Hard limits (source ≤ 400, test ≤ 600): every B04-owned and B04-modified file
passes.**

| Lines | File | Limit | Status |
|---:|---|---|---|
| 34 | `content/application/public-sitemap.projection.ts` | 400 | PASS |
| 97 | `content/application/public-sitemap.query.ts` | 400 | PASS |
| 49 | `content/content-public-seo.module.ts` | 400 | PASS |
| 62 | `content/domain/public-sitemap.errors.ts` | 400 | PASS |
| 94 | `content/domain/public-sitemap.policy.ts` | 400 | PASS |
| 98 | `content/presentation/public-sitemap-entry.controller.ts` | 400 | PASS |
| 56 | `content/presentation/schemas/public-sitemap.response.ts` | 400 | PASS |
| 300 | `content/presentation/public-sitemap-entry.contract.spec.ts` | 600 | PASS |
| 412 | `test/integration/public-sitemap-api.integration.spec.ts` | 600 | PASS |
| 57 | `content/content.module.ts` (modified) | 400 | PASS |
| 49 | `gallery/gallery-public.module.ts` (modified) | 400 | PASS |
| 136 | `catalog/domain/repositories/public-product.repository.ts` (modified) | 400 | PASS |
| 300 | `catalog/…/drizzle-public-product.repository.ts` (modified) | 400 | PASS |
| 134 | `gallery/domain/repositories/public-gallery-entry.repository.ts` (modified) | 400 | PASS |
| 228 | `gallery/…/drizzle-public-gallery-entry.repository.ts` (modified) | 400 | PASS |

```text
HARD_LIMIT_VIOLATIONS_IN_B04_SCOPE   = 0
REVIEW_WARNINGS_IN_B04_SCOPE         = 0
```

`drizzle-public-product.repository.ts` landed at exactly 300 — at the review
threshold, not over it. It grew by 23 lines for the new read; the comment
prose in that method was tightened rather than the method being split, because
splitting a coherent adapter to save three lines would have been the distortion
§17 warns against.

**Pre-existing, out of scope, disclosed rather than hidden:**
`node tools/check-file-size.mjs .` reports **79 hard-limit violations
repository-wide**, all pre-existing and none in B04's scope — 77 in `tools/`
(historical `check-app4-*` / `smoke-app3-*` scripts) and the rest in APP3/APP5/
APP6 sources and specs. Two REVIEW warnings outside B04's scope also stand:
`content/…/drizzle-agreement.repository.ts` (335) and
`test/integration/admin-gallery-asset-api.integration.spec.ts` (541, from
`APP11-B03A`). B04 did not touch any of them and did not attempt unrelated
cleanup.

---

## M. Validation

### Commands run

| Command | Result |
|---|---|
| `pnpm --filter @embroidery/api exec tsc --noEmit -p tsconfig.json` | PASS |
| `pnpm --filter @embroidery/api openapi:generate` | 116 / 128 / 252 |
| `pnpm --filter @embroidery/api openapi:check` | PASS — artifact up to date |
| `pnpm --filter @embroidery/api-client generate` | 2 files, tree hash `a19cb87a…` |
| `pnpm --filter @embroidery/api-client check:generated` | PASS — up to date |
| `jest --runTestsByPath src/modules/content/presentation/public-sitemap-entry.contract.spec.ts` | PASS — 20/20 |
| `jest --config jest.config.mjs --runTestsByPath test/integration/public-sitemap-api.integration.spec.ts` | PASS — 16/16 |
| `jest --config jest.config.mjs --runTestsByPath test/integration/public-gallery-api.integration.spec.ts` | PASS — 32/32 |
| `jest --runTestsByPath src/modules/gallery/presentation/*.contract.spec.ts` (4 suites) | PASS |
| `jest --runTestsByPath src/modules/catalog/application/public-product.query.spec.ts` | PASS |
| `jest --runTestsByPath src/modules/catalog/presentation/product-placement.contract.spec.ts` | 23/24 — see below |
| `npx eslint` over the changed scope | PASS — 0 problems |
| `npx prettier --check` over the changed scope | PASS |
| `node tools/check-file-size.mjs .` | 0 violations **in B04 scope**; 79 pre-existing repository-wide |
| `EXPLAIN` on both inventory statements, live PostgreSQL | indexed plans, §G |

### CHANGE_IMPACT

B04 changed two shared read seams, so the specs that depend on them were rerun,
and five existing assertions had to be re-scoped because they asserted the
*absence* of the thing this checkpoint delivers:

| File | Why it changed |
|---|---|
| `catalog/application/public-product.query.spec.ts` | Its `FakeRepository` implements `PublicProductRepository`, which gained `listIndexable`. Answers an empty inventory; the browsing query never calls it. |
| `gallery/presentation/public-gallery-entry.contract.spec.ts` | Asserted no sitemap path exists anywhere, and that `isIndexable` is never an equality term anywhere in the gallery public adapter. Both are now scoped to B03's own surface and its two browsing reads; the file still proves the browsing reads do not filter on indexability. |
| `gallery/presentation/admin-gallery-entry.contract.spec.ts` | Asserted `/api/public/sitemap-entries` is undefined. Re-scoped to the Admin gallery paths it owns. |
| `gallery/presentation/admin-gallery-entry-lifecycle.contract.spec.ts` | Same, plus its four-Admin-path count is preserved. |
| `gallery/presentation/admin-gallery-asset.contract.spec.ts` | Asserted no operation id contains "sitemap". Re-scoped: the family is now pinned to exactly `publicSitemapEntry_list` and proved not to be B03A's. |
| `catalog/presentation/product-placement.contract.spec.ts` | Asserted no `Public*` schema carries `updatedAt`. `expectedUpdatedAt` is still forbidden everywhere; the one carrier is now named explicitly, with the reason it is a `<lastmod>` and not a concurrency token. |

Not re-scoped, not weakened: every one of these still asserts its own
checkpoint's boundary. None was deleted.

### TESTS_NOT_RUN, and why

```text
FULL_MONOREPO_TEST = NOT_RUN
FULL_E2E           = NOT_RUN
APP11_E01          = NOT_RUN
```

| Not run | Why |
|---|---|
| Full API suite / full monorepo | Forbidden by §20 and by `VALIDATION_GOVERNANCE.md`; B04 adds one read-only public operation and touches no write path. |
| Admin frontend, Storefront, Playwright | No frontend file changed. |
| Worker suite | No worker, job or worker-visible port changed. |
| Full DB regression | No migration, no schema file, no index. |
| `APP11-E01` | Not this checkpoint. |
| Remaining APP2 / APP3 / APP5–APP10 suites | No shared seam they consume changed: `listPublished`, `findPublishedBySlug` and `findPublishedSummaryById` are byte-identical, and the two new port methods are additive. |

### Known failure disclosed

`catalog/presentation/product-placement.contract.spec.ts` has **one failing
test**, `creates no individual side, area, media, Template or Session
operation`, which fails because `/api/admin/products/{productId}/sides/{sideId}/background`
exists. **This failure is pre-existing on HEAD** — verified by stashing every
B04 change and re-running the suite, which failed identically (1 failed, 23
passed). It is an APP3-era assertion never updated when the Admin side-background
route was delivered. B04 did not cause it and did not fix it: repairing an
unrelated historical assertion is outside the allowed change set (§23). It is
recorded as a follow-up below.

---

## N. Files changed

Git-authoritative.

**Added (9)**

```text
apps/api/src/modules/content/domain/public-sitemap.policy.ts
apps/api/src/modules/content/domain/public-sitemap.errors.ts
apps/api/src/modules/content/application/public-sitemap.query.ts
apps/api/src/modules/content/application/public-sitemap.projection.ts
apps/api/src/modules/content/presentation/public-sitemap-entry.controller.ts
apps/api/src/modules/content/presentation/schemas/public-sitemap.response.ts
apps/api/src/modules/content/presentation/public-sitemap-entry.contract.spec.ts
apps/api/src/modules/content/content-public-seo.module.ts
apps/api/test/integration/public-sitemap-api.integration.spec.ts
```

**Modified (14)**

```text
apps/api/src/modules/content/content.module.ts
apps/api/src/modules/gallery/gallery-public.module.ts
apps/api/src/modules/catalog/domain/repositories/public-product.repository.ts
apps/api/src/modules/catalog/infrastructure/persistence/drizzle-public-product.repository.ts
apps/api/src/modules/gallery/domain/repositories/public-gallery-entry.repository.ts
apps/api/src/modules/gallery/infrastructure/persistence/drizzle-public-gallery-entry.repository.ts
apps/api/src/modules/catalog/application/public-product.query.spec.ts
apps/api/src/modules/catalog/presentation/product-placement.contract.spec.ts
apps/api/src/modules/gallery/presentation/public-gallery-entry.contract.spec.ts
apps/api/src/modules/gallery/presentation/admin-gallery-entry.contract.spec.ts
apps/api/src/modules/gallery/presentation/admin-gallery-entry-lifecycle.contract.spec.ts
apps/api/src/modules/gallery/presentation/admin-gallery-asset.contract.spec.ts
docs/implementation/phases/APP11-GALLERY-CONTENT-AND-SEO.md
docs/implementation/SCOPED_COMMAND_INDEX.md
```

**Regenerated (3)**

```text
packages/contracts/openapi/openapi.generated.json
packages/api-client/src/generated/embroidery-api.ts
packages/api-client/src/generated/embroidery-api.schemas.ts
```

`apps/api/src/bootstrap/app.module.ts` — **not modified.**

New scoped commands: `CMD-TEST-APP11-B04-CONTRACT`, `CMD-TEST-APP11-B04-API`.

---

## O. Follow-ups

Non-blocking, none owned by B04.

```text
FU-APP11-B04-01
  WHAT  `product-placement.contract.spec.ts` fails one assertion on HEAD:
        `/api/admin/products/{productId}/sides/{sideId}/background` exists but the
        APP3-era "no individual side operation" assertion was never updated for it.
  WHY   Pre-existing, reproduced on a clean stash; unrelated to SEO.
  OWNER whichever checkpoint next touches the Admin side-background surface.

FU-APP11-B04-02
  WHAT  79 pre-existing file-size hard-limit violations repository-wide, 77 of them
        in `tools/` historical check/smoke scripts.
  WHY   Long-standing debt; unrelated cleanup is forbidden inside a checkpoint.
  OWNER a dedicated governance checkpoint.

FU-APP11-B04-03
  WHAT  `PUBLIC_SITEMAP_MAX_TOTAL_ENTRIES` (per `APP11-B04-C1`) is a tripwire, not a
        working page size. If the catalogue ever approaches 50 000 indexable
        entities in total across both kinds, a sitemap-index protocol (multiple
        sitemap files) becomes necessary.
  WHY   That is a contract change, not a tuning change.
  OWNER a future SEO checkpoint, if the store ever grows into it.

FU-APP11-B04-04
  WHAT  `APP11-S04` composes the framework `sitemap.ts` from this operation, and
        owns absolute URLs, `robots.txt`, canonical tags and structured data.
  WHY   Storefront route authority; explicitly out of B04's scope.
  OWNER APP11-S04.
```

---

## P. Roadmap

```text
APP11-G01      COMPLETE
APP11-G01-C1   COMPLETE
APP11-D01      COMPLETE
APP11-D01-C1   COMPLETE
APP11-B01      COMPLETE
APP11-B01-C1   COMPLETE
APP11-B02      COMPLETE
APP11-B03      COMPLETE
APP11-B03-C1   COMPLETE
APP11-B03A     COMPLETE
APP11-B04      COMPLETE
APP11-A01      NEXT
APP11-A02      NOT STARTED
APP11-S01      NOT STARTED
APP11-S02      NOT STARTED
APP11-S03      NOT STARTED
APP11-S04      NOT STARTED
APP11-S05      NOT STARTED
APP11-E01      NOT STARTED
APP11-X01      NOT STARTED
```

Exactly one `NEXT`. A01 was not started. Nothing was pushed.
