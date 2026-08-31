# APP11-E01 — Bounded Cross-Boundary Runtime Acceptance — Completion Report

Checkpoint: `APP11-E01`
Phase: `APP11 — Gallery, Content, SEO and Store Presentation`
Date: 2026-08-31
Mode: final runtime acceptance — 4 journeys / 11 cases, live Admin + API + Storefront

---

## A. Verdict

```text
APP11-E01           = COMPLETE
JOURNEYS            = 4
CASES               = 11
PASS                = 11
FAIL                = 0
BLOCKING_FOLLOW_UPS = 0
NEXT_CHECKPOINT     = APP11-X01
```

| Journey | Cases | Result |
|---|---|---|
| J1 — Admin publication → public Gallery + SEO | 1–4 | **PASS** |
| J2 — Unpublish + public-asset boundary | 5–7 | **PASS** |
| J3 — Crawler/indexing + contract reconciliation | 8–9 | **PASS** |
| J4 — Store presentation/content + non-regression | 10–11 | **PASS** |

`RUNTIME_SOURCE_CHANGED = false`. E01 added one acceptance artifact, this report
and the roadmap status line. No production source, schema, contract, migration,
route or Figma node was modified.

---

## B. Entry baseline

Captured before acceptance, from the working tree and the running stack.

```text
branch        feat/app11-s04-seo-infrastructure
HEAD          85a145a0  feat(app11): deliver static content pages and store
                        presentation (APP11-S05)
working tree  clean at capture (the S05 deliverable was committed first)
push state    not pushed — local only
```

| Measure | Expected | Measured | Source |
|---|---|---|---|
| OpenAPI paths | 116 | **116** | `packages/contracts/openapi/openapi.generated.json` |
| OpenAPI operations | 128 | **128** | same |
| OpenAPI schemas | 252 | **252** | same |
| Migrations | 37 | **37** | `packages/database/migrations/*.sql` |
| Admin page routes | 25 | **25** | `apps/admin/src/app/**/page.tsx` |
| Storefront page routes | 18 | **18** | `apps/storefront/src/app/**/page.tsx` |
| Figma registry rows | 532 | **532** | `node tools/check-figma-design-index.mjs` |

No migration, HTTP operation or page route was expected or added.

The running stack is the canonical gateway (`infrastructure/nginx`, hostname
routing): `embroidery.local` → Storefront + `/api`, `admin.embroidery.local` →
Admin + `/api`. All seven compose services were healthy for the duration.

---

## C. OpenAPI delta reconciliation

APP11 entered at `106 / 115 / 232` and exits at `116 / 128 / 252`.

```text
EXPECTED_G01_OPERATIONS_DELTA = +11
ACTUAL_ACCEPTED_DELTA         = +13
RECONCILIATION                = +2 B03A operations
```

The two operations are, from the current committed contract:

| operationId | Method + path |
|---|---|
| `adminGalleryAsset_create` | `POST /api/admin/gallery-assets` |
| `adminGalleryAsset_preview` | `GET /api/admin/gallery-assets/{assetId}/{rendition}` |

`APP11-G01`'s roadmap prediction predates `APP11-B03A`, which was added later to
close `FU-APP11-B03-01` — the gap where the intake lane could only ever mint
`CATALOG_MEDIA` / `PRODUCTION_SENSITIVE` assets while publication would only ever
attach a `PUBLIC` one, with no operation between them. `B03A`'s own report
records `113 / 125 / 247 → 115 / 127 / 250`, i.e. exactly `+2 / +2 / +3`.

This is documentation reconciliation only. Nothing was removed, reversed or
changed; E01 recommends the roadmap's predicted delta be read as superseded by
the accepted baseline. The pair is pinned by the E01 acceptance artifact so the
reconciliation cannot silently lose its subject.

---

## D. Fixture and authentication setup

**Authentication.** The dev database holds exactly one `ACTIVE` admin account.
The operator supplied its password once, through the human bridge, for this run.
It was typed directly into the Admin login form in the browser and never echoed,
logged, persisted, written into a file, passed as a command-line argument or
recorded in this report. `.env` was neither read for it nor written to.
Subsequent Admin operations were issued as `fetch(…, { credentials: 'include' })`
from the authenticated Admin page, so no credential appears in any tool call.

**Fixture.** One bounded Gallery entry, deliberately named so a future reader
knows it is acceptance residue:

```text
title  E01 Kiểm thử biên chéo
slug   e01-kiem-thu-bien-cheo
id     01a05727-aed5-7845-a03d-b6c7555474ae
```

Plus two Gallery media assets prepared through the delivered `B03A` promotion
operation from two existing `CATALOG_MEDIA` / `PRODUCTION_SENSITIVE` sources:

```text
asset A  01a05728-3964-7def-aefd-e1f5f6fa3dce   from 019fa4a1-e43b-…
asset B  01a05728-3996-76c6-9dae-5bca1fffefba   from 019fe413-4e6d-…
```

