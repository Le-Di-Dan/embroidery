# APP11-S03 — Gallery Entry Detail — Completion Report

**Phase:** APP11 — Gallery, Content, SEO and Store Presentation
**Checkpoint:** `APP11-S03` — Gallery entry detail `/bo-suu-tap/[slug]`
**Date:** 2026-08-31
**Correction budget:** 1 (`APP11-S03-C1`) — used

> **Superseded in one place.** The Product Owner returned this checkpoint for
> `APP11-S03-C1`, which ran the eight live acceptance checks §N below records as
> not exercised. All eight now pass, no S03 defect was found, and no production
> code changed. **Read §N of this report together with
> `APP11-S03-C1-COMPLETION-REPORT.md`, which supersedes its "fixture-dependent"
> subsection.** Everything else here stands as delivered.

---

## A. Verdict

```text
APP11-S03 = COMPLETE
```

One new Storefront route, `/bo-suu-tap/[slug]`, delivered on the approved
`APP11-D01` detail authority: a text-bearing entry page with ordered media, an
accessible lightbox, an optional Related Product affordance, per-entry SEO, and
the activation of the detail action `APP11-S02` staged on every feed card.

The gallery model stayed flat, the backend was not touched, no public origin was
invented, and `APP11-S04`'s SEO infrastructure was not started.

One limitation is recorded rather than papered over, and one live check could
not be produced through a delivered flow; both are in §M and §N.

---

## B. Entry baseline and design authority

Baseline confirmed unchanged at entry and at exit:

| Artifact | Entry | Exit |
|---|---|---|
| OpenAPI | 116 paths / 128 operations / 252 schemas | **116 / 128 / 252** |
| Migrations | 37 | **37** |
| Admin routes | 25 | **25** |
| Storefront routes | 13 | **14** |
| Figma registry | 532 | **532** |

Design authority — `FIG-APPROVAL-APP11-D01-PO-001`, file `BQwqV8GdfUIELvsQDB1UQE`,
page `User Interface`, every row `APPROVED_FOR_IMPLEMENTATION`:

| Registry ID | Node | State / viewport |
|---|---|---|
| `FIG-APP11-GALLERY-DETAIL-DESKTOP` | `860:442` | Default / Desktop 1440 |
| `FIG-APP11-GALLERY-DETAIL-TABLET` | `861:4321` | Default / Tablet 1024 |
| `FIG-APP11-GALLERY-DETAIL-MOBILE` | `861:4487` | Default / Mobile 390 |
| `FIG-APP11-GALLERY-DETAIL-LIGHTBOX-DESKTOP` | `862:626` | Open / Desktop |
| `FIG-APP11-GALLERY-DETAIL-LIGHTBOX-MOBILE` | `862:641` | Open / Mobile |
| `FIG-APP11-GALLERY-DETAIL-PROVENANCE` | `862:656` | Specification |

Provenance recorded by `APP11-D01`: UI05 `334:6` / `341:2` / `348:2` plus the
approved Product Detail media and lightbox precedent `529:2234/2236/2237`,
`529:2438/2440`, `529:2580/2582`, `533:3`, `533:26`, `537:38`.

`node tools/check-figma-design-index.mjs` → **PASS** (532 registry IDs, 532 node
rows, 23 tables; canonical files, statuses, deep links and composites verified).
No Figma file was opened for writing and no registry row was added, changed or
downgraded.

> **Recorded limitation — live node inspection.** The Figma MCP endpoints were
> unavailable for this session: the `figma-desktop` server refused the
> connection, and the hosted `plugin:figma:figma` server returned only an OAuth
> start URL requiring operator interaction in a browser. The exact approved
> nodes could therefore not be re-opened and read live. The registry gate the
> repository defines still ran and passed, every row resolved is
> `APPROVED_FOR_IMPLEMENTATION` and none is stale or superseded, and the frame
> composition was resolved from `APP11-D01`'s own approved record — its §E
> "Gallery entry detail proof" enumerates the retained UI05 sections, the
> removed `Section / Member Works`, the added ordered media block, the added
> lightbox and the added Related Product affordance. This is the repository's
> authority of record for those frames; it is not a substitute for reading the
> nodes, and it is reported as such rather than claimed as one.

---

## C. Route and feed-action activation

### The one new route

```text
apps/storefront/src/app/bo-suu-tap/[slug]/page.tsx      the segment
apps/storefront/src/app/bo-suu-tap/[slug]/loading.tsx   route-level loading
apps/storefront/src/app/bo-suu-tap/[slug]/error.tsx     route-local boundary
```

