# APP12-M01.E1-C1 — Final M01 Acceptance Correction

`APP12-M01.E1-C1 = COMPLETE`

The single authorized correction for `APP12-M01.E1`. Not a new APP12 checkpoint
id. `CORRECTION_USED = 1 / 1`. Nothing was pushed, nothing was deployed, no
`APP12-G03` data was created, no shared development database was written, no
migration was added and no HTTP operation was added.

---

## A. Verdict

Both blockers are closed, and the **thirty-three** cross-boundary journeys of the
E1 acceptance suite now pass — including the degraded-primary journey that failed
E1, which went green without a single assertion being softened.

```text
BLOCKER_1  Admin degraded stored-primary signal    CLOSED — §E, §F, §G, §M
BLOCKER_2  Figma lightbox / runtime reconciliation  CLOSED — §I, §J, §K, §L
```

Two things in this correction were **not** what the brief predicted, and both are
reported rather than quietly absorbed:

1. **The Figma frame was never drawing "text pills."** `944:187` already drew
   circular outline chevrons. The real divergence from runtime was smaller and
   different — a 52 px filled control against a 44 px transparent one — and that
   is what was reconciled. §I traces where the wrong premise came from.
2. **The two APP2 lightbox rows really were still active**, exactly as `E1`
   found. They are now superseded, per the PO's ruling. §J.

One thing was found and fixed inside this correction's own subject: the first
registry edit wrote the supersession note into the **Last Verified** column and
dropped a row's closing pipe, and `check-figma-design-index.mjs` passed anyway.
§K.

```text
NEW HTTP OPERATIONS   0
NEW ROUTES            0
NEW MIGRATIONS        0
NEW MESSAGE KEYS      0
NEW DEPENDENCIES      0
BACKEND FILES CHANGED 0
STOREFRONT CHANGED    0
```

---

## B. Product Owner correction authority

```text
APP12-M01.E1     = CORRECTION_REQUIRED   → addressed here
APP12-M01.E1-C1  = AUTHORIZED            → executed
CORRECTION_USED  = 1 / 1                 → no E1-C2 requested
APP12-G03        = NOT_AUTHORIZED        → not started
```

The 31 already-green E1 journeys were not rebuilt and not reopened. They were
re-run as a side effect of running the degraded-primary journey in its own suite
(§M) — the harness runs the mode, not one test — which costs nothing and is the
only way to prove §17's "no focused regression" claim on the surfaces this
correction actually touched.

---

## C. Figma environment preflight (§1)

The brief's preflight names the Figma **Desktop** MCP server. It was, and remains,
unreachable:

```text
figma-desktop   http://127.0.0.1:3845/mcp   ConnectionRefused, 3 probes, http 000
port 3845                                    no listener (netstat: 0 matches)
Figma.exe                                    0 processes
                                             (figma_agent.exe is the font helper,
                                              not the MCP server)
```

**The Product Owner directed the correction to proceed through the hosted Figma
MCP server instead** (`plugin:figma:figma` → `https://mcp.figma.com/mcp`), which
was already installed in this environment and which I had wrongly treated as
barred by §1's "do not invent a REST/Figma integration or alternate authority".
That reading was mine and it was wrong in one specific way: an already-installed
first-party Figma MCP server is not an invented integration. The PO authorised
the OAuth flow, completed it, and the correction ran on that authority.

**Recorded as an explicit deviation from §1**, because it is one:

```text
authority used     plugin:figma:figma  (hosted, https://mcp.figma.com/mcp)
authority named    figma-desktop       (local, http://127.0.0.1:3845/mcp)
authorised by      the Product Owner, in session, after the preflight failed
capability proved  full write access — `use_figma` executed the reconciliation
                   and the result was read back and re-rendered (§I)
```

Every prior design package in this phase used the desktop server. Nothing here
suggests the two authorities disagree — they address the same file key by the
same node ids, and the frame that came back matched the registry's record of it
exactly — but a future package should know which one wrote this frame.

---

## D. Accepted E1 baseline — preserved

Every line of §2's accepted evidence was re-run in the final run of this
correction (§M) and is unchanged:

```text
DB/domain invariants                     PASS      Admin DRAFT 1440/1024/390     PASS
20-image cap                             PASS      Admin PUBLISHED curation      PASS
PUBLISHED invalid-write atomicity        PASS      stale concurrency protection  PASS
stored-primary propagation               PASS      effective-primary fallback    PASS
public GET/SEO read-side non-mutation    PASS      Storefront 1/8/20 gallery     PASS
1440/1024/390 responsive                 PASS      counter/selection/keyboard    PASS
THUMBNAIL strip / CATALOG_PREVIEW stage  PASS      lightbox portal / ownership   PASS
lightbox scroll/focus semantics          PASS      performance budgets           PASS
axe serious/critical = 0                 PASS
```

`FU-APP12-H05-03` was not reopened. The Storefront lightbox runtime was not
changed — §I proves the reconciliation moved the *drawing* toward the code, never
the reverse.

---

## E. Admin degraded-primary root cause

`APP12-M01.E1` proved the behaviour live; this correction traced it to three
lines, each verified in source before anything was edited:

```text
1  model/product-media-selection.ts:44
   selectionFromDetailMedia(media: AdminProductMediaResponse[]): readonly string[]
   → narrows the response to asset ids. `status` is dropped here.

2  components/product-media-grid.tsx:8
   readonly selection: readonly string[]
   → the grid is therefore handed ids and nothing else.

3  components/product-media-grid-tile.tsx:70
   <AssetThumbnail assetId={assetId} state="READY" … />
   → with no status to read, the tile asserted health as a literal.
```

The defect was a **missing read**, never a wrong write. That is what made the
correction small, and it is why §5's warning against a Product-form state rewrite
was easy to honour: the write model needed no change at all.

**Why the already-delivered fallback could not rescue it.** `AssetThumbnail` has
an `onError` swap that renders *"Không tải được ảnh xem trước"* when a preview
fails to arrive — but `AdminAssetPreviewService.open` checks the Asset's lane,
its `deletedAt` and its derivative's readiness, and never its `status`. A
`REJECTED` Asset keeps its `READY` derivatives, so the preview is served normally
and `onError` never fires. The route is coherent; the tile was the only place the
truth could appear.

---

## F. Admin read/view-model correction

### F.1 — the seam

A **second, read-only projection** of the same response, deliberately kept apart
from the ordered id array:

```text
model/product-media-selection.ts
  + mediaStatusByAssetId(media): ReadonlyMap<string, string>
    selectionFromDetailMedia — unchanged, byte for byte

shared/media/asset-thumbnail-state.ts            (new, app-shared)
  + toAssetThumbnailState(status): AssetThumbnailState
  + assetThumbnailCaption(state): string

components/product-media-grid-tile.tsx   status?: string   → renders it
components/product-media-grid.tsx        statusByAssetId?  → passes it
components/product-media-editor.tsx      statusByAssetId?  → passes it
components/product-edit-form.tsx         derives it from product.media
components/product-published-media-form.tsx  derives it from product.media
```

§5 offered two shapes and this is the first — *selection ids + statusByAssetId* —
because it is the one that changes nothing: every selection operation, every
existing caller and the request contract are untouched, and the grid gains the
one fact it was missing.

**Keyed by Asset id, not by position.** The operator reorders freely before
saving, and a positional map would make a tile describe a different image's
health after an unsaved move. Proved directly in
`product-media-model.test.ts` — "is keyed by Asset id, so an unsaved reorder
cannot mislabel a tile".

### F.2 — the mapping was extracted, not copied

§4 says to reuse the canonical mapping if one exists. One did, but it was
**private** to `ProductMediaTile` — the Product *list* tile — so a second copy
was the only way to use it in the editor grid. It was therefore moved to
`shared/media/asset-thumbnail-state.ts` and both surfaces now import it.

It lives beside `AssetThumbnail` rather than in the products feature because it
produces that component's vocabulary and both callers are its consumers — the
same reasoning `media-copy.ts` already records next door. `ProductMediaTile` lost
its local copy in the same change, so the mapping has exactly one definition.

`AssetThumbnail`'s own `captionFor` now delegates to the shared caption for every
state except its private `failed` one, so a surface that renders a caption
*without* this component cannot describe the same state in different words.

### F.3 — no new copy, no new contract