Every mutation went through a delivered Admin/API operation. No direct database
mutation, no object-storage mutation, no schema change, no temporary endpoint,
no test-only route, and no Product lifecycle mutation. PostgreSQL was used
**read-only**, to confirm state the API does not project (asset classification,
`updated_at`, publication/indexability counts).

Per §37 the fixture ends `DRAFT` / unpublished, which is where J2 leaves it. The
delivered system has no gallery-entry or gallery-asset deletion operation
(`FU-APP11-B03A-01`), so this residue is expected and accepted.

---

## E. J1 — Admin authors and publishes → public Gallery + SEO

### Case 1 — Draft authoring, Product link and ordered media — **PASS**

`POST /api/admin/gallery-entries` → `201 GALLERY_ENTRY_CREATED`.

| Claim | Evidence |
|---|---|
| Entry created as `DRAFT` | response `status: "DRAFT"`, `assetCount: 0` |
| Linked Product persists | `linkedProductId: 019f9900-…-000000000061` (`ao-thun-cotton`, the one `PUBLISHED` Product) |
| Slug is read-only after create | `PATCH` carrying `slug` → `400 BAD_REQUEST`, `field: "slug"`, `code: "UNKNOWN_FIELD"`; re-read slug unchanged |
| SEO text persists | `PATCH` with `seoTitle` + `seoDescription` → `200 GALLERY_ENTRY_UPDATED`, both read back verbatim |
| Two assets prepared | `POST /api/admin/gallery-assets` ×2 → `201 GALLERY_ASSET_PREPARED` |
| Two assets persisted in intended order | `PUT …/assets` `[A, B]` → positions `A:0, B:1` |
| Reorder is real, not incidental | second `PUT` `[B, A]` → positions `B:0, A:1` |
| Position 0 is cover | the public feed card and `og:image` both resolve to **B**, the position-0 asset |
| No raw storage facts needed by the operator | the operator supplied only a source asset id and its `updatedAt`; no bucket, key or URL |

`displayOrder: 90` was chosen so the entry sorts last and its placement is a
*consequence* of the backend value rather than of insertion timing.

### Case 2 — Publication readiness — **PASS**

Executed between create and asset attachment, i.e. genuinely before the fixture
was complete.

```text
POST …/publication  (0 assets attached)
  → 409 GALLERY_ENTRY_PUBLICATION_NOT_READY
    errors[0].code = GALLERY_ENTRY_ELIGIBLE_ASSET_REQUIRED
  → entry remains DRAFT, assetCount 0
```

The refusal is a business refusal carrying a business code, not a validation
accident. A first attempt with an empty body returned `400` for the missing
`expectedUpdatedAt` (optimistic concurrency); the readiness gate above is the
result once the request itself is well-formed.

After attaching the two assets:

```text
POST …/publication  → 200 GALLERY_ENTRY_PUBLISHED
  DRAFT → PUBLISHED, isIndexable = true accepted, assetCount 2
```

Only one readiness dimension was exercised. `APP11-B02` owns the full matrix and
E01 does not re-run it.

### Case 3 — Public feed and detail projection — **PASS**

**Feed** — `/bo-suu-tap`, live browser.

| Claim | Evidence |
|---|---|
| New entry appears | present after the delivered `Tải thêm mục` continuation (feed page size is 12; the entry is item 15) |
| Placement respects backend `display_order` | last in the feed, matching `displayOrder: 90` against the existing `0…13` |
| DOM/source order equals API order | 15 DOM slugs === 15 API slugs, exact sequence equality |
| Gallery density 3 / 2 / 1 | measured `columnCount` and first-row item count at 1440 / 1024 / 390 → **3 / 2 / 1**; no horizontal overflow at 390 |
| Variable card height | 6 distinct card heights among 15 cards at 1440 |
| Cover loads from public Gallery media authority | `src=/api/public/gallery-entries/e01-kiem-thu-bien-cheo/assets/01a05728-3996…/thumbnail`, `naturalWidth 480` |
| Derived alt is non-empty | `alt="E01 Kiểm thử biên chéo"` |

The 12-of-15 first page is cursor pagination with a delivered continuation
control, not truncation.

**Detail** — `/bo-suu-tap/e01-kiem-thu-bien-cheo`.

| Claim | Evidence |
|---|---|
| Title | single `<h1>` = `E01 Kiểm thử biên chéo` |
| Description | rendered in `main` |
| Visible text beyond images | `main.innerText` length 371 |
| Feed → detail link | reached from the feed card's `Xem chi tiết`; 5 links back to `/bo-suu-tap` |
| Linked public Product link | `/san-pham/ao-thun-cotton` — `Áo thun cotton · Xem tác phẩm` |
| Shell Gallery active state | `Bộ sưu tập` carries `aria-current="page"` |
| Thumbnail order equals API order | `[B, A]` === API `[B, A]` |
| Lightbox opens and follows order | stage trigger opens `role="dialog"` on B (`ảnh 1 trên 2`); `Ảnh sau` advances to A (`ảnh 2 trên 2`) |