`loading.tsx` and `error.tsx` are not routes; the App Router route count is
**13 → 14**, confirmed by the production build's own route table
(`ƒ /bo-suu-tap/[slug]`, server-rendered on demand) and by an enumerated
assertion in the boundary suite.

No alias and no redirect. `/works/[slug]`, `/work/[slug]`, `/collections/[slug]`,
`/gallery/[slug]` and `/thu-vien/[slug]` are each asserted absent as a directory
**and** as a path literal in the feature's code, and the segment contains no
`redirect(`, `permanentRedirect(` or `rewrites`.

### Canonical route family

```text
STOREFRONT_GALLERY_ROUTE            = '/bo-suu-tap'          (APP11-S02, unchanged)
buildStorefrontGalleryDetailPath()  = `${STOREFRONT_GALLERY_ROUTE}/${encodeURIComponent(slug)}`
```

Both live in `features/storefront-shell/model/storefront-navigation.ts` and are
exported from the shell barrel. The builder composes from the constant rather
than spelling the path again, so the boundary suite's expectation is the strong
one: **no production module anywhere writes a `/bo-suu-tap/<something>` string
literal at all.** The feed card's action and the detail page's own canonical are
the only two callers.

### S02 card activation

The card was a deliberately non-interactive `<article>` while no detail route
existed. It now carries **one** semantic action:

```text
visible label     Xem chi tiết
accessible name   Xem chi tiết mục <entry title>     (derived, never authored)
href              buildStorefrontGalleryDetailPath(card.slug)
```

A text link, not a tile-sized hit area: UI05 draws it that way, `353:2` draws its
hover and pressed treatments, and one anchor inside an `<article>` keeps a single
Tab stop per entry with nothing interactive nested inside it. No clickable
`<div>`, no `role="link"`, no manual `tabIndex`.

Preserved from S02, asserted live and in tests: 3 / 2 / 1 columns, variable card
heights, DOM/source order = server order, keyset continuation, and the fact that
no internal field (`galleryEntryId`, `coverAssetId`, `displayOrder`,
`isIndexable`, `assetCount`) reaches a card.

The shell's `Bộ sưu tập` item stays active on a detail path through
`isStorefrontNavRouteActive`, which S02 had already written as a section matcher
for exactly this reason. Verified live: `aria-current="page"` on the header item
at `/bo-suu-tap/bien-thang-tu-xom5`.

---

## D. Curated api-client boundary

Added to `packages/api-client/src/gallery.ts`, and nothing else:

```text
publicGalleryEntryDetail                (value)
PublicGalleryEntryDetailResponse        (type)
PublicGalleryAssetResponse              (type)
PublicGalleryEntrySeoResponse           (type)
PublicGalleryLinkedProductResponse      (type)
```

Consumer-driven release, as this boundary is governed: the operation crosses on
the checkpoint that consumes it. The barrel's own prose was updated from "stays
withheld because `/bo-suu-tap/[slug]` does not exist yet" to the fact that the
route now exists and this is the read it performs.

**Still withheld, and not for a scheduling reason:**

- `publicGalleryEntryAsset` — it streams bytes as a `Blob`. Every
  `assets[].url` in the detail response is already the publication-gated
  delivery route at its detail rendition, composed API-side; an `<img src>`
  cannot be a `Blob`, so exporting it would publish a function no correct
  consumer could call.
- the whole `publicSitemapEntry_*` family — `APP11-S04` owns it.

No generated file was edited.

```text
pnpm --filter @embroidery/api openapi:check          PASS (artifact up to date)
pnpm --filter @embroidery/api-client check:generated PASS (tree hash unchanged)
```

### One directly affected Admin test

`apps/admin/test/components/gallery-list-render.test.tsx` asserted
`publicGalleryEntryDetail` is **never** exported by the package. That assertion
is now false by design, so the operation moves to the same guarantee the public
*list* already has: asserted against the Admin feature's own source in
`test/boundary/gallery-list-source.test.ts`, which forbids any `publicGallery*`
name there. `publicGalleryEntryAsset`, `publicGalleryEntryMediaGet` and
`publicSitemapEntryList` stay asserted absent from the package.

This is a test file, not Admin runtime. No Admin runtime file was touched.

---

## E. Server-first detail read and safe not-found

```text
features/gallery-detail/services/gallery-detail.server.ts
  export const loadGalleryDetail = cache(readGalleryDetail)
```

The page component and `generateMetadata` both call that one loader, twice in the
segment and nowhere else — asserted structurally. React's `cache()` scopes the
memo to the request, so the head and the body can never describe two different
reads, while a new request still asks the API again. That second half is a
correctness requirement, not an optimisation: `APP11-B03` re-reads publication
and image eligibility on every call precisely because nothing in this system
invalidates a cache.

