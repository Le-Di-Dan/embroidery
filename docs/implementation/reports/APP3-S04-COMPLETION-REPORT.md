# APP3-S04 — Completion report

**Checkpoint:** `APP3-S04` — Studio layers / z-order / lock / hide / group
**Status:** `COMPLETE — REVIEW_DELIVERED — GROUP_BLOCKED`
**Commit A:** `46ad62f` `feat(storefront): add Studio layer controls`
**Branch:** `production` · nothing pushed

> **Read this first.** Four of the five capabilities the `APP3-S04` row names are
> delivered. **Group and ungroup are not**, and are reported blocked on accepted
> authority rather than invented — §N–§P below. Nothing in this report claims
> otherwise, and the gate refuses a status line that would let it.

---

## A. Entry and the `APP3-S06-C1` acceptance

Recorded before any source edit: `APP3-S06-C1` and `APP3-S06` moved to
`COMPLETE — REVIEW_ACCEPTED`, together with `S01`/`S01-C1`, `S02`, `S03`/`S03-C1`,
`S05`/`S05-C1`/`S05-MI01`, `S07`, `B06C`, `P01`, `P02`, `D01`, `D01-C1`. Entry
anchor `b460b32`; the accepted `APP3-S06-C1` Commit A is `4766447`.

## B. The three approved `APP3-S04` design rows

Section **08 — Studio Layers**, node `596:14`, page `APP_03`, file
`BQwqV8GdfUIELvsQDB1UQE`.

| Registry ID | State | Node |
| --- | --- | --- |
| `FIG-STUDIO-LAYERS-DESKTOP-DEFAULT` | List & Selection | `608:3` |
| `FIG-STUDIO-LAYERS-DESKTOP-REORDER` | Reordering | `608:68` |
| `FIG-STUDIO-LAYERS-DESKTOP-EMPTY` | Empty | `608:136` |

All three were `REVIEW_REQUIRED` at entry and are the only rows promoted, with
`APP3-S04 §4 operator review` as evidence. `FIG-STUDIO-EDITING-TABLET-1024`
(`618:140`) stays `APP3-D01-C1`'s responsive reference — a reference
re-attributed to a checkpoint becomes a licence for every capability drawn on it.
`S08`, `S09`, `S10` and `S11` rows remain `REVIEW_REQUIRED`, including
`FIG-STUDIO-MOBILE-LAYERSSHEET`, which is the same *capability* and a different
checkpoint. No Figma node was created, moved or edited. The design-index gate
passes (165 registry IDs).

**Disclosed:** the Figma MCP connector requires interactive OAuth, which was not
available in this run, so authority was resolved from `FIGMA_DESIGN_INDEX.md`,
`APP3-D01` §D and `APP3-D01-C1` §H exactly as §4 permits. No node id was guessed
and no frame content was invented.

## C. 1440 — the canonical presentation

The panel is in flow beside the stage, reusing the accepted inspector
presentation (same border, radius, spacing and control tokens the text and image
inspectors bind) rather than introducing a second surface language. No colour
literal; no `z-index` anywhere in the layer styles.

## D. 1024 — the existing topbar and the one right drawer

`APP3-D01-C1` §H says it in words: *"layers merge into that same drawer because
1024 cannot hold three regions"*. So the panel is one more **section** of the one
`618:140` drawer behind the one `APP3-S05-MI01` topbar trigger. Proved in a real
browser: **one** topbar, **one** drawer, **one** trigger, **one** layer list, and
the drawer's own rule strips the section border so it does not read as a stack of
cards. The stage does not move — SVG width **935 px open and closed**.

## E. 390 — the pre-`APP3-S11` boundary

Nothing that edits is *rendered*: zero layer lists, zero reorder controls, zero
`draggable` elements, zero bottom sheets. A CSS-hidden list would still be
focusable and its buttons would still fire, so the tier decides what exists, not
what is visible. What remains is one sentence that promises nothing. No
horizontal overflow at any of the three widths.

## F. One working document

The panel is a projection. There is no layer store, no `zIndex` field, no
visibility map, no lock map and no second `DesignDocument` — the gate refuses all
of them across the whole feature, and refuses a fourth Studio store by
enumerating the store directory. Every command reads the scene's document and the
graph the scene already resolved (never a second graph) and writes back through
the same `commit` the transform, text and image capabilities use.

## G. Bottom-first array, top-first list

