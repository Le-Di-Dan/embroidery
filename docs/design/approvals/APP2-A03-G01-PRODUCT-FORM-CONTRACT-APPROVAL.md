# APP2-A03-G01 — Admin Product Form / Contract Reconciliation Approval

**Evidence ID:** `FIG-APPROVAL-APP2-A03-G01-PRODUCT-FORM-001`
**Date:** 2026-07-31
**Gate:** `APP2-A03-G01` — entry gate under `APP2-A03` ownership
**File:** `BQwqV8GdfUIELvsQDB1UQE` · page `APP_02` (`419:3`) · section `423:3`
**Status:** Product Owner reconciliation recorded; five Admin Product Form rows promoted to
`APPROVED_FOR_IMPLEMENTATION`.

---

## 1. Why this record exists

The mandatory `APP2-A03` pre-code design/contract audit **blocked before any source file
was written** with `BLOCKED_BY_PRODUCT_FORM_DESIGN_CONTRACT_CONTRADICTION`. The block was
accepted as correct by the reviewer.

The existing `APP2-D01` Product Draft authority could not be implemented truthfully against
the delivered `APP2-B02` contract. This gate reconciles the **existing** nodes in place. It
is **not** a new design package and **not** `APP2-D04`.

> **`APP2-D04` does not exist in the APP2 plan and must not be created.** The canonical
> sequence remains `APP2-A02` → `APP2-A03` → `APP2-B03`.

---

## 2. The proven contradiction

All five approved A03 nodes were **one screen in five states**, headed `Sản phẩm mới`, with
a single atomic primary action `Lưu bản nháp`.

| # | Contradiction | Evidence |
| --- | --- | --- |
| B1 | **No edit/detail design existed at all.** A03's locked scope is create/edit/detail and `adminProduct_detail` + `adminProduct_update` are delivered, but no frame depicted an existing product. All 26 frames in section `423:3` were enumerated; the only "Product Detail" frames are **Storefront** (`447:204`, `448:204`, `448:210`, `449:357`), a different capability. | live section scan |
| B2 | **Media sat on the create screen under one atomic save.** `createProductBodySchema` is `.strict()` and accepts exactly `categorySlug`, `name`, `description?`. `mediaAssetIds` exists only on PATCH, so saving the screen as drawn required create → update, with a partial-failure window (product created, images lost) that no state represented. | `435:27`, `437:73` vs `admin-product.request.ts` |
| B3 | **`Phiên bản & SKU` had no contract field anywhere** — not in create, not in update, not in the detail response, and not owned by A04 (publish/unpublish) or B03 (publication readiness). | `435:44`, `435:48`, `435:53` |
| B4 | **`basePriceAmount` is accepted by PATCH but had no approved surface.** No price field existed in any node, and the readiness card omitted price — yet the draft sentinel is `"0"`, so a draft can never become publishable without one. | all five nodes |

Non-blocking defects recorded at the same time: the category sample `Phụ kiện thêu tay`
predates the locked IMP-D032 taxonomy; media identity used fabricated filenames
(`sen-do-01.png`, `khan-tay-hoa.jpg`, `goi-tua-lotus.jpg`) although B01 returns no original
filename; `Tới bước xuất bản` pointed at a capability that does not exist; and ordering was
specified as drag-only.

---

## 3. Registry entries approved by this record

| Registry ID | Node | Screen / State | Viewport | Status |
| --- | --- | --- | --- | --- |
| `FIG-ADMIN-PRODUCT-DRAFT-DESKTOP-DEFAULT` | `434:20` | Product Form — Edit/Detail Default | Desktop 1440 | `APPROVED_FOR_IMPLEMENTATION` |
| `FIG-ADMIN-PRODUCT-DRAFT-DESKTOP-VALIDATION` | `436:37` | Product Form — Edit/Detail Validation | Desktop 1440 | `APPROVED_FOR_IMPLEMENTATION` |
| `FIG-ADMIN-PRODUCT-DRAFT-DESKTOP-SAVING` | `436:140` | Product Form — Edit/Detail Saving | Desktop 1440 | `APPROVED_FOR_IMPLEMENTATION` |
| `FIG-ADMIN-PRODUCT-DRAFT-MOBILE-DEFAULT` | `438:90` | Product Form — Edit/Detail Default | Mobile 390 | `APPROVED_FOR_IMPLEMENTATION` |
| `FIG-ADMIN-PRODUCT-MEDIA-SELECT-DESKTOP` | `437:73` | Media Select Dialog | Desktop 1440 | `APPROVED_FOR_IMPLEMENTATION` |

Supporting annotation, registered but **not** promoted:

| Registry ID | Node | Status |
| --- | --- | --- |
| `FIG-ADMIN-PRODUCT-FORM-CONTRACT-HANDOFF` | `521:284` | `REVIEW_REQUIRED` (annotation) |

