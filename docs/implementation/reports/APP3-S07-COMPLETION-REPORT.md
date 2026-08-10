# APP3-S07 — Studio zoom / pan / safe area + Product background viewport

`COMPLETE — REVIEW_DELIVERED`. Commit A `5ab774f`
`feat(storefront): add Studio zoom pan and safe area`.

Frontend only. OpenAPI 35 paths / 40 operations / 83 schemas, generated-client
tree `d9aac2b3…`, curated HTTP operation set, 34 migrations and 30 root scripts
are all unchanged, and this checkpoint consumes no operation at all.

---

## A. Entry state

The operator accepted `APP3-S02`. Recorded before any source edit:

```text
APP3-S01-C1 = COMPLETE — REVIEW_ACCEPTED      APP3-B02    = COMPLETE — REVIEW_ACCEPTED
APP3-S01    = COMPLETE — REVIEW_ACCEPTED      APP3-P01    = COMPLETE — REVIEW_ACCEPTED
APP3-S02    = COMPLETE — REVIEW_ACCEPTED      APP3-P02    = COMPLETE — REVIEW_ACCEPTED
APP3-D01    = COMPLETE — REVIEW_ACCEPTED      APP3-D01-C1 = COMPLETE — REVIEW_ACCEPTED
```

Accepted S02 implementation: `3080073819470b000f4c22da153fda565feb7b26`.

**One authority conflict, resolved by the documents themselves and not by me.**
The phase plan's §6 candidate slice list calls `APP3-S07` "Autosave and
recovery"; its §6.1 corrected map calls it "zoom / pan / safe area / product
background". §6 opens by stating that where the two disagree, §6.1 governs, so
there is no open contradiction to report — but it is named here because a reader
checking the wrong section would conclude this checkpoint built the wrong thing.

## B. The three S07 design rows

Resolved from `docs/design/FIGMA_DESIGN_INDEX.md`, not guessed:

| Registry ID | Node | State |
|---|---|---|
| `FIG-STUDIO-ZOOM-DESKTOP-FIT` | `609:3` | Fit to Stage |
| `FIG-STUDIO-ZOOM-DESKTOP-ZOOMED` | `609:51` | Zoomed In & Panned |
| `FIG-STUDIO-ZOOM-DESKTOP-SAFEAREAHIDDEN` | `609:99` | Safe Area Hidden |

File `BQwqV8GdfUIELvsQDB1UQE`, page `APP_03`, section **11 — Studio Zoom / Pan /
Safe Area** (`596:17`). All three were `REVIEW_REQUIRED` on entry and were
promoted to `APPROVED_FOR_IMPLEMENTATION` with evidence `APP3-S07 §4 operator
review`. Exactly three rows moved; the registry gate re-verified integrity
afterwards (165 registry IDs, 165 node rows, 15 tables).

Every `S03`, `S04`, `S05`, `S06`, `S08`, `S09`, `S10` and `S11` capability row
remains `REVIEW_REQUIRED`, and all three Studio gates assert it in both
directions — each refuses a blanket approval, and each also refuses these rows
being approved in a world where S07 has not delivered.

**Live Figma read: attempted, unavailable, and not a blocker.** The connector
returned an OAuth authorization URL requiring an interactive round-trip the
operator must complete; no read tool exists without it. §4 permits exactly this,
and the registry plus `APP3-D01`/`D01-C1` fully resolve the three entries and
their node ids. No Figma artifact was modified.

## C. 1440 and 1024 authority

Desktop authority is section 11 at **1440**. The shared tablet reference is
`FIG-STUDIO-EDITING-TABLET-1024` (`618:140`), which draws a zoom control *and*
the whole `S02`–`S11` editing surface. It remains owned by `APP3-D01-C1`; the
S07 gate asserts that ownership explicitly, because re-attributing it here would
turn a reference into a licence for every capability drawn on it. At 1024 only
the S07-owned portions are active — no transform handle, layer drawer, text
inspector, upload, undo, watermark or save chip exists anywhere in the build.