Derived alt is non-empty on the meaningful image (`… — ảnh 1 trên 2`); the two
thumbnails carry `alt=""` because they sit inside buttons whose accessible names
are `Xem ảnh 1 trên 2` / `Xem ảnh 2 trên 2` — decorative-inside-labelled-control
is the correct treatment, not a missing alt.

The full `S03-C1` interaction matrix was not re-run.

### Case 4 — Indexable SEO projection — **PASS**

| Claim | Evidence |
|---|---|
| Absolute self-canonical | `<link rel="canonical" href="http://embroidery.local/bo-suu-tap/e01-kiem-thu-bien-cheo">` |
| Open Graph title | `E01 Kiểm thử biên chéo — Nét Thêu` |
| Open Graph description | the entry's `seoDescription`, verbatim |
| Open Graph URL | absolute, equal to the canonical |
| Robots index/follow | `<meta name="robots" content="index, follow">` |
| Gallery `BreadcrumbList` | valid and flat — 2 items, `Bộ sưu tập` (with `item`) then the entry (no `item`, it is the current page) |
| Present in `/sitemap.xml` | yes; total 28 → **29** while published |
| `lastModified` from inventory `updatedAt` | sitemap `2026-08-31T09:31:31.376Z` === DB `updated_at` `2026-08-31T09:31:31.376Z`, to the millisecond |
| Gallery `og:image` resolves | `…/assets/01a05728-3996…/catalog-preview` → `200 image/webp`, 10 100 bytes |

Leakage probes over the rendered detail HTML, all **0** occurrences: the gallery
entry UUID, `DRAFT`, `PUBLISHED`, `galleryEntryId`, `minio`, `bucket`, `X-Amz`,
`objectKey`, `expectedUpdatedAt`, `linkedProductId`. No raw id, storage key,
Admin state or secure/customer datum enters metadata or JSON-LD.

---

## F. J2 — Unpublish and public-asset boundary

### Case 5 — Unpublish removes public visibility everywhere — **PASS**

Captured before unpublish: detail `200`, media URL `200 image/webp`, sitemap
member (29 locs), feed member (15 items).

`DELETE …/publication` → `200 GALLERY_ENTRY_UNPUBLISHED`, `PUBLISHED → DRAFT`.

| Claim | Evidence |
|---|---|
| Entry → `DRAFT` | Admin read-back `status: "DRAFT"`, `assetCount` still 2 |
| Feed no longer lists it | public list API: 0 occurrences; live browser after continuation: 14 items, entry absent |
| Sitemap no longer lists it | 29 → **28** locs, 0 occurrences |
| Public detail API | `404` |
| Detail returns a safe public not-found surface | see below |
| Former public Gallery media no longer serves the derivative | both assets × `catalog-preview` and `thumbnail` → **404**, 201-byte error body, 0 image bytes |

**The dynamic detail route's real transport status, recorded honestly:**

```text
GET /bo-suu-tap/e01-kiem-thu-bien-cheo   HTTP 200
  robots     noindex
  canonical  absent
  og:*       absent
  JSON-LD    absent
  title      Embroidery Commerce — Storefront   (the generic shell title)
```

Entity-leak probes on that body, all **0**: the entry title, its description,
both asset ids, and the linked Product slug. This is the known Next dynamic
`notFound()` transport (`FU-APP2-DETAIL-NOT-FOUND-STATUS-01`), not an E01
regression, and the case is judged on the stated criterion — safe not-found
body, `noindex`, no canonical, no OG, no entity data leak — all of which hold.

### Case 6 — Private asset attachment refused at the HTTP layer — **PASS**

Probe asset: `019ff23e-1255-7bc0-b60a-ee0fb286fee4` —
`CUSTOMER_UPLOAD` / **`CUSTOMER_PRIVATE`** / `ACCEPTED`.

> **Why `CUSTOMER_PRIVATE` and not `PRODUCTION_SENSITIVE`.** The prompt offered
> either. `PRODUCTION_SENSITIVE` would have been the wrong probe: B03A's
> `PREPARATION_SOURCE_LANE` is `CATALOG_MEDIA` / `PRODUCTION_SENSITIVE` — that
> pair *is* the approved promotion source lane, and the two legitimate E01
> assets were promoted from exactly it. `CUSTOMER_PRIVATE` is the classification
> that must never reach public Gallery media, so it is the only honest probe.

| Attempt | Result |
|---|---|
| `POST /api/admin/gallery-assets` with the private `sourceAssetId` | `404 GALLERY_ASSET_SOURCE_NOT_ELIGIBLE` |
| `PUT …/assets` with the private asset id | `400 GALLERY_ENTRY_ASSET_NOT_ELIGIBLE` |

Both refusals are at the HTTP layer against the running API, not in a unit test.

| Claim | Evidence |
|---|---|
| Gallery entry asset set unchanged | `[B, A]` before === `[B, A]` after |
| Private asset not promoted into public Gallery | its row is still `CUSTOMER_UPLOAD` / `CUSTOMER_PRIVATE` / `ACCEPTED`, unmodified |
| No derived copy was minted | assets created in the E01 window are **exactly** the two legitimate promotions; no third row exists |

