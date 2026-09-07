# APP12-M01.D1 — Product Multi-Image Gallery · Bounded Figma Amendment

**Internal design package inside `APP12-M01`. Not a new APP12 checkpoint id.**

| | |
|---|---|
| Package | `APP12-M01.D1` |
| Type | Design only — Figma + registry + this report |
| Figma file | `BQwqV8GdfUIELvsQDB1UQE` (`FIG-FILE-PRODUCT`, Write) |
| Figma page | `APP_12` — write target `896:3` |
| Section created | `933:187` — *11 — M01.D1 · Product multi-image gallery* |
| Frames created | 18 |
| Runtime / DB / OpenAPI / client / migration changes | **0** |
| Repository files changed | 2 (`docs/design/FIGMA_DESIGN_INDEX.md`, this report) |

---

## A. Verdict

`APP12-M01.D1` is **COMPLETE — awaiting Product Owner review**.

Eighteen frames were created on page `APP_12` under a new section `933:187`. They amend
the Admin Product media section and the Storefront Product Detail gallery against the
contract `APP12-M01.B2` actually delivered, not against hypothetical behaviour. Every
registry row is `REVIEW_REQUIRED` with an empty approval-evidence column. No approval id
was invented and no existing approval was altered.

One deviation from the package brief is recorded and was not resolved silently — see
**§S.1**: the literal status token `READY_FOR_PO_REVIEW` does not exist in this
repository's enforced vocabulary.

---

## B. `B2` PO reconciliation

The design was drawn against the delivered contract, re-read at source before drawing:

| Delivered by B2 | How the design honours it |
|---|---|
| `PUT /api/admin/products/{productId}/media` · `adminProductMedia_replace` | One save action (`Lưu thay đổi` / `Lưu ảnh sản phẩm`) sends the whole ordered array. No screen implies a per-image request. |
| `mediaAssetIds[0]` = stored primary | Position 1 in the grid *is* the primary; the badge is on the first tile and nowhere else. There is no independent primary checkbox. |
| array order = display order | Every tile carries a visible position number; the grid reads left-to-right, top-to-bottom. |
| omission = removal | `Gỡ ảnh` removes the tile from the local set; nothing is persisted until save. |
| max items = 20 | `n/20` in the section header, capacity notice at 20, `Thêm ảnh` disabled, and the picker blocks selection past the remaining capacity. |
| curation allowed for `DRAFT` **and** `PUBLISHED` | A dedicated PUBLISHED frame (`936:187`) in which only the media group is live. |
| other commercial fields locked while PUBLISHED | The two core groups take a grey ground, muted labels and a `🔒 Chỉ đọc` badge. |
| Product stays PUBLISHED while media is curated | Copy says so explicitly: *"Thay đổi ảnh không làm sản phẩm ngừng xuất bản."* |
| invalid media set refused atomically | Five refusal treatments (`940:187`), each stating that the set was **not** saved. |
| no separate add / remove / reorder / set-primary endpoints | Every tile action mutates local state only; the design never suggests an action commits on its own. |

**One deliberate design consequence of B2's shape.** Because the whole array is replaced in
one request, the UI can and does prevent most refusals before the request is built —
duplicates and over-capacity are unreachable from the picker. The five refusal treatments
therefore exist as a safety net for races (two tabs, an asset deleted mid-session), not as
the normal path. That is stated on the frame itself.

---

## C. Live / Figma preflight

Performed before any Figma edit. Nothing here was recalled from memory.

### C.1 Current Figma nodes re-opened

| Node | Name | Status at preflight |
|---|---|---|
| `434:20` | APP2-D01 / Admin / Product / Edit-Detail / Desktop / Default | `APPROVED_FOR_IMPLEMENTATION` (`FIG-APPROVAL-APP2-A03-G01-PRODUCT-FORM-001`) |
| `437:73` | APP2-D01 / Admin / Product / Media Select / Desktop | `APPROVED_FOR_IMPLEMENTATION` (same approval) |
| `902:4` | APP12-S01 / Product Detail / Desktop 1440 / Purchase — IN STOCK | `APPROVED_FOR_IMPLEMENTATION` (`FIG-APPROVAL-APP12-D01-PO-001`) |
| `905:67` | APP12-S01 / Product Detail / Tablet 1024 | same |
| `905:187` | APP12-S01 / Product Detail / Mobile 390 | same |