```
document.elements[0]           = bottom-most = last row
document.elements[length - 1]  = top-most    = first row
```

The reversal happens **once**, at the end of the projection, so no rule in the
model reasons in two directions. The renderer is untouched: paint order is
document order, and the gate refuses a `.reverse()`, `.sort()`, `.toReversed()`
or `.toSorted()` on the scene or the stage. Proved live on a 10-element document:
list `bench-009 … bench-000`, paint `bench-000 … bench-009`.

## H. Labels and identity

Rows are keyed by the `APP3-P01` stable opaque id. The label is derived: a text
element names itself, everything else is named for the kind of thing it is, and a
group is `Nhóm`. Long text is cut at 32 **code points** — not UTF-16 units, so a
Vietnamese diacritic or an emoji is never split into replacement characters — and
the gate asserts the code-point form. No `assetId`, `derivativeId`, storage key or
element id is ever rendered as copy; the browser proof asserts the panel's text
contains none of the fixture ids. Repeated labels are expected and correct:
identity is the key, and a suffix built from an internal reference would put that
reference on screen to solve a problem the customer does not have.

## I. Drag reorder and the drop indicator

Native DOM drag and drop — no interaction library, and the manifest is unchanged.
The indicator is a `data-drop` attribute styled as a top border rather than an
inserted node, so the list height never changes mid-gesture and nothing reflows
under the pointer. Nothing about a drag is persisted; abandoning one leaves the
design exactly as it was.

A restack changes **the element array and nothing else**. The gate rules on the
`withElementMovedTo` body: it may not name `transform`, `childIds`, `visible:`,
`locked:`, `assetId`, `derivativeId`, `text:` or `crypto.randomUUID`, and it must
move within the array. The unit test additionally asserts every surviving element
is the **same object instance**, which is what keeps `APP3-S03-C1` reuse alive.

## J. The keyboard equivalent

Two adjacent-move controls per row — the smallest set that reaches every z-order
change a drag can reach. Both are real `<button>`s, both are disabled truthfully
at a boundary and for a nested row, and each disabled control is tied by
`aria-describedby` to real text saying why. Every restack is announced through a
polite live region.

Adjacency is computed over the **top-level sequence**, not the raw array: stepping
by one array index would walk an element into the middle of a group's children,
which is a place nobody pointed at.

## K. Selection

`APP3-S02`'s single `selectedElementId` is unchanged. A row is a second way to
reach the same element, never a second selection model — the gate refuses
`selectedElementIds` anywhere in the feature. Hiding the selected element clears
the selection, which is S02 §15's own rule ("a hidden element is not selectable")
applied at the moment the element stops qualifying; the transform chrome
disappears with it.

## L. Lock

`element.locked` is the whole model. The accepted editors already read it —
`APP3-S03` refuses a transform, `APP3-S05` a text edit, `APP3-S06` a replacement —
so this checkpoint supplies the control and adds no second authority. Never
`pointer-events: none`: a CSS rule stops a mouse and stops nothing else. Locking
changes no geometry, no z-order and no visibility, and does **not** deselect — a
locked element refuses mutation, not attention. A locked group is not rewritten
into its children.

Proved live: handles present → lock → handles gone, row reads `Đang khoá`,
selection retained → unlock → handles back.

## M. Hide and show

`element.visible`. The element, its geometry, its z-order and its media are
untouched and the row stays available so it can be shown again. Never a delete,
never a move to another list, never `opacity: 0` — an element at zero opacity is
still painted, still hit-testable and still counts against every budget, and the
gate refuses `opacity`, `filter((`, `splice(` and `slice(` inside the visibility
rule. Proved live: removed from paint, row retained, selection and handles
reconciled, then restored with the paint order byte-identical.

## N. Group authorization audit

The `APP3-S04` capability row names `group`, and §4 forbids silently dropping it.
It is therefore audited in full and reported blocked, not omitted.

| §14 question | Answer |
| --- | --- |
| A. Does S04 authorize CREATE GROUP? | The roadmap row names it; **no approved design draws it** |
| B. Does S04 authorize UNGROUP? | Same — named, undrawn |
| C. What UI selects the members? | **Nothing.** No approved frame contains a multi-select affordance |
| D. Panel-local or stage multi-select? | Neither is approved; `APP3-S02` is single-select and S04 may not add one |
| E. What group frame/pivot is authorized? | **None.** PO-07 defers the choice explicitly |
| F. Z-order on creation? | Would be answerable (membership is a relationship) — moot |
| G. Selected after group/ungroup? | Not specified anywhere |
| H. Nested groups? | P01 permits depth 8; no UI is designed |