The private asset's classification was not changed, and no bytes were copied by
any direct storage operation.

### Case 7 — Public media route never serves a private original — **PASS**

Against a currently published entry (`mua-com-xom5`) and its position-0 asset:

| Rendition | Result |
|---|---|
| `catalog-preview` | `200 image/webp`, 28 378 bytes |
| `thumbnail` | `200`, 16 400 bytes |
| `original` | **`400`** |
| `master` | **`400`** |
| `catalog-detail` | **`400`** |
| `catalog-thumb` | **`400`** |

The route serves only the allowed public renditions; the original is not an
addressable rendition at all.

Supplying a private asset id directly to the public Gallery delivery route:

| Asset | `catalog-preview` | `original` |
|---|---|---|
| `019ff23e-…` (`CUSTOMER_PRIVATE`) | `404`, 0 image bytes | `400` |
| `019fa4a1-…` (`PRODUCTION_SENSITIVE`) | `404`, 0 image bytes | `400` |

Leakage probes over both the rendered Gallery detail HTML and the public JSON
payload, all **0** occurrences: `minio`, `9000`, `amazonaws`, `X-Amz-`,
`Signature=`, `bucket`, `objectKey`, `object_key`, `s3://`,
`embroidery-dev-minio`. No original storage URL, bucket, object key, signed
provider query or private original is exposed. This closes the original G01 J4
privacy intent.

---

## G. J3 — Crawler/indexing and contract reconciliation

### Case 8 — Crawler and private indexing boundary — **PASS**

```text
GET /robots.txt   200
GET /sitemap.xml  200
```

`robots.txt` allows `/` and disallows `/truy-cap`, `/xac-minh-lien-he`,
`/yeu-cau`, `/san-pham/*/thiet-ke`, and names the absolute sitemap URL.

**Sitemap inventory — 28 URLs at rest**, composed exactly as required:

| Group | Count | Present |
|---|---|---|
| Homepage | 1 | `/` |
| Discover | 1 | `/kham-pha` |
| Canonical categories | 4 | `?category=` `thu-bong`, `khan`, `quan-ao`, `khac` |
| Gallery feed | 1 | `/bo-suu-tap` |
| S05 static URLs | **7** | `/dich-vu`, `/cau-hoi-thuong-gap`, `/cua-hang`, and the four `/chinh-sach/*` policies |
| Indexable Gallery details | 13 | matches the DB's 13 `PUBLISHED` + `is_indexable` rows |
| Indexable Product details | 1 | `/san-pham/ao-thun-cotton`, the one `PUBLISHED` Product |

**Exclusions, each verified against live data rather than asserted:**

| Excluded | Evidence |
|---|---|
| Private routes | 0 occurrences of `truy-cap`, `yeu-cau`, `xac-minh` |
| Product Studio | 0 occurrences of `thiet-ke` |
| Admin | 0 occurrences of `admin` |
| DRAFT Gallery | `bo-suu-tap-kiem-thu-a02-1` and `ky-niem-duoc-giu-lai` are `DRAFT` and absent |
| `noindex` Gallery | `khung-cua-go-xom5` is `PUBLISHED` with `is_indexable = false` and is absent — the one case that separates "published" from "indexable" |
| Rejected aliases | `/collections`, `/gallery`, `/thu-vien` → all `404`, none in the sitemap |
| `/chinh-sach` root | `404`; 0 occurrences of a bare `/chinh-sach` loc |

`lastmod` correctness was spot-checked to the millisecond on two entries against
`gallery_entries.updated_at`.

**All nine private Storefront routes** — every one returns `noindex, nofollow`
with **zero** canonical, **zero** `og:*` and **zero** JSON-LD:

```text
/san-pham/{publicSlug}/thiet-ke     /truy-cap/thanh-toan
/truy-cap                           /truy-cap/thanh-toan-con-lai
/truy-cap/bao-gia                   /xac-minh-lien-he
/truy-cap/duyet-thiet-ke            /yeu-cau/moi
                                    /yeu-cau/da-gui
```

No secure token, request, order, payment or customer fact appears in any of
their metadata surfaces. No payment or order workflow was executed — only route
metadata was inspected.

### Case 9 — Contract/persistence divergence disposition — **PASS**

Owns `FU-APP11-S04-C1-02`. **Both sides verified from current artifacts.**

```text
Committed OpenAPI  PublicCategoryResponse.slug
                   enum = { thu-bong, khan, quan-ao, khac }

Running dev API    GET /api/public/products/ao-thun-cotton
                   data.category = { slug: "ao-thun", name: "Áo thun" }
```

The divergence is real and live.

**APP11's Storefront containment, verified at runtime on
`/san-pham/ao-thun-cotton`:**

