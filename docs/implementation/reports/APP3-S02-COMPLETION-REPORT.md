# APP3-S02 — Production SVG stage, renderer adapter and selection foundation

**Status:** `COMPLETE — REVIEW_DELIVERED`
**Commit A:** `3080073819470b000f4c22da153fda565feb7b26` — `feat(storefront): add Studio SVG stage and selection`
**Date:** 2026-08-10

---

## A. Entry state and the S01-C1 acceptance

The operator accepted `APP3-S01-C1`, and that acceptance was recorded in the
phase document **before any source edit**:

```text
APP3-S01-C1 = COMPLETE — REVIEW_ACCEPTED
APP3-S01    = COMPLETE — REVIEW_ACCEPTED
APP3-S02    = READY — NOT STARTED
```

`APP3-P01`, `APP3-P02`, `APP3-D01`, `APP3-D01-C1`, `APP3-B02`, `APP3-B05A` and
`APP3-B07` were already `COMPLETE — REVIEW_ACCEPTED` and were verified rather
than assumed; the S02 gate asserts all nine.

S01 was not reopened. `APP3-B06C` was not implemented. S03–S11 were not started.

## B. The three S02 Figma rows

Resolved from `docs/design/FIGMA_DESIGN_INDEX.md`, not guessed:

| Registry ID | Node | State |
|---|---|---|
| `FIG-STUDIO-STAGE-DESKTOP-UNSELECTED` | `606:3` | Nothing Selected |
| `FIG-STUDIO-STAGE-DESKTOP-SELECTED` | `606:63` | Element Selected |
| `FIG-STUDIO-STAGE-DESKTOP-EMPTY` | `606:133` | Empty Document |

File `BQwqV8GdfUIELvsQDB1UQE`, page `APP_03`, section **06 — Studio Stage /
Selection** (`596:12`). All three were `REVIEW_REQUIRED` on entry and were
promoted to `APPROVED_FOR_IMPLEMENTATION` with evidence `APP3-S02 §5 operator
review`. Exactly three rows moved; the registry gate re-verified integrity
afterwards (165 registry IDs, 165 node rows, 15 tables).

Every S03–S11 capability row remains `REVIEW_REQUIRED`, and both gates assert it
in both directions — the S02 gate refuses a blanket approval, and it also
refuses these three rows being approved in a world where S02 has not delivered.

**Live Figma read: not performed, and not a blocker.** The connector in this
session exposes only `authenticate` / `complete_authentication`; no read tool is
available without an interactive OAuth round-trip the operator must complete.
§5 permits exactly this: the registry plus `APP3-D01`/`D01-C1` fully resolve the
three S02 entries, their node ids and their states. No Figma artifact was
modified.

## C. 1440 and 1024 authority

Desktop authority is section 06 at **1440**. The shared tablet reference is
`FIG-STUDIO-EDITING-TABLET-1024` (`618:140`), which remains owned by
`APP3-D01-C1` — the S02 gate asserts that ownership explicitly, because
re-attributing it here would quietly turn a reference showing the whole S02–S11
editing surface into a licence for every capability drawn on it.

At 1024 this checkpoint implements only the stage layout, the SVG scene,
selection presentation, the contextual Side background and the static area
rectangle. No transform handle, layer row, text editor, upload control, zoom
control, undo control or save indicator exists at any width.

## D. Native-SVG architecture preserved

`IMP-D026` and `ADR-APP0-001` are intact. The production renderer is native SVG
rendered by React 19, with no rendering-engine and no interaction-library
dependency.

Asserted mechanically, in both the manifest and the source: no `konva`,
`react-konva`, `fabric`, `pixi`, `interactjs`, `three` or equivalent; no
`<canvas>`; and **exactly one** `<svg>` root in the whole Studio feature. Two
would be two renderers whatever the second was called, so the rule is a count
over the feature rather than a check on a file the gate happens to know about.

## E. Workspace dependency boundary

Two internal workspace links were added to `apps/storefront/package.json` and
wired with **one** `pnpm install`:

```text
@embroidery/design-document   workspace:*
@embroidery/design-engine     workspace:*
```

Lockfile delta: +6 lines, both `link:` entries. No external dependency, no new
shared package. Public package roots only — no deep imports. No import from
`spikes/*`, `apps/admin/*`, `apps/api/src/*`, `packages/database/*` or the
worker; the gate asserts all four.

**One infrastructure change was required.** `infrastructure/docker/storefront.Dockerfile`
now runs `pnpm --filter "@embroidery/storefront^..." build` in its dev and build
stages. Workspace runtime packages ship TypeScript and resolve to `dist`
(IMP-D018), so without it the dev server fails with `Module not found: Can't
resolve '@embroidery/design-engine'` — found in the browser, before the proof —
and the production image would fail the same way at `next build`. This is
identical to the fix the Admin image needed at `APP3-A03` for the same two
packages; the Storefront simply had no document-interpreting dependency until
now. Only `apps/storefront/src` is bind-mounted in dev, so a manifest change
requires an image rebuild, which was performed.

## F. Session handoff from S01

The stage extends the accepted client island. There is no second Studio route,
no second bootstrap flow and no second Session DTO; the shared `APP3-P04`
response type is used unchanged.

`StudioScreen` hands over at the point it previously stopped: once
`session.snapshot !== null`, `StudioStageScreen` renders instead of the
placeholder panel. **The Session is not re-fetched or resumed to obtain the
document** — S01 already holds what the server returned, and the browser proof
shows zero create/resume calls after bootstrap.

One deliberate addition to `useStudioSession`: the bootstrap response's `scope`
is held beside the snapshot. `APP3-B07` returns the placement scope on
**create** and omits it on **resume**, which addresses the Session by id alone —
so a resumed snapshot arrives without the geometry the stage needs to draw the
garment and the area. Remembering the create response's own scope is not merging
server fields: nothing invents, extends or advances a value, an open Session's
scope is fixed for its lifetime, and it is cleared with the Session it belongs
to.

## G. APP3-P01 document authority

`buildRenderableScene` validates through `validateDesignDocumentStructure` and
uses only the form P01 hands back. Nothing repairs a field, supplies a default,
drops an offending element or coerces a value.

Three bounded refusals, kept apart because they are three different facts:

| Failure | Cause |
|---|---|
| `unreadable-document` | P01 refused: unsupported schema version, or malformed |
| `unresolvable-geometry` | P02 could not place something |
| `uncontrolled-font` | a text element names a font outside the registry |

In every one of them **no `<svg>` is rendered at all** — there is nothing
half-drawn to mistake for a design — and no document, JSON path, element id,
asset id or finding message reaches the screen. A stage refusing to trust a
payload must not display that payload while it explains itself. Proved by a test
asserting the rendered output contains neither the offending `fontId` nor
`schemaVersion` nor `$.elements`.

## H. APP3-P02 geometry authority

Every matrix, bound and containment answer comes from
`@embroidery/design-engine`: `buildElementGraph`, `resolveEffectiveTransform`,
`getElementBounds`, `structuralFinding`, `isGeometryFinding`, `rectToBounds`.

No local matrix multiplication, rotation, scale composition, group-parent
walking, bounds calculation, stroke expansion, px↔mm conversion or containment
math exists. The renderer's entire licence over geometry is serializing P02's
matrix to `matrix(a b c d e f)`, in one four-line function.

The gate bans the *shape* of local geometry across the whole feature —
`Math.cos|sin|tan|atan2`, `Math.PI`, `* 180 / Math`, `rotationDeg *`,
`pxPerMm *`, `/ pxPerMm`, `composeMatrices(`, `multiplyMatrices(` — rather than
watching one file, because a fixture where every element sits at the origin
agrees with a wrong implementation.

The unit tests assert against the **engine's own answers** rather than
transcribed constants. A test carrying its own copy of "rotate about the
untransformed local-box centre, scale first" would pass while agreeing with a
renderer that had drifted from `IMP-D045` — both wrong, in the same way.