**Deliberately not promoted by this record:** `FIG-ADMIN-PUBLICATION-*` (4 rows) and every
`FIG-STOREFRONT-PRODUCT-DETAIL-*` row. `APP2-A04` and `APP2-B03` must record their own
approval evidence.

Registry count: **71 → 72**.

---

## 4. Approved decision — one capability, two explicit modes

### Create mode — `/products/new`

Shows exactly the three fields `adminProduct_create` accepts:

- `Tên sản phẩm` → `name`
- `Danh mục` → `categorySlug`
- `Mô tả` → `description` (optional)

Primary action `Tạo bản nháp`; secondary `Huỷ` returns to `/products`. **Exactly one POST**
— no hidden PATCH may be presented as part of the same save. On success the authoritative
`productId` from the response drives a redirect to `/products/{productId}`.

Not shown before the product exists: `Giá cơ bản`, `Ảnh sản phẩm`, `Đường dẫn`,
`Phiên bản`, `SKU`, `Điều kiện xuất bản`, `Tới bước xuất bản`.

Create mode is authorised as a **handoff supplement** on the annotation node rather than a
sixth full-screen frame: it reuses the edit shell and styling with fewer sections, so a
duplicate screen would add maintenance surface without adding authority.

### Edit/detail mode — `/products/{productId}`

Loads with `adminProduct_detail`, saves with `adminProduct_update`.

Editable: `Tên sản phẩm`, `Danh mục`, `Mô tả`, `Giá cơ bản`, `Ảnh sản phẩm`.
Read-only metadata: `Trạng thái`, `Đường dẫn` (slug).
Primary action `Lưu thay đổi`; secondary `Huỷ thay đổi`.

Every PATCH carries `expectedUpdatedAt` = the `updatedAt` of the loaded record. Only fields
that actually changed are sent. Description follows the B02-C1 contract exactly: **absent
leaves it unchanged; null or blank clears it to NULL.**

---

## 5. Price

`Giá cơ bản` is added to **edit/detail only**, because POST does not accept
`basePriceAmount`.

- Whole đồng as a **string**; no separators, no decimals, no floating-point conversion.
- Non-negative; the server bound is twelve integer digits.
- Wire `"0"` means **the price has not been set**, and a blank UI value maps to that
  sentinel.
- `0 ₫` must never be rendered as a completed price.

Approved helper text: `Số nguyên đồng, không dấu phân cách. Để trống nếu chưa xác định giá.`

Price stays an **editable draft field in A03** — it does not move to A04.

---

## 6. Slug and status

**Slug** is server-owned, immutable and read-only, shown only in edit mode. Changing the
product name must not visually imply the address changes. The approved node states this
directly: `Do hệ thống tạo và không thay đổi, kể cả khi đổi tên sản phẩm.`

The public path pattern is deliberately **not** asserted here — `450:404` still records
`/san-pham/<slug>` as an unconfirmed proposal, so the frame shows the bare slug value.

**Status** is read-only, rendered as a text label with a visual marker, never an editable
select. A03 changes no lifecycle state: no publish, unpublish, archive or delete control
appears on any of the five nodes.

---

## 7. Variants and SKU — removed and deferred

`Phiên bản & SKU`, `Tên phiên bản` and `Mã SKU` are removed from A03 visual authority
because **the delivered B02 Admin Product contract neither exposes nor persists them**.
Shipping them would have meant inactive inputs that look functional, or local-only fake
persistence.

```
FU-APP2-PRODUCT-VARIANTS-SKU-01 = DEFERRED_BEYOND_APP2_CATALOG_ALPHA
```

Nonblocking. No backend operation was added and no field is stored locally as though saved.

---

## 8. Media selection, ordering and identity

Media exists **only after the product has been created**, and is saved through the B02
complete ordered replacement `mediaAssetIds`.

**Eligibility** — only assets with `kind = CATALOG_MEDIA`,
`classification = PRODUCTION_SENSITIVE`, `status = ACCEPTED` are selectable. Processing and
rejected assets never appear in the picker.

**Identity** follows B01/D02, because the server stores and returns **no original filename**:

| `mediaType` | Label |
| --- | --- |
| `image/png` | Ảnh PNG |
| `image/jpeg` | Ảnh JPEG |
| `image/webp` | Ảnh WebP |
| anything else | Tài sản hình ảnh |

Secondary line: `{size} · {createdAt}`. The three fabricated filenames were removed from
both the selected-media list and the picker dialog.

**Placeholders only.** There is no authenticated thumbnail-delivery contract, so no frame
depicts real pixels and no URL is invented. `APP2-T01` remains separate and routed.

**Ordering** — first selected asset is `THUMBNAIL` (`Ảnh đại diện`), the rest are `GALLERY`
(`Ảnh thư viện`); `DETAIL` is excluded. Every row carries keyboard-operable
`Di chuyển trước` / `Di chuyển sau` controls, disabled at the ends, plus `Gỡ ảnh`. Drag may
remain as an optional convenience but **must not be the only ordering method** — the
previous help text, which specified drag alone, was rewritten.

