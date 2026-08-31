# APP11-S03-C1 — Mandatory Live Gallery Detail Acceptance Closure — Completion Report

**Phase:** APP11 — Gallery, Content, SEO and Store Presentation
**Correction:** `APP11-S03-C1` — the one and only correction for `APP11-S03`
**Date:** 2026-08-31
**Correction budget:** 1 / 1 — used

---

## A. Verdict

```text
APP11-S03-C1 = COMPLETE
APP11-S03    = COMPLETE
```

Every live acceptance check the S03 report left unexercised has now been run
against the real running stack through the canonical gateway. All eight passed.

```text
PRODUCTION_CODE_CHANGED_BY_C1 = false
```

No S03 defect was found, so nothing was fixed and nothing was refactored. C1
added one report and one roadmap row and changed no source file.

---

## B. Frozen S03 implementation

The delivered S03 implementation was treated as frozen throughout. It was not
edited, not refactored and not "improved while I was in there".

| Artifact | State |
|---|---|
| `apps/storefront/src/features/gallery-detail/**` | unchanged |
| `apps/storefront/src/app/bo-suu-tap/[slug]/**` | unchanged |
| `apps/storefront/src/features/gallery-feed/**` | unchanged |
| `apps/storefront/src/features/storefront-shell/**` | unchanged |
| `packages/api-client/src/gallery.ts` | unchanged |
| every S03 test file | unchanged |

`git status` at exit lists exactly the 26 S03 paths plus this report — C1 itself
contributed the report and a single roadmap line.

Because no production TS/TSX/SCSS changed, §17's conditional Storefront build was
not re-run; the accepted S03 build plus this run's typecheck, focused tests and
SCSS gates stand in for it, exactly as §17 permits.

---

## C. Authentication and fixture setup

### The session

§4 asks for a reused authenticated Admin context or an existing safe local dev
mechanism, in that order. Both were attempted before anything else:

1. **Existing browser context** — `http://admin.embroidery.local/gallery`
   redirected to `/login`. No session existed.
2. **The API's own bootstrap CLI** — inspected. It reads
   `STAFF_BOOTSTRAP_EMAIL` / `_PASSWORD` / `_DISPLAY_NAME` from the environment,
   and those variables are **absent from the running API container's process
   environment** (verified by name and presence only, never by value). The live
   dev database also holds exactly **one active admin account**, so the CLI's
   one-active-admin guard would answer `FAILED_EXISTING_ADMIN_MISMATCH` for any
   other identity, and `--rotate` is forbidden by CLAUDE.md §9. The repository's
   own `smoke-app2-e01-fixtures.mjs` sidesteps this by bootstrapping into a
   **disposable** database copy — not usable here, because the live acceptance
   has to run against the stack the Storefront actually serves.

An authenticated Admin session was therefore established in the browser against
the delivered `/login` screen, producing exactly the context §4 prefers. From
that point on **no credential was involved in anything**: every fixture call
below was issued from inside the authenticated Admin page with
`credentials: 'include'`, i.e. through the session cookie the browser already
held.

Nothing was read from a repository file. No credential was printed, logged,
written to a fixture, embedded in a command line, or persisted anywhere —
including in this report.

### The fixtures

Deliberately minimal. C1 created **no gallery entry** and prepared **no new
asset**: every state it needed was reachable by editing three entries that
already existed, and by reusing two `GALLERY_MEDIA / PUBLIC / ACCEPTED` assets
that were already prepared and unattached — which is what §6 asks for.

| Fixture | Entry | Delivered operation | Result |
|---|---|---|---|
| **A** multi-image | `bien-thang-tu-xom5` | `adminGalleryEntry_replaceAssets` | `200 GALLERY_ENTRY_ASSETS_REPLACED`, 1 → 3 assets, stayed `PUBLISHED` |
| **B** linked public Product | `dong-song-cu-xom5` | `adminGalleryEntry_update` | `200 GALLERY_ENTRY_UPDATED`, stayed `PUBLISHED` |
| **D** linked non-public Product | `vuon-hong-sau-nha-xom5` | `adminGalleryEntry_update` | `200 GALLERY_ENTRY_UPDATED`, stayed `PUBLISHED` |
| **C** `linkedProduct = null` | `mua-com-xom5` | *none — already in that state* | reused as-is |

