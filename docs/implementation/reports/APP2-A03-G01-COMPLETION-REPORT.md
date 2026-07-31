# APP2-A03-G01 — Product Form Contract Reconciliation Gate — Completion Report

**Gate:** `APP2-A03-G01` — entry gate under `APP2-A03` ownership (not a phase checkpoint, **not `APP2-D04`**)
**Phase:** APP2 — Assets and Catalog Publication
**Status:** `COMPLETE — DELIVERED_FOR_REVIEW`
**Verdict:** `PASS`
**Date:** 2026-07-31

---

## A. Preflight and blocked A03 evidence

`APP2_A03_G01_PREFLIGHT = PASS`.

| Check | Result |
| --- | --- |
| Branch | `production` |
| Entry `HEAD` | `9f05b0d3c6bd3f4ff0c857fd71bed1a216e82c15` — `docs(app2): record Admin Product List evidence`, the exact `APP2-A02` evidence Commit B |
| Tracked/staged changes | none |
| A03 implementation present | none — `apps/admin/src/features/products/` holds only the A02 list capability; the `/products` route segment contains only `page.tsx` |
| `APP2-D04` artifact | none anywhere in the repository |
| `pnpm quality` | EXIT 0 |
| `pnpm check:openapi` | up to date |
| `pnpm check:api-client` | tree hash `3e3e267d…` |
| `pnpm check:figma-design-index` | 71 registry IDs (entry) |
| `node --test tools/check-figma-design-index.test.mjs` | 19/19 pass |
| `pnpm db:check:manifest` | all checks passed |
| `git diff --check` | clean |

**The blocked A03 entry is confirmed and was correct.** The mandatory pre-code audit stopped
before any source file, commit or Figma edit with
`BLOCKED_BY_PRODUCT_FORM_DESIGN_CONTRACT_CONTRADICTION`. No `APP2-D04`, no `APP2-A03-C1`,
no implementation commit and no backend change was created then or now.

**`evidences/`** — the user-owned directory is now present but **empty**; its three files
were removed outside this session. It was neither recreated, deleted, staged nor claimed.

Accepted chains verified from Git: `APP2-D01`/`D01-C1` (Product Owner ruling), `APP2-B01`
(`a1cb712` + `adba51d`), `APP2-B02-G01` (`356d6e7` + `fffa495`), `APP2-B02`/`B02-C1`
(`14c80f0` + `13fa4f2`, `90e00d7` + `0bf4686`), `APP2-D03` (`561c058` + `5b2f78e`),
`APP2-A01`/`A01-C1` (`5816412` + `6f12c4d`, `77691ab` + `bb4ebb9`), `APP2-A02`
(`2ae36de` + `9f05b0d`), and the APP1 Admin auth/shell/query/style foundations.

---

## B. Live-node contradiction audit

All five nodes were re-read live — structure, names, text, sizing and rendered screenshots —
and all 26 frames in section `423:3` were enumerated to test the "no edit design" claim
rather than assume it.

**Reproduced finding: the five "A03 nodes" were one screen in five states.** Every one was
headed `Sản phẩm mới` with a single atomic primary action `Lưu bản nháp`.

| # | Contradiction | Evidence |
| --- | --- | --- |
| B1 | **No edit/detail design existed.** A03 owns create/edit/detail and `adminProduct_detail` + `adminProduct_update` are delivered, but no frame showed an existing product — no loaded-detail state, no server-owned read-only surface. The only "Product Detail" frames are Storefront (`447:204`, `448:204`, `448:210`, `449:357`), a different capability (S02). | full section scan |
| B2 | **Media sat on the create screen under one atomic save.** `createProductBodySchema` is `.strict()`: `{ categorySlug, name, description? }`. `mediaAssetIds` is PATCH-only, so the screen as drawn required create → update, with a partial-failure window (product created, images lost) that no state represented. | `435:27`, `437:73` |
| B3 | **`Phiên bản & SKU` matched no contract field at all** — absent from create, update and the detail response, and owned by neither A04 (publish/unpublish) nor B03 (publication readiness). | `435:44`, `435:48`, `435:53` |
| B4 | **`basePriceAmount` had no approved surface.** PATCH accepts it and the draft sentinel is `"0"`, so a draft can never become publishable without a price — yet no price field existed and the readiness card omitted it. | all five nodes |

