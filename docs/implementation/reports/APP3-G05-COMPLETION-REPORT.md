# APP3-G05 — Completion Report

**Checkpoint:** `APP3-G05` — Geometry coordinate, transform and bounds authority
**Date:** 2026-08-04
**Branch:** `production`
**Entry HEAD:** `5827213` (`docs(app3): record APP3-P01 correction evidence`)
**Commit A:** `c07f740f5abd0cd78fe3efab03e61403586c4e33`
**Directive:** CLAUDE MANUAL INTERVENTION DIRECTIVE — APP3-G05

---

## 1. Why this checkpoint exists

`APP3-P02`'s first execution stopped:

```text
APP3-P02 = FAILED — MANUAL INTERVENTION REQUIRED
```

No implementation was written, no file was changed, no commit was created, the
tree stayed clean and nothing was pushed.

An exhaustive sweep of `docs/` for rotation origin, rotation direction, scale
origin, transform composition order, parent/child coordinate frames and
clockwise/anticlockwise returned **zero** statements. `ADR-APP0-001` §5 says only
that geometry "lives outside components"; its Deferred Details assign *ownership*
of geometry helpers to `APP3-S02` and never state the model.
`05-DESIGN-STUDIO-SPEC.md` lists "Rotate" and "Coordinate mapping" without
semantics. P01's `elements.ts` explicitly defers: *"composing them, rotating a
box or asking whether it lands inside the embroidery area is
`packages/design-engine` (`APP3-P02`)."*

### 1.1 The spike divergence

The only executable source is the APP0-R01 spike — the ADR's formal Evidence —
and its three adapters implement three different geometries:

| Adapter | Rotation / scale pivot | Group transform applied to children |
|---|---|---|
| **SVG** `adapters/svg/scene.tsx:24` | **box centre** — `rotate(θ cx cy) translate(cx cy) scale(sx sy) translate(-cx -cy)`, `cx = x + w/2` | **all of it** — children nest inside the group's `<g transform>` |
| **Konva** `adapters/konva/scene.tsx:22` | **top-left** — `x, y, rotation, scaleX/Y` with **no** `offsetX`/`offsetY`, so Konva pivots on `(x, y)` | **scale and opacity only** — `<Group {...shared} x={0} y={0} rotation={0}>` zeroes translation and rotation |
| **Fabric** `adapters/fabric/objects.ts:25,112` | **top-left** — `left, top, angle` with no `originX`/`originY` override, so Fabric's `'left'/'top'` defaults pivot on the corner | **none** — `new Group([], …)` is empty; children stay independent |

The scene fixtures rotate (`rotationDeg: round(random()*30) - 15`), so this is not
a dormant difference: any rotated element lands in a different place under each.

### 1.2 Why the identical hash did not settle it

`sha256:d6be2ccb…` matched across all three engines, both platforms and five
runs — but the hash is over the **document**, which stores `x`, `y`,
`rotationDeg` regardless of how each renderer interprets them. It proves
**serialization** agreement, not geometric agreement.

APP0-R01 in fact recorded the opposite of a settled model, in §E: *"Fabric
geometry divergence — an imported SVG group's Fabric layout origin does not match
the document box, so the document box centre is not a reliable hit point. Hit
testing must be asked of the engine, never derived from document geometry."* That
is the accepted report declining to make engine geometry a document-level fact.

### 1.3 Why it had to be ruled, not inferred

A v1 Design Document stores `x`, `y`, `rotationDeg`, `scaleX`, `scaleY` and
**carries no pivot or composition marker**. If an implementation picked
centre-pivot and a later one picked corner-pivot, every stored design would
silently relocate — and its SHA-256 would stay valid, because the bytes never
changed. `ADR-DB1-012` binds approvals to that hash, so the one mechanism that
normally catches a semantic change is structurally blind to this one. The
convention had to become authority before any document is persisted; it cannot be
corrected afterwards. PO-12 exists to make that class of change impossible to
ship quietly.

---

## 2. IMP-D045 — the twelve rulings

Created exactly once, `LOCKED`, in
`docs/implementation/14-IMPLEMENTATION-DECISION-REGISTER.md`, and recorded in
phase §6.11. The model is **independent of SVG, Konva and Fabric defaults**; it
happens to agree with the SVG adapter on pivot and inheritance, but it is locked
because the Product Owner ruled it. `IMP-D026` keeps native SVG as the renderer
architecture, and the renderer now **implements** IMP-D045 rather than defining
it.

