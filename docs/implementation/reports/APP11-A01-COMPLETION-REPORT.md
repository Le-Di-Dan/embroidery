# APP11-A01 — Admin Gallery List — Completion Report

Checkpoint: `APP11-A01` · Phase: `APP11 — Gallery, Content, SEO and Store Presentation`
Date: 2026-08-30 · Branch: `production` (no push)

---

## A. Verdict

```text
APP11-A01 = COMPLETE
PO_DECISION_REQUIRED = NONE
NEXT_CHECKPOINT = APP11-A02
```

Two findings outside A01's own scope were encountered and are recorded in §P.
Neither blocks A01; one required a one-line repair to make the Admin build
runnable at all, and is disclosed there in full.

---

## B. Entry baseline / authority

Frozen artifacts, re-measured at completion:

```text
OpenAPI paths      = 116   (unchanged)
OpenAPI operations = 128   (unchanged)
OpenAPI schemas    = 252   (unchanged)
migrations         = 37    (unchanged)

Admin routes       = 23 -> 24
Storefront routes  = 12    (unchanged)
```

Design authority — `FIG-APPROVAL-APP11-D01-PO-001`, all three rows confirmed
`APPROVED_FOR_IMPLEMENTATION` in `docs/design/FIGMA_DESIGN_INDEX.md`:

| Registry id | Node | State |
|---|---|---|
| `FIG-APP11-ADMIN-GALLERY-LIST-DESKTOP` | `866:905` | `APPROVED_FOR_IMPLEMENTATION` |
| `FIG-APP11-ADMIN-GALLERY-LIST-EMPTY` | `867:907` | `APPROVED_FOR_IMPLEMENTATION` |
| `FIG-APP11-ADMIN-GALLERY-LIST-MOBILE` | `867:946` | `APPROVED_FOR_IMPLEMENTATION` |

Section `857:7`; structural precedent APP2 Admin Catalog `439:100` / `440:102` /
`440:191`.

**Live Figma nodes were not opened this session.** The `figma-desktop` MCP server
failed to connect (`ConnectionRefused`). The implementation therefore worked from
the registry rows plus the `APP11-D01` completion report's frame specification
(§H of that report), which fixes the column set, the removal of the category
filter, the continuation control, the empty state, the mobile card list and the
`Bộ sưu tập` nav entry. Nothing in Figma was modified or read-modified; the
registry is untouched. One consequence is recorded as `FU-APP11-A01-01` in §P.

---

## C. Design implementation

| Approved frame | Runtime | Match |
|---|---|---|
| `866:905` desktop default | `/gallery` at 1440 — breadcrumb, H1, status filter, 4-column table, "Tải thêm mục" | Yes, minus the staged actions below |
| `867:907` desktop empty | Unfiltered empty panel | Yes, minus the staged create CTA |
| `867:946` mobile 390 | Card list, table removed | Yes |

Columns are the approved set and the model's real fields: **Mục** (cover + title
+ slug + image count) · **Thứ tự** (`display_order`) · **Sản phẩm liên kết**
(signal) · **Trạng thái**. No category column exists, matching `APP11-D01`'s
removal of the category filter — `gallery_entries` has no such column.

### Staged A02 action omission

```text
STAGED_ACTION_OWNERSHIP =
  create_action  -> APP11-A02
  row_navigation -> APP11-A02
```

`866:905` draws a "Tạo mục mới" action and makes each row a link to
`/gallery/{entryId}`. Both are omitted from A01 runtime because `APP11-A02`
builds the editor route behind them; shipping either would put a control on
screen that answers a click with a 404. The approved visual structure is
otherwise preserved. This is a staging decision, not a design rejection — A02
restores the full end-state.

The staging is recorded **here and in source comments only**. An earlier draft
put an on-screen notice naming `APP11-A02`; it was removed on Product Owner
instruction (see §P, `FU-APP11-A01-02`) together with all other engineering
commentary.

---

## D. Route / navigation

```text
/gallery = delivered   apps/admin/src/app/(protected)/gallery/page.tsx
Admin routes = 23 -> 24 (counted by `page.tsx` under apps/admin/src/app)
Storefront routes = 12 (unchanged)
```