Non-blocking defects recorded at the same time: the category sample `Phụ kiện thêu tay`
predates IMP-D032; media identity used fabricated filenames although B01 stores and returns
none; `Tới bước xuất bản` pointed at a capability that does not exist; ordering was
specified drag-only.

Registry status at entry: all five rows were `REVIEW_REQUIRED` with empty evidence cells.
The Product Owner ruling authorised consuming them, so this was recorded as a fact rather
than treated as the blocking cause — the four contradictions above are substantive.

---

## C. Exact B02 contract matrix

Read from the delivered source of truth
(`apps/api/src/modules/catalog/presentation/schemas/admin-product.request.ts` and the
committed OpenAPI artifact), not inferred.

| Field | `adminProduct_create` (POST, `.strict()`) | `adminProduct_update` (PATCH, `.strict()`) | `adminProduct_detail` (GET) |
| --- | --- | --- | --- |
| `categorySlug` | **required**, enum of 4 | optional, enum of 4 | `category { name, slug }` |
| `name` | **required**, trimmed 1–200 | optional, trimmed 1–200 | present |
| `description` | optional, ≤5000 | optional, **nullable** (absent = unchanged; null/blank = clear) | optional |
| `basePriceAmount` | **absent** | optional, `^\d{1,12}$` whole đồng string | present (`"0"` = not set) |
| `mediaAssetIds` | **absent** | optional, complete ordered UUID array | `media[]`, `primaryMedia?` |
| `expectedUpdatedAt` | — | **required**, ISO datetime | `updatedAt` is the token |
| `slug` | server-owned | not accepted | present, immutable |
| `status` | server-owned (`DRAFT`) | not accepted | present |
| variant / SKU | **does not exist** | **does not exist** | **does not exist** |

PATCH additionally requires at least one changed field. Relevant errors:
`PRODUCT_VERSION_CONFLICT` (409), `PRODUCT_NOT_EDITABLE` (409), `PRODUCT_MEDIA_DUPLICATE`
(400), `PRODUCT_MEDIA_ASSET_NOT_FOUND` (400), `PRODUCT_MEDIA_ASSET_UNAVAILABLE` (409),
`PRODUCT_NOT_FOUND` (404). Media eligibility is `CATALOG_MEDIA` /
`PRODUCTION_SENSITIVE` / `ACCEPTED`; roles are `THUMBNAIL` (position 0) and `GALLERY`.

---

## D. Create/edit mode decision

One capability, two explicit modes (IMP-D034).

**Create — `/products/new`.** Exactly the three POST fields (`Tên sản phẩm`, `Danh mục`,
`Mô tả`), `Tạo bản nháp` / `Huỷ`, **one POST with no hidden PATCH**, then redirect to
`/products/{productId}` using the authoritative returned id. Price, media, slug, variants,
SKU and publication readiness are absent before the product exists.

**Edit/detail — `/products/{productId}`.** Loaded by `adminProduct_detail`, saved by
`adminProduct_update`. Editable: name, category, description, `Giá cơ bản`, `Ảnh sản phẩm`.
Read-only metadata: `Trạng thái`, `Đường dẫn`. `Lưu thay đổi` / `Huỷ thay đổi`. Every PATCH
carries `expectedUpdatedAt` from the loaded record and sends only changed fields.

Create mode is authorised as a **handoff supplement on the annotation node** rather than a
sixth full-screen frame: it reuses the edit shell with fewer sections, so a duplicate screen
would add maintenance surface without adding authority. §7 of the gate explicitly prefers
this.

---

## E. Existing-node updates

