# APP2-S02 — Completion report

**Checkpoint:** `APP2-S02` — the anonymous Storefront Product Detail experience at
`/san-pham/[slug]`, consuming the delivered `publicProductDetail` contract and the corrected
`APP2-S02-G01` Figma authority.
**Date:** 2026-08-02 · **Branch:** `production` · **Verdict:** `PASS`

---

## A. Preflight and corrected design-gate entry

```text
APP2_S02_PREFLIGHT = PASS
```

| Check | Result |
|---|---|
| `git branch --show-current` | `production` |
| `git rev-parse HEAD` at entry | `36c2036b5f9c80a06fa3deb6886c52ebb2f40a05` |
| Entry HEAD subject | `docs(app2): record S02 design-gate correction evidence` (3 files, +389 −2) |
| Accepted chain unchanged | `4051bb9`, `0d178ed`, `86626b2`, `893e981` all present and untouched |
| Tracked/staged tree | clean |
| Ignored `evidences/` | untouched |
| Pushed | nothing — 62 ahead of `origin/production` at entry |
| S02/E01/X01 implementation | none present |

`pnpm quality` at entry: **exit 0**, 293 tool assertions. `check:secrets`, `check:lifecycle`,
`check:pagination-authority` (+14), `check:storefront-route-authority` (+21),
`check:storefront-product-detail-authority` (+34), `check:figma-design-index` (86/86/11, +31),
`check:openapi`, `check:api-client`, `db:check:manifest` and `git diff --check` all green.

## B. Live Figma authority audit

All twelve approved roots opened live before any source change; UI03 verified still
historical.

| Node | Frame | Size |
|---|---|---|
| `529:2224` | Reconciled section | 10080×2970 |
| `538:3` | Scope & Source of Truth | 1240×191 |
| `529:2225` / `529:2431` / `529:2575` | Desktop / Tablet / Mobile default | 1440×2499 · 1024×2092 · 390×1674 |
| `532:3` / `532:105` | Desktop Media Empty · Mobile Media Error | 1440×2346 · 390×1674 |
| `533:3` / `533:26` | Lightbox desktop · mobile | 1440×900 · 390×844 |
| `537:3` / `537:38` | Contract handoff · State authority | 1240×603 · 1240×319 |
| `541:3` | Readable-measure handoff row | text |

Verified live: the handoff still names `/san-pham/[slug]`, `publicProductDetail` as the sole
operation and `catalog-preview` as the sole rendition; story measures read **640 / 640 / 342**
at gutters **80 / 48 / 24**; UI03 `261:1290` (16 children), `262:1291`, `273:1409`, `279:1504`
unchanged; registry **86/86/11**. No material disagreement — no integrity block.

## C. Route and API-client boundary

Route: `apps/storefront/src/app/san-pham/[slug]/page.tsx` — exactly `/san-pham/[slug]`.

One builder, in the shell's navigation model where routes live:

```ts
export const STOREFRONT_PRODUCT_DETAIL_ROUTE_BASE = '/san-pham';
export function buildStorefrontProductDetailPath(slug: string): string {
  return `${STOREFRONT_PRODUCT_DETAIL_ROUTE_BASE}/${encodeURIComponent(slug)}`;
}
```

It serves the S01 card link, the canonical, and the share URL. The path literal appears
**once** in the repository; a boundary test asserts the feature and route source never spell
`/san-pham` at all, and never `/product/`, `/products/`, `/catalog/`, `/tac-pham` or
`/kham-pha/`.

Slug syntax is not re-implemented. `isPublicProductSlug` was added to
`@embroidery/contracts` beside the existing media-path pattern and is now the single regex
both use — a browser route and a media path that disagreed about what a slug is would render
a page whose every image 404s. A malformed slug therefore never reaches the API.

Generated export added to the hand-written boundary (no regeneration; tree hash unchanged):

```ts
export { publicProductList, publicProductDetail } from './generated/embroidery-api';
```

`publicProductMediaGet` stays withheld: image bytes are loaded by the browser rendering a
relative `media[].url`, never streamed by application code.

## D. Server rendering and request deduplication

