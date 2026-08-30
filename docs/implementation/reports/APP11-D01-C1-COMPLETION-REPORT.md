# APP11-D01-C1 — Design Authority Consistency & Responsive Footer Correction

**Checkpoint:** `APP11-D01-C1`
**Phase:** APP11 — Gallery, Content, SEO and Store Presentation
**Mode:** DESIGN CORRECTION · FIGMA + REGISTRY + DOCS ONLY · NO RUNTIME IMPLEMENTATION
**Date:** 2026-08-30
**Entered because:** the Product Owner reviewed `APP11-D01` and withheld PASS on
two defects — an unsupported per-asset alt-text ownership claim, and a
Desktop-only footer store-presentation supplement.
**Correction budget:** this is the one and only correction allowed for
`APP11-D01`. No `APP11-D01-C2` was created.

---

## A. Verdict

```text
APP11-D01-C1         = COMPLETE
APP11-D01            = COMPLETE
PO_DECISION_REQUIRED = NONE
NEXT_CHECKPOINT      = APP11-B01
```

```text
ALT_TEXT_MODEL             = DERIVED_NOT_PERSISTED
PER_IMAGE_ALT_DB_FIELD     = false
PER_IMAGE_ALT_API_FIELD    = false
PER_IMAGE_ALT_ADMIN_EDITOR = false
MIGRATION_ADDED            = false

FOOTER_SUPPLEMENT
  desktop = 872:1029  (1440 × 664, unchanged)
  tablet  = 888:1006  (1024 × 839, NEW)
  mobile  = 888:1058  ( 390 × 1162, NEW)
  authority annotation = 889:1030 (1400 × 843, NEW)

FIGMA_REGISTRY  before = 529 · after = 532 · checker = PASS
ACCEPTED_D01_PACKAGE_CHANGED = false
```

Neither defect required a schema, API or Admin-control change, so the locked
`APP11_SCHEMA_DISPOSITION = NO_MIGRATION_REQUIRED` and the planned HTTP delta are
unchanged. Both Product Owner items deferred by `APP11-D01` stay deferred and
neither blocks `APP11-B01`.

---

## B. Accepted D01 package left unchanged

The Product Owner accepted the bulk of `APP11-D01`. Nothing in the list below was
redrawn, restructured, re-registered or re-copied by this correction. Verified in
§G by node-level comparison.

| Accepted area | Nodes | Touched by C1 |
|---|---|---|
| Gallery feed (UI05 reused, not redrawn) | `329:2` `339:2` `343:2` `353:2` `357:3` | **No** |
| Gallery feed density (3/2/1 at 410/452/342) | — | **No** |
| Gallery entry detail structure | `860:442` `861:4321` `861:4487` | Caption text only (§C) |
| Homepage reconciliation (Journal excluded) | `857:11` `857:318` `857:506` `858:442` | **No** |
| Content-page template + Service/FAQ/Local/Policy | `863:677` `864:1085` `864:1253` `864:677` `864:779` `864:881` `864:983` | Media-block note text only (§C) |
| Admin Gallery list | `866:905` `867:907` `867:946` | **No** |
| Admin Gallery editor + publication panel | `868:909` `870:926` `870:1104` `870:1187` `870:1274` `870:1368` | **No** |
| Floating contact dock (bottom-right, not footer, not Drift) | `872:1079` `872:1089` `873:1018` | **No** |
| Footer handoff reconciliation record | `873:1006` | **No** |
| Desktop footer supplement | `872:1029` | **No** |
| Canonical routes | — | **No** |
| Schema disposition / planned HTTP delta / CMS disposition | — | **No** |

The two frames whose *text* changed are listed as changed in §C by design: the
alt correction had to be applied wherever the contradiction appeared, and §11
acceptance criterion 12 explicitly permits correcting an alt-authority
contradiction inside gallery detail. No structure, layout, component, token or
state in those frames was altered.

---

## C. Alt authority correction

```text
ALT_TEXT_MODEL             = DERIVED_NOT_PERSISTED
PER_IMAGE_ALT_DB_FIELD     = false
PER_IMAGE_ALT_API_FIELD    = false
PER_IMAGE_ALT_ADMIN_EDITOR = false
```

### C.1 Why the D01 statement was implementation-dangerous

`APP11-G01` had already established the repository truth: `assets`,
`product_media` and `gallery_entry_assets` carry **no alt-text column**, and
`gallery_entries.title` is the only descriptive text available. Migration `0018`
creates `gallery_entries` flat. `APP11-D01` nevertheless wrote *"Alt text is
owned per gallery asset"* into the handoff notes and repeated the idea in the
three Gallery-Detail media captions. An implementer reading that at `APP11-S05`
would have had to invent a column, an API property and an Admin editor to satisfy
it. The correction removes the claim rather than the constraint.