| Node | Before | After | Size |
| --- | --- | --- | --- |
| `434:20` | Product Draft / Desktop / Default | **Product / Edit-Detail / Desktop / Default** | 1440×1380 → 1440×1644 |
| `436:37` | Product Draft / Desktop / Validation | **Product / Edit-Detail / Desktop / Validation** | 1440×1380 → 1440×1801 |
| `436:140` | Product Draft / Desktop / Saving | **Product / Edit-Detail / Desktop / Saving** | 1440×1380 → 1440×1722 |
| `437:73` | Product Media Select / Desktop | **Product / Media Select / Desktop** | 1440×1380 → 1440×1644 |
| `438:90` | Product Draft / Mobile / Default | **Product / Edit-Detail / Mobile / Default** | 390×1180 → 390×1480 |
| `521:284` | — | **new** annotation `FIG-ADMIN-PRODUCT-FORM-CONTRACT-HANDOFF` | 1560×1367 |

Changes applied to the edit shell:

- Heading `Sản phẩm mới` → an existing product name; subtitle rewritten to edit semantics.
- `Lưu bản nháp` → `Lưu thay đổi`; `Huỷ` → `Huỷ thay đổi`.
- **Added** `Group / Giá` with `Giá cơ bản`, cloned from the category group so tokens and
  styling carry over; the chevron was removed because a select would imply a fixed option
  list.
- **Added** `Card / Đường dẫn (chỉ đọc)` in the rail with the slug value and the
  immutability note.
- **Removed** `Group / Phiên bản & SKU` (`435:44`) and `Card / Điều kiện xuất bản`
  (`435:64`, which contained `Tới bước xuất bản`). The rail is renamed `Metadata rail`.
- **Rebuilt** the selected-media list: three fabricated-filename tiles replaced by ordered
  rows carrying an honest placeholder, server identity, `{size} · {createdAt}`, a role badge
  and keyboard `Di chuyển trước` / `Di chuyển sau` / `Gỡ ảnh` controls.
- Media help rewritten from drag-only to keyboard-first ordering.
- Category sample reconciled from `Phụ kiện thêu tay` to `Khăn` (IMP-D032).

State-specific deltas: the validation frame gained a third error item
(`Giá cơ bản phải là số nguyên đồng, không âm.`), its title became `Chưa thể lưu thay đổi`
and its name/category/price fields were put into the failing state the summary describes;
the saving frame reads `Đang lưu thay đổi…` with `Đang lưu…` and a disabled
`Huỷ thay đổi`; the media dialog gained `Tải thêm tài sản` and server identity on all six
options.

Two implementation notes worth recording because they cost rework:

1. `figma.createAutoLayout()` gives new frames an **opaque white fill**, and the first media
   rows also inherited the *selected* tile's accent stroke — making every row read as
   primary. Both were cleared against a neutral card's bound tokens.
2. `layoutSizingHorizontal = 'FILL'` was applied while the parent list was still
   `HORIZONTAL`, producing `FIXED/FILL` rows at 236×61. Setting the parent to `VERTICAL`
   **first** and then re-applying sizing produced the correct 732×144 rows.

---

## F. Price, slug and status semantics

**Price** (`Giá cơ bản`, edit-only because POST does not accept it): whole đồng as a string,
no separators, no decimals, no floating-point conversion, non-negative, twelve integer
digits maximum. Wire `"0"` means the price is **not set**; a blank input maps to that
sentinel; `0 ₫` is never rendered as a completed price. Approved helper:
`Số nguyên đồng, không dấu phân cách. Để trống nếu chưa xác định giá.` Price stays an A03
draft field and does **not** move to A04.

**Slug**: server-owned, immutable, read-only, edit mode only. The node states
`Do hệ thống tạo và không thay đổi, kể cả khi đổi tên sản phẩm.` so renaming cannot be read
as rewriting the address. The public path pattern is deliberately **not** asserted — the
`450:404` handoff still records `/san-pham/<slug>` as an unconfirmed proposal, so only the
bare slug value is shown.

