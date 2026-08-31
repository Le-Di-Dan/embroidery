# APP11-S02 — Public Gallery Feed

**Checkpoint:** `APP11-S02`
**Phase:** APP11 — Gallery, Content, SEO and Store Presentation
**Mode:** STOREFRONT UI · NO BACKEND CHANGE · ROUTE DELTA +1
**Date:** 2026-08-31
**Entered because:** `APP11-S01` is COMPLETE — PO PASS, `CORRECTION_USED = 0/1`.

---

## A. Verdict

```text
APP11-S02            = COMPLETE
PO_DECISION_REQUIRED = NONE
NEXT_CHECKPOINT      = APP11-S03
```

`/bo-suu-tap` ships on the UI05 Collections Index authority at 3 / 2 / 1
columns, both staged navigation actions are activated, the entry detail route is
still absent and no card links to it, and the backend, Admin runtime, generated
client and Figma registry are byte-for-byte unchanged.

---

## B. Entry baseline / design authority

Baseline measured before any edit and re-measured after:

```text
Storefront routes  = 12  →  13     (route delta +1, /bo-suu-tap)
Admin routes       = 25  →  25     (untouched)
OpenAPI            = 116 paths / 128 operations / 252 schemas   (unchanged)
migrations         = 37                                          (unchanged)
Figma registry     = 532 rows, gate PASS                         (unchanged)
```

OpenAPI counted directly from `packages/contracts/openapi/openapi.generated.json`;
migrations counted from `packages/database/migrations/*.sql`; routes counted as
`page.tsx` segments under each app's `src/app`.

### Approved feed authority

Verified in `docs/design/FIGMA_DESIGN_INDEX.md` before implementation — all five
rows `APPROVED_FOR_IMPLEMENTATION` under `FIG-APPROVAL-APP11-D01-PO-001`, file
`BQwqV8GdfUIELvsQDB1UQE`, page `User Interface`:

| Registry ID | Node | Viewport / state |
|---|---|---|
| `FIG-APP11-GALLERY-FEED-DESKTOP` | `329:2` | Desktop 1440 |
| `FIG-APP11-GALLERY-FEED-TABLET` | `339:2` | Tablet 1024 |
| `FIG-APP11-GALLERY-FEED-MOBILE` | `343:2` | Mobile 390 |
| `FIG-APP11-GALLERY-FEED-INTERACTION-STATES` | `353:2` | Interaction states |
| `FIG-APP11-GALLERY-FEED-LOADING-EMPTY-ERROR` | `357:3` | Loading / Empty / Error |

```text
GALLERY_FEED_REDRAWN = false
```

The five rows point at **UI05's original nodes**, registered in place. No Figma
node and no registry row was created, cloned or modified; the gate still reports
532 rows and passes.

### Figma access — declared fallback

**The live Figma authority could not be opened in this session.** The
`figma-desktop` MCP server failed to connect (`ConnectionRefused`) and the only
Figma tools exposed were `authenticate` / `complete_authentication`. As in
`APP11-S01`, the implementation therefore used the **registry rows above plus the
accepted `APP11-D01` and `APP11-G01-C1` evidence**, which record for these exact
frames:

- density is UI05's own **3 desktop / 2 tablet / 1 mobile at 410 / 452 / 342px**,
  explicitly *not* converted to UI02's 5/3/2 @ 237 (`APP11-D01` §D, recorded on
  `874:1006` and `875:1006` in the file itself);
- the card is **cover + title + one short line + a text link** (`APP11-G01-C1`
  §rendered evidence for `329:2`);
- the accessibility board `358:51` states literally: *"One H1 per page: Index H1
  = 'Bộ sưu tập'"*, and *"DOM/source order; keyboard order follows source
  order"*;
- UI05's provisional `/collections` strings are superseded; `/bo-suu-tap` is the
  registry Route/Capability value;
- the index's own strings carry a `PROVISIONAL_COPY` marker — the H1 does not.

---

## C. Route / navigation activation

### The route

`apps/storefront/src/app/bo-suu-tap/page.tsx` — one new segment, rendered
`ƒ (Dynamic)` in the production build output.

```text
/bo-suu-tap            200
/bo-suu-tap/[slug]     not created — APP11-S03 owns it
/thu-vien              404
/gallery               404
/collections           404
```

All five measured live through the canonical gateway. No alias directory, no
redirect, and no rewrite was added.

### One canonical route authority

`STOREFRONT_GALLERY_ROUTE = '/bo-suu-tap'` lives in
`features/storefront-shell/model/storefront-navigation.ts`, beside every other
Storefront path, and is re-exported from the shell's public index. The Homepage
Collections action, the header IA item and the feed feature all read it from
there.

