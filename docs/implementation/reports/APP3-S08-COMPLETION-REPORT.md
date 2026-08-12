# APP3-S08 — Studio undo / redo / bounded local history

**Status:** `COMPLETE — REVIEW_DELIVERED`
**Branch:** `production` · **Commit A:** see §AA · **Commit B:** this report

---

## A. Entry and the accepted predecessor

Human review accepted `APP3-S09` at entry, and the phase document was updated to
record it before any source was touched:

```text
APP3-S09 = COMPLETE — REVIEW_ACCEPTED        (was COMPLETE — REVIEW_DELIVERED)
APP3-S08 = COMPLETE — REVIEW_DELIVERED       (was BLOCKED_BY_APP3-S09_REVIEW_ACCEPTANCE)
APP3-S10 = BLOCKED_BY_APP3-S08_REVIEW_ACCEPTANCE
```

Accepted `APP3-S09` Commit A: `6344a72 feat(storefront): add Studio runtime watermark`.

`FU-APP3-S04-GROUP-AUTHORITY-01` and `FU-APP3-TEMPLATE-SOURCE-ASSET-INTAKE-01`
stay **OPEN**. The S08 gate asserts the first of those is still open, because a
history with no group action is only correct while there is no group capability.

---

## B. The two design rows

Section 12 — Studio Undo / Redo, node `596:18`, frame count 2. Both rows were
`REVIEW_REQUIRED` at entry and are now `APPROVED_FOR_IMPLEMENTATION` with
`APP3-S08 §4 operator review` as their evidence:

| registry id | node | state |
|---|---|---|
| `FIG-STUDIO-UNDO-DESKTOP-MIDHISTORY` | `609:147` | Mid History |
| `FIG-STUDIO-UNDO-DESKTOP-DISABLED` | `609:209` | Nothing to Undo |

No third frame was invented, no node was created, moved or edited, and the 1024
reference (`FIG-STUDIO-EDITING-TABLET-1024`) stays `APP3-D01-C1`'s — the gate
fails if it is re-attributed here. `FIG-STUDIO-AUTOSAVE-DESKTOP-SAVED` and
`FIG-STUDIO-MOBILE-LAYERSSHEET` remain `REVIEW_REQUIRED`.

`node tools/check-figma-design-index.mjs` — **PASS** (165 registry IDs, 165 node
rows, 15 tables).

**Disclosed limitation.** `APP3-S08 FIGMA_READ = REGISTRY_AND_D01_ONLY`. The
Figma MCP connector needs interactive OAuth, which is unavailable in this run —
the same limitation `APP3-S09` recorded. Authority came from
`FIGMA_DESIGN_INDEX.md` and `APP3-D01` §D, which records the section exactly:
*undo-redo with a history list, a disabled state and keyboard hints*, plus the
directive **not to imply an infinite history**. Every placement decision taken
without a readable frame is disclosed in §P and §Q.

---

## C. History design authority

`ADR-APP0-001` §6 and `IMP-D026` say the same thing in the same words: *undo/redo
is a domain command/snapshot concern, never an engine history stack*. So an entry
is:

```ts
interface StudioHistoryEntry {
  readonly seq: number;                 // stable row key, eviction-proof
  readonly action: StudioHistoryAction; // one closed kind + one bounded label
  readonly before: DesignDocument;      // APP3-P01
  readonly after: DesignDocument;       // APP3-P01
}
```

and nothing else. A DOM node, an `SVGElement`, an `APP3-P02` graph, a `Blob`, an
object URL, a query result, an upload progress, a Session credential, a
selection, a zoom, a pan or a watermark token cannot reach one — a
`DesignDocument` is closed over JSON scalars by construction, and the gate refuses
each of those names inside the seven files this checkpoint owns.

**Why both ends of every entry.** Undo restores `before`, redo restores `after`,
and neither recomputes anything. An inverse-operation undo has to invert every
mutation exactly, and the first one it gets subtly wrong corrupts a design rather
than failing. Storing both ends costs two references: consecutive entries share
the document between them, so *n* actions hold *n + 1* distinct documents.

---

## D. One current document

The past and the future live **in the store that already owns the working
document**, not in a controller beside it:

```ts
sessionKey, document, history: { entries, cursor }, openAction, nextSeq
```