**Status**: read-only label plus visual marker, never a select. A03 changes no lifecycle
state; no publish, unpublish, archive or delete control appears on any node.

---

## G. Variants and SKU deferral

Removed from A03 authority because the delivered B02 contract neither exposes nor persists
them. Shipping them would have meant inactive inputs that look functional, or local-only
fake persistence.

```
FU-APP2-PRODUCT-VARIANTS-SKU-01 = DEFERRED_BEYOND_APP2_CATALOG_ALPHA
```

Nonblocking for `A03`/`B03`/`A04`. No backend operation was added.

---

## H. Media selection, ordering and identity

Media exists **only after creation** and is saved as the B02 complete ordered replacement.

Eligibility: `kind = CATALOG_MEDIA`, `classification = PRODUCTION_SENSITIVE`,
`status = ACCEPTED`. Processing and rejected assets never appear.

Identity follows B01/D02 — `image/png` → `Ảnh PNG`, `image/jpeg` → `Ảnh JPEG`,
`image/webp` → `Ảnh WebP`, anything else → `Tài sản hình ảnh`, with `{size} · {createdAt}`
beneath. **No original filename exists on the server**, so `sen-do-01.png`,
`khan-tay-hoa.jpg` and `goi-tua-lotus.jpg` were removed from both the selected list and the
picker.

Placeholders only: no thumbnail-delivery contract exists, so no frame depicts real pixels
and no URL is invented (`APP2-T01` stays routed).

Ordering: first selection is `THUMBNAIL` (`Ảnh đại diện`), the rest `GALLERY`
(`Ảnh thư viện`), `DETAIL` excluded. Every row carries keyboard `Di chuyển trước` /
`Di chuyển sau`, disabled at the ends, plus `Gỡ ảnh`. Drag is optional and may never be the
only method. No arbitrary maximum. `Gỡ ảnh` unlinks only — it never deletes an asset or a
derivative.

---

## I. Asset selector pagination

The dialog depicts the populated + continuation-available state and gained
`Tải thêm tài sản`. The full state set — initial loading, populated, empty, continuation
available, continuation loading, continuation failure, end of list — is specified on the
annotation rather than duplicated as full-screen frames.

`Tải thêm tài sản` appears only while `hasNext` is true; loading shows `Đang tải thêm…` with
`aria-busy`; failure keeps existing items and offers `Thử lại` on **the same cursor**. No
infinite scroll, page numbers or total count, and the selector must never silently stop at
page one.

---

## J. Conflict and unsaved-change handoff

`PRODUCT_VERSION_CONFLICT` (409):

```
Sản phẩm đã được cập nhật ở nơi khác

Dữ liệu trên máy chủ đã thay đổi kể từ lần bạn mở sản phẩm này.
Hãy tải lại để xem phiên bản mới nhất trước khi tiếp tục chỉnh sửa.
```

`Tải lại dữ liệu` (primary) / `Đóng` (secondary). No force-save, no automatic retry with the
stale token, and reloading discards local unsaved edits only after confirmation. Timestamps,
token values and request IDs are never the explanation.

Unsaved changes: `Bỏ các thay đổi chưa lưu?` / `Những thay đổi trên màn hình này sẽ không
được lưu.` with `Rời khỏi trang` / `Tiếp tục chỉnh sửa`, applied to `Huỷ`, Admin internal
navigation and the supported `beforeunload` seam. Pristine forms never prompt; a successful
save clears the dirty state.

Both are specified on the annotation rather than as duplicate full-screen frames, as §13 and
§14 permit.

---

## K. Publication exclusion

`Điều kiện xuất bản`, `Tới bước xuất bản`, `Xuất bản`, `Gỡ xuất bản` and any
publication-readiness operation are removed from A03 visual authority. A03 shows only the
current draft status. Readiness and lifecycle interaction remain `APP2-B03` and `APP2-A04`,
whose registry rows are deliberately **not** promoted by this gate.

---

## L. A02 staged integration