`APP12-V01` and `APP12-V02` produced **no** Figma rows, so `APP12-D01` remains the sole
Product Detail authority; all twenty-one existing APP12 registry rows are owned by
`APP12-D01`.

### C.2 Real current runtime inspected

The dev stack was up and was queried directly (gateway `embroidery.local`, hostname-routed):

- `GET /api/public/products?limit=5` → 200. `ao-thun-cotton` publishes **no** `thumbnail` at
  all — the single-image condition `M01.A` called a *data* state, still true today.
- `GET /api/public/products/tui-vai-theu-thu-cong` → `media[]` is an ordered array whose
  entries carry `url` (CATALOG_PREVIEW), `role`, `width`, `height`, `thumbnailUrl`,
  `thumbnailWidth`, `thumbnailHeight`. This is `M01.B1` delivered, and it is what §22 of the
  brief describes. There is **no** per-image availability field — see §Q.
- Admin required a staff session. Rather than request an operator credential (`CLAUDE.md`
  §8a — presence on disk is not permission), the delivered Admin source was read, which
  states the rendered behaviour exactly:
  - `apps/admin/src/features/products/components/product-media-editor.tsx`
  - `apps/admin/src/features/products/components/product-media-row.tsx`
  - `apps/admin/src/features/products/components/product-edit-form.tsx:98`
  - `packages/i18n/messages/vi/admin.json` → `productForm.media.*`, `productForm.picker.*`
- Storefront gallery source read at
  `apps/storefront/src/features/product-detail/components/detail-thumbnail-strip.tsx` and
  `apps/storefront/src/features/product-detail/styles/_product-detail-gallery.scss`.

### C.3 Design gap, as found

| # | Gap | Evidence |
|---|---|---|
| 1 | Admin renders **one 144 px full-width row per image** with three text buttons under each. At 20 images that is ≈ 3 120 px of stacked cards. | `434:20` → `511:263` / `511:279` / `511:295` |
| 2 | Admin has **no set-primary action at all**. Primary can only be reached by repeatedly pressing `Di chuyển trước`. | `434:20` has only move/remove; `productForm.media.*` has no such key |
| 3 | Admin shows **no capacity**. Nothing on screen says 20 is the cap. | `434:20`, `admin.json` |
| 4 | Runtime **disables the entire editor** when the product is PUBLISHED — `const editable = product.status === AdminProductDetailResponseStatus.DRAFT`. B2 has now made this wrong. | `product-edit-form.tsx:98` |
| 5 | Product Detail draws a **fixed 4-thumb strip** with no selected state and no counter. | `902:4` → `902:52`; `905:79`; `905:199` |
| 6 | The approved frames **under-describe the runtime**: the implemented strip already scrolls (`overflow-x: auto`, `flex: 0 0 auto`), while Figma draws four thumbs at fixed x. At `905:199` the four thumbs total exactly 388 px against a 390 px viewport — a fifth image already overflows the drawn frame. | `_product-detail-gallery.scss:75–90` vs `905:199` |
| 7 | `positionLabel` — *"Ảnh {position} trên {total}"* — **already exists** and is used **only by the lightbox**. The in-page gallery has no counter, visual or non-visual. | `product-detail-copy.ts:86`; `detail-lightbox.tsx:127` |
| 8 | The picker is **already multi-select** with a selection count and `Dùng ảnh đã chọn`. What it lacks is capacity, already-added state and cap enforcement. | `437:73` → `437:208`, `437:209`, `437:213` |

Gap 8 changed the plan: §12 of the brief asked to compare repeated single-select against
multi-select. That comparison is already settled in the approved design, so D1 **kept** the
multi-select session and amended it rather than proposing a new picker.

---

## D. Design authority and scope

**Amended.** Admin Product media section (incl. PUBLISHED state), Admin Media Select
dialog, Storefront Product Detail at 1440 / 1024 / 390, Product Detail lightbox.

**Not touched.** Admin shell and app bar, Product commercial fields (drawn only in their
locked state), Discover, Homepage, Gallery domain, Checkout, secure order, payment UI,
brand system. No new concept family, palette, or font.

