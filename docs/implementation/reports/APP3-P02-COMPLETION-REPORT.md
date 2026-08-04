# APP3-P02 — Completion Report (resumed)

**Checkpoint:** `APP3-P02` — Production design-engine geometry foundation
**Date:** 2026-08-04
**Branch:** `production`
**Entry HEAD:** `b030c9f` (`docs(app3): record APP3-G05 correction evidence`)
**Commit A:** `56b57b84809116368d4200a94285bdb5d29b1a84`
**Directive:** CLAUDE MANUAL INTERVENTION RESUME DIRECTIVE — APP3-P02

---

## 1. First attempt and its resolution

The first `APP3-P02` execution stopped at `FAILED — MANUAL INTERVENTION
REQUIRED`, cause `GEOMETRY_SEMANTICS_NOT_AUTHORIZED_AND_SPIKE_DIVERGENT`. It
wrote nothing, changed nothing and committed nothing.

`APP3-G05` and `APP3-G05-C1` supplied the contract and are accepted. Both gates
were re-run at entry and again after implementation:

```text
node tools/check-app3-g05.mjs → PASS
node tools/check-app3-p01.mjs → PASS
```

Nothing about the P02 contract changed. This is a resumption: no other geometry
model was considered, no ruling was softened, and no renderer default was
consulted.

**Package inventory before implementation:** `src/index.ts` was `export {}`;
`package.json` declared only `lint` and `typecheck` — no `test`, no `build`, no
`exports` map and **no dependencies at all**, so even the design-document link
had to be added.

---

## 2. Coordinate and matrix authority

Implemented exactly as `IMP-D045` PO-01, PO-03, PO-04 and PO-05 lock it.

| Fact | Implementation |
|---|---|
| Origin, axes, unit | top-left, x right, **y down**, degrees |
| Positive rotation | **clockwise** — `a = cos, b = sin, c = -sin, d = cos` |
| Rotation pivot | untransformed local-box centre |
| Scale pivot | the same centre |
| Order | **scale before rotation** |
| Convention | column-vector, `x' = a*x + c*y + e`, `y' = b*x + d*y + f` |
| Local matrix | `T(x + w/2, y + h/2) × R(rotationDeg) × S(scaleX, scaleY) × T(-w/2, -h/2)` |
| Composition | **parent outermost** over a root-first chain |
| Singular inverse | `undefined`, threshold `1e-12`, **inversion only** |

The rotation-direction test is the one that pins two rulings at once: under
y-down, that matrix turns `(1, 0)` toward `+y`, which is downward on screen and
therefore clockwise. Under y-up the identical matrix would turn the other way.

Composition is asserted with a worked vector rather than a shape check: a group
rotated 90° about its own centre, containing a child at group-local `(0,0)`,
puts that child at `(75, -25)`. Under `child × parent` it would not.

---

## 3. Local drawable envelopes

`APP3-G05-C1`'s stroke rules, implemented per kind:

| Kind | Local path | Fixed v1 semantics | Envelope |
|---|---|---|---|
| `text`, `image` | declared box | — | declared box, **unexpanded** |
| `rectangle` | boundary of `(0,0)`–`(w,h)` | `miter`, `miterLimit 4` | box ± `s/2` |
| `ellipse` | inscribed in the declared box | — | box ± `s/2`, never the tight rotated AABB |
| `line` | straight `(0,0)` → `(w,h)` | round cap, round join | endpoint AABB ± `s/2` |
| `freehand` | element-local straight polyline | round cap, round join | polyline AABB ± `s/2` |
| `group` | none | — | `undefined` — no visible geometry |

`s = strokeWidthPx`; `s = 0` expands nothing. A one-point freehand falls out of
the same rule as a round dot of radius `s/2`, which is what the ruling describes
rather than a special case bolted on. `lineCap`, `lineJoin` and `miterLimit` are
exported **constants of the schema version**; nothing reads them from a document.

---

## 4. Transformed bounds

```text
1. derive the exact local drawable envelope (stroke included)
2. transform ITS four corners with the full effective matrix
3. take the document-space min/max
4. quantize through P01 authority
```

The order is load-bearing and has its own worked test: a 100×50 box with an 8 px
stroke at 3× scale reaches `minX = -112`. Adding an unscaled half-stroke after
the transform would have given `-104` — short by exactly the scaled part of the
stroke, which is the part that matters most.

