# APP3-P02-C1 — Completion Report

**Checkpoint:** `APP3-P02-C1` — Reject ambiguous group parentage
**Date:** 2026-08-04
**Branch:** `production`
**Entry HEAD:** `094c904` (`docs(app3): record resumed APP3-P02 evidence`)
**Commit A:** `92653ddc708295f674bd1a0749b04cb5ca2c1944`
**Directive:** CLAUDE FINAL CORRECTION DIRECTIVE — APP3-P02-C1

---

## 1. Human correction verdict

```text
APP3-P02 = COMPLETE — CORRECTION_REQUIRED
```

The matrix, transform, local-envelope, stroke, placement, px↔mm, containment and
physical-size implementation was accepted. One direct-call safety defect was not.

## 2. The delivered behaviour, and why it was wrong

`APP3-P02`'s completion report stated it plainly:

```text
two groups claiming one child: first parent wins, deterministically
```

`buildElementGraph` inserted a claim only when the child had no parent yet:

```ts
if (!parentOf.has(childId) && childId !== element.id) parentOf.set(childId, element.id);
```

Determinism was the wrong property to aim for. The structural contract gives an
element **at most one** direct group parent, so a document with two claims does
not have an awkward answer — it has **no** authoritative effective transform.
Choosing one silently accepted invalid input, made a customer's geometry depend
on which group happened to be serialized first, could produce an incorrect AABB,
could evaluate containment against the wrong transform, and hid the fact that the
document had bypassed validation upstream.

The correct result is failure.

## 3. Corrected graph construction

Claims are **staged** and only become a parent map once every one of them is
known to be unambiguous, so no partial map is ever exposed:

1. index all element ids;
2. walk every group's `childIds` into `claims: child → the distinct groups claiming it`,
   recording four kinds of ambiguity separately;
3. emit findings for each; if there are any, `parentOf` is **empty**;
4. otherwise insert each child under its single claim.

```ts
const parentOf = new Map<string, string>();
if (structuralFindings.length === 0) {
  for (const [childId, claiming] of collected.claims) {
    const [onlyParent] = claiming;
    if (claiming.size === 1 && onlyParent !== undefined) parentOf.set(childId, onlyParent);
  }
}
```

| Key | Value |
|---|---|
| `Parent claims per element` | zero or one; more is invalid |
| `Repeated child in one group` | invalid |
| `Group listing itself` | invalid |
| `Child not in the document` | invalid |
| `Winner selection` | `NONE` — no first, last, id-order or z-order rule exists |
| `Invalid-graph parent map` | empty, never partial |
| `Ambiguity finding` | `INVALID_PARENT_CHAIN` |
| `Unknown child finding` | `UNKNOWN_ELEMENT` (the narrower compatible code) |
| `Finding metadata` | `parentClaimCount` — numeric only, no parent ids |
| `Finding order` | element order, then unknown ids sorted |
| `Document normalization` | `NONE` — no claim dropped, no `childIds` rewritten |
| `Cycle and missing-parent protection` | preserved, depth-bounded at 32 |

Finding order is decided by the **document**, not by the groups: known ids are
reported in element order and unknown ones alphabetically. An ambiguity whose
report depended on group order would be one more way for geometry to depend on
serialization.

`parentChain` returns `undefined` on an ambiguous graph, so nothing downstream
can walk a map that does not exist.

## 4. Dependent public paths

`structuralFinding(graph, elementId?)` returns the blocking finding, preferring
the one that names the element asked about. Every public path consults it:

| Path | Behaviour on an ambiguous graph |
|---|---|
| `resolveEffectiveTransform` | `INVALID_PARENT_CHAIN`; **no** matrix, for any element |
| `getElementBounds` | the same finding; no bounds |
| `getGroupBounds` | the same finding; does not union what it can still reach |
| `getDocumentBounds` | the same finding — see below |
| `validateElementWithinEmbroideryArea` | `ok: false`, one finding |
| `validateDocumentWithinEmbroideryArea` | `ok: false`, the finding **once**, not per element |
| `validateElementPhysicalSize` | `ok: false`, one finding |
| `validateDocumentPhysicalSize` | `ok: false`, the finding once |

Resolution refuses for **every** element of an ambiguous document, not only the
contested child: the contested child may be an ancestor of anything.

`getDocumentBounds` now returns `Bounds2D | GeometryFinding | undefined`. This is
the one public type widened, and it is the case the directive's §9 anticipates:
`undefined` alone would let an unmeasurable document read as an empty canvas.
`structuralFinding` is exported alongside it, because `ElementGraph` is public and
a caller who builds one must be able to interpret the new field without
re-implementing the check.

No path rebuilds a parent map, none mutates, and repeated calls return equal
finding sets.

## 5. Tests

The first-parent test was **replaced**, not renamed:

```text
- keeps only the first parent when two groups claim one child
+ describe('ambiguous parentage is rejected, never resolved')  — 11 cases
```

| Proof | Where |
|---|---|
| valid root, one parent, nested parents resolve | `graph.spec.ts` (unchanged) |
| one group listing the same child twice is rejected | `graph.spec.ts` |
| two groups claiming one child are rejected | `graph.spec.ts` |
| reversing the two groups gives the identical result | `graph.spec.ts` |
| no winner in either order (`parentOf.size === 0`) | `graph.spec.ts` |
| the contested child id and `parentClaimCount` are reported | `graph.spec.ts` |
| no effective matrix is returned, for any of the three ids | `graph.spec.ts` |
| self-parenting and unknown child references rejected | `graph.spec.ts` |
| the document is not mutated; evaluation is deterministic | `graph.spec.ts` |
| a sound document still yields a usable graph | `graph.spec.ts` |
| element, group and document bounds fail safely | `bounds.spec.ts` |
| document bounds stay distinguishable from an empty document | `bounds.spec.ts` |
| containment and physical size fail safely, reported once | `area.spec.ts` |
| existing cycle, unknown-element and geometry vectors | unchanged, all passing |