| Ruling | Locks |
|---|---|
| **PO-01** coordinate system | top-left origin, x right, **y down**, degrees; no y-up or centre-origin reinterpretation of v1 |
| **PO-02** persisted transform meaning | `x`/`y` = untransformed local-box top-left **in the parent frame**; `width`/`height` = positive unscaled dimensions; local coordinates `(0,0)`→`(width,height)`; root parent frame = document space, child parent frame = direct group local space |
| **PO-03** rotation | positive `rotationDeg` **clockwise**; pivot = untransformed local-box centre `(width/2, height/2)`; never the corner, document origin, group origin, transformed-AABB centre or a renderer default |
| **PO-04** scale | same centre pivot as rotation; **scale applied before rotation**; negative scale = reflection about that centre where P01 accepts it; never alters persisted `x`/`y`/`width`/`height`; P02 never mutates a document |
| **PO-05** local matrix | column-vector `p' = M x p`; `x' = a*x + c*y + e`, `y' = b*x + d*y + f`; `Mlocal = T(x + w/2, y + h/2) x R_clockwise(rotationDeg) x S(scaleX, scaleY) x T(-w/2, -h/2)`; under y-down `a = cos, b = sin, c = -sin, d = cos` |
| **PO-06** group coordinate semantics | a group defines a **real local frame**; children carry group-local `x`/`y`; composition is **parent outermost** — `Meffective(child) = Meffective(parent) x Mlocal(child)` |
| **PO-07** group frame and bounds | the group's persisted box is **local frame and pivot only**, never bounds, never recomputed from descendants; group bounds are the union of transformed descendant bounds; P02 never rebases children |
| **PO-08** bounds strategy | `CONSERVATIVE_TRANSFORMED_AABB`; four local corners through the effective matrix; ellipse deliberately uses its declared box; line/freehand expand by `strokeWidthPx / 2`; no cap/join extension, smoothing or Bezier geometry; group and document are unions; hidden and locked elements count; z-order is irrelevant |
| **PO-09** containment | **blocking**, full transformed AABB inside the area, boundary equality valid, any overhang invalid, no clamp/translate/rotate/scale-down/snap/warn-but-persist; write APIs treat a finding as a validation failure |
| **PO-10** physical scale authority | `product_sides.px_per_mm` is the **sole** source; no Area ratio, no CSS/96/image DPI, no spike `mmPerPx`; area maxima are physical limits; both axes must equal `px_per_mm` and disagreement is a typed mismatch, never averaged |
| **PO-11** historical rows | retired placement is `NOT_SELECTABLE` for `NEW_EDITING` and **valid** for `HISTORICAL_RENDER`; retirement is never deletion; no silent move to `superseded_by_id` |
| **PO-12** integrity consequence | the semantics are part of the meaning of `schemaVersion = 1`; changing pivot, rotation direction, scale origin, group frame, composition order, bounds strategy, containment strategy or `pxPerMm` source is a **schema-semantic change** needing a new decision, a schema-version increase, a migration and a new approval/rendering contract; `G05_DB_CONTRIBUTION = NONE` |

### 2.1 The exact local matrix

```text
Mlocal = T(x + width/2, y + height/2)
       x R_clockwise(rotationDeg)
       x S(scaleX, scaleY)
       x T(-width/2, -height/2)
```

Read right to left on a column vector: translate the local box so its centre sits
at the origin, scale, rotate, then translate the centre into place in the parent
frame. Scale and rotation are never swapped, and row-vector semantics are
forbidden.

### 2.2 The exact composition

```text
Meffective(root)       = Mlocal(root)
Meffective(child)      = Meffective(parent group) x Mlocal(child)
Meffective(descendant) = Mlocal(root group) x Mlocal(next group) x … x Mlocal(descendant)
```

Parent outermost. `child x parent`, document-space children inside a group,
partial or scale-only inheritance and renderer-owned grouping are all forbidden.

### 2.3 Why the bounds strategy is named "conservative"

`CONSERVATIVE_TRANSFORMED_AABB` is a production safety choice, not path-accurate
geometry, and PO-08 says so in as many words so no later checkpoint can claim
otherwise. It may reject a design whose visible pixels fit while its declared box
does not — accepted for v1 because the alternative is renderer-specific
disagreement about whether a stitch clips, and a rejected design is recoverable
while a clipped garment is not.

---

## 3. Reconciliation with P01 v1 — no schema change needed

The §21 stop condition did not fire. Every ruling is expressible against the
committed v1 types without touching the schema:

| Ruling | P01 v1 field it interprets |
|---|---|
| PO-02/03/04/05 | `transform { x, y, width, height, rotationDeg, scaleX, scaleY }` |
| PO-06/07 | `GroupElement.childIds` plus the group's own `transform` |
| PO-08 line/freehand | `ShapeElement.strokeWidthPx`, `FreehandElement.points` / `strokeWidthPx` |
| PO-10 | caller-supplied Product Side authority (DB01 `px_per_mm`) |
| PO-11 | DB01 `retired_at` / `superseded_by_id` |