Group bounds are the union of descendant AABBs, **never** the group's persisted
box (its local frame and pivot, PO-07); the test scene gives the group a 100×50
box whose descendants span only 50×50, so the two are distinguishable. Document
bounds union every drawable element. Hidden and locked elements count; z-order
does not affect anything. `visibleOnly` exists as an explicit caller option for
drawing an outline and is never consulted by validation.

---

## 5. Placement, units and containment

**Reconciliation** compares a P01 placement snapshot with caller-supplied
Product Side and Embroidery Area authority — package-owned plain types, no
database import. Numeric comparison is exact **after quantizing both sides**;
one quantized unit apart is a mismatch and anything finer is not. A mismatch is
reported and **never** substituted into the document.

**Placement modes.** `NEW_EDITING` refuses a retired side or area;
`HISTORICAL_RENDER` accepts the exact rows an existing document already
references while still checking every geometric value. Nothing reads
`supersededById`, so a historical document cannot be silently re-pointed at a
replacement.

**px↔mm** uses Product Side `pxPerMm` and nothing else. There is no DPI constant
and no area-derived ratio; a test asserts `pxToMm(96, 5)` is `19.2`, not the
`25.4` a 96-DPI assumption would produce. Zero length is allowed, negative is
rejected. Consistency requires **both** axes to equal `pxPerMm`; a side implying
6 and 4 produces **two** findings rather than an average of 5.

**Containment** is blocking, boundary-inclusive and stroke-aware over the
complete transformed AABB. The `APP3-G05-C1` regression is explicit: a rectangle
whose fill sits exactly on the boundary passes with `strokeWidthPx = 0` and fails
with `strokeWidthPx = 4`. Group findings name the **offending descendant**, and a
child that fits alone still fails when its group pushes it out.

**Physical size** uses the same stroke-aware bounds. A 400×300 px box at 5 px/mm
is exactly 80 × 60 mm and passes; `400.0005` px fails; adding a 4 px stroke to
the exact-fit box also fails. Nothing infers stitch density or feasibility.

Nothing mutates. Every failing case asserts the document is byte-identical
afterwards, because "clamp it into the area" is the tempting fix and PO-09
forbids it.

---

## 6. Safe failure when called directly

`APP3-P01` rejects cyclic groups, duplicate ids and non-finite numbers — but this
package is callable without it, so every entry point degrades to a typed finding
rather than a throw or an unbounded walk:

| Input | Result |
|---|---|
| unknown element id | `UNKNOWN_ELEMENT` |
| unresolvable or cyclic parent | `INVALID_PARENT_CHAIN` (parent walk is depth-bounded at 32) |
| negative stroke, non-finite size or point | `INVALID_GEOMETRY` |
| singular matrix | `invertMatrix` returns `undefined`; `SINGULAR_TRANSFORM` is available to callers |
| two groups claiming one child | first parent wins, deterministically |

---

## 7. Public API

Geometry values and helpers; matrix primitives; the quantization bridge; element
graph and effective transforms; local envelopes with the fixed stroke constants;
element, group and document bounds plus box helpers; placement reconciliation and
its authority types and modes; px↔mm conversion and scale consistency;
containment and physical-size validation; typed findings.

Not exported: nothing internal — there are no traversal caches, and the graph
index is built and passed explicitly rather than memoized in module state.

---

## 8. Changed files

**Commit A — 32 files, +3 848 / −47**

| Area | Files |
|---|---|
| Geometry | `geometry/types.ts`, `geometry/matrix.ts`, `geometry/quantized.ts` |
| Transforms | `transforms/graph.ts` |
| Bounds | `bounds/envelope.ts`, `bounds/bounds.ts` |
| Placement | `placement/authority.ts`, `placement/units.ts` |
| Containment | `containment/area.ts` |
| Findings | `findings/finding.ts` |
| Root | `src/index.ts` |
| Tests | 6 `*.spec.ts` + `testing/fixtures.ts` |
| Package config | `package.json`, `tsconfig.json`, `tsconfig.build.json`, `jest.config.mjs` |
| Gate | `tools/check-app3-p02.mjs`, `tools/check-app3-p02.test.mjs` |
| G05 gate (deviation, §9) | `tools/check-app3-g05.mjs`, `.test.mjs` |
| Docs | phase §6.12 + statuses, roadmap, matrix, source map, command index |
| Lockfile | `pnpm-lock.yaml` |

Nothing under `packages/design-document/src`, `packages/database`,
`packages/persistence`, `packages/object-storage`, `packages/styles`, `apps/**`,
`docs/design/**`, `spikes/**` or `infrastructure/**`. No root `package.json`
change, no OpenAPI artifact, no generated client, no worker.