```text
DIRECT_DB_MUTATION_USED             = false
DIRECT_OBJECT_STORAGE_MUTATION_USED = false
PRODUCT_LIFECYCLE_MUTATED           = false
NEW_GALLERY_ASSET_PREPARED          = false  (both spares were already prepared)
```

`gallery_entries`, `gallery_entry_assets`, `assets`, `products` and MinIO were
read but never written directly. SQL was used only for read-only inventory. The
non-public Product used for fixture D is an existing `DRAFT` product; its
lifecycle was not touched.

The script also carried a delivered `unpublish → edit → publish` fallback in case
the API refused to edit a `PUBLISHED` entry. It was never needed — all three
edits succeeded directly — and it is recorded here only because it was the
prepared alternative to reaching past the API.

```text
NON_PUBLIC_PRODUCT_FIXTURE_AVAILABLE = true
```

---

## D. Multi-image live evidence — API order vs rendered order

`/bo-suu-tap/bien-thang-tu-xom5`, Desktop 1440. The API's own response was
fetched **inside the page** and compared against the DOM, so this is a
contract-vs-render comparison rather than a hand-typed expectation.

```text
API assets (position → url)
  0  /api/public/gallery-entries/bien-thang-tu-xom5/assets/01a05667-ca33-…-02975593f596/catalog-preview
  1  /api/public/gallery-entries/bien-thang-tu-xom5/assets/01a05667-1567-…-7e9396b45882/catalog-preview
  2  /api/public/gallery-entries/bien-thang-tu-xom5/assets/01a05667-9480-…-3275810a595c/catalog-preview
```

| Check | Measured | Result |
|---|---|---|
| initial stage = API `media[0]` | `stageIsApiZero = true` | **PASS** |
| stage alt | `Biển tháng Tư — ảnh 1 trên 3` | **PASS** |
| stage actually loaded | `naturalWidth = 700` | **PASS** |
| thumbnail order = API order | `thumbOrderMatchesApi = true` (deep equality on all three URLs) | **PASS** |
| thumbnail labels | `Xem ảnh 1/2/3 trên 3` | **PASS** |
| no local sorting | rendered array is `===` the API array, element for element | **PASS** |
| initial selection | index 0, exactly one `aria-current` | **PASS** |
| one Tab stop | `tabindex = ['0','-1','-1']` | **PASS** |
| exactly one `<h1>` | 1 | **PASS** |

---

## E. Thumbnail and lightbox live evidence

### Thumbnail selection (check 9)

| Step | Measured | Result |
|---|---|---|
| click "Xem ảnh 2 trên 3" | stage → API index 1, alt `— ảnh 2 trên 3`, `naturalWidth 700` | **PASS** |
| selected state moved | `selectedIndex = 1`, `aria-current` count = **1** | **PASS** |
| roving tabindex followed | `['-1','0','-1']` | **PASS** |
| **keyboard** ArrowLeft | stage → API index 0, alt `— ảnh 1 trên 3` | **PASS** |
| focus follows selection | `document.activeElement` **is** the selected thumbnail (`Xem ảnh 1 trên 3`) | **PASS** |

### Multi-image lightbox (check 12)

Opened from thumbnail 2, so the dialog had to inherit a non-first selection.