**Graph failures fail safely.** An ambiguous parent graph or an unresolvable
element refuses the whole scene. Not the identity matrix, which looks like a
position rather than a failure; and not a skipped element, because a design
missing a part is indistinguishable from a design that never had one. The test
asserts the healthy sibling is not drawn either.

## I. Renderer-adapter contract

`features/design-studio/renderer/` is pure: no React, DOM, fetch, object URL or
clock is reachable from it, which is what makes the geometry rules provable by
calling it rather than by reading a component.

```text
buildRenderableScene(payload)            → { ok, scene } | { ok: false, failure }
resolveRenderableElement(scene, id)      → RenderableElement | undefined
resolveElementBounds(scene, id)          → Bounds2D | null
isSelectable(renderable)                 → boolean
toSvgMatrix(matrix)                      → "matrix(a b c d e f)"
```

`RenderableElement` carries the element exactly as the document holds it (never
a rewritten copy), P02's matrix, that matrix already serialized, P02's bounds,
the controlled font family for text (`null` otherwise) and visibility.

The gate asserts the boundary is real in both directions: the adapter must
publish the builder, and the stage must **not** call `buildElementGraph` or
`resolveEffectiveTransform` — a component that resolved geometry itself would
leave the adapter a decoration.

No spike source was copied.

## J. SVG coordinate system and paint order

`viewBox="0 0 canvasWidthPx canvasHeightPx"` from the document's own placement
canvas. CSS controls visual fit only; no authored coordinate is multiplied by a
viewport scale anywhere. The gate asserts the exact viewBox expression.

Paint order is the document array, bottom first — SVG has no `z-index`, DOM
order *is* the stacking, and `APP3-P01` defines the array as z-order with the
same convention. The list is never sorted, reversed or re-ranked; the gate bans
`.reverse(` and `.sort(` on the render path. Reordering remains `APP3-S04`'s.

Groups are filtered out: a group paints nothing of its own (PO-07) and its
transform is already composed into every descendant's effective matrix, so
drawing one would place its children twice.

## K. Element-kind rendering

Audited against the real P01 v1 union — `text`, `image`, `shape`, `freehand`,
`group`. No kind was invented.

- **text** — controlled family from the registry, `fontSizePx`, `fontWeight`,
  `fontStyle`, `textAnchor` from `textAlign`, `fill`. No stylesheet rule sets a
  `font-family`, which would override every document's own face.
- **shape** — rectangle, ellipse and line. `line` uses the declared box's
  diagonal, which is exactly what the engine's envelope measures.
- **freehand** — the point sequence as a `polyline`.
- **image** — a truthful placeholder (§P).
- **group** — structure only, never drawn.

Stroke cap, join and miter are **imported from the engine** rather than written
as literals. They are constants of the schema version that the conservative
envelope was computed from: a renderer painting a butt cap where the engine
measured a round one paints inside its own bounds, and one painting a miter join
where the engine assumed none paints outside them — and the selection outline
would be visibly wrong.

Hidden elements keep geometry (PO-08) but are neither painted nor selectable.

## L. Selection state and accessibility

One serializable `selectedElementId` in one Zustand store. Click to select,
click another to replace, click the empty stage to clear, `Enter`/`Space` from
the keyboard. No multi-select, marquee, drag, resize, rotate, flip or nudge.

The store can hold nothing else. The gate bans `SVGElement`, `HTMLElement`,
`DOMRect`, `DOMMatrix`, `AbortController`, `Blob`, `objectUrl`, `sessionId`,
`snapshot`, `document:`, `useRef`, `persist(`, `localStorage`, `sessionStorage`
— and also `history`, `undo`, `redo`, `zoom`, `pan`, `layers`, `upload`,
`watermark`, so S03–S11 state cannot be pre-built here.

Selection is never serialized: not into the document, not into a request body,
not into storage. The gate rules on the services directory, because that is
where it would escape, and the browser proof shows `localStorage` empty,
`sessionStorage` holding only Next's debug channels, no cookie readable and no
URL parameter.

