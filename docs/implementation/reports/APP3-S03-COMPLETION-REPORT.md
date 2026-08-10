# APP3-S03 — Studio transforms, DOM handles and the live physical read-out

`COMPLETE — REVIEW_DELIVERED`, with **one disclosed budget breach** (§X).
Commit A `a7459c1` `feat(storefront): add Studio transform controls`.

Frontend only. OpenAPI 35 paths / 40 operations / 83 schemas, generated-client
tree `d9aac2b3…`, curated HTTP operation set, 34 migrations and 30 root scripts
unchanged; this checkpoint consumes no operation at all.

---

## A. Entry state

The operator accepted `APP3-S07`. Recorded before any source edit:

```text
APP3-S01-C1 = COMPLETE — REVIEW_ACCEPTED     APP3-P01    = COMPLETE — REVIEW_ACCEPTED
APP3-S01    = COMPLETE — REVIEW_ACCEPTED     APP3-P02    = COMPLETE — REVIEW_ACCEPTED
APP3-S02    = COMPLETE — REVIEW_ACCEPTED     APP3-D01    = COMPLETE — REVIEW_ACCEPTED
APP3-S07    = COMPLETE — REVIEW_ACCEPTED     APP3-D01-C1 = COMPLETE — REVIEW_ACCEPTED
```

Anchors: S02 `3080073`, S07 `5ab774f`.

## B. The three S03 Figma rows

| Registry ID | Node | State |
|---|---|---|
| `FIG-STUDIO-TRANSFORM-DESKTOP-MOVE` | `606:186` | Move |
| `FIG-STUDIO-TRANSFORM-DESKTOP-RESIZE` | `606:256` | Resize |
| `FIG-STUDIO-TRANSFORM-DESKTOP-ROTATE` | `606:326` | Rotate |

File `BQwqV8GdfUIELvsQDB1UQE`, page `APP_03`, section **07 — Studio Transform
Controls** (`596:13`). All three were `REVIEW_REQUIRED` on entry and were
promoted with evidence `APP3-S03 §2 operator review`; the registry gate
re-verified integrity afterwards (165 IDs, 165 node rows, 15 tables). Every
`S04`, `S05`, `S06`, `S08`, `S09`, `S10` and `S11` capability row remains
`REVIEW_REQUIRED`, and all four Studio gates assert it in both directions.

**Live Figma read: not performed, and not a blocker.** The connector in this
session offers only an interactive OAuth round-trip the operator must complete;
`APP3-S02` and `APP3-S07` recorded the same. §2 permits it — the registry plus
`APP3-D01`/`D01-C1` resolve the three entries, their node ids and the capability
(`move`, `resize`, `rotate`, eight handles, live mm read-out). No Figma artifact
was modified.

## C. 1440 and 1024 authority

Desktop authority is section 07 at **1440**. `FIG-STUDIO-EDITING-TABLET-1024`
(`618:140`) remains owned by `APP3-D01-C1`; the gate asserts that ownership.

Its reconciliation is the one §3 asks for and it is a real distinction:
**16 px visible knob ≠ 16 px hit target**. The knob follows the reference at
16 px and the `<button>` around it is `$size-touch-target-min` — measured in a
real browser at 1024 as **hit target 44 × 44, knob 16 × 16** (§T).

## D. The resize-persistence audit — resolved mechanically

`APP3-S03 RESIZE_PERSISTENCE = SCALE_ABOUT_THE_LOCAL_BOX_CENTRE`.

Read: `IMP-D045` (all twelve rulings), the P01 v1 element schema and its
transform validation, the P02 envelope, bounds and containment implementation,
`05-DESIGN-STUDIO-SPEC.md` §4, the `APP0-R01` handoff, and the current S02/S07
source.

`IMP-D045` PO-04 states in as many words that `scaleX`/`scaleY` apply around the
local-box centre and that **scale never alters persisted `x`, `y`, `width`,
`height`**; PO-02 makes `width`/`height` the *unscaled* dimensions with local
drawable coordinates running `(0,0)` to `(width,height)`.

That still leaves option B — write `width`/`height`, normalize scale — formally
expressible. It is refused by the engine's own code, not by preference:

- **`freehand`** takes its envelope from its stored `points`
  (`bounds/envelope.ts`), which a `width` change does not touch. A width-based
  resize would leave the polyline exactly where it was.
- **`text`** is sized by `fontSizePx`, not by the box, so the same applies.

So scale is not the nicer option; it is the only representation that resizes
every v1 kind. **Consequence, disclosed:** a handle anchors the **centre**, not
the opposite corner. Anchoring the corner would require writing `x`/`y`
alongside the scale, and no accepted rule authorises that pairing.

## E. Flip ownership

`APP3-S03 FLIP = NOT_AUTHORIZED_BY_CURRENT_S03_DESIGN`. `APP3-D01` records
exactly three S03 frames — move, resize, rotate — and no flip frame. Flip is not
implemented here and is not reassigned elsewhere. P01 accepts negative scale, so
v1 *can* express reflection; nothing in the approved design asks for it yet.

## F. The working-document architecture

```text
Session snapshot (immutable baseline, APP3-S10's)
  └─ initialize once per sessionId:revision
      └─ working document  ── renderer consumes this
          └─ committed candidate replaces it, immutably
```

One store, `store/studio-document.store.ts`, holding a `DesignDocument` and an
opaque key. `initialize` on the same key is a **no-op**, so a re-render, a
re-fetch or a resume returning the same revision cannot silently discard a local
edit — the narrowest deterministic rule §10 asks for, with no S10 conflict UX
invented.

The key is composed in `model/studio-session-key.ts` rather than in the store,
so no Session identity comes to rest in a Zustand store and `APP3-S01`'s rule
needed **no exception**. Runtime only: no autosave, timer, `localStorage`,
`sessionStorage`, `IndexedDB`, URL or cookie.

## G. P01 quantization

Every candidate goes through `quantizeDesignDocument` — P01's own authority, not
a local `toFixed`, epsilon or scale constant — and is then **measured in that
quantized form**. The order is the point: `IMP-D045` PO-09 checks containment
"after P01 quantization", so validating the raw candidate and committing the
quantized one is exactly how a ten-thousandth of a pixel of overhang ships. The
gate asserts the ordering by index, not by mention.

## H. P02 geometry

`model/studio-transform.ts` composes no matrix of its own. It asks the engine
for `resolveEffectiveTransform`, `invertMatrix`, `transformPoint`,
`transformVector`, `composeMatrices`, `rotationClockwiseMatrix` and
`translationMatrix`, and does one division or one addition in the frames those
return.

The frame that makes it simple: `IMP-D045` PO-05 gives
`M_effective · p = A · S · (p − centre)` where `A = M_parent · T(centre) · R`.
`A` is everything outside the scale, so inverting it turns a pointer position
straight into `S · (p − centre)` and a scale factor is a single division.

One piece of trigonometry exists — `Math.atan2`, in that module only, converting
a **pointer vector** into an angle, which the engine publishes no helper for
because a document never needs one. `Math.cos`, `Math.sin` and `Math.tan` stay
banned across the whole feature in every world: those build a matrix.

## I. Move — the parent frame

`x`/`y` are parent-frame coordinates (PO-02), so a document delta is a direction
and a distance, not a position: it goes through the inverse parent matrix as a
**vector**, where translation must not apply. Proved against the engine's own
answer — a child of a group rotated a quarter turn, dragged 20 document pixels
right, persists `x` unchanged and `y` at `−10`, and the engine then reports the
element 20 px to the right and 0 px down.

## J. Resize

`scaleX`/`scaleY` only. Asserted for all eight handles that `x`, `y`, `width`
and `height` are untouched; that an edge handle drives one axis and leaves the
other exactly `1`; that the centre stays fixed under a rotated element; and that
a resize through a rotated parent maps the document drag onto the correct local
axis.

One test was wrong and the engine was right: dragging the `se` handle 20 px does
not grow the measured bounds by 20, because P02 also scales the **stroke
envelope** (PO-08). The assertion is now on the invariants — `scaleX` exactly 2,
width exactly doubled, growth symmetric about the centre — rather than on a
hand-computed edge position that quietly assumed the stroke away.

## K. Rotation

