# APP2-B04 — Public catalog queries

**Verdict: `PASS`.**

Two anonymous JSON operations, `publicProduct_list` and `publicProduct_detail`,
serving the published catalogue and consuming the `APP2-T01` media route for
every image address. No migration, no third operation, no Storefront decision.

One deliberate deviation from an accepted ADR is recorded in §G and is **not**
resolved silently: `ADR-DB5-001` classifies Q-01 as `OFFSET`, and this
checkpoint was instructed to implement keyset. It needs Product Owner
acknowledgement.

---

## A. Preflight and accepted `APP2-T01-C1` entry

| Item | Value |
| --- | --- |
| Branch | `production` |
| Entry `HEAD` | `1f0d16286ad1014ec059c63d4e23fe03addad0bf` — `docs(app2): record T01 production correction evidence` |
| Entry tree | clean — `git status --short` empty |
| `evidences/` | untouched, unstaged, never referenced |
| Pushed | nothing |

The T01-C1 evidence Commit D hash was **read from Git**, not inferred from any
short prefix. All seven accepted commits were read back with
`git show --stat` and are byte-identical: `e522e9d`, `ebd909a`, `f25abe0`,
`6527d27` (A04 / A04-C1), `136243f`, `d3fb3d0` (T01), `b7985d2` (T01-C1). The
documentation-only security governance commit `b7df24f` remains in place,
unrewritten.

`pnpm check:secrets`, `pnpm check:lifecycle`,
`node --test tools/check-lifecycle-consistency.test.mjs` (10),
`node --test tools/api-production-image.test.mjs tools/smoke-app2-t01-public-media-production.test.mjs` (28),
`pnpm quality` (exit 0), `pnpm check:openapi`, `pnpm check:api-client`,
`pnpm check:figma-design-index`, `node --test tools/check-figma-design-index.test.mjs` (31),
`pnpm db:check:manifest` and `git diff --check` all passed at entry.

`APP2_B04_PREFLIGHT = PASS`.

---

## B. Canonical source and query audit

Read before writing any source. Recorded facts, all from the repository rather
than from ecommerce convention:

| Question | Finding |
| --- | --- |
| Q-01 projection | name, slug, `base_price_amount`, `currency_code`, `display_order`, `is_display_out_of_stock`, category label, thumbnail via TBL-017 |
| Q-01 predicates | `status='PUBLISHED'` · optional `category_id` · optional availability flag |
| Q-01 sort / index | `(display_order, id)` · **IDX-065** `products (category_id, display_order, id) WHERE status='PUBLISHED'` |
| Q-02 lookup | `slug = ?` AND `status='PUBLISHED'`, via IDX-011 (CST-011 unique slug) |
| Q-02 projection | product + variants + sides + areas + media + SEO |
| `products` public columns | `name`, `slug`, `description`, `base_price_amount`, `currency_code`, `status`, `is_display_out_of_stock`, `display_order`, `seo_title`, `seo_description`, `is_indexable` |
| SEO columns | **exist**: `seo_title`, `seo_description`, `is_indexable` |
| Canonical published timestamp | **none** — `products` has no `published_at`; only `created_at` / `updated_at` |
| `product_media` | `role` ∈ `GALLERY \| THUMBNAIL \| DETAIL`; ordered by `display_order`; B02 writes one `THUMBNAIL` + `GALLERY` |
| Asset/derivative eligibility | `CATALOG_MEDIA` + `PRODUCTION_SENSITIVE` + `ACCEPTED` + not deleted; derivative `READY`, not watermarked, `storage_key` present |
| Existing public binary route | `publicProductMedia_get` (`APP2-T01`) — the only one |
| Envelope | `{success, code, message, meta:{requestId, timestamp}}`, `@ApiSuccessCode` |
| Anonymous controller convention | guards are opt-in per controller; public = absence of a decorator |
| Cursor codec | `packages/persistence/src/query/keyset-cursor.ts` — base64url JSON, `DEFAULT_PAGE_SIZE=20`, `MAX_PAGE_SIZE=100`, `InvalidCursorError`, `buildPage` over-fetch |
| Money | `numeric(14,2)` + row-level `currency_code`; driver returns a **string**; `toWholeDong` strips the VND scale |

Variants, SKUs, sides and areas are part of Q-02's eventual graph but are
explicitly outside B04's ownership, and none is projected.

---

## C. `APP2-T01` integrity gate

Verified against the committed runtime and artifact, before any source change.