- Inside the authenticated shell: the segment lives under `(protected)`, whose
  layout resolves the session. Verified live — an unauthenticated `GET /gallery`
  answered `307` to `/login`.
- No `/admin/gallery` alias, no `/collections`, no `/library`; asserted in
  `test/boundary/gallery-list-source.test.ts`.
- No `/gallery/[entryId]` and no `/gallery/new`; the segment has zero
  subdirectories, asserted structurally.
- Route file is thin — it composes `GalleryListScreen` and holds no query, state
  or operation.

Navigation: one entry added to `ADMIN_PRIMARY_NAV` —
`{ id: 'gallery', label: 'Bộ sưu tập', href: '/gallery' }` — placed beside the
catalog surfaces (after `Sản phẩm`). `APP11-D01` records that the sidenav gains
the entry but fixes no ordinal, so the grouping follows the existing order's own
logic; this is stated rather than presented as read off a frame.

Active state: the existing `resolveNavItemState` already returns `page` for
`/gallery` and `section` for `/gallery/{entryId}`, so `APP11-A02` keeps
`Bộ sưu tập` active without a second nav entry. No editor route was created to
test this. Verified live: the entry renders as the non-link active item on
`/gallery`.

---

## E. API-client boundary

New curated barrel `packages/api-client/src/gallery.ts`, re-exported from the
package root. Exactly what A01 consumes crosses:

```text
operations   adminGalleryEntryList
             adminGalleryAssetPreview
value enum   AdminGalleryEntryListStatus
types        AdminGalleryEntryListParams
             AdminGalleryEntryListResponse
             AdminGalleryEntrySummaryResponse
```

Deliberately withheld, each documented in the barrel:

```text
adminGalleryEntryCreate        adminGalleryEntryReplaceAssets
adminGalleryEntryDetail        adminGalleryEntryPublish
adminGalleryEntryUpdate        adminGalleryEntryUnpublish
adminGalleryAssetCreate
```

No public gallery or sitemap operation is exposed to the Admin consumer.
Generated files were not edited; no regeneration occurred.

```text
openapi check         = PASS (artifact up to date)
generated-client check = PASS (tree hash a19cb87a…988a70)
```

---

## F. Status filter

URL-owned, one parameter, reusing the APP2/APP3/APP5/APP7/APP8 convention.

| Control option | URL | Wire |
|---|---|---|
| Tất cả trạng thái | `/gallery` | `status` omitted |
| Bản nháp | `?status=DRAFT` | `status=DRAFT` |
| Đã xuất bản | `?status=PUBLISHED` | `status=PUBLISHED` |
| Đã lưu trữ | `?status=ARCHIVED` | `status=ARCHIVED` |

- "All" omits the parameter; **no `ALL` token is ever sent**. Asserted on the
  wire in test and observed live (`GET …/gallery-entries?limit=20`).
- Options are derived from `AdminGalleryEntryListStatus`, so the vocabulary
  cannot drift from the contract.
- Written with `router.replace(…, { scroll: false })`; never `push`.
- Not stored in Zustand and not duplicated in local state.
- **Unknown tokens are discarded**: normalization returns "no filter" and the
  value is neither sent nor rendered. A **repeated** parameter is also treated as
  no filter rather than silently taking the first — the contract accepts one
  status, so a URL naming two has named none this screen can honour.
- The cursor is **not** in the URL. Verified live: after "Tải thêm mục" the
  address stayed `/gallery`.
- Changing status addresses a different query key, so the continuation restarts
  from the first page. Verified live and in test.

---

## G. Query / hydration / continuation

`useInfiniteQuery` under `galleryListKeys.list({ status }, pageSize)`; the list
root `galleryListKeys.lists()` is exported for `APP11-A02` to invalidate.
`staleTime` 30s, `retry: false`, `refetchOnWindowFocus: false`, no polling. The
cursor is the page parameter and never part of a key.

The route does **not** server-prefetch, following the `APP3-A02` / `APP5-A01` /
`APP8-A02` precedent: the filter lives in the URL and the collection is a keyset
list, so a dehydrated first page would guess the filter and be superseded by the
client's own request.