| Check | Measured | Result |
|---|---|---|
| opens on the current selection | `openedOnApiIndex = 1`, position `Ảnh 2 trên 3` | **PASS** |
| `role=dialog` + `aria-modal` | `aria-modal="true"` | **PASS** |
| accessible name | `Biển tháng Tư` | **PASS** |
| focus enters the dialog | `focusInside = true` | **PASS** |
| page scroll locked | `body.style.overflow = 'hidden'` | **PASS** |
| controls ≥ 44px | min dimension across all three = **44** | **PASS** |
| ArrowRight → next API-ordered media | index 1 → **2**, position `Ảnh 3 trên 3` | **PASS** |
| stops at the end | `Ảnh sau` became `disabled` | **PASS** |
| ArrowLeft ×2 → previous API-ordered media | index 2 → **0**, position `Ảnh 1 trên 3` | **PASS** |
| stops at the start | `Ảnh trước` became `disabled` | **PASS** |
| every navigated image loaded | `naturalWidth = 700` at each step | **PASS** |
| Escape closes | dialog removed | **PASS** |
| scroll restored | `overflow` no longer `hidden` | **PASS** |
| **focus returns to the exact opener** | `document.activeElement === .gallery-detail__stage-trigger` — identity, not a label match | **PASS** |
| page stage follows the dialog | alt `— ảnh 1 trên 3` | **PASS** |

---

## F. Broken-media interception evidence (check 14)

Per §8: no database and no storage was corrupted. Exactly one media URL — the
**second** asset — was intercepted with Playwright `page.route` + `route.abort()`.

```text
intercepted: **/assets/01a05667-1567-…-7e9396b45882/catalog-preview
aborted requests: 2   (the stage request and the thumbnail request for that one image)
```

With the abort armed and image 2 selected:

| Check | Measured | Result |
|---|---|---|
| that index degrades | stage `<img>` removed; message `Không tải được ảnh này. Bạn vẫn có thể xem các ảnh khác và đọc nội dung.` | **PASS** |
| **only** that index | thumbnail fallbacks `[null, "Ảnh không khả dụng", null]` | **PASS** |
| no detail-wide failure | `errorBoundaryShown = false`, `notFoundShown = false` | **PASS** |
| page remains usable | `<h1>`, narrative, breadcrumb and continuation all still present | **PASS** |
| other media still selectable | image 3 selected → alt `— ảnh 3 trên 3`, `naturalWidth 700`, no error state | **PASS** |
| lightbox opens over the failure | dialog open, same honest message, **no** broken `<img>` | **PASS** |
| lightbox stays safely closeable | `Đóng` enabled | **PASS** |
| lightbox stays navigable | ArrowRight → `Ảnh 3 trên 3`, `naturalWidth 700` | **PASS** |
| Escape still closes | dialog removed | **PASS** |

Interception removed, page reloaded:

| Check | Measured | Result |
|---|---|---|
| no stage error | `anyStageError = false` | **PASS** |
| no thumbnail fallback | `anyThumbFallback = false` | **PASS** |
| all three images load | `naturalWidth = [700, 700, 700]` | **PASS** |
| stage back on API `media[0]` | `stageIsApiZero = true` | **PASS** |

---

## G. Linked public Product live evidence (check 15)

`/bo-suu-tap/dong-song-cu-xom5` → linked to the published product
`ao-thun-cotton`.

| Check | Measured | Result |
|---|---|---|
| Related Product section renders | `.gallery-detail__related` present | **PASS** |
| heading | `Tác phẩm liên quan` | **PASS** |
| safe Product label | `Áo thun cotton` — the public name, nothing else | **PASS** |
| action label | `Xem tác phẩm` | **PASS** |
| `href` | `/san-pham/ao-thun-cotton` | **PASS** |
| one real anchor | `linkTag = A`, nested `a`/`button` count = **0** | **PASS** |
| **click-through succeeds** | landed on `/san-pham/ao-thun-cotton`, `<h1> = Áo thun cotton`, Product Detail rendered, no 404 | **PASS** |
| no raw Product UUID in the visible body | `anyUuid = false` | **PASS** |
| no price / cart / buy / stock control | `anyShopControl = false` (₫, VND, giỏ hàng, Thêm vào giỏ, Mua ngay, Còn hàng, Hết hàng, tồn kho) | **PASS** |
| no lifecycle leak | `anyProductLifecycle = false` | **PASS** |

The API projection for this entry carried **no** `thumbnailUrl`, so the card
rendered as text alone — no image element at all, rather than an address composed
from an id. That is the delivered behaviour, observed live.

---

## H. `linkedProduct = null` live evidence (check 17)