```text
export const dynamic = 'force-dynamic'
no revalidate, no generateStaticParams, no ISR
no client refetch, no TanStack query, no Zustand, no polling
```

### The safe not-found

Five internal reasons collapse to one indistinguishable public surface:

| Cause | Reaches the page as | Live result |
|---|---|---|
| unknown slug | `not-found` | shared 404 surface |
| malformed slug | `not-found`, **without a backend request** | shared 404 surface |
| `DRAFT` | `not-found` | shared 404 surface |
| `ARCHIVED` | `not-found` | (no ARCHIVED row exists — see §N) |
| `PUBLISHED`, zero deliverable media | `not-found` | (unreachable — see §N) |

A malformed slug never becomes a request: `isPublicGalleryEntrySlug` gates it
against `^[a-z0-9]+(?:-[a-z0-9]+)*$`, the charset the API's own
`GALLERY_ENTRY_SLUG_PATTERN` produces. The pattern is declared feature-locally
rather than imported from `@embroidery/contracts` — that package publishes
`isPublicProductSlug` only, and adding a gallery equivalent would change a
package this checkpoint does not own; a unit assertion pins the two spellings
together so a server-side widening fails loudly.

Only an exact 404 becomes not-found. Every other status — including a 500 that
happens to mention the slug — throws to the route's error boundary, because
telling a visitor a collection does not exist when the database is down would be
a lie. The boundary renders no message, digest or stack: it receives Next's
`error` object and uses only `reset`.

Measured live through the canonical gateway, on five refusal cases
(`khong-ton-tai-gi-ca`, a DRAFT slug, a second DRAFT slug, `UPPER`, `co%20dau`):

```text
title      <title>Embroidery Commerce — Storefront</title>   (generic shell title)
robots     <meta name="robots" content="noindex">
canonical  absent
body       storefront-not-found surface; 0 occurrences of any entry title
leaks      no status code, no request id, no lifecycle word, no gallery metadata
```

> **Measured limitation — transport status.** All five answer **HTTP 200**, not
> 404. This is the framework behaviour `APP2-S02` measured and recorded as
> `FU-APP2-DETAIL-NOT-FOUND-STATUS-01`: on this Next version a `notFound()`
> raised from a **dynamic** segment renders the approved not-found surface but
> answers 200, while the identical call from a static segment answers 404. It is
> re-measured here rather than assumed from the Product Detail finding. Nothing
> this route can rearrange changes it. The surface is correct and leaks no cause;
> only the status line is wrong, and this report states the real transport
> behaviour rather than claiming a 404.

---

## F. Flat detail model

```text
NESTED_COLLECTION_WORK_MODEL = false
```

| UI05 / APP11 block | Delivered |
|---|---|
| Breadcrumb | **Yes** — two levels, flat |
| Entry Hero | **Yes** — the entry title, the page's only `<h1>` |
| Ordered Entry Media | **Yes** — added by `APP11-D01` |
| Lightbox | **Yes** — added by `APP11-D01` |
| Entry Narrative | **Yes** — one section for one contract field |
| Related Product | **Yes**, only when `linkedProduct != null` |
| Continue Discovering | **Yes** — one real link to the feed |
| Soft Commission CTA | **Yes** — the existing intake route |
| Header / Footer | shell's, untouched |
| `Section / Member Works` | **REMOVED** — absent from the approved frames |
| Entry Attributes | **OMITTED** — see below |
| Related Entries | **OMITTED** — see §H |

**Entry Attributes is omitted because nothing backs it.** The prompt retains the
block "only when data-backed". `publicGalleryEntryDetail` publishes a title, a
description, an ordered image list, an optional product link and three SEO
fields. There is no year, technique, material, dimension or edition anywhere in
the contract, so every attribute row would have been invented. The section is
therefore absent rather than rendered empty.

Breadcrumb: `Bộ sưu tập / <entry title>`. The feed crumb is a real link to
`/bo-suu-tap`; the current entry is text with `aria-current="page"`. No parent
collection, no `/works`, no third level. `APP11-S04` owns BreadcrumbList
structured data and none is emitted.

The narrative is **not** split into `Cảm hứng` / `Ý tưởng` / `Ý nghĩa` /
`Kỹ thuật`: one contract field gets one section, and three headings would need
two strings nobody ever wrote.

Dropped at the projection boundary, so no component can render them by accident:
`galleryEntryId`, `displayOrder`, every `assets[].assetId`, every
`assets[].position`, and the whole `seo` object. Verified live: the rendered
detail page contains no UUID.

---

## G. Ordered media

The API's array order is the curation and is used verbatim — for the stage, the
thumbnail strip and lightbox navigation alike, because all three index the same
array. There is no client sort, no ratio bucketing, no asset-id ordering and no
attempt to reconstruct the private `display_order`. Initial selection is index 0.

