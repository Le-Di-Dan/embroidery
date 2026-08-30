# APP11-D01 — Design Authority Registration, Reconciliation & Supplement Package

**Checkpoint:** `APP11-D01`
**Phase:** APP11 — Gallery, Content, SEO and Store Presentation
**Mode:** DESIGN · FIGMA AUTHORITY · DESIGN REGISTRY · NO RUNTIME IMPLEMENTATION
**Date:** 2026-08-29
**Entered because:** `APP11-G01` and `APP11-G01-C1` are both COMPLETE (PO PASS).

---

> **CORRECTED BY `APP11-D01-C1` (2026-08-30)** —
> `../reports/APP11-D01-C1-COMPLETION-REPORT.md`.
> The Product Owner accepted this package apart from **two defects**, both now
> fixed. Read this report together with the correction; where they differ, the
> correction wins.
>
> 1. **Alt-text ownership was wrong.** This report and eleven Figma text nodes
>    — including `875:1006` ("Alt text is owned per gallery asset") and the three
>    Gallery-Detail media captions ("alt riêng cho mỗi ảnh") — implied a stored,
>    operator-configured per-asset alt field. **No such column, API property or
>    Admin control exists**, and APP11 adds no migration. The authority is now
>    `ALT_TEXT_MODEL = DERIVED_NOT_PERSISTED`: accessible image text is derived
>    at render time from the gallery entry title plus the image position.
> 2. **The footer supplement was Desktop-only.** `872:1029` alone could not tell
>    `APP11-S05` how the store block recomposes. Tablet 1024 (`888:1006`),
>    Mobile 390 (`888:1058`) and a responsive-authority annotation
>    (`889:1030`) now exist. Registry **529 → 532**.
>
> Everything else below stands unchanged: the gallery feed is still registered
> and not redrawn, and the Homepage, gallery detail, content-page template,
> Admin list/editor, dock placement, routes and schema disposition are untouched.

---

## A. Verdict

```text
APP11-D01            = COMPLETE
PO_DECISION_REQUIRED = NONE
NEXT_CHECKPOINT      = APP11-B01
```

The gallery feed was **not** redrawn, the Collection → Works hierarchy is **not**
present in APP11 implementation authority, Journal is **not** in the APP11
Homepage, and the Zalo/Messenger handoff **remains a floating bottom-right dock**.

---

## B. Design authority summary

```text
APP11_DESIGN_DISPOSITION = REUSE_AND_SUPPLEMENT
```

| Class | Count | What |
|---|---|---|
| `REGISTER_EXISTING` | 5 nodes | UI05 Collections Index desktop/tablet/mobile + its interaction and loading/empty/error state boards — registered in place as the `/bo-suu-tap` feed authority. **Not copied, not moved, not modified.** |
| `RECONCILE_EXISTING` | 4 frames | Homepage desktop/tablet/mobile (Journal removed) + the footer/handoff reconciliation record |
| `SUPPLEMENT_EXISTING` | 7 frames | Gallery entry detail ×3 breakpoints + 2 lightboxes + provenance board + footer store-presentation supplement |
| `NEW_DESIGN_REQUIRED` | 16 frames | Shared content-page system (7) + Admin gallery list (3) + Admin gallery editor (6) |
| Specifications | 3 frames | Authority map, gallery-detail provenance, responsive/a11y/SEO notes |

**Totals:** page `APP_11` (`853:2`) · **8 sections** · **33 new frames** · **5
pre-existing nodes registered in place** · **38 new registry rows**, every one
`REVIEW_REQUIRED`.

---

## C. Figma page / node inventory

File `BQwqV8GdfUIELvsQDB1UQE` (`FIG-FILE-PRODUCT`). The `APP_11` page existed and
was empty; per registry §2 rule 1 it was **reused, not re-created**.

### C.1 Registered pre-existing authority — page `User Interface`

| Capability | Route | Node | Node name | Coverage | Status |
|---|---|---|---|---|---|
| Gallery feed | `/bo-suu-tap` | `329:2` | UI05 / Collections Index / Desktop / Draft | Desktop 1440 | REVIEW_REQUIRED |
| Gallery feed | `/bo-suu-tap` | `339:2` | UI05 / Collections Index / Tablet / Draft | Tablet 1024 | REVIEW_REQUIRED |
| Gallery feed | `/bo-suu-tap` | `343:2` | UI05 / Collections Index / Mobile / Draft | Mobile 390 | REVIEW_REQUIRED |
| Gallery feed states | `/bo-suu-tap` | `353:2` | 07 – Collection & Card Interaction States | All | REVIEW_REQUIRED |
| Gallery feed states | `/bo-suu-tap` | `357:3` | 08 – Loading, Empty & Error States | All | REVIEW_REQUIRED |

