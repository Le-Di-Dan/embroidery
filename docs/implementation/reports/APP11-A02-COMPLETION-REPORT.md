# APP11-A02 — Admin Gallery Editor, Media & Publication — Completion Report

Checkpoint: `APP11-A02` · Phase: `APP11 — Gallery, Content, SEO and Store Presentation`
Date: 2026-08-31 · Branch: `production` (no push)

---

## A. Verdict

```text
APP11-A02 = COMPLETE
PO_DECISION_REQUIRED = NONE
NEXT_CHECKPOINT = APP11-S01
```

Two findings outside A02's own scope are recorded in §Q. One was a red gate
inherited from `APP11-A01` and is repaired here; the other is a Product Owner
correction applied mid-checkpoint. Neither blocks A02, and both are disclosed in
full.

---

## B. Entry baseline / design authority

Frozen artifacts, re-measured at completion:

```text
OpenAPI paths      = 116   (unchanged)
OpenAPI operations = 128   (unchanged)
OpenAPI schemas    = 252   (unchanged)
migrations         = 37    (unchanged)

Admin routes       = 24 -> 25
Storefront routes  = 12    (unchanged)
```

Design authority — `FIG-APPROVAL-APP11-D01-PO-001`. All six editor rows
confirmed `APPROVED_FOR_IMPLEMENTATION` in `docs/design/FIGMA_DESIGN_INDEX.md`
(lines 1336–1341), plus the three list rows A02 modifies:

| Registry id | Node | State |
|---|---|---|
| `FIG-APP11-ADMIN-GALLERY-EDITOR-DESKTOP` | `868:909` | `APPROVED_FOR_IMPLEMENTATION` |
| `FIG-APP11-ADMIN-GALLERY-EDITOR-MEDIA-SELECT` | `870:926` | `APPROVED_FOR_IMPLEMENTATION` |
| `FIG-APP11-ADMIN-GALLERY-EDITOR-PUB-READY` | `870:1104` | `APPROVED_FOR_IMPLEMENTATION` |
| `FIG-APP11-ADMIN-GALLERY-EDITOR-PUB-BLOCKED` | `870:1187` | `APPROVED_FOR_IMPLEMENTATION` |
| `FIG-APP11-ADMIN-GALLERY-EDITOR-PUB-UNPUBLISH` | `870:1274` | `APPROVED_FOR_IMPLEMENTATION` |
| `FIG-APP11-ADMIN-GALLERY-EDITOR-MOBILE` | `870:1368` | `APPROVED_FOR_IMPLEMENTATION` |
| `FIG-APP11-ADMIN-GALLERY-LIST-DESKTOP` | `866:905` | `APPROVED_FOR_IMPLEMENTATION` |
| `FIG-APP11-ADMIN-GALLERY-LIST-EMPTY` | `867:907` | `APPROVED_FOR_IMPLEMENTATION` |
| `FIG-APP11-ADMIN-GALLERY-LIST-MOBILE` | `867:946` | `APPROVED_FOR_IMPLEMENTATION` |

Structural precedents used: APP2-D01 `434:20` (media group), `437:73` (picker
dialog), `441:106` / `442:110` / `442:205` (publication ready / blocked /
confirm unpublish), `438:90` (mobile).

**Live Figma nodes were not opened this session.** The `figma-desktop` MCP
server failed to connect (`ConnectionRefused`), and the available Figma plugin
tools expose only authentication, not read. The implementation therefore worked
from the registry rows plus the `APP11-D01` completion report §H, which fixes
the editor's field set, the media group's rules, the three publication states
and the mobile frame. Nothing in Figma was modified or read-modified; the
registry is untouched. This repeats `FU-APP11-A01-01` and is carried forward as
`FU-APP11-A02-02`.

`node tools/check-figma-design-index.mjs` was run: **PASS**.

---

## C. Routes / staged-action restoration

```text
/gallery/[entryId] = delivered   apps/admin/src/app/(protected)/gallery/[entryId]/page.tsx
/gallery/new       = absent
Admin routes = 24 -> 25 (counted by `page.tsx` under apps/admin/src/app)
Storefront routes = 12 (unchanged)
```

- One new segment, and only one. `/gallery` has exactly one child directory,
  `[entryId]`, which itself has none — asserted structurally in
  `test/boundary/gallery-editor-source.test.ts` and in the updated A01 boundary
  suite. There is no `/gallery/new`, no `/gallery/[entryId]/edit`, no
  `/gallery/[entryId]/media` and no `/gallery/[entryId]/publication`:
  publication and media are **panels inside the editor**, because three
  addresses for one screen whose parts share a single concurrency token would be
  three ways to hold a stale one.
- The segment is the entry's **UUID**, not its public slug. Both route files are
  thin — neither names a query, a mutation, an operation or `expectedUpdatedAt`.