## D. The historical WebKit risk

`ADR-APP0-001` accepted native SVG with one recorded risk and one named owner:

> WebKit re-rasterises the whole SVG on viewport scale — measured zoom-gesture
> p95 **41 ms** on desktop WebKit versus **16.7 ms** on Chromium.
> **Mitigation:** APP3 zoom should step discretely and/or use a CSS transform on
> a wrapper rather than continuously changing the SVG scale; re-measure.

The frozen `svg.summary.json` records it as `viewportP95M = 41` on
`desktop-webkit` against `16.7` on every Chromium project. The budget it breaches
is `ADR-APP0-001` §6's frozen **transform frame p95 ≤ 20 ms desktop**.

## E. Entry performance-path audit

Read before writing anything: `ADR-APP0-001` §6 and its Risks section, the
`APP0-R01` benchmark driver and its results, the phase plan's §6.2 performance
handoff, and the S02 production stage DOM.

The expensive path is identifiable in the spike source: `svg/scene.tsx` applies
`transform={translate(...) scale(...)}` to an SVG `<g>`, and the pinch driver
feeds it `zoom = zoomStart × distance / pinchStart` — sixty frames, each at a new
arbitrary scale, each a full re-rasterisation. So the cost is not "SVG is slow";
it is *how many distinct scales a gesture produces*.

That determined the architecture before any measurement: make an arbitrary scale
**unrepresentable**, and move the transform off the SVG.

## F. The chosen mitigation

Both halves of the ADR's own mitigation, together:

```text
studio-stage__viewport            ← clips
  └─ studio-stage__viewport-layer ← the ONE transform: translate(%) scale(step)
      └─ <svg viewBox="0 0 canvasW canvasH">   ← APP3-S02, byte-identical
          ├─ background <image>
          ├─ area <rect>
          ├─ elements at APP3-P02 matrices
          └─ selection outline at APP3-P02 bounds
```

- **Discrete steps.** `ZOOM_STEPS` is a frozen six-value list addressed by index.
  A gesture cannot produce sixty scales because six exist.
- **One CSS wrapper.** The transform is on an HTML element outside the SVG, so
  no `viewBox` is rewritten and no element matrix is touched.

Rejected: transforming the SVG `<g>` (the measured path), and updating the outer
`viewBox` per step (it re-enters document coordinates, where a rounding choice
becomes a geometry decision `APP3-P02` owns).

Three consequences fall out rather than being engineered:

1. **Alignment is structural.** Background, area, elements and outline are inside
   the transformed layer, so they move as one and cannot drift at 4×.
2. **Hit testing is free.** The browser inverts a CSS transform when routing a
   pointer event, so a click at 400 % selects the element under the cursor with
   no coordinate computed here.
3. **The document is unreachable.** The adapter, the SVG, the element component
   and the outline never see the zoom.

## G. Viewport runtime state

`store/studio-viewport.store.ts` — a **separate** store from the S02 selection
store, holding four serializable numbers: `zoomStep`, `panXRatio`, `panYRatio`,
`safeAreaVisible`.

Separate rather than a second slice, and that is the point: `APP3-S02`'s rule is
that the selection store may not contain the string `zoom` or `pan`. Two stores
that cannot express each other's concern let that rule stay **absolute** instead
of being relaxed to make room. A rule that never had to bend is worth more than
one that did.

Never present: `DOMRect`, `DOMMatrix`, `SVGElement`, pointer event,
animation-frame handle, `AbortController`, object URL, React ref, Session
snapshot, Design Document. Never persisted to the document, autosave,
`localStorage`, `sessionStorage`, the URL or a cookie; no persistence middleware.

## H. Zoom semantics — **disclosed engineering ruling**

`ZOOM_STEPS = [1, 1.25, 1.5, 2, 3, 4]` — 100 % to 400 %, index-addressed.