### C.2 New frames — page `APP_11` (`853:2`)

| Section | Node | Frame | Coverage | Provenance |
|---|---|---|---|---|
| Authority Map `857:3` | `874:1006` | Authority Map & Handoff | Desktop | — |
| Homepage `857:4` | `857:11` | Homepage / Desktop / 1440 | Desktop | UI01 `183:7` |
| Homepage `857:4` | `857:318` | Homepage / Tablet / 1024 | Tablet | UI01 `189:266` |
| Homepage `857:4` | `857:506` | Homepage / Mobile / 390 | Mobile | UI01 `191:412` |
| Homepage `857:4` | `858:442` | Homepage Reconciliation — Provenance & Routes | Desktop | — |
| Detail `857:5` | `860:442` | Gallery Entry Detail / Desktop / 1440 | Desktop | UI05 `334:6` + PD `529:2234/2236/2237` |
| Detail `857:5` | `861:4321` | Gallery Entry Detail / Tablet / 1024 | Tablet | UI05 `341:2` + PD `529:2438/2440` |
| Detail `857:5` | `861:4487` | Gallery Entry Detail / Mobile / 390 | Mobile | UI05 `348:2` + PD `529:2580/2582` |
| Detail `857:5` | `862:626` | Gallery Entry Detail / Lightbox / Desktop | Desktop | APP2-S02-G01 `533:3` |
| Detail `857:5` | `862:641` | Gallery Entry Detail / Lightbox / Mobile | Mobile | APP2-S02-G01 `533:26` |
| Detail `857:5` | `862:656` | Gallery Entry Detail — Supplement & Provenance | Desktop | — |
| Content `857:6` | `863:677` | Content Page Template / Desktop / 1440 | Desktop | shell `405:2225` |
| Content `857:6` | `864:1085` | Content Page Template / Tablet / 1024 | Tablet | shell `405:3733` |
| Content `857:6` | `864:1253` | Content Page Template / Mobile / 390 | Mobile | shell `405:3786` |
| Content `857:6` | `864:677` | Content Page / Service · `/dich-vu` | Desktop | template instance |
| Content `857:6` | `864:779` | Content Page / FAQ · `/cau-hoi-thuong-gap` | Desktop | template instance |
| Content `857:6` | `864:881` | Content Page / Local · `/cua-hang` | Desktop | template instance |
| Content `857:6` | `864:983` | Content Page / Policy · `/chinh-sach/[slug]` | Desktop | template instance |
| Admin list `857:7` | `866:905` | Admin / Gallery List / Desktop / 1440 | Desktop | APP2-D01 `439:100` |
| Admin list `857:7` | `867:907` | Admin / Gallery List / Desktop / Empty | Desktop | APP2-D01 `440:102` |
| Admin list `857:7` | `867:946` | Admin / Gallery List / Mobile / 390 | Mobile | APP2-D01 `440:191` |
| Admin editor `857:8` | `868:909` | Admin / Gallery Editor / Desktop / Default | Desktop | APP2-D01 `434:20` |
| Admin editor `857:8` | `870:926` | Admin / Gallery Editor / Media Select | Desktop | APP2-D01 `437:73` |
| Admin editor `857:8` | `870:1104` | Admin / Gallery Editor / Publication / Ready | Desktop | APP2-D01 `441:106` |
| Admin editor `857:8` | `870:1187` | Admin / Gallery Editor / Publication / Blocked | Desktop | APP2-D01 `442:110` |
| Admin editor `857:8` | `870:1274` | Admin / Gallery Editor / Publication / Confirm Unpublish | Desktop | APP2-D01 `442:205` |
| Admin editor `857:8` | `870:1368` | Admin / Gallery Editor / Mobile / 390 | Mobile | APP2-D01 `438:90` |
| Footer/dock `857:9` | `872:1029` | Footer — Store Presentation Supplement | Desktop | `FIG-DS-FOOTER` |
| Footer/dock `857:9` | `872:1079` | Floating Contact Dock / Desktop / 1440 | Desktop | reconciles `842:3` |
| Footer/dock `857:9` | `872:1089` | Floating Contact Dock / Mobile / 390 | Mobile | reconciles `842:48` |
| Footer/dock `857:9` | `873:1018` | Floating Contact Dock / Mobile / Missing config | Mobile | reconciles `843:3` |
| Footer/dock `857:9` | `873:1006` | Footer & Floating Handoff — Reconciliation Record | Desktop | — |
| Notes `857:10` | `875:1006` | Responsive, States, Accessibility & SEO Notes | Desktop | — |

