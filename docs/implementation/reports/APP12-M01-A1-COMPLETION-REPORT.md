# APP12-M01.A1 — Admin Product Multi-Image Management · Runtime Implementation

`APP12-M01.A1 = COMPLETE`

Internal implementation package inside the single `APP12-M01` checkpoint. Not a
new APP12 checkpoint id. Nothing was pushed, nothing was deployed, no
`APP12-G03` data was created, no Storefront file was touched, no Figma artifact
was created or modified, no migration was added, no HTTP operation was added,
and the shared development database was not written to.

---

## A. Verdict

The Admin could not manage a product's photographs. It rendered **one 144 px
full-width row per image** — ≈ 3 120 px of stacked cards at 1440 for twenty
images, and ≈ 3 748 px at 390, where each row's three text buttons wrapped onto
a second line. It offered **no set-primary action at all**: the primary could
only be reached by pressing `Di chuyển trước` repeatedly. It stated **no
capacity**, so nothing on screen said twenty was the limit. And it disabled the
**entire editor** for a published product, which `APP12-M01.B2` had already made
wrong — the contract now accepts exactly one write there.

A1 replaces that with the approved grid and narrows that lock. Twenty images are
four to five columns at 1440 and 1024 and two columns at 390; the primary is
position 0 and is *chosen*, not shuffled into place; `n/20` is on screen and the
cap is enforced in the section **and** in the picker, so a duplicate and an
over-capacity set are unreachable from a single session rather than refused
after a round trip. A published product now renders its media editor with the
commercial fields locked and badged `Chỉ đọc`, and saves through
`adminProductMedia_replace` — **never** through the DRAFT-only patch — without
leaving `PUBLISHED` at any point.

```text
NEW HTTP OPERATIONS   0
NEW ROUTES            0
NEW MIGRATIONS        0
NEW DB TABLES/COLUMNS 0

OpenAPI paths       127 (unchanged)
OpenAPI operations  140 (unchanged)
OpenAPI schemas     279 (unchanged)
public operations    49 (unchanged)
migrations           39 (unchanged — no 0040)
DB tables            79 (unchanged)
Admin routes         26 (unchanged)
Storefront routes    20 (unchanged)
```

**Four defects only a real browser found**, each fixed in this package and each
recorded below rather than quietly repaired: an unclickable picker confirm
button (§Q.1), a disabled control with no reason at 1440 (§Q.2), a conflict
dialog speaking about fields on a screen that edits none (§Q.3), and — the one
that mattered — the whole 1024 media grid collapsing into a **191 px, one-column**
strip, which is the exact anti-pattern this package exists to remove (§Q.4).

---

## B. D1 / D1-C1 PO approval reconciliation

The Product Owner's approval was recorded in the canonical registry before any
runtime file was written.

| | |
|---|---|
| Rows updated | **25** — 18 `APP12-M01.D1` + 7 `APP12-M01.D1-C1` |
| Status | `REVIEW_REQUIRED` → `APPROVED_FOR_IMPLEMENTATION` |
| Approval evidence | `FIG-APPROVAL-APP12-M01-D1-PO-001` on every one of the 25 |
| Unrelated rows edited | **0** |
| New approval ids invented | **0** |
| New Figma work | **0** — no frame created, modified, or reopened |

Both scoped registry notes were rewritten to record the ruling in the index
itself, so a reader of `FIGMA_DESIGN_INDEX.md` sees what happened without
opening this report. `node tools/check-figma-design-index.mjs` passes: 578
registry IDs, 578 node rows, 26 registry tables.

The registry ids the implementation was built against:

```text
934:187  934:202  934:231  935:255  935:398  936:187      Admin desktop
938:187  938:255  940:187  941:187                        picker · refusals · 1024
946:187  946:248  948:311  948:355  949:187  949:238      Admin mobile 390
950:187  945:187                                          handoff · accessibility
```

---

## C. Runtime preflight

Read at source before any change, not recalled:

- `product-edit-form.tsx:98` — `const editable = product.status === DRAFT`, the
  whole-form lock D1 §X.3 and D1-C1 §P.3 both left open as A1's to narrow.
- `product-detail-screen.tsx` — a **stronger** block than the design assumed:
  a non-DRAFT product never reached the form at all. It rendered the
  "Sản phẩm không thể chỉnh sửa" panel, so there was nothing to unlock; the
  screen had to learn a third branch.
