# APP2-S02-G01-C1 — Completion report

**Checkpoint:** `APP2-S02-G01-C1` — constrain the reconciled Product Detail story copy to
the approved readable measure and reconcile the affected Figma evidence/authority.
**Date:** 2026-08-02 · **Branch:** `production` · **Verdict:** `PASS`
**Type:** design/authority correction. No application source changed.

---

## A. Entry and the exact G01 A/B chain

```text
APP2_S02_G01_C1_PREFLIGHT = PASS
```

| Check | Result |
|---|---|
| `git branch --show-current` | `production` |
| `git rev-parse HEAD` at entry | `86626b2f991be5d680c25d2fb2ee641839d04c3f` |
| Entry HEAD subject | `docs(app2): record S02 design-gate evidence` (1 file, +459) |
| G01 Commit A | `0d178ed8aabb5c333362374d4e41869724e8d378` — `docs(app2): reconcile Storefront Product Detail authority` (12 files, +1283 −64), unchanged |
| G01 Commit B | `86626b2f991be5d680c25d2fb2ee641839d04c3f`, unchanged |
| S01 accepted chain | `7fe835b` / `4051bb9` / `a134c73` / `b968194` unchanged |
| Tracked/staged tree | clean |
| Ignored `evidences/` | untouched |
| Pushed | nothing — 60 ahead of `origin/production` at entry |
| S02/E01/X01 implementation | none |

Preflight gates, all green before any edit: `check:secrets` (360 documents / 1759 files),
`check:lifecycle`, `check:pagination-authority` + **14**, `check:storefront-route-authority`
+ **21**, `check:storefront-product-detail-authority` + **29**, `check:figma-design-index`
(86/86/11) + **31**, `check:openapi`, `check:api-client`, `db:check:manifest`, `pnpm quality`
(exit 0), `git diff --check` clean.

No Git edit was made until the live pre-correction Figma audit in §C was complete.

---

## B. Reviewer finding, reproduced exactly

The finding is correct and reproduced node-for-node against live Figma:

| Node | Reviewer | Measured live |
|---|---|---|
| `529:2259` StoryColumns (Desktop) | 1280px | **1280 × 58** |
| `529:2260` Description | 1280px | **1280 × 58** |
| `529:2261` DescriptionBody | 1280px | **1280 × 58** |
| `529:2263` description text | 1280px | **1280 × 58** |
| `529:2459` Description (Tablet) | 928px | **928 × 58** |
| `529:2461` description text | 928px | **928 × 58** |
| `532:34` StoryColumns (Media Empty) | 1280px | **1280 × 58** |
| `532:35` Description | 1280px | **1280 × 58** |
| `532:36` DescriptionBody | 1280px | **1280 × 58** |
| `532:37` description text | 1280px | **1280 × 58** |

The original UI03 accessibility authority still states the rule. Board `292:1582`,
*Note / Story & Craft*, verbatim: **"cột chữ ≤ 640px (~75 ký tự)"**.

**Root cause.** The UI03 draft laid the story out as a horizontal `StoryColumns` row: a
736px text column beside a 480px `StoryMedia` image. `APP2-S02-G01` correctly removed
`StoryMedia` (a supporting `TEMP_ASSET` that is not in `media[]`), which left the text as the
only `FILL` child of that row — so it expanded to the entire 1280px band. The tablet layout
had no media column to begin with and its blocks were already band-width. The G01 report
asserted a "readable single-column story measure" from the UI03 responsive intent and
**never measured the delivered nodes**. That is the defect: an unverified claim, not a
disagreement about the number.

---

## C. Live pre-correction geometry

Recorded before any edit, all values live.

