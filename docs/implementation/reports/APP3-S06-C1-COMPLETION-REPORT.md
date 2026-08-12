# APP3-S06-C1 — Completion report

**Checkpoint:** `APP3-S06-C1` — physical-max-aware initial image placement
**Class:** ordinary correction (first and only) to `APP3-S06`
**Commit A:** `4766447` `fix(storefront): respect physical limits in image placement`
**Branch:** `production` · nothing pushed

---

## A. The human-review finding

`APP3-S06` shipped an initial placement that fitted the Embroidery Area
**rectangle** and nothing else, and left `APP3-P02` to rule on the result. The
completion report described the consequence honestly and did not notice that the
consequence was impossible:

> if P02 physical maximum is smaller than the Area rectangle: P02 rejects,
> nothing is inserted, the customer is told to size down using S03

An Embroidery Area is two independent things — a rectangle on the canvas and a
pair of millimetre maxima. `embroidery_areas` carries `bound_width_px` and
`max_width_mm` as separate columns precisely because they can disagree, and a
Side may offer a generous safe rectangle while the Area on it permits a 60 mm
logo. Every fixture the checkpoint shipped with had `max_*_mm` null, which the
manifest defines as "the Side is the only limit" — so in every test the rectangle
was the tighter bound and the missing authority never decided anything.

## B. Why "nothing inserted, use S03 to resize" is impossible

```
P02 refuses the candidate
→ no ImageElement is committed
→ the document is unchanged
→ S03 has no element to select, move or resize
```

The advice named an element that does not exist. The customer's upload succeeded,
their photograph was inspected, normalized and stored, and the Studio showed them
a refusal and a suggestion they could not act on. There is no sequence of
actions available in the delivered UI that recovers from it, because the only
control that could make the image smaller operates on a placed element.

It also contradicted `APP3-S06` §15, which requires that an initial placement
"never create a box larger than current physical/geometry authority permits".

## C. P02 public physical-authority audit

Audited before changing anything, and no new seam was needed —
`docs/implementation/VALIDATION_GOVERNANCE.md` hard-stop condition A does not
apply.

| Need | Public P02 export | File |
| --- | --- | --- |
| mm → canvas px | `mmToPx(mm, pxPerMm)` — quantized, throws `UnitConversionError` on an unusable scale | `packages/design-engine/src/placement/units.ts` |
| the Area's maxima | `EmbroideryAreaAuthority.maxWidthMm` / `.maxHeightMm` | `packages/design-engine/src/placement/authority.ts` |
| the Area rectangle | `EmbroideryAreaAuthority.bound*Px`, `areaBounds` | `.../placement/authority.ts`, `.../containment/area.ts` |
| the scale | `PlacementAuthority.pxPerMm` — `product_sides.px_per_mm`, the sole authority under `IMP-D045` PO-10 | `.../placement/authority.ts` |
| final ruling | `validateElementWithinEmbroideryArea`, `validateElementPhysicalSize` | `.../containment/area.ts` |

The maxima are resolved by the Studio's existing `areaAuthorityOf`, which already
implements the "a null maximum means the Side's own dimension is the maximum"
rule. Reusing it means the construction and the final validation read **the same
numbers by definition** rather than by agreement — there is no second place for
that rule to drift.

No P02 file was modified. No px↔mm arithmetic was written outside P02.

## D. The construction rule

`initialImageTransform(media, scope, limits)` in
`apps/storefront/src/features/design-studio/model/studio-image-placement.ts`:

```
area            = areaAuthorityOf(scope, limits)
physicalWidthPx = mmToPx(area.maxWidthMm,  scope.pxPerMm)
physicalHeightPx= mmToPx(area.maxHeightMm, scope.pxPerMm)

maxWidthPx  = min(scope.boundWidthPx,  physicalWidthPx)
maxHeightPx = min(scope.boundHeightPx, physicalHeightPx)

scale  = min(1, maxWidthPx / intrinsicWidthPx, maxHeightPx / intrinsicHeightPx)
width  = ⌊intrinsicWidthPx  × scale⌋   on the P01 grid
height = ⌊intrinsicHeightPx × scale⌋   on the P01 grid
x      = boundXPx + ⌊(boundWidthPx  − width)  / 2⌋
y      = boundYPx + ⌊(boundHeightPx − height) / 2⌋
rotationDeg = 0 · scaleX = scaleY = 1
```

