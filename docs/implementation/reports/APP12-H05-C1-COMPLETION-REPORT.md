# APP12-H05-C1 — Intrinsic Media Dimensions and Desktop Grid CLS Correction

## A. Verdict

```text
APP12-H05-C1    = COMPLETE
APP12-H05       = COMPLETE_AFTER_C1
CORRECTION_USED = 1 / 1   (no C2)
PUSHED          = false
```

The blocker is closed. The public Product and Gallery media projections now
publish the intrinsic dimensions the database has stored all along, the two
grids render them as `<img width height>`, and the shift they existed to remove
is gone — measured, not asserted:

| Surface (desktop) | H05 median | H05 runs > 0.10 | H05-C1 median | H05-C1 runs > 0.10 |
|---|---|---|---|---|
| Discover | 0.0625 | 3 / 11 | **0.0008** | **0 / 11** |
| Discover filtered | 0.0625 | 3 / 11 | **0.0007** | **0 / 11** |
| Gallery feed | 0.0538 | 3 / 11 | **0.0001** | **0 / 11** |

The number that matters most is not the median but the **variance**. In H05 each
of these surfaces was bimodal — the shift depended on how many card images
happened to arrive before first paint, so the metric raced the network. After the
correction all eleven runs on each surface return the *same* value to four
decimal places. The layout is no longer a race, which is the property that makes
the result trustworthy rather than merely lucky.

Every other threshold passes and none regressed:

```text
LCP   116–140 ms   (threshold 2 500 ms)
TTFB  16.7–17.4 ms (threshold 800 ms)
INP   16 ms        (threshold 200 ms, after a real interaction on each surface)
CLS   ≤ 0.0008     (threshold 0.10)
mobile regression  0 / 3 runs over threshold on all three surfaces
```

The baseline is exactly frozen: no new operation, no new route, no migration, no
schema-count change (§X).

---

## B. What was actually changed, and what it is not

`asset_derivatives.width_px` and `height_px` are written by `APP2-W01` and have
existed since the media pipeline shipped. Nothing computed them, generated them
or inferred them here. C1 publishes an existing fact through the two projections
that already address those derivatives, and consumes it in the two grids that
already render those images.

Three things it deliberately is **not**:

- **Not a fixed aspect ratio.** With `width: 100%; height: auto` — which both
  grids already had — the attributes supply only the *ratio*, so the rendered
  picture keeps its own size and shape. UI02's and UI05's variable-height grids
  are preserved exactly, and the delivered `DetailLoading`/card comments that
  refused to invent a ratio were right and remain right.
- **Not a fallback.** Where a derivative stores no dimensions, none are
  published and none are rendered. A guessed box would shift twice — once to the
  guess and again to the truth — which is worse than the single shift it would
  replace.
- **Not an eligibility change.** A derivative without dimensions stays
  deliverable. Requiring dimensions would have silently withdrawn historical
  media from the public surfaces: a functional regression traded for a layout
  metric.

---

## C. Contract change

Additive, on the existing projections only. Nothing was renamed, nothing was
made required, and no operation or route was added.

| Schema | Field | Rendition the size belongs to |
|---|---|---|
| `PublicMediaReferenceResponse` | `width?`, `height?` | the one that reference's own `url` addresses — `thumbnail` on the list, `catalog-preview` on the detail |
| `PublicGalleryEntrySummaryResponse` | `coverWidth?`, `coverHeight?` | `thumbnail`, which `coverUrl` addresses |
| `PublicGalleryAssetResponse` | `width?`, `height?` | `catalog-preview`, which `url` addresses |

All four are optional and absent from every `required` list, so an existing
consumer is unaffected.

### Why the gallery summary uses flat fields

`coverWidth` / `coverHeight` rather than a nested object, because the feed
already publishes its cover as flat `coverAssetId` / `coverUrl`. A nested media
reference there would have been a second shape for the same thing.

### Why the detail projections were included

The hard scope names "the existing public Product media projection" and "the
existing public Gallery media projection". `PublicMediaReferenceResponse` is one
type serving both the Product list and the Product detail, so adding the pair to
it necessarily covers both — and leaving the Gallery *detail* asset dimensionless
while its *cover* carried a size would have made the contract say two different
things about the same media. The four places are one projection change per
module, not scope growth: the Gallery detail and Product detail consumers were
**not** touched, and Product Detail's own CLS was already fixed in H05.

### No private locator is exposed

The added fields are two integers. No bucket, no object key, no checksum, no
`storage_key`. Asserted rather than claimed — see §E.

---