**One observation recorded rather than resolved.** PO-08 places `rectangle` and
`ellipse` in the box-based group with **no** stroke expansion, while `line` and
`freehand` expand by `strokeWidthPx / 2` — yet P01 gives `rectangle` and
`ellipse` a `strokeWidthPx` too. A thick-stroked rectangle can therefore paint
slightly outside its declared AABB and pass containment. I implemented and
recorded the ruling exactly as written rather than "fixing" it; whether that
asymmetry is intended is a Product Owner question, not an implementer's.

**A second observation.** P01's `line` is a `ShapeKind` defined solely by its
transform box — it has no endpoints — so "the local point/path bounds defined by
the production P01 shape" is, for a line in v1, the declared box plus the stroke
expansion. Recorded so no later checkpoint reads PO-08 as authorising endpoint
geometry that v1 does not store.

---

## 4. Changed files

**Commit A — 12 files, +1 117 / −7**

| File | Change |
|---|---|
| `docs/implementation/phases/APP3-DESIGN-TEMPLATES-AND-STUDIO.md` | new §6.11 (facts, twelve rulings, spike-divergence record, dependency reconciliation); §10 statuses |
| `docs/implementation/14-IMPLEMENTATION-DECISION-REGISTER.md` | `IMP-D045`, `LOCKED` |
| `docs/implementation/10-MASTER-APPLICATION-ROADMAP.md` | APP3 status + G05 record |
| `docs/implementation/11-TRACEABILITY-AND-STATUS-MATRIX.md` | G05 record |
| `docs/implementation/13-PHASE-SOURCE-MAP.md` | geometry semantics as APP3-owned authority; spike adapters as research |
| `docs/implementation/audits/APP3_PRE_IMPLEMENTATION_AUDIT.md` | forward note: the audit routed *ownership* of geometry helpers but nothing defined the model |
| `docs/implementation/SCOPED_COMMAND_INDEX.md` | `CMD-CHECK-APP3-G05`, `CMD-TEST-APP3-G05` |
| `docs/05-DESIGN-STUDIO-SPEC.md` | forward note on §6 Physical measurement pointing at the locked model and `px_per_mm` |
| `docs/10-NON-FUNCTIONAL-REQUIREMENTS.md` | §5 Data integrity: geometry semantics belong to `schemaVersion = 1` |
| `tools/check-app3-g05.mjs` | new — 247 lines |
| `tools/check-app3-g05-transform.mjs` | new — 124 lines |
| `tools/check-app3-g05.test.mjs` | new — 431 lines |

Untouched: `packages/design-engine/**` (still `export {}`),
`packages/design-document/**`, `packages/database/**`, `apps/**`, root and
workspace `package.json`, `pnpm-lock.yaml`, OpenAPI, generated client, worker,
`docs/design/**`, Figma, `spikes/**`, `infrastructure/**`. No dependency added.
`APP0-R01`, `APP3-P01` and `APP3-P01-C1` historical evidence was not rewritten.

---

## 5. Checker behaviour

`check-app3-g05.mjs` owns the bounds, containment, scale-authority,
placement-mode and integrity halves; `check-app3-g05-transform.mjs` owns the
coordinate, transform, matrix and group halves. The split exists because the fact
set is large, not to build a framework.

Together they verify all twenty ruled properties: `IMP-D045` present exactly once
as a register row and `LOCKED`, all twelve rulings in **both** the register row
and the bounded phase section, every fact in §6.11.1 as an **exact string**, ten
transform prose claims and twelve geometry prose claims, `design-engine` still an
empty stub, `APP3-P02` blocked with its failure cause recorded and not marked
complete, the spike adapters still classified as research evidence, and — by
chaining `checkApp3P01`, which chains F01/DB01 → G04 → G03 → G02 → G01 — the whole
accepted entry authority.

Two design choices are deliberate:

1. **Exact-string, not substring.** A fact that only has to be "mentioned" can be
   softened without failing. Every value is compared with `!==`.
2. **The forbidden alternatives are asserted too.** It is not enough that the
   ruling says *centre*; `Forbidden rotation pivots` and `Forbidden group
   inheritance` must still name the corner, the renderer default, `child x
   parent` and scale-only inheritance. A ruling that quietly drops its
   prohibitions is half-repealed.

Prose claims are matched **whitespace-collapsed**, so a claim spanning a Markdown
line wrap is still found — the defect `APP3-G01` hit with per-line matching.

**One bug found and fixed while building the tests.** The first version of the
test helper rewrote a fact by first-match across the whole phase file, and
§6.10.1 (P01) already owned a key named `Quantization authority`. The helper was
therefore editing P01's row while asserting G05's — a test that passes while
proving nothing. The helper is now scoped to §6.11.1, and the G05 key was renamed
`Geometry quantization authority` so the collision cannot recur.

---