A boundary test enumerates every `.ts`/`.tsx` file under `apps/storefront/src`
that contains the literal `'/bo-suu-tap'` and asserts the list is **exactly**
`storefront-shell/model/storefront-navigation.ts`. The App Router directory name
is a directory, not a string, so it costs no second literal. `APP11-S03` extends
this family rather than adding one.

### Homepage Collections — staged action activated

`APP11-S01` shipped the section with heading and editorial framing and
deliberately **no constant** for the path, so that the link and the route would
have to land together. They did:

| | S01 | S02 |
|---|---|---|
| Section heading + intro | rendered | unchanged |
| Outbound action | none | `Xem bộ sưu tập` → `/bo-suu-tap` |
| Gallery API read | none | still none |
| Cards / slugs | none | still none |
| "coming soon" copy | none | still none |

Exactly one anchor in the section, and it targets the **feed** — never an entry.
The action reuses the Homepage's existing `homepage-action--link` treatment
rather than introducing a fifth action style. Layout and copy are otherwise
untouched; the live `h2` order is unchanged.

### Shell `Bộ sưu tập` — activated

`STOREFRONT_PRIMARY_NAV`'s `collections` item moved from `route: null` to
`STOREFRONT_GALLERY_ROUTE`. No nav item was added. `studio` and `journal` stay
unrouted and non-interactive — Studio has no landing page (APP3 built one per
Product) and the approved APP11 Homepage deleted Journal outright.

Live at 1440 and inside the 390 mobile drawer:

```text
Khám phá     → /kham-pha       aria-current: —
Bộ sưu tập   → /bo-suu-tap     aria-current: page
Đặt thêu     → /yeu-cau/moi    aria-current: —
Studio, Nhật ký                aria-disabled="true"
```

### Active state prepared for S03 — and one real defect fixed

`StorefrontNavLink` compared `pathname === route`. That is correct for every area
that is exactly one page and wrong for the first one that is not: when
`APP11-S03` adds `/bo-suu-tap/[slug]`, an exact match would silently un-mark the
section a visitor is standing in. The comparison is now
`isStorefrontNavRouteActive(pathname, route)` — exact match, or a descendant on a
**full segment boundary**, so `/bo-suu-tap-cu` does not match `/bo-suu-tap`; the
home route stays exact-only because every path descends from `/`.

Swapping the comparison surfaced a genuine latent bug the old code tolerated by
accident: `usePathname()` really can return `null`, which is exactly what a
rendered component test sees, and a prefix check on `null` throws. Next types it
as `string`; the matcher now accepts `string | null` and treats "no pathname" as
"no current area". This was found by the existing shell suites failing, and fixed
in the source rather than worked around in the tests.

---

## D. Curated client boundary

`packages/api-client/src/gallery.ts` gains **one** operation and three types:

```text
publicGalleryEntryList
  PublicGalleryEntryListParams
  PublicGalleryEntryListResponse
  PublicGalleryEntrySummaryResponse
```

### What stays withheld, and why each is not a schedule

| Operation | Reason |
|---|---|
| `publicGalleryEntryDetail` | `/bo-suu-tap/[slug]` does not exist. An operation on this boundary is an invitation to render a page for it; `APP11-S03` brings both. |
| `publicGalleryEntryAsset` | It streams bytes as a `Blob`. See below. |
| `publicSitemapEntry_*` | `APP11-S04` owns the technical SEO surface; nothing delivered reads it. |
| `adminGallery*` (for the Storefront) | Enforced per application by each app's own boundary suite, not by the package. |

### `publicGalleryEntryAsset` — the delivery route is consumed, the function is not

This is the one place the checkpoint's §7 and the delivered architecture do not
line up literally, so it is stated plainly rather than glossed.

`coverUrl` on the list response **is** the `publicGalleryEntryAsset` route, at
its `thumbnail` rendition, composed API-side by
`publicGalleryMediaPath({ slug, assetId, rendition: PUBLIC_GALLERY_LIST_RENDITION })`
— the same constant the route itself serves. The browser reaches that route by
rendering the path in an `<img src>`, verified live:

```text
/api/public/gallery-entries/ky-niem-duoc-giu-lai-xom5/assets/01a05667-…-964c09a423f7/thumbnail
```

The generated function returns a `Blob`. An `<img src>` cannot be a `Blob`, so
exporting it would publish a function no correct consumer could call, and the
`publicProductMediaGet` precedent in `catalog.ts` already records exactly this
reasoning: *"it serves image bytes, which the browser fetches by rendering the
relative `media[].url` the list and detail responses already return — application
code must never stream those bytes itself."*