There is **no arbitrary maximum** media count. `Gỡ ảnh` removes only the product-media
association; it never deletes an asset or a derivative.

---

## 9. Asset selector pagination

The picker reuses the approved cursor pattern and must represent: initial loading,
populated, empty, continuation available, continuation loading, continuation failure, and
end of list.

- `Tải thêm tài sản` appears only while `hasNext` is true.
- Loading: `Đang tải thêm…` with `aria-busy`.
- Failure: existing items remain, `Thử lại` re-sends **the same cursor**.
- No infinite scroll, no page numbers, no total count.
- The selector must never silently stop at page one.

The dialog frame depicts the populated + continuation-available state; the remaining states
are specified on the annotation node rather than duplicated as full-screen frames.

---

## 10. Version conflict

`PRODUCT_VERSION_CONFLICT` (HTTP 409) is handled with approved copy:

```
Sản phẩm đã được cập nhật ở nơi khác

Dữ liệu trên máy chủ đã thay đổi kể từ lần bạn mở sản phẩm này.
Hãy tải lại để xem phiên bản mới nhất trước khi tiếp tục chỉnh sửa.
```

Primary action `Tải lại dữ liệu`; secondary `Đóng`.

No force-save. No automatic retry with the stale `expectedUpdatedAt`. Reloading discards
local unsaved edits only after the operator confirms. Timestamps, token values and request
IDs are never shown as the explanation.

---

## 11. Unsaved changes

```
Bỏ các thay đổi chưa lưu?

Những thay đổi trên màn hình này sẽ không được lưu.
```

Actions: `Rời khỏi trang` / `Tiếp tục chỉnh sửa`. Applies to `Huỷ`, Admin internal
navigation and the supported `beforeunload` seam. A pristine form never prompts, and a
successful save clears the dirty state.

---

## 12. Publication boundary

Removed from A03 authority: `Điều kiện xuất bản`, `Tới bước xuất bản`, `Xuất bản`,
`Gỡ xuất bản` and any publication-readiness operation.

A03 shows only the current draft status. Publication readiness and lifecycle interaction
remain **`APP2-B03`** and **`APP2-A04`**.

---

## 13. Product List integration

When `APP2-A03` implementation ships, `APP2-A02` restores exactly two entry points:

- `Tạo sản phẩm` → `/products/new`
- `Chỉnh sửa` → `/products/{productId}`

Nothing else. `Xuất bản`, `Gỡ xuất bản`, `Lưu trữ` and `Xoá` stay out, and A02's approved
filters, cursor continuation and list states are preserved unchanged. The base list is not
redesigned.

---

## 14. Responsive authority

**Desktop** keeps the two-column composition: the main form plus a **compact read-only
metadata rail** (status, slug). The publication rail is gone.

**Mobile (390)** is single column with visible labels, 48px controls, the price input
present, keyboard/touch-operable media ordering (the action row wraps rather than
overflowing), and both save and cancel reachable. Measured content width is 358 inside
16px padding — **no horizontal overflow at 390px**.

---

## 15. Node changes recorded

| Node | Was | Now |
| --- | --- | --- |
| `434:20` | Product Draft / Desktop / Default | Product / Edit-Detail / Desktop / Default — 1440×1644 |
| `436:37` | Product Draft / Desktop / Validation | Product / Edit-Detail / Desktop / Validation — 1440×1801 |
| `436:140` | Product Draft / Desktop / Saving | Product / Edit-Detail / Desktop / Saving — 1440×1722 |
| `437:73` | Product Media Select / Desktop | Product / Media Select / Desktop — 1440×1644 |
| `438:90` | Product Draft / Mobile / Default | Product / Edit-Detail / Mobile / Default — 390×1480 |
| `521:284` | — | **new** annotation `FIG-ADMIN-PRODUCT-FORM-CONTRACT-HANDOFF` |

Verification sweep across all five frames: **zero** occurrences of `Sản phẩm mới`,
`Phiên bản`, `SKU`, `Điều kiện xuất bản`, `Tới bước xuất bản`, `Lưu bản nháp`,
`Phụ kiện thêu tay`, `Gỡ xuất bản` or `Lưu trữ`, and **zero** filename-shaped strings.

---

## 16. Supersession

This record reconciles, and does not replace, `APP2-D01`. Node IDs, section placement and
`APP2-D01` provenance are unchanged; only the content within the five frames was amended.

No APP1 row, no Publication row, no Storefront row and no Asset row is superseded. The
canonical checkpoint order `APP2-A02` → `APP2-A03` → `APP2-B03` is unchanged, and
`APP2-A03-G01` is an entry gate **under A03 ownership**, not a new phase checkpoint.

Any later amendment to these five nodes requires a new approval record; this evidence ID
covers the state described above.