Sources read: the three approved rows and `APP3-D01` §D
("layers list, drag-reorder with drop indicator, empty" — three frames, no group
state), `docs/05-DESIGN-STUDIO-SPEC.md` §4.5 (a conceptual product-level list that
also contains Duplicate, Delete, Align and Distribute, none of which the S04 row
carries — so it does not scope this checkpoint), the corrected roadmap row 26,
`IMP-D045` PO-06/PO-07/PO-12, and the current `APP3-P02` public API.

## O. Member-selection ruling — `GROUP_MEMBER_SELECTION_UI_NOT_AUTHORIZED`

The three approved frames are *List & Selection*, *Reordering* and *Empty*. None
draws a checkbox, a modifier-click affordance, a marquee or any other way to name
more than one element, and `APP3-S02`'s accepted model is one `selectedElementId`.
§15 forbids inventing one. There is therefore no approved interaction that can
say what a group would contain. (`APP3-S12`/`S13` own marquee multi-select as
`LATER_APP3` in any case.)

## P. Frame and pivot ruling — `GROUP_FRAME_AND_PIVOT_SEMANTICS_NOT_AUTHORIZED`

`IMP-D045` PO-07, verbatim:

> A future grouping interaction **must choose the frame**, rebase children into it
> and persist that explicitly — a later Studio checkpoint, never `APP3-P02`.

It says the choice must be made and does not make it. That choice is
consequential rather than cosmetic: under PO-03 and PO-05 the group's persisted
`width`/`height` define its **rotation and scale pivot** at
`(width/2, height/2)`, so a selection-AABB frame and a document-origin frame
produce different behaviour the first time anyone rotates the group — on
documents already saved under `schemaVersion = 1`. PO-07 further forbids the
group box ever being "recomputed from descendants", and PO-12 classifies a change
to the group frame as a **schema-semantic change** requiring a new Product Owner
decision, a schema-version increase and a migration.

Competing candidates, none authorized: selection AABB top-left with the AABB
size; selection AABB centre; the first selected child's frame; the Embroidery
Area origin; the document origin. Each is defensible and each yields a different
persisted document.

Per §17 this is reported rather than resolved. `FU-APP3-S04-GROUP-AUTHORITY-01`
is open and needs both a frame/pivot ruling and an approved member-selection
interaction before any checkpoint can implement grouping.

## Q–R. Group geometry and ungroup

Not implemented, and deliberately not approximated. No `childIds` is constructed
anywhere in the feature, no coordinate rebase exists in the layer capability, and
the gate refuses `type: 'group'`, `childIds: [`, `selectedElementIds` and
`toggleMember` feature-wide, plus `invertMatrix`, `multiplyMatrices`,
`composeMatrices` and `localMatrix` **inside the layer files**.

The matrix ban is scoped rather than feature-wide, and the scope is the point:
`APP3-S03` legitimately inverts a matrix to turn a pointer position into
element-local space, so a feature-wide ban fired on an accepted capability instead
of on a group rebase. A mutation test asserts that accepted use still passes —
the "a word ban fires on the honest artifact" failure, caught this time by the
mutation rather than by review.

## S. Groups that already exist

A cloned Template document may carry one, so a group gets its own truthful row
labelled `Nhóm`, its children get their own rows, and neither restacks into or out
of it: a nested row's move controls are disabled with a stated reason, and
`withElementMovedTo` refuses when either end is nested. Reading a group is not
creating one. `validateDesignDocumentStructure` re-proves the group graph —
single parent, no cycle, no unknown child, depth within the `IMP-D044` limit — on
every candidate.

## T. `APP3-P02` usage

None, deliberately. The three mutations cannot change a geometric answer:
`IMP-D045` PO-08 rules that "z-order never affects bounds" and that "hidden and
locked serialized elements still have geometry". Asking for containment or
physical size here would re-prove, every frame, a fact the operation cannot have
touched — §21 asks for the proof where a mutation *can* affect geometry and for no
ritual where it cannot. What *is* asked every time is P01 structural validation,
which is the thing that can fail.

## U. `APP3-S03-C1` render reuse

