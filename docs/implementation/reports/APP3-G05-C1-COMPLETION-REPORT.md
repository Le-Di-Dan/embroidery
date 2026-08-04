# APP3-G05-C1 — Correction Report

**Checkpoint:** `APP3-G05-C1` — Complete stroke and line geometry authority
**Date:** 2026-08-04
**Branch:** `production`
**Entry HEAD:** `087a8dc` (`docs(app3): record APP3-G05 evidence`)
**Commit A:** `3e930cc7414358d9edd1075a89b9fcc3be12635d`
**Directive:** CLAUDE FINAL CORRECTION DIRECTIVE — APP3-G05-C1

---

## 1. Human review verdict

```text
APP3-G05 = COMPLETE — CORRECTION_REQUIRED
```

The coordinate, pivot, matrix, group, containment, physical-scale and integrity
rulings were accepted. One bounds-authority gap remained — in two related halves,
both of which the delivered `APP3-G05` report had disclosed under "observations
recorded rather than resolved". This is the only ordinary correction allowed for
`APP3-G05`.

---

## 2. The two gaps

### 2.1 Rectangle and ellipse stroke omitted from bounds

P01 gives `ShapeElement` a `strokeWidthPx` for **all three** shape kinds, and
`FreehandElement` one as well. PO-08 as delivered expanded only `line` and
`freehand`.

The consequence is not cosmetic. `CONSERVATIVE_TRANSFORMED_AABB` exists to
guarantee that whatever gets painted is inside the embroidery area; a stroked
rectangle or ellipse could paint up to `strokeWidthPx / 2` outside the accepted
bounds and still pass containment. For two of the four stroked kinds, the
strategy named *conservative* was **optimistic** — the exact failure it is named
to prevent, and a clipped garment rather than a rejected design.

### 2.2 The schema-v1 line path was unstated

P01's `line` is a `ShapeKind` defined solely by its transform box — it stores no
endpoint fields. Without a ruled path there was nothing for `APP3-P02` to compute
deterministic bounds from, and no two renderers were obliged to draw the same
segment inside the same box. A diagonal, a horizontal centreline and a vertical
centreline are all "a line in a box".

---

## 3. The corrected authority

`IMP-D045` PO-08 is corrected **in place**, before review acceptance. **No new
decision id.** No other ruling changed: PO-01–PO-07 and PO-10–PO-12 stand exactly
as delivered, and PO-09 gained only the word *stroke-aware* plus the consequence
sentence, since it depends on PO-08's envelope.

### 3.1 Stroke is drawable geometry

| Rule | Value |
|---|---|
| Stroked kinds | `rectangle`, `ellipse`, `line`, `freehand` — every kind storing `strokeWidthPx` |
| Unstroked kinds | `text`, `image` — declared box, unexpanded |
| Alignment | centred on the local path |
| Expansion | `strokeWidthPx / 2` on all four sides |
| Zero stroke | no expansion; declared box |
| Participates in | bounds, containment, physical-size validation, group bounds, document bounds |
| Never | renderer decoration · ignored because the element also has a fill · subtracted from `width`/`height` |

### 3.2 Exact local geometry per kind

| Kind | Local path | Fixed v1 stroke semantics | Local envelope |
|---|---|---|---|
| **Rectangle** | boundary of `(0,0)`–`(width,height)` | `lineJoin = miter`, `miterLimit = 4` | `(-s/2, -s/2)` to `(width + s/2, height + s/2)` |
| **Ellipse** | inscribed in the declared box | — (no cap/join decision) | declared box expanded by `s/2`, transformed conservatively; **not** the tight rotated ellipse/stroke AABB |
| **Line** | straight segment `(0,0)` → `(width,height)` | `lineCap = round`, `lineJoin = round` | endpoint AABB expanded by `s/2` |
| **Freehand** | ordered polyline of straight segments over **element-local** points | `lineCap = round`, `lineJoin = round` | point/polyline AABB expanded by `s/2`; one point is a round dot of radius `s/2` |

`s` is `strokeWidthPx`. For the rectangle's four 90° corners the half-stroke
envelope is the production bounds authority under miter/4. Freehand permits no
smoothing, interpolation, Bezier conversion or point simplification, and an empty
point sequence stays invalid under P01.

The forbidden line readings are named explicitly so none can return by
implication: horizontal centreline, vertical centreline, arbitrary renderer path,
renderer-chosen diagonal, path with unstored endpoints.

### 3.3 Transform order

```text
1. derive the exact local drawable envelope for the element kind
2. transform all four corners of THAT envelope with the full effective matrix
3. take the document-space axis-aligned min/max
4. quantize comparable output through P01 authority
```