- `product-media-editor.tsx` / `product-media-row.tsx` — the row list, its three
  text buttons and its media-type caption.
- `product-asset-picker-dialog.tsx` — already multi-select with a selection
  count, as D1 §C.3 gap 8 recorded. Amended, not replaced.
- `packages/api-client/src/catalog.ts` — **`adminProductMediaReplace` was not
  exported.** `APP12-M01.B2` generated the operation and left it off the curated
  boundary, so no screen could have called it. §E records the one-line addition.
- `packages/contracts/openapi/openapi.generated.json` —
  `ReplaceProductMediaBody.mediaAssetIds.maxItems = 20`, which is the only
  published form of the cap (§I).

---

## D. DRAFT write-path decision

**The atomic path was kept.** `adminProduct_update` already carries
`mediaAssetIds` as one of the fields it diffs, so the media grid feeds the same
form state every other field does and `Lưu thay đổi` commits all of it in one
request.

Routing DRAFT media through `adminProductMedia_replace` was rejected: it would
split one operator action into two independent HTTP writes and make a
half-saved product reachable — a title saved with the old gallery, or the
reverse — which §3 of the package forbids.

There is **one** ordering and primary model. `ProductMediaEditor` is the same
component in both modes and always reports a `readonly string[]`; what differs
is only which save path receives it. Proved live: journey A's staged reorder,
set-primary and removal produce exactly one `PATCH` and **zero**
`PUT …/media` calls (§P).

---

## E. PUBLISHED media-only authority

```text
PUT /api/admin/products/{productId}/media    adminProductMedia_replace
body: { expectedUpdatedAt, mediaAssetIds }   — and nothing else
```

`ProductPublishedMediaForm` is a **separate component** from the draft form, and
the reason is the contract rather than the styling: the draft form sends a
diffed PATCH of any generic field, which `PRODUCT_EDITABLE_STATES` still refuses
for a published product, while this one can express nothing but the ordered
image selection. Conflating them would have made the wrong request reachable
from the right button.

The boundary export B2 omitted was added, with the reasoning at the point of
use:

```ts
export { adminProductMediaReplace } from './generated/embroidery-api';
export type { ReplaceProductMediaBody } from './generated/embroidery-api.schemas';
```

`adminProductArchive` remains withheld; the boundary test that guards it still
passes.

After a successful save the component reconciles from the authoritative
response — which clears the dirty state, moves `expectedUpdatedAt` forward and
proves the product is still `PUBLISHED`, all three from one payload. There is no
`window.location.reload()` anywhere in the feature.

---

## F. The Admin media grid

| | 1440 | 1024 | 390 |
|---|---|---|---|
| Grid width (measured) | ≈ 632 px | **535 px** | **277 px** |
| Columns (measured) | **4** | **3** | **2** |
| Tile actions | in-tile bar, hover **and** focus-within | same | **absent** — see §L |
| 20 images | 5 rows of 4 | 7 rows of 3 | 10 rows of 2 |

The grid fills with more columns of the same 140 px-floor tile rather than a
larger tile — `repeat(auto-fill, minmax(140px, 1fr))` above the grid breakpoint,
exactly two columns below it — so one rule serves every width.

The column count is deliberately **not** pinned to the frame widths, and §Q.4 is
why that is a property rather than a convenience: the approved frames measure a
*section*, while the runtime measures a **form column** whose width depends on
the Admin nav and the metadata rail beside it. Hard-coding "five columns of
152 px" would have overflowed; reading the container gives 4 / 3 / 2 columns at
1440 / 1024 / 390. Every number in the table above was measured in the browser
(§U), never derived.

Each tile carries its picture (a real `adminAsset_preview` derivative), its
position, its role label and — on position 1 — the `Ảnh đại diện` badge. **No
Asset UUID is rendered anywhere**, asserted in both the jsdom suite and the live
run. Identity is what `APP2-B01` publishes and nothing invented.

The tile is not one button. Selecting it and acting on it are different intents,
so the image is a real `<button>` (never a clickable `<div>`) and the four
actions are their own buttons beside it.

---

## G. Primary / set-primary semantics

- Canonical primary **is** array position 0. No `isPrimary`, no checkbox, no
  boolean field — none was added and none exists.