The accepted APP2 precedent — derived accessible text from the entity
context/title — is what APP11 now states.

### C.2 The authority now published in Figma

- **Gallery feed/card** — accessible image text is derived from the gallery entry
  title/context.
- **Gallery entry detail** — derived from the gallery entry title plus, where
  differentiation is useful, the image position in `display_order`.
- **Decorative / fallback imagery** — keeps the existing decorative and
  placeholder semantics.
- **Content pages** — alt is authored in the page source; content pages have no
  persistence in APP11 at all, so there is no stored field there either.
- **Admin** — no per-image alt editor exists in APP11.

### C.3 Every Figma text node corrected — 11 nodes

| # | Node | Frame / context | Was | Now |
|---|---|---|---|---|
| 1 | `875:1026` | `875:1006` Responsive/States/A11y/SEO notes | "Alt text is owned per gallery asset." | `ALT TEXT = DERIVED, NOT PERSISTED` — no column, no API property, no Admin editor; derived from title + image position |
| 2 | `860:635` | `860:442` Gallery detail Desktop | "mỗi ảnh có alt riêng" | "văn bản thay thế suy ra từ tiêu đề mục + vị trí ảnh (KHÔNG có trường alt lưu riêng)" |
| 3 | `861:4466` | `861:4321` Gallery detail Tablet | "alt riêng cho mỗi ảnh" | as above |
| 4 | `861:4619` | `861:4487` Gallery detail Mobile | "alt riêng cho mỗi ảnh" | as above |
| 5 | `862:665` | `862:656` Gallery detail supplement record | "Each asset carries its own alt text." | "No asset carries a stored alt field: accessible image text is DERIVED at render time…" |
| 6 | `874:1027` | `874:1006` Authority map & handoff | recorded the `07-ADMIN-OPERATIONS` divergence only | adds the C1 resolution: "Configure alt text" = NOT IMPLEMENTED IN APP11; no migration added; divergence still recorded for the PO |
| 7–11 | `863:717` `864:694` `864:898` `864:1102` `864:1270` | Content-page media blocks (template D/T/M, Service, Local) | "alt text là bắt buộc" — silent about where it comes from | "văn bản thay thế viết trong mã nguồn trang (KHÔNG có trường alt lưu trữ)" |

Nodes 7–11 were ambiguous rather than wrong. They are corrected because §11
criterion 2 requires *all* APP_11 alt notes to be consistent with
`DERIVED_NOT_PERSISTED`; left as-is, "alt text is mandatory" on a media block is
readable as a field to be filled in.

`862:670` already said *"Do NOT add a per-image alt editor to this surface"* and
`874:1026` already said *"NO per-image alt column"* — both were already correct
and were left alone.

### C.4 Verification

A full-page re-scan for the concepts `owned per` · `own alt` · `alt riêng` ·
`per-image alt column/field/editor` · `configure alt`, excluding the new negative
statements, returned:

```text
remainingContradictions = []          (0 nodes)
adminAltControls        = []          (0 nodes under 857:7 Admin list and 857:8 Admin editor)
```

No node outside `APP_11` was edited — the historical APP2/APP4/APP10 source
frames were not rewritten.

---

## D. Responsive footer supplement

The Footer was **not** redesigned. `FIG-DS-FOOTER` and the DS file
`hsxSjwkqQKM9vuyRgWSesU` are untouched, the desktop supplement is unchanged, and
no new content or business fact was introduced — the same content model and the
same placeholders as Desktop.

| Viewport | Node | Size | Composition |
|---|---|---|---|
| Desktop 1440 | `872:1029` | 1440 × 664 | **Existing, unchanged.** Four 260px columns in one row, 64 gap; side padding 80. DS `Footer` instance below (padding 64/64/48/64). |
| Tablet 1024 | **`888:1006`** | 1024 × 839 | **NEW.** 2 × 2 column grid — two rows, 32 row gap, 48 column gap, each column `FILL` (440); side padding 48. Keeps the approved DS `Footer` instance, resized to 1024, matching the approved shell footer `405:3761`. |
| Mobile 390 | **`888:1058`** | 390 × 1162 | **NEW.** Single stacked column, 28 gap, every column `FILL` (342); side padding 24. The desktop `Footer` instance is replaced by a clone of the **approved** `Mobile Footer` (`APP1-D02` `409:2359`, padding 32/24/32/24). Ends with a reserved 100px dock safe area. |
| Responsive authority | **`889:1030`** | 1400 × 843 | **NEW** annotation frame (§D.2). |