So: **the operation is consumed as a route and withheld as a function**, and the
boundary suite asserts both halves — that no gallery media-byte operation is
exported, and that the feature source never contains `publicGalleryEntryAsset`,
never contains a `/api/public/gallery-entries` literal, and never names a
rendition. The path can only arrive from the server.

### The comment that had to be corrected

`gallery.ts` previously justified withholding the public reads with *"this
barrel serves the Admin app"*. That was true while every gallery consumer was an
Admin screen, but it is not a property of the barrel — one package root serves
both applications, and `publicProductList` has sat on it since `APP2-S01`. The
rule it was reaching for is real and unchanged: **an Admin screen must not read
the storefront's unauthenticated view of the same rows.** That is now asserted
where it is actually true — in `apps/admin/test/boundary/gallery-list-source.test.ts`
("consumes no public gallery or sitemap operation"), against the Admin feature's
own source.

### Two existing suites this legitimately invalidated

Both asserted the *package* does not export `publicGalleryEntryList`, which S02
makes false. Neither was weakened; both were re-pointed at the guarantee that is
still true:

- `packages/api-client/src/gallery.curated-boundary.test.ts` — the blanket
  `not.toMatch(/^publicGallery/)` split into: the list is published as a
  callable; detail and asset are absent, each for its own stated reason; the
  sitemap family is absent wholesale.
- `apps/admin/test/components/gallery-list-render.test.tsx` — the same move
  `APP11-A02` already made for the editor's operations: from "the package does
  not export them" to "this feature does not import them". `publicGalleryEntryDetail`,
  `publicGalleryEntryAsset`, `publicGalleryEntryMediaGet` and
  `publicSitemapEntryList` are still asserted absent from the package.

No generated file was edited. `openapi:check` and `check:generated` both pass.

---

## E. Feed query / data architecture

Follows `/kham-pha`'s delivered precedent exactly:

```text
route segment  → force-dynamic, request-scoped QueryClient
               → prefetchInfiniteQuery(first page) → dehydrate → HydrationBoundary
client island  → useInfiniteQuery, retry: false, cursor as pageParam
```

- **Server-rendered first page.** `curl` of `/bo-suu-tap` returns 12 rendered
  card titles in the HTML. The browser issues **no** client request for the first
  page — only continuation is hydrated behaviour.
- **Stable query key.** `['storefront', 'gallery', 'feed']`, constant. The feed
  takes no filter — `APP11-B03` publishes only `limit` and `cursor` — so unlike
  Discover, whose key carries its category because `APP2-B04` binds a cursor to
  its filter, there is only ever one cursor sequence and nothing to key on.
- **No fake filter state, no Zustand, no polling**, asserted statically.
- **Cursor never enters the URL.** `location.search` is empty after continuation,
  measured live.
- **Page size 12**, requested explicitly so the visitor's window is independent
  of a future server-side default. Twelve fills four rows of the desktop
  three-column masonry.
- **Dynamic-rendering correctness.** `force-dynamic` for the reason `/kham-pha`
  states: `APP11-B03` re-reads publication and image eligibility on every request
  precisely because nothing in this system invalidates a cache, so a stored page
  could keep showing an unpublished entry. No ISR, no revalidation worker, no
  invalidation service was introduced.

### Projection

`toGalleryFeedCard` narrows `PublicGalleryEntrySummaryResponse` to
`{ slug, title, description, coverUrl }`. Five fields are dropped **at the
boundary** rather than carried into the tree and left unrendered — a field a
component cannot see is a field it cannot leak:

| Dropped | Why |
|---|---|
| `galleryEntryId`, `coverAssetId` | opaque server identities; the card addresses nothing by id |
| `displayOrder` | position is expressed by *where the card is*, not by a printed number |
| `isIndexable` | an SEO directive, not a visibility flag; showing it leaks an operator's SEO decision |
| `assetCount` | a count of images the feed does not show; that is detail-page material (`APP11-S03`) |

`slug` is kept as the React key and the dedupe key; it is neither rendered nor
linked. `APP11-B03` deliberately omits the linked Product from the feed, so there
is **no** product lookup, no N+1, no price, no cart and no buy button — asserted
statically (`not.toMatch(/publicProduct|buildStorefrontProductDetailPath/)`).

---

## F. UI05 masonry implementation

One `<ul>`, one card tree, CSS multi-column (`columns` + `break-inside: avoid`).
The browser distributes the single list across columns at paint time, so **source
order stays linear** while the layout reads as masonry. No per-column JS arrays,
no height-balancing, no CSS `order`, no measured-height sorting — each of those
would make the reading order a function of pixels rather than of the curation.

Measured live through the canonical gateway:

| | 1440 | 1024 | 390 |
|---|---|---|---|
| Verdict | **PASS** | **PASS** | **PASS** |
| Columns | **3** | **2** | **1** |
| Card width | 368px | 469px | 343px |
| UI05 reference | ~410 | ~452 | ~342 |
| Distinct card heights | 6 | 6 | 6 |
| Height range | 293–498px | 356–598px | 277–495px |
| `<h1>` count | 1 | 1 | 1 |
| `<h1>` size | 40px | 32px | 32px |
| Horizontal overflow | none | none | none |
| Elements overflowing `main` | 0 | 0 | 0 |
| Control height | 44px | 44px | 44px |
| DOM order = server order | yes | yes | yes |

Card widths are proportionally narrower than the raw frame numbers at 1440
because the approved shell owns the page container (max 1200px with its own
padding) — the same relationship `APP2-S01` recorded for UI02. What UI05 locks is
the column **count**, the variable heights and the editorial rhythm; all three
hold. At 390 the measured 343px matches UI05's ~342 directly.

Density is **UI05's 3/2/1**, never UI02's 5/3/2 — asserted in the boundary suite
against `_gallery-tokens.scss`. Breakpoints (640 / 1025) are identical to those
`product-discovery` and the Homepage already use, so three adjacent public
surfaces cannot reflow at different widths.

### Variable height

`.gallery-feed__card-image { height: auto }` — natural ratio. `APP11-B03`
publishes no derivative dimensions, so a fixed `aspect-ratio` would mean
inventing one and cropping every cover into an equal box, which is precisely the
uniform ecommerce grid UI05 forbids. Only the *placeholder* carries a ratio, and
it depicts no artwork so it asserts nothing. Six distinct card heights at every
viewport, with content-driven variation (three description lengths in the
fixtures).

### Scope note — the three lower editorial bands

UI05's index also draws a featured editorial band, a discovery continuation row
and a soft commission band below the masonry. They are **not** shipped. Their
strings are marked `PROVISIONAL_COPY` in the file, they carry no data source in
`APP11-B03`, and none of them appears in this checkpoint's scope, acceptance
criteria or responsive requirements — which name the feed, its continuation, its
states and the Footer handoff. Shipping them would have meant writing
store-presentation copy that `APP11-S05` owns. The feed's own composition —
intro, H1, masonry, continuation, footer — is complete.

---

## G. Media, fallback, accessibility

**Cover source.** `coverUrl` exactly as returned; never rewritten, never composed
locally, never persisted beyond the query result. Relative and same-origin. No
bucket, object key, signature, expiry, checksum or provider URL reaches the page
— verified by grepping the served HTML (`bucket|minio|checksum|X-Amz|signature`
→ none).

**A failure is local to its card.** `APP11-B03` guarantees a cover exists (an
entry with no deliverable image is omitted from the feed entirely). What it
cannot guarantee is that the bytes still resolve *after* render — an operator can
unpublish or withdraw mid-session and the delivery route re-checks on every
request. `GalleryCover` holds per-image React state and swaps to a neutral
`role="img"` placeholder on `onError`. There is deliberately no retry: a 404 is
the correct answer and retrying would hammer it.

Proven live by pointing one cover at a correctly-shaped delivery URL whose asset
does not resolve:

```text
cards before / after      14 / 14        (no card removed)
placeholder               present, on "Áo cưới thêu tay" only
placeholder accessible name  "Chưa hiển thị được ảnh của mục này."
other covers still loaded 13 / 13
feed-wide alert           none
```

**Alt text.**

```text
ALT_TEXT_MODEL = DERIVED_NOT_PERSISTED
```

`galleryCoverAlt(title)` returns the entry title and nothing else. No alt column
exists to read, none is authored, and nothing is invented — a future contributor
cannot "improve" the alt by describing an image nobody in this system has seen.
Live: `alt="Kỷ niệm được giữ lại"`.

**Accessibility.**

- exactly one `<h1>` = `Bộ sưu tập`, rendered by a **Server Component** above the
  island, so the page has its heading in every branch — loading, empty, error;
- one semantic collection: `<ul aria-label="Các mục bộ sưu tập">`, card titles at
  `<h2>`;
- linear DOM/source order = `display_order ASC, id ASC`, measured at all three
  viewports;
- the continuation control is a real `<button>`, keyboard reachable, 44px;
- loading `role="status" aria-live="polite"`; skeleton tiles `aria-hidden`;
- initial failure `role="alert"`; continuation failure its own `role="alert"`;
- one polite announcement per append (see §H);
- **no clickable div, no `tabindex`, no `role="link"`** anywhere in the feed —
  0 anchors inside the masonry at all three viewports.

---

## H. Continuation

Driven by the real `hasNext` / `nextCursor`, gated on **both** — `hasNext` alone
would let a malformed page drive an endless cursorless request, and a non-null
cursor alone would request past the last page.