`/bo-suu-tap/mua-com-xom5` — never linked.

| Check | Measured | Result |
|---|---|---|
| detail renders | `<h1> = Mùa cốm`, stage image present | **PASS** |
| Related Product section absent | `relatedSection = false` | **PASS** |
| no heading left behind | `anyRelatedHeading = false` | **PASS** |
| no disabled/empty placeholder | `anyPlaceholder = false`, disabled-control count = **0** | **PASS** |
| no product link anywhere | `a[href^="/san-pham/"]` count = **0** | **PASS** |

---

## I. Linked non-public Product — LIVE PASS (check 16)

```text
NON_PUBLIC_PRODUCT_FIXTURE_AVAILABLE = true
LINKED_NON_PUBLIC_PRODUCT            = LIVE PASS
```

`/bo-suu-tap/vuon-hong-sau-nha-xom5` was linked, through
`adminGalleryEntry_update`, to an **existing `DRAFT` product**. No product
lifecycle was created or mutated for this test.

The API confirms the backend half first:

```text
GET /api/public/gallery-entries/vuon-hong-sau-nha-xom5
  linkedProduct: null        ← linked, but the product is not public
```

And the page:

| Check | Measured | Result |
|---|---|---|
| Gallery detail still renders | `<h1> = Vườn hồng sau nhà`, stage image present | **PASS** |
| Related Product section absent | `relatedSection = false` | **PASS** |
| no Product title / slug / id leak | `anyRelatedHeading = false`, product-link count = 0, `anyUuid = false` | **PASS** |
| the entry is **not** hidden by the bad link | entry renders normally and stays in the feed | **PASS** |

### Indistinguishability, measured directly

The property that matters is not "the section is missing" but "a visitor cannot
tell *linked-but-hidden* from *never linked*". Both pages were captured after
settling and compared:

```text
non-public link  sections: [breadcrumb, hero, media, narrative, continue, commission]
null link        sections: [breadcrumb, hero, media, narrative, continue, commission]

sectionsIdentical    = true
bothHideRelated      = true
neitherLinksAProduct = true
```

> **A measurement note, recorded rather than smoothed over.** The first
> comparison pass reported `indistinguishable: false`. That was an artefact of
> the harness, not a defect: the earlier snapshot was taken while the route's
> streamed `loading.tsx` placeholder (`gallery-detail__stage--empty`) was still
> in the DOM, so one page had a seventh leading element the other did not. The
> comparison was re-run waiting for that placeholder to disappear on both pages,
> and the two are identical. The false negative is reported here because a run
> that only kept the second number would be hiding how the first was obtained.

---

## J. Zero-deliverable-media published state

```text
ZERO_MEDIA_PUBLISHED_LIVE = NOT_EXERCISABLE_THROUGH_DELIVERED_FLOW
```

Not manufactured. No direct database or object-storage mutation was used to
produce it, and none was attempted.

Evidence chain, each link verified in this run:

1. **Publish requires at least one eligible asset.**
   `apps/api/src/modules/gallery/domain/admin-gallery-entry.readiness.ts`:
   ```ts
   GALLERY_ENTRY_ELIGIBLE_ASSET_REQUIRED: facts.eligibleAssetCount > 0
   ```
   so `APP11-B02` cannot transition an entry to `PUBLISHED` with zero images.

2. **The public detail maps zero-current-deliverable-media to the safe 404.**
   `apps/api/src/modules/gallery/application/public-gallery-entry.query.ts`:
   ```ts
   if (found === undefined || found.assets.length === 0) {
     throw publicGalleryEntryNotFound();
   }
   ```

3. **There is no delivered gallery-asset withdrawal or deletion operation.** The
   entire delivered gallery surface is nine operations —
   `adminGalleryAsset_create`, `adminGalleryAsset_preview`,
   `adminGalleryEntry_list` / `_create` / `_detail` / `_update` /
   `_replaceAssets` / `_publish` / `_unpublish` — and none of them removes an
   image's bytes. `FU-APP11-B03A-01` remains open for exactly this.

   The only way to empty a published entry would be `_replaceAssets` with `[]`,
   which cannot leave it publishable under (1); reaching past the API into the
   database or MinIO is what §12 forbids.