Preserved without touching the mechanism. `shareDocumentIdentity` already handles
a restack correctly — it keeps every element instance and marks the document
changed because paint order is z-order — so a reorder re-renders the moved
subtrees and not the scene. The component test asserts an element above the move
is not re-rendered, through the same `elementLabel` seam `APP3-S03-C1` counts
with. No second renderer cache, and no `RenderableElement` is mutated.

## V. Coexistence with `APP3-S05` and `APP3-S06`

Live proof on a **mixed** document (10 shapes + a real uploaded image): locking a
text element makes the S05 inspector refuse it and unlocking restores the exact
value; the image's object URL is **byte-identical**
(`blob:http://localhost/cde8a50e-…`) across three restacks, a lock, an unlock, a
hide and a show; and no `publicDesignSessionAsset*` request is made by any of
them. Runtime media identity stays derivative-based.

## W. `APP3-S07` viewport

Untouched. Zoom read `Mức phóng 100%` before and after every layer operation, and
the safe-area toggle is unchanged. No layer operation writes a viewport value into
document geometry.

## X. Accessibility

Named region; every row and control a real `<button>`; the selected row carries
`aria-pressed`; lock and visibility controls carry both state (`aria-pressed`) and
an accessible name that includes the layer label; drag is not the only reorder
path; every restack is announced politely; disabled boundary controls are
explained by real text tied with `aria-describedby`; hidden and locked state is
carried in words as well as styling, never colour alone; controls bind the same
`$size-touch-target-min` token `APP3-S03` bound its handles to. Mobile
accessibility is **not** claimed complete — `APP3-S11` owns that surface.

## Y. 1440 browser proof

Real Studio route, real Session, real cloned Template, `http://localhost` via the
accepted `APP3-S01` trustworthy-origin helper (applied and restored).

| # | Proof | Result |
| --- | --- | --- |
| 1–2 | List top-first vs paint bottom-first | list `bench-009…000`, paint `bench-000…009` |
| 3 | Row selects the SVG element | row `aria-pressed=true`, SVG `data-selected=true`, handles + `Rộng 12,5 mm · Cao 12,5 mm` |
| 4–6 | Drag across another row | `bench-008`/`bench-009` swapped in the paint order, then swapped back by a second drag |
| 5 | Drop indicator during the drag | `data-drop="true"` on the hovered row |
| 7 | Selection survives | still `bench-000` |
| 8 | Keyboard reorder | focus the control, `Enter` → paint `bench-001, bench-000, …`, announced *"Đã đưa lớp Hình khối lên trên."* |
| — | Boundary | top control disabled, reason *"Lớp đã ở trên cùng."* |
| 9–11 | Lock / unlock | handles present → gone → present; row reads `Đang khoá`; selection retained |
| 12–16 | Hide / show | removed from paint, row retained, selection cleared, handles gone; restored with an identical paint order |
| 17 | Viewport | `Mức phóng 100%` throughout |
| 18 | No autosave or history UI | none present |
| 19 | **API delta** | **0 requests** across select, drag, keyboard reorder, lock, unlock, hide, show |

A real image was uploaded mid-proof (`202` → status polls → Blob) so the document
was genuinely mixed: 11 rows, the image first in the list and last in the paint
order, labelled `Hình ảnh`, auto-selected.

## Z. 1024 browser proof

One topbar, one drawer, one trigger. Closed, the drawer is `hidden`, so no layer
control is reachable. Open, the drawer contains exactly one layer list and it is
the only one on the page. **SVG width 935 px open and closed** — the drawer does
not push or shrink the stage. No horizontal overflow. Six open/close cycles left
the DOM node count identical (1257 → 1257).

## AA. 390 boundary proof

Zero layer lists, zero reorder controls, zero `draggable` elements, zero bottom
sheets, no horizontal overflow, and one truthful sentence.

## AB. API delta zero

Recorded with a request listener over every `/api/` call during select, drag,
keyboard reorder, lock, unlock, hide, show and a further restack of the image:
**empty**. No autosave, no Session mutation, no `APP3-B06C` refetch, no Template
or Asset call.

## AC. Bounded L=100 render sanity

| Fact | Value |
| --- | --- |
| SVG roots / canvases | 1 / 0 |
| Layer lists | 1 |
| Rows / painted elements | 100 / 100 |
| DOM nodes before / after eight restacks | 1253 / 1253 |
| Restack, click → two rAFs (8 samples) | 24.7 – 47.7 ms |