Continuation: forward-only, explicit control, no infinite scroll, no viewport
trigger, no page number, no total. `getNextPageParam` requires **both** `hasNext`
and a non-empty cursor. Pages are appended and deduped by entry id (first
occurrence wins); nothing is re-sorted. A continuation failure stays below the
collection, keeps the loaded rows, and retries the same cursor.

---

## H. List projection

Rendered per row: cover thumbnail (or placeholder), title, slug (`/slug`), image
count, `displayOrder`, linked-product signal, status badge.

Never rendered: gallery entry UUID, linked product UUID, cover asset id, storage
key, bucket, checksum, timestamps, SEO fields, `isIndexable`. Asserted by test
against the full document text.

- **Linked product** is a boolean signal — `Đã liên kết` / `Chưa liên kết`. No
  UUID, and no per-row Catalog lookup: the boundary test asserts the feature
  names no product-read operation, so the N+1 the design package refused is
  structurally impossible here. A02 owns the real product label.
- **Display order** renders the number and nothing else — no edit control, drag
  handle, sort menu or bulk reorder. `FU-APP11-B01-03` is routed to A02, whose
  approved editor already owns the field.
- **Status** carries a symbol and a text label as well as a tone, so it is never
  colour-only.

---

## I. Empty / loading / error

Mutually exclusive, derived from the query and never from a local flag.

| State | Copy | Notes |
|---|---|---|
| Loading | `Đang tải danh sách bộ sưu tập…` | Skeleton in the list's geometry; `role="status"`; the empty state can never flash first |
| Unfiltered empty | `Chưa có mục bộ sưu tập` / `Các mục sẽ xuất hiện tại đây sau khi được tạo.` | **No create CTA** — A02 owns creation, so none is offered or implied |
| Filtered empty | `Không có mục phù hợp với trạng thái đã chọn` + `Đang lọc: <nhãn>.` + `Bỏ bộ lọc để xem toàn bộ mục.` | Distinct copy; names the condition back; offers the clear control |
| Read failure | `Không thể tải danh sách bộ sưu tập` / `Đã xảy ra lỗi khi tải danh sách. Không có mục nào bị thay đổi.` | `role="alert"`, explicit retry |
| Unauthenticated | `Phiên đăng nhập đã hết hạn` / `Đăng nhập lại để tiếp tục.` | Link to `/login`; **no retry**, because none could succeed |
| Continuation failure | `Không thể tải thêm mục. Các mục đã tải vẫn còn nguyên.` | Confined below the collection |

A failure is never rendered as an empty list. No server `message`, `code`, HTTP
status or `requestId` reaches the screen — asserted by injecting a failure whose
message contained `relation "gallery_entries" does not exist` and confirming
none of it, nor `500`, appears in the document.

There is deliberately **no** rejected-cursor band: `APP11-B01` publishes no
cursor-invalid code, so inventing that classification would put a recovery on
screen the server never asked for. A stale cursor lands in the retryable band.

---

## J. Responsive / accessibility

Live evidence, dev gateway `http://admin.embroidery.local`, Chromium:

| Viewport | Result |
|---|---|
| Desktop 1440 | Table presented, card list `display: none`. 20 rows, curated order 10…200. `PASS` |
| Mobile 390 | Card list presented, table `display: none`. `scrollWidth === clientWidth` (375 = 375) — **no horizontal overflow**. No element in `<main>` exceeds the viewport. `PASS` |

Both presentations carry the same four facts; nothing essential is hidden at 390
and there is no overflow menu and no sideways scroll. Exactly one is in the
accessibility tree at any width (`display: none`, not a visual hiding trick).

Accessibility: one `<h1>`; a real `<table>` with `<caption>`, `<colgroup>`, and
the title as `rowheader`; a native `<select>` with a permanently visible
`<label>`; status text never colour-only; loading uses `role="status"`; errors
use `role="alert"`; the continuation button carries native `disabled` and
`aria-busy`; cover alt derived from the entry title; the placeholder is a
labelled `role="img"`. **No row is interactive** — no anchor, button, `onClick`,
`onKeyDown` or `tabIndex` in either row component (asserted structurally), so
keyboard navigation cannot land on an action that does not exist.

---

## K. A02 ownership boundary

