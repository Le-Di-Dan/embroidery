# APP12-N02.D01 — Ready-Made Sellability Authoring — Design Package

```text
APP12-N02.D01             = COMPLETE — AWAITING_PO_REVIEW
APP12-N02                 = DESIGN_REVIEW_REQUIRED

RUNTIME_CHANGES           = 0
DB_WRITES                 = 0
OPENAPI_CHANGES           = 0
GENERATED_CLIENT_CHANGES  = 0
MIGRATIONS_ADDED          = 0
SHARED_DEV_MUTATIONS      = 0

FIGMA_FRAMES_ADDED        = 21
REGISTRY_ROWS_ADDED       = 21  (all REVIEW_REQUIRED)
REGISTRY_ROWS_MODIFIED    = 0
REGISTRY_ROWS_SUPERSEDED  = 0

APP12-U01                 = SUSPENDED_PENDING_BLOCKER_RECOVERY
APP12-E01                 = NOT_AUTHORIZED
APP12-R01                 = NOT_AUTHORIZED
ROADMAP_CHECKPOINTS       = 41

PRODUCTION_DEPLOYED       = false
PUSHED                    = false
NEXT                      = PO_REVIEW_REQUIRED
```

Date: 2026-09-10 · Branch: `feat/app11-s04-seo-infrastructure`

---

## A. Verdict

The design package is complete. Twenty-one frames were drawn live on Figma page
`APP_12` under a new section `968:187`, twenty-one registry rows were added as
`REVIEW_REQUIRED`, and `node tools/check-figma-design-index.mjs` passes at 613
registry IDs (592 before). Nothing outside the registry, the phase plan and this
report changed.

Two things the brief could not have known were found by reading the source before
drawing, and both changed the design:

1. **The Admin authoring read does not exist, and the public one cannot stand in
   for it.** `AdminProductDetailResponse` carries no `variants` and no `skus`
   field at all (§C). The only variant read in the entire contract is the public,
   slug-keyed, `PUBLISHED`-only, `is_active`-filtered one. The §2 preflight is
   therefore answered decisively: **a read is missing**, and `N02.B01` owns three
   new operations, not two.

2. **`SKU_PRICE_RESOLVABLE` has a standalone failure mode that has nothing to do
   with the base price.** `priceOverrideAmount` is validated by `^\d{1,12}$`, so
   the string `"0"` is an accepted override. An order-eligible SKU carrying a
   `0 ₫` override on a Product whose base price is a perfectly valid `250.000 ₫`
   leaves `PRODUCT_PRICE_READY` **green**, the old seven criteria all satisfied,
   and the Product sellable for nothing. Without this, State C would have been
   drawn as a mere consequence of the base price and would have been wrong (§J.3).

A third finding shaped the readiness design: the delivered evaluator treats
dependent criteria as *vacuously satisfied* when their prerequisite is absent
(`PRODUCT_MEDIA_ASSETS_READY` is `true` when there is no media). Following that
philosophy literally would paint two green ticks on a Product that has no variant.
The design keeps the contract shape and adds one presentation rule instead (§J.4).

---

## B. G01 PO reconciliation

`APP12-N02.G01 = COMPLETE — PO PASS`. Every G01 finding is carried into the design
unchanged; none was reopened.

| G01 finding | Where it lands in D01 |
|---|---|
| variant create operation MISSING | `FIG-APP12-N02-D01-VARIANT-CREATE`; handoff row 3 |
| variant update/deactivate MISSING | `FIG-APP12-N02-D01-VARIANT-DEACTIVATE-LAST`; handoff row 4 |
| `adminSku_create` EXISTS, 0 Admin call sites | `FIG-APP12-N02-D01-SKU-CREATE-EDIT` — reused, contract untouched |
| `adminSku_update` EXISTS, 0 Admin call sites | same frame, `Sửa SKU` card |
| stock operations EXIST; page unreachable from Product authoring | per-SKU `Quản lý tồn kho ↗` on every SKU row, all viewports |
| readiness = 7 presentation-only criteria | ten-criterion checklist, §J |
| no variant/SKU/stock fact in the snapshot | handoff row 9 marks this as a **facts** change, not only a rule change |
| 2 PUBLISHED malformed rows already exist | `FIG-APP12-N02-D01-EDITOR-PUBLISHED-UNSELLABLE-*` draws the real `ao-thun-cotton` shape (1 active variant, 0 SKUs) |
| auto-unpublish FORBIDDEN | stated in the banner, both deactivation dialogs, and both 390/1440 warning frames |
| sold-out PUBLISHED is valid | readiness State D |
| stock quantity > 0 FORBIDDEN as a requirement | States D and E carry an identical criterion list |
| low-stock threshold FORBIDDEN as a requirement | absent everywhere; explicitly out of scope in the handoff frame |