- Inside the authenticated shell: the segment lives under `(protected)`.
  Verified live — an unauthenticated `GET /gallery/{id}` answered `307 /login`.
- Navigation: no new nav entry. `resolveNavItemState` already returns `section`
  for `/gallery/{entryId}`, so `Bộ sưu tập` stays active on the editor —
  confirmed live.

### A01's staged actions, restored

```text
STAGED_ACTION_OWNERSHIP =
  create_action  -> APP11-A02   RESTORED
  row_navigation -> APP11-A02   RESTORED
```

- **Create.** `Tạo mục mới` appears in the list header and in the *unfiltered*
  empty state, exactly where `866:905` and `867:907` draw it. It is absent from
  the filtered empty state on purpose: an operator who filtered to `Đã lưu trữ`
  and found nothing wants to drop the filter, not create an entry.
- **Row navigation.** The title in each desktop row and each mobile card is a
  real `next/link` to `/gallery/{entryId}` — focusable, announced as a link,
  middle-clickable. There is **no** row `onClick`, no `tabIndex` on a `<tr>` and
  no clickable `<div>`; exactly one link per row, asserted structurally and
  observed live (`linksInRow: 1`).
- A01's filter, pagination and ordering semantics are untouched.

### The dependency between the two gallery features points one way

`gallery-editor` imports the list's route helper and cache root; `gallery-list`
imports nothing from the editor and receives the create action as an opaque
`ReactNode` from the route file. A barrel import the other way would close that
into a cycle between two feature barrels. Asserted in the A01 boundary suite
("imports nothing from the editor feature").

---

## D. Curated client boundary

`packages/api-client/src/gallery.ts` now publishes the seven operations A02
consumes, beside A01's two:

```text
crossed at A01   adminGalleryEntryList · adminGalleryAssetPreview
crossed at A02   adminGalleryEntryCreate · adminGalleryEntryDetail
                 adminGalleryEntryUpdate · adminGalleryEntryReplaceAssets
                 adminGalleryEntryPublish · adminGalleryEntryUnpublish
                 adminGalleryAssetCreate
value enums      AdminGalleryEntryListStatus
                 AdminGalleryEntryDetailResponseStatus
types            AdminGalleryEntryDetailResponse · AdminGalleryEntryAssetResponse
                 AdminGalleryAssetResponse · CreateGalleryEntryBody
                 UpdateGalleryEntryBody · ReplaceGalleryEntryAssetsBody
                 PublishGalleryEntryBody · UnpublishGalleryEntryBody
                 PrepareGalleryAssetBody
```

`packages/api-client/src/catalog.ts` adds the Admin asset symbols the two
pickers need, from their established barrel:

```text
values   AdminAssetListScope · AdminAssetDetailScope
         AdminAssetDetailResponseKind · AdminAssetDetailResponseClassification
types    AdminAssetDetailParams
```

The response enums cross because the intake enums that already crossed are
single-member by design — intake can only mint `CATALOG_MEDIA` /
`PRODUCTION_SENSITIVE` — so they cannot name the `GALLERY_MEDIA` / `PUBLIC` lane
a scoped read now returns. A consumer deciding which lane an asset is in
compares against the vocabulary the **read** publishes, not a literal no gate
would catch drifting.

Still withheld, and not on a schedule: every `publicGallery*` and
`publicSitemap*` operation. An Admin screen reading the storefront's view of the
same rows would be a second, unauthenticated source of truth. Asserted in
`packages/api-client/src/gallery.curated-boundary.test.ts`, which also asserts
that no archive, restore or asset-deletion operation exists to expose.

Generated files were not edited and no regeneration occurred.

```text
openapi check          = PASS (artifact up to date)
generated-client check = PASS (tree hash a19cb87a…988a70, unchanged)
```

`FU-APP11-B01-04` is **CLOSED**: the Admin gallery curated exports A02 needed
are all published.

---

## E. Create flow

No `/gallery/new`. Creation is a small bootstrap dialog on `/gallery`, following
the `APP2-A03` dialog precedent, because the editor is addressed by an id only
the server can issue — a create *route* would be a second editor that cannot
save anything until it has first created the record.

**Fields: exactly the five `CreateGalleryEntryBody` requires.**

```text
title · slug · description · displayOrder · isIndexable
```

`isIndexable` is included **because the generated request declares it
required** — supplying a default here would be the screen deciding a published
entry's crawlability on the operator's behalf. `linkedProductId`, `seoTitle` and
`seoDescription` are optional on the body and belong to the editor. `status`,
`assets` and `archivedAt` are not part of the body at all and are not
expressible: asserted both on the built body and on the rendered dialog, which
carries exactly five form controls.