Renditions: the contract publishes exactly **one** address per image, at the
detail rendition `APP11-B03` composes. Nothing is invented and nothing is derived
by string replacement; the boundary suite forbids a rendition name appearing as a
string literal anywhere in the feature. The thumbnail strip therefore shows the
same address as the stage, sized and cropped in CSS — cropping is correct for a
navigation control and wrong for the stage, which stays `object-fit: contain` at
its natural ratio.

### Media states

| State | Behaviour |
|---|---|
| Zero images | **Not implemented, deliberately.** `APP11-B03` answers the safe 404 for a published entry with no deliverable image, so this component is never reached with an empty array. A placeholder here would be an unreachable state claiming to be possible. |
| One image | stage + lightbox trigger; **no** strip, **no** prev/next, **no** position line, and the alt drops the position (`Ảnh 1 trên 1` is noise) |
| Many images | stage + ordered strip + lightbox prev/next + textual position |
| One image fails | local: the failed index shows an honest message, the rest of the strip stays usable, and the failure is remembered per index so a broken third image never makes the first look broken |

Per-image failure is handled **both** ways: `onError`, and — because the stage is
server-rendered and can finish or fail before hydration attaches the handler — a
ref callback that checks `complete && naturalWidth === 0` the moment the element
attaches. That second path was measured for `APP2-S02` (aborting the media
request left the page silent until the check existed) and is covered here by a
focused test that forces the pre-hydration condition.

---

## H. Lightbox

Reuses the approved Product Detail behaviour verbatim, as `APP11-D01` cloned the
frames. Verified live at 1440 and in focused tests:

```text
role="dialog"                        yes
aria-modal="true"                    yes
accessible name                      the entry title, via aria-labelledby
opener                               a real <button type="button">
focus enters on open                 yes (first control)
focus trap                           Tab cycles inside; focus cannot reach the page
Escape closes                        yes
focus returns to the exact opener    yes (the stage trigger, verified by identity)
page scroll locks and restores       body.style.overflow 'hidden' → restored
ArrowLeft / ArrowRight               follow the API media order; stop at the ends
position exposed as text             "Ảnh 2 trên 6"; absent for a single image
controls ≥ 44px                      min-height and min-width both 44px (measured)
reduced motion honoured              prefers-reduced-motion disables transitions
one image                            no prev/next controls at all, not disabled ones
failure inside the dialog            states itself; close and navigation keep working
new dependency                       none
```

The scrim sits at `z-index: 100` — above the shell's floating contact dock
(`$z-dock: 90`) and on the same plane as the shell drawer and the Product Detail
lightbox, so the three dialogs cannot quietly out-stack one another.

The dialog-focus hook is feature-local rather than imported from
`product-detail`: that feature does not publish it, and reaching into another
feature's `hooks/` is the boundary violation CLAUDE.md §5 forbids. The behaviour
is deliberately identical so the dialogs feel the same.

### No fabricated related entries

There is no related-gallery operation in the API. Calling the feed and labelling
three arbitrary entries "related" would be a curatorial recommendation the studio
never made — and they would be chosen by `display_order`, which means "first in
the feed", not "related to this". `Continue Discovering` is one honest link back
to `/bo-suu-tap` instead.

---

## I. Linked Product

`linkedProduct == null` renders **nothing** — no heading, no placeholder, no
greyed card. That is the whole privacy property: `APP11-B03` returns null both
when no product was linked and when the linked product is draft, archived or
otherwise non-public, and the two are indistinguishable in the contract, so the
page must not distinguish them either. Any "unavailable" affordance would
announce that *something* is there.

When non-null the product is already publicly visible, so the link goes to
`/san-pham/[slug]` through `buildStorefrontProductDetailPath` — the same builder
Product Detail uses for its own canonical.

Carried: `name`, `slug`, optional `thumbnailUrl`. Absent by construction: price,
cart, buy, stock, product id, lifecycle state. When the projection has no
thumbnail, no image element is rendered at all rather than an address composed
from an id. A thumbnail that stops resolving mid-session degrades the card to
text while the link keeps working.

---

## J. SEO, canonical and Open Graph boundary

```text
title        seo.title       ?? entry.title
description  seo.description ?? entry.description   (omitted when empty)
robots       { index: seo.isIndexable, follow: true }
canonical    buildStorefrontGalleryDetailPath(slug)  — RELATIVE
openGraph    not emitted
JSON-LD      not emitted
```

A `noindex` entry stays fully readable: indexability is an SEO directive, not a
visibility one. Verified live on `khung-cua-go-xom5` (`isIndexable = false`):