`document` stays the single current truth; `entries`/`cursor` are archival values
nothing renders. `undo`/`redo` write `document` and move the cursor **in the same
`set`**, so the two cannot disagree even for one render. There is no
`historyCurrentDocument`, no `presentDocument` and no second editable scene — the
gate refuses all three names feature-wide, and asserts the store count is still
exactly three (`document`, `interaction`, `viewport`).

`APP3-S03`'s own rule is untouched: `initialize` on the same session key is still
a no-op, so a re-render or a re-fetch cannot discard a local edit.

---

## E. The bounded capacity ruling

**No accepted numeric bound exists.** I audited `docs/05-DESIGN-STUDIO-SPEC.md`
(§4.6 names Undo and Redo and no number), `ADR-APP0-001`, `APP0-R01`,
`IMP-D026`, `docs/04-BUSINESS-RULES.md`, `docs/10-NON-FUNCTIONAL-REQUIREMENTS.md`
and the phase plan. None fixes a capacity.

So `MAX_HISTORY_ENTRIES = 50` is the **`APP3-S08` §6 operator fallback**, recorded
as `APP3-S08 BOUND = 50` with its provenance. It is an in-memory engineering limit
for one browser tab: it appears in no API, no document field, no database column
and no published contract. When it is reached the **oldest** entry is discarded,
so the most recent work stays reachable.

The panel **states** the number — `Chỉ giữ 50 thay đổi gần nhất trong phiên này.`
— because `APP3-D01`'s directive for this section forbids implying an infinite
history, and the only way not to imply it is to say what the limit is. The gate
refuses `vô hạn`, `không giới hạn`, `toàn bộ lịch sử` and `mọi thay đổi` in the
published strings.

---

## F. Action labels

A closed set of twelve kinds, each with one Vietnamese sentence:

| kind | row |
|---|---|
| `move` / `resize` / `rotate` | Di chuyển / Đổi kích thước / Xoay *{layer}* |
| `reorder` | Đổi thứ tự *{layer}* |
| `lock` / `unlock` | Khoá / Mở khoá *{layer}* |
| `hide` / `show` | Ẩn / Hiện *{layer}* |
| `text-edit` / `text-format` | Sửa nội dung / Đổi định dạng *{layer}* |
| `image-place` | Thêm hình ảnh |
| `image-replace` | Thay hình ảnh *{layer}* |

The layer name is `layerLabel()` — the **layer panel's** bounded 32-code-point
name, reused rather than re-derived. No element id, `assetId`, `derivativeId`,
`sessionId` or JSON fragment can reach a row; the gate refuses each of those
names in the model and asserts the three call sites go through `layerLabel(`.
A kind with no label falls back to `Thay đổi thiết kế` rather than inventing one.

---

## G. Forward mutation and redo clearing

A new forward mutation appends one entry and **discards the future**: the branch
the customer had undone is no longer reachable from the design they now have, and
keeping it would offer a redo that reinstates a document their latest edit was
never applied to.

```ts
const kept = [...entries.slice(0, cursor), entry];   // the future is dropped here
const overflow = kept.length - MAX_HISTORY_ENTRIES;  // then the oldest, if full
```

A **rejected or no-op** mutation appends nothing and leaves the future intact —
proved live (§Q) and in both suites.

---

## H. Undo / redo semantics

`undo` writes `entry.before`; `redo` writes `entry.after`. Both go straight into
`document` and **never through `commit`** — an undo that recorded itself would
append an entry the next undo then reverses, and the state before it would be
unreachable. The gate anchors that rule on the `undo: () => {` *implementation*
(see §W for why the first version of it read nothing).

Neither calls any operation: no `APP3-B08` autosave, no Session revision move, no
Asset delete, no re-upload, no worker or storage effect. §S and §T carry the
network proof.

---

## I. Selection reconciliation

Selection is **not** history: it is never snapshotted and never restored, and the
gate refuses `selectedElementId` and `useStudioInteractionStore` inside the S08
files and inside the store that holds the snapshots.

After an undo or a redo the existing `APP3-S02` reconciliation runs against the
scene's present ids, exactly as it does for a resume — so undoing the insertion of
the selected new image clears the stale selection, and nothing fabricates a
selection on redo. Proved by JSON-inspecting the entries (no `selectedElementId`
anywhere) and by selecting a different element before an undo and finding it
untouched.

---