4. **No new backend operation was added** to make it reachable.

5. **The frontend mapping is proved where it can be.** The focused suite asserts
   that all four refusal causes — unknown slug, `DRAFT`, `ARCHIVED`, and
   published-with-no-deliverable-image — collapse to one indistinguishable
   surface, and §K below re-confirms that surface live on two of them.

---

## K. ARCHIVED reachability

```text
ARCHIVED_LIVE = NOT_EXERCISABLE_THROUGH_DELIVERED_FLOW
```

Not manufactured; no direct mutation.

- The delivered lifecycle is **publish / unpublish only**. `_publish` moves
  `DRAFT → PUBLISHED` and `_unpublish` returns `PUBLISHED → DRAFT`; the policy
  file states in as many words that "Unpublish is **not** archive". There is no
  `adminGalleryEntry_archive` and no `_restore` in the contract.
- `ARCHIVED` exists in the schema vocabulary and in the Admin **list filter**
  (`GALLERY_ENTRY_STATUS_FILTERS`), which is why it can be filtered for — but
  nothing delivered transitions *into* it.
- Live database, read-only: `DRAFT = 2`, `PUBLISHED = 14`, **`ARCHIVED = 0`**.

The backend lifecycle authority plus the focused public-404 mapping test is the
accepted evidence, per §13.

---

## L. Known not-found transport issue — reconfirmed, not surgically addressed

Per §14, no framework-wide change was attempted.

| Path | HTTP | `<title>` | robots | canonical | entry title leaked |
|---|---|---|---|---|---|
| `/bo-suu-tap/khong-ton-tai-gi-ca` (unknown) | 200 | generic shell title | `noindex` | absent | 0 |
| `/bo-suu-tap/ky-niem-duoc-giu-lai` (DRAFT) | 200 | generic shell title | `noindex` | absent | 0 |

Safe surface, `noindex`, canonical absent, no data leakage — all reconfirmed.

```text
FU-APP2-DETAIL-NOT-FOUND-STATUS-01 = still open
```

---

## M. Responsive smoke on the multi-image detail (§16)

| Check | 1440 | 390 |
|---|---|---|
| exactly one `<h1>` | 1 | 1 |
| all three thumbnails loaded | `[700, 700, 700]` | `[700, 700, 700]` |
| stage loaded | 700 | 700 |
| horizontal overflow | **none** (`scrollW 1425 = clientW 1425`) | **none** (`scrollW 375 = clientW 375`) |
| visible controls under 44px | **0** | **0** |
| lightbox reachable | yes, 3 controls, min dimension **44px** | yes, 3 controls, min dimension **44px** |
| overflow while the lightbox is open | none | none |
| Escape closes | yes | yes |

### Console

Across the whole run, on clean (non-intercepted) loads:

```text
http://admin.embroidery.local/favicon.ico   404   pre-existing, not S03
http://embroidery.local/favicon.ico         404   pre-existing, not S03
…/assets/01a05667-1567-…/catalog-preview    ERR_FAILED ×2
                                            ← the request C1 deliberately aborted in §F
S03-caused console errors on clean runs:    0
```

---

## N. Focused validation

```text
pnpm --filter @embroidery/storefront typecheck                      PASS
storefront jest — 9 suites / 177 tests                              PASS
  test/boundary/gallery-detail-source.test.ts
  test/boundary/gallery-feed-source.test.ts
  test/components/gallery-detail-media.test.tsx
  test/components/gallery-detail-lightbox.test.tsx
  test/components/gallery-card-link.test.tsx      ← S02 feed-card action test
  test/components/gallery-feed.test.tsx           ← S02 feed test
  test/smoke/gallery-detail-page.test.tsx
  test/smoke/gallery-detail-dedupe.test.tsx
  test/unit/gallery-detail-model.test.ts
pnpm --filter @embroidery/api openapi:check                         PASS (artifact up to date)
pnpm --filter @embroidery/api-client check:generated                PASS (tree hash unchanged)
node tools/check-app-scss.mjs storefront                            PASS
node tools/check-scss-file-size.mjs <S03 + feed styles>             PASS (10 stylesheets, 0 above review threshold)
targeted live browser acceptance 1440 / 390                         PASS (see §D–§M)
git status / diff                                                   clean of unintended changes
```