Accepted readiness additions are drawn exactly as accepted:
`HAS_ACTIVE_VARIANT`, `HAS_ORDER_ELIGIBLE_SKU`, `SKU_PRICE_RESOLVABLE`, all
blocking; stock-anchor existence `NOT_REQUIRED`; quantity never a criterion.

---

## C. Admin read-authority preflight (the §2 amendment)

**Method.** Mechanical, from the delivered contract and the delivered repository —
not from memory and not from the phase plan.

**Every Admin `products` operation in the contract:**

```text
GET    /api/admin/products                                        adminProduct_list
POST   /api/admin/products                                        adminProduct_create
GET    /api/admin/products/{productId}                            adminProduct_detail
PATCH  /api/admin/products/{productId}                            adminProduct_update
POST   /api/admin/products/{productId}/archive                    adminProduct_archive
PUT    /api/admin/products/{productId}/media                      adminProductMedia_replace
GET    /api/admin/products/{productId}/placement                  adminProductPlacement_get
PUT    /api/admin/products/{productId}/placement                  adminProductPlacement_replace
GET    /api/admin/products/{productId}/publication-readiness      adminProduct_publicationReadiness
POST   /api/admin/products/{productId}/publish                    adminProduct_publish
GET    /api/admin/products/{productId}/sides/{sideId}/background  adminProductSideBackground_get
POST   /api/admin/products/{productId}/unpublish                  adminProduct_unpublish
POST   /api/admin/products/{productId}/variants/{variantId}/skus  adminSku_create
```

**`AdminProductDetailResponse`, every property:**

```text
productId · slug · name · description · status · category · basePriceAmount
currencyCode · media · primaryMedia · createdAt · updatedAt · archivedAt
```

```text
variants   ABSENT
skus       ABSENT
```

**Result:** `ADMIN_VARIANT_READ_EXISTS = false`. No existing Admin read is
sufficient, so the D01 frames legitimately design against a read `N02.B01` must
add.

**Why the public read may not be used, proved rather than asserted.**
`GET /api/public/products/{slug}/variants` is the only variant read in the
contract. From `drizzle-public-product-variant.repository.ts`:

```text
keyed by slug, not productId               a DRAFT product has no usable entry point
eq(products.status, PUBLISHED)             a DRAFT product returns 404 outright
eq(productVariants.isActive, true)         inactive variants never arrive
SKU_ORDER_ELIGIBLE_IS_ACTIVE on skus       inactive SKUs never arrive
projects skuId + price + availability      no code, no isActive, no timestamps
```

Every one of those four is fatal to an authoring screen whose entire job is to show
and edit the inactive rows. This is recorded so `N02.B01` cannot be tempted into
reusing it to keep the operation count down.

**Bounded shape handed to B01** (3 operations — at the §2 maximum):

```text
GET   /api/admin/products/{productId}/variants
POST  /api/admin/products/{productId}/variants
PATCH /api/admin/products/{productId}/variants/{variantId}
```

**One persistence fact B01 must not miss.** `product_variants.display_order` is
`integer NOT NULL` with **no default** (`packages/database` schema, IDX-068). The
create operation must compute it server-side (`max + 1`); the UI neither sends nor
displays it, and §3.5 forbids exposing it.

---

## D. Product-authoring information architecture

One bounded capability is added to the existing `/products/{productId}` screen. No
new top-level Admin route.