A stale selection is dropped against **every** scene, not only the first — an id
pointing at nothing must resolve to no selection rather than to a stale outline.

Accessibility: the stage carries an accessible name with the document's own
dimensions; each element is a real `role="button"` with `tabIndex`,
`aria-label` and `aria-pressed`; selection is announced **in text** as well as
by the outline, so it is not colour-only; focus is visible via `:focus-visible`.
Text elements name themselves with their own text — the element `id` is never a
label, because an opaque internal reference means nothing to a customer. This is
a minimum, not a claim that the editor's accessibility is finished, and no
`APP3-S04` layer UI was pulled forward to provide it.

## M. The Side background (APP3-B02)

`publicProductSideBackgroundGet` crossed the curated api-client boundary with
S02 as its first real consumer. S01 withheld it for the reason stated at the
time — it rendered no stage — and that rule is satisfied rather than relaxed:
S01's own gate still asserts the bootstrap screen never calls it, and the
boundary test proves exactly one caller, `studio-background.client.ts`.

The address is contextual: Product slug + Side stable code, both from the
**Session's own scope**. No `assetId`, `derivativeId`, storage key, presign,
bucket or provider URL crosses in either direction, and there is no generic
asset endpoint to reach for.

Composed in the same coordinate system, across the authored canvas, with
`xMidYMid meet` — `APP3-B02` treats the derivative's intrinsic size as a
separate fact from the Side's authored canvas, so letterboxing is the only
option that cannot distort the garment. Nothing inspects intrinsic dimensions to
rewrite document geometry.

## N. Blob and object-URL lifecycle

The bytes are server state (TanStack Query owns fetching, cancellation,
failure); the object URL is a browser resource (an effect owns creating and
revoking it). `gcTime: 0`, `staleTime: 0`, no `placeholderData`, no retry.

Revoked in effect cleanup, which fires on Session or Side change, on blob
replacement and on unmount. Never stored in Zustand or any durable storage.

Proved in a **real browser**, not only in jsdom: the same object URL was
fetchable while the stage was mounted (`ok: true`) and **not fetchable after a
client-side navigation unmounted it** (`ok: false`), in the same JS realm.

`placeholderData`'s absence is the stale-background defence: keeping the
previous entry's blob while a new key loads is exactly how one Side's garment
appears under another Side's design.

## O. Placement and safe-area composition

The embroidery area is drawn from the Session scope's persisted rectangle
through the engine's `rectToBounds` — no inset, no derived second rectangle, no
local arithmetic. An invented inner boundary would be a second geometry nobody
authored.

It is static and non-interactive: `pointer-events: none`, no show/hide control
and no zoom-dependent behaviour, all of which belong to `APP3-S07`.

Verified live: the rect rendered at `x=100 y=100 w=100 h=100`, the persisted
values.

## P. Image-media delivery audit and the chosen mode

Audited: the S01 Session response, P01's image fields, B07 clone semantics, B08
media authority, B05A Template delivery, B06B Session upload, the planned B06C,
and the generated client. Enumerated the OpenAPI public surface directly.

Findings:

- `/api/public/design-sessions/{sessionId}/assets` publishes **`post` only** —
  `APP3-B06B` upload. There is no delivery route.
- `APP3-B06C` does not exist.
- `APP3-B05A` serves *published Template* assets under six conjunctive terms
  that a Design Session satisfies none of. Clone independence is mandatory:
  Template lineage is **provenance, not permission**, so a cloned Session
  knowing a Template slug authorizes nothing.
- `publicProductMediaGet` is catalog imagery, not Session media.

```text
S02_IMAGE_MEDIA_MODE = DEFERRED_TO_S06_B06C
```

Image elements render a truthful placeholder occupying the element's exact
local box, placed by the engine's matrix, and remain selectable with the correct
bounds — the missing capability is a missing *picture*, not a missing *element*.
The placeholder is deliberately drawn as one (dashed frame, explicit label) so
it can never be mistaken for the customer's artwork, and it never exposes an
asset id, derivative id or storage identity. Verified live: placeholder frame
`80×30` at `matrix(1 0 0 1 110 110)`, label "Hình ảnh", zero `<img>` tags, and
the string `asset` absent from the entire stage markup.