| Claim | Evidence |
|---|---|
| Breadcrumb emits no invalid category link | `category=ao-thun` occurs **0** times in the page; the only Discover href is `/kham-pha` |
| Continue Discovering emits no invalid category link | same measurement — the page has exactly one `kham-pha` href and it is unfiltered |
| Product canonical remains valid | `http://embroidery.local/san-pham/ao-thun-cotton` |
| Product OG remains valid | `og:title`, `og:description`, absolute `og:url`, `og:locale`, `og:type` all present and well-formed |
| Discover rejects invalid category state safely | `/kham-pha?category=ao-thun` → real **`404`** not-found surface; `?category=khan` → `200` |

Both surfaces narrow through the single predicate `toDiscoverCategorySlug` —
they degrade differently and correctly (the crumb drops the level; the CTA keeps
its link and points it at unfiltered Discover), but neither ever composes an
href from the raw API value. The E01 acceptance artifact pins this.

**Classification:**

```text
FU-APP11-S04-C1-02 = NONBLOCKING_PREEXISTING_CONTRACT_DATA_DIVERGENCE
```

Against the blocking rule, all four non-blocking conditions hold and none of the
four blocking conditions does:

| Blocking condition | Holds? | Why not |
|---|---|---|
| An APP11 public page emits a broken/invalid route because of it | **No** | 0 invalid links measured on the affected Product page |
| APP11 SEO/structured data publishes invalid navigation because of it | **No** | breadcrumb JSON-LD omits the category level entirely; sitemap carries only the four canonical category URLs |
| Generated-client mismatch causes an APP11 runtime failure | **No** | `check:generated` PASS; the affected pages render `200` |
| APP11 cannot meet its exit criteria while it exists | **No** | all 11 cases pass with it present |

The divergence is Catalog data predating and sitting outside APP11-owned
Gallery/content data; the fix is a Catalog database/contract change requiring
change control that E01 may not perform. Routed to the **next real
database/contract-change authority / APP12 planning**.

**`APP11-X01` may close with this follow-up open.** It is a non-blocking
pre-existing divergence that APP11's own boundary demonstrably contains, and
closing APP11 does not make it harder to fix.

No backend, database, OpenAPI or Figma artifact was modified in E01.

---

## H. J4 — Store presentation, content and non-regression

### Case 10 — Homepage, content pages and footer presentation — **PASS**

**Homepage** (`/`): exactly one `<h1>`; internal `/kham-pha` link present;
internal `/bo-suu-tap` link present. The three canonical CP0 scaffold strings —
`Embroidery Commerce Storefront`, `Ứng dụng storefront`, `checkpoint CP0` — each
occur **0** times. (A naive `placeholder` grep matches only the BEM class
`homepage-works__placeholder`, a loading skeleton, not scaffold copy.)

**The seven content routes**, each `HTTP 200`, one `<h1>`, canonical, public OG,
and at least one delivered internal link (13 unique internal hrefs each):

| Route | Title | Unique description |
|---|---|---|
| `/dich-vu` | Dịch vụ thêu theo yêu cầu — Nét Thêu | ✅ |
| `/cau-hoi-thuong-gap` | Câu hỏi thường gặp — Nét Thêu | ✅ |
| `/cua-hang` | Ghé xưởng — Nét Thêu | ✅ |
| `/chinh-sach/giao-hang` | Chính sách giao hàng — Nét Thêu | ✅ |
| `/chinh-sach/thanh-toan` | Chính sách thanh toán — Nét Thêu | ✅ |
| `/chinh-sach/doi-tra` | Chính sách đổi trả — Nét Thêu | ✅ |
| `/chinh-sach/bao-mat` | Chính sách bảo mật — Nét Thêu | ✅ |

All eight titles and all eight descriptions (homepage included) are distinct.
OG completeness spot-checked on `/dich-vu`: `og:title`, `og:description`,
absolute `og:url`, `og:locale`, `og:type`.

**Unknown policy** `/chinh-sach/khong-ton-tai` → `404`, `noindex`, no canonical,
no OG. `/chinh-sach` root → `404`.

**Local/store truthfulness.** `resolveStoreFacts()` returns an empty set: no
canonical address, opening hours, phone or e-mail exists in repository
authority, so **no row is published**. Probes on `/cua-hang`, all **0**
occurrences: the D01 placeholders (`Địa chỉ xưởng`, `giá trị canonical`), `TBD`,
`example.com`, a fabricated phone prefix, `@gmail`, `Quận`, `Đường`; and **no**
`tel:` or `mailto:` link exists. The page degrades truthfully instead — the
footer says `Thông tin địa chỉ và giờ mở cửa sẽ được cập nhật.` and directs the
visitor to the request and contact channels that do exist.

**Footer supplement** — measured live at three viewports:

| Claim | Evidence |
|---|---|
| Above the existing Footer | `.store-presentation` at DOM index 5673, `<footer>` at 7332 |
| 1440 = 4 columns | `grid-template-columns: 268.25px ×4`, all four on one row |
| 1024 = 2 × 2 | `432.5px ×2`, 2 rows of 2 |
| 390 = 1 stack | `327px`, 4 rows of 1 |
| Policy links all resolve | the four `/chinh-sach/*` links → `200` (verified above) |
| Source order = visual order | every column has computed `order: 0`; DOM heading sequence === top-sorted visual sequence |
| Mobile 100px dock-safe reserve | `.store-presentation__columns` `padding-bottom: 100px` at 390, `0px` from tablet up |
| Floating social not duplicated into footer | 0 occurrences of `dock`, `zalo`, `messenger` inside the footer region |