```text
Thông tin cơ bản        (unchanged, APP2-D01)
Danh mục & Giá          (unchanged, APP2-D01)
Ảnh sản phẩm            (unchanged, APP12-M01.D1)
Phiên bản & SKU         ← NEW, this package
[bàn giao xuất bản]     (unchanged)
```

Placement satisfies §11 on both readings: it is after pricing, and it is
immediately before the publication handoff.

**Progressive disclosure.** Variants are compact rows; exactly one expands to show
its SKUs. A permanently expanded nested form was rejected: at three variants with
two SKUs each it would run past 2,400 px before the publish card is reached.
Collapsed rows still carry the fact that matters — `SKU đang bán: …`, or the
warning `Chưa có SKU nào — phiên bản này chưa thể đặt hàng` — so nothing important
hides behind a click.

**Save semantics, made explicit because the screen now has two kinds.** Media is
part of the form and is written by the header's save button (`M01.B2`). Variant and
SKU changes are their own operations and commit when the operator confirms the
dialog. Frame `973:187` says so in the section's own help text, because a screen
with two save models that does not say which is which is a defect waiting to be
filed.

---

## E. Variant model and design

Fields drawn: `Màu sắc` (optional), `Kích thước` (optional), `Trạng thái`
(active/inactive). No new persisted field, no "variant name", no default unnamed
variant.

```text
at least one nonblank label   application-authoring rule, refused in the dialog
duplicate (colorName, sizeLabel) normalized within one Product   refused
DELETE                         absent — no button, no icon, no copy, at any state
ordering                       creation order; no drag-and-drop, no raw displayOrder
```

The duplicate refusal names the offending row (`Sản phẩm đã có phiên bản "Xanh navy
· Size M"`) and offers the recovery the operator actually wants — open the existing
one, which may merely be deactivated — rather than a bare rejection.

Deactivation of the **last active variant of a PUBLISHED Product** gets its own
confirmation (`975:254`). It states the arithmetic (`0 phiên bản đang hoạt động`),
states the consequence in customer terms, and states in bold that the Product will
**not** be automatically unpublished.

---

## F. SKU model and design

The existing contract is reused with no additions:

```text
code                    required
priceOverrideAmount?    optional, decimal string
isActive                explicit, never server-defaulted
```

**Price inheritance is drawn as a two-way radio, not a bare optional field**, so
the inheritance is legible rather than inferred:

```text
◉ Dùng giá sản phẩm: 250.000 ₫
○ Đặt giá riêng cho SKU        → Giá riêng (₫)
```

The row summary in the section repeats the resolved truth per SKU
(`Dùng giá sản phẩm: 250.000 ₫` / `Giá riêng cho SKU: 385.000 ₫`), so an operator
scanning the list never has to open a dialog to learn what a SKU sells for.

**One order-eligible SKU per variant.** Frame `976:269` draws the refusal:

```text
SKU_ORDER_ELIGIBLE_AMBIGUOUS
→ "Phiên bản này đã có một SKU đang bán: AT-NAVY-M."
→ recovery, numbered: 1. ngừng bán AT-NAVY-M   2. bật "Đang bán" cho SKU mới
→ an explicit statement that the system will NOT deactivate the old SKU for you
→ a second, legitimate path: turn "Đang bán" off and create the SKU inactive now
```

No automatic deactivation is invented; the source authority does not support it.
Inactive SKUs stay visible in the section as history and cannot be deleted.

---

## G. Stock handoff

`APP8`'s stock screen is not redesigned. Every SKU row — 1440, 1024 and 390 —
carries one action:

```text
Quản lý tồn kho ↗   →   /kho/skus/{skuId}
```

The design is valid when only `skuId` is known: no inline quantity is required, and
none is drawn in the section, so no new list or availability query is implied. The
`Thêm SKU` dialog states the truth about a new SKU's stock — it begins at 0, the
anchor is created lazily by the first stock read, and stock is never a publication
requirement. There is no low-stock-threshold editing anywhere in the package.

This closes the circularity G01 found: `/kho/skus/{skuId}` was reachable only from
an order row for a product that could not be ordered.

---

## H. PUBLISHED recovery