**Tokens.** Every colour and type value is read from the approved set already bound on
`902:4`: `#171717`, `#6b7280`, `#9ca3af`, `#e8475f`, `#f5f3ef`, `#faf8f5`, `#ffffff`,
`#e7e5e4`, `#16a34a`; Inter Regular / Semi Bold at the existing Heading L/M/S, Body M/S and
Caption sizes. No value was invented.

---

## E. Admin media information architecture

The section header answers capacity and the primary action in one line:

```
Ảnh sản phẩm        8/20                       [ Thêm ảnh ]
```

Below it, one help line carries the two rules an operator needs:

> Ảnh đầu tiên là ảnh đại diện — ảnh dùng cho danh sách, trang khám phá và liên kết chia sẻ.
> Di chuột hoặc chọn một ảnh để đặt ảnh đại diện, đổi thứ tự hoặc gỡ ảnh.

Each of the eight facts the brief demanded is answerable without scrolling or clicking:

| Fact | Where it is answered |
|---|---|
| how many images | `n/20` pill beside the title |
| which is primary | position-1 tile: `Ảnh đại diện` badge on the image **and** an accent label beneath it |
| display order | a numbered badge on every tile |
| how to add | `Thêm ảnh`, the only primary-weight button in the section |
| how to make another primary | `★ Đặt làm ảnh đại diện` in the tile action bar |
| how to reorder | `←` / `→` in the same bar |
| how to remove | `✕` in the same bar, accent-coloured |
| DRAFT or PUBLISHED | status card in the rail, plus the PUBLISHED banner when it applies |

**No Asset UUID is shown anywhere.** Identity is the media-type label and `{size} · {date}`
the server already publishes, matching the existing runtime.

---

## F. 1 / 8 / 20-image Admin states

A compact grid replaces the vertical card list. Tile 168 px, four columns at 1440,
20 px gutters inside the existing 732 px form column.

| State | Node | Notes |
|---|---|---|
| DRAFT · 0 images | `934:187` | Empty panel, single primary action |
| DRAFT · 1 image | `934:202` | `1/20`; both arrows disabled — one image has nowhere to move |
| Tile states | `934:231` | primary · gallery · selected/focused · unavailable |
| DRAFT · 8 images | `935:255` | `8/20`; tile 4 selected, showing the action bar |
| **DRAFT · 20 images** | `935:398` | `20/20` in accent, `Thêm ảnh` disabled, capacity notice |
| 1024 compact | `941:187` | five columns at 152 px |

**Measured result.** Twenty images occupy **1 100 px** of grid height. The same twenty in
the currently approved row design occupy **≈ 3 120 px**. That number is printed on the frame
so a reviewer does not have to take it on trust.

**Actions are not always visible.** The tile shows only its position and its primary state
at rest. The four-icon bar (`★ ← → ✕`) appears on hover **and** whenever focus is inside the
tile — so the brief's ban on "four equal-weight actions per image always visible" is
honoured without hiding anything from a keyboard operator.

---

## G. Primary interaction

- The primary tile carries a `Ảnh đại diện` badge on the image and an accent text label
  below it. Two independent signals, neither colour-only.
- Non-primary tiles offer `★ Đặt làm ảnh đại diện`. The primary tile does **not** — the
  action is absent, not disabled-with-a-tooltip.
- Intended runtime effect, as specified: the chosen image moves to index 0, the previous
  primary stays in the gallery at index 1, and the relative order of everything else is
  unchanged.
- There is no independent primary checkbox. Primary **is** position 0, and the design never
  implies otherwise.

---

## H. Reorder and remove semantics

### H.1 Reorder — **Option B**, chosen and recorded

> The primary is anchored at position 0. On the primary tile, `Di chuyển trước` *and*
> `Di chuyển sau` are both disabled. Demotion happens only through
> `Đặt làm ảnh đại diện` on another tile.

Option A — *"moving the current primary later makes the new first image primary"* — was
rejected. One arrow press would silently change the product's canonical thumbnail, its
`og:image`, and every non-detail storefront surface. That is a large, invisible consequence
from a small ordering gesture. Option B refuses the gesture and points at the explicit
action that exists precisely for this.

Option B is complete, not a dead end: setting another image as primary pushes the old
primary to position 1, after which it moves freely. The universal rule (first cannot move
earlier, last cannot move later) still applies to every other tile.