Order: **derive → construct → validate**. Never construct → detect → shrink.

## E. Precedence

Per axis, the tighter of the rectangle and the physical maximum; then the tighter
of the two axes' scales; then capped at 1. No axis is decided by one authority
alone, and the two are not ranked — whichever is smaller wins, which is the only
answer that satisfies both.

| Case | Result | Test |
| --- | --- | --- |
| Area tighter than the maxima | rectangle decides (300 px) | `lets the area rectangle decide…` |
| physical width tighter | 50 mm → 200 px decides; placed 200×120 | `…physical width maximum is tighter` |
| physical height tighter | 25 mm → 100 px decides; placed 166.66×100 | `…physical height maximum is tighter` |
| both tighter | the tighter ratio (height) decides | `takes the tighter of two physical maxima` |
| boundary equality | 200 px = exactly 50 mm, accepted unshrunk | `accepts a size that lands exactly on the physical maximum` |
| one unit outside | never produced | `never produces a box one quantized unit outside a maximum` |
| no positive box | `null`, nothing inserted | `refuses when … leaves no positive box` |

## F. Intrinsic no-upscale

`scale` is still capped at 1, so an image already smaller than every bound is
placed at its own size. Proved both with the original limits and with maxima
tighter than the rectangle: a 40×24 derivative places at 40×24 under a 50 mm/25 mm
Area. Upscaling invents detail that will be stitched, and no bound existing is
not a reason to invent it.

## G. Quantization

`DESIGN_DOCUMENT_QUANTIZATION_SCALE` — P01's own constant, imported, not restated.
Lengths are snapped **down** onto the grid rather than to nearest, and the
direction is the point: `quantizeNumber` rounds, so a width derived exactly at a
maximum can round *up* off it and land one quantized unit outside the limit it was
built to respect — after which the final check refuses a box the construction had
just proved valid. Rounding down cannot manufacture a value outside authority. It
costs at most 1/10 000 px per axis, which is also the only precision the document
has, so the aspect ratio is preserved to that same precision (asserted at four
decimal places across all four bound combinations).

No epsilon, no `toFixed`, no `Math.round(x * 100)`. The result is a fixed point of
the quantization `ruleOnCandidate` applies on the way in, so nothing shifts
underneath the value that was proved legal.

## H. Final P01/P02 validation

Unchanged and still mandatory. The constructed candidate goes through
`ruleOnImageCandidate` → structure → complexity → context (`APP3-P01-C1`) →
`ruleOnCandidate` → quantize → containment → physical size. The construction is
not trusted: it is a proof obligation the final validation discharges, and the
gate refuses a hook that returns `{ ok: true }` on its own.

The only new refusal path is `withNewImage` returning `null` — no positive box
exists at all (degenerate rectangle, non-positive maximum, unusable `px_per_mm`).
It maps to the existing `too-large-for-area` refusal and adds no user-facing copy.

## I. No-clamp regression

`IMP-D045` PO-09 is untouched. A transform the customer performs that exceeds the
maximum is still refused outright — not shrunk, not snapped, not re-centred:

> `still refuses a user-sized transform above the maximum instead of shrinking it`
> — 250×150 px (62.5×37.5 mm) inside a 300×200 px rectangle under a 50 mm/25 mm
> Area returns `{ ok: false, refusal: 'too-large-for-area' }`.

The distinction is stated in the source: an initial placement has no customer
decision in it yet, so the system may choose the largest valid box; a transform
the customer performed is a decision, and adjusting it silently discards it.

## J. The browser fixture

The development database had no Area whose maximum is tighter than its rectangle
— which is why the defect survived S06's browser proof. The DB refuses to change
`max_*_mm` on a referenced placement row (`fn_app3_reject_protected_placement_change`,
correctly), so a **new** Area was inserted on the existing fixture Side:

```sql
insert into embroidery_areas (id, product_side_id, name, code, bound_x_px, bound_y_px,
  bound_width_px, bound_height_px, max_width_mm, max_height_mm, display_order)
values ('019fe7c1-0000-7000-8000-000000000001', '019fe700-0000-7000-8000-000000000001',
  'Lưng giới hạn', 'lung-gioi-han', 100, 100, 200, 200, 60, 60, 2);
```

Side `mat-sau` is 1 px/mm, so the rectangle allows 200 mm and the maximum allows
60 mm. The manifest served both fields to the browser (`maxWidthMm: 60`).