```text
AdminProductMediaResponse.status     already published — no backend change
AssetThumbnailState = 'REJECTED'     already a delivered state
media.rejected  "Ảnh đã bị từ chối"  already an approved message key
```

```text
node tools/check-i18n-message-keys.mjs   OK — every key exists and every key is read
node tools/check-i18n-static-text.mjs    OK — no hard-coded human-facing text
NEW MESSAGE KEYS                          0
```

---

## G. Stored-primary and degraded-state semantics

### G.1 — both facts, at once

The two are independent and an operator needs both: an image can be the stored
primary **and** no longer usable — precisely the state that leaves every public
surface on a fallback while the stored designation has not moved.

```text
tile 1   badge  "Ảnh đại diện"        the stored primary, unchanged
         label  "Ảnh đại diện"        (two signals, neither colour-only)
         state  "Ảnh đã bị từ chối"   the new line, beside the role
tiles 2,3  untouched — a degraded primary does not make the whole set look broken
```

`evidences/m01-e1-c1/admin-degraded-stored-primary.png` shows exactly that.

The state line is a **sibling** of the role line, never a replacement: replacing
the role would hide the first fact in order to show the second. Nothing relabels
the fallback image as the stored primary, nothing changes the primary
automatically, and no read writes anything.

### G.2 — the picture stays (§8)

`APP12-M01.E1` proved `adminAsset_preview` serves derivative bytes whatever the
Asset's lifecycle state. §8 requires that to stay true, and this correction did
not touch the route.

The tile therefore still requests the photograph for a rejected Asset and states
the problem beside it. An operator curating twenty images finds them by their
picture; replacing it with a glyph would make the grid harder to work in order to
communicate something the line already says in words.

```text
REJECTED     picture requested   +  "Ảnh đã bị từ chối"
INSPECTING   no picture promised +  "Ảnh đang được xử lý"   (no derivative exists yet)
UPLOADED     as INSPECTING
unknown      no picture promised +  "Chưa có ảnh xem trước" (never a promise of an image)
ACCEPTED     picture, no line
absent       picture, no line                                (a staged image — see below)
```

**A staged image is not a fault.** An image the operator has just picked has no
server row yet, so the read has no opinion about it. The picker offers only
deliverable Assets, so "no opinion yet" renders as healthy — the tile downgrades
when the read says something worse, never because it has not been told anything.
Without that rule the twenty-image DRAFT journey would have blanked every
newly-added tile, which is how it was caught.

---

## H. Recovery semantics

Data-driven, with no local flag to go stale:

```text
stored primary ACCEPTED                → no treatment            (probe: all false)
same primary becomes REJECTED
  + fresh Admin read                   → treatment appears       (probe: sectionNotice true)
status restored to ACCEPTED
  + fresh Admin read                   → treatment disappears    (probe: all false)
```

Proved twice over: live in §M, and in
`product-media-degraded.test.tsx` — "recovery to ACCEPTED clears the treatment on
the next read", which unmounts and re-renders rather than mutating in place,
because the requirement is about what the *server* says on the next read and not
about a flag this screen could have cleared itself.

`product_media` is untouched throughout — asserted on the rows, before and after.

---

## I. Figma `944:187` reconciliation

### I.1 — the brief's premise was wrong, and here is why

The frame was **already** drawing circular outline chevrons. Read before anything
was written:

```text
944:191 "Nút / Ảnh trước"   FRAME 52×52  cornerRadius 999  stroke 1px white
                            fill white @ 12%   child TEXT "‹" Inter 18
944:193 "Nút / Ảnh sau"     the same, mirrored, child TEXT "›"
```

`APP12-M01.S1-C1` §T.1 reported these frames as drawing "text buttons". That
report also states, correctly, that it touched no Figma artifact — its own brief
forbade it — so the claim was made from the runtime side without opening the
drawing. `APP12-M01.E1` could not check it either, because the desktop authority
was unreachable. The premise travelled two packages unverified.

**Recorded because the reconciliation would otherwise have been performed against
a description of the frame rather than the frame.**

### I.2 — the divergence that was real

Measured against the delivered runtime
(`_product-detail-lightbox.scss` → `.product-detail__dialog-nav`):