| Requirement | Result |
| --- | --- |
| Route exists exactly once | one `@Get(':slug/media/:productMediaId/:rendition')` in the repository |
| OpenAPI has exactly one `publicProductMedia_get` | confirmed on the built document |
| Generated client contains `publicProductMediaGet` | confirmed |
| T01 focused unit tests | 3 suites, **47 tests**, pass |
| T01 PostgreSQL/MinIO integration | **36 tests**, pass |
| T01 development gateway smoke | **14/14** |
| T01-C1 production-image regression + orchestration tests | **28 tests**, pass |
| Production API starts with `NODE_ENV=production` | `node dist/main.js`, image `embroidery-t01c1-api-prod`, **0** mounts |
| T01-C1 production gateway smoke | **20/20** orchestration, **22/22** scenarios |
| Unpublish revokes the next media request | proven in both smokes |
| No tracked public MinIO route | `/minio/` through the gateway ≠ 200 |
| No direct storage URL or presign helper | `ObjectStoragePort` has **no** presign operation, by design |

`APP2_T01_INTEGRITY_GATE = PASS`.

### Runtime package-boundary reconciliation

The compiled API cannot `require` `@embroidery/contracts` (IMP-D018). B04 adds
**one local pure composer**, `publicProductMediaPath` in
`domain/public-product-catalog-path.ts`, and locks it to the shared authority
with a Docker-free contract test that asserts byte equivalence with
`buildPublicProductMediaPath` for every declared rendition. The spec may import
contracts because `tsconfig.build.json` excludes specs from `dist`; the runtime
never does. `pnpm --filter @embroidery/api build` passes, so `node dist/main.js`
is unaffected.

The opaque-identity rule is preserved: `product_media.id` appears **only inside
a media path**, never as a standalone DTO property. The projection leak scan
walks every string of every projected value and asserts that any occurrence of
the association id is inside a `/api/public/products/...` path.

---

## D. Database and query representability gate

Every B04 read-model fact exists in the current 33 migrations:

| Required fact | Column |
| --- | --- |
| Server-owned slug | `products.slug` (CST-011 unique) |
| Lifecycle status | `products.status` |
| Name / description | `products.name`, `products.description` |
| Whole-VND base price | `products.base_price_amount` + `currency_code` |
| Category slug / label / state | `categories.slug`, `.name`, `.status`, `.archived_at` |
| Ordered media with role | `product_media.role`, `.display_order` |
| Asset and derivative relationships | `product_media.asset_id` → `assets` → `asset_derivatives` |
| Delivery identity | `product_media.id` |
| SEO/public metadata | `products.seo_title`, `.seo_description`, `.is_indexable` |
| Keyset ordering columns | `products.display_order`, `products.id` |

**`PUBLIC_CATALOG_SCHEMA_GATE = PASS`** · **`NO_APP2_B04_MIGRATION`**.

No column, table, snapshot, visibility boolean, hero field, marketing title,
canonical URL or version column was invented.

---

## E. The exact two-operation contract

```
GET /api/public/products        → publicProduct_list
GET /api/public/products/{slug} → publicProduct_detail
```

Both operation ids were verified **on the generated document**, not asserted
from intent. No third operation exists; a controller test counts the HTTP method
decorators and asserts exactly two.

### List payload

```jsonc
{
  "items": [
    {
      "slug": "…", "name": "…",
      "category": { "slug": "khan", "name": "Khăn" },
      "price": { "amount": "250000", "currency": "VND" },
      "isDisplayOutOfStock": false,
      "thumbnail": { "url": "/api/public/products/…/media/…/thumbnail", "role": "THUMBNAIL" }
    }
  ],
  "hasNext": false,
  "nextCursor": null
}
```

`isDisplayOutOfStock` is included because Q-01 projects it. It is a Product-owned
manual display flag, not computed inventory — B04 computes no availability, joins
no stock table, and offers no availability filter.

### Detail payload

`slug`, `name`, `description?`, `category`, `price`, `isDisplayOutOfStock`,
`media[]`, `seo{title?, description?, isIndexable}`.

### Media reference shape (§7.3)

The property is named **`url`** — a relative application path. `path` and `src`
were the alternatives; `url` was chosen because the generated client and the
existing OpenAPI vocabulary already describe addresses that way, and the
description on the DTO states plainly that it is relative and publication-gated.
Recorded as required.

Never exposed, and asserted absent by three independent leak scans (projection,
API-over-HTTP, production gateway): product id, category id, asset id,
derivative id, `productMediaId` as a sibling field, storage key, bucket,
checksum, provider ETag, internal `status`, `archivedAt`, `createdAt`,
`updatedAt`, inspection data, and any absolute or storage URL.

---

## F. Public visibility semantics

The predicate is `products.status = 'PUBLISHED'` and nothing else. There is no
second visibility flag and none was invented. `DRAFT` and `ARCHIVED` are absent
for the *same* reason rather than by two rules, and the detail answers all
misses with one `PUBLIC_PRODUCT_NOT_FOUND` and one message.

A public projection additionally requires a coherent public category
(`categories.status = 'PUBLISHED'`, `archived_at is null`) — an inner join, so a
product whose category is not public is simply absent. This mirrors the
`APP2-T01` delivery predicate exactly, using the same re-exported constants, so
the JSON and the images can never disagree about who may see what.