**Slug.** Explicit, visible, caller-owned. Validated against the canonical
public grammar (`^[a-z0-9]+(?:-[a-z0-9]+)*$`, ≤80) before anything is sent. The
suggestion is an action the operator triggers, writing into the same visible
field they can then edit — verified live: `Áo thun thêu hoa sen` →
`ao-thun-theu-hoa-sen`, still an ordinary editable input. Nothing generates or
stores a hidden slug, and no copy promises it can be changed later.

**Success.** The mutation seeds the detail cache, invalidates
`galleryListKeys.lists()`, closes the dialog and navigates to
`/gallery/{returnedEntryId}` — the **id the server returned**, never the slug
that was typed. Asserted in test against a fixture whose returned slug differs
from the typed one, and observed live.

**Failure.** Mapped by classification only: `slugConflict`, `invalid`,
`unauthenticated`, `generic`. Every typed value stays on screen. No server
message, code, HTTP status or request id reaches the screen — asserted by
scanning the rendered DOM for all four.

---

## F. Authoring

Fields rendered: `title`, `slug`, `description`, `displayOrder`,
`linkedProductId`, `seoTitle`, `seoDescription`, `isIndexable`, `status`.

Editable through PATCH: `title`, `description`, `displayOrder`,
`linkedProductId`, `seoTitle`, `seoDescription`, `isIndexable`.

Not inputs at all — the absence is structural, not a rule a component
remembers, because `GalleryAuthoringValues` has no field for any of them:

```text
slug         chosen once at create; the contract rejects it on PATCH
status       APP11-B02 owns every transition; the panel commands them
assets       replaced as a complete ordered set by its own operation
archivedAt   lifecycle evidence the server writes
```

- **Slug is read-only** — a real `<input readonly>` (selectable, keyboard
  reachable, announced as read-only), with the operator-facing help
  `Đường dẫn được cố định sau khi tạo.` No DTO, endpoint or checkpoint is named.
- **Explicit save, never save-as-you-type.** The body is diffed against the
  record the form was seeded from, so an untouched field is absent and a
  concurrent change to it survives. Verified live and in test: editing only the
  title sent `{ title }` and nothing else.
- **Cleared is not untouched.** `linkedProductId`, `seoTitle` and
  `seoDescription` send explicit `null` to clear; `description` is NOT NULL on
  the record so it is set to `''` rather than nulled.
- **No concurrency token** on this body — the contract accepts none, and none is
  invented (`FU-APP11-B01-01` respected).
- After a successful PATCH the detail cache is **set** from the response (which
  is what refreshes the token for the guarded operations), the list root is
  invalidated, and the dirty state clears — the save/discard pair disappears,
  which is how the screen says the form is clean.

---

## G. Linked Product

Reuses the existing Admin catalog reads; no second product API and no product
write is reachable.

- The picker is `adminProduct_list`, **not** filtered to `PUBLISHED`: the gallery
  contract validates a linked product as Admin-visible, not publicly visible, so
  filtering would be this screen enforcing a rule the server does not have.
- The linked product is named by `adminProduct_detail` — **one** read for the one
  product on one screen, never one per row. When that read fails the field says
  `Đã liên kết — không tải được tên` rather than falling back to the UUID.
- **No raw UUID as user-facing copy.** Verified live: with a product linked, a
  UUID regex over `document.body.innerText` matched nothing.
- Clearing sets the pending value to none, which the diff turns into an explicit
  `linkedProductId: null` on the next save — asserted on the wire.
- An entry with nothing linked opens **no** catalog read at all.

---

## H. Media selection, preparation and order

**Replacement, not append.** The client model is one ordered list of distinct
ids; a save sends the whole of it through `adminGalleryEntry_replaceAssets` with
`assetIds` = the entire current ordered list and `expectedUpdatedAt` = the
latest persisted token. There is no per-image mutation anywhere — one atomic
replacement, because a sequence of per-image calls could leave the entry
half-changed if the fourth failed.

- **Position 0 is the cover**, and it is not a flag. `Đặt làm ảnh bìa` is a move
  to the front; the row that is already first does not offer it. A stored
  `isCover` would be a second source of truth the server does not have.
- **Duplicates prevented** by construction (`dedupeAssetIds`), and the picker
  does not offer an image the entry already holds — the contract refuses a
  duplicate outright, so an interface that let one be chosen twice would exist
  only to produce a refusal.
- **An empty selection is a legal draft.** Verified live: removing both images
  sent `assetIds: []` and succeeded; the empty copy names the consequence
  (`Chưa có ảnh. Cần ít nhất một ảnh để xuất bản.`) without refusing the save.
- **Local until saved, and local after a failure.** A refused save leaves the
  arrangement untouched so a retry is one click, not a rebuild.
- **Ordering is by button**, no drag-and-drop and no dependency added: pointer
  dragging is unusable by keyboard and unreliable at 390. Every accessible name
  carries the position (`Di chuyển trước: Ảnh 2`), and the moves that would go
  nowhere are `disabled` rather than silently inert.