**Lockfile:** +19 lines, **zero `resolution:` entries**. The importer block for
this workspace records the `@embroidery/design-document` workspace link plus
`jest`, `ts-jest`, `rimraf`, `@types/jest` and `@types/node` at the versions
`packages/database`, `packages/persistence` and `packages/design-document`
already use. No new external dependency; this is the mechanical wiring §20
permits.

---

## 9. Deviation: the G05 gate became mode-aware

`tools/check-app3-g05.mjs` and its tests are outside §20's allowed list. They had
to change, and the change is a strengthening.

G05 asserted `packages/design-engine/src/index.ts` was an empty stub — correct
while G05 was the authority gate, and **false the moment P02 legitimately
implemented it**. Left alone, the required `node tools/check-app3-g05.mjs` would
have failed.

It now accepts exactly **two consistent worlds** and refuses every mixture, the
same pattern `APP3-G04` established and `APP3-F01` needed at `APP3-P01`:

| World | Phase plan | Engine |
|---|---|---|
| not started | blocks P02 on G05 review | empty stub |
| delivered | records P02 complete | implemented |

A plan claiming delivery over a stub fails; a stub-less engine under a blocking
plan fails. Its suite grew 75 → **76**, with the not-started world now the
simulated one. The failure cause and the spike-evidence classification are
asserted in **both** worlds, because they are why `IMP-D045` exists at all.

---

## 10. Checker behaviour

`tools/check-app3-p02.mjs` (383 lines) verifies all eighteen ruled properties.
Its design choice worth naming: it asserts **semantics, not the presence of a
function**. A `getElementBounds` that silently switched to the untransformed box
would still export the right name, so the gate checks the rotation coefficients,
the `T × R × S × T` order, the `.reverse()` that makes composition
parent-outermost, `boundsCorners(envelope)` rather than the declared box, the
fixed cap/join constants, `drawableDescendants(` as a **call** rather than an
identifier an unused import would satisfy, and the absence of any epsilon, DPI
constant or restated quantization scale.

It also reads `packages/design-document/src` to prove no geometry leaked back
into the document package.

Two crude-scan defects were found and fixed while building it, both the same
family as earlier gates: comment text tripping a token scan (fixed by stripping
comments with `(^|[^:])//` so a URL survives), and an identifier check that an
unused import satisfied.

---

## 11. Test matrix

**Package — 118 tests, 6 suites, all passing.**

| Suite | Tests | Covers |
|---|---|---|
| `geometry/matrix.spec.ts` | 21 | identity, translation, clockwise rotation, centre pivot, scale-before-rotation, worked local-matrix vectors, composition order and associativity, inverse round-trip, singular failure, purity, determinism, non-finite rejection |
| `transforms/graph.spec.ts` | 13 | root in document space, group-local children, parent-outermost worked vector, nesting to depth 8, order independence, unknown element, missing parent, cycle, two-parent determinism, no rewrite or flatten, drawable sets, z-order independence |
| `bounds/bounds.spec.ts` | 24 | every local envelope including zero stroke, one-point dot and unusable geometry; translate, rotate, scale, reflect; stroke transformed not added; conservatism under non-uniform scale; group and document unions; hidden/locked inclusion and the explicit `visibleOnly` option; z-order independence; box helpers |
| `placement/placement.spec.ts` | 24 | exact match, each id and numeric mismatch, area-parent mismatch, quantized comparison, no substitution, both modes, no supersession, px↔mm both ways, grid stability, zero and negative lengths, no DPI, per-axis consistency, both-axes reporting |
| `containment/area.spec.ts` | 22 | inside, each boundary touched and crossed, rotated and scaled overhang, stroke-only overhang for all four stroked kinds, hidden/locked, offending descendant, group transform, no mutation, finding safety, physical-size boundaries and one unit over, stroke-aware sizing, no stitch inference |
| `architecture.spec.ts` | 14 | import allow-list, no deep import, no framework/renderer/database/spike, no Node built-in or DOM, no duplicated quantization or canonicalization/hash/font, no snapping or interaction, no API/worker/UI, no mutation helpers, no global mutable state, file sizes |

**Checkers:** `check-app3-p02.test.mjs` **34/34**; `check-app3-g05.test.mjs`
**76/76**.

---

## 12. Scoped validation

`pnpm quality` was **not** run. No root script was added.