The containment case is the one worth reading: under one claiming group the
element fits and under the other it does not, so an `ok: true` computed from an
arbitrarily chosen parent would have approved a placement nobody chose.

**Counts:** `@embroidery/design-engine` **137 tests / 6 suites** (was 118);
`tools/check-app3-p02.test.mjs` **38 tests / 8 suites** (was 34).

## 6. Gate

`tools/check-app3-p02.mjs` asserts both halves — that ambiguity is detected
*before* a parent map exists, and that no consumer can measure anything once it
has been:

- each of the four ambiguity checks is present, by its exact expression;
- the parent map is built **only** inside the `structuralFindings.length === 0`
  branch, matched together with the loop it guards, so replacing the condition
  elsewhere does not satisfy it;
- `!parentOf.has(childId)` — the old rule in the exact form it took — is refused;
- `bounds.ts` and `area.ts` both consult `structuralFinding(`;
- prose counts: a comment claiming a winner would document the defect as design;
- the three named regressions exist, and the old test name is refused so it
  cannot be renamed back into place.

Four new checker regressions prove each of these fires. `checkGroupSemantics` and
the new checks were merged into one function rather than added beside it, which
kept the checker at **399 lines** (limit 400).

## 7. Scoped validation

```text
pnpm --filter @embroidery/design-engine test       → 137/137, 6 suites
pnpm --filter @embroidery/design-engine typecheck  → PASS
pnpm --filter @embroidery/design-engine build      → PASS
node tools/check-app3-p02.mjs                      → PASS
node --test tools/check-app3-p02.test.mjs          → 38/38
node tools/check-app3-p01.mjs                      → PASS
node tools/check-app3-g05.mjs                      → PASS
pnpm format:check                                  → PASS
pnpm lint                                          → PASS (22 tasks)
git diff --check                                   → clean
```

`pnpm quality` was not run. No database, API, worker, root, E2E, smoke, OpenAPI,
Figma or spike command was run.

## 8. Changed files

| File | Lines | Change |
|---|---|---|
| `packages/design-engine/src/transforms/graph.ts` | 306 | staged claims, structural findings, `structuralFinding` |
| `packages/design-engine/src/transforms/graph.spec.ts` | 259 | first-parent test replaced by 11 rejection cases |
| `packages/design-engine/src/bounds/bounds.ts` | 205 | group and document bounds fail safely |
| `packages/design-engine/src/bounds/bounds.spec.ts` | 326 | 4 safe-failure cases; `documentBox` helper |
| `packages/design-engine/src/containment/area.ts` | 181 | both document validators fail safely |
| `packages/design-engine/src/containment/area.spec.ts` | 312 | 5 safe-failure cases |
| `packages/design-engine/src/index.ts` | 132 | exports `structuralFinding` |
| `tools/check-app3-p02.mjs` | 399 | ambiguity checks; `checkFindings` folded in to stay within 400 |
| `tools/check-app3-p02.test.mjs` | 398 | 4 new regressions |
| `docs/implementation/phases/APP3-DESIGN-TEMPLATES-AND-STUDIO.md` | +69 | §6.13 and the status block |
| `docs/implementation/10-MASTER-APPLICATION-ROADMAP.md` | +1 line edit | APP3 row records the correction |
| `docs/implementation/13-PHASE-SOURCE-MAP.md` | +1 line edit | structural half of P02's geometry authority |

`docs/implementation/11-TRACEABILITY-AND-STATUS-MATRIX.md` was inspected and not
changed: it records current status **once**, in the roadmap, and deliberately does
not duplicate per-checkpoint values.

Commit A: `92653ddc708295f674bd1a0749b04cb5ca2c1944` — 12 files, +601 / −111.

## 9. What did not change

- **`IMP-D045`** — not modified, not reinterpreted, not softened.
- **Valid-graph geometry** — every matrix, pivot, composition, envelope, stroke,
  bounds, placement, px↔mm, containment and physical-size vector is unchanged.
  The 90°-group vector `(75, −25)` and the 3×-scaled 8px-stroke `minX = −112`
  still hold.
- **`packages/design-document`** — no source change; P01 v1 is untouched, and no
  schema field was added, read differently or required.
- No API, OpenAPI, generated client, database, migration, worker, renderer, UI,
  Figma, spike, infrastructure or dependency change. `pnpm-lock.yaml`,
  `packages/design-engine/package.json` and the root `package.json` are untouched.
- No new Product Owner decision id.

## 10. Status

```text
APP3-P02-C1 = COMPLETE — REVIEW_DELIVERED
APP3-P02 = COMPLETE — CORRECTION_DELIVERED_FOR_REVIEW
IMP-D045 = LOCKED (unchanged)
```

Human review owns:

```text
APP3-P02 = COMPLETE — REVIEW_ACCEPTED
```

The working tree is clean and nothing has been pushed; `origin/production`
remains at `8b5f3b0`. No backend, worker, renderer or UI work was started.