Storefront **build** not re-run: no production TS/TSX/SCSS changed, which is the
condition §17 sets for skipping it.

Not run, and why: full monorepo, full Storefront suite, full Admin suite, API
suite, worker suite, DB regression, full Playwright, `APP11-E01` and historical
phase suites — all outside C1's change impact and explicitly excluded by §17.

The S02 feed was re-checked after the fixture edits: 14 published entries,
`bien-thang-tu-xom5` now reporting `assetCount = 3`, feed rendering unaffected.

---

## O. Frozen artifacts

```text
OpenAPI            = 116 / 128 / 252     (verified at exit)
migrations         = 37
Admin routes       = 25
Storefront routes  = 14

apps/api                          unchanged
apps/worker                       unchanged
apps/admin runtime                unchanged
packages/database                 unchanged
packages/contracts/openapi        unchanged, artifact up to date
packages/api-client/src/generated unchanged, tree hash identical
Figma file / FIGMA_DESIGN_INDEX   untouched
```

No backend operation added. No `APP11-S04` work started: `sitemap.ts`,
`robots.ts`, `metadataBase`, global Open Graph defaults and BreadcrumbList JSON-LD
all remain absent.

---

## P. Git-authoritative files changed by C1

**Added**

```text
docs/implementation/reports/APP11-S03-C1-COMPLETION-REPORT.md
```

**Modified**

```text
docs/implementation/phases/APP11-GALLERY-CONTENT-AND-SEO.md   one roadmap row
docs/implementation/reports/APP11-S03-COMPLETION-REPORT.md    superseding pointer only
```

The pointer added to the S03 report is a five-line note at the top saying that
its §N "fixture-dependent" subsection is superseded by this document. Its
findings, evidence and follow-ups are otherwise untouched — a report that still
claimed eight checks were unexercised, after they had been run and passed, would
mislead the next reader.

No source file was added, modified or deleted by this correction. The 26 S03
paths in `git status` are S03's own and are unchanged by C1.

The fixture script lives in the session scratchpad and is deliberately not part
of this change. Nothing was committed and nothing was pushed.

### Dev-data side effects

C1 changed dev-database **content** through delivered Admin operations, which is
expected for a live-acceptance fixture run and is not a repository change:

```text
bien-thang-tu-xom5       1 → 3 gallery assets
dong-song-cu-xom5        linkedProductId → ao-thun-cotton (published)
vuon-hong-sau-nha-xom5   linkedProductId → an existing DRAFT product
```

All three remain `PUBLISHED`. No entry was created or deleted, no asset was
prepared or removed, and no product changed state.

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
APP11-S03-C1   COMPLETE
APP11-S04      NEXT
APP11-S05      NOT STARTED
APP11-E01      NOT STARTED
APP11-X01      NOT STARTED
```

Exactly one `NEXT`. `APP11-S04` was not started.

---

## R. Follow-up status after C1

| ID | Status |
|---|---|
| `FU-APP11-S03-02` | **CLOSED.** All eight fixture-dependent live checks are now exercised and passing. |
| `FU-APP11-S03-03` | **Open, and now proven.** The zero-deliverable-media published state is unreachable through delivered flows; §J records the full evidence chain. |
| `FU-APP11-B03A-01` | **Open.** No gallery-asset withdrawal or deletion operation exists — the direct cause of `FU-APP11-S03-03`. |
| `FU-APP2-DETAIL-NOT-FOUND-STATUS-01` | **Open.** Reconfirmed on this route; surface safe, status line wrong. |
| `FU-APP11-S03-01` | **Open.** Live Figma node inspection still blocked by MCP availability, not by this correction. |
| `FU-APP11-S03-04` | **Open.** Open Graph remains deferred to `APP11-S04`. |