Frame `973:187` draws a PUBLISHED Product whose sellability section is fully
editable while name, description, category and base price stay locked and visibly
read-only. The `M01.B2` precedent is extended, not replaced: media remains a bounded
form write; variant and SKU are bounded operations of their own. Neither unlocks a
generic Product field.

No `unpublish → edit → republish` cycle exists anywhere in the package. This is what
makes the two malformed PUBLISHED rows in the shared development world recoverable
in place.

---

## I. Structural-unsellability warning

Frames `974:187` (1440) and `979:321` (390). The warning is deliberately **not**
colour-only:

```text
icon        a filled amber "!" disc
heading     "Sản phẩm vẫn đang được xuất bản nhưng hiện chưa có phiên bản
             có thể đặt hàng."
evidence    a bordered "Cấu trúc bán hàng còn thiếu" block that counts the
            exact structure: active variants 1, order-eligible SKUs 0
route       "Đi tới Phiên bản & SKU" + "Xem điều kiện xuất bản"
```

**Structural unsellability is never labelled as sold-out.** The banner says so in
its own sentence: *hết hàng* means stock 0 on a SKU that is still selling; here
there is no SKU to sell. The same distinction is repeated in the last-SKU
deactivation dialog, where the mistake would be easiest to make.

The status card carries a second badge — `Đang xuất bản` **and** `Không thể đặt
hàng` — so the Admin does not look healthy while the storefront is unbuyable.

---

## J. Publication readiness — ten criteria

### J.1 The list

```text
 1  PRODUCT_NAME_READY                Tên sản phẩm và đường dẫn đã sẵn sàng
 2  PRODUCT_DESCRIPTION_READY         Đã có mô tả sản phẩm
 3  PRODUCT_CATEGORY_READY            Danh mục đang được xuất bản
 4  PRODUCT_PRICE_READY               Đã đặt giá sản phẩm
 5  PRODUCT_MEDIA_READY               Thứ tự ảnh sản phẩm hợp lệ
 6  PRODUCT_MEDIA_ASSETS_READY        Tất cả ảnh đã được duyệt
 7  PRODUCT_MEDIA_DERIVATIVES_READY   Ảnh hiển thị công khai đã sẵn sàng
 8  HAS_ACTIVE_VARIANT                Có ít nhất một phiên bản đang hoạt động
 9  HAS_ORDER_ELIGIBLE_SKU            Có ít nhất một SKU có thể đặt hàng
10  SKU_PRICE_RESOLVABLE              SKU có thể đặt hàng đã có giá bán hợp lệ
```

Rows 1–7 are transcribed verbatim from `packages/i18n/messages/vi/admin.json` →
`productRequirementLabel.*`, so the design and the shipped strings agree by
construction. Rows 8–10 are new and preserve the accepted semantics exactly.

Absent, deliberately: `Có tồn kho`, `Tồn kho > 0`, `Đã đặt ngưỡng sắp hết hàng`.

### J.2 The four mandated states, plus the fifth

| Frame | State | Count |
|---|---|---|
| `977:187` | A — no active variant | 7/10 |
| `977:300` | B — active variant, no order-eligible SKU | 8/10 |
| `977:413` | C — order-eligible SKU, unresolvable effective price | 9/10 |
| `977:527` | D — valid structure, stock 0 | **10/10, publishable** |
| `977:638` | E — valid structure, stock > 0 | **10/10, publishable** |

D and E carry an **identical criterion list**. That is the point of drawing both:
the only difference between them is a sentence in the verdict card about stock, and
stock appears nowhere in the ten rows.

### J.3 State C is not a consequence of the base price

`isPublishablePrice` (`product-publication.readiness.ts`) requires currency `VND`,
integer form and `> 0`. Effective price is
`COALESCE(skus.price_override_amount, products.base_price_amount)` (BR-021 /
`IMP-D058`). `priceOverrideAmount` is validated only by `^\d{1,12}$`.

```text
base 250.000 ₫  +  override null   →  effective 250.000 ₫   both criteria PASS
base 0 (unset)  +  override null   →  4 FAILS and 10 FAILS  (co-failure)
base 250.000 ₫  +  override "0"    →  4 PASSES, 10 FAILS    ← standalone, drawn
```