`test/boundary/gallery-list-source.test.ts` (26 assertions) proves A01 did not
start A02:

- `/gallery/page.tsx` exists; the segment has **no** subdirectories; no
  `/gallery/new`; no `/admin/gallery`, `/collections` or `/library`.
- The six A02 operations are `undefined` on the api-client boundary and appear
  nowhere in the feature source.
- No `useMutation`, no `.post/.put/.patch/.delete`, no `<form>`, no `<dialog>`
  or `role="dialog"`, no `createPortal`; no component file named for a form,
  dialog, modal, create or editor.
- No string or template literal addresses `/gallery/…`, and no `entryId` appears
  anywhere. The only `next/link` in the feature is the sign-in recovery.
- The service seam exports exactly `fetchGalleryListPage`, `fetchGalleryCover`
  and `GALLERY_COVER_RENDITION`.

The route assertions are scoped to **A01's own feature and segment** rather than
to the repository forever, so `APP11-A02` extends them instead of deleting them.

---

## L. Frozen artifacts

```text
OpenAPI       = 116 paths / 128 operations / 252 schemas   UNCHANGED
migrations    = 37                                         UNCHANGED
Figma         = UNCHANGED (registry and file both untouched)
apps/api      = UNCHANGED
apps/worker   = UNCHANGED
packages/database, packages/contracts = UNCHANGED
generated client = UNCHANGED (drift gate PASS)
```

`git status` shows no change under `apps/api`, `apps/worker`,
`packages/database`, `packages/contracts` or `docs/design`.

---

## M. File-size compliance

`node tools/check-file-size.mjs` over `apps/admin/src/features/gallery-list` and
`apps/admin/test`: **0 files above the review threshold**.

Largest A01-owned files:

```text
source  gallery-list-rows.ts        116   (limit 400, review 300)
        gallery-list-filters.ts     112
        gallery-list-copy.ts         92
tests   gallery-list-render.test.tsx 345  (limit 600, review 500)
        gallery-list-source.test.ts  314
```

`styles/gallery-list.scss` is 475 lines. SCSS is outside the checker's scanned
extensions and well within the Admin norm (the feature stylesheets range to 783
lines). This is stated, not claimed as a gate pass.

No repository-wide file-size claim is made.

---

## N. Validation / live browser evidence

```text
CHANGE_IMPACT
  apps/admin  new gallery-list feature, new /gallery route, nav entry,
              main.scss registration, one repair in assets service (§P)
  packages/api-client  new curated gallery barrel + root re-export
  docs        phase table, this report
```

```text
TESTS_RUN
  Admin typecheck                     tsc --noEmit                    PASS
  Admin scoped lint                   eslint (feature, route, nav, tests)  PASS
  A01 component + boundary suites     jest, 4 suites / 66 tests       PASS
  Admin shell nav suites (shared)     jest, 3 suites / 24 tests       PASS
  api-client package suite            7 suites / 44 tests             PASS
  Admin production build              next build                      PASS (/gallery listed)
  OpenAPI drift gate                  pnpm --filter @embroidery/api openapi:check       PASS
  Generated-client drift gate         pnpm --filter @embroidery/api-client check:generated  PASS
  File-size gate (A01 scope)          node tools/check-file-size.mjs  PASS
  Prettier                            prettier --check/--write        PASS
  Live browser acceptance             Chromium @ 1440 and 390         PASS
```

```text
TESTS_NOT_RUN
  full Admin / Storefront / API / worker suites
  full Playwright E2E suite
  DB regression
  APP11-E01, historical phase suites
  SonarQube

WHY_NOT_RUN
  Out of the change-impact set for a frontend-only checkpoint. A01 changes no
  backend, worker, database or generated artifact, so the suites that guard
  those cannot be affected. The broad E2E suite is explicitly excluded by the
  checkpoint directive; targeted browser acceptance was run instead.
```

### Live browser acceptance

Environment: dev Compose stack through the Nginx gateway
(`http://admin.embroidery.local`), real login through the form (no cookie
injection, no API shortcut). Fixture: 25 seeded gallery entries across the three
statuses, five of them linked to a product, plus one real `GALLERY_MEDIA` /
`PUBLIC` asset prepared through the actual `POST /api/admin/gallery-assets`
(B03A) endpoint and attached as a cover. All seed rows were removed afterwards.

