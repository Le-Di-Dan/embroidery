# APP2-D03 — Admin Product List Design Approval Record

**Approval ID:** FIG-APPROVAL-APP2-D03-CATALOG-LIST-001
**Product Owner review result:** PASSED — `PRODUCT_OWNER_APPROVED — D03_RECONCILED`
**Owning design checkpoint:** APP2-D03 (`reports/APP2-D03-COMPLETION-REPORT.md`)
**Cures:** `APP2-A02 = BLOCKED_BY_CATALOG_LIST_DESIGN_CONTRADICTION`
**Recorded:** 2026-07-31

---

## 1. Statement

The `APP2-A02` implementation gate blocked before any code was written, and it blocked
correctly. Two provable contradictions existed between the canonical `APP2-A02` scope and
the frozen Catalog List design:

1. The canonical A02 scope (APP2 phase plan §6.1, checkpoint 9) locks **list, filters,
   pagination, loading, empty and error**, but none of the three frozen Catalog nodes
   contained a **status filter** or a **category filter**.
2. The frozen nodes carried a `Tạo sản phẩm` CTA and the row actions `Chỉnh sửa`,
   `Xuất bản` and `Gỡ xuất bản`. Those capabilities belong to `APP2-A03` and `APP2-A04`,
   whose routes and interactions **do not exist at A02 delivery time**. Shipping them
   would put controls in front of an operator that lead nowhere.

This record is the canonical human-review evidence for the **Admin Product List** subset
that `APP2-A02` implements. The underlying Product Owner ruling of 2026-07-26 already
froze the Admin surfaces; `APP2-D01-ADMIN-ASSETS-DESIGN-APPROVAL.md` §2 explicitly scoped
itself to Assets and left Admin Catalog to be recorded by its own consuming checkpoint.
This record does that, and additionally captures the two new Product Owner decisions
(filters, staged read-only actions) that the reconciliation required.

## 2. Approved scope

The Admin Product List screen (`Sản phẩm`) inside the accepted APP1 Admin shell: a
**read-only** product collection with status and category filters, lifecycle status,
cursor continuation, and empty state — desktop 1440 and mobile 390.

**Not approved by this record:** Admin Product Draft (`APP2-A03`), Admin Publication
(`APP2-A04`), and every Storefront row. Those rows remain `REVIEW_REQUIRED` and must
record their own approval evidence before implementation.

## 3. Approved registry entries (3)

These `docs/design/FIGMA_DESIGN_INDEX.md` §4.3 rows move
`REVIEW_REQUIRED → APPROVED_FOR_IMPLEMENTATION`, evidence
`FIG-APPROVAL-APP2-D03-CATALOG-LIST-001`.

| Registry ID | State | Viewport | Node | Deep link |
|---|---|---|---|---|
| FIG-ADMIN-CATALOG-DESKTOP-DEFAULT | Default | Desktop 1440 | 439:100 | https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=439-100 |
| FIG-ADMIN-CATALOG-DESKTOP-EMPTY | Empty | Desktop 1440 | 440:102 | https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=440-102 |
| FIG-ADMIN-CATALOG-MOBILE-DEFAULT | Default | Mobile 390 | 440:191 | https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=440-191 |

One supporting annotation node was added:
`FIG-ADMIN-CATALOG-FILTERS-ACTIONS-HANDOFF` (`498:272`) — the filter behaviour,
continuation states, staged-action and approval-handoff specification. It is an
annotation, not a competing screen authority, and enters as `REVIEW_REQUIRED`.

## 4. Decision — A02 is a read-only list capability

At `APP2-A02` delivery time the Product List renders **none** of:

```text
Tạo sản phẩm · Chỉnh sửa · Xuất bản · Gỡ xuất bản · Lưu trữ · Xoá
```

Rationale: create and edit belong to `APP2-A03`; publish and unpublish belong to
`APP2-A04`; archive has no approved Catalog List control at all; delete is not an APP2
capability. A control must not exist before the capability behind it does.

Applied to the nodes:

- **Desktop** — the header CTA and the entire `Hành động` column are removed. The table is
  `Sản phẩm` / `Danh mục` / `Trạng thái`, with the product column filling the width the
  action column released.
- **Mobile** — the create button and the per-card action group are removed; the card stays
  informational (media placeholder, name, category, status).