- Every non-primary tile offers `Đặt làm ảnh đại diện`; the primary tile offers
  **no such action at all** — absent, not disabled with a tooltip.
- `[A,B,C,D]` with `C` chosen becomes `[C,A,B,D]`: the previous primary is
  pushed to position 1 and the relative order of everything else is untouched.
  Unit-proved and live-proved.
- Primary state is a badge on the image **and** an accent label beneath it — two
  signals, neither colour-only.

---

## H. Reorder / remove semantics

**Option B, enforced.** `canMoveEarlier` and `canMoveLater` compose two rules:
the universal end rule, and the anchor. The primary offers neither arrow, and
**position 2 may not move earlier** — moving into position 0 would rewrite the
product's canonical thumbnail, its `og:image` and every non-detail storefront
surface from one arrow press. Demotion is only through the explicit action that
exists for it. Live-asserted at §S.

Removal:

| Case | Behaviour | Proved |
|---|---|---|
| non-primary | removed, no confirmation | jsdom + live A |
| primary with others present | `alertdialog` "Gỡ ảnh đại diện?", then position 2 is promoted | jsdom |
| last image on DRAFT | allowed; the panel returns to the empty state | jsdom + live |
| last image on PUBLISHED | **blocked before any request**, with the reason on screen | jsdom + live B2 |

Nothing auto-unpublishes. Every action is staged; one save commits.

---

## I. Capacity and the picker

`MAX_PRODUCT_MEDIA_ITEMS = 20` lives in exactly one frontend module,
`model/product-media-capacity.ts`, and **nowhere else** — no component writes the
literal. It exists at all because `maxItems` survives Orval generation only as a
JSDoc annotation above a plain `string[]`, so there is no runtime value to read.
It is pinned by a parity test that opens
`packages/contracts/openapi/openapi.generated.json` and compares against
`ReplaceProductMediaBody.mediaAssetIds.maxItems`, so a backend change to the cap
is a failing test rather than a screen that lies. **No API operation was added
to publish the number.**

The picker gained capacity and nothing else — the multi-select session `437:73`
approved is the same session:

| Requirement | Treatment |
|---|---|
| already associated | `Đã thêm` badge, dimmed, **no checkbox at all** |
| remaining capacity | `Còn n chỗ` beside the title; `Đã chọn x · còn y chỗ` in the footer |
| would exceed 20 | every unattached option `aria-disabled`, `Đã đủ 20 ảnh` on its state line |
| at 20/20 | confirm disabled, and a notice explaining why |
| unchecking at 20/20 | still allowed — locking the operator out of correcting their own selection would be a worse trap than the one being prevented |

Consequence, and it is deliberate: `PRODUCT_MEDIA_DUPLICATE` and the
over-capacity refusal become unreachable from a single session. Both are still
mapped, because two tabs can race.

---

## J. 1440

Four to five columns inside the form column; twenty images occupy one grid
region rather than 3 120 px of stacked cards. The in-tile action bar appears on
hover **and** on `focus-within`, so nothing is keyboard-invisible while a tile
at rest still shows only its picture, position and role. Evidence:
`evidences/m01-a1/desktop/`.

## K. 1024

The same grid rule over the width the runtime actually has: **535 px**, three
columns, twenty images in seven rows. The in-tile action bar stays inside the
tile at 32 px targets, and the page is ≈ 3 160 px tall against the ≈ 6 030 px the
first implementation produced (§Q.4).

The live run **measures** the grid width and column count here and requires at
least two columns, so the regression cannot come back silently. No horizontal
document overflow; every image loaded after the scroll an operator makes.
Evidence: `evidences/m01-a1/tablet/`.

## L. 390

Two columns, and the actions **leave the tile**. This is the substance of
`APP12-M01.D1-C1` §I and it is implemented as two components, not one
responsive one: four 44 px targets need 176 px and the approved tile is 157 px,
so the in-tile bar is `display: none` below the grid breakpoint — absent from
the layout *and* from the accessibility tree, so the two treatments never both
answer for the same image.

Selecting a tile reveals **one** action bar for **that** image, sticky at the
bottom of the section: `Đại diện` · `Trước` · `Sau` · `Gỡ`, each a glyph plus a
visible text label, each with an accessible name carrying the position. Sticky
rather than fixed, so it can never sit on top of the page's save action or the
metadata rail; the live run asserts it stays inside the 390 viewport and below
the tile it acts on.