Frame `977:413` draws the third row: criterion 4 stays green with an explicit note
(`Giá cơ bản 250.000 ₫ — điều kiện này vẫn đạt`), criterion 10 fails, and the
verdict directs the operator at the SKU's override rather than at the Product's
price. An operator sent to the base-price field here would find nothing wrong with
it and would have no way forward.

### J.4 Vacuity — one presentation rule, no contract change

The contract carries `satisfied: true | false` and nothing else, and the delivered
evaluator marks dependent criteria vacuously satisfied. Rendering that literally
would put a green `Đã đủ điều kiện` on `HAS_ORDER_ELIGIBLE_SKU` for a Product with
no variant at all — true as logic, false as advice.

The rule the design adopts, owned by `N02.A01`:

```text
HAS_ACTIVE_VARIANT unsatisfied
  → HAS_ORDER_ELIGIBLE_SKU and SKU_PRICE_RESOLVABLE render "Chưa xét" (grey)
HAS_ORDER_ELIGIBLE_SKU unsatisfied
  → SKU_PRICE_RESOLVABLE renders "Chưa xét"
```

It is pure presentation, derived from the three criterion codes the client already
holds. It adds no contract field, changes no `eligible` value, and preserves the
evaluator's philosophy — report the root missing fact, never three failures for one
missing prerequisite. Each of States A, B and C therefore names exactly one thing to
do.

---

## K. 1440 frames

| Node | Name |
|---|---|
| `971:187` | Product editor / DRAFT — Phiên bản & SKU chưa có |
| `972:187` | Product editor / DRAFT — 3 phiên bản, 1 mở rộng |
| `973:187` | Product editor / PUBLISHED — phần bán hàng sửa được, field lõi khoá |
| `974:187` | Product editor / PUBLISHED — cảnh báo không thể đặt hàng & khắc phục |

All four reuse the approved editor geometry measured from `APP12-M01.D1`'s
`936:187`: canvas `#FAF8F5`, cards `#FFFFFF`, muted `#F5F3EF`, 1 px `#E7E5E4`
borders, ink `#171717`/`#6B7280`/`#9CA3AF`, accent `#E8475F`, Inter Regular / Semi
Bold at 145 % line height, radii 8/10/12/16/999, main column plus a 310 px aside.
Warning `#D97706`, danger `#DC2626` and success `#16A34A` were taken from the same
page's existing palette rather than invented.

---

## L. 1024 frame

`978:187` — the section at 1024 with the navigation narrowed to 190 px. Each
variant's actions drop to their own row beneath the title instead of competing with
it on the right, so no label is ever compressed. Available content width is
`1024 − 190 − 48 = 786 px`; the widest drawn card is 738 px. The aside column stacks
below the main column and is not redrawn, because it is identical to 1440.

---

## M. 390 frames

| Node | Name | Height |
|---|---|---|
| `979:187` | Mobile 390 — DRAFT · chưa có phiên bản | 760 px |
| `979:222` | Mobile 390 — DRAFT · 3 phiên bản, 1 mở rộng | 1,479 px |
| `979:321` | Mobile 390 — PUBLISHED · cảnh báo & khắc phục | 1,268 px |

Stacked cards, never a table compressed to 390. The variant title and its status
badge occupy separate lines so they cannot collide. Actions are half-width pairs
(`Sửa` / `Ngừng bán`) with `Quản lý tồn kho ↗` on its own full-width row. Recovery
on the PUBLISHED frame is reachable in one tap: `Bán lại` is the primary action of
the SKU row and `+ Thêm SKU` is the second path.

---

## N. Variant/SKU dialogs and refusal states

| Node | Dialog | States drawn |
|---|---|---|
| `975:187` | Thêm phiên bản | default, both labels optional, active toggle, next-step note |
| `975:220` | Thêm phiên bản — từ chối | missing-label refusal **and** duplicate refusal |
| `975:254` | Ngừng bán phiên bản cuối cùng | PUBLISHED last-active-variant confirmation |
| `976:187` | Thêm SKU & Sửa SKU | create default; edit with an active price override |
| `976:269` | SKU thứ hai đang bán | `SKU_ORDER_ELIGIBLE_AMBIGUOUS` refusal + two recoveries |
| `976:300` | Ngừng bán SKU cuối cùng | PUBLISHED last-order-eligible-SKU confirmation |

