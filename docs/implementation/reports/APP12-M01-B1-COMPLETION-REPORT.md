# APP12-M01.B1 — public Product media rendition, intrinsic dimensions and effective-primary consistency

`APP12-M01.B1 = COMPLETE`

Internal work package inside the single `APP12-M01` checkpoint. Not a new APP12
checkpoint id. Nothing was pushed and nothing was deployed.

---

## A. Verdict

Three things changed, all inside the existing public Product contract and the
Storefront Product Detail gallery. No new HTTP path, operation, schema, route or
migration.

**1. The thumbnail strip stopped downloading the large preview.** The detail
media item now also publishes the small rendition of the same association —
`thumbnailUrl`, `thumbnailWidth`, `thumbnailHeight` — and the strip addresses it.
Measured on a 20-image Product in a production-mode disposable world:

```text
catalog-preview requests at first render   17  →  1
thumbnail requests                          0  →  20
projected first-render image weight     6.63 MB → 1.76 MB   (≈ 73 % less)
```

`FU-APP12-H05-03` is closed.

**2. One effective-primary rule now drives all four public surfaces.** The card
thumbnail, `media[0]`, `og:image` and the JSON-LD image list resolve the same
association by construction rather than by three queries happening to agree.
`APP12-M01.A` proved they did not: on a published Product whose stored primary
had become undeliverable, the card showed **no image at all** while the page it
linked to showed the next one and `og:image` silently substituted a third answer.
Proven live in this package: after rejecting the stored primary, all four
surfaces named `da3b0b9d…`, and `product_media` was byte-identical afterwards.

**3. The intrinsic dimensions published since `APP12-H05-C1` are consumed.** Both
images carry the width and height of the derivative they actually load — 800×800
on the stage, 400×400 on every strip control. Detail CLS measured **0.0000**.

**One defect was introduced and caught by live evidence before it left the
package.** Publishing a `thumbnailUrl` for every media item made nineteen of
twenty small addresses answer **404**, because the delivery route still
restricted that rendition to the stored `THUMBNAIL` association. Every suite
stayed green — none of them opened a published address through the delivery
service. §D.3 and §N record the fix and the new test that pins it.

---

## B. M01.A PO reconciliation

| Frozen decision | Honoured in B1 |
|---|---|
| `MAX_PRODUCT_IMAGES = 20` | Used as the measurement subject. **The cap is not enforced in B1** — that is `M01.DB1`. |
| Primary = position 0, `role = THUMBNAIL`, `primary_is_first = true` | Unchanged. `PUBLIC_EFFECTIVE_PRIMARY_ORDER` key 2 keeps the stored designation authoritative whenever it is usable. |
| Remove-primary promotes the next deterministically | Read-side half implemented: the *effective* primary promotes deterministically. The write-side rule stays with the Admin package. |
| Admin reorder: keep move controls, set-primary later, drag-and-drop deferred | **Untouched.** No Admin file changed. |
| Non-detail surfaces: primary image only | Unchanged — the list projection still carries one `thumbnail` and no `media` array. |
| Product Detail: ordered gallery, large preview, strip, **counter later** | Gallery and strip unchanged in composition. **No counter added.** |
| `ORDER_MEDIA_SNAPSHOT` out of scope · `SKU_SPECIFIC_IMAGES` deferred | Untouched. |

Explicitly **not** done, as instructed: the 20 cap, DB constraints, migration
`0039`, the Admin compact gallery, the visible counter, and published-Product
media editing.

`FU-APP12-H05-02` (above-the-fold lazy / `fetchpriority` on Homepage and
Discover) keeps its existing owner. B1 sets `fetchpriority="high"` on the Product
Detail stage only, because that is this page's measured LCP element; the
Homepage and Discover halves were not absorbed.

---

## C. Effective-primary authority

One rule, documented once in `public-product-catalog.policy.ts` as
`PUBLIC_EFFECTIVE_PRIMARY_ORDER`, and expressed as the same four ordering keys in
both statements that need it:

```text
1. are BOTH renditions serveable?   (yes first)
2. is this the stored THUMBNAIL?    (yes first)
3. display_order                     (ascending)
4. id                                (ascending — total order)
```

**Key 2 replaced a filter.** The card's correlated subquery used to carry
`role = 'THUMBNAIL'` in its `WHERE`. In the healthy case the behaviour is
byte-identical — the stored primary still wins, on a key instead of a predicate —
but a card whose stored primary had gone undeliverable used to resolve to
nothing.

