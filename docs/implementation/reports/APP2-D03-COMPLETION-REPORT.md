# APP2-D03 — Admin Product List Design Reconciliation — Completion Report

**Checkpoint:** `APP2-D03` — Reconcile Admin Product List filters, staged actions,
approval evidence, and the A02/A03 handoff
**Type:** design reconciliation (design + documentation only)
**Cures:** `APP2-A02 = BLOCKED_BY_CATALOG_LIST_DESIGN_CONTRADICTION`
**Verdict:** `PASS`
**Date:** 2026-07-31

---

## A. Preflight and blocked A02 evidence

`APP2_D03_PREFLIGHT = PASS`

| Check | Result |
|---|---|
| `git branch --show-current` | `production` |
| `git rev-parse HEAD` (entry) | `0bf4686c9d0499a49fc0e04c4cfeac2b595f43a6` |
| Entry HEAD identity | exact `APP2-B02-C1` evidence **Commit D** |
| `git status --short` | only `?? evidences/` (user-owned, untracked) |
| `git diff --check` | clean |
| `pnpm quality` | **EXIT=0** |
| `pnpm check:figma-design-index` | passed — 70 registry IDs at entry |
| `node --test tools/check-figma-design-index.test.mjs` | 19/19 pass |
| `pnpm check:openapi` | artifact up to date |
| `pnpm check:api-client` | tree hash `3e3e267d…` |
| `pnpm db:check:manifest` | all checks passed, 78 tables / 833 columns |
| A02 implementation present? | **none** — no source file, no commit |

Known implementation commits read from Git:

```text
90e00d7780183b451d6da07526f64d4fbc704839  fix(api): harden catalog draft mutations   (B02-C1 Commit C)
0bf4686c9d0499a49fc0e04c4cfeac2b595f43a6  docs(app2): record catalog draft correction evidence (B02-C1 Commit D)
```

**The blocked A02 audit produced no commit and no tracked file change.** That is confirmed
by the entry HEAD being byte-identical to B02-C1 Commit D and by the clean tracked tree.
The only untracked path is the user-owned `evidences/` directory, which was never staged
and is excluded from both commits in this checkpoint.

## B. Live-node audit

All nodes were read live from `BQwqV8GdfUIELvsQDB1UQE`, page `APP_02` (`419:3`), using
structure dumps (`get_metadata` + a read-only Plugin API traversal capturing auto-layout,
sizing, bound variables, text styles and characters) **and** rendered screenshots — not
screenshots alone.

**Pre-edit state of the three Catalog List nodes:**

| Node | Registry ID | Name | Size |
|---|---|---|---|
| `439:100` | FIG-ADMIN-CATALOG-DESKTOP-DEFAULT | APP2-D01 / Admin / Catalog / Desktop / Default | 1440×1024 |
| `440:102` | FIG-ADMIN-CATALOG-DESKTOP-EMPTY | APP2-D01 / Admin / Catalog / Desktop / Empty | 1440×1024 |
| `440:191` | FIG-ADMIN-CATALOG-MOBILE-DEFAULT | APP2-D01 / Admin / Catalog / Mobile / Default | 390×844 |

Desktop content (`439:120`) was a VERTICAL auto-layout, padding 32, gap 24, holding a page
header (`h1 Sản phẩm` 40/Semi Bold, subtitle, and a `Tạo sản phẩm` primary instance) and a
product table (`439:186`, radius 16, surface fill, border stroke) with a sand table header
and four rows. Column widths were 456 / 200 / 160 / 220 across headers and row cells.
Mobile content (`440:200`) was a VERTICAL auto-layout, padding 20/16, holding `h1`,
subtitle, a full-width `Tạo sản phẩm` instance, a table-to-list note, and a card list.

**Gap 1 — filters absent.** No status or category control existed in any of the three
frames. Confirmed structurally: the desktop content frame had exactly two children (page
header, product table) and the mobile content frame exactly five (h1, subtitle, button,
note, list). No filter node existed to read.