| Node | x | y | w | h | parent |
|---|---|---|---|---|---|
| `529:2257` Section / Story | 0 | 1465 | 1440 | 354 | `529:2225` |
| `529:2259` StoryColumns | 80 | 208 | 1280 | 58 | `529:2257` |
| `529:2260` Description | 0 | 0 | 1280 | 58 | `529:2259` |
| `529:2261` DescriptionBody | 0 | 0 | 1280 | 58 | `529:2260` |
| `529:2263` text (203 chars) | 0 | 0 | 1280 | 58 | `529:2261` |
| `529:2457` Section / Story | 0 | 1206 | 1024 | 274 | `529:2431` |
| `529:2459` Description | 48 | 152 | 928 | 58 | `529:2457` |
| `529:2461` text (203 chars) | 0 | 0 | 928 | 58 | `529:2459` |
| `532:32` Section / Story | 0 | 1312 | 1440 | 354 | `532:3` |
| `532:34` StoryColumns | 80 | 208 | 1280 | 58 | `532:32` |
| `532:35` / `532:36` / `532:37` | 0 | 0 | 1280 | 58 | nested |
| `529:2601` Description (Mobile) | 24 | 91 | **342** | 104 | `529:2599` |
| `529:2603` text (152 chars) | 0 | 0 | **342** | 104 | `529:2601` |
| `532:132` / `532:133` (Media Error) | 24 / 0 | 91 / 0 | **342** | 104 | nested |

Frames at entry: Desktop 1440×2470 · Tablet 1024×2063 · Mobile 390×1674 ·
Media Empty 1440×2317 · Media Error 390×1674. Story sections carry
`paddingLeft/Right` 80 (desktop), 48 (tablet), 24 (mobile) with `counterAxisAlignItems: MIN`
— which is why the gutter is already correct and only the measure was wrong.

---

## D. Figma edits

Three nodes were changed, on existing IDs only. Each was detached from counter-axis stretch
and pinned to the measure; every descendant is `FILL`/`STRETCH` and followed automatically:

```text
529:2259  layoutAlign STRETCH -> INHERIT · layoutSizingHorizontal FILL -> FIXED · width 640
532:34    layoutAlign STRETCH -> INHERIT · layoutSizingHorizontal FILL -> FIXED · width 640
529:2459  layoutAlign STRETCH -> INHERIT · layoutSizingHorizontal FILL -> FIXED · width 640
```

Each was renamed with a `· 640px measure` suffix so the constraint is legible on canvas. No
node was created, deleted, moved between parents, or replaced; no new root ID exists.

### D.1 A second defect, found during validation and fixed in the same pass

Not in the reviewer's finding, and disclosed rather than deferred. The overflow sweep run
after the measure fix showed two mobile stage labels were `WIDTH_AND_HEIGHT` text wider than
their clipping 342px stage — **essential copy was being cut off on both sides**:

| Node | Frame | Before | After |
|---|---|---|---|
| `532:111` media-error message | Mobile / Media Error | 455px wide at `x = -56`, clipped | `FILL` 342 × 34, `x = 0`, wraps |
| `529:2581` primary stage label | Mobile / Default | 351px wide at `x = -4`, clipped | `FILL` 342 × 34, `x = 0`, wraps |

Both are now `textAutoResize: HEIGHT`, `layoutSizingHorizontal: FILL`, centre-aligned. Fixing
this is inside the correction's scope — acceptance forbids clipping — and leaving a truncated
error message in approved authority while correcting a measure two frames away would have
been indefensible. A post-fix sweep of **every** text node in the section reports
`remainingClipped: []`.

---

## E. Exact post-correction geometry

| Node | Required | Measured | ✓ |
|---|---|---|---|
| `529:2259` | ≤ 640 | **640 × 87** | ✅ |
| `529:2260` | ≤ 640 | **640 × 87** | ✅ |
| `529:2261` | ≤ 640 | **640 × 87** | ✅ |
| `529:2263` | ≤ 640 | **640 × 87** | ✅ |
| `529:2459` | ≤ 640 | **640 × 87** | ✅ |
| `529:2461` | ≤ 640 | **640 × 87** | ✅ |
| `532:34` | ≤ 640 | **640 × 87** | ✅ |
| `532:35` | ≤ 640 | **640 × 87** | ✅ |
| `532:36` | ≤ 640 | **640 × 87** | ✅ |
| `532:37` | ≤ 640 | **640 × 87** | ✅ |
| `529:2601` | = 342 | **342 × 104** | ✅ |
| `529:2603` | = 342 | **342 × 104** | ✅ |
| `532:132` | = 342 | **342 × 104** | ✅ |
| `532:133` | = 342 | **342 × 104** | ✅ |