| Property | Frame, before | Runtime | Reconciled to |
|---|---|---|---|
| shape | circle (`cornerRadius 999`) | `border-radius: 50%` | unchanged ✓ |
| stroke weight | 1 px | `1px solid` | unchanged ✓ |
| stroke colour | white, opacity 1.0 | `$scrim-foreground-muted` = white @ 0.8 | **0.8** |
| fill | white @ 0.12 | `background: transparent` | **none** |
| size | 52 × 52 | `$size-touch-target-min` = 44 × 44 | **44 × 44** |
| glyph | `‹` / `›` Inter 18 | inline SVG, `currentColor` | unchanged — a drawing cannot express "inline SVG", and `S1-C1` chose it for font-metric reasons that are a runtime concern |

The fill is the one that mattered beyond pixel-accuracy. The runtime's stylesheet
states the intent explicitly — *"Outline rather than the filled
`$scrim-control-surface` the close button uses … a filled pill there reads as a
second object competing with the image; a ring states 'control' and gets out of
the way"* — and the frame was drawing all three controls filled alike, so it
carried the opposite of the delivered decision.

### I.3 — what was changed, and what was not

```text
mutated   944:191, 944:192, 944:193, 944:194   (the two controls and their glyphs)
```

Centres held exactly, so spacing relative to the artwork is unchanged: each
control's box shrank around the point it already occupied
(`268,400 52×52` → `272,404 44×44`; `1120,400` → `1124,404`), and each glyph was
re-centred inside the smaller box.

**Untouched, as §10 requires:** the image, the layout, the scrim, the counter and
its position semantics, the brand tokens, and the **close** button — which keeps
its fill because the runtime keeps its fill.

Verified by re-rendering the frame, not by trusting the return value:
`evidences/m01-e1-c1/figma-944-187-before.png` and `…-after.png`.

**Node ids did not change.** The registry's pointer is still `944:187` with the
same children, so §13's stale-pointer clause does not apply and no id needed
updating anywhere.

### I.4 — one residual delta, deliberately left

The **close** control (`944:195`) also differs from runtime — the frame draws a
52 px stroked circle, the runtime is a 44 px `$radius-button` filled control with
no border. §10 scopes this reconciliation to the previous/next controls and says
to preserve the close treatment, so it was preserved.

Recorded so it is not mistaken for an oversight:

```text
FU-APP12-M01-E1-C1-01   the lightbox close control's drawn treatment differs
                        from runtime (52px stroked circle vs 44px filled
                        $radius-button). Out of scope for E1-C1 by §10.
```

---

## J. APP2 historical-row supersession

`APP12-M01.E1` found — and this correction re-verified — that the two APP2 rows
were **not** historical: both carried `APPROVED_FOR_IMPLEMENTATION` with an empty
`Supersedes/By`, which is the registry's own marker for a live row. Under the PO's
ruling in §11 they are now retired, and their **drawings were not touched**:

| Registry ID | Node | Status | Supersedes/By |
|---|---|---|---|
| `FIG-S02-PRODUCT-DETAIL-LIGHTBOX-DESKTOP` | `533:3` | `SUPERSEDED` | `→ FIG-APP12-M01-D1-SF-LIGHTBOX` |
| `FIG-S02-PRODUCT-DETAIL-LIGHTBOX-MOBILE` | `533:26` | `SUPERSEDED` | `→ FIG-APP12-M01-D1-SF-LIGHTBOX` |

Written to the convention the three `FIG-STOREFRONT-SHELL-*` rows established:
`SUPERSEDED` in Status, `→ <replacement id>` in Supersedes/By, and a reason in
Approval Evidence. The reason keeps the original approval visible rather than
erasing it —

> Superseded; approved historically under
> `FIG-APPROVAL-APP2-S02-G01-PRODUCT-DETAIL-001`. Product Detail lightbox
> authority moved to the `APP12-M01.D1` package

— because a retired row should still record what once approved it.

No Figma node under `533:*` was read for content, modified, or re-rendered.

---

## K. Registry approval evidence

```text
FIG-APP12-M01-D1-SF-LIGHTBOX  944:187
  Status            APPROVED_FOR_IMPLEMENTATION   (unchanged)
  Approval Evidence FIG-APPROVAL-APP12-M01-S1-C1-PO-001
  Last Verified     2026-09-08
```