`export const dynamic = 'force-dynamic'`. `next build` reports `ƒ /san-pham/[slug]`
(dynamic, server-rendered on demand). Measured with **JavaScript disabled** in a real
browser against the production runtime: the response carries the Product name, category,
the story text and the first `catalog-preview` URL.

`loadProductDetail` is a React `cache()` wrapper shared by `generateMetadata` and the page.

**Disclosed limitation in the test harness, and how it was resolved.** The "one read per
request" property is **not** asserted in Jest, because it cannot be: `next/jest` resolves
React's *client* build, so a `cache()`d function called from a test runs every time. That was
measured, not assumed — a probe using `react-dom/server.edge` did not dedupe either. Writing
`toHaveBeenCalledTimes(1)` there would have passed or failed for reasons unrelated to the
product. The property is instead measured against the **running production server** by
counting the API's own `"route":"/api/public/products/:slug"` completion records across one
page view:

```text
metadata and the page share one backend detail read per request :: {"before":N,"after":N+1,"delta":1}
```

Jest still proves the half that protects durable visibility: nothing is replayed across
requests, two slugs never share a read, and an unpublish takes effect on the very next
request.

## E. Safe 404 and error behaviour

Only the exact 404 becomes not-found; every other status is an error the visitor may retry,
because telling someone an artwork does not exist when the database is down is a lie told
with a straight face. A malformed slug takes the same boundary without an API call.

Production matrix — unknown slug, `DRAFT`, `ARCHIVED`, non-public category, malformed slug —
all five render **one** indistinguishable public surface with no leaked cause
(`surfaces.size === 1`, no `DRAFT`/`ARCHIVED`/`requestId`/`stack`/`postgres`/`SQLSTATE`).

**One defect I could not fix inside this checkpoint, stated plainly.** On **Next 16.2.10** a
`notFound()` raised from a **dynamic** segment renders the approved surface but answers HTTP
**200**, while the identical call from a static segment (`/kham-pha?category=bogus`) answers
404. Six configurations were measured in the running stack:

| Configuration | Status |
|---|---|
| `notFound()` in the page, with `loading.tsx` + `error.tsx` | 200 |
| `notFound()` in `generateMetadata` as well | 200 |
| without `error.tsx` | 200 |
| without `loading.tsx` | 200 |
| with a segment-local `not-found.tsx` | 200 |
| **unconditional `notFound()` with no awaits at all** | 200 |

Nothing this route can rearrange changes it, and I will not fabricate a status through
middleware to make a criterion go green. Routed as
**`FU-APP2-DETAIL-NOT-FOUND-STATUS-01`**. The smoke therefore *asserts the surface* and
*records the status* on its own line rather than either failing on a framework fact or
hiding it. Acceptance items 18–21 are met as behaviour and surface; the status line is the
open half.

Non-404 failures take a route-local boundary — `Chưa thể tải tác phẩm` / `Vui lòng thử lại
sau.` / `Thử lại` — whose retry is `router.refresh()` then `reset()`, a real authoritative
server refresh rather than a replay of the same failed tree. The thrown error object is never
read: only `reset` is used, so no message, digest or stack can reach a public page.

## F. Metadata, canonical and robots

```text
title        seo.title ?? name
description  seo.description ?? description ?? (omitted)
canonical    /san-pham/{slug}   — relative
robots       { index: seo.isIndexable, follow: true }
```

The canonical is **relative**: the Storefront declares no `metadataBase`, and fabricating a
host is how a staging hostname reaches production markup. No Product JSON-LD, no price or
availability schema, no published date, author, technique or dimensions, and no Open Graph
image — no social-image policy exists, and choosing one here would quietly become it.

## G–H. Composition, breadcrumb and Discover links

One APP1 shell, one `<main>`, one `<h1>` — asserted structurally (the source adds no
`<main>`, `<header>`, `<footer>` or skip link) and in rendered HTML. Order: breadcrumb →
gallery → category identity → H1 → Share → optional story → Continue Discover → shell footer.