### D.1 Responsive behaviour made explicit

- **Column → stack.** Desktop 4-in-a-row → Tablet 2 × 2 → Mobile single stack.
  The columns are never reflowed internally; only their grouping changes.
- **Section ordering — identical at every width.** Xưởng Thêu (address ·
  opening hours · → `/cua-hang`) → LIÊN HỆ → DỊCH VỤ & HỖ TRỢ → CHÍNH SÁCH.
  Tablet row 1 = Xưởng Thêu + LIÊN HỆ; row 2 = DỊCH VỤ & HỖ TRỢ + CHÍNH SÁCH.
  Source order equals visual order at every width, so keyboard order needs no
  correction.
- **Link grouping.** Policy links stay in **one** column at every width and are
  never split across rows or merged into the service column. Service/FAQ/gallery
  links likewise stay together. External contact (Zalo · Messenger) is **not** a
  footer column at any width — it lives only in the floating dock.
- **Spacing.** Side padding 80 / 48 / 24 — the Storefront gutters already
  documented in `875:1009`. Block padding 56 / 56 / 40 vertical.
- **Long-address and phone/email wrapping.** Address, opening hours and the
  Zalo/Messenger note wrap to as many lines as needed — never truncated, never
  ellipsised. Phone and email wrap as whole strings and never break mid-token; on
  mobile each stays a ≥44×44 tap target. Long policy labels wrap inside their own
  column.
- **Relationship to the existing Footer.** The `StorePresentationBlock` is
  APP11-owned and composed **above** the shell footer at every width. Desktop and
  Tablet keep the approved DS `Footer` instance (`APP1-D02` `405:2253` /
  `405:3761`); Mobile keeps the approved `Mobile Footer` (`409:2359`).
- **Relationship to the floating dock.** The dock stays a separate fixed
  bottom-right layer and never enters the footer flow. Mobile reserves **100px**
  below the last footer row — matching the dock's documented mobile inset (right
  16 · bottom 100, clearing the 84px sticky commission bar) — so the dock can
  never cover footer content. Desktop and Tablet need no reserve: the dock's 32px
  inset already clears the footer. The dock itself is unchanged.

### D.2 Canonical values remain placeholders

Address, opening hours, phone and email are placeholders at all three widths,
exactly as Desktop. `APP11-D01-C1` invented no production data. The Product Owner
supplies the canonical values before `APP11-S05`; this is not a blocker for
`APP11-B01`.

### D.3 Design-system cost

0 new components, 0 new variables, 0 new text styles, 0 detached instances. Both
new frames are clones of the approved desktop supplement, so every component
instance, bound variable and text style is inherited. The DS file was not opened
for writing.

---

## E. Registry delta

```text
rows before correction = 529
rows after correction  = 532
new rows               = 3
checker                = PASS
```

```text
node tools/check-figma-design-index.mjs
Figma Design Index check passed (532 registry IDs, 532 node rows,
23 registry table(s); canonical files + statuses + deep links + composites verified).
```

New rows in `docs/design/FIGMA_DESIGN_INDEX.md` §4.17, owning phase
`APP11-D01-C1`, all `REVIEW_REQUIRED` with approval evidence `—`:

| Registry ID | Screen/Asset | State | Viewport | Node |
|---|---|---|---|---|
| `FIG-APP11-FOOTER-STORE-SUPPLEMENT-TABLET` | Footer Store Presentation Supplement | Default | Tablet 1024 | `888:1006` |
| `FIG-APP11-FOOTER-STORE-SUPPLEMENT-MOBILE` | Footer Store Presentation Supplement | Default | Mobile 390 | `888:1058` |
| `FIG-APP11-FOOTER-SUPPLEMENT-RESPONSIVE-AUTHORITY` | Footer Supplement Responsive Authority | Specification | Desktop | `889:1030` |

Composite uniqueness holds: the three rows differ from the existing
`FIG-APP11-FOOTER-STORE-SUPPLEMENT` row by Viewport (Tablet 1024 / Mobile 390)
and by Screen/State respectively.

**All 41 APP11 rows — the 38 from `APP11-D01` and the 3 from `APP11-D01-C1` —
remain `REVIEW_REQUIRED`.** No row was promoted, no approval token was created or
assumed, and `FIG-APPROVAL-APP11-D01-PO-001` does **not** exist. No
`APPROVED_FOR_IMPLEMENTATION` row anywhere in the registry was altered — in
particular the `APP1-D02` shell rows and `FIG-DS-FOOTER` are untouched.