| Command | Result |
|---|---|
| `pnpm --filter @embroidery/design-engine test` | **118/118**, 6/6 suites |
| `pnpm --filter @embroidery/design-engine typecheck` | **PASS** |
| `pnpm --filter @embroidery/design-engine build` | **PASS** — emits `dist/` with declarations |
| `node tools/check-app3-p02.mjs` | **PASS** |
| `node --test tools/check-app3-p02.test.mjs` | **34/34** |
| `pnpm --filter @embroidery/design-document test` | **162/162**, 9/9 suites |
| `pnpm --filter @embroidery/design-document typecheck` | **PASS** |
| `node tools/check-app3-p01.mjs` | **PASS** |
| `node tools/check-app3-g05.mjs` | **PASS** |
| `node tools/check-app3-g01.mjs` | **PASS** |
| `node tools/check-app3-db01.mjs` | **PASS** |
| `pnpm format:check` | **PASS** |
| `pnpm lint` | **PASS** — 22/22 tasks |
| `git diff --check` | **clean** |

The design-document suite was in scope because P02 imports its public types and
quantization API and must not force a regression there; G01/DB01 because
containment and physical scale bind their placement authority. API, worker,
database suite, root tests, E2E, smoke, OpenAPI, Figma, spike and
full-regression suites were not run — no owned input of any changed. Nothing was
backgrounded and nothing was polled.

### Line counts

| File | Lines | Limit |
|---|---|---|
| `src/bounds/bounds.ts` | 192 | ≤ 400 |
| `src/geometry/matrix.ts` | 190 | ≤ 400 |
| `src/containment/area.ts` | 166 | ≤ 400 |
| `src/transforms/graph.ts` | 165 | ≤ 400 |
| every other production file | ≤ 148 | ≤ 400 |
| `src/bounds/bounds.spec.ts` | 277 | ≤ 600 |
| every other test file | ≤ 254 | ≤ 600 |
| `tools/check-app3-p02.mjs` | 383 | ≤ 400 |
| `tools/check-app3-p02.test.mjs` | 352 | ≤ 600 |
| `tools/check-app3-g05.mjs` | 311 | ≤ 400 |
| `tools/check-app3-g05.test.mjs` | 609 → 600 | ≤ 600 |

The G05 test file passed 600 after the two-world block was added and was brought
back by tightening its header — no case was dropped, and the authorized second
test file was not needed.

---

## 13. Status

```text
APP3-P01 = COMPLETE — REVIEW_ACCEPTED
APP3-G05 = COMPLETE — REVIEW_ACCEPTED
APP3-G05-C1 = COMPLETE — REVIEW_ACCEPTED
APP3-P02 = COMPLETE — REVIEW_DELIVERED

APP3-B03 = READY — NOT STARTED
APP3-B04 = BLOCKED_BY_APP3-B06
APP3-B05 = READY_BY_P01 — BLOCKED_BY_APP3-B04
APP3-B06 = READY — NOT STARTED
APP3-B07 = READY_BY_P01_AND_P02 — NOT STARTED
APP3-B08 = READY_BY_P01_AND_P02 — NOT STARTED
APP3-S11 = FOUNDATION_READY_BY_P01_AND_P02 — NOT STARTED

APP3 =
IN PROGRESS — GEOMETRY FOUNDATION DELIVERED_FOR_REVIEW
```

No downstream checkpoint is complete. Human review owns
`APP3-P02 = COMPLETE — REVIEW_ACCEPTED`.

---

## 14. Confirmations

- **Commit A:** `56b57b84809116368d4200a94285bdb5d29b1a84`.
- **Working tree clean** after Commit A; Commit B adds only this report.
- **Nothing pushed.** `origin/production` remains at `8b5f3b0`.
- **No renderer**: no React, Next, NestJS, Konva, Fabric, interact.js, DOM,
  canvas or SVG code, and no spike import.
- **No `packages/design-document` source change** — only its public root is
  imported, and the gate proves no geometry leaked into it.
- **No database, migration, persistence, object-storage, API, OpenAPI,
  generated-client, worker, Figma or UI change.**
- **No `IMP-D045` or P01 v1 change** — the ruling was implemented, not amended,
  and the §25 stop condition did not fire.
- **No root `package.json` script**; no new external dependency; the lockfile
  records existing workspace versions only.
- **`pnpm quality` not run**; no repository-wide aggregate validation.
- **No credential read, written, echoed or rotated;** `.env` untouched.