---

## D. Gallery feed proof — existing authority reused, nothing redrawn

```text
GALLERY_FEED_REDRAWN = false
```

- The five feed rows in §C.1 point at **UI05's original node IDs on the
  `User Interface` page**. No feed frame was cloned onto `APP_11`; a live
  enumeration of `APP_11` returns 33 frames and **none of them is a gallery feed**.
- The registry contains **no** second canonical row for
  `Storefront | /bo-suu-tap | Gallery Feed | Default | <viewport>`; the composite
  uniqueness rule in the gate would have rejected a duplicate.
- Density is UI05's own **3 desktop / 2 tablet / 1 mobile at 410 / 452 / 342**, and
  is explicitly *not* converted to UI02's 5/3/2 @237. That instruction is recorded
  on `874:1006` and `875:1006`.
- Route: the feed's H1 is already `Bộ sưu tập`; `/bo-suu-tap` is recorded in the
  registry Route/Capability column and in the authority map. UI05's provisional
  `/collections` strings are superseded in the annotation layer; **no UI05 node was
  edited**.
- `/kham-pha` was not opened for writing, not relabelled and not aliased.

---

## E. Gallery entry detail proof

| Requirement | Evidence |
|---|---|
| UI05 sections retained | `Breadcrumb`, `Entry Hero`, `Entry Narrative`, `Entry Attributes`, `Related Entries`, `Continue Discovering`, `Soft Commission CTA`, `Footer`, shell `Header` — all cloned from `334:6`/`341:2`/`348:2` and kept |
| Member Works removed | `Section / Member Works` (UI05 `336:3366`) is **absent** from all three APP11 detail frames |
| Ordered asset gallery added | `Section / Entry Media — ordered gallery_entry_assets` = MediaStage (contain, natural ratio) + ZoomHint + ThumbnailStrip ordered by `display_order`, reused from Product Detail |
| Lightbox added | `862:626` / `862:641`, cloned from approved `533:3` / `533:26`; behaviour inherited verbatim from `537:38` |
| Linked-product affordance added | `Section / Related Product (optional linked_product_id)` → `/san-pham/[slug]`; hidden entirely when null; no price, cart or buy button |
| No nested work model | 3-level breadcrumb (`feed / collection / work`) collapsed to flat `Bộ sưu tập / <entry title>`; no `/works/[slug]`; no collection parent |
| Copy de-collectionised | 22 desktop strings + 16 tablet + 13 mobile rewritten from collection semantics to single-entry semantics (e.g. "12 tác phẩm được tuyển chọn" → "Bộ ảnh theo thứ tự hiển thị") |

```text
NESTED_COLLECTION_WORK_MODEL = false
```

---

## F. Homepage proof

```text
JOURNAL_IN_APP11_HOMEPAGE = false   (no Journal section; see the nav-label note below)
```

- UI01 content reused: the three frames are clones of `183:7` / `189:266` /
  `191:412`. The originals are **unchanged** and remain historical provenance.
- Shell reused: the Header/Footer instances inside them are the same DS components
  that `APP1-D02` (`405:2225` family) is authority for. The shell was not redrawn.
- `Journal` removed from all three (`857:42`, `857:363`, `857:548` deleted with
  their `JournalCard` instances). The auto-layout body reflowed; six sections
  remain in order: Hero · Featured Works · Discover Feed · Collections · Studio
  Story · Commission CTA.
- Route targets recorded on `858:442`: Featured Works → `/kham-pha`, Discover
  preview → `/san-pham/[slug]`, **Collections → `/bo-suu-tap`**, CTA → the existing
  request flow. The `/dich-vu` entry point is delivered by the footer supplement.