The rule is written on the frame in operator language, not left as a disabled control with
no explanation.

### H.2 Remove

| Case | Behaviour |
|---|---|
| non-primary | removed, no confirmation — nothing is persisted until save |
| primary, others remain | confirmation dialog: **"Gỡ ảnh đại diện?"** / *"Ảnh ở vị trí 2 sẽ trở thành ảnh đại diện mới của sản phẩm."* |
| last image, DRAFT | allowed; the panel returns to the empty state |
| last image, PUBLISHED | **prevented in the UI** — `✕` disabled on the sole tile, with *"Sản phẩm đang xuất bản cần ít nhất một ảnh."* |

Only the primary removal confirms, because it is the only tile action that changes what the
product looks like outside this screen.

---

## I. PUBLISHED media-curation state — `936:187`

The screen must not read as disabled, because most of it still works.

- **Locked groups** (`Thông tin cơ bản`, `Danh mục & Giá`) take the secondary ground, muted
  field labels, and a `🔒 Chỉ đọc` badge on the group header.
- **The media group** keeps the white surface, gains a thin accent border, and its
  `Thêm ảnh` button stays at primary weight — the one live region on the page.
- A calm banner sits above both: **"Sản phẩm đang xuất bản"** /
  *"Thông tin, danh mục và giá đã khoá. Bạn vẫn có thể cập nhật ảnh sản phẩm."*
- The header save button reads **`Lưu ảnh sản phẩm`**, not `Lưu thay đổi`, because media is
  the only change a published product can submit.
- Status card copy: *"Sản phẩm đang hiển thị công khai. Ảnh cập nhật sẽ xuất hiện ngay trên
  trang sản phẩm."*

---

## J. Asset picker — `938:187`, `938:255`

Multi-select was **kept**: `437:73` is already a multi-select session. The amendment adds
exactly what the brief requires and nothing else.

| Requirement | Treatment |
|---|---|
| remaining capacity visible | `Còn 12 chỗ` pill beside the dialog title, repeated in the footer as `Đã chọn 2 · còn 10 chỗ` |
| already-associated clearly unavailable | `Đã thêm` badge, image at 55 %, **no checkbox** — it cannot be selected |
| cannot choose beyond remaining capacity | at 20/20 every unattached option is disabled with `Đã đủ 20 ảnh`; the confirm button is disabled; a notice explains why |
| READY distinguishable from unavailable | the picker already lists **only** READY assets — the existing help text says so. Recorded rather than redrawn |
| real thumbnail preview | the runtime already renders real previews through `adminAsset_preview` (`APP12-V02-C2`); tiles are drawn as image boxes, not glyph placeholders in intent |

No new upload pipeline was invented. `Tải thêm tài sản` is the existing pagination control,
and uploading remains where it lives today — the Tài sản hình ảnh screen.

---

## K. Admin responsive design — `941:187`

At 1024 the grid becomes five columns of 152 px inside the 896 px content area. Twenty
images fill four rows. The action bar stays **inside** the tile at 32 px targets.

Explicitly avoided, per the brief: no 20 one-column full-width cards, and no four text
buttons under any image at any width.

**390 was not drawn**, and that is a finding rather than an omission: the approved Admin
Product form has a mobile frame (`438:90`) whose own approved composition merges category,
price and media into a single card, and the runtime carries a distinct `helpNarrow` string
for it. Amending that composition is a larger change than this bounded package authorises.
Recorded as a limitation in §X.

---

## L. Storefront Product Detail gallery

The post-V02 hierarchy is preserved exactly. The purchase panel was **not** redesigned — it
is drawn as a labelled stub referencing `904:40`.

| Element | Treatment |
|---|---|
| large main preview | unchanged geometry: 660×760 at 1440, 560×640 at 1024, 342×380 at 390 |
| initial preview | the primary, index 0 |
| ordered thumbnail strip | 64 px boxes — the size `M01.B1` actually serves (`THUMBNAIL` rendition), and the box the runtime already renders |
| clear selected thumbnail | see §N.4 |
| current/total counter | overlay inside the stage, bottom-right |
| lightbox affordance | the existing `Nhấn vào ảnh để mở chế độ xem lớn` hint, unchanged |