## D. Where the truth comes from, and why it cannot drift

The rule is that the published size must describe **the same derivative the
published URL addresses**. Two query shapes were involved and each is handled so
that the pairing is structural rather than argued.

**Already structural — the two detail reads.** `deliverableMedia` (Product) and
`deliverableAssets` (Gallery) already `INNER JOIN` the exact derivative the
detail rendition maps to. The dimensions are now selected as ordinary columns of
that join, so they come from the same row that qualified the association. There
is no second lookup that could disagree.

**Made structural — the two list reads.** The Product list resolves its thumbnail
through a correlated scalar subquery, and the Gallery feed resolves its cover the
same way. Rather than add a second, differently-written subquery, the existing
one was parameterised by projected column:

```text
deliverableMediaColumn(derivativeKind, role, selection)
  → identical predicate, identical total order, identical `limit 1`
  → differing only in the column projected
```

The Gallery feed does the same by reusing its existing `coverSource()` fragment
and `GALLERY_ASSET_ORDER` for the two dimension subqueries. Since the order
(`display_order ASC, id ASC`) is total, all subqueries provably select the same
row.

Both repositories carry the qualified select-list references
(`asset_derivatives.width_px`, not `assetDerivatives.widthPx`) that `APP11-B03`
learned the hard way are required: Drizzle strips table qualification from a
select-list position, and the subquery joins three tables.

### The determinism argument is not trusted on its own

An argument about SQL is not evidence about SQL, so §E proves the pairing
behaviourally — and the proof was checked by breaking it on purpose.

---

## E. Focused tests

### `apps/api/test/integration/public-media-dimensions.integration.spec.ts` — 6 tests, real PostgreSQL + MinIO

The fixtures give each asset **deliberately different sizes on its two
derivatives**: `THUMBNAIL` 800×1000 and `CATALOG_PREVIEW` 1600×2000. The list
surfaces address `thumbnail` and the detail surfaces address `catalog-preview`,
so reading the wrong derivative does not produce a subtly wrong number — it
produces the *other pair*, and the assertion fails loudly. A fixture with one
size everywhere would have passed against a completely broken join. The ratio is
4:5 rather than 1:1, so a square-assuming fallback anywhere in the chain would be
visible rather than accidentally correct.

```text
Product media
  ✓ publishes the LIST rendition size on the card and the DETAIL rendition size on the page
  ✓ publishes positive dimensions, never zero or negative
  ✓ omits the size entirely when the stored derivative carries none
Gallery media
  ✓ publishes the LIST rendition size on the cover and the DETAIL rendition size on the page
  ✓ omits the cover size entirely when the stored derivative carries none
the additive fields leak nothing
  ✓ carries no storage locator, bucket or checksum in either payload

Tests: 6 passed
```

The leak scan walks every string in all four payloads (product list, product
detail, gallery feed, gallery detail) against `development/derivatives/`,
`development/originals/`, `storageKey`, `storage_key`, `bucket`, `checksum` and
`sha256:`.

**The pairing test was verified to be falsifiable.** The list query was
temporarily mutated to read the `CATALOG_PREVIEW` derivative for the card's
width, and the suite failed exactly where it should:

```text
expect(card?.thumbnail?.width).toBe(THUMBNAIL_SIZE.width)
  Expected: 800
  Received: 1600
Tests: 1 failed, 5 passed
```

The mutation was reverted and the suite returned to 6 passed. Without that check
the test would have been an assertion that the code does what it does.

### `apps/storefront/test/components/grid-intrinsic-dimensions.test.tsx` — 5 tests

```text
Discover grid
  ✓ renders width and height from the API values
  ✓ renders NO width or height when the API publishes none, rather than a guess
  ✓ renders no dimensions when only one of the pair is published
Gallery feed
  ✓ renders width and height from the API values
  ✓ renders NO width or height when the API publishes none, rather than a guess

Tests: 5 passed
```

The half-pair case is included because a partially-published size is the one
shape that could silently produce a nonsensical box.

### The existing suites caught the change, and now assert it

`public-product.projection.spec.ts` used exact-equality assertions and failed the
moment the fields appeared — correct behaviour for an additive contract change.
Both expectations were updated to assert the new fields, and the second detail
image in that fixture deliberately keeps **no** size, so the spec now covers
presence and absence side by side.

```text
apps/api        catalog | gallery | public-product   53 suites, 922 tests passed
storefront      discover | gallery                   17 suites, 299 tests passed
```

---

## F. Frontend correction