- The `Nhật ký` link still present in the shared Header nav and the footer STUDIO
  column belongs to `APP1-D02` shell authority and was **not edited**; it is
  recorded as `route: null` / non-interactive for APP11.

---

## G. Static content template

One shared system, not four bespoke architectures.

**Template blocks** (`863:677`), each labelled `[REQUIRED]` or `[OPTIONAL]`:
Breadcrumb · Page Hero (eyebrow / H1 / lead) · Body long-form · Media block ·
FAQ accordion · Store information · Related internal links · Footer.

| Instance | Route | Blocks kept | Blocks dropped |
|---|---|---|---|
| Service `864:677` | `/dich-vu` | hero, body, media, links | FAQ, store |
| FAQ `864:779` | `/cau-hoi-thuong-gap` | hero, body, FAQ accordion, links | media, store |
| Local `864:881` | `/cua-hang` | hero, body, media, store info, links | FAQ |
| Policy `864:983` | `/chinh-sach/[slug]` | hero, body, links | media, FAQ, store |

**Responsive:** Desktop `863:677` (reading width 736, padding 80) · Tablet
`864:1085` (640 / 48) · Mobile `864:1253` (342 / 24, StoreInfoGrid and
InternalLinks stack). Verified by render: no horizontal overflow at 390.

**Annotated for SEO/accessibility:** exactly one H1; H2/H3 order; real DOM text,
never image-only; alt text required on the media block; internal links use
descriptive text; FAQ answers stay in the DOM with `aria-expanded` on a real
button; store information is text, not an image; long-form reading width capped.

Store contact values are explicit placeholders — `[Địa chỉ xưởng — giá trị
canonical chưa có]` — because no canonical values exist. **No production data was
fabricated.** No CMS or page builder was designed.

---

## H. Admin gallery list & editor

**Routes:** `/gallery` and `/gallery/[entryId]`. Publication is a **panel/state of
the editor**, never a third route.

**List** (`866:905`, `867:907`, `867:946`) — built on the APP2 catalog precedent.
Columns are the real model: **Mục** (cover + title + slug) · **Thứ tự**
(`display_order`) · **Sản phẩm liên kết** · **Trạng thái**. One status filter (the
category filter was **removed** — `gallery_entries` has no category column). Row →
`/gallery/[entryId]`. "Tạo mục mới" action, continuation via "Tải thêm mục", empty
state, mobile card list. Side navigation gains an active `Bộ sưu tập` entry.

**Editor** (`868:909` + 5 states) — fields are exactly the delivered schema:

```text
title · slug (read-only, unique) · description (NOT NULL) · display_order
linked_product_id (optional) · seo_title · seo_description · is_indexable
ordered asset selection · publication state
```

Nothing else is drawn — **no** collection parent, style taxonomy, need taxonomy,
per-image alt editor, page-builder blocks, blog fields or localization.

**Assets:** the media group states "CHỈ chọn được ảnh PUBLIC ở trạng thái *Sẵn
sàng*", the first image is the cover **and the OG image**, and Di chuyển
trước/sau/Gỡ ảnh reorder and remove. It reuses the existing Admin asset language —
no second asset manager was created.

**Publication states:** Ready (`870:1104`), Blocked (`870:1187`), Confirm Unpublish
(`870:1274`). Readiness matches the planned backend exactly: title non-empty ·
description non-empty · at least one PUBLIC asset · valid unique slug. Blocked
lists each failing reason as text, not colour. Unpublish is confirmed, explicitly
**not deletion**, and returns the detail URL to the safe 404 while dropping the
entry from the sitemap.

---

## I. Footer & handoff reconciliation

```text
FLOATING_HANDOFF_PRESERVED = true
```

- **Footer supplement** (`872:1029`): a phase-owned `StorePresentationBlock`
  composed **above** the unmodified Footer instance — store identity, contact area,
  service/FAQ navigation and a policy column pointing at `/chinh-sach/*`. The DS
  file was **not** modified. Closes `FU-APP10-D01-05`.
- **Handoff reconciled** (`873:1006`): the APP10-I01 frames `842:3`, `842:48`,
  `843:3`, `843:44` still draw a **footer column** ("Chân trang Storefront"), which
  contradicts the accepted runtime. `872:1079` / `872:1089` record the accepted
  placement — fixed bottom-right, 32px desktop inset; 16px right and 100px bottom
  on mobile so it clears the 84px sticky commission bar and the safe area; targets
  ≥44×44. `873:1018` records missing-config behaviour: **renders nothing at all**.