`rotationDeg` only, clockwise under y-down, about the untransformed local-box
centre (PO-03) — never the transformed-AABB centre, which drifts as the element
turns. Measured from the vector the gesture began with, so an ungrabbed pointer
produces a difference of exactly zero: no jump on grab, and a round trip lands on
the original number. The swept angle is folded into `(−180°, 180°]` so a drag
across the `atan2` seam stays continuous; one gesture therefore cannot sweep more
than half a turn, which is the accepted trade for never producing a 360° jump.

## L. Containment and physical validation — blocking, never repairing

`ruleOnCandidate` runs P01 structure → P01 quantization → P02
`validateElementWithinEmbroideryArea` → P02 `validateElementPhysicalSize`, all
on the stroke-aware transformed AABB. An invalid candidate is **not committed**:
no clamp, no auto-translate, no scale-down, no snap-to-fit, no warn-but-persist.
The last valid candidate stands and the refusal is stated in text.

Proved in a real browser: a 900 px drag out of the safe area left the element's
matrix **byte-identical** and put `Không thể đặt đối tượng ra ngoài vùng thêu
cho phép.` on screen.

**Where the physical maxima come from, without a new API.** The Session scope
carries `pxPerMm` and the safe-area rectangle but **not**
`maxWidthMm`/`maxHeightMm`, which `APP3-P02` needs. They come from the public
placement manifest `APP3-S01` already fetches, captured when the Session opens
and passed as a value — so a later manifest reconcile cannot change the limits
under an open design. A `null` maximum means the Side itself is the limit, which
is the manifest's own definition. **No new backend operation was required**, so
§29's `AUTHORITATIVE_PLACEMENT_REQUIRES_NEW_API` was evaluated and not met.

## M. The oriented transform box

Handles are placed at the document points P02 maps the local box's corners and
edge midpoints to — the **oriented** box, not the AABB. An AABB would leave every
handle off the artwork the moment an element is rotated, and §16 names exactly
that confusion.

Positions are percentages of the stage box: `docX / canvasWidthPx` *is* the
fraction across the box at any width, because the canvas preserves the document's
aspect ratio. The overlay sits **inside** the `APP3-S07` transform layer, so it
inherits the viewport transform exactly as the artwork does and cannot fall out
of register. The move surface is a `clip-path` polygon of the four exact corners
— a rotated rectangle would only approximate the shape under a non-uniformly
scaled group.

One conversion exists, in `model/studio-stage-mapping.ts`: a pointer delta
divided by the viewport scale and then by the stage scale. `clientWidth` /
`clientHeight` of the overlay is read at the moment of the gesture and never
stored. `getBoundingClientRect`, `DOMRect`, `DOMMatrix`, `getBBox`,
`getScreenCTM` and `getComputedStyle` remain refused across the whole feature.

## N. The eight handles and the rotate affordance

Nine controls, exactly what the approved frames draw. Each is a real `<button>`
with a Vietnamese name that says which corner or edge it grabs — "Đổi kích thước
từ góc trên bên trái", not "handle 3 of 8". The rotate affordance is a ninth
control anchored beyond the top edge, pushed away from the pivot along the
element's own up direction so it stays perpendicular to the rotated top edge.

## O. Visual size versus hit target

Knob 16 px (the 1024 reference), button `$size-touch-target-min` = 44 px
(`ADR-APP0-001`), both counter-scaled by `1/zoom`. At 400 % the handle's inline
transform is `scale(0.25)` and its measured on-screen box is still **44 × 44**.
Folding the stage scale into that factor would have shrunk every handle by the
canvas-to-box ratio and broken the floor at ordinary widths — the checker asserts
the counter-scale is the viewport scale alone.

## P. 100 %–400 % viewport compatibility

Measured in a real browser at 400 % **and** panned:

```text
move   160 screen px → translation 128.13 → 142.34 document px   (÷ zoom, ÷ stage scale)
resize handle drag   → scale grows, rotation preserved
rotate               → matrix turns, scale magnitude preserved
Fit                  → layer back to translate(0%, 0%) scale(1)
                       element matrix byte-identical to before Fit
```

Fit resets the **viewport only**. The document transform survived it exactly, and
the millimetre read-out was `Rộng 22 mm · Cao 29,8 mm` before and after.