`TR-LC04-05`, `TR-LC04-02`, `FU-APP2-PRODUCT-ARCHIVE-LIFECYCLE-01` and
`FU-APP2-PRODUCT-ARCHIVE-UI-01` are untouched. B04 adds no transition, no
archive route and no relist authority.

---

## G. Filters, ordering and keyset pagination — with one recorded conflict

| Item | Value |
| --- | --- |
| ORDER BY tuple | `display_order ASC, id ASC` — the canonical Q-01 tuple |
| Tie-breaker | `products.id` (ADR-DB5-001 R2) |
| Index | **IDX-065** `products (category_id, display_order, id) WHERE status='PUBLISHED'` |
| Cursor fields | `display_order`, `id`, **plus the filter it was issued under** |
| Encoding | the canonical `encodeCursor`/`decodeCursor` (base64url JSON) from `@embroidery/persistence` |
| Page size | `DEFAULT_PAGE_SIZE=20`, `MAX_PAGE_SIZE=100`, clamped not rejected |
| End of list | `hasNext=false`, `nextCursor=null` |

### The conflict, stated rather than resolved

`ADR-DB5-001` §R8 classifies **Q-01 as `OFFSET`** with the note that converting
it before one of its thresholds is observed "would be speculative
optimization". `DB5_PAGINATION_ORDERING_MATRIX` and `DB5_ACCESS_PATH_MATRIX`
say the same, and accept that an OFFSET boundary "may shift by one".