**The exact step sequence and end values are not resolvable from repository
authority.** The approved frames draw a stepped control, a Fit action and a
safe-area toggle; `05-DESIGN-STUDIO-SPEC.md` §4.6 lists "Zoom" and "Pan" as
capabilities with no numbers; `ADR-APP0-001` sets no zoom limits. §10 directs the
smallest bounded ruling consistent with the drawn control, disclosed rather than
presented as design authority. This is that ruling:

- **Floor is 1, not below.** The stage already fits — the `viewBox` is the
  placement canvas and `xMidYMid meet` letterboxes it — so "fitted" *is* 1, and
  zooming out would only add empty space around a design that is entirely
  visible. Zoom-out is `disabled` at fit rather than given a step that does
  nothing useful.
- **Ceiling is 4.** An embroidery area is a few hundred document pixels across;
  4× inspects a stitch boundary without reaching a scale at which a customer can
  no longer tell which part of the garment they are on.

Properties, all asserted: bounded, monotonic, deterministic, keyboard-operable,
same action → same value. An index rather than `zoom *= 1.1` also means zooming
in and back out returns to **exactly** `1`, not to `0.9999999999999999`.

No slider and no preset menu, because the design draws neither. No wheel zoom:
it is a continuous gesture by nature and the gate bans `onWheel` in both worlds.

## I. Fit and reset

The design draws **Fit** and no separate reset, so exactly one control exists.
Fit and "reset the viewport" are the same canonical state here — zoom 1, pan 0 —
because the fitted view is the identity transform.

Fit never resets the Design Document, an element transform or the Session, and
**keeps the current selection** (proved in jsdom and in a real browser). It is
`disabled` when the viewport is already fitted.

## J. Pan gesture and bounds

A **background drag**, mouse or pen, started only when the pointer lands on the
stage surface — the frame or the `<svg>` root itself — past a 3 px threshold.

An element is never a pan handle. `APP3-S03` owns dragging an element, and a
gesture that means "move the view" today must not quietly mean "move the artwork"
tomorrow. This needs no DOM traversal: the two wrappers mark themselves, the
`<svg>` is the only one in the feature, and the background image and area rect
are `pointer-events: none`, so no drawn element can satisfy the test.

**The bounds make "lost" unrepresentable rather than recoverable.** With
`transform-origin: 0 0`, `translate(P%) scale(Z)` puts the content across
`[P·W, P·W + Z·W]` while the frame is `[0, W]`; covering it is exactly
`P ∈ [-(Z − 1), 0]`. At the fitted step that interval collapses to the single
value `0` — so at fit there is no pan to be lost in, and at every other step the
stage cannot be dragged out of its own frame. Fit remains available regardless.

Pan is a **ratio**, not a pixel count, so nothing pixel-sized is stored and a
container resize keeps the same view of the design instead of jumping (§24).

**Coexistence with S02's click-to-clear** is the part that had a real bug in it.
A press that never passes the threshold stays a click and still clears the
selection; a real drag swallows its trailing click in the capture phase so
panning cannot silently deselect. The first version kept one flag for both, and
a drag that ended **without** a trailing click — which browsers do produce after
a captured drag — left the suppression standing and ate the customer's *next*
click. An element that refuses to be selected exactly once is close to
impossible to reproduce. The fix is structural: the suppression is cleared on
every `pointerdown`, and a click can only ever reach the stage after one.

## K. Safe-area visibility

The **same** `rectToBounds` rectangle `APP3-S02` draws, withheld from the paint
when hidden: `area={safeAreaVisible ? area : null}`. No second or inset boundary
is derived locally — one that agreed with the persisted rectangle on every
fixture and diverged on the rounded ones nobody wrote is exactly the defect this
avoids. The gate bans `inset`, `margin[A-Z]`, `shrinkBy` and `padArea` across the
feature.

The boundary stays inside the one `<svg>`, so it shares the scene's coordinate
system and follows zoom and pan exactly with the background and the elements. A
CSS overlay could drift; this cannot, because it is the same layer.