One approval id per row is the file's convention — no row in 578 carries two — so
the correction's approval replaces `FIG-APPROVAL-APP12-M01-D1-PO-001` on **this
row only**. The other 26 D1 rows are untouched, and no approval id was invented.

```text
node tools/check-figma-design-index.mjs
→ passed (578 registry IDs, 578 node rows, 26 registry tables;
          canonical files + statuses + deep links + composites verified)
```

### K.1 — a defect this correction found in its own work

The first registry edit was written against the wrong column indices. Splitting a
row on `|` yields a leading empty field, so `Approval Evidence` is index 15 and
`Last Verified` is 16 — not 16 and 17. The first attempt therefore:

```text
put the supersession note into  Last Verified
pushed the date out of the row entirely
dropped the row's closing pipe  (17 fields where every other row has 18)
```

**`check-figma-design-index.mjs` passed on that.** `git diff --check` is what
caught it, by reporting trailing whitespace. The edit was reverted, redone with
the indices read off a live row rather than assumed, and every touched row is now
asserted to have exactly 18 fields with the four cells in their right columns.

```text
FU-APP12-M01-E1-C1-02   check-figma-design-index.mjs does not validate row
                        column counts or cell↔column alignment, so a row whose
                        cells shift by one passes the gate. Registry tooling.
```

---

## L. Figma / runtime evidence pair (§13)

```text
evidences/m01-e1-c1/figma-944-187-after.png       Figma 944:187, after reconciliation
evidences/m01-e1-c1/runtime-lightbox-chevrons.png the delivered lightbox at 1440
evidences/m01-e1-c1/figma-944-187-before.png      what the frame drew beforehand
```

Both sides now show circular outline previous/next chevrons with a transparent
fill. The runtime side is additionally measured rather than photographed, in the
live suite (§M, `§17` journey):

```text
                   Ảnh trước      Ảnh sau
box                44 × 44        44 × 44     (square; = $size-touch-target-min)
border-radius      50%            50%
border-width       ≥ 1px          ≥ 1px
background at rest transparent    transparent
icon               inline <svg>, aria-hidden="true"
visible text       none           none
accessible name    "Ảnh trước"    "Ảnh sau"
```

```text
current canonical node id   944:187   (unchanged by the reconciliation)
registry pointer            944:187   (no stale pointer)
```

---

## M. Focused live degraded-primary journey

Run on the E1 disposable world, unchanged. The journey that failed E1 is the same
journey — no assertion was deleted, skipped or softened; two were **added** (§O).

```text
[m01e1] §13 healthy signals  {"tileStateCaption":false,"sectionNotice":false,
                              "tileDataAttribute":false,"imageFailed":false}
[m01e1] §13 degraded signals {"tileStateCaption":false,"sectionNotice":true,
                              "tileDataAttribute":false,"imageFailed":false}
```

The probe is calibrated against a healthy Product first, so the result is a
*change* rather than something the screen always shows.

| §16 requirement | Result |
|---|---|
| healthy Product → no degraded signal | ✓ all four probes false |
| stored primary REJECTED + fresh read → truthful signal | ✓ `sectionNotice` true |
| stored primary badge still identifies the stored primary | ✓ both signals present on tile 1 |
| public surfaces continue using the B1 effective fallback | ✓ §12 journey, same run |
| `product_media` unchanged by Admin/public reads | ✓ rows compared before/after |
| restore to ACCEPTED + fresh read → signal disappears | ✓ second §13 journey |
| public surfaces return to the stored primary | ✓ §12 journey |

**One stale-build trap, recorded.** The first run after the code change still
reported all-false, because the E2E harness starts the Admin with `next start`
against a prebuilt `.next` and never builds it. The correction is invisible until
`pnpm --filter @embroidery/admin build` runs. The same trap is recorded in
`APP12-A02-C1`; it cost one run here.

---

## N. Focused Admin regression (§17)

```text
pnpm --filter @embroidery/admin test -- "product-media|product-edit|asset"
→ 13 suites, 189 tests, all pass
```

Covering exactly the behaviour §17 lists — DRAFT grid/order/save, PUBLISHED
grid/save, set-primary, the 20-image cap, the degraded signal, and the invalid
Asset/refusal UI — plus the asset library, which shares `AssetThumbnail` and
therefore shares the mapping that moved.