Transforming only the unexpanded path and adding an unscaled document-space
half-stroke afterwards is **forbidden**: it ignores scale and rotation entirely,
so a 3× scaled stroke would be charged at 1×. For line and freehand the ruled
order may overestimate the painted stroke under rotation or non-uniform scale —
accepted for v1 containment safety, and recorded as such rather than left as an
unexplained slack.

### 3.4 Containment and physical size

Both now use the complete **stroke-aware** transformed AABB. A shape fails when
its fill or path fits but any part of its ruled stroke envelope overhangs the
Embroidery Area. Boundary equality remains valid after quantization; no clipping,
clamping, translation, snapping or warn-but-persist is permitted.

### 3.5 Cap/join are version-level constants

A renderer implementing `schemaVersion = 1` must reproduce miter join with
`miterLimit 4` for rectangle and round cap/join for line and freehand. These are
**not** added to the v1 Design Document and are not per-element customer choices.
Changing one changes painted bounds and is therefore a schema-semantic change
under PO-12, exposable as configurable only through a new Product Owner decision
and a migration.

---

## 4. No v1 schema change was required

The §15 stop condition did not fire. Every corrected rule reads fields P01
already stores:

| Corrected rule | Existing v1 field |
|---|---|
| rectangle / ellipse / line stroke envelope | `ShapeElement.strokeWidthPx` |
| freehand stroke envelope and dot | `FreehandElement.strokeWidthPx` |
| line path `(0,0)` → `(width,height)` | `transform.width`, `transform.height` |
| freehand polyline | `FreehandElement.points` |
| rectangle / ellipse local path | `transform.width`, `transform.height` |

Adding `lineCap`, `lineJoin` or `miterLimit` to the document would have been the
schema change this correction exists to avoid — which is precisely why they are
ruled as version-level constants instead.

---

## 5. Changed files

**Commit A — 9 files, +419 / −52**

| File | Change |
|---|---|
| `docs/implementation/phases/APP3-DESIGN-TEMPLATES-AND-STUDIO.md` | §6.11.1 stroke/line/cap-join facts; PO-08 rewritten; PO-09 stroke-aware; new §6.11.5 forward correction note; §10 statuses |
| `docs/implementation/14-IMPLEMENTATION-DECISION-REGISTER.md` | `IMP-D045` PO-08 corrected in place, PO-09 consequence added; still one `LOCKED` row |
| `docs/05-DESIGN-STUDIO-SPEC.md` | §6 forward note: stroke counts as drawable size; the v1 line path; cap/join as constants |
| `docs/10-NON-FUNCTIONAL-REQUIREMENTS.md` | §5 Data integrity: the stroke envelope is part of `schemaVersion = 1` semantics |
| `docs/implementation/10-…`, `11-…`, `13-…` | forward correction record and APP3 status |
| `tools/check-app3-g05.mjs` | 26 new locked facts, 9 new prose claims, blocking-token check widened to `BLOCKED_BY_APP3-G05` |
| `tools/check-app3-g05.test.mjs` | 25 new cases; two retired-key cases retargeted |

Untouched and verified so: `packages/design-engine/**` (still `export {}`),
`packages/design-document/**`, `packages/database/**`, `apps/**`, root and
workspace `package.json`, `pnpm-lock.yaml`, OpenAPI, generated client, worker,
`docs/design/**`, Figma, `spikes/**`, `infrastructure/**`. No dependency added.
`APP3-G05-COMPLETION-REPORT.md` and `APP3-P01-COMPLETION-REPORT.md` were **not**
rewritten; §6.11.5 is the forward record.

### Line counts

| File | Lines | Limit |
|---|---|---|
| `tools/check-app3-g05.mjs` | 305 | ≤ 400 |
| `tools/check-app3-g05-transform.mjs` | 124 | ≤ 400 |
| `tools/check-app3-g05.test.mjs` | 600 | ≤ 600 |

The test file reached 601 after formatting and was brought to 600 by tightening
its header — no case was dropped, and the authorized second test file was not
needed.

---

## 6. Gate and tests

The gate now verifies all fourteen ruled properties of the correction: rectangle
and ellipse half-stroke expansion, the exact line path, round cap/join for line
and freehand, element-local freehand points connected by straight segments,
rectangle miter with `miterLimit 4`, stroke participation in bounds/containment/
physical size, `text`/`image` staying unexpanded, expand-before-transform order,
no cap/join document field, the PO-12 classification of a stroke-semantics
change, `APP3-P02` still unimplemented and blocked, and every previously accepted
ruling still present.