**Key 1 was not in the plan, and the integration suite is why it exists.** With
only keys 2–4, a test that failed a single image's `CATALOG_PREVIEW` still split
the two surfaces: the card renders `thumbnail` and the page renders
`catalog-preview`, so "deliverable" is a *per-rendition* fact and a half-broken
image was serveable to a card while being invisible on the product page that card
opens. Demoting incomplete images ahead of every other consideration is what
makes one row satisfy both surfaces. "Both renditions ready" is not a new
standard: `PRODUCT_PUBLICATION_DERIVATIVE_KINDS` already requires it before a
Product may be published at all.

An incomplete image is **demoted, never withdrawn** — it still appears in the
gallery when its own rendition is serveable, so a visitor loses a position rather
than a photograph.

**Public reads never write.** No projection promotes a row or rewrites a role.
Asserted directly: every public surface was read twice on a degraded Product and
`product_media` came back identical, still naming the operator's original choice.
Restoring the asset restores the original primary with no repair step — also
asserted.

---

## D. Public detail media contract

### D.1 The addition

`PublicMediaReferenceResponse` gains three **optional** fields:

```json
{
  "url": "/api/public/products/{slug}/media/{id}/catalog-preview",
  "role": "THUMBNAIL",
  "width": 1250, "height": 1250,
  "thumbnailUrl": "/api/public/products/{slug}/media/{id}/thumbnail",
  "thumbnailWidth": 480, "thumbnailHeight": 480
}
```

Flat, not nested, so **no new schema is created**. Same association id in both
addresses; only the rendition segment differs. `url`/`width`/`height` describe the
`CATALOG_PREVIEW` derivative and `thumbnailUrl`/`thumbnailWidth`/`thumbnailHeight`
the `THUMBNAIL` one — two different rows, never one value spread twice. Asserted
both ways: the projection unit test pins deliberately different pairs, and the
integration fixture gives every asset different sizes per rendition so reading the
wrong derivative swaps the numbers rather than hiding the error.

The three fields are **absent together** when the small derivative is not itself
deliverable, so a client falls back to `url` for that one strip control rather
than losing the image. The list projection is untouched and does not gain them.

### D.2 The published `role` follows the effective primary

`toPublicMediaReference` derives `role` from **position**, not from the stored
column. The repository returns rows in effective-primary order, so index 0 *is*
the effective primary — and saying `THUMBNAIL` there is what makes the detail
array agree with the card on a degraded Product. In the healthy case both
derivations give the same answer.

That left `toPublicMediaRole` — the helper that narrowed a stored role to the
public vocabulary — referenced by nothing but its own test. It was deleted rather
than kept: an exported function whose only caller is the assertion that it exists
is dead weight. Its test was rewritten to assert the stronger property the change
created — a stored `DETAIL` role is now **unrepresentable** on the wire rather
than merely mapped away, because the published value never reads the column.

### D.3 The delivery-route correction this forced

`REQUIRED_MEDIA_ROLE_BY_RENDITION` restricted the `thumbnail` rendition to the
stored `THUMBNAIL` association, on the reasoning that it existed only to serve the
product card. Publishing a `thumbnailUrl` for every media item made that
restriction fatal: **19 of 20** published addresses answered 404 on a real page.

Both entries are now `undefined`. Two things had retired the original reasoning:

- the card no longer selects by that role — `PUBLIC_EFFECTIVE_PRIMARY_ORDER` does,
  precisely so a degraded Product still has an image — so the delivery predicate
  guarded nothing the read side still relied on; and
- the gallery legitimately needs the small rendition of `GALLERY` associations.

**No visibility changed.** The route still requires the Product `PUBLISHED` under
a published category, the association bound to *that* Product, the asset in the
catalog lane and `ACCEPTED` and untombstoned, and the derivative `READY`,
unwatermarked and stored. `role` is an editorial designation, never an
authorization boundary: an image already served at 1 250 px is not made more
private by being refused at 480 px.

---

## E. Generated client

```text
pnpm --filter @embroidery/api openapi:generate   126 paths · 139 operations · 278 schemas
pnpm --filter @embroidery/api-client generate    2 files, tree hash 7c0b62cc…
pnpm --filter @embroidery/api openapi:check      up to date
pnpm --filter @embroidery/api-client check:generated  up to date
```