Reverted afterwards by retirement, not deletion — a Session references it and the
database protects that row, which is the same rule the fixture had to respect
going in.

## K. Real upload → READY → automatic placement

At 1440×900 on `http://localhost` (the accepted `APP3-S01` trustworthy-origin
helper, applied and restored). A real 400×240 PNG, 115 407 bytes.

```
POST /api/public/design-sessions                                → 201
POST /api/public/design-sessions/019ff59c…/assets               → 202 Accepted
GET  …/assets/019ff59d…/status  ×3 (2 s apart)                  → 200
GET  …/assets/019ff59d…/editor-preview                          → 200
```

Nothing seeded — the database after the run:

| Row | Value |
| --- | --- |
| `assets` | `CUSTOMER_UPLOAD` · `CUSTOMER_PRIVATE` · `ACCEPTED` · `image/png` · 115 407 B |
| `asset_inspections` | one `ACCEPTED` |
| `asset_derivatives` | one `NORMALIZED` · `READY` · 400×240 · not watermarked |

The element was inserted automatically and rendered as a real `<image>` with a
Blob source inside the one native SVG scene.

## L. Aspect ratio and physical read-out

| Fact | Value |
| --- | --- |
| Area-fit box (what S06 produced) | **200 × 120 px** |
| Constructed box (S06-C1) | **60 × 36 px** — smaller, as required |
| Ratio | 60/36 = 1.6667 = 400/240 exactly |
| Position | `matrix(1 0 0 1 170 182)` = 100 + (200−60)/2, 100 + (200−36)/2 — centred on both axes |
| Physical read-out in the UI | **"Rộng 60 mm · Cao 36 mm"** — exactly at the 60 mm maximum, inside it on both axes |
| Selection | auto-selected: `"Đang chọn: Hình ảnh"`, all 8 resize handles + rotate present |
| Refusal shown | none |
| Autosave | none — no autosave request appears anywhere in the network log |

## M. S03 move / resize / rotate regression

All three performed on the automatically placed element, with no manual resize
first:

| Gesture | Before | After |
| --- | --- | --- |
| move | `translate(170, 182)` | `translate(170, 143.9937)` |
| resize | `scaleY 1` | `scaleY 1.6173` → read-out "Rộng 60 mm · Cao 58,2 mm", inside the 60 mm maxima |
| rotate | no off-diagonal terms | `matrix(0.5560 −0.3265 −0.1634 −0.2783 …)` — a real rotation |

Two intermediate gestures were refused rather than clamped (a rotation whose
rotated AABB would have exceeded 60 mm, and a resize inverted past the top edge
returned no commit). That is PO-09 behaving exactly as it should and is why the
successful three were performed at sizes that fit.

## N. Checker and mutation evidence

`node tools/check-app3-s06.mjs` → PASS.
`node --test tools/check-app3-s06.test.mjs` → **72 tests, 72 pass, 0 fail** (64 → 72).

New mechanical rules, on the `initialImageTransform` body rather than the file, so
`withReplacedImage` — which deliberately does none of this — cannot satisfy them:

- a physical maximum is converted through `mmToPx`;
- both `maxWidthMm` and `maxHeightMm` bound the box;
- both `boundWidthPx` and `boundHeightPx` bound the box;
- at least three `Math.min` — one per axis bound plus the intrinsic cap;
- centred on `boundXPx` and `boundYPx`;
- no second px↔mm scale anywhere in the file (`const …pxPerMm =`, `25.4`, `96`, `devicePixelRatio`);
- an impossible placement is refused, and the hook never returns `{ ok: true }` on its own.

Eight new mutations, each of which leaves a **working** capability behind on every
fixture where the rectangle happens to be tighter:

| Mutation | Refused for |
| --- | --- |
| physical width bound removed | `not bounded by maxWidthMm` |
| physical height bound removed | `not bounded by maxHeightMm` |
| `mmToPx` replaced by `Infinity` (the pre-C1 shape) | `does not convert` |
| an axis bounded by the rectangle alone | `tighter of the rectangle` |
| centre calculation removed | `not centred on boundXPx` |
| a local `PX_PER_MM` constant added | `second px↔mm scale` |
| the construction trusted instead of validated | `without APP3-P02` |
| the null derivation not refused | `is not refused` |

The last rule is deliberately the **absence of a fabricated success** rather than
the presence of a call: a `ruleOnImageCandidate(` call survives when only one of
the two paths is validated, which is precisely what "the helper believes it is
valid, so skip the final check" looks like in a diff.