| # | Check | Result |
|---|---|---|
| 1 | Route loads inside authenticated shell; unauthenticated `/gallery` → `307 /login` | PASS |
| 2 | `Bộ sưu tập` nav entry visible and active on `/gallery` | PASS |
| 3 | Default list renders 20 rows in curated order 10…200 | PASS |
| 4 | Status filter changes both request and URL (`?status=PUBLISHED` → 9 rows, all `PUBLISHED`) | PASS |
| 5 | Reload preserves filter (`?status=ARCHIVED` → 8 rows, select shows `Đã lưu trữ`) | PASS |
| 6 | "Tải thêm mục" appends 20 → 25, then reports end of list; cursor never in URL | PASS |
| 7 | Continuation error/retry | NOT EXERCISED LIVE — covered by test (§P, `FU-APP11-A01-03`) |
| 8 | Both empty states — filtered (`Đang lọc: Đã lưu trữ.`) and unfiltered, with no create CTA | PASS |
| 9 | Mobile 390: card list, table hidden, `scrollWidth === clientWidth` | PASS |
| 10 | No create/edit dead control anywhere | PASS |
| 11 | No console error on any visited state | PASS (0 errors) |
| 12 | No failed request from an invented API path — only `GET /api/admin/gallery-entries` and `GET /api/admin/gallery-assets/{id}/thumbnail` | PASS |

Cover verified end-to-end: real bytes (`naturalWidth` 480) streamed through the
authenticated preview, rendered from a blob URL at the fixed 56×56 tile, with
`alt="Ảnh bìa của mục “Mục bộ sưu tập 1”"` — derived from the title, since
`ALT_TEXT_MODEL = DERIVED_NOT_PERSISTED` and the contract publishes no `altText`.
No storage key, bucket or signed URL appears in the DOM.

Screenshots were captured at both viewports and for the empty state. The
repository retains no PNG evidence under `docs/`, so they were not committed;
they are held outside the repository and the observations above are the record.

---

## O. Files changed

Git-authoritative.

```text
M  apps/admin/src/features/admin-shell/model/admin-shell-nav.ts
M  apps/admin/src/features/assets/services/asset-catalog.service.ts   (§P repair)
M  apps/admin/src/styles/main.scss
M  packages/api-client/src/index.ts
M  docs/implementation/phases/APP11-GALLERY-CONTENT-AND-SEO.md
A  packages/api-client/src/gallery.ts
A  apps/admin/src/app/(protected)/gallery/page.tsx
A  apps/admin/src/features/gallery-list/            (18 files)
     index.ts
     model/       gallery-list-route.ts, gallery-status.ts, gallery-list-copy.ts,
                  gallery-list-filters.ts, gallery-list-keys.ts,
                  gallery-list-failure.ts, gallery-list-rows.ts
     hooks/       use-gallery-list-filters.ts, use-gallery-list-query.ts,
                  use-gallery-cover-preview.ts
     services/    gallery-list.service.ts
     components/  gallery-list-screen.tsx, gallery-list-filter-bar.tsx,
                  gallery-list-collection.tsx, gallery-list-table.tsx,
                  gallery-card-list.tsx, gallery-cover.tsx,
                  gallery-list-empty.tsx, gallery-list-failure-state.tsx,
                  gallery-list-pagination.tsx, gallery-list-skeleton.tsx
     styles/      gallery-list.scss
A  apps/admin/test/support/gallery-fixture.ts
A  apps/admin/test/components/gallery-list-render.test.tsx
A  apps/admin/test/components/gallery-list-filters.test.tsx
A  apps/admin/test/components/gallery-list-pagination.test.tsx
A  apps/admin/test/boundary/gallery-list-source.test.ts
A  docs/implementation/reports/APP11-A01-COMPLETION-REPORT.md
```

No `SCOPED_COMMAND_INDEX.md` entry was added: A01 introduced no new focused
command, only existing package scripts and the existing repository tools.

---

## P. Follow-ups

### Disclosed in-scope repair