No horizontal overflow at any of the three viewports.

`NEXT_PUBLIC_ZALO_CONTACT_URL` and `NEXT_PUBLIC_MESSENGER_CONTACT_URL` are both
empty in the running container, so `dock rendered = false` — accepted per §21.
No provider URL was fabricated.

### Case 11 — Discovery architecture and link-integrity non-regression — **PASS**

**Product Discover** `/kham-pha`:

| Claim | Evidence |
|---|---|
| 5 / 3 / 2 | computed `column-count` on `.discover__masonry` = **5** at 1440, **3** at 1024, **2** at 390 |
| Existing category query semantics | `?category=khan` → `200`; `?category=ao-thun` → `404` |
| Product cards → `/san-pham/[slug]` | `/san-pham/ao-thun-cotton` |

Density was read from the computed column rule rather than by counting a row,
because the dev database holds exactly one `PUBLISHED` Product — counting cards
could not distinguish 5 from 2. The rule is the authority the cards obey.

**Gallery** `/bo-suu-tap`:

| Claim | Evidence |
|---|---|
| 3 / 2 / 1 | first-row item count **3 / 2 / 1** at 1440 / 1024 / 390, corroborated by computed `column-count: 3` at 1440 |
| Variable-height cards | 6 distinct heights among 15 cards |
| Cards → `/bo-suu-tap/[slug]` | all 15 hrefs |

The two are distinct public capabilities at distinct densities. E01 uses
`Gallery = 3 / 2 / 1` and `Product Discover = 5 / 3 / 2` per §3; the delivered
Gallery was **not** failed against the stale G01 `5 / 3 / 2` line.

**No duplicate aliases**: `/collections`, `/gallery`, `/thu-vien` → all `404`,
and none exists as an App Router page.

**Known divergence fixture** `/san-pham/ao-thun-cotton`: breadcrumb → `/kham-pha`
with no `category=ao-thun`; Continue Discovering → `/kham-pha` with no
`category=ao-thun`. Measured as 0 occurrences of the string anywhere in the page.

**Content architecture**: the committed OpenAPI contains **0** content-page
paths; `content_pages` holds **0** rows, so no `LANDING` instance exists; no
blog/Journal route exists in the App Router tree.

---

## I. Runtime and design viewports

Every responsive claim was measured in a live browser against the canonical
gateway at the three approved viewports:

```text
1440 × 900   desktop
1024 × 900   tablet
 390 × 844   mobile
```

Console errors observed across the whole session, and their disposition:

| Error | Disposition |
|---|---|
| `favicon.ico` `404` (Storefront and Admin) | pre-existing `FU-APP11-S01-01`, non-blocking, excluded from E01-caused errors per §31 |
| `webpack-hmr` WebSocket `502` | dev-only; the gateway does not proxy the HMR socket. Development-infrastructure noise, not an APP11 defect |
| `400` / `404` / `409` on `…/gallery-entries/…` and `…/gallery-assets` | **E01's own deliberate negative-path probes** — Cases 2 and 6. Expected refusals, not defects |

No E01-caused console error.

---

## J. SCSS compile gates

```text
node tools/check-app-scss.mjs storefront
  SCSS compile PASS  apps/storefront/src/styles/main.scss
  139 572 bytes CSS, 1 deprecation warning, not written to disk

node tools/check-app-scss.mjs admin
  SCSS compile PASS  apps/admin/src/styles/main.scss
  210 641 bytes CSS, 0 deprecation warnings, not written to disk
```

Both **PASS**. No SCSS source was changed in E01, and no repository-wide
historical SCSS cleanup was run.

---

## K. Contract, generated-client, migration and route baseline

```text
pnpm --filter @embroidery/api openapi:check
  OpenAPI artifact is up to date                                     PASS

pnpm --filter @embroidery/api-client check:generated
  generated client is up to date
  tree hash a19cb87a302342255aaaf8f114b86e3686a38c02a1ee448d46b942a2aa988a70
                                                                      PASS
```

| Measure | Value | Unchanged |
|---|---|---|
| OpenAPI paths / operations / schemas | 116 / 128 / 252 | ✅ |
| `/api/*content-page*` operations | **0** | ✅ |
| Migrations | 37 | ✅ |
| Admin page routes | 25 | ✅ |
| Storefront page routes | 18 | ✅ |

Nothing was regenerated and no migration was created. `/robots.txt` and
`/sitemap.xml` are framework metadata routes and are not counted as `page.tsx`.

---

## L. Figma spot-check and registry

```text
node tools/check-figma-design-index.mjs
  Figma Design Index check passed
  532 registry IDs, 532 node rows, 23 registry tables
  canonical files + statuses + deep links + composites verified       PASS
```