Gutter alignment: Desktop `529:2259.x = 80` · Tablet `529:2459.x = 48` ·
Media Empty `532:34.x = 80` · Mobile `529:2601.x = 24` and `532:132.x = 24`.

**Natural height, not a forced one.** The text nodes are `textAutoResize: HEIGHT`, so
narrowing 1280 → 640 reflowed the 203-character paragraph from 2 lines to 3 and the height
rose 58 → **87px** on its own. The old 58px was never re-applied; no fixed height is set
anywhere in the story subtree.

---

## F. Desktop screenshot review (`529:2225`)

At screenshot scale the paragraph reads as a **deliberate text column**: left-aligned on the
80px gutter, occupying roughly 44% of the 1440 band, wrapping to three lines directly under a
section heading sharing the same gutter. It is not a full-width rule of text, and it is not a
centred narrow marketing card — the ragged right edge sits well inside the band while the
block stays anchored left with the rest of the page's editorial rhythm. Order verified:
header → breadcrumb → hero → story → `Tiếp tục khám phá` → footer.

## G. Tablet screenshot review (`529:2431`)

Same reading at 1024. The 640px column against a 928px content width leaves a clear right
margin, and the paragraph wraps to three lines on the 48px gutter, aligned with its heading
and with the `Tiếp tục khám phá` buttons below. No centring, no full-bleed.

## H. Media-empty screenshot review (`532:3`)

Identical story treatment to Desktop / Default, with the honest empty-media placeholder above
it and still no thumbnail strip and no zoom affordance. The narrower measure did not disturb
the empty-state stage.

## I. Mobile unchanged verification (`529:2575`, `532:105`)

Story geometry is byte-identical to entry: description `342 × 104` at `x = 24`, section
`390 × 235`, frame `390 × 1674`. The mobile frames were **verified, not widened**. The only
mobile change is §D.1 — two clipped stage labels now wrap inside the 342px stage, which does
not alter any frame or section height.

---

## J. Parent heights and downstream positions

| Frame | Story section | Continuation | Footer | Frame height |
|---|---|---|---|---|
| Desktop / Default | 1465 → 1848 (383) | 1848 → 2172 | 2172 → 2499 | 2470 → **2499** |
| Tablet / Default | 1206 → 1509 (303) | 1509 → 1765 | 1765 → 2092 | 2063 → **2092** |
| Desktop / Media Empty | 1312 → 1695 (383) | 1695 → 2019 | 2019 → 2346 | 2317 → **2346** |
| Mobile / Default | 861 → 1096 (235) | 1096 → 1331 | 1331 → 1674 | **1674** (unchanged) |
| Mobile / Media Error | 861 → 1096 (235) | 1096 → 1331 | 1331 → 1674 | **1674** (unchanged) |

```text
overlaps between sections        0 in all five frames
footer is the last child         true in all five frames
frame height == content bottom   true in all five frames
horizontal overflow              0 (the 424px mobile swipe row remains
                                    intentionally clipped inside its 342px strip)
section box 529:2224             10080 × 2970 fits content max 9960 × 2879
```

The +29px growth propagated through the `HUG` auto-layout chain; nothing was repositioned by
hand and no blank fixed-height gap was introduced.

---

## K. Approval, ruling and Figma handoff authority

All three now state the rule verbatim:

```text
Product description uses a maximum readable measure of 640px on Desktop and
Tablet; Mobile uses its 342px content width.
```

- `docs/design/approvals/APP2-S02-G01-PRODUCT-DETAIL-DESIGN-APPROVAL.md` — amended in place,
  citing `292:1582` and naming the superseded widths as historical.