The control is a real toggle carrying `aria-pressed`, with the legend the
approved Safe Area frame shows. Default is visible; hidden is the drawn
non-default state.

## L. Product background preservation

`publicProductSideBackgroundGet` remains the sole contextual background read,
with S02's Blob and object-URL lifecycle untouched (`gcTime: 0`, no
`placeholderData`, revoked in effect cleanup). `use-side-background.ts` and
`studio-query-keys.ts` are **unmodified**, and the gate asserts neither file
contains `zoom`, `panX` or `safeArea` — so the view moving cannot be a reason to
fetch the Side's bytes again. Measured: one background request for the whole
session, across every viewport action (§S).

## M. Selection under the viewport transform

Proved in a real browser at 400 % **and** panned, on a rotated element:

```text
clicked   studio-element-bench-042
selected  true          aria-pressed  true
element   matrix(0.9659258262890683 0.25881904510252074 -0.25881904510252074
                 0.9659258262890683 123.07365440327095 140.28308679579936)
outline   x=121.2707 y=139.6707 w=6.8586 h=6.8586
layer     translate(-17.762%, -25%) scale(4)
```

The element matrix is `APP3-P02`'s answer in document space — `cos 15°` and
`sin 15°` exactly, with no `4` anywhere in it — and the outline is the
transformed stroke-aware AABB in the same space. Selection identity is never
derived from CSS pixels, and zoom, pan and the safe-area toggle never change
`selectedElementId`.

## N. Pointer/stage mapping

One conversion exists and it is one division. `panBy(viewport, dx, dy, w, h)`
turns a pointer delta into a pan ratio; because `translate` is applied before
`scale` in the untransformed box, a drag of `dx` CSS pixels moves the content by
`dx` pixels, so there is no scale factor and no matrix.

`clientWidth`/`clientHeight` of the viewport element is the only measurement this
feature takes of the browser's layout. It is read during the gesture, used to
divide two deltas, and never stored — so it cannot become geometry.
`getBoundingClientRect`, `DOMRect`, `DOMMatrix`, `getBBox`, `getScreenCTM` and
`getComputedStyle` remain refused across the whole feature in every world.

**No browser→document mapping was pre-built for `APP3-S03`.** It has no consumer
here, and an abstraction for a hypothetical future reuse is what `CLAUDE.md` §5
forbids.

## O. Resize behaviour

Deterministic and free: the pan is a fraction of the viewport, so a container
that changes size keeps the same view rather than jumping, and the fitted state
is the identity transform at any size. No `FIT | MANUAL` mode was introduced —
it would have been a third state to keep consistent with no behaviour to justify
it — and no `ResizeObserver` is needed.

## P. Accessibility

Every control is a real `<button>` with a real Vietnamese label: **Thu nhỏ**,
**Phóng to**, **Vừa khung**, **Hiện/Ẩn vùng thêu cho phép**. The zoom level is
stated in text (`Mức phóng 400%`, `role="status"`), so it can be read aloud
rather than inferred from how large the artwork looks. Both ends of the range are
`disabled` rather than silently inert, the safe-area state is on `aria-pressed`
as well as in the picture, the toolbar is a named `role="group"`, and controls
measure **44 px** at 390 (measured, §R). No pan movement is announced.

## Q. Zero document mutation and zero autosave

- Element `<g>` transforms compared **before and after** zoom, pan, fit and the
  safe-area toggle — byte-identical, in jsdom over 100 elements and in a real
  browser over 100 elements.
- The Session document object compared by **identity** (`toBe`) and by
  serialization after the same sequence — unchanged, revision unchanged.
- No `publicDesignSessionAutosave` anywhere in the feature; the gate bans it.
- The viewport files import no query, no mutation and no API client at all.

## R. Responsive 1440 / 1024 / 390