- **No alt input anywhere.** `ALT_TEXT_MODEL = DERIVED_NOT_PERSISTED`; alt is
  composed from the entry title and position (`Ảnh 2 của mục “…”`). Asserted on
  the rendered `<img alt>` and by a source scan for `altText`.
- **No deletion control**, because no delivered operation deletes a prepared
  image (`FU-APP11-B03A-01`). Detaching leaves the asset selectable and
  previewable.

**Preview** is `adminGalleryAsset_preview` → `Blob` → object URL, revoked on
replacement and unmount. No URL is built, no bucket, no storage key, no signed
link. A failed preview is local: the row renders a labelled tile and the editor
stays fully usable. Verified live — no storage vocabulary anywhere in the DOM.

**Preparation from a catalog source** (`APP11-B03A`) is an editor action,
`Chuẩn bị ảnh mới`, opening a picker at `scope=CATALOG`. The request carries
exactly `sourceAssetId` and `expectedSourceUpdatedAt` — the token the row was
*listed* with, not one refetched at click time. The caller cannot choose kind,
classification, status, storage key or rendition set: the operation accepts
none of them, asserted both on the wire and by a source scan. On success the
returned **new** asset id is selected (never the source's), the `GALLERY` lane
is reset rather than invalidated, and the association is still only local until
the media save runs.

A stale source shows the mandated sentence — `Nguồn ảnh đã thay đổi. Hãy tải lại
danh sách và chọn lại.` — with **no automatic retry**: the operation has no
promotion idempotency, so a retry could leave an orphaned copy no delivered
operation can remove. Storage unavailability (503) uses safe retryable copy and
states that nothing was created.

**Both pickers name their lane explicitly.** `adminAsset_list` treats an omitted
`scope` as `CATALOG`, so a picker relying on the default would look exactly like
one that worked while offering the wrong images. Verified live:
`?limit=24&scope=GALLERY` and `?limit=24&scope=CATALOG`, never unscoped.
`CUSTOMER_PRIVATE` is in neither lane and is unreachable from the operation.

---

## I. Publication

Advisory readiness mirrors `APP11-B02` exactly, evaluated from the **persisted**
record:

```text
title non-empty · slug present · description non-empty
>= 1 persisted attached gallery asset
```

No linked product, no `seoTitle`, no `seoDescription`, no `isIndexable=true` and
no alt text is a requirement — asserted positively (the four rows exist) and
negatively (no row exists for any of the four). Each requirement states its
state in text and with a symbol; `[data-met]` only tints a distinction the
symbol already makes.

- **Unsaved work blocks the command, explicitly.** The server recomputes
  readiness from its own locked row, so publishing with an unsaved title in a
  text box would evaluate the *old* title. Rather than chaining a hidden save
  behind the button, the panel says there is unsaved work and requires a save
  first — verified live.
- **`isIndexable=false` publishes.** Verified live end to end: the entry was
  published with indexing off. The explanation sits beside the control:
  `Tắt sẽ ẩn trang khỏi kết quả tìm kiếm và sơ đồ trang. Mục vẫn xuất bản được.`
- **Publish** `DRAFT → PUBLISHED`, **unpublish** `PUBLISHED → DRAFT`, both with
  the latest `expectedUpdatedAt`. Unpublish is confirmed through an
  `alertdialog` that says what it does *and does not* do — it is not deletion.
  Verified live: after unpublish the status returned to `Bản nháp` and both
  images, the title, the SEO text and the linked product were all preserved.
- Nothing is optimistic: status, requirements and available actions all
  re-derive from the authoritative record after the server answers.
- A refused publish's requirement codes are read from the envelope's `errors`
  array **only** to emphasise rows the panel renders from the refetched record —
  never to author a message.

### ARCHIVED

Inspected against the delivered backend rather than assumed:

| Operation | Archived entry | Editor |
|---|---|---|
| `adminGalleryEntry_update` | accepted — `updateAuthoring` has no status filter | authoring stays editable |
| `adminGalleryEntry_replaceAssets` | refused — `MEDIA_EDITABLE_STATES` is `[DRAFT, PUBLISHED]` | media rendered read-only |
| publish / unpublish | refused — neither transition starts from `ARCHIVED` | both buttons absent |

Media is rendered read-only rather than left savable because the guarded write
would be refused **as a version conflict** (`explainGuardedMiss` returns
non-`NOT_FOUND` for a state mismatch), which would tell the operator to reload
and reloading would not help. **No archive, restore or delete control was
invented**, because no operation performs one — asserted by source scan.

---

## J. Concurrency

```text
guarded   replaceAssets · publish · unpublish   (expectedUpdatedAt required)
unguarded update                                (contract accepts no token)
```

The token is read from the authoritative cached record **at command time** and
is never held in local state — asserted structurally (no `useState`/`useRef`
holding `expectedUpdatedAt`). Every successful guarded command replaces the
cached record with the response, so the next command uses the token the server
just issued.

`retry: false` on every mutation, and here it is a correctness rule: a retry
would re-send a token already known stale, or prepare a second image.

**Conflict recovery, proven live.** With a local reorder pending, a second
"session" advanced the entry through an ordinary authoring PATCH; the media save
was then refused:

```text
attempts              = 1        (no auto-replay)
dialog                = "Mục bộ sưu tập đã thay đổi ở nơi khác. Tải lại dữ liệu
                         mới nhất trước khi tiếp tục — thay đổi chưa lưu sẽ bị bỏ."
local arrangement     = preserved (2 rows, still dirty)
after "Tải lại"       = record refetched, h1 shows the other session's title
next guarded save     = succeeded with the refreshed token
```

The dialog names the cost of reloading only when there is unsaved work to lose,
and `Để sau` is a real option: nothing is discarded and nothing is replayed.
Only the exact domain code `GALLERY_ENTRY_VERSION_CONFLICT` opens it — a bare
`409` is four different things here (taken address, stale token, not ready,
forbidden transition) and reloading repairs exactly one.

---

## K. Errors and unsaved changes

Distinct, separately-rendered states: detail loading · not found · session
expired · detail unavailable · authoring save failure · media save failure ·
media preparation failure · preview failure · publish not ready · version
conflict · publish/unpublish failure.

Each recovery is one that can actually work: "not found" offers only the list
(reload cannot resurrect a missing record); an expired session offers only sign
in (no retry could succeed); a transport failure offers retry. No server
`message`, `code`, HTTP status or `requestId` is read for display anywhere —
asserted by source scan and by scanning the rendered DOM. Every mutation failure
preserves the operator's input.

**Unsaved-change protection** covers both kinds of pending work — authoring
edits and the image arrangement — through their disjunction, because an operator
can have either without the other. It reuses the shared
`useRegisterNavigationInterceptor`, so a shell navigation entry outside the
subtree reaches the same dialog. Nothing is dirty after hydration: both flags
diff against the seed, and the seed is re-taken only when the record's identity
or token changes.

---

## L. Responsive / accessibility

Desktop 1440: authoring column plus a sticky publication rail from the shell
breakpoint (1024px) upward. Mobile 390: everything stacks in source order.

```text
390: documentElement.scrollWidth === clientWidth === 375
     elements overflowing the viewport: 0
```

Accessibility: exactly one `<h1>` (the entry) — asserted; `<h2>`-labelled
regions for authoring, linked product, media and publication; real `<label for>`
on every control with errors wired through `aria-describedby`; `readonly` +
`aria-readonly` on the slug; status and readiness never colour-only; media
controls named with their position; derived image alt; keyboard-operable
ordering with `disabled` at the ends; `role="dialog"` / `alertdialog` with focus
trapped, moved in on open and restored on close; `aria-busy` on in-flight
commands; `role="status"` for loading and polite announcements; `role="alert"`
for failures; semantic row links and **no clickable div anywhere**.

Every control clears `$size-touch-target-min`; the dialog is capped at viewport
height so its footer is always reachable at 390.

### Product Owner correction applied mid-checkpoint

The first live run exposed a real layout defect in both pickers
(`evidences/app_11/a02/modal_layout_issue.png`): the option card was a
*horizontal* row — radio, image and caption side by side — inside a grid column
barely wider than the image, so every caption was squeezed into a sliver and
wrapped across four lines, and each card repeated a one-sentence note that the
dialog help had already said.

Corrected on Product Owner instruction:

- the option card is now **vertical** — a full-width image band, then the radio
  or checkbox beside the name on one line, then the metadata on one line;
- the grid's minimum column widened to 208px and the image band fixed at 132px,
  so a row of cards keeps one baseline whatever the sources' proportions are;
- the repeated per-card sentence was **removed**; the source tile's own
  placeholder now says `Chưa có xem trước` in two words and carries the
  accessible name on the tile itself;
- a copy pass shortened ~45 strings across both catalogs — every replacement
  keeps the fact the sentence carried and drops the words that were not working.
  Nothing that stated a warning, a consequence or a recovery instruction was
  removed.

Re-verified live at 1440 and 390 (`a02-source-picker-1440-fixed.png`,
`a02-gallery-picker-1440.png`, `a02-source-picker-390.png`).

---

## M. Frozen artifacts

```text
OpenAPI       = 116 paths / 128 operations / 252 schemas   UNCHANGED
migrations    = 37                                         UNCHANGED
Figma         = UNCHANGED (registry and file both untouched)
apps/api      = UNCHANGED
apps/worker   = UNCHANGED
packages/database, packages/contracts = UNCHANGED
generated client = UNCHANGED (drift gate PASS, same tree hash)
Storefront    = UNCHANGED (12 routes)
```

`git status` shows no change under `apps/api`, `apps/worker`,
`packages/database`, `packages/contracts`, `docs/design` or
`packages/api-client/src/generated`. No dependency was added — the Admin
`package.json` dependency list is asserted verbatim in the boundary suite.

---

## N. File-size compliance

`node tools/check-file-size.mjs` over `apps/admin/src/features/gallery-editor`,
`apps/admin/test` and `packages/api-client/src`: **0 files above the review
threshold** in all three.

Largest A02-owned files:

```text
source  use-gallery-editor-state.ts     248   (limit 400, review 300)
        gallery-editor-copy.ts          240
        gallery-source-picker-dialog.tsx 230
        gallery-authoring-values.ts     222
        gallery-create-values.ts        220
tests   gallery-editor-model.test.ts    498   (limit 600, review 500)
        gallery-editor-media.test.tsx   466
        gallery-editor-authoring.test.tsx 451
```

> **Corrected by `APP11-A02-C1`.** The claim below was wrong. SCSS is runtime
> application source and the 400-line cap applies to it; that `tools/check-file-size.mjs`
> does not scan `.scss` is a gap in the tool, not an exemption. `APP11-A02-C1`
> split `gallery-editor.scss` (775) and `gallery-list.scss` (526) into semantic
> partials, every one of them at or under 240 lines, and proved the emitted CSS
> byte-identical. See `docs/implementation/reports/APP11-A02-C1-COMPLETION-REPORT.md`.
>
> ~~`styles/gallery-editor.scss` is 775 lines. SCSS is outside the checker's
> scanned extensions and within the Admin norm (existing feature stylesheets
> range to 783).~~

The capability is split by responsibility, not by line count: create bootstrap,
authoring form, media section, media row, the two asset pickers, the product
picker, publication panel, the dialogs, the state controller, three service
seams and the failure map are each their own module.

---

## O. Validation / live browser evidence

```text
CHANGE_IMPACT
  apps/admin  new gallery-editor feature (31 files), new /gallery/[entryId]
              route, A01 staged-action restoration, gallery-status promoted to
              shared presentation, main.scss registration
  packages/api-client  gallery + catalog curated barrels
  docs        phase table, this report
```

```text
TESTS_RUN
  Admin typecheck                     tsc --noEmit                          PASS
  Admin scoped lint                   eslint (feature, route, shared, tests) PASS
  api-client scoped lint              eslint (gallery, catalog, new test)    PASS
  A02 model suite                     jest, 38 tests                         PASS
  A02 component suites (3)            jest, 61 tests                         PASS
  A02 boundary suite                  jest, 28 tests                         PASS
  A01 suites (directly affected)      jest, 4 suites / 73 tests              PASS
  Admin shell + navigation suites     jest, 17 suites / 97 tests             PASS
  api-client package suite            jest, 8 suites / 51 tests              PASS
  Admin production build              next build                             PASS (25 routes)
  OpenAPI drift gate                  pnpm --filter @embroidery/api openapi:check           PASS
  Generated-client drift gate         pnpm --filter @embroidery/api-client check:generated  PASS
  Figma registry gate                 node tools/check-figma-design-index.mjs PASS
  File-size gate (3 scopes)           node tools/check-file-size.mjs         PASS
  Prettier                            prettier --write/--check               PASS
  Live browser acceptance             Chromium @ 1440 and 390                PASS
```

Combined scoped Jest run (`gallery|admin-shell|nav`): **27 suites / 297 tests,
all passing.**

```text
TESTS_NOT_RUN
  full Admin / Storefront / API / worker suites
  full Playwright E2E suite
  DB regression
  APP11-E01, historical phase suites
  SonarQube

WHY_NOT_RUN
  Out of the change-impact set for a frontend-only checkpoint. A02 changes no
  backend, worker, database or generated artifact, so the suites that guard
  those cannot be affected. The broad E2E suite is explicitly excluded by the
  checkpoint directive; targeted browser acceptance was run instead.
```

### Live browser acceptance

Environment: dev Compose stack through the Nginx gateway
(`http://admin.embroidery.local`), real login through the form — no cookie
injection and no API shortcut. The operator password was requested for this run
and is not recorded here, in any fixture, or in any log.

| # | Check | Result |
|---|---|---|
| 1 | `/gallery` loads inside the authenticated shell | PASS |
| 2 | Create action visible (header + unfiltered empty state) | PASS |
| 3 | Bad create input validates; **no request sent** | PASS |
| 4 | Create DRAFT with a unique canonical slug | PASS |
| 5 | Navigates to `/gallery/{returnedId}` — not the slug | PASS |
| 6 | Fields hydrate from the persisted record | PASS |
| 7 | Title / description / order / SEO / indexability saved | PASS |
| 8 | Product linked, named (`Khăn tay thêu sen đỏ`), and clearable | PASS |
| 9 | Gallery asset picker opens at `scope=GALLERY` | PASS |
| 10 | Authenticated preview renders real bytes; no storage fact in DOM | PASS |
| 11 | Gallery media prepared from a CATALOG source via B03A (`201`) | PASS |
| 12 | Reorder + set-as-cover | PASS |
| 13 | Media saved as one ordered replacement | PASS |
| 14 | Readiness reflects persisted state (blocked → ready) | PASS |
| 15 | Publish `DRAFT → PUBLISHED` | PASS |
| 16 | `isIndexable=false` did **not** block publish | PASS |
| 17 | Unpublish `PUBLISHED → DRAFT`, confirmed first | PASS |
| 18 | Assets, authoring and SEO all preserved through unpublish | PASS |
| 19 | Back to list; row link navigates to the editor | PASS |
| 20 | Mobile 390: no overflow (`scrollWidth === clientWidth`) | PASS |
| 21 | No console error on a clean load of any state | PASS (0) |
| 22 | No invented API path | PASS |
| 23 | Two-session version conflict (optional live) | PASS |

Check 22, observed on the wire — exactly the delivered operations and nothing
else:

```text
GET  /api/admin/gallery-entries?limit=20
GET  /api/admin/gallery-entries/{id}
POST /api/admin/gallery-entries
PATCH /api/admin/gallery-entries/{id}
PUT  /api/admin/gallery-entries/{id}/assets
POST /api/admin/gallery-entries/{id}/publication
DELETE /api/admin/gallery-entries/{id}/publication
POST /api/admin/gallery-assets
GET  /api/admin/gallery-assets/{id}/thumbnail
GET  /api/admin/assets?limit=24&scope=GALLERY
GET  /api/admin/assets?limit=24&scope=CATALOG
GET  /api/admin/products?limit=20
GET  /api/admin/products/{id}
```

No public gallery or sitemap call, no direct object-storage request, no
unscoped asset read.

**Console-error note.** A cumulative session log shows `404`/`500` on `/gallery`
and `StaffSessionUnavailableError`; both are from the two container restarts
performed mid-session to pick up new source, not from application code. The HMR
websocket `502` and the `favicon.ico` `404` are pre-existing dev-environment
facts. A clean navigation to the editor produces **zero** console errors. The
`net::ERR_ABORTED` entries paired with a following `200` are React StrictMode's
double effect being cancelled through the `AbortSignal` the query layer passes —
the abort plumbing working, not a failure.

**Fixture residue.** The live run created one gallery entry
(`01a05574-…e709`, left as `DRAFT`, therefore invisible publicly) and one
prepared `GALLERY_MEDIA` / `PUBLIC` asset. Neither can be removed: `APP11-B02`
publishes no delete or archive operation for an entry, and `FU-APP11-B03A-01`
records that no deletion route exists for a prepared asset. **No cleanup was
invented**; this is bounded dev-fixture residue, reported rather than removed.

Screenshots at both viewports are held under `evidences/app_11/a02/`, which is
git-ignored; they are not committed.

---

## P. Git-authoritative files changed

**Modified (24):**

```text
apps/admin/src/app/(protected)/gallery/page.tsx
apps/admin/src/features/gallery-list/components/gallery-card-list.tsx
apps/admin/src/features/gallery-list/components/gallery-list-collection.tsx
apps/admin/src/features/gallery-list/components/gallery-list-empty.tsx
apps/admin/src/features/gallery-list/components/gallery-list-screen.tsx
apps/admin/src/features/gallery-list/components/gallery-list-table.tsx
apps/admin/src/features/gallery-list/index.ts
apps/admin/src/features/gallery-list/model/gallery-list-copy.ts
apps/admin/src/features/gallery-list/model/gallery-list-filters.ts
apps/admin/src/features/gallery-list/model/gallery-list-route.ts
apps/admin/src/features/gallery-list/model/gallery-list-rows.ts
apps/admin/src/features/gallery-list/styles/gallery-list.scss
apps/admin/src/styles/main.scss
apps/admin/test/boundary/gallery-list-source.test.ts
apps/admin/test/components/gallery-list-render.test.tsx
apps/admin/test/components/customer-merge-navigation.test.tsx      (§Q repair)
apps/admin/test/components/design-template-navigation.test.tsx     (§Q repair)
apps/admin/test/components/order-navigation.test.tsx               (§Q repair)
apps/admin/test/components/production-navigation.test.tsx          (§Q repair)
apps/admin/test/model/admin-shell-model.test.ts                    (§Q repair)
packages/api-client/src/catalog.ts
packages/api-client/src/gallery.ts
docs/implementation/phases/APP11-GALLERY-CONTENT-AND-SEO.md
docs/implementation/reports/APP11-A02-COMPLETION-REPORT.md          (this file)
```

**Renamed (1):** `apps/admin/src/features/gallery-list/model/gallery-status.ts`
→ `apps/admin/src/shared/presentation/gallery-status.ts` (§Q, closes
`FU-APP11-A01-06`).

**Added:** `apps/admin/src/app/(protected)/gallery/[entryId]/page.tsx` ·
`apps/admin/src/features/gallery-editor/` (31 files: 1 barrel, 8 model, 4
services, 6 hooks, 13 components, 1 stylesheet) ·
`apps/admin/test/boundary/gallery-editor-source.test.ts` ·
`apps/admin/test/components/gallery-create-and-list-actions.test.tsx` ·
`apps/admin/test/components/gallery-editor-authoring.test.tsx` ·
`apps/admin/test/components/gallery-editor-media.test.tsx` ·
`apps/admin/test/components/gallery-editor-unsaved.test.tsx` ·
`apps/admin/test/model/gallery-editor-model.test.ts` ·
`apps/admin/test/support/gallery-editor-fixture.ts` ·
`packages/api-client/src/gallery.curated-boundary.test.ts`

---

## Q. Follow-ups

### Disclosed in-scope repair

**Five shared Admin test suites were red at A02's entry HEAD**, and are repaired
here. `APP11-A01` appended the `Bộ sưu tập` entry to `ADMIN_PRIMARY_NAV` without
adding it to the four nav-order expectations or to `IMPLEMENTED_ADMIN_ROUTES`,
so `admin-shell-model`, `order-navigation`, `production-navigation`,
`design-template-navigation` and `customer-merge-navigation` all failed. This
was **confirmed to pre-date A02** by stashing the working tree and re-running
them (5 suites failed on the clean A01 tree). A01's report §N records these
suites as PASS, which was inaccurate.

The repair is one line each — the entry the shell actually renders, in the
position it actually holds. Nothing was weakened: each suite still asserts the
complete ordered id list. All 17 shell/navigation suites now pass.

### `FU-APP11-A01-06` — CLOSED

Gallery status presentation now has a genuine second caller (the editor's
publication panel names the same three states and must name them identically),
so `gallery-status.ts` moved to `apps/admin/src/shared/presentation/`, following
the `production-status` precedent A01 named. Admin-wide and no further: the
storefront never sees an entry's lifecycle state.

### Closed by this checkpoint

- **`FU-APP11-B01-04`** — the remaining Admin gallery curated exports are
  published (§D).
- **`FU-APP11-B01-03`** — `display_order` UX is owned here: a plain integer
  field with the help `Số nhỏ hơn đứng trước.` No backend uniqueness or reorder
  semantics were invented; the list still renders the value read-only.

### Open, non-blocking

- **`FU-APP11-A02-01`** — the Admin modal shell now has a **third**
  implementation (`gallery-dialog.tsx`, beside `APP2-A03`'s `ProductDialog` and
  `APP3-A03`'s `editor-dialog`). Promoting one to Admin shared scope means
  rewriting two delivered, accepted features, which is not this checkpoint's
  change. The behaviour here is deliberately identical so the extraction stays a
  mechanical move when scheduled.
- **`FU-APP11-A02-02`** — live Figma was unavailable again
  (`figma-desktop` MCP `ConnectionRefused`); implementation worked from the
  registry plus `APP11-D01` §H. Carries `FU-APP11-A01-01` forward. A session
  with a working Figma connection should re-verify the six editor frames against
  the runtime.
- **`FU-APP11-A02-03`** — a catalog **source** tile has no preview, because
  `APP2` publishes no authenticated delivery route for product media. The tile
  states the absence rather than rendering a broken image (the `APP2-A03`
  precedent). If a source preview is later wanted, it needs a backend operation
  and is therefore not a frontend follow-up.
- **`FU-APP11-A02-04`** — the live run leaves one `DRAFT` gallery entry and one
  prepared gallery asset in the dev database, neither removable through a
  delivered operation (§O).
- **`FU-APP11-B03A-01`** stays open and unchanged: no deletion route for an
  unused prepared gallery asset, so no deletion UI exists.
- **`FU-APP11-B01-01`** respected: the authoring PATCH remains token-free and no
  client-side concurrency was retrofitted onto it.

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
APP11-S01      NEXT
APP11-S02      NOT STARTED
APP11-S03      NOT STARTED
APP11-S04      NOT STARTED
APP11-S05      NOT STARTED
APP11-E01      NOT STARTED
APP11-X01      NOT STARTED
```

Exactly one NEXT. `APP11-S01` was not started. Nothing was pushed.