- **Empty state** — no primary action. Approved copy:

  ```text
  Chưa có sản phẩm
  Các sản phẩm sẽ xuất hiện tại đây sau khi bản nháp đầu tiên được tạo.
  ```

### Staged restoration handoff

```text
APP2-A03 restores:  Tạo sản phẩm · Chỉnh sửa / mở chi tiết
APP2-A04 adds:      Xuất bản · Gỡ xuất bản · publication readiness interactions
```

`APP2-A03` and `APP2-A04` supplement the list; neither redefines its base layout, and
`APP2-A02` is **not** re-sequenced after them merely to keep dead controls on screen.

## 5. Decision — status and category filters

Exactly two filters, no more.

**Status** — label `Trạng thái`, default `Tất cả trạng thái`.

| Option | Wire |
|---|---|
| Tất cả trạng thái | no `status` parameter |
| Bản nháp | `DRAFT` |
| Đã xuất bản | `PUBLISHED` |
| Đã lưu trữ | `ARCHIVED` |

**Category** — label `Danh mục`, default `Tất cả danh mục`.

| Option | Wire |
|---|---|
| Tất cả danh mục | no `categorySlug` parameter |
| Thú bông | `thu-bong` |
| Khăn | `khan` |
| Quần áo | `quan-ao` |
| Khác | `khac` |

The four categories are the closed IMP-D032 taxonomy; no category endpoint is called and
no category UUID is ever displayed. Not added: search, sort selector, price filter, date
filter, owner filter.

**Composition** — desktop places a compact filter row below the page subtitle and above
the table, status first, in the existing DS `Input` visual language, sized to its content
rather than stretched across the content area. Mobile stacks the two filters vertically at
full content width, status first, 48 px field height (≥ 44 px target). Labels stay visible
in both; no icon-only trigger and no modal filter sheet.

**Behaviour** — changing either filter resets pagination and requests a fresh first page;
pages are never merged across filters. Unknown query values normalize safely to the
`Tất cả …` default and the raw value is never rendered. During a filter change the filter
controls stay visible and the empty state is withheld until the request succeeds. The
filter-specific empty state reuses the same composition with contextual copy:

```text
Không có sản phẩm phù hợp
Hãy thử chọn trạng thái hoặc danh mục khác.
```

No “clear all” control is introduced.

## 6. Decision — continuation

The `APP2-D02` cursor pattern is reused verbatim with product copy: `Tải thêm sản phẩm`,
shown only when `hasNext = true`, placed after the collection, appending rather than
replacing, keeping existing items and scroll position, `Đang tải thêm…` while loading, and
`Không thể tải thêm sản phẩm.` + `Thử lại` on failure reusing the same cursor. No infinite
scroll, no total count, no page numbers.

## 7. Decision — price and search exclusions

**Price is not an `APP2-A02` field.** No price column is added to the Product List nodes;
price belongs to the `APP2-A03` form/detail and to publication readiness. The `APP2-B02`
wire contract is unchanged — `basePriceAmount` continues to be returned and simply is not
rendered by this screen.

**Search is excluded.** No search input exists in the Catalog authority, working search is
out of APP2 scope, and no decorative or client-side-only search is permitted.

## 8. Ownership correction

The handoff annotation `450:404` previously mapped A02 → Product Draft and A03 → Catalog,
contradicting the canonical checkpoint map. Canonical ownership is:

```text
APP2-A02 — Admin Product List           439:100 · 440:102 · 440:191
APP2-A03 — Admin Product Form/Detail    434:20 · 436:37 · 436:140 · 438:90 · 437:73
APP2-A04 — Publication Interaction      441:106 · 442:110 · 442:205 · 443:121
```

The corrected checkpoint order is unchanged: A02 precedes A03.

## 9. Supersession / re-review rule

Promotion authorizes implementation of the exact approved nodes only. Any further material
change requires a new design revision entering `REVIEW_REQUIRED` and a fresh Product Owner
approval; implementation must not silently track edits to an approved node. This record
does not approve the Product Draft, Publication or Storefront rows, and does not revive
the Storefront Product List nodes deleted at `APP2-D01-C1`.

## 10. Provenance

This record captures a Product Owner decision only. It contains no personal contact
details and no conversation transcript.