When A03 implementation ships, the Product List restores exactly two entry points —
`Tạo sản phẩm` → `/products/new` and `Chỉnh sửa` → `/products/{productId}` — and nothing
else. `Xuất bản`, `Gỡ xuất bản`, `Lưu trữ` and `Xoá` stay out. A02's approved filters,
cursor continuation, loading/empty/error states and desktop/mobile collections are preserved
unchanged; the base list is not redesigned. This is stated on the annotation so the A03
implementer has explicit authorisation rather than an inference.

---

## M. Responsive authority

**Desktop** keeps the two-column composition — main form plus a compact **read-only metadata
rail** (status, slug). The publication rail is gone.

**Mobile 390** is single column: visible labels, 48px controls, the price input present,
save and cancel both reachable, and media action rows that **wrap** rather than overflow.
Measured content width is 358 inside 16px padding — **no horizontal overflow at 390px**.

Create mode reuses the same responsive shell with fewer sections. No desktop-only behaviour
is approved.

---

## N. Approval evidence and registry promotion

Approval record:
[`docs/design/approvals/APP2-A03-G01-PRODUCT-FORM-CONTRACT-APPROVAL.md`](../../design/approvals/APP2-A03-G01-PRODUCT-FORM-CONTRACT-APPROVAL.md)

Evidence ID: **`FIG-APPROVAL-APP2-A03-G01-PRODUCT-FORM-001`**

Promoted to `APPROVED_FOR_IMPLEMENTATION` — exactly five rows:

| Registry ID | Node |
| --- | --- |
| `FIG-ADMIN-PRODUCT-DRAFT-DESKTOP-DEFAULT` | `434:20` |
| `FIG-ADMIN-PRODUCT-DRAFT-DESKTOP-VALIDATION` | `436:37` |
| `FIG-ADMIN-PRODUCT-DRAFT-DESKTOP-SAVING` | `436:140` |
| `FIG-ADMIN-PRODUCT-DRAFT-MOBILE-DEFAULT` | `438:90` |
| `FIG-ADMIN-PRODUCT-MEDIA-SELECT-DESKTOP` | `437:73` |

Added, not promoted: `FIG-ADMIN-PRODUCT-FORM-CONTRACT-HANDOFF` (`521:284`,
`REVIEW_REQUIRED`).

**Not promoted:** the 4 `FIG-ADMIN-PUBLICATION-*` rows and every
`FIG-STOREFRONT-PRODUCT-DETAIL-*` row.

Registry count **71 → 72**. Gate: `Figma Design Index check passed (72 registry IDs, 72 node
rows, 9 registry tables)`.

---

## O. Documentation reconciliation

| File | Change |
| --- | --- |
| `docs/design/FIGMA_DESIGN_INDEX.md` | 5 rows promoted with evidence + screen/state labels corrected to Product Form Edit/Detail; 1 annotation row added; §4.3 `APP2-A03-G01` banner; §10 coverage 71 → 72 |
| `docs/design/approvals/APP2-A03-G01-PRODUCT-FORM-CONTRACT-APPROVAL.md` | **new** — 16-section approval record |
| `docs/implementation/14-IMPLEMENTATION-DECISION-REGISTER.md` | **IMP-D034** added and `LOCKED` |
| `docs/implementation/phases/APP2-ASSETS-AND-CATALOG-PUBLICATION.md` | §6.1 gains checkpoint row `9b APP2-A03-G01` and A03's dependency becomes `B02, D01, A03-G01`; §6.2 A03 design-ownership row updated; status block records the A03 block, the G01 cure and `FU-APP2-PRODUCT-VARIANTS-SKU-01` |
| `docs/implementation/10-MASTER-APPLICATION-ROADMAP.md` | APP2 row extended with the block and cure narrative |

The canonical order `APP2-A02` → `APP2-A03` → `APP2-B03` is unchanged and nothing was
renumbered. Historical reports were not rewritten; superseding notes carry the correction.

`11-TRACEABILITY-AND-STATUS-MATRIX.md` was deliberately **not** edited: its §3 states that
status values "are recorded once, in `10-MASTER-APPLICATION-ROADMAP.md` §6, and are not
duplicated here."