**`apps/admin/src/features/assets/services/asset-catalog.service.ts`** — one line
changed, outside A01's nominal file set, disclosed rather than silently folded in.

`APP11-B03A` gave `adminAssetDetail` an optional `scope` query parameter. That
shifted the request options into the operation's **third** argument, but the APP2
call site still passed them in the second, so the Admin app **did not typecheck
and did not build** on the branch as handed over — `next build` failed on it, and
at runtime the browser client instance would not have been applied. Since the
Admin production build is an A01 acceptance criterion (§27.35) and the cause is
this phase's own contract change rather than unrelated history, the call was
corrected to `adminAssetDetail(assetId, undefined, { … })`, omitting `scope` so
the operation keeps its `CATALOG` default — the product-media lane that screen
reads. No other behaviour changed.

### Product Owner instruction applied mid-checkpoint

**`FU-APP11-A01-02` — engineering commentary removed from the UI (closed).**
The first implementation followed the `APP8-A02` precedent and rendered
engineer-facing annotations on screen: the endpoint (`Nguồn: GET /api/admin/…`),
a staged-ownership notice naming `APP11-A02`, a filter-contract note, an ordering
note citing `display_order` and the keyset, a pagination note citing `hasNext` /
`nextCursor`, an end-of-list line reading `hasNext = false · …`, and a skeleton
note. The Product Owner ruled this dense and meaningless to an end user and
required its removal. All of it was deleted from the copy catalog, the
components and the stylesheet; the reasoning now lives in source comments and in
this report. A regression test asserts no endpoint, contract field, checkpoint
identifier or `ALL` token appears in the rendered document.

*Note for later checkpoints:* the same annotation style is present on the
existing APP5/APP8 Admin queues. Reconciling those is **not** A01's scope and no
change was made to them; raising it as a phase-level question is left to the
Product Owner.

### Open, non-blocking

- **`FU-APP11-A01-01` — design verified against the registry and the D01
  specification, not against live Figma.** The `figma-desktop` MCP server was
  unreachable this session (`ConnectionRefused`), so `866:905`, `867:907` and
  `867:946` were not opened. All three rows are `APPROVED_FOR_IMPLEMENTATION` and
  the D01 report specifies the column set, filter, continuation, empty state,
  mobile card list and nav entry, which is what was built. A visual diff against
  the live nodes should be done when the connector is available — in particular
  the nav entry's ordinal, which no accepted document fixes.
- **`FU-APP11-A01-03` — continuation failure/retry not exercised in the live
  browser.** It is covered by test (rows preserved, same cursor re-sent), but
  forcing a mid-pagination server failure needs a fault-injection fixture the
  dev stack does not provide. Worth folding into `APP11-E01`.
- **`FU-APP11-A01-04` — the dev API image is stale relative to `APP11-B03A`.**
  The running container mounts only `apps/api/src`; its baked
  `packages/object-storage/dist` predates `copyObject`, so the API could not
  recompile after a restart (`TS2339: Property 'copyObject' does not exist on
  type 'ObjectStoragePort'`) and had in fact been serving pre-B03A code —
  `POST /api/admin/gallery-assets` answered `404` until it was refreshed. It was
  restored by syncing the host's built output into the container; a
  `docker compose build api` is the durable fix. Environment-only: no source
  defect, and both `src` and `dist` on the host are correct.
- **`FU-APP11-A01-05` — a `GALLERY_MEDIA` / `PUBLIC` asset created during live
  testing remains in the dev database** (`01a05383-26dd-7fb3-bc7f-ffdd3b840801`),
  prepared through the real B03A endpoint. Its 25 gallery entries were deleted;
  the asset was kept because removing the row would orphan its MinIO objects. It
  is useful fixture data for `APP11-A02`.
- **`FU-APP11-A01-06` — `gallery-status.ts` sits in feature scope.** `APP11-A02`'s
  editor names the same three states; promote it to
  `src/shared/presentation/` on the checkpoint that gives it a second real
  caller, following the `production-status` precedent — not before.

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
APP11-A02      NEXT
APP11-S01…S05  NOT STARTED
APP11-E01      NOT STARTED
APP11-X01      NOT STARTED
```

Exactly one `NEXT`. A02 was not started. No push occurred.