The full E1 mode was run as well, because the harness runs modes rather than
single tests:

```text
pnpm --filter @embroidery/e2e-testing e2e:app12:m01e1:headed
→ 33 passed, 0 failed        (E1 result was 31 passed, 1 failed, 1 skipped)
```

No focused regression failed, so no broader run was performed.

New focused tests added by this correction:

```text
test/components/product-media-degraded.test.tsx    7 tests
test/model/product-media-model.test.ts            +5 tests (21 total)
```

They pin every clause of §15: the status survives the read→view-model boundary;
a REJECTED primary stays primary, renders the state, uses the approved Vietnamese
and keeps its picture; an ACCEPTED primary carries nothing; recovery clears it;
and the write body is still an ordered `mediaAssetIds[]` with no status in it —
asserted by serialising the body and searching it for `REJECTED`.

---

## O. Accessibility

```text
axe serious/critical = 0 on the degraded Admin media surface
```

Scanned inside the §13 journey rather than in the accessibility file next door,
because the surface exists only while an Asset is rejected and that state is this
journey's to create and to undo. Two assertions were added alongside it:

```text
.product-media-tile__state      has text "Ảnh đã bị từ chối"     (a word, not a colour)
tile 1 "Ảnh đại diện"           appears twice                     (badge + label)
tile 1 .product-media-tile__state has the rejected caption        (both, coexisting)
```

| §18 requirement | How it holds |
|---|---|
| not colour-only | the state is a **word**; the danger colour only emphasises it |
| visible/textual state available | a visible `<p>`, plus `AssetThumbnail`'s accessible name |
| thumbnail remains understandable | the photograph is still there (§G.2) |
| primary + rejected coexist | badge, role label and state line all render |
| axe serious/critical = 0 | ✓ |

No new axe exclusion was added. The only exception in use is the standing
`color-contrast` one, on the authority `APP12-H08` recorded and `PO-APP12-004`
ruled.

---

## P. Contract and baseline

Measured from the artifacts and a live database:

```text
                      measured   expected
OpenAPI paths            127       127     ✓
OpenAPI operations       140       140     ✓
OpenAPI schemas          279       279     ✓
public operations         49        49     ✓
migrations                39        39     ✓   (last = 0039; no 0040)
DB tables                 79        79     ✓
Admin routes              26        26     ✓
Storefront routes         20        20     ✓
```

```text
pnpm --filter @embroidery/api openapi:check           up to date — no regeneration
pnpm --filter @embroidery/api-client check:generated  up to date — no regeneration
```

No backend file, no database file, no contract file and no Storefront file was
changed — so every count above is unchanged by construction as well as by
measurement.

---

## Q. Files changed

```text
Admin runtime (Blocker 1)
A  apps/admin/src/shared/media/asset-thumbnail-state.ts          the shared mapping
M  apps/admin/src/shared/media/asset-thumbnail.tsx               caption delegates to it
M  apps/admin/src/features/products/components/product-media-tile.tsx
                                                                 local copy removed
M  apps/admin/src/features/products/model/product-media-selection.ts
                                                                 + mediaStatusByAssetId
M  apps/admin/src/features/products/components/product-media-grid-tile.tsx
                                                                 renders the state
M  apps/admin/src/features/products/components/product-media-grid.tsx     passes it
M  apps/admin/src/features/products/components/product-media-editor.tsx   passes it
M  apps/admin/src/features/products/components/product-edit-form.tsx      derives it
M  apps/admin/src/features/products/components/product-published-media-form.tsx
                                                                          derives it
M  apps/admin/src/features/products/styles/_product-form-media.scss       the state line

Admin tests
A  apps/admin/test/components/product-media-degraded.test.tsx     7 tests
M  apps/admin/test/model/product-media-model.test.ts             +5 tests

Design authority (Blocker 2)
M  docs/design/FIGMA_DESIGN_INDEX.md                              3 rows
   Figma 944:191/192/193/194                                      reconciled in place

Acceptance evidence
M  packages/e2e-testing/specs/app12/m01e1-admin-signal.acceptance.spec.ts
                                                                  + axe + 3 assertions
A  evidences/m01-e1-c1/**                                         4 images
A  docs/implementation/reports/APP12-M01-E1-C1-COMPLETION-REPORT.md
```