No new follow-up was opened: `APP3-S06` and `APP3-B06C` already own this gap.

**No hard stop was reached.** The approved S02 design does not require real
pixels now, and no accepted contextual route could provide them without
violating clone independence — so the truthful boundary was taken rather than
inventing an Asset route.

## Q. S03–S11 non-scope

Nothing was implemented from S03 (transforms), S04 (layers), S05 (text editing),
S06 (upload), S07 (zoom/pan), S08 (undo/redo), S09 (watermark), S10 (autosave,
conflict, persistent resume) or S11 (mobile/touch editing).

The gate bans each by marker **and names its owner** in the failure message —
`onPointerMove`/`onDragStart`/`draggable`/`resizeHandle` → S03, `onWheel` →
S07, `onTouchMove` → S11, `watermark` → S09, `undoStack`/`redoStack` → S08 —
plus every shape of document mutation. `publicDesignSessionAutosave` and
`publicDesignSessionAssetCreate` remain off the curated boundary.

Verified in the browser: at 1440 the only `role="button"` nodes inside the
canvas are the elements themselves, and a component test asserts that count
exactly, so a zoom control, a layer row or a transform handle would show up as
an extra one.

No fake buttons and no disabled controls promising a capability that does not
exist. The historical spike watermark remains only inside the isolated harness.

## R. Mount / load / update / destroy

Mount builds the scene once (memoized on the document). Update re-derives on a
new snapshot and reconciles the selection. Destroy revokes the background object
URL, releases the runtime selection and retains no DOM node in state — there is
no engine instance to dispose because there is no engine.

The S/M/L proof asserts that after unmount the container is empty, no `<svg>`
remains, and **every** node that was on the stage reports `isConnected === false`
— a detached subtree still parented into a tree React no longer renders would
fail there.

## S. Responsive 1440 / 1024 / 390

| Viewport | Document scrollWidth | Overflow | Stage |
|---|---|---|---|
| 1440 | — | none | 1126 px wide |
| 1024 | 1009 | none | 935 px |
| 390 | 375 | none | 317 px, fits the viewport |

At 390 the stage is a truthful bounded presentation: zero interactive nodes
inside the canvas for an empty Session, zero handles or transform controls, and
the only button in `main` is S01's accepted "Kiểm tra phiên hiện tại". Mobile
editing remains `APP3-S11`'s and no S11 row was approved.

## T. Browser and network evidence

Real Storefront route through the real Nginx gateway, with the accepted S01
trustworthy-origin helper for the Session half. All **12** §42 steps:

1. `/san-pham/a03-live-check-redirect/thiet-ke` opened — S01 bootstrap intact.
2. BLANK Session created → **201**.
3. Empty Session showed the approved empty stage: `viewBox="0 0 400 400"`,
   0 `<canvas>`, 1 `<svg>`, "Thiết kế của bạn đang trống."
4. Session bootstrapped from a Template containing elements.
5. Text geometry: `matrix(1 0 0 1 110 150)`, family `Inter` from the registry.
6. Pre-transformed element placed by the engine's result, not by local math;
   image at `matrix(1 0 0 1 110 110)`, text at `matrix(1 0 0 1 110 150)`.
7. Selected the image → outline at `110,110,80×30`, `aria-pressed="true"`,
   status "Đang chọn: Hình ảnh".
8. Selected the text → **exactly one** outline, moved to `110,150,80×20`;
   image `aria-pressed="false"`; status "Đang chọn: Cá chép hoá rồng".
9. Clicked the empty stage → 0 outlines, "Chưa chọn đối tượng nào."
10. Real B02 background aligned: `href="blob:…"`, `x=0 y=0 width=1000
    height=800`… (`400×400` on the Session canvas), `preserveAspectRatio="xMidYMid meet"`.
11. Left the route → object URL fetchable before, **not** after; stage gone.
12. Image element showed the bounded placeholder at correct geometry.