Desktop/tablet render the full trail (`Khám phá` → category → current, not linked); mobile
renders `← Quay lại Khám phá`. Both are in the DOM and CSS shows one per viewport, so
`display: none` removes the other from the accessibility tree too — assistive technology
hears exactly one route back. Every href comes from the S01 helpers, so the detail page and
the Discover chips cannot disagree about how a category is addressed.

The category is identity, not a control: no button role, no handler, no pointer treatment.

## I–K. Gallery, thumbnails and media states

Server order preserved exactly; selection is ephemeral and never persisted. Thumbnails are a
roving-tabindex group — one Tab stop, Arrow/Home/End within it, focus following selection —
with index-based labels (`Xem ảnh 2 trên 6`), because the backend publishes no caption and
the draft's names were provisional copy invented for a mockup. Selection is exposed by
`aria-current`, never colour alone.

`media = []` states it plainly and removes the thumbnail strip, the zoom hint **and** the
lightbox trigger. One image keeps the stage and the lightbox but drops the strip and the
previous/next controls. Failure is tracked per index, so a broken third image does not make
the first look broken.

**A real defect the production run found.** The stage image is server-rendered, so a load
failure that happens **before hydration** never reaches React's `onError` — the event has
already fired by the time the handler attaches, and a broken artwork sat there silent. The
stage now checks `complete && naturalWidth === 0` when its ref attaches. Found by aborting a
media request in the browser; no unit test could have shown it, because jsdom has no
pre-hydration window.

## L. Lightbox accessibility

`role="dialog"`, `aria-modal`, an accessible title, focus entering and trapped, Escape to
close, focus returned to the exact opener, page scroll locked and restored, arrow navigation
in media order, position exposed as text, all controls ≥44px, reduced motion honoured. Opened
from a real `<button>`, never a bare `div`. Verified in jsdom and again in the browser at all
three viewports.

## M. Story optionality and the corrected readable measure

`description` present → exactly one `Câu chuyện về tác phẩm` section; absent → the section is
omitted entirely, not left as an empty heading. Never split into `Cảm hứng`/`Ý tưởng`/`Ý
nghĩa` — a boundary test forbids those strings appearing at all.

The measure is capped at **640px** on desktop and tablet, deliberately **not**
`styles.$layout-reading-max` (720px): the foundation's general reading width and this page's
approved measure are different numbers, and silently using the token would widen the column
past what `APP2-S02-G01-C1` locked. Measured live from real layout boxes:

| Viewport | Story width | Shell content width |
|---|---|---|
| Desktop 1440 | ≤ 640 | 1200 band |
| Tablet 1024 | ≤ 640 | — |
| Mobile 390 | fills content | **358** |

**Disclosed:** the approved mobile frame assumes a 24px gutter (342px content); the APP1
shell uses 16px, so the real content width is **358**. The mobile column fills it, which is
the rule ("Mobile uses its available content width"). Changing the shell is out of scope and
already routed as `FU-APP2-STOREFRONT-CONTENT-BAND-01`. The smoke asserts against the
*measured* container rather than the frame number, so it reports the truth instead of a
number copied from a drawing. No clamp, no fixed height.

## N. Share

One browser-local action. Web Share when available, clipboard otherwise, with the canonical
URL built from `window.location.origin` + the route helper — never `location.href`, which
would carry whatever query string the visitor arrived with into everyone else's link. A
cancelled native share (`AbortError`) announces nothing: dismissing a sheet is a decision, not
a failure. Outcomes are announced through a polite live region that does not steal focus. No
SDK, no persistence, no analytics.

## O. S01 card link upgrade

The card `<article>` became exactly one `<Link>` wrapping image, name and category — a
generous hit area, no nested control, one Tab stop per artwork. Proven unchanged: masonry
classes, the single flat `<ul>`, three cards, source order, no price/stock, no
`Xem chi tiết`, and a thumbnail-less product linking just the same. Two superseded assertions
(`renders cards as non-interactive articles`, `builds no card destination`) were updated in
place with an explicit note — they were correct only while no detail route existed.

## P. Responsive, accessibility and styles

Global Sass only, `@embroidery/styles` tokens, feature-scoped classes, no dependency change.
Zero horizontal overflow at 1440/1024/390. Every Product Detail control ≥44px — including the
breadcrumb crumbs, which were 21px until the browser run measured them and they became
`inline-flex` with a 44px minimum.