Two stale sentences in the S06 gate's own prose were corrected while here: it
described the 60/minute read limit as "the APP3-S06 ruling it is rather than a
PO-07 value", which the delivered rules already contradict — they require the
`IMP-D043` PO-07 attribution and a mutation proves it.

## O. Contract immutability

| Artifact | Value | Status |
| --- | --- | --- |
| OpenAPI | 37 paths / 42 operations / 84 schemas | unchanged |
| OpenAPI SHA-256 | `f39e9e8fca1de08417359aeb299b874c346e21902b21375c9159124ed63d3817` | identical |
| Generated client tree | `c2fb229f69f4d0033b081e7f2aca7328653c5eeb6bebfb5658feb6fe8ba4a2d6` | identical |
| Migrations | 34 | unchanged |
| Root scripts | 30 | unchanged |

`pnpm --filter api openapi:check` → up to date.
`pnpm --filter @embroidery/api-client check:generated` → up to date.
No generation was run. No API, worker, database, dependency, lockfile or Figma
change.

## P. Changed files

| File | Lines | Change |
| --- | --- | --- |
| `apps/storefront/src/features/design-studio/model/studio-image-placement.ts` | 232 | the construction |
| `apps/storefront/src/features/design-studio/hooks/use-studio-image.ts` | 356 | refuses a null derivation |
| `apps/storefront/test/unit/studio-image-model.test.ts` | 482 | +16 tests |
| `tools/check-app3-s06-frontend.mjs` | 402 | the new rules |
| `tools/check-app3-s06.test.mjs` | 722 | +8 mutations |
| `tools/check-app3-s06.mjs` | 416 | headline prose |
| `tools/app3-accepted-paths.mjs` | — | one accepted S06 status line |
| `docs/implementation/phases/APP3-DESIGN-TEMPLATES-AND-STUDIO.md` | — | status |

Eight files. All source files are inside CLAUDE.md §6's 400-line limit and the
test file inside 600. `tools/check-app3-s06.test.mjs` is 722 lines against
`APP3-S06` §29's **soft** cap of 700 — disclosed rather than met, because the 22
lines are the eight new mutations and the header sentence that says what they
catch, and deleting the explanation to satisfy a review threshold makes the
artifact worse.

### Validations run

| Command | Result |
| --- | --- |
| `node tools/check-app3-s06.mjs` | PASS |
| `node --test tools/check-app3-s06.test.mjs` | 72/72 |
| `pnpm --filter storefront test` | 44 suites / 668 tests |
| `pnpm --filter storefront lint` / `typecheck` / `build` | clean |
| `pnpm --filter @embroidery/design-document test` | 10 suites / 177 tests |
| `pnpm --filter @embroidery/design-engine test` | 6 suites / 137 tests |
| every `tools/check-app3-*.mjs` gate | PASS |
| `prettier --check` on changed files, `git diff --check` | clean |

No worker or API live matrix was rerun: no worker or API source changed, so the
S06 evidence for inspection, normalization, status, read-rate, B06C streaming and
clone-media stands unamended. No transform benchmark was rerun: no frame-render
code changed — the correction is entirely in placement construction.

## Q. Commit A

`4766447` `fix(storefront): respect physical limits in image placement` — 8 files.
No completion report, no API, no worker, no database, no regeneration, no Figma,
no later Studio checkpoint, no dependency.

## R. Tree

Branch `production`, working tree clean, Commit A immediately precedes Commit B,
nothing pushed. The development environment was restored: the trustworthy-origin
helper reverted to tracked configuration, the fixture Area retired, browser
artifacts deleted. No `.env` was written and no credential was read, logged or
rotated.

## S. Roadmap

```text
APP3-S06-C1 = COMPLETE — REVIEW_DELIVERED
APP3-S06    = COMPLETE — CORRECTION_DELIVERED_FOR_REVIEW
APP3-S04    = BLOCKED_BY_APP3-S06_CORRECTION_REVIEW
```

After human acceptance, `APP3-S06-C1` and `APP3-S06` become
`COMPLETE — REVIEW_ACCEPTED`, `APP3-S04` becomes `READY — NOT STARTED` and the
frontend order continues `S04 → S09 → S08 → S10 → S11`.
`FU-APP3-TEMPLATE-SOURCE-ASSET-INTAKE-01` remains open and unowned.

**Not self-accepted.**