Console on a clean navigation through the stage: **0 errors, 0 warnings**.

Network, complete `/api/` trace for the cloned-Session run:

```text
GET  /api/public/products/{slug}/placement                      200   (S01)
GET  /api/public/design-templates?productId=…&limit=12          200   (S01)
GET  /api/public/design-templates/s01-g3-mau-11                 200   (S01)
GET  /api/public/design-templates/…/versions/1/assets/…         200   (S01 preview, before bootstrap)
POST /api/public/design-sessions                                201   (S01 bootstrap)
GET  /api/public/products/{slug}/sides/kkkk/background          200   (S02)
```

The only S02 request is the Side background. **After** the Session was created,
no B05A call was made — the preview request precedes the create in the trace, so
no Template-asset route was used as a Session media shortcut. No Admin API, no
B06C, no Session asset upload, no autosave, no generic asset GET, no raw storage
URL, no new backend route.

One aborted background request appears beside the successful one: React
StrictMode's double-invoked effect in development, cancelled by the query's
`AbortSignal` — cancellation working, not a duplicate fetch.

## U. Production S/M/L DOM proof

`CMD-BENCH-APP3-S02-EDITOR` measures the shipped stage at **10, 50 and 100**
elements (100 is `APP3-P01`'s own `maxElements`, so L is the largest document
the schema permits). Rectangles only, so the arithmetic is exact.

At every size: exactly one `<svg>`; exactly one node group per element; DOM
descendants of the canvas equal `count × 2` (`<g>` + `<rect>`) with the area
rect discounted; the scene builds with no dropped or duplicated element; and
after unmount the container is empty with every former node detached.

The counts are **exact** rather than upper bounds: a ceiling would absorb
precisely the wrapper explosion, duplicated scene or hidden second copy it is
meant to catch. No new performance score was invented — this is structure.

## V. APP0 spike benchmark regression

`spike:editor:test` — PASS, 2 suites / 29 tests.
`spike:editor:benchmark` — PASS, 15 passed / 3 skipped (3.6 min).

SVG engine, desktop-chromium, Windows, against the accepted baseline:

| Scene | DOM nodes | firstUsable p95 | selection p95 | dropped frames |
|---|---|---|---|---|
| S | 112 → 112 | 34.4 → 33.8 | 34.2 → 34.3 | 0 → 0 |
| M | 225 → 225 | 34.6 → 34.3 | 34.7 → 34.8 | 0 → 0 |
| L | 508 → 508 | 34.4 → 33.6 | 34.0 → 34.4 | 0 → 0 |

Leak probe: 20 cycles, 0 bytes growth, 0 DOM nodes after — both runs. No
regression; timing differences are run-to-run noise on identical structure.

No budget or weight was rewritten. The run rewrote the frozen result files, so
after reading the comparison the spike tree was restored with `git checkout --
spikes/` and the accepted `APP0-R01` evidence is byte-identical. No spike source
was imported into production.

## W. Tests, checker and gates

**Storefront: 33 suites / 385 tests** (was 309), all passing.

New: `studio-scene.test.ts` (18 — adapter), `studio-stage.test.tsx` (24 —
stage and selection), `studio-stage-media.test.tsx` (14 — background and
placeholder), `studio-stage-scale.test.tsx` (12 — S/M/L). The static boundary
test grew from 23 to 27 cases.

**`check-app3-s02`** — PASS. Split by responsibility across
`check-app3-s02.mjs` (267), `check-app3-s02.sources.mjs` (156) and
`check-app3-s02-runtime.mjs` (344); tests 609. All within the §45 soft caps.

**`check-app3-s02.test.mjs`** — **55/55**. Each case breaks one ruled property
in a throwaway repository copy. The load-bearing ones are the mutations that
leave a working stage: a second `<svg>`; a graph built in the component instead
of asked of the engine; a reversed paint order; an outline measured with
`getBoundingClientRect`; a rendering engine in the manifest; revocation moved
out of effect cleanup; `placeholderData` restored; and B05A used as a Session
media shortcut. Three cases rewind the phase to prove the pre-S02 world still
refuses.