**The composition does not grow.** The counter is an overlay, so it costs zero height; the
strip region is *shorter* than the drawn 88 px strip it replaces. Price, availability and
`Mua ngay` therefore sit no lower than in the approved frames — the constraint in §14 of the
brief is met by subtraction, not by argument.

**Performance-aware (§22).** The stage requests one `CATALOG_PREVIEW`; the strip requests
`THUMBNAIL` renditions; full previews are deferred to the lightbox, which is where the frame
labels put them. Nothing in the design requires twenty full previews before the page is
usable.

---

## M. Counter semantics

- Visual: `3 / 20`, an ink pill at 86 % opacity in the stage's bottom-right corner.
- Non-visual: **"Ảnh 3 trên 20"** — this is `positionLabel`, the string that **already
  exists** and that the lightbox already uses. No new screen-reader key is introduced; the
  in-page counter and the lightbox now speak with one voice.
- Rule: `total > 1` → show. `total = 1` → omit. A one-image product does not need to be told
  it is looking at `1 / 1`.

---

## N. Desktop / tablet / mobile

| Viewport | Node | Strip content vs bound | Scrolls |
|---|---|---|---|
| 1440 · 8 images | `942:187` | 596 px in 660 px | no — fits exactly |
| 1440 · 20 images | `942:237` | 1 508 px in 660 px | yes |
| 1024 · 20 images | `943:187` | 1 508 px in 560 px | yes |
| 390 · 20 images | `943:273` | 1 468 px in 390 px | yes |

**N.1 — 1440.** The strip is bounded to the stage width and scrolls horizontally. The stage
does not grow, no second row appears, and the composition below is pixel-identical between
the 8- and 20-image frames. A right-edge fade signals that more images exist.

**N.2 — 1024.** Same bounding against the 560 px stage. The counter stays inside the stage,
so no thumbnail control competes with `Mua ngay` for attention.

**N.3 — 390.** The strip bleeds to both edges to keep 64 px touch targets while scrolling
horizontally. **No vertical stack.** The V02 title / price / CTA hierarchy is untouched.
**No auto-advancing carousel** anywhere.

**N.4 — selected state (`944:200`).** Three simultaneous signals, drawn for first, middle and
last selection:

1. a 2 px accent ring,
2. full opacity against 55 % for the rest,
3. an accent bar beneath the selected thumbnail.

None is colour-only, so the state survives greyscale and high contrast. `aria-current="true"`
carries it to a screen reader — the mechanism the runtime already implements.

---

## O. Lightbox and arrows

**Stage arrows: omitted.** Recorded as a decision, not an oversight. The stage already owns
one click meaning — *"Nhấn vào ảnh để mở chế độ xem lớn"*. An arrow placed inside it would
compete with that gesture and would sit on top of the artwork, which §20 forbids. In-page
navigation is carried by the ordered strip and the counter, both mandatory and both present.

**Lightbox — `944:187`.** Behaviour is preserved, not redesigned: it opens the currently
selected image, navigates the gallery in server order, and states the current position in
words. Arrows live **here**, where the surface is a viewer and nothing else competes for the
click. `Ảnh trước` / `Ảnh sau` / `Đóng` are the existing strings. The only change is that the
in-page counter and the lightbox position now share the single `positionLabel` string.

No separate gallery subsystem was designed.

---

## P. Accessibility — `945:187`

**Admin.** Each tile is one focus stop, not four; the action bar appears on hover **and** on
focus-within, so no action is keyboard-invisible. Move buttons carry the position in their
accessible name (*"Di chuyển trước: ảnh 4 trên 20"*), which is what makes them
distinguishable when read out of context — the convention the runtime already established.
`Đặt làm ảnh đại diện` is named per tile. Remove is accent-coloured and confirms when it
would change the primary. Primary state is badge + label, never colour alone. The picker's
multi-select is keyboard-operable: each option is a checkbox, Space toggles, `Đã thêm` and
over-capacity options use `aria-disabled`. The existing polite live region
(`media.reordered` / `media.removed`) gains one sentence for set-primary.

**Storefront.** Thumbnails stay `<button>`s inside the existing roving-tabindex strip — one
Tab stop, arrows within, Home/End to the ends. Selection is exposed with `aria-current`. The
counter has the non-visual equivalent described in §M. The main image alt is truthful —
*"Áo thun cotton — ảnh 3 trên 20"* — and invents no description of picture content, because
the backend publishes no caption. Thumbnail alts are empty so the button label is not read
twice. There are no stage arrows to label. Focus-visible is preserved and is not swallowed by
the selection ring.