No 20 full-width rows. No horizontal document overflow — asserted at every 390
state in the run, including with the picker sheet open.

---

## M. PUBLISHED responsive state

At both 1440 and 390: a calm banner (`Sản phẩm đang xuất bản` / *"Thông tin,
danh mục và giá đã khoá. Bạn vẫn có thể cập nhật ảnh sản phẩm."*), the two
commercial groups on the secondary ground with a `Chỉ đọc` badge, and the media
card white with an accent border and the one primary-weight button on the page.
The header action reads `Lưu ảnh sản phẩm`, and the status card says what a
published product's card should say instead of the draft sentence.

The lock is programmatic, not painted: the groups are `<fieldset disabled>`, and
the live run asserts `toBeDisabled()` on name, description, category and price.

The page does **not** read as dead, which is the point — most of it still works.

---

## N. i18n and error mapping

Every new human-facing string lives in
`packages/i18n/messages/vi/admin.json`. Nothing is hard-coded in TS/TSX; the
strengthened `APP12-V02-C1` gate passes with **zero** exemptions in scanned
source.

```text
productForm.media              32 keys   (grid, capacity, actions, announcements)
productForm.picker             20 keys   (+ remaining, footerCount, alreadyAdded, full)
productForm.published          11 keys   (banner, badges, save, status note)
productForm.mediaRemovePrimary  4 keys
productMediaFailure             7 keys   (the five B2 refusals + not-editable + generic)
```

Three keys were **removed** because nothing renders them any more —
`media.listLabel`, `picker.confirm`, `picker.selectionCount` — which the
message-key gate correctly flagged as orphans; the grid, the counted confirm
label and the capacity-bearing footer replaced them.

The five refusals map exactly as `APP12-M01.D1` §Q approved. The mapping reads
the **domain code and never the status**: `409` alone covers a version conflict,
a lifecycle refusal, an unavailable Asset and an unpublishable set, and those
four need four different next steps. An unrecognised code falls to `generic`,
which claims nothing. **No raw backend code or server sentence is ever
rendered** — asserted in jsdom and again live in journey E.

`PRODUCT_VERSION_CONFLICT` behaviour, chosen and stated: the reload dialog opens
and **the staged selection is preserved**. Nothing was written — B2 refuses
whole — so discarding the operator's arrangement to report someone else's would
be destroying work. Reload is offered, never taken; taking it remounts the form
against the fresh record, which is the one moment the staged order is
deliberately dropped.

---

## O. Dirty state and concurrency

- DRAFT dirty = `isFormDirty`, the same diff the request is built from, so the
  screen can never warn about changes it would not send.
- PUBLISHED dirty = `hasSelectionChanged` against the authoritative selection,
  which is why the save button does not exist until the media actually changed.
- **No request per tile action.** Reorder, set-primary, removal and picker
  confirmation all mutate local state; one save commits the final array. Live
  journeys A and B both assert the request count is exactly one.
- The token sent is always the one the current authoritative response carried:
  the parent remounts the form on `updatedAt`.
- The existing unsaved-navigation guard is reused. No second unsaved-changes
  system was invented.

---

## P. Live DRAFT journey (A)

Real Chromium, real Admin behind the real Nginx gateway, real API, disposable
PostgreSQL, real WebP derivatives, operator logged in through the real form.

```text
open DRAFT (8 images, 8/20)      → 8 tiles, every image actually loaded
open picker                       → already-added options badged, no checkbox
select 2                          → "Dùng 2 ảnh đã chọn", 10/20
move image 5 earlier              → staged
set image 3 primary               → staged
remove image 7 (non-primary)      → no confirmation, 9 tiles
save (Lưu thay đổi)               → exactly one PATCH, zero PUT …/media
reload                            → 9/20, order identical to what was staged,
                                    position 1 badged + labelled primary
```

The reload assertion compares the **rendered preview URLs**, so it is an
assertion about what the operator is looking at rather than about a data
attribute a component could set independently of the picture beside it.

---

## Q. Live PUBLISHED journey (B, B2) — and the three defects it found

```text
open PUBLISHED (3 images)
  name / description / category / price   → all toBeDisabled()
  "Chỉ đọc" badge                          → present
  Thêm ảnh, set-primary, remove             → all enabled
set image 3 primary, then move it earlier
save (Lưu ảnh sản phẩm)
  → PUT /api/admin/products/{id}/media      observed on the wire
  → body keys exactly [expectedUpdatedAt, mediaAssetIds]
  → PATCH /api/admin/products/{id}          never issued
reload
  → order identical to what was staged; still PUBLISHED; badge "Đã xuất bản"
```

`B2` — the single-image published product: `Gỡ` disabled, and the minimum stated
on screen.

### Q.1 The picker's confirm button was unclickable

`Dùng 2 ảnh đã chọn` resolved, was visible, enabled and stable — and every click
was intercepted by a `.product-picker__meta` span from the dialog body. The
panel scrolled as a whole, so with a real asset library (24 options) the body
overflowed **over** the footer. Every previous test used one to three assets, so
nothing had ever exposed it.

Fixed by making the dialog a genuine three-row layout: the body scrolls, the
title and footer are fixed rows. That is also what the approved picker draws
(`938:187`, and the sticky footer of the 390 sheet `949:187`).

### Q.2 A disabled control with no reason at 1440

`APP12-M01.D1` §H.2 requires the sole image of a published product to explain
itself. The first implementation put that sentence in the mobile action bar
only — so at 1440 the operator saw a greyed `✕` and nothing else, and at 390 they
saw it only after selecting the one tile that cannot be removed.

Moved to section level, where it is visible at every viewport, and removed from
the bar so the sentence exists once.

### Q.4 The 1024 grid was a 191 px one-column strip

The most consequential of the four, and invisible to every other check: jsdom
applies no media queries, the 1440 evidence was a healthy four-column grid, and
the 390 evidence was a healthy two-column grid. Only the 1024 screenshot showed
twenty **full-width** tiles down a ≈ 6 030 px page — the one shape §14 and §27.4
of the package explicitly forbid.

The first diagnosis was wrong, and the correction is the point. The tile floor
looked like the culprit, so it was lowered from 140 px to 120 px — and the run
still measured **one** column. Measuring the grid instead of the viewport gave
the real number: the media grid was **191 px wide**. No tile size large enough to
show a product photograph could ever have fitted two columns in it.

The cause was the page, not the grid. `.product-form__body` put the 320 px
read-only metadata rail beside the form from `$form-breakpoint` (1024) upward,
where the Admin's 264 px nav and the 48 px page padding leave ≈ 649 px of
content — so the form column ended up **narrower than the read-only rail next to
it**. One number was answering two different questions.

The fix gives the rail its own threshold, `$form-rail-breakpoint: 1280px`. Below
it the rail stacks under the form, which is ordinary responsive behaviour for
read-only metadata, and the media grid gets the content width. Group padding,
the wide/narrow subtitle and the mobile help text still switch at
`$form-breakpoint`, because those are questions about type and spacing rather
than about whether two columns fit.

```text
before   grid 191 px · 1 column  · page ≈ 6 030 px
after    grid 535 px · 3 columns · page ≈ 3 160 px
```

The tile floor went back to 140 px, since it was never the problem.

### Q.3 The conflict dialog talked about fields

The shared `ProductConflictDialog` carried `APP2`'s wording — *"Dữ liệu trên máy
chủ đã thay đổi kể từ lần bạn mở sản phẩm này"* — on a screen that edits no
field. `APP12-M01.D1` §Q approved different words for exactly this case. The
dialog now takes an optional title/body and the media form passes the approved
pair; the mechanism is shared, only the words differ.

---

## R. Live 20/20 cap journey (C)

```text
open DRAFT (20 images)   → 20/20 accent, capacity notice, "Thêm ảnh" disabled,
                           every one of the twenty images actually loaded
remove one               → 19/20, add re-enabled
open picker              → "Còn 1 chỗ"
check one option         → full notice appears
second option            → aria-disabled, and a forced click does not check it
cancel + reload          → still 20 images: nothing was persisted
```

---

## S. Conflict and revoked-Asset journeys (D, E)

**D — two real tabs, one product.** Tab A saves; tab B then submits the token it
has held all along.

```text
tab B  → conflict dialog "Sản phẩm vừa được người khác cập nhật"
       → reload offered; no force-save exists (two buttons: close, reload)
       → staged selection still on screen after dismissing
server → still holds tab A's write, byte for byte
```

**E — an Asset dies between staging and saving.** The Asset is flipped to
`REJECTED` directly in the run's disposable database, because no application
path produces that on demand, and it belongs to that Product and to no other, so
the interference cannot reach another journey.

```text
save   → refused whole
screen → "Một ảnh chưa sẵn sàng" + the approved actionable detail
       → the string PRODUCT_MEDIA_ASSET_UNAVAILABLE appears nowhere
       → the staged arrangement is still the operator's
server → previous media intact; product still PUBLISHED
```

---

## T. Accessibility (F)

`axe-core`, WCAG 2.2 AA tag set, on four surfaces: the 20-image DRAFT editor,
the PUBLISHED editor, the asset picker, and the 390 selected-image action bar.

```text
serious/critical violations = 0 on every surface
```

`color-contrast` is excluded from the **gate** and from nothing else, for the
reason `APP12-H08` recorded: the failing token pairs are named by the Product
Owner's own `PO-APP12-004` ruling and are `APP12-V02`'s to change. No rule was
disabled to reach a number.

Keyboard, proved live: `Di chuyển trước` is reachable and focusable, `Enter`
operates it, and the polite live region then reads *"Đã chuyển ảnh tới vị trí 2
trên n."* — a reorder changes nothing in a tile's own text, so without that the
operator perceives no result. The anchor rule is programmatic: both arrows on
the primary are `disabled` and its set-primary action is absent from the DOM.

Also asserted: `aria-pressed` on tile selection (never colour alone), position
in every action's accessible name, `aria-disabled` on blocked picker options,
`role="group"` with a position-bearing label on the mobile bar.

---

## U. Visual evidence

`evidences/m01-a1/`, deterministic names, written by the run itself.

```text
desktop/  draft-8-images · draft-20-images-cap · published-media-editable
          picker-remaining-capacity · media-full-cap-state · picker-full-cap-state
tablet/   draft-20-images · published-media-editable
mobile/   draft-empty · draft-several-images · draft-20-images-cap
          published-media-editable · picker-sheet · selected-image-action-bar
```

Measured in the browser, not estimated:

```text
1024 · grid width / columns              535 px / 3   (asserted >= 2 — see §Q.4)
1024 · horizontal document overflow      0 px
390  · grid width / columns              277 px / 2   (asserted == 2)
390  · horizontal document overflow      0 px  (every state, picker sheet included)
mobile action bar                        inside the 390 viewport, below its tile
20-image states                          every image `complete && naturalWidth > 0`
```

The grid width is printed by the run itself (`[m01a1] 1024 grid: …`) rather than
only asserted, because the column count means nothing without the width that
produced it — which is exactly the reasoning §Q.4 arrived at the hard way.

The last line is the one that makes the density claim real: the fixture writes
real WebP derivatives, so twenty tiles are twenty photographs rather than twenty
neutral blocks. It also surfaced honest behaviour worth recording — the tiles
carry `loading="lazy"`, so at 1024 more rows fall below the fold and the
assertion has to reproduce the operator's scroll rather than assume it away.

---

## V. API / DB baseline

| | Before | After |
|---|---|---|
| OpenAPI paths | 127 | **127** |
| OpenAPI operations | 140 | **140** |
| OpenAPI schemas | 279 | **279** |
| public operations | 49 | **49** |
| migrations | 39 | **39** (no `0040`) |
| DB tables | 79 | **79** |
| Admin routes | 26 | **26** |
| Storefront routes | 20 | **20** |

`pnpm --filter @embroidery/api openapi:check` → artifact up to date.
`pnpm --filter @embroidery/api-client check:generated` → generated client up to
date. Neither the contract nor the generated tree changed; the only api-client
edit is the curated **boundary re-export** of an operation B2 had already
generated.

No drag-and-drop. No per-SKU imagery. No order image snapshots. No inline
upload — image upload remains in the Assets application.

---

## W. Files changed

**New — Admin runtime (11)**

```text
components/product-media-grid.tsx              components/product-media-grid-tile.tsx
components/product-media-tile-actions.tsx      components/product-media-action-bar.tsx
components/product-media-remove-dialog.tsx     components/product-published-media-form.tsx
model/product-media-capacity.ts                model/product-media-copy.ts
model/product-media-failure.ts                 services/product-media.service.ts
hooks/use-product-media-mutation.ts
```

**New — styles (1)** `styles/_product-media-actionbar.scss`

**Modified — Admin runtime (8)** `product-media-editor.tsx` (rewritten around
the grid), `product-asset-picker-dialog.tsx` (capacity), `product-edit-form.tsx`
(DRAFT-only, learned-identity plumbing removed), `product-detail-screen.tsx`
(the PUBLISHED branch), `product-form-fields.tsx` (`locked`),
`product-metadata-rail.tsx` (`statusNote`), `product-confirm-dialogs.tsx`
(optional conflict copy), `model/product-media-selection.ts` (anchor,
set-primary, position-based removal), `model/product-form-copy.ts` (media/picker
moved out).

**Deleted (1)** `components/product-media-row.tsx` — the row list the grid
replaces.

**Modified — styles (6)** `_product-form-media.scss` (rewritten),
`_product-form-dialog.scss` (§Q.1 + picker capacity), `_product-form-shell.scss`
(PUBLISHED banner, locked groups, the rail breakpoint §Q.4),
`_product-form-rail.scss` (§Q.4), `_product-form-tokens.scss` (grid geometry and
`$form-rail-breakpoint`), `product-form.scss` (one `@use`).

**Contract boundary (1)** `packages/api-client/src/catalog.ts`.

**Copy (1)** `packages/i18n/messages/vi/admin.json`.

**Tests — new (4)** `product-media-grid.test.tsx` (27),
`product-media-picker.test.tsx` (18), `product-published-media.test.tsx` (15),
`product-media-model.test.ts` (16). **Deleted (1)** `product-media.test.tsx`.
**Modified (2)** `product-create.test.tsx`, `product-edit.test.tsx` — the latter
asserted the behaviour A1 deliberately changes, and now asserts ARCHIVED, which
is what still reaches the read-only panel.

**E2E — new (3)** `specs/app12/m01a1-media.acceptance.spec.ts`,
`specs/app12/support/m01a1-world.ts`,
`support/app12/m01a1-media-fixture.mjs`. **Modified (3)** `run-e2e.mjs`,
`playwright.config.ts`, `package.json`.

**Docs (3)** `FIGMA_DESIGN_INDEX.md` (25 rows + 2 notes),
`SCOPED_COMMAND_INDEX.md` (`CMD-E2E-APP12-M01A1`), the APP12 phase plan, plus
this report.

---

## X. File size

`node tools/check-file-size.mjs --paths …` over everything this package owns:
**passed**, and every new or modified file is under both the hard limit and the
review threshold.

```text
largest source   product-media-editor.tsx            237
                 product-published-media-form.tsx    223
                 product-media-copy.ts               213
largest stylesheet _product-form-media.scss          290
                   _product-form-dialog.scss         300
largest test     product-media-grid.test.tsx         < 600
```

Two splits were made by responsibility rather than by line count: the mobile
action bar left `_product-form-media.scss` because it is a different component
(D1-C1 §P says so explicitly), and the media copy left `product-form-copy.ts`
because the media region is now its own screen region rather than one group of
fields.

The only files above a review threshold in the scoped run are
`product-publication.scss` (395) — pre-existing debt this package did not touch.

---

## Y. Validation

Scoped to what this change justifies
(`docs/implementation/VALIDATION_GOVERNANCE.md` §3). No repository-wide
aggregate was run.

| Control | Command | Result |
|---|---|---|
| Admin typecheck | `pnpm --filter @embroidery/admin typecheck` | pass |
| Admin lint | `pnpm --filter @embroidery/admin lint` | pass |
| Admin tests | `pnpm --filter @embroidery/admin test` | **1984 passed / 137 suites** |
| api-client typecheck + tests | `pnpm --filter @embroidery/api-client typecheck` · `test` | pass · 53 passed |
| E2E typecheck + lint | `pnpm --filter @embroidery/e2e-testing typecheck` · `lint` | pass |
| i18n static text | `node tools/check-i18n-static-text.mjs` | **pass — 0 exemptions** |
| i18n message keys | `node tools/check-i18n-message-keys.mjs` | pass — no orphans |
| OpenAPI drift | `pnpm --filter @embroidery/api openapi:check` | pass — artifact up to date |
| Generated client drift | `pnpm --filter @embroidery/api-client check:generated` | pass |
| Figma registry | `node tools/check-figma-design-index.mjs` | pass — 578 IDs |
| File size (scoped) | `node tools/check-file-size.mjs --paths …` | pass |
| SCSS file size | `node tools/check-scss-file-size.mjs …` | pass |
| Report secrets | `node tools/check-report-secrets.mjs` | pass |
| Whitespace | `git diff --check` | clean |
| Format | `npx prettier --check` on every changed file | pass |
| Admin production build | `pnpm --filter @embroidery/admin build` | compiled — 26 routes |
| **Live journeys A–F, V** | `pnpm --filter @embroidery/e2e-testing e2e:app12:m01a1` (run `--headed`) | **8/8 passed** |
| axe serious/critical | inside journey F, four surfaces | **0** |
| 390 horizontal overflow | inside journeys F and V | **0 px** |

The Playwright run was executed **headed**, visibly, so the Product Owner could
watch the operator journeys happen rather than read that they had. The
`:headed` script and the `--headed` flag are both indexed.

No broad unrelated APP12 regression suite was run.

---

## Z. Hygiene

```text
shared_dev_mutations   = 0     the fixture refuses any database not embroidery_db7_*
G03_data_created       = false
production_deployed    = false
pushed                 = false
new migration          = none
new HTTP operation     = none
new route              = none
Figma writes           = none  (registry status only)
disposable teardown    = verified — "all E2E ports closed, disposable database dropped"
```

No credential was read, requested, echoed, written or rotated. `.env` was not
touched. The Admin password travels the child process environment only, never a
command-line argument and never a log line.

One interrupted run left two containers and a network behind; both were removed
by hand and the absence verified before the next run. Every completed run
reported `cleanup verified`.

---

## AA. `APP12-M01` internal roadmap

```text
APP12-M01.A     = COMPLETE — PO PASS
APP12-M01.B1    = COMPLETE — PO PASS
APP12-M01.DB1   = COMPLETE — PO PASS
APP12-M01.B2    = COMPLETE — PO PASS
APP12-M01.D1    = COMPLETE_AFTER_C1 — PO APPROVED
APP12-M01.D1-C1 = COMPLETE — PO PASS
APP12-M01.A1    = COMPLETE

FIGMA_APPROVAL  = FIG-APPROVAL-APP12-M01-D1-PO-001 (25 rows)

APP12-M01 = IMPLEMENTATION_IN_PROGRESS

INTERNAL_NEXT   = M01.S1
APP12-M01.S1    = NOT_AUTHORIZED
APP12-M01.E1    = NOT_AUTHORIZED
APP12-G03       = NOT_AUTHORIZED
ROADMAP_CHECKPOINTS = 39
```

### Limitations carried forward

1. **No per-image availability on the public read** — still open from D1 §X.2. A
   contract change, not a design or UI change.
2. **1024 is three columns, not the five `941:187` draws, and the rail moved.**
   The frame assumes an 896 px section; the runtime content area at 1024 is
   ≈ 649 px. Three columns is what fits at a legible tile size. Reaching five
   would mean a wider Admin content area, which is a shell change and outside
   this package. The rail now stacks below 1280 px (§Q.4) — a Product-form
   layout change this package made deliberately, scoped to `.product-form__body`
   and `.product-rail`, and it affects every Product form screen at 1024–1279,
   not only the media section. Recorded here rather than buried in a stylesheet.
3. **`FU-APP12-H05-03` is untouched.** The Storefront thumbnail strip still
   requests the `catalog-preview` rendition (6.63 MB at twenty images against
   1.76 MB for thumbnails). That is a Storefront read defect and belongs to
   `M01.S1`, which owns Product Detail.

### Not executed

`M01.S1` was not executed. `M01.E1` was not executed. Storefront Product Detail
was not modified — no Storefront file was changed at all. Migration `0040` was
not added. No HTTP operation was added. Drag-and-drop was not added. Per-SKU
imagery was not added. Order image snapshots were not added. Inline upload was
not added. `G03` data was not created. Nothing was deployed. **Nothing was
pushed.**

---

**`APP12-M01.A1` = COMPLETE**
**`APP12-M01` = IMPLEMENTATION_IN_PROGRESS**
**`INTERNAL_NEXT` = `M01.S1` — NOT_AUTHORIZED**