- The runtime was not modified and **not** reverted to the footer. The APP10-I01
  nodes were **not edited**; they are superseded for placement only.

---

## J. Registry delta

```text
rows before = 491
rows after  = 529
new rows    = 38   (all REVIEW_REQUIRED, approval evidence "—")
checker     = PASS
```

`node tools/check-figma-design-index.mjs` →
`529 registry IDs, 529 node rows, 23 registry table(s); canonical files + statuses + deep links + composites verified.`

- New registry section **§4.17 APP11-D01**, plus the `APP_11` write target declared
  in §3.
- **No pre-existing approved row was downgraded.** APP1-D02, APP2 Product Detail,
  UI02 and the APP10-I01 rows keep their statuses; the APP10-I01 rows are
  annotated as superseded *for placement only*.
- **No row self-approved.** The Claude agent is not the Product Owner and no
  `APP11-D01` approval token exists, so `APPROVED_FOR_IMPLEMENTATION` was not used.
- All 38 deep links carry the canonical file key, match their row's node id, and
  carry no `t=` tracker parameter.

---

## K. Design decisions & non-goals

**Decisions taken autonomously** (smallest coherent option, per §22):

1. Gallery feed density follows UI05 (3/2/1), not UI02 (5/3/2) — UI05 is the
   authority for this surface and its cards carry a title plus short description,
   which is the `gallery_entries` shape.
2. The ordered-media section replaces Member Works **in place** rather than being
   appended, so the page order stays as UI05 drew it.
3. Publication is a card in the editor's metadata rail plus three full-screen
   states, mirroring APP2 — no third route.
4. `docs/07-ADMIN-OPERATIONS` §4 lists "Categorize entries" and "Configure alt
   text"; neither has a column or planned operation. Both are recorded as a
   **doc-vs-schema divergence for the Product Owner** and were not drawn.
5. Store contact values are placeholders; canonical values are supplied at S05.

**Non-goals — restated on `874:1006` in the file itself:**

```text
DO NOT redraw /kham-pha.
DO NOT redraw the /bo-suu-tap feed.
DO NOT implement the UI05 Collection → Works hierarchy, /collections or /works/[slug].
DO NOT ship Journal / blog.
DO NOT move Zalo/Messenger back into the footer.
DO NOT build a generic CMS or page builder.
DO NOT add a third Admin route for publication.
DO NOT add fields the schema does not have.
DO NOT modify the DS file to satisfy APP11.
```

**Design-system hygiene:** 0 detached instances, 0 new components, 0 new tokens or
text styles, `FIG-FILE-DS` untouched. All type uses `Typography/*`; all colour uses
`Color/*` variables.

---

## L.0 Layout correction (post-review, same checkpoint)

The first pass placed every frame with **absolute canvas coordinates**. For a
child of a `SECTION`, Figma treats `node.x` / `node.y` as **relative to the
section**, so each frame was displaced by its own section's origin
(`absX = section.x + child.x`). Content Page frames landed at `x ≈ 26 080`, on top
of the Admin sections; the earlier bounds check missed it because it compared a
section-relative child `.x` against an absolute section `.x` and the two errors
cancelled.

Corrected by re-laying out every section with **relative** coordinates on an
explicit row grid (margin 80, gutters 120 × 200, title band 240), refitting each
section to its content, then spacing the eight sections along the page with a
400px gutter. Re-verified with `absoluteBoundingBox`:

```text
sections = 8 · frames = 33
section-to-section overlaps      = 0
frames outside their own section = 0
sibling frame overlaps           = 0
cross-section frame overlaps     = 0
```

Two copy defects that only became visible in the captures were also fixed:

- the side navigation showed **`Bộ sưu tập` twice** in four editor frames — the
  bulk copy pass had renamed the plain `Sản phẩm` nav item; restored;
- the publication readiness list carried a fifth, product-specific row
  (`… ảnh "Sẵn sàng" làm ảnh đại diện`) that duplicated the asset rule; it is now
  the slug rule, so Ready and Blocked both show exactly the four documented
  criteria. The mobile list's `Tải thêm sản phẩm` became `Tải thêm mục`.

**No node was created or deleted by this correction** — only positions, section
sizes and four strings changed, so all 38 registry rows still point at the same
node IDs and the gate is unaffected.