Untouched, as §14 requires: API, database, OpenAPI, generated client, Storefront,
payment, orders, inventory, Gallery domain.

---

## R. File-size

```text
node tools/check-file-size.mjs --paths <every changed .ts/.tsx/.scss/.md>
```

Every file this correction created or modified is inside the limits. One
pre-existing failure is reported and **not** fixed here:

```text
FAIL   packages/e2e-testing/playwright.config.ts   542 lines > 400
```

It was already 474 lines at the entry HEAD — over the limit before this
correction and before `E1` — and splitting the shared E2E orchestrator inside an
acceptance correction is exactly the unrelated refactoring the brief excludes.
Recorded in the `E1` report §W and unchanged here.

```text
REVIEW apps/admin/src/features/products/styles/_product-form-media.scss  307 > 300
```

Above the *review* threshold, under the hard limit; the state line added 20 lines
to it.

```text
node tools/check-app-scss.mjs admin   compile PASS (229 246 bytes CSS, 0 deprecations)
node tools/check-scss-file-size.mjs apps/admin/src/features/products/styles
                                      passed (16 stylesheets, 2 above review threshold)
```

---

## S. Validation

```text
git diff --check                                           clean

pnpm --filter @embroidery/admin typecheck                  pass
pnpm --filter @embroidery/admin lint                       pass
pnpm --filter @embroidery/admin test -- "product-media|product-edit|asset"
                                                           13 suites, 189 tests, pass
pnpm --filter @embroidery/e2e-testing typecheck            pass
pnpm --filter @embroidery/e2e-testing lint                 pass

node tools/check-i18n-static-text.mjs                      OK, 0 exemptions
node tools/check-i18n-message-keys.mjs                     OK
node tools/check-figma-design-index.mjs                    passed (578 / 578 / 26)
Figma live re-open of 944:187                              verified visually (§I.3)

pnpm --filter @embroidery/api openapi:check                up to date
pnpm --filter @embroidery/api-client check:generated       up to date

node tools/check-app-scss.mjs admin                        compile PASS
node tools/check-scss-file-size.mjs …/products/styles      passed
node tools/check-file-size.mjs --paths <changed>           1 pre-existing over-limit (§R)
node tools/check-report-secrets.mjs                        passed (686 docs, 5408 files)
pnpm format:check                                          baseline-equal (§T)

pnpm --filter @embroidery/admin build                      required — see §M
pnpm --filter @embroidery/e2e-testing e2e:app12:m01e1:headed
                                                           33 passed, 0 failed
```

**Every Playwright run was headed and visible.** No broad repository regression
was run.

---

## T. Hygiene

```text
shared_dev_mutations       0      (every fixture and mutation helper refuses any
                                   database not named embroidery_db7_*)
G03_data_created           false
production_deployed        false
pushed                     false
migrations_added           0
backend_files_changed      0
storefront_files_changed   0
contract_files_changed     0
http_operations_added      0
routes_added               0
message_keys_added         0
dependencies_added         0
axe_exclusions_added       0
secrets_written            0
.env_mutations             0
figma_nodes_modified       4      (944:191, 944:192, 944:193, 944:194 — all within
                                   the frame the brief names)
figma_historical_drawings_modified  0
registry_rows_changed      3      (944:187 approval; 533:3 and 533:26 superseded)
disposable_world_teardown  PASS — "cleanup verified: all E2E ports closed,
                                  disposable database dropped"
temporary_processes        0
temporary_ports            closed
```

Pre-existing debt encountered and left alone, per §20:

```text
FU-APP12-M01-E1-02   check:e2e JSON import attribute        owner V02-C2  unchanged
FU-APP12-M01-E1-03   format:check v02-c1-login-reflow.mjs   owner V02-C1  unchanged
```

`pnpm format:check` fails on exactly that one pre-existing file and nothing else —
identical to the HEAD baseline.

---

## U. E1 closure matrix delta

The three criteria `E1` failed:

| # | §25 criterion | E1 | E1-C1 |
|---|---|---|---|
| 2 | current M01 lightbox Figma matches chevron runtime | ✗ | **✓** §I |
| 3 | approval id recorded correctly | ✗ | **✓** §K |
| 20 | Admin exposes a truthful degraded-primary signal | ✗ | **✓** §G, §M |

The other 52 are unchanged and were re-proved in the same run (§D, §M).

`E1-C1`'s own §22 criteria:

```text
 1 Figma preflight green before correction work      deviation — §C (PO-authorised)
 2 944:187 reconciled to circular outline chevrons                              ✓
 3 current M01 lightbox authority APPROVED_FOR_IMPLEMENTATION                   ✓
 4 approval evidence exactly FIG-APPROVAL-APP12-M01-S1-C1-PO-001                ✓
 5 APP2 rows superseded by the M01 authority                                    ✓
 6 historical APP2 drawings not redrawn                                         ✓
 7 Figma/runtime evidence pair proves the controls match                        ✓
 8 media status survives to the media tile                                      ✓
 9 REJECTED stored primary renders a truthful state                             ✓
10 stored primary identity remains truthful while degraded                      ✓
11 public effective-primary fallback unchanged                                  ✓
12 no read mutates product_media                                                ✓
13 real preview may continue rendering for a rejected Asset                     ✓
14 recovery to ACCEPTED removes the treatment                                   ✓
15 write body remains ordered mediaAssetIds[]                                   ✓
16 no backend contract change                                                   ✓
17-25 no new operation/route/migration; 39 migrations; 79 tables;
      127/140/279; 49 public; 26 Admin; 20 Storefront routes                    ✓
26 degraded-primary E1 journey passes without weakening                         ✓
27 focused Admin regressions pass                                               ✓
28 axe serious/critical = 0 on the changed Admin surface                        ✓
29 no raw status enum shown to the operator                                     ✓
30-34 shared-dev 0; G03 false; teardown PASS; not deployed; not pushed          ✓
35 correction report exists                                                     ✓
36-39 E1 state, M01 state, one NEXT, G03 not executed                           ✓
```

Criterion 1 is the one deviation, and it is the environment rather than the work:
the named desktop authority never became reachable, and the Product Owner
directed the correction through the hosted Figma MCP instead. §C states it in
full so the PO can accept or reject that substitution knowingly.

---

## V. M01 roadmap

```text
APP12-M01.A      COMPLETE — PO PASS
APP12-M01.B1     COMPLETE — PO PASS
APP12-M01.DB1    COMPLETE — PO PASS
APP12-M01.B2     COMPLETE — PO PASS
APP12-M01.D1     COMPLETE_AFTER_C1 — PO APPROVED
APP12-M01.D1-C1  COMPLETE — PO PASS
APP12-M01.A1     COMPLETE — PO PASS
APP12-M01.S1     COMPLETE_AFTER_C1 — PO PASS
APP12-M01.S1-C1  COMPLETE — PO PASS
APP12-M01.E1-C1  COMPLETE                      ← this package

APP12-M01.E1 = COMPLETE_AFTER_C1 — AWAITING_PO_REVIEW

CORRECTION_USED = 1 / 1

APP12-M01 =
  IMPLEMENTATION_COMPLETE
  NOT_YET_CLOSED_UNTIL_PO_REVIEW

APP12-G03 = NOT_AUTHORIZED
ROADMAP_CHECKPOINTS = 39

NEXT = PO_REVIEW_REQUIRED
```

Open items carried forward:

```text
FU-APP12-M01-S1-C1-01   the lightbox chevron / Figma gap            CLOSED (§I, §K)
FU-APP12-M01-E1-01      the Admin degraded-primary signal           CLOSED (§F, §M)
FU-APP12-M01-E1-C1-01   the lightbox close control's drawn
                        treatment differs from runtime              NEW (§I.4)
FU-APP12-M01-E1-C1-02   the Figma index gate does not validate
                        row column alignment                        NEW (§K.1)
FU-APP12-M01-E1-02      check:e2e JSON import attribute             routed to V02-C2
FU-APP12-M01-E1-03      format:check v02-c1-login-reflow.mjs        routed to V02-C1
```

STOP.

Do not start G03.
Do not close M01.
Do not deploy production.
Do not push.