**Disclosed:** the shell's own skip link and brand link are below 44px. They are approved
APP1 surface this checkpoint may not alter, so the measurement is scoped to `.product-detail`
and the fact is recorded here rather than silently absorbed or falsely attributed to S02.

The only raw colours in the stylesheet are the four documented GAP-D02 scrim locals, declared
once as variables — the design system still has no scrim token.

## Q. Security

No raw backend error, request id, internal id, storage key, bucket, provider host, cookie or
SQL can reach the page: the error boundary uses only `reset`, and boundary tests forbid
`error.message`, `requestId`, `.stack` and `error.digest` in the whole feature. Relative T01
media URLs are used unchanged. No `dangerouslySetInnerHTML`. `pnpm check:secrets` passed
(360 documents / 1759 tracked files).

## R. Docker-free tests

| Suite | Tests |
|---|---|
| `test/unit/product-detail-model.test.ts` | 15 |
| `test/smoke/product-detail-page.test.tsx` | 22 |
| `test/smoke/product-detail-dedupe.test.tsx` | 4 |
| `test/components/product-detail-gallery.test.tsx` | 18 |
| `test/components/product-detail-share.test.tsx` | 7 |
| `test/components/discover-card-link.test.tsx` | 7 |
| `test/boundary/product-detail-source.test.ts` | 27 |
| **Focused S02 total** | **100, run twice** |

Generated client functions are mocked, never URLs. Full storefront suite: **24 suites / 218
tests**. `@embroidery/api-client` 45, `@embroidery/contracts` 34.

## S. Production Storefront, API and browser evidence

`pnpm smoke:app2-s02-detail:production`, **run twice, identical: 99/99 browser scenarios +
24/24 orchestration, exit 0.**

```text
production Storefront image built from the canonical Dockerfile
production API image + disposable TLS PostgreSQL (ssl=on), private MinIO, real Nginx gateway
gateway reloaded onto the new upstream addresses after every swap and after the restore
no development source bind mounts remain :: {"apiMounts":0,"storefrontMounts":0}
restored runtimes are the development ones :: {"storefrontMounts":3}
no temporary residue :: {"residualImages":0,"residualContainers":0,"temporaryDirectoryRemoved":true}
```

Fixtures seeded into the **disposable copy only** — never the developer's database, and never
called a publish command: no readiness evaluation, no concurrency token, no Audit or Outbox
row. Seven Products cover multiple media + description + SEO, one media, no media, no
description/SEO, `DRAFT`, `ARCHIVED` and a published Product in a non-public category, plus an
unknown and a malformed slug.

**A fixture limit, measured and disclosed rather than faked.** The development database holds
exactly **one** asset with a `READY`, unwatermarked `CATALOG_PREVIEW` derivative, and both
`assets.storage_key` and `asset_derivatives.storage_key` are unique — so it cannot be cloned
without inventing a storage object that does not exist. Because
`uq_product_media__product_asset_role` is unique per *role*, that one asset backs **two**
media rows with distinct `product_media.id`s and therefore two real addresses. The gallery
run is two images, streaming real WebP bytes; a three-image case would need a third real
image in object storage, which this run will not fabricate.

The individual-media-failure scenario aborts the image request in the browser — a genuine
network failure, with nothing corrupted in storage and the JSON contract still advertising
the address.

## T. Durable visibility and cleanup

```text
published detail and its media are both live before the change  (detail 200, media 200)
fixture state changed directly to DRAFT (not a B03 command)
the very next request no longer serves the Product — nothing was cached
the old media address 404s too                                   (API status: 404)
no Storefront route cache preserved the Product content
```

The Storefront status line for the removed Product carries the framework caveat in §E; the
substantive proof is that the Product is gone from the very next response and the media
address really 404s.

## U. Frozen artifacts

```text
OpenAPI          c2c3b874ba6a3a77680e373a67c288b43580e549090c3fbc6075efbd66b84ee8
Shape            16 paths / 19 operations / 34 schemas
Generated client 7524fc918629c7b699ff732771940e05c962309be5eeefdfb53123bbe8ecf5a2
Database         33 migrations / 78 tables / 833 columns / 190 CHECKs
Figma registry   86 IDs / 86 node rows / 11 tables
```