---

## Q. Error / refusal copy design — `940:187`

Five refusals, each one Vietnamese sentence saying what happened and what to do next. **No
raw backend code is shown to an operator.** Codes appear on the frame only as a small
annotation chip so a reviewer can map design to contract.

| Contract code | Title | Body |
|---|---|---|
| `PRODUCT_MEDIA_NOT_PUBLISHABLE` | Không thể lưu bộ ảnh này | Sản phẩm đang xuất bản cần ít nhất một ảnh sẵn sàng. Hãy giữ lại hoặc thêm một ảnh trước khi lưu. |
| `PRODUCT_MEDIA_ASSET_UNAVAILABLE` | Một ảnh chưa sẵn sàng | Có ảnh vừa chuyển sang trạng thái không dùng được. Bộ ảnh chưa được lưu — hãy gỡ ảnh đó rồi thử lại. |
| `PRODUCT_MEDIA_DUPLICATE` | Ảnh bị trùng | Một ảnh xuất hiện hai lần trong danh sách. Hãy gỡ bớt một bản rồi lưu lại. |
| `PRODUCT_MEDIA_ASSET_NOT_FOUND` | Không tìm thấy ảnh | Một ảnh đã bị xoá khỏi thư viện tài sản. Bộ ảnh chưa được lưu — hãy tải lại trang để xem danh sách mới nhất. |
| `PRODUCT_VERSION_CONFLICT` | Sản phẩm vừa được người khác cập nhật | Ảnh sản phẩm đã thay đổi ở nơi khác. Hãy tải lại để xem bộ ảnh mới nhất trước khi sửa tiếp. |

Every one says the set was **not** saved, because B2 refuses atomically and the operator's
work is still on screen.

**Empty and unavailable states (§23).** DRAFT with no media has a clear empty section whose
only action is `Thêm ảnh` (`934:187`). PUBLISHED has no zero-image success state, and the UI
prevents reaching one. For degraded media, the current public read contract publishes **no
per-image availability field** — verified live against `GET /api/public/products/{slug}`. No
degraded-media warning was drawn on the storefront, because drawing one would mean drawing
data that does not exist. The existing browser-level fallbacks (`thumbnailUnavailable`,
`mediaError`) are preserved. This limitation is recorded on the handoff frame and in §X.

---

## R. Figma components and nodes

No new component was published and no existing component was modified. The media tile,
picker option, counter pill and reorder bar are drawn as reusable **patterns** inside the
package section — the minimum needed for review — using existing approved tokens.

No new brand system, palette or font family.

### Frames created — section `933:187` on page `APP_12`

| Node | Frame |
|---|---|
| `933:188` | Overview — authority, gap & frozen decisions |
| `934:187` | Admin · Ảnh sản phẩm · DRAFT — chưa có ảnh · 1440 |
| `934:202` | Admin · Ảnh sản phẩm · DRAFT — 1 ảnh · 1440 |
| `934:231` | Admin · Media tile — các trạng thái |
| `935:255` | Admin · Ảnh sản phẩm · DRAFT — 8 ảnh · 1440 |
| `935:398` | Admin · Ảnh sản phẩm · DRAFT — 20 ảnh (đã đạt giới hạn) · 1440 |
| `936:187` | Admin · Product editor · PUBLISHED — field lõi khoá, ảnh vẫn sửa · 1440 |
| `938:187` | Admin · Asset picker — multi-select có sức chứa · 1440 |
| `938:255` | Admin · Asset picker — đã đạt giới hạn 20 ảnh · 1440 |
| `940:187` | Admin · Ảnh sản phẩm — trạng thái từ chối của B2 |
| `941:187` | Admin · Ảnh sản phẩm — compact · 1024 |
| `942:187` | Storefront · Product Detail · Desktop 1440 — 8 ảnh, đang xem ảnh 1 |
| `942:237` | Storefront · Product Detail · Desktop 1440 — 20 ảnh, đang xem ảnh 7 |
| `943:187` | Storefront · Product Detail · Tablet 1024 — 20 ảnh, đang xem ảnh 3 |
| `943:273` | Storefront · Product Detail · Mobile 390 — 20 ảnh, đang xem ảnh 3 |
| `944:187` | Storefront · Lightbox — ảnh 7 / 20 |
| `944:200` | Storefront · Trạng thái chọn ảnh — đầu · giữa · cuối |
| `945:187` | Bàn giao — accessibility & kiểm kê chuỗi i18n |