---

## P. Frozen engineering artifacts

| Artifact | Expected | Actual |
| --- | --- | --- |
| OpenAPI SHA-256 | `c4d1fef8ecc54c330aa8cf8e130582c92e4e6af9dd3643664cc020757da72d0b` | unchanged (direct hash + `check:openapi`) |
| Generated client tree hash | `3e3e267dc3c76bd630138bcb21f1500006ecf38dec2d088c5bc4d4c2133acfdb` | unchanged |
| Database | 33 migrations · 78 tables · 833 columns · 190 CHECK · `82864268…` | unchanged |
| Figma registry | 71 IDs | **72** (one annotation node, as authorised) |

No `apps/**` or `packages/**` file was touched. No dependency, lockfile, Nginx/Compose,
worker, object-storage, migration or generated artifact changed. No A03 route, component or
test exists.

---

## Q. Commit A evidence

```
56992076f6dfd3261adfeb39ad367a54736a9b31
docs(design): reconcile Admin Product Form contract
5 files changed, 358 insertions(+), 6 deletions(-)
```

| File | Δ |
| --- | --- |
| `docs/design/FIGMA_DESIGN_INDEX.md` | +27 −3 |
| `docs/design/approvals/APP2-A03-G01-PRODUCT-FORM-CONTRACT-APPROVAL.md` | +300 (new) |
| `docs/implementation/10-MASTER-APPLICATION-ROADMAP.md` | +1 −1 |
| `docs/implementation/14-IMPLEMENTATION-DECISION-REGISTER.md` | +1 |
| `docs/implementation/phases/APP2-ASSETS-AND-CATALOG-PUBLICATION.md` | +29 −2 |

`evidences/` is not part of this commit.

---

## R. Validation

| Command | Result |
| --- | --- |
| `pnpm check:figma-design-index` | pass — 72 registry IDs, 72 node rows, 9 tables |
| `node --test tools/check-figma-design-index.test.mjs` | 19/19 pass |
| `pnpm check:openapi` | up to date |
| `pnpm check:api-client` | tree hash unchanged |
| `pnpm db:check:manifest` | all checks passed |
| `node tools/check-file-size.mjs` | pass; no new file above a threshold |
| `pnpm quality` | **EXIT 0** |
| `git diff --check` | clean |
| `prettier --check docs/` | all files conform |

**Live Figma re-verification sweep** across all five nodes:

- **zero** occurrences of `Sản phẩm mới`, `Phiên bản`, `SKU`, `Điều kiện xuất bản`,
  `Tới bước xuất bản`, `Lưu bản nháp`, `Phụ kiện thêu tay`, `Gỡ xuất bản` or `Lưu trữ`;
- **zero** filename-shaped strings (`*.png` / `*.jpg` / `*.webp`);
- all expected content present per frame — `Giá cơ bản`, `Lưu thay đổi`, `Huỷ thay đổi`,
  `Di chuyển trước` / `Di chuyển sau`, `Ảnh PNG`, `Đường dẫn`, `Chưa thể lưu thay đổi`,
  `Đang lưu thay đổi…`, `Tải thêm tài sản`, `Ảnh WebP`, `Dùng ảnh đã chọn`;
- rendered screenshots reviewed for the desktop edit screen, the media group, the mobile
  screen and the annotation.

No application source, test, container or process was involved; no temporary artifact was
committed. Screenshots lived in the session scratchpad outside the repository.

---

## S. Acceptance

All 56 criteria in §26 are met. Summary of the ones most at risk:

| Criterion | Result |
| --- | --- |
| Exact clean A02 evidence entry | PASS |
| A03 block reproduced | PASS |
| No `APP2-D04` created | PASS |
| No application source changed | PASS |
| Five nodes re-read live | PASS |
| One-step-create contradiction recorded | PASS |
| Minimal create mode explicit; fields match POST exactly; no price/media; redirects to detail | PASS |
| Edit fields match PATCH exactly; price added; `expectedUpdatedAt` explicit | PASS |
| Zero-price meaning exact; `0 ₫` never a completed price | PASS |
| Slug and status read-only | PASS |
| Conflict UX explicit; no force overwrite; no stale-token retry | PASS |
| Unsaved-change UX explicit | PASS |
| Media edit-only; eligibility exact; continuation complete | PASS |
| No filename fabrication; honest placeholders only | PASS |
| First `THUMBNAIL` / rest `GALLERY`; `DETAIL` excluded; keyboard ordering; no arbitrary maximum | PASS |
| Variants/SKU removed and routed | PASS |
| Publication rail/actions removed; ownership preserved | PASS |
| A02 create/edit restoration explicit; no archive/delete/publication | PASS |
| Mobile authority complete; no 390px overflow | PASS |
| At most one annotation node | PASS — exactly one (`521:284`) |
| Exactly five A03 rows promoted; Publication rows not promoted | PASS |
| Canonical plan order unchanged | PASS |
| OpenAPI / generated client / database unchanged; no dependency | PASS |
| Registry checks and full quality pass | PASS |
| Two scoped commits; clean tree; nothing pushed; A03 not started | PASS |

**Verdict: `PASS`.**

### Disclosed judgement calls

1. **Frame names keep the `APP2-D01 /` provenance prefix** (e.g.
   `APP2-D01 / Admin / Product / Edit-Detail / Desktop / Default`) rather than the bare
   `Admin Product / Edit-Detail / Desktop / Default` in §7. The registry keys on node IDs;
   dropping the prefix would break the section's naming convention and obscure D01
   provenance. The `Product Draft` → `Product / Edit-Detail` correction §7 asked for is
   applied.
2. **The category sample was corrected** from `Phụ kiện thêu tay` to `Khăn`. §13 of the
   blocked A03 prompt classified this as a source-authority reconciliation to record; since
   this gate exists to align the visual authority with repository truth, leaving a category
   that does not exist in IMP-D032 would have preserved a known falsehood.
3. **The mobile "save vs publish" note was reworded** rather than deleted — from
   `Lưu bản nháp và Xuất bản là hai hành động tách biệt.` to reference `Lưu thay đổi` and
   state that publication belongs to a later step. It is a boundary statement, not a
   publication control, and it preserves the D01 intent while matching the new action label.

---

## T. A03 implementation handoff

`APP2-A03` is now `READY — NOT STARTED` with complete, promoted design authority.

**Design inputs:** the five promoted rows plus `FIG-ADMIN-PRODUCT-FORM-CONTRACT-HANDOFF`
(`521:284`), which is normative for create mode, routes, price sentinel, slug/status
read-only behaviour, media eligibility/ordering/identity, asset continuation, the conflict
dialog, unsaved-changes behaviour, A02 restoration, variants/SKU deferral and publication
exclusion.

**Contract inputs:** `adminProduct_create`, `adminProduct_detail`, `adminProduct_update` and
`adminAsset_list`. A03 must widen the hand-written `@embroidery/api-client` export surface to
re-export the three product operations — `adminProduct_archive` stays unexported until the
checkpoint that owns archiving. `adminAsset_list` is already exported.

**Reusable from A02:** `ADMIN_PRODUCTS_ROUTE` as the parent for `/products/new` and
`/products/[productId]`; `PRODUCT_COPY`, `product-status`, `product-category`; the
`ProductApiError` seam and `product-catalog.service.ts`; `productQueryKeys.all` as the
invalidation target after create or update. From A01: the `ASSET_COPY` identity helpers and
the D02 continuation pattern for the picker.

**Still excluded from A03:** publication, archive, delete, thumbnail delivery, public
catalog, Storefront, category management, and variants/SKU.

`APP2-B03` remains `BLOCKED_BY_APP2-A03`; `APP2-A04` follows B03; `APP2-T01` stays
`ROUTED — NOT PLANNED_FOR_EXECUTION`.