`apps/api`, `apps/admin`, `apps/worker`, database/schema/migrations, OpenAPI, the generated
client tree, object storage, tracked Nginx/Compose and `pnpm-lock.yaml` are all untouched.

**One package change beyond the storefront, stated explicitly:** `@embroidery/contracts`
gained the additive `isPublicProductSlug` export (+15 lines, +46 lines of tests) so the route
and the media path share one definition of a slug. It is a source addition to a package the
Storefront already depends on; no OpenAPI artifact, no generated code, no schema.

## V. Commit A evidence

```text
15eaf96f2f5ce15a0f48c6f7c2e4c59603dfd42d
feat(storefront): implement Product Detail experience
48 files changed, 4189 insertions(+), 39 deletions(-)
```

Route `apps/storefront/src/app/san-pham/[slug]/{page,loading,error}.tsx`; feature
`apps/storefront/src/features/product-detail/**` (6 client components, 3 hooks, 3 model
modules, 1 server service, 1 stylesheet); the S01 card link; the api-client export; the
contracts predicate; 7 test suites; 4 production smoke tools; one root script.

## W. Validation

| Command | Result |
|---|---|
| `pnpm --filter @embroidery/storefront lint` | clean |
| `pnpm --filter @embroidery/storefront typecheck` | clean |
| `pnpm --filter @embroidery/storefront test` | 24 suites / **218** tests |
| `pnpm --filter @embroidery/storefront build` | `ƒ /san-pham/[slug]` |
| focused S02 suite ×2 | **100 / 100**, twice |
| `pnpm check:styles` / `check:frontend-boundaries` / `check:e2e` | pass |
| production detail smoke ×2 | **99/99 + 24/24**, twice |
| `check:secrets` / `check:lifecycle` / `check:pagination-authority` (+14) | pass |
| `check:storefront-route-authority` (+21) | pass |
| `check:storefront-product-detail-authority` (+34) | pass |
| `check:figma-design-index` (+31) | pass — 86/86/11 |
| `check:openapi` / `check:api-client` / `db:check:manifest` | pass — hashes unchanged |
| `node tools/check-file-size.mjs` | pass |
| `pnpm quality` | **exit 0** |
| `git diff --check` | clean |

## X. Acceptance

All 111 criteria are met with two exceptions stated rather than hidden:

- **Criteria 18–21 (safe 404)** — the *surface* is correct and indistinguishable across all
  five reasons with no leaked cause; the *HTTP status* is 200 on Next 16.2.10 for a dynamic
  segment (§E, `FU-APP2-DETAIL-NOT-FOUND-STATUS-01`), reproduced across six configurations.
- **Criterion 64 (mobile story = 342px)** — the column fills the shell's real content width of
  **358px**, because the APP1 shell uses a 16px gutter where the frame drew 24px (§M,
  `FU-APP2-STOREFRONT-CONTENT-BAND-01`). Changing the shell is out of scope.

Criterion 81 is met for every Product Detail control; the shell's own skip and brand links are
below 44px and are APP1 surface (§P).

```text
VERDICT = PASS
```

## Y. Handoff to `APP2-E01` / `APP2-X01`

```text
APP2-S02-G01 = COMPLETE — CORRECTED (C1) — REVIEW_ACCEPTED
APP2-S02     = COMPLETE — DELIVERED_FOR_REVIEW
APP2-E01     = READY — NOT STARTED
APP2-X01     = BLOCKED_BY_APP2-E01
```

`APP2-E01` now has both public surfaces: the Discover feed at `/kham-pha` and Product Detail
at `/san-pham/[slug]`, joined by a real card link, with a production harness that seeds
disposable fixtures, drives a real browser through the gateway and proves durable visibility
after an unpublish. Two follow-ups are open and neither blocks it:
`FU-APP2-DETAIL-NOT-FOUND-STATUS-01` and `FU-APP2-STOREFRONT-CONTENT-BAND-01`.