**S01 gate evolution (§47) — kept and made world-aware, never deleted.** The
feature is partitioned by an explicit list of the files S02 added; anything not
on it inherits the strict S01 rules by default, so a file added tomorrow cannot
escape them.

| Rule | Pre-S02 | S02 delivered |
|---|---|---|
| `<svg>` in the feature | 0 | exactly 1, and none in S01's own files |
| `<canvas>` | banned | banned |
| `publicProductSideBackgroundGet` | banned everywhere | banned in S01's files; one consumer |
| `zustand` | banned everywhere | banned in S01's files; the store may hold no Session identity |
| second Studio route | refused | refused |
| `APP3-S02 = COMPLETE` | refused before S01 delivered | permitted |
| section-06 rows approved | refused | permitted; every later row still refused |

`check-app3-s01` — PASS. `check-app3-s01.test.mjs` — **50/50** (was 45), with
five new world-aware cases including a second renderer arriving in a file no
rule names, and a Session id reaching the interaction store.

Related gates, all PASS: frontend test boundary, frontend build boundary,
storefront route authority, storefront product-detail authority, Figma design
index, `check-app3-b02`, `check-app3-p01`, `check-app3-p02`, `check-app3-b05a`,
`check-app3-b07`.

Package predecessors: `@embroidery/design-document` typecheck + 10 suites / 177
tests; `@embroidery/design-engine` typecheck + 6 suites / 137 tests.

api-client: `check:generated` PASS with tree hash
`d9aac2b3bfb322c1d604f2802e8a9b154bcb8744eabc780652658196d84735b9` **unchanged**;
typecheck PASS; 7/7 tests.

Global controls: `pnpm lint` 24/24, `pnpm format:check` clean, `git diff
--check` clean. Storefront typecheck, lint and production build all pass;
`/san-pham/[slug]/thiet-ke` is still listed `ƒ` (dynamic).

Four commands registered in `SCOPED_COMMAND_INDEX.md`:
`CMD-CHECK-APP3-S02`, `CMD-TEST-APP3-S02`, `CMD-TEST-APP3-S02-STOREFRONT`,
`CMD-BENCH-APP3-S02-EDITOR`. No root `package.json` script was added.

`CMD-BENCH-APP3-S02-EDITOR` is bound to the **production** S/M/L scene proof
(§41) rather than duplicating an id for the existing
`CMD-SPIKE-EDITOR-BENCHMARK`, which remains the sole performance authority. The
interpretation is disclosed here for review.

## X. Contract immutability

```text
OpenAPI        35 paths / 40 operations / 83 schemas   unchanged
migrations     34                                       unchanged
root scripts   30                                       unchanged
generated api-client tree   d9aac2b3…                   unchanged
```

The API runtime, the worker and the database were not touched; no path under
`apps/api`, `packages/database`, `apps/worker`, `packages/contracts/openapi` or
`packages/api-client/src/generated` is in Commit A, verified by an explicit
audit of the staged file list. The handwritten curated api-client newly exports
`publicProductSideBackgroundGet` and nothing else.

## Y. Follow-ups, deviations and file sizes

Carried unchanged: `FU-APP3-TEMPLATE-SOURCE-ASSET-INTAKE-01`,
`FU-APP3-CONFLICT-CODE-CONTRACT-01`, `FU-APP3-A02-D01-CONTRACT-DRIFT-01`,
`FU-APP3-DESIGN-SESSION-PEPPER-TEST-01`, `FU-ADMIN-SHARED-DIALOG-01`,
`FU-ADMIN-SHELL-NARROW-DESKTOP-01`, `FU-DESIGN-PUBLISH-DS-INPUT-01`. None was
reopened and no unrelated Admin or backend debt was touched.

### Deviations and disclosures

1. **Live Figma read not performed** — the connector exposes only
   authentication tools in this session. Permitted by §5; the registry and
   D01/D01-C1 fully resolved the three entries. No Figma artifact modified.
