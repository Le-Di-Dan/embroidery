# APP3-S03-C1 — completion report

**Close the remaining WebKit resize performance budget breach**

Correction to `APP3-S03`. Storefront only. Commit A `cfe3659`, Commit B this
document. Branch `production`, nothing pushed, not self-accepted.

---

## A. The review finding, and the exact numbers

Human review accepted the delivered `APP3-S03` semantics, geometry, DOM handles,
viewport compatibility, tests, browser proof, zero-network boundary and contract
immutability, and returned exactly one issue:

```text
CAUSE = WEBKIT_RESIZE_P95_EXCEEDS_FROZEN_20MS_BUDGET
```

| browser · scene | gesture | p95 delivered | budget | verdict |
|---|---|---|---|---|
| webkit · S (10) | resize | 18 ms | 20 ms | PASS |
| webkit · M (50) | resize | **30 ms** | 20 ms | **FAIL** |
| webkit · L (100) | resize | **21 ms** | 20 ms | **FAIL** |

The delivered report named a bounded remedy that does not reopen the renderer
architecture — *memoize stable `RenderableElement` identity so unchanged elements
do not re-render on each resize frame* — so this was never an accepted residual.

---

## B. The performance-path audit

§4 says do not guess, and a remedy named in a report is still a guess until the
cost is located. Two audits, structural and measured.

**Structural.** On each gesture frame the working document is replaced, so
`buildRenderableScene` re-validated it, rebuilt the element graph, resolved every
element's transform and bounds, and produced a hundred brand-new
`RenderableElement` values. Each of those reached `StudioStageElement` as a
changed prop, so all hundred SVG subtrees re-rendered to redraw the one under
the pointer.

**Measured**, in Node against the shipped `@embroidery/design-document` and
`@embroidery/design-engine` builds, 200 iterations after warm-up:

| scene | P01 validate | P01 quantize | build graph | P02 resolve + bounds, every element |
|---|---|---|---|---|
| 10 | 0.021 ms | 0.004 ms | 0.002 ms | 0.034 ms |
| 50 | 0.073 ms | 0.024 ms | 0.014 ms | 0.096 ms |
| 100 | 0.072 ms | 0.009 ms | 0.012 ms | 0.126 ms |

**≈ 0.2 ms of a 30 ms frame.** The frame was never geometry, and the named
remedy was the right one for a reason the report had not yet established.

---

## C. The chosen optimization

Two pieces, one idea: an element whose value did not change should keep the
object that already represents it.

**1. `renderer/studio-scene-identity.ts` (new, 152 lines).**
`shareDocumentIdentity(previous, next)` returns `next` with every unchanged
element represented by the previous instance — and returns `previous` itself
when nothing changed at all. It never edits a value: given two deep-equal
values, which instance comes back cannot be observed by any rule; given values
that differ anywhere, the new one is returned untouched.
`unchangedElementIds(previous, next, graph)` then names the ids whose *placed*
geometry cannot have changed.

**2. The adapter and the element component.** `buildRenderableScene` takes an
optional previous build and reuses a placed element only when it is in that set.
`StudioStageElement` is wrapped in `memo` with **no comparator** — React's
default shallow compare is exactly right, because everything the component
paints is reached through the one now-stable `renderable` object and `selected`
is the only other prop. A hand-written `areEqual` invites a list of "fields that
matter", and a field left off it is a stale element on the stage that nothing
reports.

The screen offers the previous build back through a ref. A discarded concurrent
render can leave a scene there that was never shown; that is harmless, because
reuse is decided by value equality, so the worst case is reusing an equal answer.

---

## D. Why the architecture and geometry authority are unchanged

- **One native SVG scene.** Verified in the browser at the L scene: `svgs = 1`,
  `elements = 100`. No hidden scene, no preview renderer, no second document.
- **No geometry bypass.** The adapter still calls `validateDesignDocumentStructure`
  on every build and still takes every matrix and bound from `APP3-P02`. Reuse
  skips *re-deriving* an answer; it never skips *asking* whether the document can
  be read, and it never substitutes an approximation.
- **No DOM measurement added.** No `getBoundingClientRect`, `getBBox`,
  `getScreenCTM` or `DOMMatrix` entered the feature — all four remain banned
  feature-wide by the S02 and S03 gates.