| Viewport | Result |
|---|---|
| 1440 | full journey; `scrollWidth === clientWidth` |
| 1024 | `scrollWidth 1009 === clientWidth 1009`; controls present; no S03–S11 capability |
| 390 | `scrollWidth 375 === clientWidth 375`; control heights **44 px**; zoom works from the button; a **touch** drag moved the layer 0 % |

At 390 no touch editing is claimed and none exists: a touch pointer never starts
a pan, so the page keeps its own scroll and `APP3-S11` is not pre-empted.

## S. Browser and network proof

Real Storefront route on the `APP3-S01` trustworthy origin, real Session cloned
from a seeded 100-element Template. All twelve §39 steps: fitted default → zoom
in → zoom out → both ends (`Phóng to` disabled at 400 %, `Thu nhỏ` and `Vừa
khung` disabled at fit) → pan → Fit restores `translate(0%, 0%) scale(1)` →
select at non-100 % → outline aligned → safe area off and on → background aligned
→ zero API calls.

Complete `/api/` trace for the entire session:

```text
GET  /api/public/products/a03-live-check-redirect/placement          200
GET  /api/public/design-templates?productId=…&productSideId=…        200
GET  /api/public/design-templates/s07-bench-g1-l                     200
POST /api/public/design-sessions                                     201
GET  /api/public/products/…/sides/kkkk/background                    (aborted, dev StrictMode)
GET  /api/public/products/…/sides/kkkk/background                    200
```

Six requests, **all at bootstrap**. Every zoom, pan, fit, safe-area toggle,
selection and both viewport resizes that followed added **zero**. No Admin API,
no `B06C`, no autosave, no generic Asset route, no Template Asset request after
the Session existed. Console: **0 errors, 0 warnings**.

## T–U. Chromium and WebKit benchmark

`node tools/bench-app3-s07-viewport.mjs` — both browsers, the real route, real
Sessions, the shipped controls, one action per animation frame for 60 frames
(the frozen `APP0-R01` driver).

| browser · scene | zoom p95 | dropped | pan p95 | fit p95 | continuous control p95 | DOM nodes |
|---|---|---|---|---|---|---|
| chromium · S (10) | 16.7 | 0 | 16.8 | 16.7 | 16.7 | 24 |
| chromium · L (100) | 16.7 | 0 | 16.7 | 16.8 | 16.7 | 203 |
| webkit · S (10) | 16 | 0 | 16 | 16 | 16 | 23 |
| webkit · L (100) | 16 | 0 | 16 | 16 | 16 | 203 |

Every measurement is at or under **16.8 ms p95** against the frozen **20 ms**
desktop budget, with **zero** dropped frames, on both browsers at both scene
sizes. The script fails the run on that budget; it defines no new one.

**Reproduce-before-fix, and one bounded optimization pass.** The stepped path
alone was *not* enough on WebKit. The first run measured:

| browser · scene | zoom p95 before → after | dropped before → after |
|---|---|---|
| webkit · S (10) | 19 → 16 | 0 → 0 |
| webkit · L (100) | **26 → 16** | **2 → 0** |

The pass was `will-change: transform` on the single viewport layer — one hint on
one element, not on a hundred, which would trade a main-thread cost for a memory
one. Chromium was unaffected throughout.

**The historical 41 ms did not reproduce on this machine, and is not claimed as
a current number.** Each run also measures a control group on the same page and
the same DOM: sixty arbitrary scales written straight onto the layer, bypassing
the shipped controls. That continuous path measured **21 ms** on WebKit before
the pass, not 41. So the risk *class* reproduced — WebKit only, worst at the
largest scene, over budget, dropping frames — at a smaller magnitude than the
ADR recorded on its own hardware. 41 ms remains historical context.