- `docs/implementation/phases/APP2-ASSETS-AND-CATALOG-PUBLICATION.md` §6.2.3 — new
  **Readable measure** paragraph plus two machine-checked facts.
- Figma contract handoff `537:3` — new row `541:3` carrying the same rule, the gutters and
  the natural-wrapping requirement. `541:3` is a child row inside an existing board, **not** a
  new root ID.

Copy, the one-section mapping, the heading `Câu chuyện về tác phẩm`, Product identity,
gallery, share, Discover continuation, route, SEO and the deferred scope are all unchanged.
Nothing deferred was reintroduced: `Cảm hứng`/`Ý tưởng`/`Ý nghĩa`, the supporting story
image, materials, process, related cards, commission and commerce all remain absent.

---

## L. Checker and regressions

Two facts added to the machine-checked table (9 → **11**):

```text
| `Description measure (desktop/tablet)` | `640px` |
| `Description measure (mobile)` | `342px content width` |
```

`checkMeasureRule` additionally requires the verbatim sentence in both the approval and the
`### 6.2.3` block — compared on collapsed whitespace, because the prose is hard-wrapped —
and `unlabelledMeasureClaims` fails any unlabelled line presenting 1280px or 928px as the
live description measure.

Five new regressions (29 → **34 pass / 0 fail**): 640px → 1280px, 640px → 928px, mobile
widened to `390px full bleed`, the rule deleted from the approval, and the ruling describing
the column as full-band.

**One narrowing worth recording.** The first version of `unlabelledMeasureClaims` flagged
`FU-APP2-STOREFRONT-CONTENT-BAND-01`'s legitimate sentence *"the APP1 shell max width stays
1200px although source frames draw 1280px"* — a true statement about the shell, not the
description. The predicate now also requires a description/story word on the line, and a
paired helper case asserts that exact sentence stays legal. A gate that cries wolf on true
prose gets disabled, so this mattered more than the extra line of code.

Historical prose remains legal, and no remote-Figma network dependency was added to
`pnpm quality` — the repository checker protects the **written** authority, while this report
carries the direct post-write Figma metadata (§E, §J).

---

## M. Registry and design integrity

```text
registry                         86 IDs / 86 node rows / 11 tables  (unchanged)
reconciled root IDs              529:2224 529:2225 529:2431 529:2575 532:3
                                 532:105 533:3 533:26 537:3 537:38  (unchanged)
new root IDs created             0
UI03 draft 261:1290              unchanged — still 16 children, geometry identical
UI01 183:2                       x0 y0 4920×6536   unchanged
UI02 208:538                     x5160 y0 4880×10726 unchanged
UI04 298:1568                    x15400 y0 4880×8980 unchanged
UI05 328:1739                    x20520 y0 5420×10866 unchanged
DS file hsxSjwkqQKM9vuyRgWSesU   not modified
approval ID                      FIG-APPROVAL-APP2-S02-G01-PRODUCT-DETAIL-001 unchanged
decision ID                      IMP-D039 unchanged and LOCKED
```

---

## N. Frozen engineering artifacts

```text
OpenAPI          c2c3b874ba6a3a77680e373a67c288b43580e549090c3fbc6075efbd66b84ee8
Shape            16 paths / 19 operations / 34 schemas
Generated client 7524fc918629c7b699ff732771940e05c962309be5eeefdfb53123bbe8ecf5a2
Database         33 migrations / 78 tables / 833 columns / 190 CHECKs
```

`apps/**`, runtime package source, OpenAPI, the generated client, the database, migrations,
infrastructure, dependencies and `pnpm-lock.yaml` are untouched. No S01 source changed.

---

## O. Commit C evidence

```text
893e9818bc4d1a5fd94a0ae2c24a3962d40ca500
fix(app2): constrain Product Detail story measure
4 files changed, 145 insertions(+), 2 deletions(-)
```

| File | Δ |
|---|---|
| `docs/design/approvals/APP2-S02-G01-PRODUCT-DETAIL-DESIGN-APPROVAL.md` | +11 |
| `docs/implementation/phases/APP2-ASSETS-AND-CATALOG-PUBLICATION.md` | +13 |
| `tools/check-storefront-product-detail-authority.mjs` | +56 −2 |
| `tools/check-storefront-product-detail-authority.test.mjs` | +67 |