2. **`check-spike-boundaries` fails — pre-existing, not S02's.** It reports
   `packages/design-document/src/quantization/quantize.ts references spike
   code`. That reference is a **citation, not an import**: the value of
   `DESIGN_DOCUMENT_QUANTIZATION_AUTHORITY` names the ADR evidence path
   `spikes/app0-r01-design-studio/src/document/canonical.ts`, and the gate
   matches paths textually. Proved pre-existing by stashing every S02 change and
   re-running — the same single violation. Not repaired: repairing an unrelated
   gate is exactly the out-of-scope work §53 forbids.
3. **`infrastructure/docker/storefront.Dockerfile` changed** (§E). Required, not
   optional: without it the dev server and the production image both fail to
   resolve the new workspace dependencies. Not on §56's forbidden list and not
   part of §52's frozen set.
4. **`useStudioSession` gained a `scope` field** (§F). The minimum needed for
   the stage to draw the Session's own garment and area after a resume.
5. **`tools/smoke-app3-s01-fixtures.mjs` GENERATION bumped 2 → 3.** The previous
   revert archived generation-2 Templates and `on conflict (id) do nothing`
   keeps them archived, so a re-seed needs new ids — the mechanism the tool
   already documents, used the way `APP3-S01-C1` used it.
6. **The Admin template editor is a sibling stage.** `APP3-A03` renders its own
   SVG document stage in `apps/admin`, interpreting P01/P02 inline without an
   adapter. §44 forbids importing it and §8 forbids creating a shared package
   here, so S02 built its own — with the adapter boundary A03 lacks, and with
   the stroke constants and controlled-font resolution A03 does not use.
   Recorded as an observation for whoever owns renderer consolidation; no
   follow-up opened, because doing so would pre-empt a decision this checkpoint
   has no authority over.

### File sizes

Largest new source: `studio-stage-element.tsx` 219, `studio-scene.ts` 206,
`studio-stage-screen.tsx` 140, `studio-stage.tsx` 137 — all under the 400-line
maximum and under the 300-line review threshold except the first two, which are
split by responsibility (adapter vs. paint vs. matrix; stage vs. element vs.
selection) rather than by line count. Largest new test: 351, under 600. Checker
modules 267 / 344 / 156 and tests 609, within the §45 soft caps.

## Z. Commit A, roadmap and tree state

```text
Commit A = 3080073819470b000f4c22da153fda565feb7b26
subject  = feat(storefront): add Studio SVG stage and selection
files    = 41 changed, +4451 / −48
```

Contents: 12 new Storefront source files (renderer ×3, stage components ×6,
store, hook, service) plus 5 modified; 5 test files (4 new); 4 checker files
(all new) plus 5 modified S01 checker/tooling files; the curated api-client; the
Storefront manifest and lockfile; the Dockerfile; and three documents (phase
status, Figma registry, scoped command index).

Recorded forward authority:

```text
APP3-S01-C1 = COMPLETE — REVIEW_ACCEPTED
APP3-S01    = COMPLETE — REVIEW_ACCEPTED
APP3-S02    = COMPLETE — REVIEW_DELIVERED
APP3-S03    = READY — NOT STARTED
APP3-B06C   = READY — NOT STARTED
```

S02 is **not** self-accepted. Canonical dependency ownership is unchanged: S06
still requires B06C, S10 remains S01 + B08, S11 remains S03 + S07, S08 owns
undo/redo.

### Next recommendation

The canonical roadmap's `NEXT_RECOMMENDED_*` lines are re-read at the next
checkpoint's entry. If current authority still prioritises early WebKit
continuous-scale risk, the expected recommendation is **`APP3-S07`**; if the
canonical ordering says S03 first, that ordering wins. Nothing was implemented
toward either.

Branch `production`, working tree clean, Commit A immediately precedes Commit B,
nothing pushed.

### What this checkpoint does not claim

No drag, resize, rotate or flip. No layer editing. No text editing. No image
upload. No `APP3-B06C`. No zoom or pan. No undo or redo. No watermark. No
autosave. No mobile editing. No submission.