---

## F. Visual and structural verification

Every changed and new node was read back live and rendered. Findings are reported
as observed, including two defects that the geometry numbers alone did not catch.

### F.1 Page geometry — measured with `absoluteBoundingBox`

```text
sections = 8 · frames = 36   (33 from D01 + 3 new)
section-to-section overlaps      = 0
frames outside their own section = 0
sibling frame overlaps           = 0
cross-section frame overlaps     = 0
unmapped section children        = 0
```

`SECTION` children use section-relative coordinates (`absX = section.x + child.x`),
so placement was verified with `absoluteBoundingBox` and never with `.x`.

### F.2 No overflow inside the three footer frames

Every descendant was compared against its own frame box:

```text
872:1029 (1440 × 664)  overflowing = []
888:1006 (1024 × 839)  overflowing = []
888:1058 ( 390 × 1162) overflowing = []
```

### F.3 Two defects found by capture, not by numbers

1. **Placeholder note overflowed the right edge** on both new frames. The
   Product-Owner-placeholder line was cloned from Desktop at a fixed 1280px width
   and stayed fixed after the resize, so it was clipped mid-sentence at
   1024 and 390. Fixed by setting `layoutSizingHorizontal = FILL`
   (`888:1030`, `888:1082`); it now wraps to 2 and 4 lines respectively.
2. **My own alt correction broke an accepted frame.** The longer mobile caption
   wrapped to one extra line (+17px), growing `Section / Entry Media`
   (`861:4616`) inside `861:4487` — a `layoutMode = NONE` frame whose sections are
   absolutely stacked at gap 0. Nothing below it moved, so it overlapped
   `Section / Related Product` by 17px. Repaired by shifting the six following
   siblings down 17px and growing the frame 4739 → 4756. Re-measured:

```text
consecutive section gaps in 861:4487 = 0,0,0,0,0,0,0,0,0,0
(the 187px offset before StickyCommissionBar is pre-existing overlay
 placement and was not introduced or altered here)
```

Desktop (`860:442`) and Tablet (`861:4321`) were unaffected — their captions did
not rewrap, and both still stack at gap 0 with `bottomGap = 0`.

### F.4 Captures reviewed

| Node | What the capture confirmed |
|---|---|
| `888:1006` Tablet | 2 × 2 grid, columns aligned at 440, no clipping, note wraps to 2 lines, DS footer intact |
| `888:1058` Mobile | single stack, all four columns at 342, note wraps to 4 lines, approved Mobile Footer, dashed 100px dock reserve visible at the bottom |
| `889:1030` Responsive authority | all 17 lines legible, no overflow |
| `875:1006` Notes | reads `ALT TEXT = DERIVED, NOT PERSISTED …`; the old claim is gone |
| `857:9` Footer section | three rows, desktop supplement + record, docks, new responsive row — no overlap at any point |
| `861:4616` Mobile media section | corrected caption renders in full inside the section, nothing clipped |

### F.5 Floating dock remains separate

The dock frames `872:1079`, `872:1089` and `873:1018` were not edited. The mobile
supplement contains a *reserved area annotation*, not a dock: the dock is not
drawn inside the footer at any width, and the reserve is labelled "Dock là lớp
fixed riêng, KHÔNG nằm trong luồng chân trang và KHÔNG được vẽ lại ở đây".

---

## G. No-change proof

Beyond §B, node-level evidence that the accepted design was not modified:

- **Only 11 text nodes had their `characters` rewritten** (§C.3) and **only 2
  had a sizing property changed** (`888:1030`, `888:1082` — both inside the new
  frames). Every other mutation in this checkpoint was `x`/`y`/`width`/`height`
  from the deterministic section reflow, which restores the same row grid D01
  used.
- **3 frames were created** (`888:1006`, `888:1058`, `889:1030`) and **0 frames
  were deleted**. The one removed node was the cloned desktop `Footer` instance
  *inside the new mobile frame*, replaced there by the approved `Mobile Footer` —
  no original node was removed.
- **Gallery feed:** unchanged. The five registered UI05 nodes live on the `User
  Interface` page, which this correction never opened for writing.
- **Homepage, content-page template, Admin list, Admin editor:** no structural
  edit; the only content-page change is the media-block alt wording (§C.3, rows
  7–11).
- **Routes, dock placement, schema disposition, HTTP delta, CMS disposition:**
  not touched in Figma or in docs.
- **Registry:** 3 rows appended, 0 rows modified, 0 rows removed.

---

## H. Validation