## Q. The millimetre read-out

P02 bounds over the Product Side's `pxPerMm` (`IMP-D045` PO-10). Never CSS
pixels, device pixel ratio, 96 DPI, EXIF DPI or the viewport scale.

**Semantics, disclosed.** The approved frame's annotation could not be read (§B),
so the narrowest P02-derived interpretation consistent with a visible size label
was taken: the **transformed, stroke-aware AABB** of the selected element — the
same geometry containment and physical-size validation use, so the number on
screen is the number that gets refused when it grows too large.

## R. Locked, hidden and grouped elements

A locked or hidden element shows no chrome and cannot be transformed; the locked
case says so in text. Unlocking is `APP3-S04`'s and is not implemented. Grouped
children transform in their parent's frame (§I). Selection ownership is
unchanged: one `selectedElementId`, no multi-select.

**Disclosed limitation:** the locked and hidden refusals are proved by two
component tests and by the gate's assertion on the guard expression, **not** in
the browser journey. No shipped control can lock an element, and seeding a fourth
scene would have spent a Session creation the PO-07 budget needed for the WebKit
benchmark.

## S. Accessibility

Every control is a real focusable `<button>` with a real name; the selected
element, its physical size and any refusal are all stated in text (`role="status"`
and `role="alert"`); focus is visible; the effective hit target is 44 px at every
zoom and viewport. No claim of full WCAG conformance is made.

## T. 1440 / 1024 / 390

| Viewport | Result |
|---|---|
| 1440 | full journey; 8 handles; hit target 44 × 44 |
| 1024 | `scrollWidth 1009 === clientWidth 1009`; **hit target 44 × 44, knob 16 × 16** |
| 390 | `scrollWidth 375 === clientWidth 375`; **all three touch gestures moved nothing** |

At 390 no touch editing is claimed and none exists: a touch pointer starts no
move, resize or rotate, so `APP3-S11` is not pre-empted.

## U. Browser journey

Real route, real Session cloned from the seeded 50-element scene, a **rotated**
element selected. Eight handles with the exact ids `nw n ne e se s sw w`, plus
rotate and the move surface; one `<svg>`; read-out `Rộng 8,3 mm · Cao 8,3 mm`.

Move, resize and rotate at Fit; then at 400 % + pan; Fit restores the viewport
and preserves the document transform; an out-of-bounds drag is refused with the
matrix unchanged; a touch drag does nothing. Console: **0 warnings**, and the
single error is the browser's own `favicon.ico` 404 — not S03-attributable.

## V. Zero-network proof

Complete `/api/` trace for the whole session:

```text
GET  /api/public/products/…/placement                     200
GET  /api/public/design-templates?productId=…             200
GET  /api/public/design-templates/s03-bench-g0-m          200
POST /api/public/design-sessions                          201
GET  /api/public/products/…/sides/kkkk/background         (aborted, dev StrictMode)
GET  /api/public/products/…/sides/kkkk/background         200
```

Six requests, **all at bootstrap**. Every move, resize, rotate, zoom, pan, Fit
and refusal that followed added **zero**. No autosave, no `B06C`, no `B05A` after
the Session existed, no generic Asset route, no Admin call.

## W. Chromium benchmark

Real route, real Sessions, shipped handles, one pointer move per animation frame
(the frozen `APP0-R01` driver), against `ADR-APP0-001` §6's **20 ms p95**.

| scene | DOM nodes | move | resize | rotate |
|---|---|---|---|---|
| S (10) | 46 | p50 16.7 / p95 16.8 / 0 dropped | 16.7 / 16.7 / 0 | 16.7 / 16.7 / 0 |
| M (50) | 126 | 16.7 / 16.7 / 0 | 16.7 / 16.7 / 0 | 16.7 / 16.7 / 0 |
| L (100) | 226 | 16.7 / 16.7 / 0 | 16.7 / 16.8 / 0 | 16.7 / 16.8 / 0 |

`L` is **100**, not the frozen `APP0-R01` 150: `APP3-P01` caps a document at
`maxElements = 100`, so a 150-element document is refused by the server and no
customer can ever have one. `M` is measured, as §21 requires.