Approved copy, exactly:

```text
Tải thêm mục
Đang tải thêm…
Không thể tải thêm mục.
Thử lại
```

| Rule | How it holds |
|---|---|
| control only when `hasNext` and cursor usable | `GalleryContinuation` returns `null` when `!hasMore` |
| appends | live 12 → 14, order preserved |
| preserves existing cards | live; also asserted on the failure path |
| preserves scroll position | nothing above the appended cards re-renders |
| no forced focus move | **the control stays mounted while loading** — swapping it for a status line would unmount the element just activated and drop focus to `<body>`; the pending line appears beside it |
| dedupe, first occurrence wins | `flattenGalleryPages` by `slug`; covered by a test where an entry resurfaces under a later cursor |
| no re-sort | pages appended in arrival order; a reverse-alphabetical fixture proves no local sort |
| loading does not replace the collection | separate branch from `isInitialLoading` |
| failure stays below accumulated cards | continuation block sits after the masonry |
| retry uses the same cursor | TanStack replays the failed `pageParam`; asserted with `toHaveBeenLastCalledWith({ cursor: 'cursor-2' })` after the retry |
| one polite append announcement | a single `role="status"` region carrying the pending string, empty otherwise |
| no control at end | live: after loading page 2 the whole continuation block is absent |

**Forbidden and absent:** infinite scroll, viewport auto-load, offset, page
number, total count, silent truncation. There is no sentinel and no
`IntersectionObserver` anywhere in the feature — asserted statically, and proven
behaviourally by a test that dispatches `scroll` and shows the request count
stays at 1. Live, `location.search` is empty after continuation.

**On the completion announcement.** The live region announces the append starting,
not a completed count. No approved copy exists for a completion string, and a
count is forbidden — a keyset feed does not know how many entries there are, so
saying a number would be inventing one.

---

## I. Loading / empty / error

Per UI05 `357:3`:

| State | Delivered |
|---|---|
| Initial loading | gallery-shaped masonry skeleton reusing the real masonry classes, six tiles at three different media heights (a column of identical blocks would promise a uniform grid the feed does not deliver); tiles `aria-hidden`; `Đang tải bộ sưu tập…` in a `role="status"` region |
| Empty | `Chưa có mục bộ sưu tập.` — one sentence, no alert role, no operator/create/checkpoint copy |
| Initial error | `Không thể tải bộ sưu tập` + `Thử lại` in a `role="alert"`; retry refetches the first page |
| Continuation error | separate, below the cards, own `role="alert"`, own retry |

Verified live: with the gallery genuinely empty (before seeding), `/bo-suu-tap`
rendered `Chưa có mục bộ sưu tập.` with no alert, one `<h1>`, footer present, no
overflow.

**Safe copy.** A focused test rejects a 503 whose payload carries
`upstream gallery pool exhausted` and asserts the rendered alert matches none of
`/503|upstream|cursor|request/i`. No server message, status code, request id or
cursor reaches a visitor.

---

## J. `APP11-S03` staged boundary

The approved card ends in a text link into the entry's own page, and `353:2`
draws hover and pressed treatments for it. That page does not exist, so the card
ships as a non-interactive `<article>`:

```text
anchors inside the feed        0   (live, all three viewports)
[tabindex] inside the feed     0
[role="link"] inside the feed  0
hover / pointer / focus ring   none — the CSS records why
anchors matching /bo-suu-tap/  0   (feed page and Homepage)
/bo-suu-tap/<slug>             404
```

This is the treatment `APP2-S01`'s product card carried under IMP-D038 until
Product Detail landed, and `APP2-S02` then turned into a link. `APP11-S03` does
the same here: it adds the route and activates navigation in one change. No
"S03 pending" text, no disabled-looking control and no fake clickable div — each
would either lie about what will happen or break.

The boundary suite is written so S03 extends it cleanly: it adds
`/bo-suu-tap/[slug]` to `ROUTES_AT_S02` and flips the two staging assertions;
nothing has to be torn out.

---

## K. Metadata boundary

The segment sets `title` and `description` only, both derived from
`GALLERY_COPY`. Asserted absent: `metadataBase`, `canonical`, `alternates`,
`robots`, `openGraph`, `application/ld+json`; `sitemap.ts` and `robots.ts` do not
exist. `APP11-S03` owns per-entry SEO; `APP11-S04` owns the technical SEO
infrastructure. A canonical invented here would lock an absolute origin neither
has settled.

---

## L. Live browser evidence

Through the canonical gateway (`http://embroidery.local`), Chromium at 1440 /
1024 / 390.

### Fixtures — delivered flows, no direct DB insert