No node leak, no duplicate layer-render tree, no second renderer. The timings are
a **sanity observation, not a budget**: they are measured end-to-end including two
`requestAnimationFrame` settles, which the accepted `APP3-S03` harness already
records as a ~33 ms floor, so they are dominated by the settle rather than by the
restack. No new performance budget is invented, and no `APP3-S03`/`APP0`
production benchmark was rerun — no frame-render code changed.

## AD. Checker and mutation evidence

`node tools/check-app3-s04.mjs` → PASS.
`node --test tools/check-app3-s04.test.mjs` → **51 tests, 51 pass, 0 fail**.

Mutations that leave a **working panel** behind: the renderer reversed so the list
reads top-first "naturally"; a `zIndex` added; rows keyed by array position; a
reorder that also writes a transform or a `childIds` entry; hide as `opacity: 0`
or as a delete; the lock moved into CSS; the P01 validation replaced by a
fabricated `{ ok: true }`; a group construction; a member accumulator; a matrix
rebase inside the layer files; a second drawer component; a fourth store; a
mobile bottom sheet; a `<canvas>`; an unregistered command; an interaction
library. Plus the two the status carries: a phase document that drops the group
ruling, and a bare `COMPLETE` that would read as though grouping shipped.

### World-aware predecessor gate evolution

Six accepted gates asserted properties that were true only because S04 had not
opened. Each was **narrowed, never deleted**:

- `onDragStart`/`onDragEnd`/`draggable` were attributed to `APP3-S03` in the S02
  and S07 runtime gates. `608:68` draws a drag-reorder, so the marker is now
  legitimate in S04's six files and as forbidden as ever everywhere else.
- The S01 partition subtracts `S04_FILES`, as it already does for S02/S03/S05/S06.
- `APP3-S04 = COMPLETE` stopped being evidence of a later checkpoint claiming
  credit in the S03, S05 and S06 gates.
- The three S04 registry rows stopped being evidence of a blanket Studio approval
  in the S01, S02, S03, S05, S06 and S07 gates.
- Four `no layer control` component assertions became *no **second** layer
  surface*: the panel exists, and the text inspector, the tablet drawer and the
  transform chrome are each proved not to be it.

**One real finding from doing this.** The S01 and S02 blanket-approval rules
listed one row per later Studio checkpoint. With `APP3-S04` open, **every row in
both lists belonged to a checkpoint that had opened** — so the world-aware
exclusion emptied the rule completely: it still ran, still passed, and asserted
nothing. Both lists now also carry the four rows whose checkpoints are still
closed (`S08`, `S09`, `S10`, `S11`), and the mutations that exercised them were
repointed to a still-closed row. A blanket-approval rule with no closed row left
in it is the shape of a gate that has quietly stopped being a gate.

## AE. Contract immutability

| Artifact | Value | Status |
| --- | --- | --- |
| OpenAPI | 37 paths / 42 operations / 84 schemas | unchanged |
| OpenAPI SHA-256 | `f39e9e8fca1de08417359aeb299b874c346e21902b21375c9159124ed63d3817` | identical |
| Generated client tree | `c2fb229f69f4d0033b081e7f2aca7328653c5eeb6bebfb5658feb6fe8ba4a2d6` | identical |
| Migrations | 34 | unchanged |
| Root scripts | 30 | unchanged |

`openapi:check` and `api-client check:generated` both report up to date. No
generation was run. No API, worker, database, dependency or lockfile change.

## AF. Changed files, sizes and deviations

**New (12):**

| File | Lines |
| --- | --- |
| `…/design-studio/model/studio-layers.ts` | 295 |
| `…/design-studio/model/studio-layer-copy.ts` | 79 |
| `…/design-studio/hooks/use-studio-layers.ts` | 219 |
| `…/design-studio/components/studio-layers-list.tsx` | 210 |
| `…/design-studio/components/studio-layers-panel.tsx` | 66 |
| `…/design-studio/components/studio-stage-status.tsx` | 82 |
| `test/unit/studio-layers-model.test.ts` | 306 |
| `test/components/studio-layers.test.tsx` | 416 |
| `tools/check-app3-s04.mjs` | 210 |
| `tools/check-app3-s04-runtime.mjs` | 374 |
| `tools/check-app3-s04.sources.mjs` | 95 |
| `tools/check-app3-s04-status.mjs` | 25 |
| `tools/check-app3-s04.test.mjs` | 504 |