The blocking-token check was widened from the literal
`BLOCKED_BY_APP3-G05_REVIEW_ACCEPTANCE` to `BLOCKED_BY_APP3-G05`, so it accepts
both the original acceptance gate and the correction review that now supersedes
it — rather than a gate that had to be edited every time the token moved.

**Tests: 50 → 75, all passing.** The 25 new cases map to the directive's sixteen:

| Directive case | Test |
|---|---|
| 1 rectangle stroke ignored | `rejects a rectangle whose stroke is not part of its bounds` |
| 2 ellipse stroke ignored | `rejects an ellipse whose stroke is not part of its bounds` |
| 3 fill-only containment | `rejects containment using fill bounds only` |
| 4 line as horizontal centreline | `rejects a line redefined as a horizontal centreline` |
| 5 renderer-defined endpoints | `rejects leaving the line endpoints renderer-defined` (+ forbidden-list case) |
| 6 line cap changed | `rejects a line cap other than round` |
| 7 freehand points in document space | `rejects freehand points read as document space` |
| 8 freehand smoothing | `rejects freehand smoothing or simplification` |
| 9 freehand cap/join changed | `rejects a freehand cap or join other than round` |
| 10 miter limit renderer-default | `rejects a rectangle miter limit left renderer-default or unstated` |
| 11 stroke added after transform | `rejects adding the stroke after the transform, in document space` (+ `Document space stroke addition`) |
| 12 physical size ignores stroke | `rejects physical-size validation that ignores stroke` |
| 13 cap/join as a v1 field | `rejects cap/join becoming a per-element v1 document field` |
| 14 stroke change called a refactor | `rejects calling a stroke-semantics change an internal refactor` |
| 15 P02 unblocked early | `rejects a phase plan that does not block APP3-P02` |
| 16 corrected repository passes | `accepts the committed repository` |

Plus nine more the correction made assertable: stroke as decoration, stroke
subtracted from width/height, `text`/`image` gaining expansion, stroke not
centred, a non-straight line, the lost single-point dot rule, a
non-declared-box rectangle path, a circumscribing ellipse, and three prose-claim
cases guarding the paragraphs a human reads before implementing.

No geometry is executed; `IMP-D045` is a decision and these tests guard the
decision.

---

## 7. Scoped validation

`pnpm quality` was **not** run. No root script was added.

| Command | Result |
|---|---|
| `node tools/check-app3-g05.mjs` | **PASS** |
| `node --test tools/check-app3-g05.test.mjs` | **75 / 75** |
| `node tools/check-app3-p01.mjs` | **PASS** |
| `node tools/check-app3-g01.mjs` | **PASS** |
| `node tools/check-app3-db01.mjs` | **PASS** |
| `pnpm format:check` | **PASS** |
| `pnpm lint` | **PASS** — 21 / 21 tasks |
| `git diff --check` | **clean** |

P01 was in scope because the corrected line and freehand semantics interpret its
existing v1 fields without changing them; G01/DB01 because containment and
physical scale still bind their placement authority. `tools/check-app3-g05-transform.test.mjs`
was not created — no second test file was needed. P02 package tests, API, worker,
database suite, root tests, E2E, smoke, OpenAPI, Figma, spike and
full-regression suites were not run; no owned input of any changed. Nothing was
backgrounded and nothing was polled.

---

## 8. Status

```text
APP3-G05-C1 =
COMPLETE — REVIEW_DELIVERED

APP3-G05 =
COMPLETE — CORRECTION_DELIVERED_FOR_REVIEW

APP3-P02 =
BLOCKED_BY_APP3-G05_CORRECTION_REVIEW

APP3 =
IN PROGRESS — GEOMETRY AUTHORITY CORRECTION_DELIVERED_FOR_REVIEW
```

Human review owns `APP3-G05 = COMPLETE — REVIEW_ACCEPTED`.

---

## 9. Confirmations

- **Commit A:** `3e930cc7414358d9edd1075a89b9fcc3be12635d`.
- **Working tree clean** after Commit A; Commit B adds only this report.
- **Nothing pushed.** `origin/production` remains at `8b5f3b0`.
- **No `APP3-P02` implementation**: `packages/design-engine/src/index.ts` is
  still `export {}`, and the gate asserts it.
- **No package source change** of any kind — `packages/design-document/**` and
  `packages/design-engine/**` are untouched.
- **No v1 schema change**; no field added to the Design Document.
- **No renderer, API, OpenAPI, generated-client, worker, database, migration,
  Figma or UI change.**
- **No new decision id** — `IMP-D045` was corrected in place.
- **No root or workspace `package.json` change**, no `pnpm-lock.yaml` change, no
  new dependency.
- **`pnpm quality` not run**; no repository-wide aggregate validation.
- **No credential read, written, echoed or rotated;** `.env` untouched.