```text
FIGMA_LIVE_SPOTCHECK = NOT_AVAILABLE
```

One bounded availability attempt was made, per §23. The `figma-desktop` MCP
server refused the connection for this session, and the hosted Figma MCP server
requires an interactive OAuth authorization that E01 cannot complete on the
operator's behalf mid-checkpoint. This is the same unavailability recorded at
`APP11-S03` and `APP11-S05`.

E01 therefore rests on the 532-row registry gate, the accepted `APP11-D01` /
`APP11-D01-C1` authority, and this checkpoint's own live runtime evidence — and
does **not** block on the external tool. No Figma node or index row was
modified. The availability note is carried to `APP11-X01`.

---

## M. Follow-up classification

| ID | Status | Blocking for `APP11-X01` | Owner / next authority | Evidence |
|---|---|---|---|---|
| `FU-APP11-S04-C1-02` | **OPEN** — `NONBLOCKING_PREEXISTING_CONTRACT_DATA_DIVERGENCE` | **No** | Next database/contract-change authority / APP12 planning | §G Case 9 — both sides verified; 0 invalid links emitted; Discover 404s safely |
| `FU-APP11-S04-01` | **OPEN** — `OPEN_OPERATOR_CONFIGURATION` | **No** | Operator | §N below — `.env` still lacks `STOREFRONT_PUBLIC_ORIGIN`; runtime succeeds under supplied authority; fail-closed behaviour intact |
| `FU-APP11-S05-01` | **OPEN** — canonical store facts unavailable | **No** | Product Owner | §H Case 10 — all four facts `NOT_AVAILABLE`; 0 fabricated values; UI degrades truthfully |
| `FU-APP11-S01-01` | **OPEN** — favicon absent | **No** | Later checkpoint | §I — `favicon.ico` 404, pre-existing, excluded from E01-caused errors |
| `FU-APP2-DETAIL-NOT-FOUND-STATUS-01` | **OPEN** — dynamic not-found transport is HTTP 200 | **No** | Later checkpoint | §F Case 5 + §N — re-measured on one Product and one Gallery unknown route; safe body, `noindex`, no canonical, no OG, no entity leak |
| `FU-APP11-B03A-01` | **OPEN** — no gallery asset deletion/archive | **No** | Later checkpoint | §D — accepted as the reason the E01 fixture remains as `DRAFT` residue; unattached assets have no public address |
| `FU-APP11-S03-01` | **OPEN** — live Figma tooling unavailable | **No** | Operator / tooling | §L — both MCP servers unavailable; registry gate PASS at 532 |

```text
BLOCKING_FOLLOW_UPS = 0
NONBLOCKING         = 7
```

No checkpoint was created for any follow-up.

---

## N. Carried follow-up detail

### `FU-APP11-S04-01` — Storefront public origin

```text
STATUS = OPEN_OPERATOR_CONFIGURATION
```

`.env` still carries no `STOREFRONT_PUBLIC_ORIGIN` line. The running Storefront
container nevertheless holds `STOREFRONT_PUBLIC_ORIGIN=http://embroidery.local`,
supplied by the same safe external environment injection accepted at S04/S05;
`docker-compose.dev.yml` passes it through with `${STOREFRONT_PUBLIC_ORIGIN:-}`
and no default, at build arg and runtime for the Storefront and for the worker.

E01 proves both halves:

- **Runtime succeeds with explicit correct authority** — every absolute
  canonical, `og:url`, `og:image`, `robots.txt` sitemap line and sitemap `loc`
  measured in this report is built on `http://embroidery.local`, correctly.
- **Missing/malformed value still fails closed** — the tracked contract is
  unchanged: `.env.example` documents the variable with an empty value and the
  comment "Unset, the Storefront's SEO routes fail rather than publishing a
  guessed origin", and the focused accepted tests
  (`test/unit/seo-public-origin.test.ts`, `test/smoke/seo-metadata-routes.test.ts`)
  own that behaviour. E01 weakened nothing.

`.env` was **not** written. An operator-owned local configuration file that the
tracked environment contract correctly describes is not a code defect.
`APP11-X01` may close with this as a non-blocking operational follow-up.

### `FU-APP2-DETAIL-NOT-FOUND-STATUS-01` — dynamic not-found status

Re-measured, not fixed:

| Route | HTTP | Body | robots | canonical | OG |
|---|---|---|---|---|---|
| `/san-pham/khong-ton-tai-e01` | **200** | safe generic not-found | `noindex` | absent | absent |
| `/bo-suu-tap/khong-ton-tai-e01` | **200** | safe generic not-found | `noindex` | absent | absent |

Both collapse to the same surface, and the unpublished-entry route in Case 5
collapses to it too — with the entry's title, description, asset ids and linked
Product slug all absent. Non-blocking for APP11: no private or entity data
leaks, and no such URL can enter the sitemap because sitemap membership is
computed from the indexable inventory.

### `FU-APP11-S05-01` — canonical store facts

