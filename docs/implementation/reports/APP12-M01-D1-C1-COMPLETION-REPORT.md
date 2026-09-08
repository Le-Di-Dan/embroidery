# APP12-M01.D1-C1 — Admin Mobile Product Media Management · Design Correction

**The single authorised correction to the internal design package `APP12-M01.D1`.
Not a new APP12 checkpoint id.**

| | |
|---|---|
| Correction | `APP12-M01.D1-C1` · `CORRECTION_USED = 1 / 1` |
| Type | Design only — Figma + registry + this report |
| Figma file | `BQwqV8GdfUIELvsQDB1UQE` (`FIG-FILE-PRODUCT`, Write) |
| Figma page | `APP_12` — existing D1 section `933:187` |
| Frames added | 7 |
| Existing D1 frames modified | **0** |
| Runtime / DB / OpenAPI / client / migration changes | **0** |
| Repository files changed | 2 (`docs/design/FIGMA_DESIGN_INDEX.md`, this report) |

---

## A. Verdict

`APP12-M01.D1-C1` is **COMPLETE**.

The one bounded omission is closed: Admin product-media management now has design authority
at 390 for DRAFT (empty, several, and the full 20-image cap), for PUBLISHED, and for the
asset picker. Seven frames were added to the existing D1 section. **No accepted D1 frame was
reopened, redrawn, or modified** — verified by structural read-back.

---

## B. PO correction authority

```
APP12-M01.D1    = CORRECTION_REQUIRED  → COMPLETE_AFTER_C1
APP12-M01.D1-C1 = AUTHORIZED           → COMPLETE
CORRECTION_USED = 1 / 1 — no D1-C2
```

Honoured exactly:

- Only the missing Admin 390 media design was added.
- The registry control vocabulary was **not** modified; `REVIEW_REQUIRED` remains the token,
  as the Product Owner accepted.
- Storefront Product Detail was not redrawn. The Admin shell was not redesigned. Product
  commercial fields appear only in their existing locked/read-only state, as §3 permits.
- No drag-and-drop, no per-SKU imagery, no order image snapshotting, no new route, no inline
  upload.

---

## C. Accepted D1 baseline — preserved

A structural read-back of section `933:187` confirms **25 children**: the original 18 D1
frames plus the 7 added here. Every D1 node id listed in the D1 completion report still
resolves to the same frame with the same name and geometry.

| Accepted D1 work | State after C1 |
|---|---|
| Admin compact grid; 1 / 8 / 20 states; `n/20`; set-primary; primary = position 0; Option B; remove-primary semantics | untouched — `934:187`, `934:202`, `934:231`, `935:255`, `935:398` |
| PUBLISHED: commercial groups read-only, media editable | untouched — `936:187` |
| Multi-select picker; already-added; remaining capacity; 20/20 | untouched — `938:187`, `938:255` |
| Storefront Product Detail 1440 / 1024 / 390, counter, lightbox, selected state | untouched — `942:187`, `942:237`, `943:187`, `943:273`, `944:187`, `944:200` |
| B2 refusal design; accessibility intent | untouched — `940:187`, `945:187` |
| Registry status `REVIEW_REQUIRED` | preserved; C1 rows use the same token |

The mobile design inherits D1's rules rather than restating them: primary is position 0,
Option B anchors it, capacity is 20, and the picker session is the same multi-select session.

---

## D. Why Admin 390 was required

D1 recorded the omission as a limitation. The Product Owner correctly ruled that D1's own
preflight had already satisfied the original condition — *"390 only if current Admin Product
editor is supported there."*

Two pieces of evidence, both from D1's preflight, settle it:

1. **`438:90`** — *APP2-D01 / Admin / Product / Edit-Detail / Mobile / Default* — exists and
   is `APPROVED_FOR_IMPLEMENTATION`.
2. **`productForm.media.helpNarrow`** — *"Chỉ ảnh "Sẵn sàng" mới chọn được. Ảnh đầu tiên là
   ảnh đại diện."* — a dedicated narrow-viewport string the runtime already ships.

The viewport is supported. Leaving it undesigned would have forced `M01.A1` to invent
responsive behaviour for a screen that already has an approved composition.