**Scene sizes diverge from the ADR, deliberately.** `APP0-R01` froze S/M/L at 10,
50 and 150. A 150-element document **cannot exist in production**:
`APP3-P01` caps a document at `DESIGN_DOCUMENT_LIMITS.maxElements = 100`, and the
server refuses one. `L` here is therefore 100 — the largest scene any customer
can ever have, and the number the viewport must be fast at. `M` (50) is seeded
and measurable on its own run but was not measured in the combined run, because
`IMP-D043` PO-07 caps anonymous Session creation at **5 per hour per IP** and
three scenes across two browsers is six. The run was designed to fit inside the
guard (four creations, with a 65 s pause for the 2-per-minute burst window)
rather than restarting the API to clear an in-memory counter.

## V. APP0 benchmark comparison

`spike:test` 2 suites / 29 tests PASS. `spike:bench` 15 passed, 3 skipped
(3.6 min), **no regression**: SVG DOM nodes 112 / 225 / 508 at S/M/L identical to
the accepted baseline, `viewportP95M` 16.7, `transformP95M` 16.7–16.8, zero leak
growth over 20 mount/destroy cycles. Results were read for the comparison and
then restored with `git checkout -- spikes/`, so the accepted `APP0-R01` evidence
is byte-identical.

## W. Tests, checker and gates

| Suite | Result |
|---|---|
| Storefront full unit regression | **445** tests / 35 suites (was 385 / 35) |
| `studio-viewport` model | 17 |
| `studio-stage-viewport` component and lifecycle | 35 |
| `design-studio-source` boundary | 35 (was 27) |
| `check-app3-s07` gate | PASS |
| `check-app3-s07.test.mjs` | **52/52** |
| `check-app3-s02` gate · tests | PASS · **61/61** (was 55) |
| `check-app3-s01` gate · tests | PASS · **51/51** (was 50) |
| `check-figma-design-index` | PASS |
| api-client `check:generated` · typecheck · tests | PASS · PASS · 44/44 |
| Storefront typecheck · lint · build | PASS · PASS · PASS (route still `ƒ`) |
| `pnpm lint` · `format:check` · `git diff --check` | 24/24 · clean · clean |

The gate rules the structural half of the mitigation, which a benchmark cannot:
the zoom is a frozen finite set with no multiplier, no `Math.pow` and no wheel;
the transform is produced once and applied once; the adapter, SVG, element and
outline cannot see the viewport; the scene is memoised on the document alone.
Its mutation suite breaks each of those in a throwaway repository copy and proves
refusal — including a zoom folded into an element transform, a scene rebuilt per
step, a `localStorage` write, a locally recomputed safe area, a second `<svg>`,
and a touch gesture arriving before `APP3-S11`.

**Predecessor gates evolved, not deleted.** S01's whole-feature ban on
`viewport`, and S02's on pointer gestures and layout measurement, now exclude
only the five files S07 introduces. The exclusion names the **new** files, so
anything added tomorrow inherits the strict rule by default; a list of the old
files would have let every new file escape. Both still refuse the capability
arriving early — rewinding the S07 status line puts the original whole-feature
bans back, and the suites assert exactly that.

One rule had to change shape rather than scope. `check-app3-s02-runtime.mjs`
crossed the 400-line limit when its bans split into world-aware halves, so the
lists moved to `tools/check-app3-s02-bans.mjs` — which immediately broke the S07
rule that read them by path. It now globs `tools/check-app3-s02*.mjs`: the
defect `APP3-B04A` recorded, that a rule anchored to a file path stops asserting
anything the moment that file is split.

## X. Contract and artifact immutability

Unchanged: API runtime, worker, database and migrations (34), OpenAPI
(35/40/83), generated api-client source (tree `d9aac2b3…`), the curated HTTP
operation set, root scripts (30). No dependency was added — Playwright is reached
through the package that already pins it, so there is exactly one browser
toolchain in the tree and no `pnpm install` was run.

## Y. Changed files, sizes and follow-ups

30 files, +3895 / −79. The **S02 scene is byte-identical**: `studio-stage.tsx`,
`studio-stage-element.tsx`, `studio-stage-selection.tsx`, the whole `renderer/`
adapter, `studio-interaction.store.ts`, `use-side-background.ts` and
`studio-query-keys.ts` are untouched.