- **No React-external mutation.** Nothing writes an SVG attribute outside React.
- The engine-neutral document + renderer adapter boundary of `IMP-D026` and
  `ADR-APP0-001` is untouched. **The renderer architecture did not change.**

---

## E. Renderable / re-render identity proof

`apps/storefront/test/unit/studio-scene-identity.test.ts` (15 cases) asserts on
object identity, and on geometry, because a reused instance is only correct if
it is also the answer a full rebuild would have produced:

- a no-op frame returns the previous document object itself;
- an unchanged sibling keeps its instance; the changed one does not;
- the shared document is `toStrictEqual` the document it was given, always;
- **`reused.scene` is `toStrictEqual` a cold rebuild's scene** — twice, once for
  a sibling change and once for a group move;
- a reorder keeps instances and takes the new array order (paint order is
  z-order);
- a placement change shares nothing;
- a `visible`, `locked` or `opacity` change invalidates that element and no other.

`apps/storefront/test/components/studio-transform-render.test.tsx` (6 cases)
counts renders through a production call — `StudioStageElement` labels itself on
every render, so `elementLabel` calls *are* renders. No telemetry ships and the
seam cannot drift from what it measures. Across a real move, a real resize and a
real rotate gesture, **untouched siblings render 0 times** while the transformed
element updates; a refused candidate renders nothing; and a selection change
re-renders exactly the two elements whose selected state changed.

---

## F. Parent / descendant invalidation correctness

This is the failure mode that would have made the fix dangerous, and it is
guarded three ways.

`APP3-P02` composes ancestors outermost-first, so a grouped child whose own
record is untouched still *moves* when its group moves. Reuse keyed on element
id would repaint it at the group's old position — and would look perfect in
every ungrouped, single-element scene anyone would open by hand.

- **Code**: `unchangedElementIds` walks `graph.parentOf` and requires the whole
  chain, memoized per id, with a pre-seeded `false` so a malformed cycle
  terminates as *changed* rather than recursing. It never trusts P01's
  no-cycles guarantee.
- **Tests**: the child's own record is asserted to be the *same instance* while
  the child is asserted **not** reusable; the rebuilt scene matches a cold
  rebuild; an unrelated subtree stays reusable; and at the component level a
  moved group re-renders its descendant and not the unrelated element.
- **Gate**: `checkRenderReuse` fails if the chain walk or the ancestor
  reusability question disappears, and a mutation proves each.

---

## G. Semantic regression proof

Full storefront suite: **39 suites / 513 tests PASS** (was 37 / 492). The
delivered S03 and S02 suites are unmodified and still assert, unchanged: resize
persists as scale about the local-box centre; move is expressed in the parent
frame; rotation is clockwise about the untransformed centre; containment blocks
with no clamp; quantization precedes measurement; the millimetre read-out comes
from P02 bounds over `pxPerMm` and ignores zoom; there is no touch transform, no
autosave and no history; and there is exactly one `<svg>`.

Gates, all with their mutation suites:

| gate | rules | mutations |
|---|---|---|
| `check-app3-s01` | PASS | 51/51 |
| `check-app3-s02` | PASS | 55/55 + 9/9 evolution |
| `check-app3-s03` | PASS | 52/52 |
| `check-app3-s03` reuse (new) | PASS | **14/14** |
| `check-app3-s07` | PASS | 52/52 |
| `check-figma-design-index` | PASS | 165 IDs, 165 node rows |

---

## H. 400 % + pan browser proof

Real gateway, real Session, the **L** scene (100 elements), 1440×900 then 390.

| proof | result |
|---|---|
| move / resize / rotate at Fit | all change the persisted matrix |
| handles | 8, every one measured **44×44** on screen |
| 400 % | layer `matrix(4, 0, 0, 4, 0, 0)`; handles still **44×44** |
| element matrix across the zoom | **byte-identical** |
| mm read-out across the zoom | unchanged |
| pan at 400 % | layer `matrix(4, 0, 0, 4, -100, -48.6108)`; document matrix byte-identical |
| resize at 400 % + pan | works |
| Fit | layer back to `matrix(1, 0, 0, 1, 0, 0)`, zoom `100%`, document untouched |
| 5000 px drag (out of bounds) | matrix **byte-identical**, refusal stated in text |
| touch at 390 | move and resize both changed nothing |
| horizontal overflow | none — 1425 ≤ 1440, 375 ≤ 390 |
| **S03 API delta** | **0** |
| scene | one `<svg>`, 100 elements |