This checkpoint required keyset pagination and forbade OFFSET (§9, criterion
#26), and that is what is implemented. The deviation is narrow and, I believe,
low-risk:

- the **ordering tuple is unchanged** — `(display_order, id)`, exactly as the
  ADR specifies;
- the **index is unchanged** — IDX-065 serves it;
- keyset is strictly stronger on the property the ADR itself flags as accepted
  weakness: no duplicate and no omission across pages;
- the repository's own persistence layer already ships a canonical keyset codec
  whose header states "DB5 selected keyset over offset for every launch-critical
  list", and the Admin product list already paginates by keyset.

Nothing in the ADR was edited. **This needs Product Owner acknowledgement**, and
if the ADR is to remain authoritative as written, the correct remedy is an ADR
amendment rather than a change here.

### Cursor safety

Every malformed, tampered, over-long or foreign-filter cursor produces the same
`PUBLIC_PRODUCT_CURSOR_INVALID` with one message, so the format cannot be probed
by comparing errors. The filter is part of cursor identity: a cursor issued for
`categorySlug=khan` is rejected when replayed unfiltered and vice versa, because
a position in one ordering is meaningless in another and replaying it would
silently skip or repeat rows.

No OFFSET appears anywhere; the integration suite asserts the query plan text
contains none.

---

## H. Detail lookup and safe 404

Exact normalized slug, validated at the boundary against
`^[a-z0-9]+(?:-[a-z0-9]+)*$` with a length bound before it reaches a WHERE
clause. Unknown slug, `DRAFT`, `ARCHIVED` and a product without a public
category are indistinguishable: same status, same code, same message, and the
message never contains the requested slug. Proven both at the service level and
over HTTP by comparing the two rendered errors for equality.

---

## I. Money and category projection

`toWholeDong` is reused from the existing product projection: it strips the
`.00` VND scale from the driver's **string** with a regular expression and
performs no arithmetic. No `Number`, no `parseFloat`, no rounding anywhere in
the path.

A finding worth recording: `numeric(14,2)` caps a VND amount at **twelve integer
digits**, so a price beyond `Number.MAX_SAFE_INTEGER` is *not representable* in
this schema. The integration suite therefore proves the largest representable
amount (`999999999999`) returns digit-for-digit, and the projection unit suite
proves an unsafe-magnitude string survives the layer that would actually corrupt
it. B02's draft `0` sentinel is never exposed publicly because a product
carrying it cannot pass B03 readiness and so can never be `PUBLISHED`.

Category is projected as `{slug, name}` from the fixed public taxonomy. No
category UUID reaches the wire, and no category endpoint was added.

---

## J. SEO and canonical-route honesty

Exposed, because the columns physically exist: `seo_title`, `seo_description`,
`is_indexable` — on the **detail only**, since Q-01 does not project SEO.
Absent text is omitted rather than emitted as an empty string.

Not exposed, and asserted absent: `canonicalUrl`, `ogUrl`, any social image, any
absolute production URL, and the string `/san-pham/`. The Storefront route
remains an unresolved proposal for the Product Owner and S02; the API path is
not the canonical browser URL and B04 does not claim it is. The gateway seam
test additionally asserts no tracked Nginx template binds `san-pham`.

Publication does not depend on any SEO field — B03 excluded all three from
readiness — so a published product may legitimately have none.

---

## K. Media mapping and transport proof

| Projection | Association | Rendition |
| --- | --- | --- |
| List card | the one `THUMBNAIL` role | `thumbnail` |
| Detail | all media, in persisted `display_order` | `catalog-preview` |

Each address is built from the product slug, `product_media.id` as an opaque
path identity, and the rendition — nothing else. The repository only projects an
association whose derivative is genuinely servable, applying the delivery
route's own predicate with the same constants, so the catalogue cannot advertise
an address that would 404.

An image whose rendition stops being servable is **omitted**, not offered. Since
B03 readiness requires both derivative kinds, this cannot happen at publication
time; the reachable case is drift afterwards, and the integration suite
reproduces exactly that by moving a `CATALOG_PREVIEW` derivative out of `READY`
on an already-published product and asserting the detail returns `media: []`
while the product itself stays listed.

Proven end-to-end against disposable PostgreSQL + disposable MinIO: a URL that
B04 actually emitted returns the exact `THUMBNAIL` bytes, a detail URL returns
the exact `CATALOG_PREVIEW` bytes, the two really differ, headers are
`image/webp` + `nosniff` + `inline` + `no-store`, no cookie or storage credential
is involved, and unpublishing stops both the projection and the bytes.

Deleting every stored object leaves both JSON operations succeeding unchanged —
which is the proof that the queries describe addresses and never fetch bytes.

---

## L. Cache and unpublish correctness

Both operations send **`Cache-Control: no-store`**.

The invariant is that a cache must not keep exposing a product after unpublish.
This repository has **no cache-invalidation consumer**: the
`product.published` / `product.unpublished` outbox backlog has no dispatcher,
and B04 does not own one. Any stored copy of this JSON could therefore outlive
an unpublish. Until a canonical consumer exists, not storing is the only policy
that cannot defeat the lifecycle, and it matches what `APP2-T01` already does for
the bytes.

No event-driven revalidation is claimed to exist. The gateway seam test proves
the gateway defines no cache zone, that any `proxy_cache` directive is `off`, and
that no location is dedicated to the catalogue where one could be added.

---

## M. Architecture and persistence

```
PublicProductController      → HTTP only
PublicProductQuery           → orchestration + safe projection
PublicProductRepository      → SQL only (port + Drizzle adapter)
public-product.projection.ts → pure projections
public-product-cursor.ts     → filter-bound cursor over the canonical codec
CatalogPublicModule          → DatabaseModule only
```

The module imports `DatabaseModule` and **nothing else** — in particular no
object-storage provider. Not wiring the port is a stronger guarantee that the
JSON queries make no storage call than any test could be. No Admin provider is
in the graph either: `CatalogDraftModule` and `CatalogPublicationModule` carry
authentication, the Origin allowlist and audit wiring, and a public read has no
business sharing a graph with them.

No transaction is opened for either read (DEC-DB7-006). No N+1: the list resolves
each card's thumbnail with a correlated subquery **inside** the single list
statement, so a page of twenty products is one round trip; the detail is two
constant statements. Both reads write nothing — no Audit, no Outbox, no product,
asset or derivative mutation — proven by counting both tables around the calls.

---

## N. Security and safe errors

No guard is applied, and no identity module is imported, so none is even in
scope; a source-level test asserts both absences because a guard added later
would make the endpoint non-public while every functional test kept passing.

Global behaviour is preserved unchanged: request id, response envelope, exception
redaction, structured logging. Nothing global was weakened.

Every input is strictly validated before it reaches SQL: `.strict()` schemas
reject unknown query parameters (`?includeDraft=true` and `?status=DRAFT` are
400s, not silently ignored), the page size is bounded, the category filter is an
enum over the fixed taxonomy, and the slug matches a bounded pattern. No query
or path parameter can become an object-storage key — the queries construct no
storage key at all.

Error vocabulary: `PUBLIC_PRODUCT_NOT_FOUND` (404),
`PUBLIC_PRODUCT_CURSOR_INVALID` (400), `PUBLIC_PRODUCT_QUERY_INVALID` (400). All
three are 4xx deliberately: a 5xx would be redacted to `INTERNAL_SERVER_ERROR`
by the canonical filter and tell the caller nothing.

---

## O. Unit tests

`pnpm --filter @embroidery/api exec jest --testPathPatterns="public-product"`
→ **8 suites, 86 tests**, run **twice** with identical results.

Covering the two routes and their operation ids, the absence of guards, strict
slug and query parsing, the closed filter set, page-size bounds, the cursor
round-trip and every rejection mode, filter binding in both directions,
over-fetch arithmetic, cursor position at the last returned row, whole-VND
decimal safety including an unsafe magnitude, the role vocabulary,
thumbnail omission, detail ordering and rendition, SEO omission, the
media-path/contract equivalence, and the leak scan that walks projected values.

---

## P. PostgreSQL and query-plan tests

`pnpm test:public-catalog:integration` → **17 tests**, all pass, against a
disposable database built from all 33 migrations.

Published appears · DRAFT absent · ARCHIVED absent · filter includes and excludes
· canonical order matches a direct SQL ordering · cursor continuation walks every
row exactly once with no duplicate · invalid cursor rejected · foreign-filter
cursor rejected · detail by exact slug · unknown/DRAFT/ARCHIVED identical 404 ·
largest representable price exact · media order matches persisted order and uses
`catalog-preview` · no internal field leaks · unpublish removes list and detail
immediately · neither operation writes Audit or Outbox · repeated reads across
publish/unpublish/publish are never answered from a stale in-process cache ·
`EXPLAIN` contains no OFFSET.

Products are created through `ProductDraftService` and moved by
`ProductPublicationService` under a real Admin request context, so no fixture can
produce a state the delivered API could not.

---

## Q. Public-media live tests

`pnpm test:public-media:integration` → **3 suites, 44 tests** (36 T01 +
**8 new**), against disposable PostgreSQL and disposable private MinIO. Detailed
in §K. Zero container, object or database residue: the harness drops both.

---

## R. API and gateway tests

`pnpm test:public-catalog:api` → **13 tests** through the real Nest application.
`pnpm test:public-catalog:gateway` → **6** Docker-free gateway seam tests.
`pnpm smoke:app2-b04-public-catalog` → **18/18** through the real Nginx gateway.
`pnpm smoke:app2-b04-public-catalog:production` → **20/20** orchestration and
**23/23** scenarios on a real production runtime.

### Production verification (§23.1)

Reuses the accepted `APP2-T01-C1` topology, imported rather than reimplemented.

| Fact | Value |
| --- | --- |
| Production image | `embroidery-t01c1-api-prod:msalv28112c5b6` (`api.Dockerfile` `runner`) |
| Image id | `sha256:f2a7e30f529a` — differs from dev `sha256:4124d6aa5910` |
| Command | `node dist/main.js` |
| `NODE_ENV` | `production` |
| Bind mounts | **0** (dev has `/app/apps/api/src`) |
| Gateway upstream | service alias `api`, reloaded after swap and after restore |
| Database | disposable PostgreSQL, `show ssl` → **`on`**, synthetic per-run password |
| Object storage | the unchanged private development MinIO |

Proven on that runtime: both operations succeed anonymously; DRAFT and ARCHIVED
are hidden; the fixture transition to DRAFT removes list, detail **and** media
visibility (media addresses → 404); list and detail media references resolve
through `APP2-T01` returning real WebP bytes (**16400** and **28378**, identical
to the T01 baseline); `no-store` on both; request id echoed; no internal or
storage detail; MinIO unexposed; unknown parameter and malformed cursor rejected;
cursor and category filter travel; a subsequent request stays healthy.

Cleanup: dev API restored (`development`, image id identical to entry, one
mount), gateway and API healthy, zero residual images, containers or temp files.

---

## S. OpenAPI and generated-client delta

| Artifact | Before | After |
| --- | --- | --- |
| OpenAPI SHA-256 | `3d905a5736c44c6c7ee1ca482789b3bd7c53c5f198f68b1252244519a788c9e5` | `c2c3b874ba6a3a77680e373a67c288b43580e549090c3fbc6075efbd66b84ee8` |
| Paths | 14 | **16** |
| Operations | 17 | **19** |
| Schemas | 27 | **34** |
| Client tree hash | `be372048edd8d5b2e5257856cfe3aee2d9e7fc09297f643935038bbb0c0a8899` | `7524fc918629c7b699ff732771940e05c962309be5eeefdfb53123bbe8ecf5a2` |

Seven new schemas, all B04 response DTOs: `PublicProductListResponse`,
`PublicProductSummaryResponse`, `PublicProductDetailResponse`,
`PublicCategoryResponse`, `PublicPriceResponse`,
`PublicMediaReferenceResponse`, `PublicProductSeoResponse`.

Generated files changed: `packages/contracts/openapi/openapi.generated.json`
(+470), `packages/api-client/src/generated/embroidery-api.schemas.ts` (+110),
`packages/api-client/src/generated/embroidery-api.ts` (+35). **Additions only —
615 insertions, 0 deletions.** Both artifacts were produced by running the real
generators (`pnpm openapi:generate`, `pnpm api-client:generate`); neither was
hand-edited, and `pnpm check:openapi` / `pnpm check:api-client` confirm both are
up to date. No package barrel was added — the consuming frontend checkpoint owns
its narrow surface.

`build-openapi-document.spec.ts` was updated from 13/16 to 16/19 and now asserts
both new operation ids plus `publicProductMedia_get`, so the document shape stays
pinned rather than loosened.

---

## T. Frozen boundaries

| Boundary | Status |
| --- | --- |
| Database (33 migrations / 78 tables / 833 columns / 190 CHECKs) | unchanged |
| Database fingerprint `82864268…` | unchanged |
| Figma (72 registry IDs / 72 node rows) | unchanged |
| `apps/admin/**` | untouched |
| `apps/storefront/**` | untouched |
| `apps/worker/**` | untouched |
| `infrastructure/docker/api.Dockerfile` | untouched — the T01-C1 production fix is intact |
| `infrastructure/nginx/**`, `infrastructure/compose/**` | untouched |
| `packages/object-storage/**` | untouched |
| Dependencies / lockfile | unchanged |
| `APP2-T01` implementation source | untouched — B04 adds only consumer-side tests |
| Archive follow-ups | untouched |

---

## U. Durable evidence and cleanup

The shared development database was used by the dev gateway smoke only, which
recorded `audit 112 → 112` and `outbox 35 → 35`: the read routes wrote nothing,
and the fixture status change writes no evidence either. The one product it
touched was restored to its entry status (`DRAFT`) in `finally`.

The production smoke never wrote to the developer's database at all — it reads
it once with `pg_dump` into a disposable copy, which recorded the same
`112`/`35` from first assertion to last and was then destroyed with its volume.

**The existing PENDING outbox backlog is unchanged and was not read, claimed,
dispatched, modified or deleted.** B04 answers both operations from `products`,
`categories`, `product_media`, `assets` and `asset_derivatives` only. A
non-empty unchanged backlog is expected, not a defect.

No disposable residue: every integration harness drops its database, and the
production smoke reported zero residual images, containers and temp files.

---

## V. Commit A evidence

**`fa8e05eb49f8f227c09399c1cb591b66b1ed0ba9`** — `feat(api): implement public catalog queries`

31 files, +4338 −5.

### Source (new)

| File | Lines |
| --- | --- |
| `apps/api/src/modules/catalog/presentation/public-product.controller.ts` | 175 |
| `apps/api/src/modules/catalog/presentation/schemas/public-product.response.ts` | 153 |
| `apps/api/src/modules/catalog/presentation/schemas/public-product.request.ts` | 41 |
| `apps/api/src/modules/catalog/application/public-product.query.ts` | 116 |
| `apps/api/src/modules/catalog/application/public-product.projection.ts` | 154 |
| `apps/api/src/modules/catalog/domain/public-product-catalog.policy.ts` | 93 |
| `apps/api/src/modules/catalog/domain/public-product-catalog.errors.ts` | 84 |
| `apps/api/src/modules/catalog/domain/public-product-catalog-path.ts` | 51 |
| `apps/api/src/modules/catalog/domain/public-product-cursor.ts` | 106 |
| `apps/api/src/modules/catalog/domain/repositories/public-product.repository.ts` | 78 |
| `apps/api/src/modules/catalog/infrastructure/persistence/drizzle-public-product.repository.ts` | 244 |
| `apps/api/src/modules/catalog/catalog-public.module.ts` | 31 |

### Tests (new)

`public-product.contract.spec.ts` (123) · `public-product.projection.spec.ts` (189) ·
`public-product.query.spec.ts` (157) · `public-product-cursor.spec.ts` (96) ·
`public-product-catalog-path.spec.ts` (63) ·
`public-catalog.integration.spec.ts` (340) ·
`public-catalog-api.integration.spec.ts` (248) ·
`public-media-catalog-reference.integration.spec.ts` (207) ·
`tools/nginx-public-catalog-seam.test.mjs` (101)

### Harness (new)

`tools/smoke-app2-b04-public-catalog.mjs` (218) ·
`tools/smoke-app2-b04-public-catalog-production.mjs` (305) ·
`tools/smoke-app2-b04-public-catalog-scenarios.mjs` (300)

### Modified

`apps/api/src/bootstrap/app.module.ts` (+5, module registration) ·
`apps/api/src/openapi/build-openapi-document.spec.ts` (+18 −0, 14/17 → 16/19 plus
the two new operation ids) ·
`apps/api/test/integration/catalog-draft-api.integration.spec.ts` (+25 −5, the
superseded boundary assertion — see below) ·
`package.json` (+7 −1, five new scripts) ·
`packages/contracts/openapi/openapi.generated.json` (+470, generated) ·
`packages/api-client/src/generated/*` (+145, generated).

### The one superseded assertion

`catalog-draft-api.integration.spec.ts` asserted that `/api/public/products`
returns 404, alongside `/api/products` and `/api/admin/categories`. B04
deliberately makes the first of those false. The assertion was updated rather
than deleted, because what it protected — "the Admin surface invents no public
route" — is still worth protecting: the other two paths must still 404, and a
new positive case asserts the sanctioned catalogue answers **anonymously**, with
no staff cookie, returning `PUBLIC_PRODUCT_LIST_READ`.

A third case asserting the Storefront browser route was removed again after it
proved to be testing the wrong layer: a path outside the API's global prefix
returns 500 from that harness, which is unrelated platform behaviour. The
`/san-pham/<slug>` guarantee lives where it belongs — the gateway seam test
(no tracked template binds it) and the development gateway smoke (it does not
answer through the real edge).

---

## W. Validation matrix

| Command | Result |
| --- | --- |
| `pnpm --filter @embroidery/persistence lint` / `typecheck` | exit 0 |
| `pnpm --filter @embroidery/persistence test` | 9 suites, **112 tests** |
| `pnpm --filter @embroidery/api lint` / `typecheck` | exit 0 |
| `pnpm --filter @embroidery/api test` | **115 suites, 1468 tests** |
| `pnpm --filter @embroidery/api build` | exit 0 |
| Focused B04 unit suite, run 1 | 8 suites, **86 tests** |
| Focused B04 unit suite, run 2 | 8 suites, **86 tests** |
| `pnpm test:public-catalog:integration` | **17 tests** |
| `pnpm test:public-catalog:api` | **13 tests** |
| `pnpm test:public-catalog:gateway` | **6 tests** |
| `pnpm test:public-media:integration` | 3 suites, **44 tests** |
| `pnpm smoke:app2-t01-public-media` | **14/14** |
| `pnpm smoke:app2-t01-public-media:production` | **20/20** + **22/22** |
| `pnpm smoke:app2-b04-public-catalog` | **18/18** |
| `pnpm smoke:app2-b04-public-catalog:production` | **20/20** + **23/23** |
| `node --test tools/api-production-image.test.mjs` + T01-C1 harness tests | **28 tests** |
| `pnpm openapi:generate` / `pnpm check:openapi` | regenerated; up to date |
| `pnpm api-client:generate` / `pnpm check:api-client` | regenerated; up to date |
| `pnpm check:secrets` / `check:lifecycle` / lifecycle test | pass |
| `pnpm check:frontend-boundaries` / `check:spike-boundaries` / `check:e2e` | clean; 32 E2E tests collect |
| `pnpm check:figma-design-index` + its test | 72/72; 31 tests |
| `pnpm db:check:manifest` | 78 tables / 833 columns |
| `node tools/check-file-size.mjs` | pass — no hard-limit violation |
| `pnpm quality` | **exit 0** |
| `git diff --check` | clean |

New scripts added (§26 permits a missing B04 test command):
`test:public-catalog:integration`, `test:public-catalog:api`,
`test:public-catalog:gateway`, `smoke:app2-b04-public-catalog`,
`smoke:app2-b04-public-catalog:production`.

---

## X. Acceptance matrix

| # | Criterion | Status |
| --- | --- | --- |
| 1 | Exact final T01-C1 evidence HEAD read from Git | PASS |
| 2 | A04, A04-C1, T01, T01-C1 commits unchanged | PASS |
| 3 | Clean tracked/staged entry | PASS |
| 4 | `evidences/` untouched | PASS |
| 5 | Nothing pushed | PASS |
| 6 | Canonical phase sequence followed | PASS |
| 7 | T01 integrity gate from real runtime/source | PASS (§C) |
| 8 | No fabricated or unimplemented media URL | PASS |
| 9 | No third B04 operation | PASS — test-enforced |
| 10 | Representability proven against all 33 migrations | PASS (§D) |
| 11 | No migration | PASS |
| 12 | Exactly two public JSON operations | PASS |
| 13 | Operation ids verified in built OpenAPI | PASS |
| 14 | Both operations anonymous | PASS |
| 15 | No Admin/customer guard applied | PASS — source-asserted |
| 16 | Visibility predicate is canonical PUBLISHED | PASS |
| 17 | DRAFT absent publicly | PASS |
| 18 | ARCHIVED absent publicly | PASS |
| 19 | Unknown and unpublished non-disclosing | PASS |
| 20 | Unpublish removes list visibility | PASS |
| 21 | Unpublish removes detail visibility | PASS |
| 22 | No secondary visibility flag | PASS |
| 23 | Filter set source-grounded | PASS |
| 24 | No search | PASS |
| 25 | Stable keyset pagination | PASS — see the §G conflict |
| 26 | No OFFSET | PASS — see the §G conflict |
| 27 | Cursor strict and safe | PASS |
| 28 | Canonical ordering and index verified | PASS — tuple and IDX-065 unchanged |
| 29 | Whole-VND decimal strings exact | PASS (§I) |
| 30 | Draft zero-price sentinel never exposed | PASS |
| 31 | Category projection safe | PASS |
| 32 | No Category UUID leakage | PASS |
| 33 | Q-01 projection complete and minimal | PASS |
| 34 | Q-02 projection complete and minimal | PASS |
| 35 | SEO uses existing facts only | PASS |
| 36 | No invented canonical Storefront URL | PASS |
| 37 | Browser route left unresolved | PASS |
| 38 | List media maps truthfully to THUMBNAIL | PASS |
| 39 | Detail media maps to ordered CATALOG_PREVIEW | PASS |
| 40 | T01 binary route is publication-gated | PASS |
| 41 | No private original delivered | PASS |
| 42 | No storage key/bucket/checksum/ETag leak | PASS |
| 43 | No MinIO/S3/presigned URL | PASS |
| 44 | JSON queries make no object-storage call | PASS — module has no storage provider |
| 45 | Media streamed, not buffered | PASS — T01 route unchanged |
| 46 | Cache policy cannot defeat unpublish | PASS — `no-store` |
| 47 | No invented Outbox dispatcher | PASS |
| 48 | Existing PENDING backlog untouched | PASS |
| 49 | No Audit/Outbox writes from reads | PASS |
| 50 | No mutation from reads | PASS |
| 51 | No N+1 query pattern | PASS |
| 52 | Unit tests pass twice | PASS — 86 ×2 |
| 53 | PostgreSQL integration passes | PASS — 17 |
| 54 | Query-plan/access-path evidence recorded | PASS |
| 55 | Public-media integration passes | PASS — 44 |
| 56 | API integration passes | PASS — 13 |
| 57 | Development and production gateway smokes pass | PASS — 18/18 and 20/20 + 23/23 |
| 58 | Publish→visible and unpublish→hidden proven | PASS |
| 59 | Zero disposable test residue | PASS |
| 60 | Shared-dev durable residue disclosed | PASS (§U) |
| 61 | Exactly two OpenAPI additions | PASS |
| 62 | Client additions only | PASS — 145 insertions, 0 deletions |
| 63 | OpenAPI/client hashes recorded | PASS (§S) |
| 64 | DB baseline unchanged | PASS |
| 65 | Figma unchanged | PASS |
| 66 | No Admin change | PASS |
| 67 | No Storefront change | PASS |
| 68 | No worker change | PASS |
| 69 | No object-storage or production-image change | PASS |
| 70 | No dependency or lockfile change | PASS |
| 71 | Archive follow-ups untouched | PASS |
| 72 | `APP2-T01` untouched | PASS |
| 73 | Quality and secret/lifecycle gates pass | PASS |
| 74 | Commit A implementation/contract/tests only | PASS |
| 75 | Commit B evidence/status only | PASS |
| 76 | Exactly two commits | PASS |
| 77 | Complete report | PASS |
| 78 | Final tracked/staged tree clean | PASS |
| 79 | Nothing pushed | PASS |
| 80 | S01/S02/E01/X01 not started | PASS |

---

## Y. `APP2-S01` / `APP2-S02` / `APP2-E01` handoff

Both operations are available to the Storefront through the generated client as
`publicProductList` and `publicProductDetail`. Carried forward:

- **The browser route is not decided.** `/san-pham/<slug>` remains a proposal in
  `450:404` requiring Product Owner confirmation. B04 returns no canonical URL
  and locks nothing; S02 owns that decision and the metadata built from `name`,
  `description` and the three SEO fields.
- **`product_media.id` is not a durable address.** `APP2-B02` rewrites a
  product's media associations wholesale, so every media edit mints new ids and
  previously issued URLs stop resolving. Safe — they 404, both payloads are
  `no-store`, and B04 projects the address per read — but never cache or persist
  one.
- **`no-store` is a consequence, not a preference.** When a canonical
  cache-invalidation consumer for the `product.published` /
  `product.unpublished` outbox backlog exists, this policy should be revisited
  deliberately. Until then, a Storefront ISR or CDN layer over these payloads
  would reintroduce exactly the staleness the policy prevents.
- **A media reference may be absent.** A card without a deliverable thumbnail
  omits `thumbnail`, and a detail may return `media: []`. The Storefront must
  render that state rather than assume an image exists.
- **The compiled API cannot import `@embroidery/contracts`** (IMP-D018). That
  constraint binds the API only; frontend consumers should use
  `buildPublicProductMediaPath` directly.
- **The ADR-DB5-001 pagination conflict in §G is open** and should be resolved
  before further list surfaces are built on this cursor.

Not started, and untouched: `APP2-S01`, `APP2-S02`, `APP2-E01`, `APP2-X01`.

---

## Final state

```text
APP2-A04    = COMPLETE — CORRECTED (C1) — REVIEW_ACCEPTED
APP2-T01    = COMPLETE — CORRECTED (C1) — REVIEW_ACCEPTED
APP2-T01-C2 = MUST_NOT_BE_CREATED
APP2-A04-C2 = MUST_NOT_BE_CREATED
APP2-B04    = COMPLETE — DELIVERED_FOR_REVIEW
APP2-S01    = READY — NOT STARTED
APP2-S02    = READY — NOT STARTED
APP2-E01    = BLOCKED_BY_APP2-S01_AND_APP2-S02
```