```text
CHANGE_IMPACT = Figma APP_11 page (11 text corrections, 3 new frames,
                deterministic section reflow) + design registry rows
                + phase plan + two completion reports.
                ZERO executable application code changed:
                no runtime, no OpenAPI, no generated client, no database,
                no migration, no dependency, no infrastructure.
```

```text
TESTS_RUN
  node tools/check-figma-design-index.mjs                     PASS (532 rows)
  pnpm exec prettier --check <the 4 changed markdown files>   PASS
  live Figma read-back of every changed and new node          PASS
  render Desktop / Tablet / Mobile footer supplement          PASS
  descendant-overflow check on the 3 footer frames            PASS (0)
  page-wide overlap/containment check (8 sections, 36 frames) PASS (0/0/0/0)
  APP_11 re-scan for contradictory alt ownership              PASS (0 remaining)
  per-image-alt Admin control scan (857:7, 857:8)             PASS (0 controls)
  git status / git diff review                                PASS
```

```text
TESTS_NOT_RUN
  API tests · Admin runtime tests · Storefront runtime tests · worker tests
  database tests · Playwright E2E · OpenAPI generator · generated-client build
  SCSS compile · historical suites · any repository-wide aggregate

WHY_NOT_RUN
  Forbidden by the correction directive §8 (FULL_MONOREPO_TEST = FORBIDDEN,
  FULL_E2E = FORBIDDEN, FUNCTIONAL_REGRESSION = NOT_RUN_BY_DESIGN) and
  unjustified under docs/implementation/VALIDATION_GOVERNANCE.md §3: this
  checkpoint changes no executable code, so no runtime behaviour is reachable
  by any of them. The validations that CAN observe this change — the design
  registry gate, live Figma read-back, rendered captures and Prettier — were
  all run and all pass.
```

---

## I. Files changed

| File | Change |
|---|---|
| Figma `APP_11` (`853:2`), file `BQwqV8GdfUIELvsQDB1UQE` | 11 text nodes corrected; 3 frames created (`888:1006`, `888:1058`, `889:1030`); mobile detail frame repaired; sections reflowed |
| `docs/design/FIGMA_DESIGN_INDEX.md` | §4.17 — 3 new `REVIEW_REQUIRED` rows, preamble count 38 → 41 |
| `docs/implementation/phases/APP11-GALLERY-CONTENT-AND-SEO.md` | roadmap row `APP11-D01-C1` = COMPLETE; correction recorded in the D01 delivery note |
| `docs/implementation/reports/APP11-D01-COMPLETION-REPORT.md` | "CORRECTED BY `APP11-D01-C1`" banner naming both defects |
| `docs/implementation/reports/APP11-D01-C1-COMPLETION-REPORT.md` | **new** — this report |

No file outside this list was modified. No runtime, OpenAPI, generated-client,
database, migration, dependency or infrastructure file was touched, and no
historical Figma authority outside `APP_11` was edited.

---

## J. Roadmap status

| Checkpoint | Status |
|---|---|
| `APP11-G01` | COMPLETE |
| `APP11-G01-C1` | COMPLETE |
| `APP11-D01` | COMPLETE |
| `APP11-D01-C1` | COMPLETE |
| `APP11-B01` | **NEXT** |
| later APP11 checkpoints | NOT STARTED |

Exactly one `NEXT`. `APP11-B01` was **not** started.

---

## K. Deferred Product Owner items — unchanged, non-blocking

1. **Canonical store values** — address, opening hours, phone, email. Still
   placeholders at all three footer widths. Required before `APP11-S05`, not
   before `APP11-B01`.
2. **`docs/07-ADMIN-OPERATIONS.md` §4 divergence** — "Categorize entries" and
   "Configure alt text". Resolved **for APP11 implementation only**: "Configure
   alt text" = NOT IMPLEMENTED IN APP11 because no persistence and no operation
   exist; APP11 uses derived accessible image text. No migration was added to
   satisfy the stale wording. "Categorize entries" likewise has no column and is
   still not drawn. The Product Owner may reconcile the product documentation
   separately.

Neither blocks `APP11-B01`.

---

## L. Review pointers

To review this correction in Figma, open in order:

1. `875:1006` — the corrected handoff notes (`ALT TEXT = DERIVED, NOT PERSISTED`).
2. `874:1006` — the authority map, for the `07-ADMIN-OPERATIONS` resolution.
3. `857:9` — the footer section, whose third row is the new responsive package.
4. `888:1006` and `888:1058` — Tablet and Mobile supplements.
5. `889:1030` — the responsive authority annotation.

All 41 APP11 rows await Product Owner review; none may be implemented until the
approval token is issued.