One console error came from the harness rather than the product: synthetic
`pointerdown` events carry a `pointerId` that is not an active pointer, so
`setPointerCapture` throws `NotFoundError`. A real pointer is always active at
`pointerdown`. The remaining entries are the dev favicon 404 and the Turbopack
HMR WebSocket, which the gateway does not proxy.

---

## I. Final Chromium matrix

| scene | gesture | p50 | p95 | max | frames > 20 ms | dropped |
|---|---|---|---|---|---|---|
| S (10) | move / resize / rotate | 16.7 | 16.7 | 16.8 | 0 | 0 |
| M (50) | move / resize / rotate | 16.7 | 16.7 | 16.8 | 0 | 0 |
| L (100) | move / resize / rotate | 16.7 | 16.7 | 16.8 | 0 | 0 |

Non-regressed against the delivered ≤ 16.8.

---

## J. Final WebKit matrix

| scene | gesture | p50 | p95 (delivered → now) | max | frames > 20 ms | dropped |
|---|---|---|---|---|---|---|
| S (10) | move | 16 | 16 → 16 | 17 | 0 | 0 |
| S | **resize** | 16 | 18 → **19** | 31 | 3 | 0 |
| S | rotate | 15 | 16 → 16 | 17 | 0 | 0 |
| M (50) | move | 16 | 16 → 16 | 17 | 0 | 0 |
| M | **resize** | 15 | **30 → 19** | 32 | 2 | 0 |
| M | rotate | 16 | 16 → 16 | 17 | 0 | 0 |
| L (100) | move | 16 | 16 → 17 | 31 | 3 | 0 |
| L | **resize** | 16 | **21 → 17** | 31 | 2 | 0 |
| L | rotate | 16 | 16 → 16 | 17 | 0 | 0 |

Stated without rounding in my favour: p95 is the budget and every p95 passes,
but two or three frames in a 60-frame WebKit gesture still land near 31 ms. None
exceeds 33.4 ms, so **no frame is dropped anywhere**, and the shape is a
gesture-startup cost rather than a per-element one — it appears at S as readily
as at L, and it is present on `move` too.

---

## K. Frozen 20 ms budget verdict

```text
budget = ADR-APP0-001 §6 — transform frame p95 <= 20 ms desktop (unchanged)

WebKit S resize = 19 ms   PASS
WebKit M resize = 19 ms   PASS   (was 30)
WebKit L resize = 17 ms   PASS   (was 21)

all 9 Chromium combinations   PASS
all 9 WebKit combinations     PASS
```

No budget was raised, no browser dropped, no scene size reduced, no validation
disabled, no renderer switched and no library installed. `M` was measured.
`L` is 100, `APP3-P01`'s own `maxElements`.

---

## L. APP0 benchmark regression

`spike:test` PASS — 2 suites / 29 tests. `spike:bench` PASS — 15 passed, 3
skipped. Node and DOM-node counts compared to HEAD across every engine (svg,
konva, fabric), project (desktop, mobile) and scene (S, M, L): **no difference
anywhere**; the SVG desktop drag frames are identical at p50 16.7 / p95 16.8 /
0 dropped. Only run-to-run noise in load and selection timings. Results restored
to HEAD after comparison; no APP0 evidence was rewritten.

---

## M. Tests, checkers and gates

**New tests** — `test/unit/studio-scene-identity.test.ts` (15),
`test/components/studio-transform-render.test.tsx` (6).

**New checker** — `tools/check-app3-s03-reuse.mjs` (117 lines), split by
responsibility because the runtime module it belongs beside is at 391 of 400
lines. Three rule groups: the reuse is present and **ancestor-aware**; the
element component is memoized with **no comparator**; and no
benchmark-shaped branch (user-agent test, scene-size threshold, environment flag,
skipped validation, "approximate") exists anywhere in the feature.