Every dialog has a heading and a distinct sub-line for its subject, so an accessible
name and description are available without inventing a new pattern. In both
destructive confirmations the state-breaking action is the **second** button and
never the default; the safe action reads `Giữ nguyên`. No dialog contains a delete
affordance.

---

## O. Existing APP8 stock-authority reuse

Reused as authority, unmodified and unredrawn:

```text
FIG-APP8-A01-STOCK-DEFAULT-DESKTOP     775:3
FIG-APP8-A01-STOCK-LOWSTOCK-DESKTOP    775:101
FIG-APP8-A01-STOCK-NEWANCHOR-DESKTOP   776:3
FIG-APP8-A01-STOCK-LOADING-DESKTOP     776:54
FIG-APP8-A01-STOCK-ERROR-DESKTOP       776:142
FIG-APP8-A01-ADJUST-* / -LEDGER-*      777:3 … 777:125
FIG-APP8-A01-STOCK-NARROW              789:3
```

All remain `APPROVED_FOR_IMPLEMENTATION` under
`FIG-APPROVAL-APP8-D01-PO-001`. N02.D01 draws exactly one new thing about stock: the
`Quản lý tồn kho ↗` handoff on a SKU row. No new stock operation is implied, no
absolute-set is invented, and `low_stock_threshold` remains unauthored
(`FU-APP12-G03-02B`).

---

## P. Figma node inventory

File `BQwqV8GdfUIELvsQDB1UQE` · page `APP_12` (`896:3`) · section **`968:187`**
"13 — N02.D01 · Ready-Made sellability authoring".

```text
969:187  Overview — authority, Admin-read preflight, locked decisions   1500 × 782
971:187  1440 DRAFT — empty                                             1440 × 1389
972:187  1440 DRAFT — populated, 1 expanded                             1440 × 1495
973:187  1440 PUBLISHED — sellability editable                          1440 × 1615
974:187  1440 PUBLISHED — unsellable warning & recovery                 1440 × 1271
975:187  Dialog — create variant                                         620 × 608
975:220  Dialog — variant refusals (missing label, duplicate)            620 × 673
975:254  Dialog — deactivate last active variant                         640 × 512
976:187  Dialog — create SKU & edit SKU                                  640 × 1243
976:269  Dialog — second order-eligible SKU refusal                      640 × 692
976:300  Dialog — deactivate last order-eligible SKU                     660 × 537
977:187  Readiness A — no active variant                                 760 × 935
977:300  Readiness B — no order-eligible SKU                             760 × 935
977:413  Readiness C — unresolvable effective price                      760 × 951
977:527  Readiness D — 10/10, stock 0                                    760 × 935
977:638  Readiness E — 10/10, stock > 0                                  760 × 935
978:187  1024 compact                                                   1024 × 1342
979:187  390 DRAFT — empty                                               390 × 760
979:222  390 DRAFT — populated                                           390 × 1479
979:321  390 PUBLISHED — warning & recovery                              390 × 1268
981:187  Handoff — B01/A01 matrix, APP8 reuse, copy inventory           1900 × 1122
```

**Figma authority used.** The project's canonical server, Figma Desktop's local MCP
on `127.0.0.1:3845`, refused connection for the whole session
(`figma-desktop (ConnectionRefused)`). The package was written through the
already-authorized **remote Figma MCP** (`mcp__plugin_figma_figma__*`, authenticated
handle `Di Đan Lê`), which reads and writes the same file. This is the second
checkpoint to use that authority, after `APP12-N01.E01`; `~/.claude.json` still
configures only `figma-desktop`, so the same block should be expected next session.
The Product Owner was not asked again (§19).

---

## Q. Historical supersession

```text
REGISTRY_ROWS_SUPERSEDED = 0
REGISTRY_ROWS_MODIFIED   = 0
```