```text
apps/storefront/src/shared/media/intrinsic-size.ts          new, 72 lines
apps/storefront/src/features/product-discovery/model/discover-feed.ts
apps/storefront/src/features/product-discovery/components/product-card.tsx
apps/storefront/src/features/gallery-feed/model/gallery-feed.ts
apps/storefront/src/features/gallery-feed/components/gallery-cover.tsx
apps/storefront/src/features/gallery-feed/components/gallery-card.tsx
```

One shared module holds the narrowing and the attribute spread, so "no size ⇒ no
attributes" is decided in exactly one place and both grids inherit it. No image
framework was introduced; both remain plain `<img>` for the reasons their own
comments give — the media route is publication-gated and `no-store`.

**Filtered Discover inherits the fix by construction.** `/kham-pha` and
`/kham-pha?category=…` render the same `ProductMasonry` → `ProductCard`, so there
is one corrected consumer rather than two that could diverge. The remeasurement
confirms it (§G).

Live markup from the deployed staging build:

```html
<img class="discover__card-image" src="/api/public/products/…/thumbnail"
     alt="Áo thun H05 mẫu 1" width="800" height="800" loading="lazy" decoding="async"/>
<img class="gallery-feed__card-image" src="/api/public/gallery-entries/…/thumbnail"
     alt="Bộ sưu tập đo hiệu năng 1" width="800" height="800" loading="lazy" decoding="async"/>
```

All 20 Discover cards on the page carried both attributes.

---

## G. Remeasurement

Bounded exactly as directed: three surfaces, the existing representative H05
fixture, a fresh production-like disposable staging cluster. **The full H05
matrix was not re-run.**

```text
cluster        minikube profile embroidery-h05c1, Kubernetes v1.31.4
images         embroidery/{api,worker,storefront,admin}:339a0eaf4126-c1, --target runner
gateway        Gateway API v1.2.1 + NGINX Gateway Fabric v1.6.1, real TLS termination
fixture        the APP12-H05 fixture unchanged: 4 categories, 48 products,
               31 gallery entries, 570 real WebP objects
               (THUMBNAIL avg 82 KiB, CATALOG_PREVIEW avg 304 KiB)
method         1 warm-up + 11 cold measured runs per desktop surface,
               each in a brand-new browser context; 3 cold runs per mobile surface
model          LAB_MEASUREMENT / NOT_FIELD_CRUX, as in H05
```

### Desktop gate — 11 runs each

| Surface | min | median | max | > 0.10 | LCP | TTFB | INP | interaction performed |
|---|---|---|---|---|---|---|---|---|
| Discover | 0.0008 | **0.0008** | 0.0008 | **0 / 11** | 140 ms | 16.7 ms | 16 ms | category filter link |
| Discover filtered | 0.0007 | **0.0007** | 0.0007 | **0 / 11** | 132 ms | 16.8 ms | 16 ms | category nav link |
| Gallery feed | 0.0001 | **0.0001** | 0.0001 | **0 / 11** | 116 ms | 17.4 ms | 16 ms | "Tải thêm mục" continuation |

Every run of every surface returned an identical value. That is the signature of
a layout that no longer depends on image arrival timing.

### Mobile regression — 3 runs each

```text
discover           [0, 0, 0]   0/3 over threshold
discover-filtered  [0, 0, 0]   0/3 over threshold
gallery-feed       [0, 0, 0]   0/3 over threshold
```

Mobile was already clean in H05 (single-column layout puts the growth below the
fold) and is unchanged — the correction did not disturb it.

### Geometry proof

The metric could improve for the wrong reason, so the mechanism was observed
directly: element geometry sampled every animation frame, reporting how many
image boxes already have a non-zero height **while their bytes have not
arrived**.

```text
### Discover
  first frame with images:  20 images, 0 complete, 20 boxes already reserved
  grid height     first 1422px → settled 1422px    growth 0px
  continuation y  first 1477px → settled 1477px    displacement 0px

### Gallery feed
  first frame with images:  12 images, 0 complete, 12 boxes already reserved
  masonry height  first 2011px → settled 2011px    growth 0px
  continuation y  first 2268px → settled 2268px    displacement 0px
```

Against the H05 measurement of the same surfaces:

| | H05 | H05-C1 |
|---|---|---|
| Discover grid growth as images load | 577 → 1 422 px (**+845**) | 1 422 → 1 422 px (**0**) |
| Discover continuation displacement | +845 px | **0 px** |
| Gallery masonry growth | 539 → 2 011 px (**+1 472**) | 2 011 → 2 011 px (**0**) |
| Gallery continuation displacement | +1 472 px | **0 px** |