**New mutation suite** — `tools/check-app3-s03-reuse.test.mjs`, 14/14. Two of
them are the §12 regression that restores scene-wide churn on a one-element
resize, from both ends: the screen stops offering the previous build back, and
the element component loses its `memo`. Both leave a working editor.

**Evolved** — the S03 and S07 `useMemo` rules now assert the *dependency list*
rather than the exact call text, since `buildRenderableScene` gained a second
argument; the boundary suite names the new adapter-side file explicitly so the
S01 partition's document-authority prohibition stays strict everywhere else.

---

## N. Contract immutability

```text
OpenAPI              35 paths / 40 operations / 83 schemas   unchanged
generated client     tree hash d9aac2b3…                     unchanged
curated boundary     44/44 api-client tests                  unchanged
migrations           34                                       unchanged
root scripts         30                                       unchanged
API runtime / worker / database                               untouched
dependencies                                                  none added
```

Commit A audited: no file under `apps/api`, `packages/database`, `apps/worker`,
`packages/contracts/openapi` or `packages/api-client/src/generated`.

---

## O. Changed files and sizes

| file | lines | change |
|---|---|---|
| `renderer/studio-scene-identity.ts` | 152 | **new** |
| `renderer/studio-scene.ts` | 265 | previous build accepted, reuse applied |
| `components/studio-stage-screen.tsx` | 291 | memo ref; one document and graph published by the adapter |
| `components/studio-stage-element.tsx` | 226 | `memo`, no comparator |
| `test/unit/studio-scene-identity.test.ts` | 217 | **new** |
| `test/components/studio-transform-render.test.tsx` | 259 | **new** |
| `test/boundary/design-studio-source.test.ts` | 567 | new file partitioned; memo rule generalized |
| `tools/check-app3-s03-reuse.mjs` | 117 | **new** |
| `tools/check-app3-s03-reuse.test.mjs` | 193 | **new** |
| `tools/check-app3-s03.mjs` · `.sources` · `-runtime` | 315 / 152 / 391 | reuse rules wired; memo rule generalized |
| `tools/check-app3-s07-runtime.mjs` · `.test` | — | memo rule generalized |
| `tools/check-app3-s03.test.mjs` | 596 | mutation retargeted |
| `tools/app3-accepted-paths.mjs` | — | the correction status line |
| `tools/bench-app3-s03-fixtures.mjs` | 207 | fixture generation `0` → `1` |
| phase plan · `SCOPED_COMMAND_INDEX.md` | — | statuses and command rows |

Every source file is under the 400-line limit and every test file under 600.
`tools/check-file-size.mjs` still reports its 32 **pre-existing** violations;
no file this correction touched crosses a limit. `tools/check-spike-boundaries.mjs`
remains **pre-existing FAIL**, as `APP3-S02`, `S07` and `S03` each recorded.

---

## P. Commit A, clean tree, no push

```text
cfe3659  perf(storefront): close Studio transform WebKit budget
c46d56e  docs(app3): record APP3-S03 evidence
```

19 files. Commit A immediately precedes Commit B. Branch `production`, working
tree clean, **nothing pushed**.

Disclosed: Commit A was amended once, immediately after it was made and before
this report existed, because the first attempt used a PowerShell here-string in
a Bash shell and the literal `@` landed in the subject line. No reviewed history
was rewritten.

---

## Q. Roadmap

```text
APP3-S03-C1 = COMPLETE — REVIEW_DELIVERED
APP3-S03    = COMPLETE — CORRECTION_DELIVERED_FOR_REVIEW
APP3-S11    = NOT STARTED — BLOCKED_BY_APP3-S03_CORRECTION_REVIEW
APP3-S05    = NOT STARTED — BLOCKED_BY_APP3-S03_CORRECTION_REVIEW
```

Not self-accepted. After human acceptance, `APP3-S03` and `APP3-S03-C1` become
`REVIEW_ACCEPTED`, `APP3-S11` and `APP3-S05` become `READY — NOT STARTED`, and

```text
NEXT_RECOMMENDED_FRONTEND_CHECKPOINT = APP3-S05
```