14 gallery entries were created end to end through the **delivered Admin
operations**: `adminGalleryAsset_create` (B03A preparation from an accepted
catalog source, with the source's own `updatedAt` read back through
`adminAsset_detail`), `adminGalleryEntry_create`, `adminGalleryEntry_replaceAssets`,
`adminGalleryEntry_publish`. Nothing was inserted into `gallery_entries`,
`gallery_entry_assets` or `assets` directly; SQL was used only for read-only
lookups and counts.

Resulting state: `PUBLISHED = 14`, `DRAFT = 2`, one published entry with
`isIndexable = false`.

**Credential handling.** The staff-bootstrap CLI refuses a second synthetic
identity (`result=FAILED_EXISTING_ADMIN_MISMATCH`), and `--rotate` is forbidden
by CLAUDE.md §9. The operator was asked and supplied the credential for this run;
it reached the fixture process through the environment only, was never read from
`.env`, never written to a repository file, never echoed and never passed as a
command-line argument. The fixture script lives in the session scratchpad and is
not part of this change.

### Results

| # | Check | Result |
|---|---|---|
| 1 | `/bo-suu-tap` = 200 | **PASS** |
| 2 | shell `Bộ sưu tập` opens it | **PASS** (header 1440/1024; drawer 390) |
| 3 | Homepage Collections opens it | **PASS** (click-through verified) |
| 4 | exactly one `<h1>` | **PASS** (all three viewports) |
| 5 | only published entries render | **PASS** — 14 published rendered |
| 6 | published `isIndexable=false` still renders | **PASS** — "Khung cửa gỗ" present |
| 7 | DRAFT / ARCHIVED absent | **PASS** — 2 DRAFT rows, 0 leaked |
| 8 | cover uses the B03 media route | **PASS** — all 14 loaded (`naturalWidth > 0`) |
| 9 | one failed image degrades locally | **PASS** — see §G |
| 10 | 1440 = 3 columns | **PASS** (lefts 321 / 713 / 1105) |
| 11 | 1024 = 2 columns | **PASS** (lefts 24 / 517) |
| 12 | 390 = 1 column | **PASS** |
| 13 | variable-height composition | **PASS** — 6 distinct heights per viewport |
| 14 | DOM order matches backend | **PASS** — all 14 in `display_order` |
| 15 | load-more appends | **PASS** — 12 → 14, control then absent |
| 16 | cursor never enters the URL | **PASS** — `location.search` empty |
| 17 | continuation failure / retry | focused-test proof (§H); not forced live |
| 18 | cards do not link to a missing route | **PASS** — 0 anchors in the feed |
| 19 | no alias navigation | **PASS** — all three alias paths 404 |
| 20 | floating contact dock unchanged | **PASS** — see below |
| 21 | no horizontal overflow | **PASS** — 0 elements overflow `main` |
| 22 | no S02-caused console errors | **PASS** — see below |
| 23 | no invented API/path failures | **PASS** |