**What re-opening `438:90` also revealed.** The approved mobile media list is *worse* than
the desktop one it mirrors: each media row is **176 px** tall, not 144, because at 390 the
three text buttons cannot fit on one line and wrap onto two (`519:286` — 44 px, then 52 px
offset). Twenty images in that pattern occupy **3 748 px**. This was not visible from the
desktop frame alone, and it makes the correction more valuable than a symmetry exercise.

---

## E. Mobile DRAFT media design

The media section becomes its **own card** at 390 titled `Ảnh sản phẩm`.

**Scoped consequence, stated plainly.** In `438:90` media lives inside
`Group / Danh mục, Giá & Ảnh` (`438:144`) — three concerns in one card. Media now needs a
header carrying `n/20` and a primary `Thêm ảnh` action, which it cannot own while nested
under a card titled after two other things. The commercial fields themselves are
**unchanged** — same fields, same order, same labels, same read-only treatment; only the card
grouping splits. This is the minimum change that lets §4's required header exist, and it is
recorded here rather than performed silently.

### Composition

```
Ảnh sản phẩm      6/20
[        Thêm ảnh         ]     ← full-width, 44 px
Ảnh đầu tiên là ảnh đại diện. Chạm vào một ảnh để đặt ảnh
đại diện, đổi thứ tự hoặc gỡ ảnh.
┌──────────┬──────────┐
│ 1 ★      │ 2        │        ← 2 columns, 157 px tiles
└──────────┴──────────┘
```

| Frame | Node | State |
|---|---|---|
| DRAFT · no media | `946:187` | `0/20`, empty panel, single primary action |
| DRAFT · 6 images | `946:248` | `6/20`, tile 4 selected with its action bar |
| DRAFT · 20 images | `948:311` | see §F |

Every fact §4 demands is on screen: `Ảnh sản phẩm`, `n/20`, `Thêm ảnh`, which image is
primary (badge on the image + accent label beneath), display order (numbered badge per tile),
and set-primary / reorder / remove through the selection action bar.

**No four permanent text actions under any tile.** A tile at rest carries only its
thumbnail, its position number, its primary badge if it has one, and its selected ring.

---

## F. Mobile 20-image state — `948:311`

Mandatory frame. It proves, visibly:

| Requirement | Evidence in frame |
|---|---|
| `20/20` | accent capacity pill in the section header |
| add disabled | `Thêm ảnh` grey/disabled, plus `Đã đạt giới hạn 20 ảnh. Gỡ bớt một ảnh để thêm ảnh mới.` |
| primary visible | tile 1 badged `Ảnh đại diện` on the image and labelled beneath |
| reorder still possible | action bar `←` / `→`, shown live for the selected tile |
| remove still possible | action bar `✕ Gỡ`, enabled |
| no horizontal overflow | grid is exactly 326 px inside a 358 px card — verified programmatically, see §M |
| no 20 full-width rows | 10 rows of 2, not 20 rows of 1 |

### Measured geometry — read back from the built frame, not estimated

| | |
|---|---|
| Viewport | 390 px |
| Page gutter | 16 px each side → card 358 px |
| Card padding | 16 px → content 326 px |
| **Column count** | **2** |
| **Tile width** | **157 px** (157 × 2 + 12 = 326 — exact, no remainder) |
| Tile height | 183 px (157 image + 26 position label) |
| Gap | 12 px both axes |
| **Rows at 20 images** | **10** |
| **Grid height at 20 images** | **1 938 px** |
| Media-section height at 20 | ≈ 2 172 px |
| Frame height at 20 | 2 656 px — an ordinary vertically scrolling page |

### Density against the approved baseline

| | |
|---|---|
| `438:90` — one row per image | 176 px per row, buttons wrapped onto two lines |
| 20 images under `438:90` | 20 × 176 + 19 × 12 = **3 748 px** |
| 20 images under D1-C1 | **1 938 px** |
| Difference | **− 1 810 px · 48.3 % shorter** |

### Rejected alternative — 3 columns, measured not skipped

§5 asks for 2 columns "unless measured geometry proves another arrangement materially
better". Three columns was measured: tile = (326 − 2 × 10) ÷ 3 = **102 px**, grid at 20
images ≈ **956 px** — genuinely shorter still. It was rejected for two reasons, both
recorded on frame `950:187`:

1. **Touch targets.** A four-button bar at 44 px needs 176 px plus gaps. It does not fit a
   157 px tile, let alone a 102 px one. The desktop in-tile hover bar **cannot survive at
   390 at any column count** — this is what forced the action treatment in §I, and it is the
   real finding behind the layout.
2. **Image legibility.** 102 px is too small for an operator to judge a product photograph,
   while the position badge and the `Ảnh đại diện` badge still have to sit on it.

Both reasons converge on the same conclusion: actions must leave the tile. Once they have,
2 columns at 157 px keeps the photograph readable while still halving the height.

---

## G. Mobile PUBLISHED state — `948:355`

At 390 the same distinction as desktop, achieved without making the page look dead:

- Banner: **"Sản phẩm đang xuất bản"** / *"Thông tin, danh mục và giá đã khoá. Bạn vẫn có thể
  cập nhật ảnh sản phẩm."*
- `Thông tin cơ bản` and `Danh mục & Giá` take the secondary ground, muted labels and a
  `🔒 Chỉ đọc` badge.
- The media card keeps the white surface, gains the accent border, and its `Thêm ảnh` stays
  at primary weight — the one live region on the screen.
- The page action reads **`Lưu ảnh sản phẩm`**, not `Lưu thay đổi`.
- Status dot is success-green with `Đang xuất bản`.
- With one image left on a published product, the action bar's `Gỡ` is disabled with
  *"Sản phẩm đang xuất bản cần ít nhất một ảnh."* — D1's rule, carried to 390.

---

## H. Mobile picker — `949:187`, `949:238`

At 390 the dialog becomes a **full-screen sheet**. It is the same multi-select session as
`437:73`, not a new flow — **no new route**, **no inline upload**.

| Preserved from D1 | At 390 |
|---|---|
| multi-select | each option is a checkbox with a 44 px touch area |
| remaining capacity | `Còn 12 chỗ` pill beside the sheet title, repeated in the sticky footer as `Đã chọn 2 · còn 10 chỗ` |
| already-added | `Đã thêm` badge, 55 % opacity, **no checkbox** |
| 20/20 blocking | `949:238` — every unattached option disabled with `Đã đủ 20 ảnh`, confirm button disabled, notice explains why |
| real thumbnail intent | options are image boxes at 157 × 126, not glyph identity |
| READY-only listing | the existing `picker.help` sentence, unchanged |

Options use the same 2-column 157 px rhythm as the media grid, so the sheet and the section
behind it read as one system. `Tải thêm tài sản` is the existing pagination control. The
confirm action is a full-width primary button in a sticky footer.

---

## I. Primary / reorder / remove semantics on mobile

**The action treatment is the substance of this correction.** D1's desktop pattern — a
four-icon bar revealed inside the tile on hover/focus — cannot be carried to 390: four 44 px
targets need 176 px and the tile is 157 px. Shrinking the buttons would break the 44 px
minimum this repository applies to every control.

**Resolution: one selection-driven action bar, not twenty.** Tapping a tile selects it
(2 px ring + a solid ✓ mark); a single action bar for **that image** appears, pinned to the
bottom of the viewport:

```
[▣] Ảnh 4 / 20                                    [ ✕ ]
[  ★   ] [  ←   ] [  →   ] [  ✕   ]
 Đại diện  Trước    Sau      Gỡ
```

Four buttons at **77 × 52 px**, each with a visible text label. Pinning it to the bottom
means an image in row ten is operable without scrolling away to find its controls. This is
§6's option (a), applied so that no action is duplicated per tile.

**Primary — D1 Option B, unchanged.** The primary is anchored at position 0. On the primary
tile, `★`, `←` and `→` are all disabled, and the bar carries one short sentence:
*"Ảnh đại diện neo ở vị trí 1: ★ và hai mũi tên tắt. Chọn một ảnh khác rồi chạm "Đại diện"
để đổi."* Understandable without a paragraph, per §7.

**Reorder** stays explicit and button-driven. **No drag-and-drop anywhere.**

**Remove** keeps D1's semantics: non-primary removes silently; primary confirms and promotes
the next image; the last image is removable on DRAFT and refused on PUBLISHED.

---

## J. Accessibility