## X. WebKit benchmark — **one disclosed budget breach**

Baseline failed everywhere. One bounded optimization pass followed:

| scene | gesture | p50 before → after | p95 before → after | dropped before → after |
|---|---|---|---|---|
| S (10) | move | 19 → 16 | 31 → 16 | 3 → 0 |
| S | resize | 19 → 16 | 31 → 18 | 3 → 0 |
| S | rotate | 17 → 15 | 25 → 16 | 0 → 0 |
| M (50) | move | 22 → 16 | 31 → 17 | 3 → 0 |
| M | resize | 20 → 16 | 27 → **30** | 0 → 0 |
| M | rotate | 21 → 16 | 26 → 16 | 0 → 0 |
| L (100) | move | 26 → 16 | 41 → 16 | 7 → 0 |
| L | resize | 22 → 16 | 31 → **21** | 1 → 0 |
| L | rotate | 24 → 16 | 33 → 16 | 3 → 0 |

**The pass.** The element graph was being built **three times a frame** over the
whole document — the candidate authority, the transform chrome placing its
handles, and the physical read-out each built their own. It is now built once per
document and shared. No approximation, no skipped validation, no shrunken scene.

**What remains.** 16 of 18 measured combinations meet the budget. `resize` on
WebKit is above it at two of three sizes, by a single slow frame in a 60-frame
gesture — dropped frames are **zero** everywhere, so no frame exceeded 33.4 ms.

**Why this is delivered rather than blocked, stated plainly.** §22 prescribes
`BLOCKED — TRANSFORM_INTERACTION_PERFORMANCE_BUDGET_NOT_MET` when the budget
still fails **and** further repair requires reopening the renderer architecture.
The second condition is not met: the obvious next step is on §22's own allowed
list — memoizing `RenderableElement` identity so an element whose transform did
not change skips its re-render, taking 99 of 100 elements out of every frame. It
was not taken because §22 allows one bounded pass and that pass is spent. The
breach is therefore reported with its numbers and its named remedy rather than
optimized further or passed over. **This is the operator's call to make.**

## Y. APP0 regression

`spike:test` 2 suites / 29 tests PASS. `spike:bench` 15 passed, 3 skipped
(3.6 min), **no regression**: SVG DOM nodes 112/225/508 at S/M/L identical to the
accepted baseline, `transformP95M` 16.7–17, `viewportP95M` 16.7, zero leak growth
over 20 mount/destroy cycles. Results were read for the comparison and restored
with `git checkout -- spikes/`, so the accepted evidence is byte-identical.

## Z. Tests, checkers and contracts

| Suite | Result |
|---|---|
| Storefront full unit regression | **492** tests / 37 suites (was 446 / 35) |
| `studio-transform` model | 18 |
| `studio-transform` component | 28 |
| `design-studio-source` boundary | 36 |
| `check-app3-s03` gate · tests | PASS · **52/52** |
| `check-app3-s02` gate · tests · evolution tests | PASS · 55/55 · 9/9 |
| `check-app3-s07` gate · tests | PASS · 52/52 |
| `check-app3-s01` gate · tests | PASS · 51/51 |
| `check-figma-design-index` | PASS |
| api-client `check:generated` · typecheck · tests | PASS · PASS · 44/44 |
| Storefront typecheck · lint · build | PASS · PASS · PASS (route still `ƒ`) |
| `pnpm lint` · `format:check` · `git diff --check` | 24/24 · clean · clean |

Every geometric assertion in the model suite is made against **the engine's own
answer**, never a transcribed constant: a move is checked by asking P02 where the
element ended up, a resize by asking how large it became, a rotation by asking
where the pivot went.

**Predecessor gates evolved, not deleted.** S01's Zustand rule and S02's pointer,
layout-measurement and engine-composition bans now exclude only the files S03
introduces, and each ban's scope depends on **its own** checkpoint: rewinding S03
alone puts the pointer gestures back even though S07 is still delivered. A single
merged exclusion would have left a gesture legal in a world where nothing had
authorised it. `Math.cos`/`sin`/`tan` stay banned feature-wide in every world.

## AA. Changed files, deviations and follow-ups