Nothing is superseded, and this is a deliberate finding rather than an omission.
`FIG-ADMIN-PRODUCT-DRAFT-DESKTOP-DEFAULT` (`434:20`) and
`FIG-ADMIN-PRODUCT-DRAFT-MOBILE-DEFAULT` (`438:90`) remain accurate authority for
the fields they draw — name, description, category, price. They never drew a
variant or SKU surface, because `APP2-A03-G01` correctly removed it when no
operation could serve it. A design that does not contradict this one cannot be
superseded by it; N02 **extends** the editor exactly as `APP12-M01.D1` did with
media. Both old rows keep their approval, their nodes and their pixels.

The registry subsection records this reasoning in prose so a later reader does not
mistake the absence of supersession for an unaudited gap.

---

## R. Registry changes

`docs/design/FIGMA_DESIGN_INDEX.md` — new subsection **§4.14 APP12-N02.D01**,
inserted before §5, carrying:

- the reason the package exists and the datable origin of the gap;
- the mandatory pre-draw audit (every N02-owned term searched; no prior row drew a
  variant or SKU authoring surface);
- the full Admin read-authority preflight, including why the public read is
  structurally unusable;
- the explicit statement that no historical frame was redrawn or superseded;
- 21 rows, all `REVIEW_REQUIRED`, `Supersedes/By` `—`, `Approval Evidence` `—`.

```text
registry IDs   592 → 613
node rows      592 → 613
tables          27 → 28
rows modified            0
approval ids fabricated  0
```

---

## S. B01/A01 authority handoff matrix

Drawn in full at `981:187`; reproduced here.

| UI state / action | Required authority | Existing vs N02.B01-owned |
|---|---|---|
| Read product detail for the editor | `GET /api/admin/products/{productId}` — `adminProduct_detail` | **EXISTS**, but carries no variant/SKU data |
| List all variants and SKUs of a product | `GET /api/admin/products/{productId}/variants` | **N02.B01 (NEW)** — must return inactive rows, `code`, `isActive`, `priceOverrideAmount`, stable ids |
| Create variant | `POST /api/admin/products/{productId}/variants` | **N02.B01 (NEW)** — server computes `display_order` (`NOT NULL`, no default) |
| Update / deactivate / reactivate variant | `PATCH /api/admin/products/{productId}/variants/{variantId}` | **N02.B01 (NEW)** — no DELETE; refuses duplicates and both-labels-blank |
| Create SKU | `POST …/variants/{variantId}/skus` — `adminSku_create` | **EXISTS**, 0 Admin call sites — A01 adds the first |
| Update / deactivate / reactivate SKU | `PATCH /api/admin/skus/{skuId}` — `adminSku_update` | **EXISTS**, 0 Admin call sites; `SKU_ORDER_ELIGIBLE_AMBIGUOUS` already refused correctly |
| Open the stock screen | `/kho/skus/{skuId}` + `adminSkuStock_get` | **EXISTS**; only the link is missing — `FU-APP12-N02-STOCK-REACHABILITY`, A01 |
| Read publication readiness | `GET …/publication-readiness` | **EXISTS**; B01 must extend the **facts** (`ProductPublicationSnapshot` reads no variant/SKU row at all), not only the rule set |
| Publish | `POST …/publish` | **EXISTS**; re-evaluates against all ten criteria; no second publish path |

```text
NEW_BACKEND_OPERATIONS = 3      (within the §2 maximum and backend checkpoint governance)
NEW_STOCK_OPERATIONS   = 0
OPENAPI_CHANGES_IN_D01 = 0
```

The §2 question is answered without ambiguity: **`adminProductVariant_list` is
required.** No existing Admin read is sufficient.

---

## T. Design validation

Every new frame was re-opened and inspected after drawing; four defects were found
and repaired in place.