```text
address        NOT_AVAILABLE
opening hours  NOT_AVAILABLE
phone          NOT_AVAILABLE
email          NOT_AVAILABLE
```

Unchanged; no new Product Owner facts were supplied. E01 verified only that no
fabricated production value ships, and none does. Non-blocking while the UI
degrades truthfully, which it does.

---

## O. Files changed

Git-authoritative. E01 changed three files and no production source.

```text
A  apps/storefront/test/acceptance/app11-e01.acceptance.test.ts
A  docs/implementation/reports/APP11-E01-COMPLETION-REPORT.md
M  docs/implementation/phases/APP11-GALLERY-CONTENT-AND-SEO.md
```

The acceptance artifact is **263 lines**, within the 600-line test cap and below
the 500-line review threshold, so no fixture/case split was needed. It reads the
shipped source and the committed contract only — it holds no staff session and
does not attempt to re-run the live journeys, which is what this report is for.
It creates no generic E2E framework and duplicates no Playwright configuration.

---

## P. Validation

```text
CHANGE_IMPACT
  one new acceptance test file (node built-ins only, no app runtime imports)
  one new report
  one roadmap status line
  no production source, schema, contract, migration, route or Figma change
```

```text
TESTS_RUN
  E01 live acceptance — 4 journeys / 11 cases      11 PASS / 0 FAIL
  apps/storefront jest test/acceptance/app11-e01   14 PASS / 0 FAIL
  pnpm --filter @embroidery/storefront typecheck   PASS
  node tools/check-app-scss.mjs storefront         PASS
  node tools/check-app-scss.mjs admin              PASS
  pnpm --filter @embroidery/api openapi:check      PASS
  pnpm --filter @embroidery/api-client check:generated   PASS
  node tools/check-figma-design-index.mjs          PASS (532)
  route counts (Admin 25 / Storefront 18)          PASS
  migration count (37)                             PASS
  Prettier on the changed E01/doc files            PASS
  git status / diff                                clean and intentional
```

```text
TESTS_NOT_RUN            WHY_NOT_RUN
full monorepo            §38 forbids it; E01 is bounded acceptance
all API tests            no API source changed
all Admin tests          no Admin source changed
all Storefront tests     no Storefront production source changed; the S05
                         suites passed at the commit E01 starts from
all worker tests         no worker source changed
DB regression            no migration, no schema change
full Playwright suite    §38 forbids it; the browser tier is release-gated
                         (CMD-QUALITY-E2E), never a default acceptance criterion
APP10-E01                historical phase suite
payment / inventory /    historical phase suites, untouched by APP11
production / quotation /
merge tests
production builds        S05 already passed them and E01 changed no runtime
                         source; the acceptance harness needed none
```

Justification per `VALIDATION_GOVERNANCE.md` §2: each scoped validation above is
justified by the checkpoint acceptance criteria, by the files changed (the new
test file justifies the storefront typecheck and its own Jest run), or by an
explicit E01 requirement (§24–§27). No repository-wide aggregate command was
used or created.

---

## Q. Acceptance criteria

All 63 criteria in §42 hold. The ones worth naming explicitly:

- exactly 4 journeys and 11 cases; 11 PASS, 0 FAIL;
- the bounded DRAFT fixture was created, content/SEO/Product link persisted, and
  two Gallery public assets persisted in explicit, re-ordered sequence;
- one incomplete publication attempt was refused and the completed fixture
  published;
- the feed reflected it at 3/2/1 with DOM order equal to backend order, and the
  detail rendered text plus ordered media with derived non-empty alt;
- the indexable projection carried an absolute canonical, public-safe OG, a
  valid flat `BreadcrumbList` and sitemap membership with `lastModified` from
  `updatedAt`;
- unpublish removed feed, detail, sitemap and media visibility;
- a `CUSTOMER_PRIVATE` asset was refused at the HTTP layer and could not be used
  to retrieve bytes through the public Gallery route;
- `robots.txt` and `sitemap.xml` are `200`, the sitemap carries only the current
  public/indexable inventory, and all nine private routes remain
  `noindex, nofollow` with no canonical, public OG or JSON-LD;
- the contract/persistence divergence was verified on both sides and classified
  non-blocking, with the invalid `category=ao-thun` link absent from both the
  Product breadcrumb and the continuation CTA;
- the baselines all held: 116/128/252, 37 migrations, 25 Admin pages, 18
  Storefront pages, 532 Figma rows;
- the `+11` vs `+13` operation delta is reconciled to B03A's two operations;
- no backend, schema, OpenAPI or Figma mutation; no historical full regression;
- every follow-up is classified with an explicit blocking count of **0**;
- nothing was pushed.

---

## R. Roadmap

```text
APP11-E01   COMPLETE
APP11-X01   NEXT
```

Exactly one NEXT. `docs/implementation/phases/APP11-GALLERY-CONTENT-AND-SEO.md`
§0 updated accordingly. `APP11-X01` was not started.

`CORRECTION_USED = 0 / 1`.