## J. Viewport and watermark exclusion

No `APP3-S07` zoom, pan or `zoomStep` and no `APP3-S09` token appears in a
snapshot, a label or the store that holds them. Proved live at 300 % with an
extreme pan: `translate(0%, 0%) scale(1.5)` before and after two undos and a redo,
zoom read-out `Mức phóng 150%` unchanged, token `WPYNFUHJ` unchanged, 35 marks
throughout. There is no watermark history row, because the watermark is not in
the document history operates on.

---

## K. `APP3-S03` gesture coalescing

The gesture already froze everything it needs: `begin()` captures `startDocument`
at `pointerdown`. `APP3-S08` brackets that same lifecycle:

```text
pointerdown  → beginAction({ kind, label })   // baseline captured once
pointermove  → commit(candidate, action)      // per rAF frame; appends nothing
pointerup    → endAction()                    // exactly one entry, if changed
```

**Zero per-frame cost added.** No snapshot, no `JSON.parse(JSON.stringify())`, no
`structuredClone` and no allocation on the frame path — the gate asserts that
`beginAction`, `JSON.parse`, `structuredClone` and `JSON.stringify` appear nowhere
in the `apply()` frame callback. The one document comparison runs **once**, at the
boundary, and short-circuits on reference equality (the common case: a gesture
that refused every frame never committed).

Accepted `APP3-S03` pointer-cancel semantics are unchanged. Unmounting mid-gesture
closes the action rather than leaving it open forever.

Live: **24 pointer frames → exactly one history row**, and the undo restored the
starting matrix to the digit (§Q).

---

## L. `APP3-S05` text coalescing

A deterministic edit **session**, not a debounce timer:

```text
focus on the text box                  → beginAction({ kind: 'text-edit', … })
keystrokes / IME composition frames    → commit inside the session; no entry
blur, or the selected element changes  → endAction(); one entry if changed
```

The IME path is unchanged and cannot straddle the boundary: a composition happens
entirely inside a focused field, and `APP3-S05` still commits nothing until
`compositionend`. Proved: five keystrokes → 0 entries, then blur → 1; four IME
frames + `compositionend` → 0 standalone entries, then blur → 1.

A **property** edit (font, style, weight, size, alignment) is its own atomic entry
— the control blurs the textarea, which closes the session first, and the store
additionally closes an open action when a commit of a different kind arrives.

The gate refuses `setTimeout`, `setInterval` and `debounce` in the text controller.

---

## M. `APP3-S04` integration

Reorder, lock/unlock and hide/show each produce **one** entry, named for the layer.
A candidate `APP3-P01` refused never reaches the store, so a refusal appends
nothing. Group and ungroup do not appear at all: there is no group action kind,
because there is no group capability — the gate refuses one being added while
`FU-APP3-S04-GROUP-AUTHORITY-01` is open.

Live: reorder changed the SVG paint order, undo restored it exactly, redo
re-applied it; lock and hide each undone.

---

## N. `APP3-S06` image semantics

History begins only when the **document** changes:

| event | entries |
|---|---|
| upload accepted, `INSPECTING`, polling | 0 |
| inspection **rejected** | 0 |
| successful initial placement | 1 (`Thêm hình ảnh`) |
| successful replacement | 1 (`Thay hình ảnh {layer}`) |
| placement refused by `APP3-P02` | 0 |

Undo removes only the local `ImageElement`. It **deletes no Asset** — and that is
structural rather than a promise: no delete operation exists on the Studio's
boundary at all, and the gate asserts none becomes reachable. Redo restores the
same `assetId`/`derivativeId` and **uploads nothing**.

Proved live with two real uploads (§T).

---

## O. Shortcuts and the native-input boundary

Exactly two combinations, the two the approved hints name:

```text
Undo  Ctrl/Cmd + Z
Redo  Ctrl/Cmd + Shift + Z
```