**Modified (29):** the stage screen, the stylesheet, four predecessor component
suites, the boundary partition module, the design registry, the command index,
the phase document, and nineteen predecessor gate/source/test modules.

Every runtime source is inside CLAUDE.md §6's 400 lines and every runtime test
inside 600. All tooling is inside §37's soft caps after one split by
responsibility (governance in `check-app3-s04.mjs`, runtime rules in
`check-app3-s04-runtime.mjs`), the same shape `APP3-S02` and `APP3-S07` use.

`studio-stage-status.tsx` is an extraction, not new behaviour: the stage's
textual status moved out of `StudioStageScreen` unchanged when adding the panel
took that file to 414 lines. Its content is `APP3-S02`/`S03`'s.

**Deviation, disclosed.** The `APP3-S04` design package contains no frame showing
a lock or a visibility control — its three frames are List & Selection,
Reordering and Empty. §4 forbids dropping the roadmap-owned capabilities, so both
are implemented as per-row toggles following the accepted `APP3-A03` Admin layer
panel (state in text, type + name, `aria-pressed`), and their exact visual
treatment is **not** covered by an approved frame. Flagged for review rather than
treated as authorised.

### Validations run

| Command | Result |
| --- | --- |
| `node tools/check-app3-s04.mjs` | PASS |
| `node --test tools/check-app3-s04.test.mjs` | 51/51 |
| `pnpm --filter storefront test` | 46 suites / **727** tests (from 44 / 668) |
| `pnpm --filter storefront lint` / `typecheck` / `build` | clean |
| `node tools/check-figma-design-index.mjs` | PASS, 165 registry IDs |
| `check-app3-{s01,s01-runtime,s02,s02-bans,s02-runtime,s03,s03-reuse,s03-runtime,s05,s05-responsive,s05-runtime,s06,s07,s07-runtime}` | all PASS |
| `openapi:check`, `api-client check:generated` | up to date |
| `prettier --check`, `git diff --check` | clean |

**Pre-existing failures, disclosed not repaired.** Seven gate mutations fail, and
fail **byte-identically at entry HEAD** (verified under `git stash`): `s02` ×3
(`refuses B06C recorded complete inside this checkpoint`, `refuses B05A used as a
Session media shortcut`, `refuses a changed OpenAPI surface`), `s03` ×1 and `s07`
×1 (`refuses a changed OpenAPI surface`), `s05` ×2 (`refuses a later checkpoint
recorded complete`, `refuses a topbar mounted below the stage`). None is in
`APP3-S04`'s scope and none was introduced here.

No worker, API, database or E2E suite was run: nothing they own changed.

## AG. Command ledger

`.git/app3-s04-finish-state.md` carries the run. No unchanged-fingerprint
confidence rerun; no real-time sleep anywhere; the entry-baseline comparison was
taken once, under `git stash`, and reused.

## AH. Follow-ups

```text
FU-APP3-S04-GROUP-AUTHORITY-01 = OPEN
  group and ungroup need a Product Owner ruling on the persisted group frame and
  pivot (IMP-D045 PO-07 / PO-12) and an approved member-selection interaction
FU-APP3-TEMPLATE-SOURCE-ASSET-INTAKE-01 = OPEN (unchanged, still unowned)
```

## AI–AK. Commit, roadmap, tree

Commit A `46ad62f` `feat(storefront): add Studio layer controls` — 42 files. No
completion report, no API, worker, database, migration, generation, Figma
mutation or later-checkpoint capability.

```text
APP3-S04 = COMPLETE — REVIEW_DELIVERED — GROUP_BLOCKED
APP3-S09 = BLOCKED_BY_APP3-S04_REVIEW_ACCEPTANCE
```

After human acceptance, `APP3-S04 = COMPLETE — REVIEW_ACCEPTED — GROUP_BLOCKED`,
`APP3-S09 = READY — NOT STARTED`, and the frontend order continues
`S09 → S08 → S10 → S11`.

Branch `production`, working tree clean, Commit A immediately precedes Commit B,
nothing pushed. The development environment was restored: the trustworthy-origin
helper reverted to tracked configuration, browser artifacts deleted, no database
row created beyond the Sessions the proof itself opened. No `.env` was written and
no credential was read, logged or rotated.

**Not self-accepted.**