**Gap 2 — action ownership crossed checkpoints.** The frames carried
`Tạo sản phẩm` (header CTA on desktop and mobile, plus the empty state's primary action)
and per-row `Chỉnh sửa` + `Xuất bản` / `Gỡ xuất bản`. Create and edit belong to
`APP2-A03`; publish and unpublish belong to `APP2-A04`. Neither checkpoint's routes exist
at A02 delivery time.

**Gap 3 — A02/A03 label inversion.** The handoff annotation `450:404` read
`• A02 Admin product draft → FIG-ADMIN-PRODUCT-DRAFT-*` and
`• A03 Admin catalog → FIG-ADMIN-CATALOG-*`, and phase-plan §6.2 carried the same
inversion — both contradicting the canonical checkpoint map in §6.1 (row 9 = A02 = Admin
product list).

**Supporting nodes read:** `450:404` (Notes / Handoff), `451:404` (Reuse & Supersession
Map), the Product Draft nodes `434:20`, `436:37`, `436:140`, `438:90`, `437:73`, the
Publication nodes `441:106`, `442:110`, `442:205`, `443:121`, and the DS supplement input
`424:35` (five state components; `State=Default` `424:10` = Label + 48px Field with radius
16, surface fill, border stroke, 16px horizontal padding + Help text).

**Two facts recorded rather than assumed:**

1. The sample category labels drawn in the frames (`Phụ kiện thêu tay`, `Trang phục`,
   `Trang trí nhà`) predate the IMP-D032 taxonomy lock and are illustrative row data, not
   category authority. The approved filter options use the locked taxonomy.
2. `451:404` contains **no** checkpoint-ownership mapping — it classifies reuse
   (`REUSE` / `NEW` / `SUPPLEMENT` / `LOCAL` / `KHÔNG DÙNG`) and carries no A02/A03/A04
   labels. **No change was required there**, so none was made; the node is byte-unchanged.

## C. A02/A03/A04 ownership reconciliation

Canonical, and now consistent across Figma and documentation:

```text
APP2-A02 — Admin Product List          439:100 · 440:102 · 440:191
APP2-A03 — Admin Product Form/Detail   434:20 · 436:37 · 436:140 · 438:90 · 437:73
APP2-A04 — Publication Interaction     441:106 · 442:110 · 442:205 · 443:121
```

The corrected checkpoint order is unchanged — A02 precedes A03. Corrected in three places:
annotation `450:404` (lines `450:413`, `450:414`), phase-plan §6.2 handoff table, and the
`FIGMA_DESIGN_INDEX.md` §4.3 banner.

## D. Status filter decision

Label `Trạng thái`, explicit default `Tất cả trạng thái`.

| Option | Wire |
|---|---|
| Tất cả trạng thái | no `status` parameter |
| Bản nháp | `DRAFT` |
| Đã xuất bản | `PUBLISHED` |
| Đã lưu trữ | `ARCHIVED` |

The unfiltered list therefore carries all three states; archived products are never
silently hidden.

## E. Category filter decision

Label `Danh mục`, explicit default `Tất cả danh mục`.

| Option | Wire |
|---|---|
| Tất cả danh mục | no `categorySlug` parameter |
| Thú bông | `thu-bong` |
| Khăn | `khan` |
| Quần áo | `quan-ao` |
| Khác | `khac` |

Closed IMP-D032 taxonomy: no category endpoint is called and no category UUID appears on
screen. Not added: search, sort selector, price filter, date filter, owner filter.

## F. Desktop update

Node `439:100`, amended in place; **frame size unchanged at 1440×1024**.

| Change | Nodes |
|---|---|
| Removed header CTA | `439:184` (`Button / Primary / Tạo sản phẩm`) |
| Removed `Hành động` column header | `439:191` |
| Removed row action cells | `439:202`, `439:215`, `439:228`, `439:241` |
| Column 1 header set to `FILL` | `439:188` |
| Added filter row (index 1, between header and table) | `493:273` → `493:274` (`Filter / Trạng thái`), `493:279` (`Filter / Danh mục`) |
| Added continuation control | `493:284` (`Button / Secondary / Tải thêm sản phẩm`) |

The table is now `Sản phẩm` / `Danh mục` / `Trạng thái` at 692 / 200 / 160, with the
product column absorbing the width the action column released — header and row cells
measured identical after the edit.

The filter row is a HORIZONTAL auto-layout, gap 16, hugging at **536×77** rather than
stretching across the 1116px content width. Each filter is a 260px column: a `Body/S`
label bound to `text/primary` above a 48px field (radius 16, `background/surface` fill,
`border/primary` stroke, 16px horizontal padding) holding a `Body/M` value and a chevron
bound to `text/secondary`. Every colour is a bound design-token variable; the DS `Input`
supplement's visual language is reused, not re-invented.

## G. Mobile update

Node `440:191`, amended in place; **frame size unchanged at 390×844**.

| Change | Nodes |
|---|---|
| Removed create button | `440:233` |
| Removed per-card action groups | `440:248`, `440:262`, `440:276` |
| Added stacked filters (index 2, after subtitle) | `495:273` → `495:274`, `495:279` |
| Added continuation control | `495:284`, `layoutSizingHorizontal = FILL` |

Filters stack vertically at full content width (status first, category second), labels
visible, 48px fields (≥ 44px target). No icon-only trigger and no modal filter sheet were
introduced. Content flows to y=726 inside the 780px content frame — **no vertical overflow
and no horizontal overflow at 390**, so no frame resize was needed. The card list remains
single-column and informational: media placeholder, name, category, status.

## H. Read-only staged-action decision

`APP2-A02` renders none of:

```text
Tạo sản phẩm · Chỉnh sửa · Xuất bản · Gỡ xuất bản · Lưu trữ · Xoá
```

Empty state (`440:102`) — the primary action `440:189` and the header CTA `440:127` were
removed and the copy replaced:

```text
Chưa có sản phẩm
Các sản phẩm sẽ xuất hiện tại đây sau khi bản nháp đầu tiên được tạo.
```

`440:188` was switched from `textAutoResize = NONE` to `HEIGHT` so the longer approved
sentence cannot clip. Filters remain visible in the empty state; the continuation control
is correctly absent there.

Staged restoration, locked in the new annotation:

```text
APP2-A03 restores:  Tạo sản phẩm · Chỉnh sửa / mở chi tiết
APP2-A04 adds:      Xuất bản · Gỡ xuất bản · publication readiness interactions
```

Both supplement the list without redefining its base layout, and A02 is **not** re-ordered
after them to preserve dead controls.

## I. Continuation authority

The `APP2-D02` cursor pattern is reused verbatim with product copy: `Tải thêm sản phẩm`,
shown only when `hasNext = true`, placed after the collection, appending rather than
replacing, preserving existing items and scroll position, `Đang tải thêm…` with
`aria-busy` while loading, and `Không thể tải thêm sản phẩm.` + `Thử lại` reusing the same
cursor on failure. No infinite scroll, no total count, no page numbers.

The control is rendered in the Default desktop and mobile frames (both had free vertical
space, so unlike `APP2-D02` no frame had to grow) and specified in full in the new
annotation.

## J. Price and search exclusions

**Price** — no price column was added to any Product List node. Price belongs to the
`APP2-A03` form/detail and to publication readiness. The `APP2-B02` wire contract is
untouched: `basePriceAmount` is still returned and is simply not rendered by this screen.
The stale A02 price-rendering requirement is removed from the A02 authority and recorded
as excluded in IMP-D033 and the approval record §7.

**Search** — no search control exists in the Catalog authority and working search is out of
APP2 scope. Locked: no input, no client-side current-page search, no search parameter, and
no decorative fake search.

## K. Approval evidence and registry promotion

Created `docs/design/approvals/APP2-D03-ADMIN-PRODUCT-LIST-DESIGN-APPROVAL.md`, following
the existing approval-document convention, recording the Product Owner decision, date, the
three registry IDs and node IDs, the filter decision, the read-only staged-action decision,
continuation reuse, the price/search exclusions, and the A03/A04 restoration handoff.

**Evidence ID:** `FIG-APPROVAL-APP2-D03-CATALOG-LIST-001`

Promoted exactly three rows `REVIEW_REQUIRED → APPROVED_FOR_IMPLEMENTATION`:
`FIG-ADMIN-CATALOG-DESKTOP-DEFAULT`, `FIG-ADMIN-CATALOG-DESKTOP-EMPTY`,
`FIG-ADMIN-CATALOG-MOBILE-DEFAULT`.

**Not promoted:** every `FIG-ADMIN-PRODUCT-DRAFT-*`, `FIG-ADMIN-PRODUCT-MEDIA-SELECT-*` and
`FIG-ADMIN-PUBLICATION-*` row remains `REVIEW_REQUIRED` with an empty evidence cell, and
the Admin Assets approval record was not broadened.

## L. Node IDs and registry count

| | Value |
|---|---|
| Registry IDs at entry | **70** |
| Registry IDs at exit | **71** |
| Nodes updated in place | `439:100`, `440:102`, `440:191`, `450:404` |
| New annotation nodes | **1** — `498:272` (`FIG-ADMIN-CATALOG-FILTERS-ACTIONS-HANDOFF`) |
| Nodes deleted | 11 (listed in §F/§G/§H) |
| Nodes created | 3 filter groups + 2 continuation instances + 1 annotation panel |

The new annotation was cloned from `450:404` so panel chrome, card styling, text styles and
token bindings are identical rather than re-approximated. It holds six cards: status
filter, category filter, filter behaviour, continuation, staged actions, exclusions and
approval.

## M. Documentation reconciliation

| File | Change |
|---|---|
| `docs/design/FIGMA_DESIGN_INDEX.md` | three Catalog rows promoted with evidence ID and re-labelled to the Admin product list capability; new annotation row; `APP2-D03` banner in §4.3; §10 coverage and audit log updated 70 → 71 |
| `docs/design/approvals/APP2-D03-ADMIN-PRODUCT-LIST-DESIGN-APPROVAL.md` | **new** approval record |
| `docs/implementation/phases/APP2-ASSETS-AND-CATALOG-PUBLICATION.md` | status block entry for the A02 block and its cure; §6.1 gains checkpoint **8b `APP2-D03`** and A02's dependency becomes `B02, D01, D03`; §6.2 A02/A03 rows corrected and the superseded-gate note updated |
| `docs/implementation/14-IMPLEMENTATION-DECISION-REGISTER.md` | **IMP-D033** locked |
| `docs/implementation/10-MASTER-APPLICATION-ROADMAP.md` | APP2 row records the block and the `APP2-D03` cure |

`docs/implementation/11-TRACEABILITY-AND-STATUS-MATRIX.md` was **deliberately not edited**:
§3 states that current phase status values "are recorded once, in
`10-MASTER-APPLICATION-ROADMAP.md` §6, and are not duplicated here." Duplicating the status
there would violate the file's own rule.

Historical completion reports were not rewritten; chronology is carried by superseding
pointers in the registry banner and the phase-plan status block.

**One disclosed edit beyond the literal brief.** Line `450:416` of the handoff annotation
read `• S01 Storefront product list → FIG-STOREFRONT-PRODUCT-LIST-* (4 khung)` — four nodes
that `APP2-D01-C1` **deleted** from Figma. Leaving a dangling pointer inside an annotation
being edited in the same pass would knowingly preserve a falsehood, so the line now reads
`→ UI02 Discover (FIG-UI02-DISCOVER-*). 4 khung APP2 cũ đã bị xoá ở APP2-D01-C1.` This
changes no approval status and no Storefront authority; §4.4 of the registry already made
UI02 the S01 authority.

**One cosmetic inconsistency left in place, on purpose.** The three Figma frames are still
*named* `APP2-D01 / Admin / Catalog / …` while the registry rows now describe them as the
Admin product list. Registry integrity keys on node IDs, not names, and the gate passes;
renaming frozen frames would obscure their `APP2-D01` provenance for no benefit.

## N. Frozen engineering artifacts

| Baseline | Entry | Exit | Verified by |
|---|---|---|---|
| OpenAPI | `c4d1fef8ecc54c33…` | `c4d1fef8ecc54c33…` | direct SHA-256 of the artifact + `pnpm check:openapi` |
| Generated API-client tree | `3e3e267dc3c76bd6…` | `3e3e267dc3c76bd6…` | `pnpm check:api-client` |
| Database | 33 migrations / 78 tables / 833 columns / 190 CHECKs / `82864268…` | unchanged | `pnpm db:check:manifest` |
| Figma registry | 70 IDs | **71 IDs** | `pnpm check:figma-design-index` |
| Dependencies / lockfile | unchanged | unchanged | no `package.json` or lockfile in the diff |

No file under `apps/**` or `packages/**` was touched — Commit A contains five documentation
files and nothing else.

## O. Commit A evidence

```text
561c058759ffe855c0dc42fad98ca9153fd2163c
docs(design): reconcile Admin Product List authority
5 files changed, 266 insertions(+), 13 deletions(-)
```

| File | Δ |
|---|---|
| `docs/design/FIGMA_DESIGN_INDEX.md` | +52 / −… |
| `docs/design/approvals/APP2-D03-ADMIN-PRODUCT-LIST-DESIGN-APPROVAL.md` | +183 (new) |
| `docs/implementation/10-MASTER-APPLICATION-ROADMAP.md` | 1 line |
| `docs/implementation/14-IMPLEMENTATION-DECISION-REGISTER.md` | +1 (IMP-D033) |
| `docs/implementation/phases/APP2-ASSETS-AND-CATALOG-PUBLICATION.md` | +41 |

## P. Validation

| Command | Result |
|---|---|
| `pnpm check:figma-design-index` | **passed — 71 registry IDs, 71 node rows, 9 tables** |
| `node --test tools/check-figma-design-index.test.mjs` | **19/19 pass** |
| `pnpm check:openapi` | artifact up to date |
| `pnpm check:api-client` | tree hash `3e3e267d…` unchanged |
| `pnpm db:check:manifest` | all checks passed — 78 tables, 833 columns |
| `node tools/check-file-size.mjs` | passed (21 pre-existing files above the review threshold; none added here) |
| `pnpm quality` | **EXIT=0** |
| `git diff --check` | clean |

**Live Figma validation** (post-edit programmatic sweep of all three nodes):

| Assertion | Result |
|---|---|
| All three nodes resolve | ✔ `439:100` 1440×1024 · `440:102` 1440×1024 · `440:191` 390×844 |
| Desktop filters visible and labelled | ✔ `Trạng thái` + `Danh mục`, defaults `Tất cả trạng thái` / `Tất cả danh mục` |
| Mobile filters visible and stacked | ✔ vertical, full content width, labels visible |
| No A02 create/edit/publication control remains | ✔ **0 matches** across all three frames for `Tạo sản phẩm`, `Chỉnh sửa`, `Xuất bản`, `Gỡ xuất bản`, `Lưu trữ`, `Xoá` (text and instance names) |
| Action cells removed | ✔ 0 nodes named `Action cell` / `Actions` |
| Column headers | ✔ `Sản phẩm` / `Danh mục` / `Trạng thái` |
| Empty node has no dead CTA | ✔ empty state children are title + body only |
| Continuation explicit | ✔ `Tải thêm sản phẩm` on Default + Mobile; absent on Empty |
| A02/A03/A04 labels correct | ✔ `450:404` corrected |
| Three registry rows approved | ✔ evidence `FIG-APPROVAL-APP2-D03-CATALOG-LIST-001` |
| No unrelated registry authority changed | ✔ Product Draft, Publication, Storefront, UI02, DS rows untouched |

Desktop, empty and mobile frames plus the new annotation were reviewed as rendered
screenshots. One defect was found and fixed during review: `figma.createAutoLayout()`
gives new frames a default opaque white fill, which drew a visible white block behind the
filter labels; all nine filter container frames had that unbound fill cleared so only the
field carries a bound `background/surface` paint. No screenshot or trace is committed.

## Q. Acceptance

All 54 acceptance criteria are met. Specifically: the entry was the exact clean B02-C1
evidence commit (1–3); the three nodes were re-read live and all three gaps reproduced
(4–7); A02/A03/A04 ownership is locked (8–10); both filters exist with the exact options,
truthful defaults and no search (11–16); no price column was added (17); desktop and
mobile placement, 390px behaviour, filter-reset, filter-empty, continuation reuse and the
no-infinite-scroll rules are all explicit (18–24); every create/edit/publication control
and the empty-state CTA are gone with the staged restoration recorded (25–30); the list
remains visually coherent, existing nodes were updated in place, and exactly one annotation
node was added (31–33); the approval record, its exact evidence ID and the three-row
promotion exist with Product Draft and Publication deliberately excluded (34–38); phase
mappings and handoff annotations are corrected with no unrelated design authority changed
(39–41); no application source, OpenAPI, client or database change (42–45); registry and
full quality gates pass (46–47); the two commits are correctly scoped (48–50); this report
is uncompressed (51); the tracked tree is clean and nothing is pushed (52–53); and no A02,
A03 or A04 implementation was started (54).

**Verdict: `PASS`.**

## R. Handoff and scope closure

```text
APP2-D03 = COMPLETE — DELIVERED_FOR_REVIEW
APP2-A02 = READY — NOT STARTED
APP2-A03 = BLOCKED_BY_APP2-A02
APP2-B03 = BLOCKED_BY_APP2-A03
APP2-T01 = ROUTED — NOT PLANNED_FOR_EXECUTION
```

`APP2-A02` may now implement the Admin Product List against
`FIG-ADMIN-CATALOG-DESKTOP-DEFAULT`, `FIG-ADMIN-CATALOG-DESKTOP-EMPTY` and
`FIG-ADMIN-CATALOG-MOBILE-DEFAULT` under `FIG-APPROVAL-APP2-D03-CATALOG-LIST-001`, reading
`FIG-ADMIN-CATALOG-FILTERS-ACTIONS-HANDOFF` (`498:272`) for filter behaviour, continuation
states and the staged-action rule. It consumes `adminProduct_list` only; `adminProduct_archive`
stays unconsumed because no approved Catalog List archive control exists, and
`adminProduct_detail` is available for authoritative reconciliation.

**Open for the reviewer:** the new annotation `FIG-ADMIN-CATALOG-FILTERS-ACTIONS-HANDOFF`
enters as `REVIEW_REQUIRED` per §9 of the registry, as every new node must. It is a
specification annotation, not a competing screen authority, and does not gate `APP2-A02`.

Not started and not touched: `APP2-A02` implementation, `APP2-A03` product form/detail,
`APP2-A04` publication, `APP2-T01` thumbnail delivery, and every backend, worker, schema
and object-storage surface. Nothing is pushed.