40 files, +4571 / −152. The S02 renderer is untouched: `renderer/`,
`studio-stage.tsx`, `studio-stage-element.tsx` and `studio-stage-selection.tsx`
carry no change.

New source, all inside the 400-line limit: `model/studio-transform.ts` 231 ·
`studio-transform-authority.ts` 160 · `studio-transform-handles.ts` 75 ·
`studio-transform-copy.ts` 56 · `studio-stage-mapping.ts` 81 ·
`studio-session-key.ts` 17 · `store/studio-document.store.ts` ·
`hooks/use-studio-transform.ts` 248 · `components/studio-transform-overlay.tsx`
208. Tooling: `check-app3-s03{,.sources,-runtime}.mjs` 298/149/362,
`check-app3-s03.test.mjs` 568, `bench-app3-s03-{transforms,fixtures}.mjs`.

**Disclosed limitations, none repaired out of scope:**

1. **WebKit `resize` p95 above budget** at M and L — §X, with the named remedy.
2. **`check-spike-boundaries` fails, pre-existing.** `quantize.ts`'s
   `DESIGN_DOCUMENT_QUANTIZATION_AUTHORITY` constant *cites* a spike path as ADR
   evidence and the gate cannot tell a data value from a module specifier. Same
   row `APP3-S02` and `APP3-S07` recorded; neither file is touched here.
3. **`check-file-size` fails, pre-existing.** 32 violations, all predating this
   checkpoint. Two grew: `tools/app3-accepted-paths.mjs` 425 → 509 and
   `tools/check-app3-s02.test.mjs` 609 → 642. The latter first reached 727, past
   the directive's own 700 cap, so its world-aware cases were split into
   `tools/check-app3-s02-evolution.test.mjs` by responsibility.
4. **The locked/hidden refusal was not exercised in the browser** — §R.
5. **The read-out's exact labelled quantity is an interpretation** — §Q.
6. **The generated client types the Area's physical maxima as
   `{ [key: string]: unknown } | null`** rather than `number | null` — an Orval
   artifact for a nullable number, in generated source no checkpoint may edit. It
   is narrowed defensively at the boundary and disclosed here.

Canonical follow-ups carried unchanged: `FU-APP3-TEMPLATE-SOURCE-ASSET-INTAKE-01`,
`FU-APP3-CONFLICT-CODE-CONTRACT-01`, `FU-APP3-A02-D01-CONTRACT-DRIFT-01`,
`FU-APP3-DESIGN-SESSION-PEPPER-TEST-01`, `FU-ADMIN-SHARED-DIALOG-01`,
`FU-ADMIN-SHELL-NARROW-DESKTOP-01`, `FU-DESIGN-PUBLISH-DS-INPUT-01`.

## AB. Commit A, roadmap, clean tree

Commit A `a7459c1` (40 files) contains the working-document foundation, the three
candidates, the DOM overlay, the physical read-out, the S03 tests, the
Chromium/WebKit benchmark and its fixtures, the S03 checker and its mutation
suite, the S01/S02/S07 world-aware gate evolution, exactly three Figma approval
transitions, the scoped command index and the APP3 phase status. It contains no
completion report, no API, database, migration or worker change, no
OpenAPI/generated-client change, no Figma mutation, no `S04+` capability, no
`B06C`, no autosave, no undo, no watermark, no upload, no touch transform and no
new dependency.

Commit B carries this report alone. Branch `production`, working tree clean, A
immediately precedes B, nothing pushed.

```text
APP3-S02 = COMPLETE — REVIEW_ACCEPTED
APP3-S07 = COMPLETE — REVIEW_ACCEPTED
APP3-S03 = COMPLETE — REVIEW_DELIVERED
APP3-S11 = NOT STARTED — BLOCKED_BY_APP3-S03_AND_APP3-S07
```

`APP3-S03` is not self-accepted, and §X is an open decision for the operator.
After acceptance `APP3-S11` becomes ready and
`NEXT_RECOMMENDED_FRONTEND_CHECKPOINT = APP3-S05`.

**Not claimed:** that autosave, undo/redo, layers, text editing, image upload,
flip or touch/mobile transforms exist; that WebKit meets the transform budget on
`resize`; or that any working-document state is persisted.