`FIGMA_DESIGN_INDEX.md` is **not** in this commit: no registry row's textual authority
changed — the node IDs, statuses, approval evidence and counts are all identical. The Figma
edits are remote and are documented here as evidence, not as Git files.

---

## P. Validation

| Command | Result |
|---|---|
| `node --test tools/check-storefront-product-detail-authority.test.mjs` | **34 pass / 0 fail** |
| `pnpm check:storefront-product-detail-authority` | pass |
| `pnpm check:secrets` | pass |
| `pnpm check:lifecycle` | pass — LC-04 5 transitions |
| `pnpm check:pagination-authority` + regressions | pass — **14 pass / 0 fail** |
| `pnpm check:storefront-route-authority` + regressions | pass — **21 pass / 0 fail** |
| `pnpm check:figma-design-index` + regressions | pass — 86/86/11, **31 pass / 0 fail** |
| `pnpm check:openapi` | pass — artifact up to date |
| `pnpm check:api-client` | pass — tree hash `7524fc91…` |
| `pnpm db:check:manifest` | pass — 78 tables / 833 columns |
| `node tools/check-file-size.mjs` | pass — 0 hard-limit violations |
| `pnpm quality` | **QUALITY_EXIT=0** — 293 tool assertions, 0 fail |
| `git diff --check` | clean |

No application test was required or claimed; no application code may change in this
correction.

---

## Q. Acceptance

All 44 criteria met. The load-bearing ones:

| # | Criterion | Result |
|---|---|---|
| 1–3 | Clean exact G01 evidence entry; A/B unchanged; no application source | ✅ |
| 4 | Live pre-edit geometry recorded | ✅ §C |
| 5–8 | Desktop / Tablet / Media-Empty ≤ 640px; Mobile still 342px | ✅ §E |
| 9–11 | Gutters `x` = 80 / 48 / 24 | ✅ §E |
| 12–13 | Natural wrap; no fixed 58px clipping | ✅ 58 → 87px |
| 14–19 | Parents fit; continuation and footers moved; no overlap/clipping/overflow | ✅ §J |
| 20–22 | Copy, one-section mapping and deferred scope unchanged | ✅ §K |
| 23–26 | Approval, APP2 authority, Figma handoff and checker state the rule | ✅ §K, §L |
| 27 | New regressions pass | ✅ 34/34 |
| 28–33 | UI03/UI01/UI02/UI04/UI05, node IDs, 86/86/11, IMP-D039, approval ID | ✅ §M |
| 34–38 | OpenAPI, client, DB, dependencies unchanged; full quality passes | ✅ §N, §P |
| 39–44 | Two commits; complete report; clean tree; `evidences/` untouched; nothing pushed; S02/E01/X01 not started | ✅ |

```text
VERDICT = PASS
APP2-S02-G01-C2 = MUST_NOT_BE_CREATED
```

---

## R. Handoff to `APP2-S02`

```text
APP2-S02-G01 = COMPLETE — CORRECTED (C1) — DELIVERED_FOR_REVIEW
APP2-S02     = READY — NOT STARTED
APP2-E01     = BLOCKED_BY_APP2-S02
APP2-X01     = BLOCKED_BY_APP2-E01
```

`APP2-S02` implements `/san-pham/[slug]` against design authority `529:2224` under
`FIG-APPROVAL-APP2-S02-G01-PRODUCT-DETAIL-001`, consuming `publicProductDetail` only — still
withheld from the `@embroidery/api-client` public boundary and to be added there by S02. The
description must be constrained to a **640px maximum readable measure** on desktop and tablet
and to the 342px content width on mobile, aligned to the content gutter, wrapping naturally
with no fixed height. The page stays dynamic/`no-store` and returns the same safe 404 for
unknown, `DRAFT`, `ARCHIVED` and non-public-category slugs.