---

## S. Registry / index

Eighteen rows added to `docs/design/FIGMA_DESIGN_INDEX.md`, immediately after the APP12
table, under a scoped note that records what they amend and that they are additive — the
amended parent rows keep their existing approvals until the Product Owner rules.

`node tools/check-figma-design-index.mjs` → **passed** (571 registry IDs, 571 node rows,
25 registry tables; canonical files, statuses, deep links and composites verified).

### S.1 Reported conflict — status vocabulary

The package brief specifies the literal status `READY_FOR_PO_REVIEW`. **That token does not
exist in this repository.** `tools/check-figma-design-index.mjs` enforces a closed set
(`ALLOWED_STATUSES`, lines 40–50): `APPROVED`, `APPROVED_FOR_IMPLEMENTATION`,
`REVIEW_REQUIRED`, `DRAFT`, `UNVERIFIED`, `REFERENCE_ONLY`, `SUPERSEDED`, `OBSOLETE`,
`MISSING`. Writing the literal produced 18 gate violations.

Per `CLAUDE.md` §2 this was not resolved silently. The rows use **`REVIEW_REQUIRED`**, which
is this repository's canonical token for exactly the state the brief describes — and which
`CLAUDE.md` already mandates for new frames ("new frames enter `REVIEW_REQUIRED`"). The
mapping is written into the registry note itself, so a reader of the index sees it without
this report.

Widening the gate's vocabulary was rejected: that is a change to a repository control, well
outside a design-only package.

**No self-approval.** All eighteen rows carry an empty Approval Evidence column. No approval
id was invented. No existing approval row was edited.

---

## T. Evidence

Frames were re-opened live in Figma after every write and inspected visually. Screenshots
captured during the package:

| Checked | Node | Result |
|---|---|---|
| Tile state legend | `934:231` | primary badge, focus ring, action bar and unavailable state all legible |
| Admin 20 images | `935:398` | four columns × five rows, `20/20` accent pill, `Thêm ảnh` disabled, capacity notice |
| Admin PUBLISHED | `936:187` | locked groups grey with `Chỉ đọc`; media group white with accent border and live primary button |
| Asset picker | `938:187` | `Còn 12 chỗ`, two selected, two `Đã thêm` without checkboxes, `Dùng 2 ảnh đã chọn` |
| Storefront 20 images | `942:237` | counter `7 / 20` in the stage, strip clipped to 660 px with edge fade, selected thumb ringed and barred, purchase panel unmoved |

Two defects were found by this inspection and fixed before completion:

1. The PUBLISHED media grid inherited a 692 px inner width and wrapped the fourth tile onto
   a second row. The form column was widened to 772 px so the grid holds four columns, and
   the frame was re-fitted.
2. Both picker frames placed their annotation caption underneath the modal scrim, where it
   was unreadable. The scrims were shortened and the captions moved clear.

A structural read-back of section `933:187` confirms 18 children with the ids, names and
geometry listed in §R, and the section was resized to 3 360 × 13 436 to enclose them.

---

## U. No-runtime-change proof

```
$ git status --short
 M docs/design/FIGMA_DESIGN_INDEX.md

$ git status --porcelain | awk '{print $2}' | grep -E '^(apps/|packages/)'
NONE — no runtime, DB, OpenAPI or generated-client file changed

$ git status --porcelain | grep -i migration
NONE — no new migration

$ git diff --check
diff --check: clean

$ git diff --stat
 docs/design/FIGMA_DESIGN_INDEX.md | 32 ++++++++++++++++++++++++++++++++
 1 file changed, 32 insertions(+)
```

| Gate | Result |
|---|---|
| runtime source changes | **0** |
| DB changes | **0** |
| OpenAPI changes | **0** |
| generated-client changes | **0** |
| new migration | **0** — no `0040` |
| drag-and-drop designed | **no** |
| SKU-specific imagery designed | **no** |
| order image snapshots designed | **no** |