```text
<title>Khung cửa gỗ</title>
<meta name="robots" content="noindex, follow">
<link rel="canonical" href="/bo-suu-tap/khung-cua-go-xom5">
```

and on an indexable entry: `<meta name="robots" content="index, follow">`.

**Canonical — implemented safely, relative.** The Storefront declares no
`metadataBase`, and Product Detail already emits a relative canonical this way in
production. No absolute origin appears anywhere; a boundary assertion forbids
`https?://`, `localhost`, `embroidery.local` and a guessed hostname in the whole
feature.

**Open Graph — deferred to `APP11-S04`, with the reason.** An OG image must be an
absolute URL, and Next resolves a relative one against `metadataBase`. This app
sets none, so the framework would fall back to a guessed origin — exactly the
invention `APP11-S04` owns. Emitting a representative image therefore cannot be
done here without inventing the public origin, so OG is deferred whole rather
than half-emitted. No `opengraph-image.ts` was added.

Not started, and asserted absent: `metadataBase`, `robots.ts`, `sitemap.ts`,
global Open Graph defaults, BreadcrumbList JSON-LD.

---

## K. Responsive and accessibility

Measured live through `http://embroidery.local`, Chromium.

| Check | 1440 | 1024 | 390 |
|---|---|---|---|
| breadcrumb | full trail | full trail (961px band) | back link |
| H1 | 40px, exactly one | 32px, exactly one | 32px, exactly one |
| narrative measure | 640px cap | 640px (measured 640) | full band, no cap needed |
| media stage | full band, natural ratio | full band | 327px at a 375px client width — a true 390 viewport gives the approved 342 |
| content gutter | shell's | shell's (24) | 24 (shell 16 + the page's own 8) |
| continue / commission controls | 44px | 44px | 44px |
| horizontal overflow | none | none | none |
| floating dock | unchanged | unchanged | unchanged |
| console errors caused by S03 | none | none | none |

The trail/back-link swap happens at **768**, not at the desktop tier. Product
Detail swaps at 1025 because its trail is three levels deep and genuinely does
not fit a tablet column; this trail is two levels and flat, and 1024 is an
approved viewport in its own right — collapsing a short trail at exactly the
width the design draws it would hide navigation that fits with room to spare.
Measured at 1024, the full trail occupies well under half the content band. The
first delivery of this file swapped at 1025 by inheritance and was corrected
after the live measurement.

Accessibility delivered: exactly one `<h1>` (the entry title); H2s for every
other section, so the outline is flat; `<nav>` + `<ol>` breadcrumb with
`aria-current="page"` on the current entry; real `<button>`s for the stage
trigger and every thumbnail; `aria-current` on the selected thumbnail (never
colour alone); roving tabindex so the strip is one Tab stop with Arrow/Home/End
inside it; visible focus rings never removed, only replaced; 44px touch targets;
derived alt text; textual recovery states; no clickable `<div>` anywhere.

The page remains understandable with images unavailable: the title, the
narrative, the breadcrumb, the related-product link, the continuation and the CTA
are all server-rendered text.

### Alt model

```text
ALT_TEXT_MODEL = DERIVED_NOT_PERSISTED
```

`Kỷ niệm được giữ lại — ảnh 2 trên 3`, and just the title when there is one
image. Derived from the entry title plus the visitor's own position, never from a
persisted field: `APP11-B03` publishes no `altText`, there is no column and there
is nothing for an operator to author. No per-image alt field or control exists,
asserted structurally.

---

## L. Frozen artifacts

Unchanged, verified at exit:

```text
apps/api                          untouched
apps/worker                       untouched
apps/admin runtime                untouched (one Admin *test* updated — §D)
packages/database                 untouched
migrations                        37
packages/contracts/openapi        116 / 128 / 252, artifact up to date
packages/api-client/src/generated untouched, tree hash unchanged
Figma file                        not opened for writing
FIGMA_DESIGN_INDEX.md             unchanged; gate PASS at 532 rows
```

No backend operation was added. `APP11-S04` and `APP11-S05` work was not started:
`sitemap.ts`, `robots.ts`, `/dich-vu`, `/cau-hoi-thuong-gap`, `/cua-hang` and
`/chinh-sach` are each asserted absent.

---

## M. File-size and SCSS gates

```text
runtime source   <= 400   largest S03 file: 143 (gallery-detail-lightbox.tsx)
SCSS             <= 400   largest S03 stylesheet: 211 (_gallery-detail-media.scss)
tests            <= 600   largest S03 test: 332 (gallery-detail-source.test.ts)
```

```text
node tools/check-app-scss.mjs storefront                                  PASS
node tools/check-scss-file-size.mjs .../gallery-detail/styles             PASS (6 files, 0 above review threshold)
node tools/check-scss-file-size.mjs .../gallery-feed/styles               PASS
node tools/check-file-size.mjs .../features/gallery-detail                PASS
```

The stylesheet was split into partials from the start rather than as a later
rescue, and split again twice during delivery when a partial crossed the
**300-line review threshold** (not the 400 hard limit): the lightbox left the
media partial, and the closing sections left the layout partial. No historical
SCSS debt was touched; `product-detail.scss` is 555 lines and `design-studio.scss`
is 1876, and neither is this checkpoint's to clean.

No repository-wide compliance is claimed.

---

## N. Validation and live browser evidence

### CHANGE_IMPACT

One new Storefront feature and route; one activated affordance on the existing
feed card; one route builder on the shell; five symbols on the curated
api-client boundary; three directly affected test files updated where their
assertions were written to invert at this checkpoint.

### TESTS_RUN

```text
pnpm --filter @embroidery/storefront typecheck                      PASS
pnpm --filter @embroidery/storefront build                          PASS (route table shows ƒ /bo-suu-tap/[slug])
eslint (scoped: gallery-detail, gallery-feed, route, shell, tests)  PASS, 0 findings
eslint (scoped: api-client gallery.ts + boundary test)              PASS
eslint (scoped: admin gallery-list-render.test.tsx)                 PASS
prettier --check (every changed and added file)                     PASS

storefront jest, 11 suites / 193 tests                              PASS
  test/boundary/gallery-detail-source.test.ts        36
  test/boundary/gallery-feed-source.test.ts          31
  test/boundary/storefront-shell-source.test.ts
  test/components/gallery-detail-media.test.tsx      20 (with dedupe)
  test/components/gallery-detail-lightbox.test.tsx   12
  test/components/gallery-card-link.test.tsx
  test/components/gallery-feed.test.tsx              17
  test/components/storefront-shell-render.test.tsx
  test/smoke/gallery-detail-page.test.tsx            27
  test/smoke/gallery-detail-dedupe.test.tsx
  test/unit/gallery-detail-model.test.ts             29

api-client jest (gallery curated boundary + generated contract)     PASS 18
admin jest (gallery list render + 2 gallery boundary suites)        PASS 71

pnpm --filter @embroidery/api openapi:check                         PASS
pnpm --filter @embroidery/api-client check:generated                PASS
node tools/check-figma-design-index.mjs                             PASS
node tools/check-app-scss.mjs storefront                            PASS
node tools/check-scss-file-size.mjs <S03 paths>                     PASS
```

### TESTS_NOT_RUN / WHY_NOT_RUN

```text
full monorepo turbo run          out of change impact; forbidden by the checkpoint scope
full Storefront suite            only the directly affected suites are justified
full Admin suite                 no Admin runtime changed; the three touched suites ran
API suite / worker suite         no backend or worker file changed
database regression              no migration, no schema change
full Playwright                  explicitly excluded; targeted browser acceptance ran instead
APP11-E01 / historical phases     not this checkpoint's
```

### Live browser acceptance

Through the canonical Storefront gateway `http://embroidery.local`, Chromium at
1440 / 1024 / 390, against gallery entries created through delivered flows.

| # | Check | Result |
|---|---|---|
| 1 | published detail route renders | **PASS** |
| 2 | exactly one `<h1>` | **PASS** (all three viewports) |
| 3 | breadcrumb links back to the feed | **PASS** (`/bo-suu-tap`) |
| 4 | feed action opens the correct slug | **PASS** (click-through to `/bo-suu-tap/bien-thang-tu-xom5`) |
| 5 | shell Gallery nav active on the detail path | **PASS** (`aria-current="page"`) |
| 6 | description is DOM text | **PASS** (rendered paragraph, not metadata only) |
| 8 | one-image state | **PASS** (no strip, no position line, alt without position) |
| 10 | lightbox opens | **PASS** (`role=dialog`, `aria-modal`, named by the entry) |
| 11 | Escape closes | **PASS** |
| 13 | focus returns to the exact opener | **PASS** (identity-checked) |
| 18 | noindex detail remains readable | **PASS** (`khung-cua-go-xom5`) |
| 19 | noindex metadata emitted | **PASS** (`noindex, follow`) |
| 20 | indexable metadata emitted | **PASS** (`index, follow` + relative canonical) |
| 21 | unknown slug → safe not-found | **PASS** |
| 22 | DRAFT → safe not-found | **PASS** (two DRAFT slugs, identical surface) |
| 24 | no id / storage / raw cause leaks | **PASS** (no UUID in the body; no status, request id or lifecycle word on the 404) |
| 25 | 1440 | **PASS** |
| 26 | 1024 | **PASS** |
| 27 | 390 | **PASS** |
| 28 | no horizontal overflow | **PASS** (all three) |
| 29 | floating social dock unchanged | **PASS** — see the note below |
| 30 | no S03-caused console error | **PASS** |
| 31 | no invented route / API failure | **PASS** |

Malformed-slug variants (`UPPER`, `co%20dau`) additionally reached the identical
safe surface without a backend request.

**On #29.** The floating contact dock renders on **no** storefront route in this
environment — it is configuration-gated by `APP10-I01` and its markup is absent
from the feed page as well as the detail page. "Unchanged" is therefore verified
as *identically absent on both*, not as a live overlap test. The layering claim
is verified structurally instead: the lightbox scrim computes to `z-index: 100`
against the shell's declared `$z-dock: 90`.

### Checks 7, 9, 12, 14, 15, 16, 17, 23 — fixture-dependent

> **The gap, stated plainly.** These need gallery states the dev database does
> not contain: a published multi-image entry, an entry linked to a public
> Product, one linked to a non-public Product, and one published with no
> deliverable image. Creating the first three goes through the delivered Admin
> operations (`adminGalleryAsset_create`, `adminGalleryEntry_create`,
> `_replaceAssets`, `_publish`), which require a staff session. The fixture
> script was written and verified end to end against the running stack up to the
> authentication step; the credential could not be supplied through this
> session's tooling, so the operator was asked to run the one command.
>
> The fourth — **published with zero deliverable media** — is not merely
> unfixtured but **unreachable through any delivered flow**: `APP11-B02`
> publishes no archive transition and `APP11-B03A` publishes no gallery-asset
> deletion (`FU-APP11-B03A-01`), so there is no delivered operation that
> withdraws an image from a published entry. Producing it would require a direct
> database or object-storage mutation, which §31 forbids. The behaviour is
> nevertheless correct by construction and proved where it can be: `APP11-B03`
> owns that 404 and tested it at its own checkpoint, and this page maps **every**
> 404 to one indistinguishable surface — which the smoke suite asserts across all
> four causes and the live run demonstrates on two of them.
>
> The same applies to **ARCHIVED**: no `ARCHIVED` gallery row exists because no
> delivered operation creates one.
>
> Each fixture-dependent behaviour is covered by focused Jest tests that pass:
> ordered media and multi-image selection, thumbnail keyboard selection, arrow
> navigation following API order, per-image and pre-hydration stage failure,
> linked Product present / null / non-public, and the zero-media 404.

---

## O. Git-authoritative files changed

**Added**

```text
apps/storefront/src/app/bo-suu-tap/[slug]/page.tsx
apps/storefront/src/app/bo-suu-tap/[slug]/loading.tsx
apps/storefront/src/app/bo-suu-tap/[slug]/error.tsx
apps/storefront/src/features/gallery-detail/index.ts
apps/storefront/src/features/gallery-detail/model/gallery-detail-copy.ts
apps/storefront/src/features/gallery-detail/model/gallery-detail-slug.ts
apps/storefront/src/features/gallery-detail/model/gallery-detail-view.ts
apps/storefront/src/features/gallery-detail/services/gallery-detail.server.ts
apps/storefront/src/features/gallery-detail/hooks/use-gallery-dialog-focus.ts
apps/storefront/src/features/gallery-detail/hooks/use-gallery-media-selection.ts
apps/storefront/src/features/gallery-detail/components/gallery-detail-screen.tsx
apps/storefront/src/features/gallery-detail/components/gallery-detail-breadcrumb.tsx
apps/storefront/src/features/gallery-detail/components/gallery-detail-media.tsx
apps/storefront/src/features/gallery-detail/components/gallery-detail-stage.tsx
apps/storefront/src/features/gallery-detail/components/gallery-detail-thumbnails.tsx
apps/storefront/src/features/gallery-detail/components/gallery-detail-lightbox.tsx
apps/storefront/src/features/gallery-detail/components/gallery-detail-narrative.tsx
apps/storefront/src/features/gallery-detail/components/gallery-detail-related-product.tsx
apps/storefront/src/features/gallery-detail/components/gallery-detail-continue.tsx
apps/storefront/src/features/gallery-detail/components/gallery-detail-commission.tsx
apps/storefront/src/features/gallery-detail/components/gallery-detail-loading.tsx
apps/storefront/src/features/gallery-detail/components/gallery-detail-error.tsx
apps/storefront/src/features/gallery-detail/styles/gallery-detail.scss
apps/storefront/src/features/gallery-detail/styles/_gallery-detail-tokens.scss
apps/storefront/src/features/gallery-detail/styles/_gallery-detail-layout.scss
apps/storefront/src/features/gallery-detail/styles/_gallery-detail-closing.scss
apps/storefront/src/features/gallery-detail/styles/_gallery-detail-media.scss
apps/storefront/src/features/gallery-detail/styles/_gallery-detail-lightbox.scss
apps/storefront/test/boundary/gallery-detail-source.test.ts
apps/storefront/test/components/gallery-detail-media.test.tsx
apps/storefront/test/components/gallery-detail-lightbox.test.tsx
apps/storefront/test/components/gallery-card-link.test.tsx
apps/storefront/test/smoke/gallery-detail-page.test.tsx
apps/storefront/test/smoke/gallery-detail-dedupe.test.tsx
apps/storefront/test/unit/gallery-detail-model.test.ts
docs/implementation/reports/APP11-S03-COMPLETION-REPORT.md
```

**Modified**

```text
packages/api-client/src/gallery.ts                              5 symbols on the boundary
packages/api-client/src/gallery.curated-boundary.test.ts        detail now published, asset still withheld
apps/admin/test/components/gallery-list-render.test.tsx         one absence assertion moved (test only)
apps/storefront/src/styles/main.scss                            composes the new feature stylesheet
apps/storefront/src/app/bo-suu-tap/page.tsx                     stale "no [slug] beneath this" comment
apps/storefront/src/features/storefront-shell/model/storefront-navigation.ts   buildStorefrontGalleryDetailPath
apps/storefront/src/features/storefront-shell/index.ts          exports the builder
apps/storefront/src/features/gallery-feed/components/gallery-card.tsx          detail action activated
apps/storefront/src/features/gallery-feed/model/gallery-copy.ts                action label + derived name
apps/storefront/src/features/gallery-feed/model/gallery-feed.ts                stale comment
apps/storefront/src/features/gallery-feed/model/gallery-route.ts               stale comment
apps/storefront/src/features/gallery-feed/styles/_gallery-masonry.scss         card action styles
apps/storefront/test/boundary/gallery-feed-source.test.ts        two staged assertions inverted
apps/storefront/test/components/gallery-feed.test.tsx            staged assertion inverted
apps/storefront/test/support/gallery-fixture.ts                  detail builders
docs/implementation/phases/APP11-GALLERY-CONTENT-AND-SEO.md      roadmap
```

`docs/implementation/SCOPED_COMMAND_INDEX.md` was **not** changed: every command
run is already indexed (`CMD-CHECK-APP-SCSS-STOREFRONT`,
`CMD-CHECK-SCSS-FILE-SIZE`, `CMD-OPENAPI-CHECK`, and the generated-client gate).

Nothing was committed and nothing was pushed.

---

## P. Follow-ups

| ID | Item |
|---|---|
| `FU-APP11-S03-01` | **Live Figma node inspection could not run** — the `figma-desktop` MCP server refused the connection and the hosted Figma server needed an interactive OAuth grant. The registry gate passed and `APP11-D01`'s approved record was used; the six detail nodes should be re-opened and diffed against the delivered page at `APP11-E01` or `APP11-X01`. |
| `FU-APP11-S03-02` | **Eight live acceptance checks are fixture-dependent** (multi-image, public/non-public/absent linked Product, zero-media, ARCHIVED). Three of the four states can be produced by the delivered Admin flow once a staff session is available; the script exists in the session scratchpad. Each behaviour is covered by passing focused tests in the meantime. |
| `FU-APP11-S03-03` | **The zero-deliverable-media published state is unreachable through delivered flows** — no archive transition (`APP11-B02`) and no gallery-asset deletion (`FU-APP11-B03A-01`). If that state is ever to be exercised end to end, an operator-facing image-withdrawal path has to exist first. |
| `FU-APP2-DETAIL-NOT-FOUND-STATUS-01` | **Still open, now confirmed on a second route.** A `notFound()` from a dynamic segment renders the approved surface but answers HTTP 200. The surface is safe; the status line is wrong. |
| `FU-APP11-S03-04` | **Open Graph deferred to `APP11-S04`** with the reason recorded in §J: an absolute OG image needs `metadataBase`, which needs the public origin S04 owns. |

---

## Q. Roadmap

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
APP11-B04-C1   COMPLETE
APP11-A01      COMPLETE
APP11-A02      COMPLETE
APP11-A02-C1   COMPLETE
APP11-S01      COMPLETE
APP11-S02      COMPLETE
APP11-S03      COMPLETE
APP11-S04      NEXT
APP11-S05      NOT STARTED
APP11-E01      NOT STARTED
APP11-X01      NOT STARTED
```

Exactly one `NEXT`. `APP11-S04` was not started.