`Ctrl+Y` is deliberately **unbound** — no authority and no existing convention in
this application establishes it, and a shortcut that is not drawn is a capability
nobody approved. Bound on `keydown` (the event the platform's own handling reads),
an already-`defaultPrevented` event is left alone, and the listener is removed on
unmount.

**The editable-field boundary.** The handler stands down entirely when the event
target is an `input`, `textarea`, `select` or `isContentEditable` element, so the
platform's own text undo owns that keystroke. One keystroke doing two different
undos, with the customer unable to predict which, is the defect this prevents.

Live: the same `Ctrl+Z` moved the cursor when dispatched outside a field and did
nothing when dispatched inside one; `Ctrl+Y` and a pre-prevented event both did
nothing.

---

## P. History-list interaction ruling

**The list is informational.** There is no click-to-time-travel: the rows are
`<li>`s carrying what happened and whether it is applied, and the gate refuses
`<button>`, `onClick`, `tabIndex` and `role="button"` inside the `<ol>`.

`APP3-S08` §14 is explicit that the presence of a list is not authority for
arbitrary jumping, and the two approved frames name a *Mid History* state and a
*Nothing to Undo* state — both of which are exactly what stepping with the two
controls produces. Jumping to an arbitrary row is a different interaction with
different questions behind it (what happens to the entries in between; what the
redo control then means), and inventing answers to those without a readable frame
would be a capability nobody approved.

Live: `studio-history-list` contains 0 buttons and 0 links.

---

## Q. Browser proof — 1440 / 1024 / 390

Real Storefront Studio at `http://localhost/san-pham/a03-live-check-redirect/thiet-ke`
over a trustworthy origin, a real anonymous Session, a real 10-element document.

**1440**

| claim | evidence |
|---|---|
| initial state | undo **disabled**, redo **disabled**, reason `Chưa có thay đổi nào để hoàn tác.`, 0 rows |
| shortcut hints | `Phím tắt: Ctrl/Cmd + Z Ctrl/Cmd + Shift + Z` — no third combination |
| bound stated | `Chỉ giữ 50 thay đổi gần nhất trong phiên này.` |
| list is informational | 0 `<button>`, 0 `<a>` inside `studio-history-list` |
| **24-frame drag → 1 row** | `Di chuyển Hình khối · Đang áp dụng` |
| undo restores exactly | `…105.68413600817735 102.70771698949837` (the pointerdown matrix, to the digit) |
| redo restores exactly | `…131.26143600817736 131.27911698949836` — identical to pre-undo |
| row state as text | `Đã hoàn tác` / `Đang áp dụng`, live region `Đã hoàn tác: Di chuyển Hình khối.` |
| reorder | paint order changed → undo restored → redo re-applied |
| lock | `aria-pressed` true → undo → false |
| hide | one entry; redo branch then **discarded** by the next forward edit |
| new edit clears redo | redo enabled after undo, **disabled** after the hide |
| **rejected image → 0 rows** | an 8×8 PNG refused by inspection added no history at all |
| placement | one row `Thêm hình ảnh` |
| undo placement | image element count 1 → 0; live `Đã hoàn tác: Thêm hình ảnh.` |
| redo placement | 1 image again, **same asset** (§T) |
| viewport unchanged | `scale(1.5)` and `Mức phóng 150%` identical across undo/redo |
| watermark unchanged | token `WPYNFUHJ`, 35 marks, identical across undo/redo |
| keyboard | Ctrl+Z ×2 stepped the cursor 2→1→0; Ctrl+Shift+Z → 1; Ctrl+Y and `defaultPrevented` → no change |
| editable-field boundary | same keystroke ignored inside a `textarea`, acted outside it |
| reload | picker, 0 rows, no history control, **0 application storage keys** |

**1024** — 1 topbar, **1** drawer, **1** history control **inside** that drawer,
drawer sections in order `Thuộc tính chữ thêu · Ảnh thiết kế · Lớp thiết kế ·
Lịch sử chỉnh sửa`, the `APP3-S07` strip carries no history control, no horizontal
overflow.

**390** — **0** history controls, **0** history lists, 0 layer lists, 0 drawers,
0 bottom sheets, notice `Hoàn tác cần màn hình lớn hơn.`, no horizontal overflow
(`scrollWidth === clientWidth === 375`).

---

## R. Session reset and reload

A different Session key clears both stacks and makes the new snapshot the
baseline; the same key is a no-op that preserves local edits. `reset()` clears
everything. Nothing is persisted — `localStorage`, `sessionStorage`, `IndexedDB`,
cookies and the URL are all refused feature-wide by the gate and by the boundary
suite.

Live after a reload: 0 rows, no history control, and `localStorage` empty. The two
`sessionStorage` keys present are Next.js's own dev debug channel
(`__next_debug_channel:*`), not this application's.

---

## S. Network proof

Every request the Studio made across the whole 1440 journey:

```text
GET   /api/public/products/{slug}/placement
GET   /api/public/design-templates?…
GET   /api/public/design-templates/{id}
POST  /api/public/design-sessions                       201
GET   /api/public/products/{slug}/sides/{code}/background
POST  …/assets                                          202   (upload 1 — rejected)
GET   …/assets/{a1}/status                              ×2
POST  …/assets                                          202   (upload 2 — accepted)
GET   …/assets/{a2}/status                              ×3
GET   …/assets/{a2}/editor-preview                      ×2
```

- **No `publicDesignSessionAutosave`.** None, at any point.
- **No Session revision mutation** from any history operation.
- **No DELETE** of anything.
- **Zero requests** attributable to undo or redo, except the one disclosed below.

**Disclosed, and legitimate.** The second `editor-preview` GET is the `APP3-B06C`
Blob re-read `APP3-S08` §8 permits: undoing the placement removed the element, so
`APP3-S06`'s media hook revoked its object URL in cleanup; redoing it needs the
bytes again. It addresses **the same asset id** as the first read. That is renderer
media loading, not an undo/redo mutation — and it is why the object URL string
differs across undo/redo while the media *identity* does not.

---

## T. Image Asset side-effect proof

Two `POST …/assets` in the whole run, both from a customer choosing a file
(one rejected 8×8, one accepted 600×400). **Redo issued no third.** Both
`editor-preview` reads address `019ff685-ea28-7c10-ac54-d0365d8fdef5` — the same
asset the placement used — so redo restored the same media identity rather than
re-uploading. No delete request exists, and no delete operation is reachable.

---

## U. Performance and memory

`APP3-S08` §20 requires a bounded L=100 transform sanity run because the S03
gesture source changed. **It does not meet the frozen 20 ms p95 budget — and
neither does the unchanged predecessor.**

Chromium, L=100, same machine, same containers, back to back, each after warming
the route twice:

| gesture | HEAD (`APP3-S09` accepted) | this branch |
|---|---|---|
| move | p50 16.7 · **p95 33.4** · dropped 5 | p50 16.7 · **p95 33.4** · dropped 5 |
| resize | p50 16.7 · **p95 33.3** · dropped 3 | p50 16.7 · **p95 16.7** · dropped 2 |
| rotate | p50 16.7 · **p95 33.4** · dropped 5 | p50 16.7 · **p95 33.4** · dropped 4 |

**The verdict: identical, and resize is marginally better.** `APP3-S08` adds no
measurable per-frame cost, which is what §10 predicted from the construction —
the baseline is `APP3-S03`'s existing `startDocument`, captured once at
`pointerdown`, and the only per-frame addition is one object literal
(`{ kind, label }`). The one document comparison runs at the gesture boundary and
short-circuits on reference equality.

**What I got wrong on the way, stated plainly.** My first readings were
move 83.4 / resize 66.7 / rotate 99.9, and a later pair at ~100. Both were taken
in a loaded window — the 4th and 5th Sessions of the hour, immediately after full
jest runs — and **p50 was 33.3 there against 16.7 here**, i.e. the machine was
missing every vsync. I did not report those as a regression, and I did not
attribute them before measuring HEAD. That is the `APP3-S05` lesson applied:
*a budget breach is not a render regression until HEAD says so.*

I also added a memoization (`useMemo` on the rows, `memo` on the list) on the
hypothesis that the panel was re-rendering per frame. The measurement says it was
never the cause. **It is kept anyway** — the screen genuinely re-renders on every
pointer frame and the history genuinely cannot change during a coalesced action,
so not rebuilding up to fifty rows inside the frame budget is correct regardless
of whether it is currently the bottleneck.

**The real finding, disclosed and not repaired here.** `APP3-S03-C1` §I records
p95 **16.7** at L on Chromium. HEAD measures **33.4** today. So something between
`APP3-S03-C1` and `APP3-S09` — or the machine itself — moved the L scene from one
frame to two, and no checkpoint since has re-measured: `APP3-S04`, `APP3-S05`,
`APP3-S06`, `APP3-S09` and this one all carry `benchmark: no` in the phase map
except where a correction forced one. `APP3-S04` in particular added a layer list
that renders one row per element, on the same per-frame render path, without a
benchmark.

That is `FU-APP3-TRANSFORM-BUDGET-01` (§Z), raised non-blocking. Attributing it
means bisecting `APP3-S03-C1 → S09` with three Sessions per measurement against a
5-per-hour cap, which is a checkpoint of its own, not a line item in this one.

**Scope note.** WebKit was **not** run. `IMP-D043` PO-07 caps anonymous Session
creation at 5 per hour per IP; a HEAD/branch pair at one scene is 2, and a WebKit
pair would be 2 more in the same window. I did not restart the API to clear the
counter — defeating an abuse control to make a benchmark pass is exactly what the
benchmark's own docblock forbids. Instead the run was made to **fit** the guard: I
added a `--scene=` filter so one scene is one Session, which is what §20's
"bounded L=100 run" asks for and what makes a before/after pair affordable at all.
The default remains all three scenes.

**Memory.** History is bounded at 50 entries of two document references each, with
consecutive entries sharing the document between them — *n* actions hold *n + 1*
distinct documents, not *2n*. Nothing is cloned. The history UI is bounded by the
same capacity.

---

## V. Tests, checker and mutations

**Focused suites** — `pnpm --filter @embroidery/storefront exec jest
--testPathPatterns="studio-history"` → **3 suites / 63 tests PASS**:

- `test/unit/studio-history-model.test.ts` — the model and the store: empty
  start, one entry per atomic commit, exact undo/redo documents, undo/redo never
  recording themselves, redo cleared by a new edit, the bound, eviction of the
  oldest, coalescing (nothing while open, one at close, **zero** when the ends
  match or nothing committed), an unrelated commit closing an open action, the
  Session boundary, and an entry being JSON-round-trippable with exactly the keys
  `action, after, before, seq`.
- `test/components/studio-history.test.tsx` — the controls and the two coalesced
  actions, driven through the real `StudioStageScreen`.
- `test/components/studio-history-integration.test.tsx` — layers, image, excluded
  state, keyboard, Session and responsive boundaries.
- `test/support/studio-history-harness.tsx` — one shared harness, so the two
  suites cannot drift on how a gesture is fired.

**Storefront full unit** — **51 suites / 845 tests PASS** (from 48 / 776).

**Checker** — `node tools/check-app3-s08.mjs` → **PASS**.
`node --test tools/check-app3-s08.test.mjs` → **72 / 72 PASS**.

Mutations that must fail, and do: an engine `toJSON()` history · an entry losing
either end · a `Blob`/`ElementGraph`/`DOMMatrix` in the history files · a second
current document · an undo routed through `commit` · a fourth store · the bound
removed · **the eviction removed while the constant stays** · a panel that stops
stating the bound · copy implying an unlimited history · a gesture that opens no
action · one that never closes · **a snapshot taken on every pointer frame** · a
text edit not bracketed · a debounce timer as the boundary · a layer command that
names no action · a commit that need not name itself · a group action added · an
autosave from the history files · a re-upload on redo · history in
`localStorage`/`sessionStorage`/`IndexedDB` · a Session change that keeps the past
· selection/zoom/pan/watermark leaking into the entries · `Ctrl+Y` bound · a
keystroke answered twice · the editable-field guard removed · a listener that
outlives the Studio · `aria-disabled` instead of `disabled` · a disabled control
with no reason · **a `<button>` in the history list** · an undone row by colour
alone · an `APP3-S11` touch surface · a second drawer · an identifier reaching a
row · a label derived without `layerLabel` · a history built outside the owned
files · a history dependency · a history field in the `APP3-P01` schema · an
unindexed command · a root script added.

Two mutations additionally pin the **honest prose**: the copy module contains the
words *infinite history* in the paragraph explaining why they are forbidden, and
`document.ts` names *the undo stack* in the paragraph explaining why it is
excluded. Both must pass.

---

## W. Predecessor-gate evolution — and three real defects found

Every predecessor ban was **narrowed, never deleted**. `PRE_S08 → history absent`
is unchanged for every file this checkpoint did not add.

- **Registry and status rows.** `s01`–`s07`, `s09` each treated
  `FIG-STUDIO-UNDO-DESKTOP-MIDHISTORY` and `APP3-S08 = COMPLETE` as belonging to
  a checkpoint that had not opened. Each is now world-aware on `isS08Delivered`,
  exactly as it already was on `isS09Delivered`. `APP3-S10` and `APP3-S11` are
  asserted unchanged, so a blanket "the Studio is done" still fails.
- **The `reorder` ban** (`s03`) moved from feature-wide to "outside the files
  `APP3-S04` and `APP3-S08` own" — S04 issues the command, S08 names the entry
  after it, and everywhere else it is as forbidden as ever.
- **The S01 partition** now subtracts the S08 files, so the S01 files still may
  not build a viewport, a renderer or an `<svg>`.
- **A composition accessor** (`s05`, `s06`). `APP3-S08` moved the panel mounts out
  of `StudioStageScreen` into `StudioStagePanels` to stay inside the 400-line
  limit, and five rules anchored to the screen's path started reading "not
  mounted" about mounts that had simply moved to the other half of one decision.
  They now read the pair. This is `APP3-B04A`'s lesson again: *a rule anchored to
  a file path dies when one file becomes two.*
- **Call-shape rules** (`s03`, `s04`, `s05`). `commit(structure.value)` →
  `commit(structure.value, action)` and `rule({ text })` → `rule({ text }, kind)`.
  Each rule now matches the *document* being committed rather than one spelling of
  the call.

**Three defects the mutation tests caught, in gates that were passing:**

1. **My own S08 rule read almost nothing.** "Undo does not record itself" sliced
   the store between `undo: ()` and `redo: ()` — which matched the **interface
   declarations** first, so the slice was two type lines and the rule asserted
   nothing while passing. Now anchored on `undo: () => {`.
2. **My own bound rule could not see the sentence it protects.** It scanned
   single-quoted strings; the sentence carrying the bound is a template literal.
   Now scans both.
3. **My own "really disabled" rule passed its own mutation**, because
   `aria-disabled={!canUndo}` *contains* `disabled={!canUndo}`. Now boundary-anchored.

Two more were pre-existing and are repaired in passing: `preS09Code` in
`check-app3-s03.sources.mjs` split paths on `'\\\\'` (two backslashes) rather than
`'\\'`, which is a no-op on a POSIX path — the `APP3-S09` watermark-ownership rule
in the S03 gate would have read **nothing on Linux CI**. And the S03 "re-initialize
discards local edits" rule was single-line and would have broken on any
reformatting of that ternary.

**Predecessor mutation tally.** Entry baseline: **7** failing
(`s02` ×3, `s03` ×1, `s05` ×2, `s07` ×1). Now: **6** — `s02` ×3
(`refuses B06C recorded complete inside this checkpoint`, `refuses B05A used as a
Session media shortcut`, `refuses a changed OpenAPI surface`), `s03` ×1, `s05` ×1,
`s07` ×1 (all `refuses a changed OpenAPI surface` / `refuses a later checkpoint
recorded complete`). All pre-date this checkpoint and are **disclosed, not
repaired** — repairing them is not this checkpoint's scope. Every gate this
checkpoint touched is at **0** new failures.

All nine `check-app3-s0*` gates **PASS**.

---

## X. Contract immutability

```text
OpenAPI = 37 paths / 42 operations / 84 schemas          unchanged
SHA-256 = f39e9e8fca1de08417359aeb299b874c346e21902b21375c9159124ed63d3817  identical
client tree = c2fb229f69f4d0033b081e7f2aca7328653c5eeb6bebfb5658feb6fe8ba4a2d6  identical
migrations = 34    root scripts = 30    dependencies unchanged
```

`pnpm --filter @embroidery/api openapi:check` — **PASS**.
`pnpm --filter @embroidery/api-client check:generated` — **PASS**.
No API, worker, database or package change of any kind.

---

## Y. Files, deviations and the ledger

**Added — production (7)**

```text
model/studio-history.ts                     model/studio-history-copy.ts
hooks/use-studio-history.ts                 hooks/use-studio-history-shortcuts.ts
components/studio-history-list.tsx          components/studio-history-panel.tsx
components/studio-stage-panels.tsx
```

**Modified — production (9):** the document store (history beside the one current
document), the four capability controllers (each names its action), the text
controls (focus/blur session), the text inspector (commit signature), the stage
screen (owns the controller, binds the shortcuts, mounts the panels), the
stylesheet.

**Added — tests (4):** the model suite, the two component suites, the shared
harness. **Modified — tests (7):** five predecessor suites narrowed from "no undo
anywhere" to "exactly one undo surface, and this is not it", plus the partition
module and one commit-signature call site.

**Added — tools (4):** `check-app3-s08{,.-runtime,.sources,.test}.mjs`.
**Modified — tools (22):** the world-aware predecessor updates in §W, the shared
path authority, and one bounded addition to the S03 benchmark (`--scene=`, §U).

**Deviations, disclosed:**

1. **The 1024 and 390 compositions are not drawn.** Both approved S08 frames are
   Desktop 1440. I reused the decision `APP3-S05-C1` established and `APP3-S04`
   and `APP3-S06` each reused — drawer at 1024, nothing at 390 — rather than
   inventing a fourth. `APP3-D01-C1` anticipates it in words ("1024 cannot hold
   three regions"). Flagged for review; not treated as authorised.
2. **The panel's position at 1440** (a section of the inspector column, with the
   controls in its own header) is an engineering placement, since the frame could
   not be opened. The keyboard path is unaffected by it.
3. **`StudioStagePanels` is a new file** created only to keep
   `StudioStageScreen` under 400 lines. It moves no ownership.

---

## Z. Follow-ups

- `FU-APP3-S04-GROUP-AUTHORITY-01` — **OPEN, non-blocking.** Group and ungroup
  still need a Product Owner ruling on the persisted frame and pivot and an
  approved member-selection interaction. S08 adds no group action kind.
- `FU-APP3-TEMPLATE-SOURCE-ASSET-INTAKE-01` — **OPEN**, untouched.
- **New, non-blocking:** `FU-APP3-S08-DESIGN-READ-01` — the two S08 frames were
  approved from the registry and `APP3-D01` prose without opening the nodes
  (interactive OAuth unavailable). The placement decisions in §Y.1 and §Y.2 should
  be confirmed against `609:147` and `609:209` when a connector is available.
- **New, non-blocking:** `FU-APP3-TRANSFORM-BUDGET-01` — the L=100 Chromium
  transform p95 is **33.4 ms** at `APP3-S09`-accepted HEAD against the frozen
  20 ms budget, where `APP3-S03-C1` recorded 16.7 ms. `APP3-S08` is measured
  identical to HEAD and is not the cause (§U). Attribution needs a bisect of
  `APP3-S03-C1 → S09` under the PO-07 Session cap, and WebKit has not been
  measured at all. Every Studio capability checkpoint since `APP3-S03-C1` carries
  `benchmark: no`.

---

## AA. Commit A

```text
feat(storefront): add Studio undo redo history
```

```text
06988fb  58 files changed, 4550 insertions(+), 161 deletions(-)
```

Source, tests, checker and mutations, world-aware gate updates, the two Figma
approval transitions, the scoped command index and the phase status block. No
completion report, no API/worker/DB, no generation, no dependency, no P01 schema
change, no S10/S11, no autosave, no group, no Figma mutation.

**Disclosed.** The first attempt at this commit took its subject through a shell
here-string that leaked its delimiter, producing `@ feat(storefront): …`. That
violates the exact subject §26 fixes, so it was undone with `git reset --soft
HEAD~1` and remade from a file. Nothing was pushed, nothing was reviewed in
between, and no other commit was touched — but the protocol names amend, squash
and rebase, so the operation is recorded here rather than left implicit.

---

## AB. Roadmap

```text
APP3-S09 = COMPLETE — REVIEW_ACCEPTED
APP3-S08 = COMPLETE — REVIEW_DELIVERED
APP3-S10 = BLOCKED_BY_APP3-S08_REVIEW_ACCEPTANCE
```

After human acceptance: `APP3-S08 = COMPLETE — REVIEW_ACCEPTED`,
`APP3-S10 = READY — NOT STARTED`,
`NEXT_RECOMMENDED_FRONTEND_CHECKPOINT = APP3-S10`, then `S10 → S11 → E01 → X01`.

I do not claim server-persistent history, infinite history, autosave or conflict
handling, a mobile `APP3-S11` history sheet, Asset-storage undo, or group history.

---

## AC. Working tree

Branch `production`, working tree clean, Commit A immediately precedes Commit B,
nothing pushed. `git diff --check` clean; `prettier --check` clean across
`apps/storefront`, `tools` and `docs`.