New source (all inside limits): `model/studio-viewport.ts` 179 ·
`model/studio-viewport-copy.ts` 43 · `store/studio-viewport.store.ts` 105 ·
`components/studio-stage-viewport.tsx` 180 ·
`components/studio-stage-controls.tsx` 99. Tooling:
`check-app3-s07{,.sources,-runtime}.mjs` 290 / 153 / 400,
`check-app3-s07.test.mjs` 575, `bench-app3-s07-{viewport,fixtures}.mjs`,
`check-app3-s02-bans.mjs` 80.

**Disclosed limitations, none repaired out of scope:**

1. **`check-spike-boundaries` fails, pre-existing.** `quantize.ts`'s
   `DESIGN_DOCUMENT_QUANTIZATION_AUTHORITY` constant *cites* a spike path as ADR
   evidence and the gate cannot tell a data value from a module specifier. Same
   row `APP3-S02` recorded; neither file is touched here.
2. **`check-file-size` fails, pre-existing.** 32 violations, all predating this
   checkpoint (proved by `git stash`). Two grew:
   `tools/app3-accepted-paths.mjs` 425 → 466 and `tools/check-app3-s02.test.mjs`
   609 → 679 — both `tools/`, both inside the directive's own soft caps of 450
   and 700, both already over the repository limit before being touched. One
   violation was *introduced and repaired* rather than disclosed: the
   `check-app3-s02-runtime.mjs` split described in §W.
3. **`design-studio.scss` is 590 lines.** The stylesheet is not scanned by the
   size gate and `APP3-S02` already left it at 496; splitting it is unrelated
   refactoring.
4. **`M` (50 elements) was not measured in the combined benchmark run** — §T–U,
   PO-07.
5. **Two fixture-tool defects found and fixed here**, both in code this
   checkpoint reused: `smoke-app3-s01-fixtures.mjs` ran its CLI on *import* (it
   now exports the placement and guards on the main module), and the new
   benchmark `revert` threw silently (`id like` on a `uuid` column), which let
   `on conflict do nothing` keep a previous run's scenes.

Carried unchanged, not reopened: `FU-DESIGN-PUBLISH-DS-INPUT-01`,
`FU-APP3-TEMPLATE-SOURCE-ASSET-INTAKE-01` and the other canonical APP3
follow-ups. **No new WebKit follow-up is opened** — the budget is met and the
measurement is the evidence.

## Z. Commit A, roadmap, clean tree

Commit A `5ab774f` `feat(storefront): add Studio zoom pan and safe area`
(30 files) contains the viewport model, store, wrapper and controls, the S07
tests, the Chromium/WebKit benchmark and its fixtures, the S07 checker and its
mutation suite, the world-aware S01/S02 gate evolution, exactly three Figma
approval transitions, the scoped command index and the APP3 phase status. It
contains no completion report, no API runtime, no database or migration, no
worker, no OpenAPI or generated-client change, no Figma mutation, no `S03+`
capability, no `B06C`, no autosave, no watermark, no upload UI, no mobile
editing, no new shared package, no external dependency and no spike import.

Commit B carries this report alone. Branch `production`, working tree clean,
A immediately precedes B, nothing pushed.

```text
APP3-S02 = COMPLETE — REVIEW_ACCEPTED
APP3-S07 = COMPLETE — REVIEW_DELIVERED
APP3-S03 = READY — NOT STARTED
APP3-S11 = NOT STARTED — BLOCKED_BY_APP3-S03_AND_APP3-S07
```

`APP3-S07` is not self-accepted. After acceptance the next recommended frontend
checkpoint is **`APP3-S03`** — element transforms — which is also the remaining
dependency `APP3-S11` needs; S07 alone does not make it ready.

**Not claimed:** that element transform editing exists; that mobile pinch or
touch editing exists; that WebKit equals Chromium beyond what the table in §T–U
measures; that the performance risk is closed by anything other than the browser
evidence above; or that any viewport state is persisted.