| Concern | Treatment |
|---|---|
| Touch targets | action-bar buttons 77 × 52; close, menu and checkbox all carry 44 px areas |
| Keyboard reachability | an external keyboard still works: each tile is a focus stop, the action bar follows the selected tile in DOM order, and focus-visible is preserved |
| Selected state | 2 px accent ring **plus** a solid ✓ mark — two signals, not colour alone |
| Primary state | text badge on the image **plus** a text label beneath — not colour alone |
| Reorder controls named | visible labels `Trước` / `Sau`; accessible name carries the position, e.g. *"Di chuyển trước: ảnh 4 trên 20"* |
| Set-primary named | visible label `Đại diện`; accessible name *"Đặt ảnh 4 làm ảnh đại diện"* |
| Remove semantics | accent-coloured, and confirms when it would change the primary |
| Picker operable | every option a checkbox; `Đã thêm` and over-capacity options use `aria-disabled` |
| Drag-and-drop | **none** |

Recorded on frame `950:187`.

---

## K. Figma nodes

All seven added to the existing D1 section `933:187` on page `APP_12`, prefixed `M01.D1-C1 /`
so the correction reads as a group without a separate section.

| Node | Frame | Size |
|---|---|---|
| `946:187` | Admin · Ảnh sản phẩm · Mobile 390 — DRAFT · chưa có ảnh | 390 × 531 |
| `946:248` | Admin · Ảnh sản phẩm · Mobile 390 — DRAFT · 6 ảnh, ảnh 4 đang chọn | 390 × 1 195 |
| `948:311` | Admin · Ảnh sản phẩm · Mobile 390 — DRAFT · 20 ảnh (đã đạt giới hạn) | 390 × 2 656 |
| `948:355` | Admin · Product editor · Mobile 390 — PUBLISHED · field lõi khoá, ảnh sửa được | 390 × 1 608 |
| `949:187` | Admin · Asset picker · Mobile 390 — multi-select có sức chứa | 390 × 934 |
| `949:238` | Admin · Asset picker · Mobile 390 — đã đạt giới hạn 20 ảnh | 390 × 970 |
| `950:187` | Bàn giao — hình học 390, mật độ & phương án bị loại | 2 200 × 940 |

Section `933:187` resized to 5 160 × 16 456 to enclose all 25 frames. No new component was
published; no existing component was modified; tokens are the same approved set D1 used.

---

## L. Registry / index

Seven rows added to `docs/design/FIGMA_DESIGN_INDEX.md`, immediately after the D1 block,
under a scoped note recording why the correction exists and that it amends `438:90` and
`437:73` at 390 only.

- Status: **`REVIEW_REQUIRED`** on all seven — the token the Product Owner accepted. The
  registry control vocabulary was **not** modified.
- Approval Evidence: **empty** on all seven. No approval id was invented, and no existing
  approval row was edited.

`node tools/check-figma-design-index.mjs` → **passed** (578 registry IDs, 578 node rows,
26 registry tables).

---

## M. Evidence

Every new frame was re-opened live in Figma after writing.

| Checked | Node | Result |
|---|---|---|
| Mobile 6-image + action bar | `946:248` | 2-column grid legible, tile 4 ringed with ✓, single bottom action bar with four labelled buttons |
| Mobile PUBLISHED | `948:355` | grey `Chỉ đọc` cards above; white accent-bordered media card with live `Thêm ảnh`; `Lưu ảnh sản phẩm` |
| Structural read-back | `933:187` | 25 children; the 18 D1 frames unchanged; 7 C1 frames at the ids and sizes in §K |
| 20-image grid height | `948:311` | **1 938 px**, read back from the built auto-layout — not estimated |

**Horizontal-overflow check.** Every 390-wide frame was walked programmatically and each
child's horizontal extent compared against the viewport:

```
horizontalOverflow: none
```

No child of any mobile frame starts before x = 0 or ends after x = 390.

---

## N. No-runtime-change proof

```
$ git status --short
 M docs/design/FIGMA_DESIGN_INDEX.md
?? docs/implementation/reports/APP12-M01-D1-C1-COMPLETION-REPORT.md

$ git status --porcelain | awk '{print $2}' | grep -E '^(apps/|packages/)'
NONE — no runtime, DB, OpenAPI or generated-client file changed

$ git status --porcelain | grep -i migration
NONE — no new migration
```