The OpenAPI artifact diff is **15 insertions, 0 deletions**; the client diff is
**6 insertions, 0 deletions** — three optional fields with their descriptions on
one existing interface. No generated file was edited by hand.

---

## F. Storefront rendition policy

| surface | rendition | loading |
|---|---|---|
| stage (selected) | `catalog-preview` | `loading="eager"`, `fetchpriority="high"` |
| thumbnail strip | **`thumbnail`** | `loading="lazy"`, `decoding="async"` |
| non-selected previews | none | fetched only when that image is selected |
| lightbox | `catalog-preview` | unchanged — opens the **selected** image |

Measured on the 20-image Product: **1** `catalog-preview` request at first
render, and **3** in total after two thumbnail selections — so the nineteen
non-selected previews are never eagerly fetched. Selecting thumbnail N switches
the stage to `media[N].url` and updates the alt (`… — ảnh 3 trên 20`) and
`aria-current`.

The stale comment claiming the contract published no dimensions — untrue since
`APP12-H05-C1` — is gone. `next/image` is still avoided, but now for its real
reason: the route serves one fixed rendition, so a loader and a layout would be
machinery for an address that already resolves.

---

## G. Intrinsic dimensions

`ProductDetailMedia` carried only `url`; it now carries both addresses and both
size pairs. Sizes are applied **only as complete pairs**, re-checked for
finiteness and positivity at the view-model boundary — the value is one step from
becoming a rendered attribute, and a zero collapses the box the pair exists to
reserve. A lone width is dropped rather than emitted, asserted as its own test.

Measured: stage `width=800 height=800`, every strip control `width=400
height=400`, at all three viewports. No ratio is invented anywhere; the stage
still sits in its bounded box under `object-fit: contain` and keeps the studio's
own proportions.

---

## H. Primary-unavailable proof

`app12-m01b1-probe-3`, PUBLISHED with three deliverable images. Its stored
primary asset was moved to `REJECTED`; nothing else changed.

| surface | before | after |
|---|---|---|
| detail `media[0]` | `35127c38…` role `THUMBNAIL` | **`da3b0b9d…`** role `THUMBNAIL` |
| card `thumbnail` | `35127c38…` | **`da3b0b9d…`** (was **absent** before B1) |
| `og:image` | `35127c38…` | **`da3b0b9d…`** |
| JSON-LD `image[0]` | — | **`da3b0b9d…`** (2 images, ordered) |

All four agree. Read back immediately afterwards, `product_media` still held
`THUMBNAIL`/`display_order 0` pointing at the rejected asset — **no promotion was
persisted**.

With **every** asset rejected, the deliberate no-image fallback holds: `media`
is `[]`, the card carries no `thumbnail` field, the page emits **no** `og:image`
tag rather than a fabricated one, and the Product stays listed.

The integration suite covers the same rule under three different degradations —
rejected asset, tombstoned asset, and a preview that never became `READY` —
because the rule is about eligibility, not about one column.

---

## I. 20-image performance evidence

Production-mode Storefront behind the real Nginx gateway, disposable world.

```text
requests at first render     1 × catalog-preview   20 × thumbnail   0 failures
LCP    232 ms   (budget 2 500)   PASS
CLS  0.0000     (budget 0.10)    PASS
INP     32 ms   (budget 200, measured on a real thumbnail click)   PASS
TTFB   152 ms   (budget 800)     PASS
```

CLS is exactly zero because both images now reserve the correct box before any
byte arrives.

Weight is projected from the **real** derivative means `APP12-M01.A` measured on
the shared development database (`CATALOG_PREVIEW` 389 731 B, `THUMBNAIL`
72 277 B — a 5.4× ratio) applied to the measured request counts, because the
disposable world's synthetic low-frequency images compress far below real
photography and would understate both sides:

```text
before   17 × catalog-preview                    ≈ 6.63 MB
after     1 × catalog-preview + 19 × thumbnail   ≈ 1.76 MB
```

**The `APP12-V02` fold is untouched.** At 1440×900 the gallery column is 682 px,
the strip 79 px, and the price sits at y=349 — identical to the `APP12-M01.A`
baseline for the same shape. No horizontal overflow at any viewport.

---

## J. Accessibility regression

At 1440, 1024 and 390, on the 20-image Product:

| check | result |
|---|---|
| axe (WCAG 2.0/2.1/2.2 A + AA) | **0 violations** — not merely zero serious/critical |
| control element | 20 × `<button>` |
| selected state | exactly one `aria-current="true"` |
| keyboard | one Tab stop; `ArrowRight` moves selection and the stage follows |
| stage `alt` | `… — ảnh 2 trên 20` — truthful, index-based |
| lightbox | opens the **selected** image (`currentSrc` equals the stage's), reports `Ảnh 2 trên 20` as text |
| focus-visible | preserved |

---

## K. Follow-up reconciliation

```text
FU-APP12-H05-03 = CLOSED_BY_APP12_M01_B1
FU-APP12-H05-02 = OPEN — existing owner, not absorbed
```

No new follow-up identifier was created.

---

## L. Files changed

**API — contract and rule (7 source, 3 spec)**

```text
domain/public-product-catalog.policy.ts            PUBLIC_EFFECTIVE_PRIMARY_ORDER
domain/public-product-media.policy.ts              the delivery role restriction lifted (§D.3)
domain/repositories/public-product.repository.ts   thumbnailAvailable / thumbnailSize on the row
application/public-product.projection.ts           the three fields; role by position
presentation/schemas/public-product.response.ts    three optional properties
infrastructure/persistence/drizzle-public-product.repository.ts
infrastructure/persistence/public-product-media.sql.ts        NEW — see §M
```

**Storefront (4 source)**

```text
model/product-detail-view.ts               both addresses, both size pairs, pair validation
components/detail-media-stage.tsx          dimensions, eager, fetchpriority
components/detail-thumbnail-strip.tsx      the small rendition and its size
components/detail-gallery.tsx              passes the selected image's size to the stage
```

**Generated (2)** — `openapi.generated.json` (+15), `embroidery-api.schemas.ts` (+6).

**Tests (7)** — the projection spec, the media-policy spec, the media-service
spec, the Storefront gallery and model specs, the shared detail fixture, the
public catalog-media *visibility* integration suite (§N), and one new
integration suite.

**Docs (3)** — this report, plus the M01.A roadmap entries.

No Admin file, no migration, no Figma artefact, no `.env`.

---

## M. File-size

Adding the fourth ordering key and its correlated `EXISTS` took
`drizzle-public-product.repository.ts` from 364 to **457 lines**, over the
400-line hard limit. Split on the seam the code already had — the repository owns
*queries*, and all three of its statements first have to answer the same two
questions, "is this image deliverable" and "which is the primary":

```text
drizzle-public-product.repository.ts   457 → 316
public-product-media.sql.ts            NEW    198
```

Every other touched file is inside its limit; the largest test file is the new
integration suite at 420 lines against the 600-line test limit.

---

## N. Validation

Change-impact only. Every command was run; results are quoted, not summarised.

```text
tsc --noEmit          @embroidery/api · @embroidery/storefront · @embroidery/api-client   clean
eslint                @embroidery/api (src+test) · @embroidery/storefront (src+test)      clean
prettier --check      every touched file                                                  clean
git diff --check                                                                          clean

openapi:generate      126 paths · 139 operations · 278 schemas
openapi:check         up to date
api-client generate + check:generated                                                     up to date

pnpm --filter @embroidery/api exec jest --testPathPatterns "catalog|public-product-media|release-gate"
      Test Suites: 47 passed, 47 total
      Tests:       703 passed, 703 total

pnpm --filter @embroidery/api exec jest --config jest.public-media.config.mjs
      Test Suites:  1 failed, 5 passed, 6 total
      Tests:       14 failed, 75 passed, 89 total
      the 14 are `public-media-side-background`, pre-existing — see below
      of which `public-media-effective-primary` (NEW): 12 tests, all pass

pnpm --filter @embroidery/storefront exec jest      134 files · 2 541 tests   pass

node tools/check-storefront-route-authority.mjs            pass
node tools/check-storefront-product-detail-authority.mjs   pass
```

**One test rewritten, and why that is not a weakened assertion.**
`public-media-visibility.integration.spec.ts` held
`does not serve the card rendition from a gallery association`, which asserted
`404` for `…/{galleryMediaId}/thumbnail`. That case was **editorial, not a
visibility boundary**: two lines above it the same suite serves that exact
association `200` at `catalog-preview`, so the image was never withheld — only
one of its two renditions was, for no security reason. B1's strip needs the small
rendition of precisely those gallery associations (§D.3). The case is now
`serves a gallery association at both renditions (APP12-M01-B1)` and asserts
`200` for **both**. Every genuine visibility case in that suite — unpublished
product, withdrawn category, foreign association, unknown id, ineligible
derivative — is untouched and still passes.

**One pre-existing failure, not caused by B1.** `public-media-side-background`
reports 14 failures. Verified by stashing every change and re-running on the
clean tree: **the same 14 failures**. Side backgrounds are
`product_sides.background_asset_id`, a different repository that this package
does not touch. Recorded rather than fixed — it is not B1's to repair.

**An earlier run reported 3 suite-level failures; they were the Docker daemon,
not the change.** During validation the Docker Desktop Linux engine wedged (the
`docker-desktop` WSL distro `Stopped`, `docker version` returning HTTP 500) and
the DB-integration suites lost the shared dev PostgreSQL mid-run. That run
reported `3 failed, 44 passed` **suites** while every one of its 703 *tests*
passed — the signature of a setup/teardown failure, not of an assertion. After
the engine was restarted the identical command returned **47 passed, 47 total ·
703 passed**, quoted above. No source change was involved.

**Live, in the disposable world:** the 20-image rendition and network
measurement, the four-surface primary-unavailable proof, the no-eligible-media
fallback, CWV at 1440, keyboard and lightbox behaviour, and axe at three
viewports. All quoted in §H–§J.

No i18n gate was needed: **no user-facing string was added or changed.**

---

## O. Hygiene

```text
shared_dev_mutations = 0
G03_data_created     = false
production_deployed  = false
pushed               = false
```

Shared development stack: **never written**. Verified identical before and
after — `product_media` 3 rows, `products` 30, `assets` 53, and
`tui-vai-theu-thu-cong` still at `updated_at 2026-09-05 10:43:13.437+00`.

Disposable world teardown verified: **0 containers, 0 volumes, all six ports
closed** (three host processes that survived a hard kill were terminated
explicitly and re-checked), temporary tooling deleted, run credential removed.

**Correction, found on the final sweep.** One host process from that tooling —
`packages/e2e-testing/.m01-tmp/m01-world.mjs`, PID 27708 — was still alive after
the sweep above, holding one ephemeral loopback port (59342). Its directory had
been deleted, so the earlier "temporary tooling deleted" claim was true of the
files and not of the process. It was terminated explicitly and re-checked: the
process is gone and the port is closed. It served no port of the disposable world
and no container or volume of that world survived — `docker ps -a` shows only the
shared `embroidery-dev-*` stack and unrelated projects, and no `embroidery_db7_*`
volume exists. Nothing it could have touched was shared dev, whose row counts and
timestamps are re-verified above.

No secret was read, written, echoed or committed. No `.env` write of any kind.

---

## P. Baseline

Unchanged in every dimension:

```text
OpenAPI paths       126 → 126
OpenAPI operations  139 → 139
OpenAPI schemas     278 → 278
public operations    49 →  49
migrations           38 →  38
DB tables            79 →  79
Admin routes         26 →  26
Storefront routes    20 →  20
```

One existing schema changed additively (three optional properties). No new HTTP
path, operation, schema, route or migration.

---

## Q. M01 internal roadmap

```text
M01.B1  Rendition, intrinsic dimensions, effective primary   COMPLETE
M01.DB1 Invariants and the 20 cap (migration 0039)           NOT_AUTHORIZED — next
M01.A1  Admin media management UI                            NOT_AUTHORIZED
M01.S1  Product Detail visible counter                       NOT_AUTHORIZED
M01.E1  Cross-boundary acceptance                            NOT_AUTHORIZED
```

Two things B1 deliberately left for a later package, both now better grounded:

- **The cap is unenforced.** Nothing refuses a twenty-first image; `M01.DB1` owns
  the request-schema limit and the `CHECK`.
- **Published-Product media editing** is still refused by the Admin form
  (`status === DRAFT`). The Product Owner has ruled that media-only curation must
  eventually work on a live Product through a bounded media-scoped write
  authority; that is not B1's and was not touched.

```text
APP12-M01.B1 = COMPLETE
APP12-M01    = IMPLEMENTATION_IN_PROGRESS

INTERNAL_NEXT = M01.DB1
APP12-G03     = NOT_AUTHORIZED
```