**Console.** Two errors across the whole session: the pre-existing
`favicon.ico` 404 (present on every Storefront route, not S02's), and the 400
from the deliberate withdrawn-cover simulation in check 9. No other error.

**Floating contact dock.** The dock renders nothing, and that is the
**preserved pre-existing** behaviour `APP11-S01` already recorded, not a
regression: `NEXT_PUBLIC_ZALO_CONTACT_URL` and `NEXT_PUBLIC_MESSENGER_CONTACT_URL`
are both empty in the dev compose. The dock was neither moved, restyled nor
re-placed, and the feed's continuation control is centred with the footer
following it, so nothing sits under the bottom-right dock position.

**Not run:** full Playwright, per §26.

### One observed fact, stated rather than glossed

The dehydrated TanStack Query cache in the server-rendered HTML contains the
**full public list response**, including the five fields the card projection
drops (`galleryEntryId`, `displayOrder`, `isIndexable`, `coverAssetId`,
`assetCount`). Verified: they appear **only** in that payload and never in
rendered card markup.

This is inherent to the prefetch-and-hydrate architecture §13 prescribes and is
identical to `/kham-pha`'s existing behaviour. It leaks nothing: every one of
those fields is already public through the anonymous
`GET /api/public/gallery-entries` the same visitor can call directly, and no
storage, credential or private fact is present (`bucket|minio|checksum|X-Amz|signature`
→ none). Recorded here so the Product Owner is not told the payload is
field-perfect when it is not.

---

## M. Frozen artifacts

```text
OpenAPI            = 116 / 128 / 252     unchanged
migrations         = 37                  unchanged
Admin routes       = 25                  unchanged
Storefront routes  = 12 → 13             (the one route this checkpoint owns)
```

Drift checks:

```text
pnpm --filter @embroidery/api openapi:check
→ OpenAPI artifact is up to date

pnpm --filter @embroidery/api-client check:generated
→ generated client is up to date (tree hash a19cb87a…88a70)   — same hash as APP11-S01

node tools/check-figma-design-index.mjs
→ PASS (532 registry IDs, 532 node rows, 23 registry tables)
```

`git status` confirms not one file under `apps/api`, `apps/worker`,
`packages/database`, `packages/contracts`, `packages/api-client/src/generated`,
`docs/design` or `apps/admin/src` was touched. **One Admin file changed and it is
a test** — `apps/admin/test/components/gallery-list-render.test.tsx`, which
asserted against the package surface S02 legitimately changed (§D). No Admin
runtime file was modified. No new dependency was added.

---

## N. File-size + SCSS gates

```text
runtime source  ≤ 400   largest S02 file: use-gallery-feed.ts       117
SCSS            ≤ 400   largest S02 stylesheet: _gallery-masonry     138
tests           ≤ 600   largest S02 test: gallery-feed.test.tsx      342
```

```text
node tools/check-file-size.mjs apps/storefront/src/features/gallery-feed apps/storefront/src/app/bo-suu-tap
→ File-size check passed (0 file(s) above the review threshold).

node tools/check-scss-file-size.mjs apps/storefront/src/features/gallery-feed/styles apps/storefront/src/styles/main.scss
→ SCSS file-size check passed (5 stylesheet(s), 0 above the review threshold).

node tools/check-app-scss.mjs storefront
→ SCSS compile PASS  apps/storefront/src/styles/main.scss (123698 bytes CSS, 1 deprecation warning(s), not written to disk).
```

The single deprecation warning is the pre-existing `slash-div` in
`secure-design-review.scss` (APP6), unchanged and counted rather than fatal — the
gate's delivered policy. Styles are split into three semantic partials plus an
entry from the start, not as a later rescue. No SCSS tooling was modified and no
historical debt was cleaned.

**These claims are scoped to the files this checkpoint owns.** No
repository-wide compliance is claimed; `tools/check-file-size.mjs` still reports
the same 79 pre-existing violations it did before.

---

## O. Validation

```text
CHANGE_IMPACT
  Storefront: one new route + one new feature; shell nav model, nav link,
              shell barrel; Homepage Collections + copy + routes model;
              main.scss composition.
  api-client: one operation and three types added to the gallery barrel.
  Admin:      one TEST file re-pointed (no runtime change).
  Docs:       APP11 phase roadmap; this report.
```

```text
TESTS_RUN
  pnpm --filter @embroidery/storefront typecheck                       PASS
  pnpm --filter @embroidery/api-client typecheck                       PASS
  pnpm --filter @embroidery/admin typecheck                            PASS
  pnpm --filter @embroidery/storefront build                           PASS (13 routes; /bo-suu-tap = ƒ)
  eslint (11 changed storefront paths, scoped)                         PASS (0 findings)
  storefront jest — 10 directly affected suites                        132 passed / 132
    gallery-feed-source.test.ts            31
    gallery-feed.test.tsx                  17
    homepage-source.test.ts                21
    homepage.test.tsx · home-page.test.tsx
    storefront-shell-render / -drawer / -footer / -source
    storefront-contact-handoff.test.tsx
  pnpm --filter @embroidery/api-client test                            53 passed / 53
  admin jest — gallery-list-render, gallery-list-source,
               gallery-editor-source                                   71 passed / 71
  pnpm --filter @embroidery/api openapi:check                          PASS
  pnpm --filter @embroidery/api-client check:generated                 PASS
  node tools/check-figma-design-index.mjs                              PASS (532)
  node tools/check-app-scss.mjs storefront                             PASS
  node tools/check-scss-file-size.mjs <S02 paths>                      PASS
  node tools/check-file-size.mjs <S02 paths>                           PASS
  pnpm exec prettier --write <15 changed paths>                        PASS
  live browser 1440 / 1024 / 390                                       PASS
  git status / git diff --stat                                         recorded in §P
```

```text
TESTS_NOT_RUN
  full monorepo · full Storefront suite · full Admin suite
  API suite · worker suite · DB regression · full Playwright
  APP11-E01 · historical suites

WHY_NOT_RUN
  VALIDATION_GOVERNANCE §3: validations are selected by change impact, never as a
  repository-wide aggregate (CLAUDE.md §9). No backend, worker, database or
  contract file changed, so the API, worker and DB suites have nothing in this
  change to exercise. The Admin change is one test file, so its three gallery
  suites were run rather than the whole Admin suite. APP11-E01 is a separate
  checkpoint and is NOT STARTED.
```

---

## P. Git-authoritative files changed

**Modified (16):**

```text
apps/admin/test/components/gallery-list-render.test.tsx        (test only)
apps/storefront/src/features/homepage/components/homepage-collections.tsx
apps/storefront/src/features/homepage/model/homepage-copy.ts
apps/storefront/src/features/homepage/model/homepage-routes.ts
apps/storefront/src/features/storefront-shell/components/storefront-nav-link.tsx
apps/storefront/src/features/storefront-shell/components/storefront-primary-nav.tsx
apps/storefront/src/features/storefront-shell/index.ts
apps/storefront/src/features/storefront-shell/model/storefront-navigation.ts
apps/storefront/src/styles/main.scss
apps/storefront/test/boundary/homepage-source.test.ts
apps/storefront/test/components/homepage.test.tsx
apps/storefront/test/components/storefront-shell-drawer.test.tsx
apps/storefront/test/components/storefront-shell-render.test.tsx
docs/implementation/phases/APP11-GALLERY-CONTENT-AND-SEO.md
packages/api-client/src/gallery.curated-boundary.test.ts
packages/api-client/src/gallery.ts
```

**Added (26):**

```text
apps/storefront/src/app/bo-suu-tap/page.tsx
apps/storefront/src/features/gallery-feed/index.ts
apps/storefront/src/features/gallery-feed/components/gallery-card.tsx
apps/storefront/src/features/gallery-feed/components/gallery-continuation.tsx
apps/storefront/src/features/gallery-feed/components/gallery-cover.tsx
apps/storefront/src/features/gallery-feed/components/gallery-empty.tsx
apps/storefront/src/features/gallery-feed/components/gallery-feed-screen.tsx
apps/storefront/src/features/gallery-feed/components/gallery-initial-error.tsx
apps/storefront/src/features/gallery-feed/components/gallery-initial-loading.tsx
apps/storefront/src/features/gallery-feed/components/gallery-intro.tsx
apps/storefront/src/features/gallery-feed/components/gallery-masonry.tsx
apps/storefront/src/features/gallery-feed/components/gallery-query-provider.tsx
apps/storefront/src/features/gallery-feed/hooks/use-gallery-feed.ts
apps/storefront/src/features/gallery-feed/model/gallery-copy.ts
apps/storefront/src/features/gallery-feed/model/gallery-feed.ts
apps/storefront/src/features/gallery-feed/model/gallery-query-keys.ts
apps/storefront/src/features/gallery-feed/model/gallery-route.ts
apps/storefront/src/features/gallery-feed/services/gallery-feed.client.ts
apps/storefront/src/features/gallery-feed/services/gallery-feed.server.ts
apps/storefront/src/features/gallery-feed/styles/gallery-feed.scss
apps/storefront/src/features/gallery-feed/styles/_gallery-layout.scss
apps/storefront/src/features/gallery-feed/styles/_gallery-masonry.scss
apps/storefront/src/features/gallery-feed/styles/_gallery-tokens.scss
apps/storefront/test/boundary/gallery-feed-source.test.ts
apps/storefront/test/components/gallery-feed.test.tsx
apps/storefront/test/support/gallery-fixture.ts
docs/implementation/reports/APP11-S02-COMPLETION-REPORT.md
```

`SCOPED_COMMAND_INDEX.md` was **not** changed: S02 added no new focused command;
every gate it ran is already indexed.

Nothing was pushed.

---

## Q. Follow-ups

| ID | Item |
|---|---|
| `FU-APP11-S02-01` | UI05's three lower editorial bands (featured band, discovery continuation row, soft commission band) are registered but unbuilt — their copy is `PROVISIONAL_COPY` and carries no data source. `APP11-S05` owns store-presentation copy; the Product Owner should confirm whether they belong to S05 or to a later feed revision (§F). |
| `FU-APP11-S02-02` | The dehydrated query cache carries the full public list response, including five fields the card projection drops. Harmless today — all of it is already anonymously public — but if a future gallery field is ever non-public, the prefetch would need a server-side narrowing before dehydration (§L). |
| `FU-APP11-S02-03` | Two DRAFT gallery entries from earlier acceptance runs cannot be removed: no delete or archive operation exists on the gallery surface (`FU-APP11-B03A-01`). They are invisible publicly, but dev data will accumulate with each acceptance run. |
| `FU-APP11-S02-04` | The `favicon.ico` 404 is present on every Storefront route and pre-dates this checkpoint. Not S02's to fix; worth an owner. |

`FU-APP11-B03A-01` (no gallery-asset deletion operation) stays open, unchanged.

---

## R. Roadmap

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
APP11-S03      NEXT
APP11-S04      NOT STARTED
APP11-S05      NOT STARTED
APP11-E01      NOT STARTED
APP11-X01      NOT STARTED
```

Exactly one NEXT. `APP11-S03` was not started.