| Gate | Result |
|---|---|
| runtime source changes | **0** |
| DB changes | **0** |
| OpenAPI changes | **0** |
| generated-client changes | **0** |
| new migration | **0** — no `0040` |
| existing D1 frames modified | **0** |
| registry vocabulary modified | **0** |

---

## O. Validation

Scoped to what this change justifies (`docs/implementation/VALIDATION_GOVERNANCE.md` §3).
No repository-wide aggregate was run.

| Control | Command / method | Result |
|---|---|---|
| Figma live re-open of all new mobile frames | `get_screenshot` on `946:248`, `948:355`; structural read-back of `933:187` | pass |
| 390 geometry inspection | tile / column / gap / grid values read back from built nodes | pass — §F table |
| 20-image density inspection | grid height 1 938 px vs 3 748 px baseline | pass — 48.3 % shorter |
| No document / frame overflow | programmatic walk of every 390 frame's children | **pass — `none`** |
| Registry / index gate | `node tools/check-figma-design-index.mjs` (`CMD-CHECK-FIGMA-DESIGN-INDEX`) | **pass** — 578 IDs, 578 node rows |
| Design status consistency | 7 rows `REVIEW_REQUIRED`, evidence empty, no approval id | pass |
| Token consistency | same approved palette and Inter ramp as D1; no new value | pass |
| Runtime diff = 0 | `git status --porcelain` filtered to `apps/` + `packages/` | **pass — empty** |
| `git diff --check` | whitespace | pass |
| Report secret checker | `node tools/check-report-secrets.mjs` (`CMD-CHECK-REPORT-SECRETS`) | pass |

No credential was read, requested, echoed or written. `.env` was not touched.

---

## P. `APP12-M01` internal roadmap

```
APP12-M01.A     = COMPLETE — PO PASS
APP12-M01.B1    = COMPLETE — PO PASS
APP12-M01.DB1   = COMPLETE — PO PASS
APP12-M01.B2    = COMPLETE — PO PASS
APP12-M01.D1    = COMPLETE_AFTER_C1 — READY_FOR_PO_REVIEW
                  (registry token: REVIEW_REQUIRED)
APP12-M01.D1-C1 = COMPLETE
CORRECTION_USED = 1 / 1

APP12-M01 = IMPLEMENTATION_IN_PROGRESS

APP12-M01.A1 = NOT_AUTHORIZED
APP12-M01.S1 = NOT_AUTHORIZED
APP12-M01.E1 = NOT_AUTHORIZED
APP12-G03    = NOT_AUTHORIZED
ROADMAP_CHECKPOINTS = 39
```

### D1 limitations — status after this correction

1. ~~Admin 390 not amended~~ — **closed by this correction.**
2. **No per-image availability on the public read** — still open. The public product detail
   response carries no degraded/processing flag per media entry, so no data-backed
   unavailable state was drawn on the storefront. A contract change, not a design change.
3. **The runtime PUBLISHED lock must change** — still open, and now applies at both
   viewports. `product-edit-form.tsx:98` disables the whole editor when status is
   `PUBLISHED`; `M01.A1` must narrow that flag so commercial fields lock while the media
   section stays live.
4. **Duplicate and over-capacity refusals unreachable from the happy path** — still true at
   390: the sheet blocks both. `M01.A1` should still handle them, since two tabs can race.

### New note for `M01.A1`

The desktop in-tile action bar and the mobile selection action bar are **two different
components**, not one responsive component. The reason is measurable: four 44 px targets
need 176 px and the mobile tile is 157 px. `M01.A1` should not attempt to collapse them into
a single implementation.

### Not executed

`M01.A1` was not executed. `M01.S1` was not executed. No runtime code was implemented. DB,
OpenAPI and the generated client were not modified. Migration `0040` was not added.
Drag-and-drop was not added. No new route was added. No inline upload was added. `G03` was
not started. Nothing was deployed. **Nothing was pushed.**

---

**`APP12-M01.D1-C1` = COMPLETE**
**`APP12-M01.D1` = COMPLETE_AFTER_C1 — READY_FOR_PO_REVIEW**
**`CORRECTION_USED = 1 / 1`**