---

## L. Validation

```text
CHANGE_IMPACT
  Figma: page APP_11 (853:2) — 8 sections, 33 frames created.
         0 nodes edited outside APP_11. UI01, UI02, UI05, APP1-D02, APP2-D01,
         APP2-S02-G01 and APP10-I01 source nodes are byte-unchanged.
         0 changes to FIG-FILE-DS.
  Repo:  3 markdown files (registry, phase plan, this report).
         0 runtime · 0 SCSS · 0 OpenAPI · 0 generated client
         0 migrations · 0 dependencies · 0 infrastructure
```

```text
TESTS_RUN
  node tools/check-figma-design-index.mjs
    → PASS (529 registry IDs, 529 node rows, 23 tables)
  npx prettier --check  (the three changed markdown files)
    → PASS
  Live Figma visual inspection — every section captured and reviewed after the
  layout correction (§L.0), plus the whole page:
    853:2    whole APP_11 page      — 8 blocks, clear gutters, no overlap
    857:3    authority map          857:4  homepage reconciliation
    857:5    gallery detail         857:6  content page template
    857:7    admin gallery list     857:8  admin gallery editor
    857:9    footer & floating dock 857:10 responsive/a11y/SEO notes
  Frame-level captures re-reviewed after the copy fixes:
    870:1104 publication ready · 870:1187 publication blocked
    867:946  admin gallery list mobile
    864:1253 content page template mobile (no horizontal overflow)
  Live structural verification — read back with absoluteBoundingBox:
    APP_11 holds exactly 8 sections / 33 frames; no stray top-level node
    0 section overlaps · 0 frames outside their section · 0 sibling overlaps
    0 cross-section frame overlaps
    no gallery-feed frame exists on APP_11
    "Section / Member Works" absent from all 3 APP11 detail frames
    no Journal section in any APP11 homepage frame
    every admin row/table column sums to the 1036px content width
  git status / git diff — only the three permitted files changed
```

```text
TESTS_NOT_RUN
  full monorepo test · full E2E · functional regression
  API / Admin / Storefront / worker / database suites
  Playwright · OpenAPI generator · SCSS compile · APP10-E01
  historical phase suites

WHY_NOT_RUN
  Forbidden by the checkpoint prompt §21 and by the phase change-impact policy.
  This checkpoint changes design and documentation only; no executable artifact
  changed, so no suite has a dependency reason to run.
```

**Not claimed:** no runtime behaviour was exercised, and no design row is
approved — all 38 await Product Owner review.

---

## M. Files changed

```text
M docs/design/FIGMA_DESIGN_INDEX.md
    §3 APP_11 write target; new §4.17 with 38 REVIEW_REQUIRED rows.
M docs/implementation/phases/APP11-GALLERY-CONTENT-AND-SEO.md
    §0 roadmap (D01 COMPLETE, B01 NEXT); §3.2 delivery note.
A docs/implementation/reports/APP11-D01-COMPLETION-REPORT.md
    this report.
```

Figma: page `APP_11` (`853:2`) in `BQwqV8GdfUIELvsQDB1UQE`. No other repository
file and no other Figma page was modified.

---

## N. Roadmap status

```text
APP11-G01     COMPLETE
APP11-G01-C1  COMPLETE
APP11-D01     COMPLETE
APP11-B01     NEXT          ← exactly one
APP11-B02 … APP11-X01       NOT STARTED
```

`APP11-B01` (Admin gallery entry authoring, +4 HTTP operations) is not started.

---

## O. Handoff note for the Product Owner

All 38 rows are `REVIEW_REQUIRED`. Reviewing the package in Figma and passing it
promotes them to `APPROVED_FOR_IMPLEMENTATION` under a new approval token
(`FIG-APPROVAL-APP11-D01-PO-001`), following the `APP3-D01`…`APP10-D01`
precedent — a registry-status change only, with no Figma node touched.

Two items genuinely need a Product Owner decision **before `APP11-S05`**, neither
of which blocks `APP11-B01`:

1. **Canonical store values** — address, opening hours, phone and email for
   `/cua-hang` and the footer. Drawn as labelled placeholders; not invented.
2. **The `07-ADMIN-OPERATIONS` §4 divergence** — "Categorize entries" and
   "Configure alt text" have no column, no planned operation and are not drawn.
   Either the document is amended, or they become APP12 scope with a migration.