## 6. Test matrix

`tools/check-app3-g05.test.mjs` — **50 / 50 pass**.

| Group | Cases | Covers |
|---|---|---|
| Baseline | 2 | committed repository and throwaway copy both clean |
| Coordinate, rotation, scale | 6 | pivot to corner, anticlockwise rotation, divergent scale pivot, scale after rotation, y-up, centre-origin |
| Matrix contract | 4 | reversed order, row-vector, anticlockwise matrix under y-down, dropped prose formula |
| Group semantics | 6 | document-space children, `child x parent`, partial inheritance, dynamic group pivot, group box as bounds, automatic rebasing |
| Bounds strategy | 5 | path-accurate/renderer/tight substitutes, ellipse strategy change, invented cap/join, altered stroke expansion, hidden/locked exemption |
| Containment | 5 | untransformed box, boundary equality invalid, advisory-only, clamping, dropped blocking prose |
| Physical scale | 4 | 96/CSS/image DPI, area-derived scale, averaged axes, area maxima as conversion |
| Placement modes and integrity | 7 | historical render forbidden, retired row selectable, retirement as deletion, semantic change as refactor, unbound from v1, a G05 database contribution, a second quantization precision |
| The decision itself | 5 | missing, duplicated, unlocked, ruling missing from the register row, ruling missing from the phase section |
| No implementation | 6 | geometry shipped in the stub, P02 unblocked, P02 marked complete, forgotten failure cause, spike promoted to authority, chained entry-authority regression |

No geometry is executed; `IMP-D045` is a decision and this file guards the
decision.

---

## 7. Scoped validation

`pnpm quality` was **not** run. No root script was added.

| Command | Result |
|---|---|
| `node tools/check-app3-g05.mjs` | **PASS** |
| `node --test tools/check-app3-g05.test.mjs` | **50 / 50** |
| `node tools/check-app3-p01.mjs` | **PASS** |
| `node tools/check-app3-g01.mjs` | **PASS** |
| `node tools/check-app3-db01.mjs` | **PASS** |
| `pnpm format:check` | **PASS** |
| `pnpm lint` | **PASS** — 21 / 21 tasks |
| `git diff --check` | **clean** |

P01 was in scope because G05 binds the semantic interpretation of its v1
transform fields without changing its source; G01/DB01 because G05 binds
placement and `pxPerMm` authority that originates there. P02 package tests, API,
worker, database suite, root tests, E2E, smoke, OpenAPI, Figma, spike and
full-regression suites were not run — no owned input of any changed. Nothing was
backgrounded and nothing was polled.

### Line counts

| File | Lines | Limit |
|---|---|---|
| `tools/check-app3-g05.mjs` | 247 | ≤ 400 |
| `tools/check-app3-g05-transform.mjs` | 124 | ≤ 400 |
| `tools/check-app3-g05.test.mjs` | 431 | ≤ 600 |

---

## 8. Status

```text
APP3-G05 =
COMPLETE — REVIEW_DELIVERED

APP3-P02 =
BLOCKED_BY_APP3-G05_REVIEW_ACCEPTANCE

APP3-P02 FIRST_ATTEMPT =
FAILED — MANUAL_INTERVENTION_REQUIRED

CAUSE =
GEOMETRY_SEMANTICS_NOT_AUTHORIZED_AND_SPIKE_DIVERGENT

RESOLUTION =
APP3-G05

APP3-P01 =
COMPLETE — REVIEW_ACCEPTED

APP3 =
IN PROGRESS — GEOMETRY AUTHORITY DELIVERED_FOR_REVIEW
```

On human acceptance, `APP3-P02` becomes
`READY_FOR_MANUAL_INTERVENTION_RESUME`.

Human review owns `APP3-G05 = COMPLETE — REVIEW_ACCEPTED`.

---

## 9. Confirmations

- **Commit A:** `c07f740f5abd0cd78fe3efab03e61403586c4e33`.
- **Working tree clean** after Commit A; Commit B adds only this report.
- **Nothing pushed.** `origin/production` remains at `8b5f3b0`.
- **No `APP3-P02` resumption**: `packages/design-engine/src/index.ts` is still
  `export {}`, and the gate asserts it.
- **No geometry implementation**, no package source, no renderer, no interaction
  or snapping code.
- **No `packages/design-document/**` change**, no `packages/database/**` change,
  no schema, no migration, no database column.
- **No API, OpenAPI, generated-client, worker, Figma or UI change.**
- **No new decision beyond `IMP-D045`**, which is the one this directive ordered.
- **No root `package.json` script**, no workspace manifest change, no
  `pnpm-lock.yaml` change, no new dependency.
- **`pnpm quality` not run**; no repository-wide aggregate validation.
- **No credential read, written, echoed or rotated;** `.env` untouched.