| Check | Result |
|---|---|
| Every new frame re-opened and screenshotted | 21/21 |
| Node ids verified against the registry | 21/21 match |
| Registry pointers resolve to the drawn nodes | verified |
| Horizontal overflow, absolute-bounds, all 21 frames | worst right-edge overflow **0 px**, worst left **0 px** |
| 390 touch targets ≥ 44 px | 22/22 buttons, minimum 45 px |
| Hidden primary action | none — every state's primary action is on-frame |
| Destructive DELETE affordance | **0** across 21 frames (mechanical scan of every text node) |
| `stock > 0` as a publication requirement | absent; States D and E carry identical lists |
| Low-stock-threshold authoring | absent |
| Colour-only warnings | none — icon + heading + counted evidence block |

**Defects found by looking, and fixed:**

1. Wrapped text was clipped to a 10 px height in the first overview build, because
   the width was set before the node was parented. Every text node is now created
   parented and sized with `FILL`/`FIXED` afterwards. The frame was rebuilt.
2. The disclosure carets were unreadable — first as text glyphs that rendered as
   specks, then as polygons rotated the wrong way (up/left instead of down/right).
   All five were replaced with correctly rotated polygons.
3. The handoff matrix's fourth column overflowed its frame by 22 px and was
   silently clipped. Column widths were reduced to `400/600/290/450`; the worst row
   now has 16 px of slack.
4. Mobile buttons measured 43 px, one pixel under the 44 px target. Vertical
   padding was raised to 13 px; the minimum is now 45 px.

**Command run** (scoped, `VALIDATION_GOVERNANCE.md` §3, `CMD-CHECK-FIGMA-DESIGN-INDEX`):

```text
node tools/check-figma-design-index.mjs
→ Figma Design Index check passed
  (613 registry IDs, 613 node rows, 28 registry table(s);
   canonical files + statuses + deep links + composites verified)
  exit 0
```

No implementation test suite was run: this checkpoint changes no runtime source, so
none is justified.

---

## U. Files changed

```text
M  docs/design/FIGMA_DESIGN_INDEX.md
     +§4.14 APP12-N02.D01, 21 rows REVIEW_REQUIRED; 0 existing rows modified
A  docs/implementation/reports/APP12-N02-D01-COMPLETION-REPORT.md
M  docs/implementation/phases/APP12-HARDENING-UAT-PRODUCTION-READINESS.md
     N02.G01 → COMPLETE — PO PASS; N02.D01 → COMPLETE — AWAITING_PO_REVIEW
```

Figma: 1 new section, 21 new frames on page `APP_12`. No existing Figma node was
modified or removed.

---

## V. Hygiene

```text
RUNTIME_SOURCE_CHANGES        0
DB_WRITES                     0
MIGRATIONS_ADDED              0   (no 0040)
OPENAPI_CHANGES               0
GENERATED_CLIENT_CHANGES      0
SHARED_DEV_MUTATIONS          0
.env WRITES                   0
SECRET_BEARING_VARS_USED      0
PRODUCTION_DEPLOYED           false
PUSHED                        false
N02.B01 EXECUTED              false
N02.A01 EXECUTED              false
N02.E01 EXECUTED              false
U01 RESUMED                   false
APPROVAL_IDS_FABRICATED       0
```

---

## W. N02 roadmap

```text
N02.G01  gap audit                                        COMPLETE — PO PASS
N02.D01  bounded Admin sellability design                 COMPLETE — AWAITING_PO_REVIEW  ← here
N02.B01  variant write authority + 3 readiness criteria   PENDING (NOT_AUTHORIZED)
N02.A01  Admin variant/SKU/stock authoring UI             PENDING (NOT_AUTHORIZED)
N02.E01  operator authoring acceptance                    PENDING (NOT_AUTHORIZED)

APP12-U01 = SUSPENDED_PENDING_BLOCKER_RECOVERY
APP12-E01 = NOT_AUTHORIZED
APP12-R01 = NOT_AUTHORIZED
```

On PO approval a single `FIG-APPROVAL-APP12-N02-D01-PO-001` moves all 21 rows to
`APPROVED_FOR_IMPLEMENTATION`. `N02.B01` may not begin before that, because it would
be implementing against `REVIEW_REQUIRED` frames.

```text
APP12-N02.D01 = COMPLETE — AWAITING_PO_REVIEW
APP12-N02     = DESIGN_REVIEW_REQUIRED

NEXT = PO_REVIEW_REQUIRED
```