Both grids reach their final height before a single image byte arrives. The
large grid-growth shift is not reduced — it is absent.

---

## H. Follow-up reconciliation

```text
FU-APP12-H05-01 = CLOSED_BY_APP12_H05_C1
```

Its subject was exactly this: publish the stored derivative dimensions and
consume them on the two grids. Done, tested and remeasured.

Routed to `APP12-V02` without new identifiers, as directed:

```text
FU-APP12-H05-02  → APP12-V02   above-the-fold lazy/fetchpriority
FU-APP12-H05-03  → APP12-V02   Product Detail thumbnail-strip rendition (~672 KiB)
FU-APP12-H05-04  → APP12-V02   Admin order-detail CLS 0.1316 (operator surface)
```

The general responsive-image finding (H05-04: no `srcset`/`sizes`; a 390 px phone
downloads 95 % of desktop image weight) may be evaluated under `APP12-V02`. **No
new follow-up id was created for it.** Worth recording for whoever picks it up:
that work now has what it was missing, because a responsive candidate set needs
the per-derivative dimensions this checkpoint just published.

Preserved unchanged:

```text
FU-APP11-B03-02 → FU-APP12-H02-05   media cache architecture (edge; not reopened)
FU-APP12-H02-05 → REQUIRED_BEFORE_R01
```

Nothing in C1 touched a cache directive, an edge concern or a Gateway behaviour.

---

## I. Files changed

```text
API — contract and reads
M  apps/api/src/modules/catalog/domain/public-media-dimensions.ts               (new, 70)
M  apps/api/src/modules/catalog/domain/repositories/public-product.repository.ts
M  apps/api/src/modules/catalog/application/public-product.projection.ts
M  apps/api/src/modules/catalog/infrastructure/persistence/drizzle-public-product.repository.ts
M  apps/api/src/modules/catalog/presentation/schemas/public-product.response.ts
M  apps/api/src/modules/gallery/domain/repositories/public-gallery-entry.repository.ts
M  apps/api/src/modules/gallery/application/public-gallery-entry.projection.ts
M  apps/api/src/modules/gallery/infrastructure/persistence/drizzle-public-gallery-entry.repository.ts
M  apps/api/src/modules/gallery/infrastructure/persistence/gallery-public-media-eligibility.ts
M  apps/api/src/modules/gallery/presentation/schemas/public-gallery-entry.response.ts

Generated
M  packages/contracts/openapi/openapi.generated.json      (+4 optional properties)
M  packages/api-client/src/generated/embroidery-api.schemas.ts   (+12 lines)

Storefront — the two consumers
A  apps/storefront/src/shared/media/intrinsic-size.ts             (new, 72)
M  apps/storefront/src/features/product-discovery/model/discover-feed.ts
M  apps/storefront/src/features/product-discovery/components/product-card.tsx
M  apps/storefront/src/features/gallery-feed/model/gallery-feed.ts
M  apps/storefront/src/features/gallery-feed/components/gallery-cover.tsx
M  apps/storefront/src/features/gallery-feed/components/gallery-card.tsx

Tests
A  apps/api/test/integration/public-media-dimensions.integration.spec.ts   (268)
A  apps/storefront/test/components/grid-intrinsic-dimensions.test.tsx      (127)
M  apps/api/test/support/product-publication-fixtures.ts    (optional per-kind dimensions)
M  apps/api/test/support/gallery-public-fixture.ts          (optional per-kind dimensions)
M  apps/api/src/modules/catalog/application/public-product.projection.spec.ts
M  apps/api/src/modules/catalog/application/public-product.query.spec.ts

Docs
A  docs/implementation/reports/APP12-H05-C1-COMPLETION-REPORT.md
M  docs/implementation/reports/APP12-H05-COMPLETION-REPORT.md   (correction notice only)
M  docs/implementation/phases/APP12-HARDENING-UAT-PRODUCTION-READINESS.md
```

Not changed: no migration, no `packages/database` schema, no route file, no
Admin source, no cache directive, no infrastructure manifest. The staging overlay
was pinned to deploy and **reverted to its four committed
`REPLACE_WITH_IMMUTABLE_RELEASE_REF` placeholders**.

File-size governance: every source file is well under 400 lines (largest touched:
the Product repository at 364) and every test under 600 (largest: 268).

---

## J. Validation

Change-impact only. Commands actually run:

```text
git diff --check                                              clean
pnpm --filter @embroidery/api typecheck                       PASS
pnpm --filter @embroidery/api lint                            PASS
pnpm --filter @embroidery/storefront typecheck                PASS
pnpm --filter @embroidery/storefront lint                     PASS
pnpm --filter @embroidery/api openapi:generate                125 / 138 / 278
pnpm --filter @embroidery/api openapi:check                   PASS — artifact up to date
pnpm --filter @embroidery/api-client generate                 2 files, tree hash 60443066…
pnpm --filter @embroidery/api-client check:generated          PASS — up to date
jest --config jest.public-media.config.mjs -t dimensions      6 passed  (real PG + MinIO)
  … with the pairing assertion mutation-verified as falsifiable
jest --testPathPatterns="catalog|gallery|public-product"      53 suites, 922 tests passed
storefront jest --testPathPatterns="discover|gallery"         17 suites, 299 tests passed
node tools/check-category-source-of-truth.mjs                 PASS — 2 581 files scanned
node tools/check-storefront-route-authority.mjs               PASS — routes unchanged
node tools/check-release-config.mjs staging                   PASS (20 resources)
node tools/check-report-secrets.mjs                           PASS — 652 documents
prettier --check (api + storefront src and test)              all matched files clean
```

Live evidence:

```text
production-like disposable staging deploy      cluster embroidery-h05c1
representative fixture verification            4 / 48 / 31 / 570, unchanged from H05
rendered markup verification                   20/20 Discover cards carry width+height
11-run desktop CLS gate × 3 surfaces           0/11 over threshold on each
3-run mobile regression × 3 surfaces           0/3 over threshold on each
LCP / TTFB / INP regression                    PASS on all three
geometry proof (Discover + Gallery)            0 px grid growth, 0 px displacement,
                                               every box reserved before its bytes arrived
disposable teardown                            cluster deleted, edge removed, images removed
```

Not run, per the scope: H04 rehearsals, the full H05 matrix, H06, H07, H08,
V01/V02, G03 dataset creation, production deployment.

---

## K. Hygiene

```text
disposable minikube profile embroidery-h05c1   deleted ("Removed all traces")
disposable PostgreSQL + MinIO                  destroyed with the cluster (emptyDir)
disposable edge container                      removed
C1 release images                              removed from the host
per-run credentials and certificates           generated per run, never committed, never echoed
shared development compose stack               stopped for measurement isolation, RESTARTED
staging overlay image tags                     reverted to committed placeholders

shared_dev_commercial_residue = 0
G03_data_created              = false
production_deployed           = false
.env written                  = never
secrets in report             = none — checker PASS over 652 documents
```

Nothing was written to the shared development database. The only database
touched was the disposable `embroidery_db7_h02_staging` inside the cluster,
destroyed with it; the fixture refuses any database not named
`embroidery_db7_*`.

---

## X. Baseline

Freshly measured:

```text
OpenAPI paths       125    unchanged
OpenAPI operations  138    unchanged
OpenAPI schemas     278    unchanged
public operations    49    unchanged
release matrix       28 DENY / 18 ALLOW / 3 SCOPE_GATED (= 49)   unchanged
migrations           38    committed files, and 38 applied in the live database
MIGRATION_0039       absent
DB tables            79    live disposable database
Admin routes         26
Storefront routes    20
Figma                unchanged — no artifact opened or edited

NEW_BUSINESS_HTTP_OPERATIONS = 0
NEW_BUSINESS_ROUTES          = 0
DB schema delta              = 0
```

**The schema count did not change, and that is worth stating explicitly since
the scope allowed it to.** The four fields were added as optional properties of
four *existing* schemas, so no new component schema was mechanically created. The
public operation count is unchanged for the same reason: no operation was added,
removed or re-shaped.

The release matrix is a partition of the 49 public operations. No operation
changed, so it cannot have changed; that is stated as an argument rather than
presented as a fresh measurement.

---

## Y. Roadmap

```text
APP12-H05-C1 = COMPLETE
APP12-H05    = COMPLETE_AFTER_C1
APP12-H06    = NEXT
CORRECTION_USED = 1 / 1   (no C2)
```

`APP12-H06` is not started.

### Wave-1 CWV position after this correction

```text
LCP   PASS   worst customer-critical median 364 ms   vs 2 500 ms
CLS   PASS   worst customer-critical median 0.0008   vs 0.10
INP   PASS   worst customer-critical median   24 ms  vs 200 ms
TTFB  PASS   worst customer-critical median 17.4 ms  vs 800 ms
```

No customer-critical Wave-1 surface breaches `PO-APP12-005`, and the one
remaining threshold breach in the H05 findings set — Admin order detail at
0.1316 — is an operator surface routed to `APP12-V02`.