---

## V. Validation

Scoped to what this change justifies (`docs/implementation/VALIDATION_GOVERNANCE.md` §3).
No repository-wide aggregate was run.

| Control | Command | Result |
|---|---|---|
| Figma live re-open after edits | `get_screenshot` / structural read-back on `934:231`, `935:398`, `936:187`, `938:187`, `942:237`, `933:187` | pass — two defects found and fixed (§T) |
| Registry / index integrity | `node tools/check-figma-design-index.mjs` (`CMD-CHECK-FIGMA-DESIGN-INDEX`) | **pass** — 571 IDs, 571 node rows, 25 tables |
| Design status consistency | 18 rows `REVIEW_REQUIRED`, evidence column empty, no approval id issued | pass |
| Brand / design-token consistency | palette and type read from `get_variable_defs` on `902:4`; no value invented | pass |
| Responsive frame inspection | 1440 / 1024 / 390 built; strip bound measured against stage width in every frame | pass |
| Copy / i18n intent inventory | `945:187` — existing keys reused verbatim, new keys enumerated | pass |
| Runtime diff proves no implementation change | `git status --porcelain` filtered to `apps/`+`packages/` | **pass — empty** |
| Whitespace check | `git diff --check` | pass |
| Report secret checker | `node tools/check-report-secrets.mjs` (`CMD-CHECK-REPORT-SECRETS`) | pass |

No credential was read, requested, echoed or written. `.env` was not touched.

---

## W. Files and docs changed

| File | Change |
|---|---|
| `docs/design/FIGMA_DESIGN_INDEX.md` | +32 lines — scoped amendment note + 18 `REVIEW_REQUIRED` rows |
| `docs/implementation/reports/APP12-M01-D1-COMPLETION-REPORT.md` | new — this report |

Figma: one section (`933:187`) and 18 frames created on page `APP_12`. No existing Figma
node was modified.

---

## X. `APP12-M01` internal roadmap

```
APP12-M01.A   = COMPLETE — PO PASS
APP12-M01.B1  = COMPLETE — PO PASS
APP12-M01.DB1 = COMPLETE — PO PASS
APP12-M01.B2  = COMPLETE — PO PASS
APP12-M01.D1  = COMPLETE — READY_FOR_PO_REVIEW
                (registry token: REVIEW_REQUIRED — see §S.1)

APP12-M01 = IMPLEMENTATION_IN_PROGRESS

APP12-M01.A1 = NOT_AUTHORIZED
APP12-M01.S1 = NOT_AUTHORIZED
APP12-M01.E1 = NOT_AUTHORIZED
APP12-G03    = NOT_AUTHORIZED
ROADMAP_CHECKPOINTS = 39
```

### Limitations carried forward

1. **Admin 390 not amended.** The approved mobile Product form (`438:90`) merges category,
   price and media into one card and the runtime carries a separate `helpNarrow` string for
   it. Amending that composition exceeds this bounded package. `M01.A1` will need either an
   explicit mobile design decision or a ruling that Admin media management is a
   tablet-and-up task.
2. **No per-image availability on the public read.** Verified live: the public product
   detail response carries no degraded/processing flag per media entry. The storefront
   therefore has no data-backed unavailable state to render, and none was drawn. If the
   Product Owner wants one, it needs a contract change, not a design change.
3. **The runtime PUBLISHED lock must change.** `product-edit-form.tsx:98` disables the whole
   editor for a PUBLISHED product. `M01.A1` must narrow that flag so it locks the commercial
   fields while leaving the media section live — the design in `936:187` depends on it.
4. **Duplicate and over-capacity refusals become unreachable from the happy path.** The
   picker prevents both. `M01.A1` should still handle them, since two tabs can race.

### Not executed

`M01.A1` was not executed. `M01.S1` was not executed. No runtime code was implemented. DB,
OpenAPI and the generated client were not modified. Migration `0040` was not added.
Drag-and-drop was not added. SKU-specific imagery was not added. Order image snapshots were
not added. `G03` was not started. Nothing was deployed. **Nothing was pushed.**

---

**`APP12-M01.D1` = COMPLETE — READY_FOR_PO_REVIEW**
**`APP12-M01` = IMPLEMENTATION_IN_PROGRESS**
