# `APP3-S05-C1` — completion report

**Checkpoint** `APP3-S05-C1` — Responsive tablet drawer + controlled-font variant readiness
**Status** `COMPLETE — REVIEW_DELIVERED`. Not self-accepted.
**Commit A** `37ba103` `fix(storefront): align Studio text responsive and font readiness`
**Entry HEAD** `4c6fd20`
**Branch** `production`, nothing pushed.

---

## A. Human-review findings

Human review accepted most of `APP3-S05` and returned exactly two findings. Both
are corrected here. Nothing accepted was reopened — no `TextElement` schema, no
creation ruling, no text semantics, no IME/NFC semantics, no text limits, no
`fill` ruling, no `APP3-P02` geometry, no `APP3-S03` transform semantics, no
`APP3-S03-C1` scene identity reuse, no `APP3-S07` viewport, no autosave or
history, no API, DB, worker, OpenAPI, generated client, Figma record, and no
later Studio capability.

**Finding A — the 1024 composition contradicted `APP3-D01-C1`.** The accepted
tablet reference draws the inspector as a right drawer toggled from a persistent
control, with the stage prioritized. `APP3-S05` shipped it as a column reflowed
*beneath* the stage. That is a different composition, not a narrower one: the
stage stops being dominant the moment a panel of equal weight is pushed under it.

**Finding B — controlled-font readiness was family-level.** `useControlledFont`
probed the family `Inter`, so a loaded upright answered `ready` for a missing
italic, and the browser would synthesise a slant nobody audited while the panel
reported the controlled font available. That is not
`REJECT_IF_CONTROLLED_FONT_UNAVAILABLE`, which the registry writes per variant.

Both are failures that leave a **working editor** behind, which is why each is
now carried by a mechanical rule and a mutation test rather than by prose.

---

## B. The 1024 authority

`FIG-STUDIO-EDITING-TABLET-1024`, node `618:140`, owned by `APP3-D01-C1`,
`APPROVED_FOR_IMPLEMENTATION`. It draws: the tool rail persists, stage width is
prioritized, the inspector becomes a right drawer toggled from the topbar, and
layers will later merge into the same drawer under `APP3-S04`.

`APP3-S05-C1` implements only the S05 portion. **No `APP3-S04` layers content
was built**, and no tab strip, upload, history or conflict surface was
pre-created inside the drawer.

The Figma file was **not** read live and **not** mutated: the row resolves fully
from the canonical registry and the accepted `APP3-D01-C1` record. The three
section-09 S05 rows remain the only approved S05 rows and are untouched; every
`S04`, `S06`, `S08`, `S09`, `S10`, `S11` capability row remains
`REVIEW_REQUIRED`. `node tools/check-figma-design-index.mjs` passes.

---

## C. The delivered 1024 correction

`components/studio-text-drawer.tsx`, `48` lines of markup around the existing
inspector. One component, not a framework: `APP3-D01-C1` says layers will later
share this drawer and that is `APP3-S04`'s slice to deliver, so building a
generic shell now would be an abstraction for a requirement nobody has reviewed.
The class names are drawer-shaped (`.studio-drawer`) rather than text-shaped, so
`S04` can extend the same accepted presentation.

- **Out of flow.** `position: absolute` inside the stage frame, `inset-block: 0`,
  `inset-inline-end: 0`, `width: min(360px, 100%)`. Opening and closing changes
  no in-flow box.
- **Toggle.** A real `<button>` carrying `aria-expanded` and `aria-controls`
  pointing at the panel's `id`.
- **Accessible name.** The panel is a `<section>` with `aria-label`. It was
  briefly a `div`; a generic element is not in the accessibility tree, so an
  `aria-label` on it labels nothing. Corrected before Commit A.
- **Closing.** Its own close control and `Escape`, both returning focus to the
  trigger — focus left inside a `hidden` subtree lands on `document.body`, and a
  keyboard user would restart from the top of the page.
- **Scrolling.** `overflow-y: auto`, `overflow-x: hidden`. The x-axis never
  scrolls, at any viewport.
- **Closed state.** The panel stays in the document with `hidden`, so
  `aria-controls` resolves and an in-progress draft survives a close/reopen,
  while `hidden` removes the whole subtree from the accessibility tree and the
  tab order — a closed drawer has no reachable text field.

**Trigger placement — a disclosed deviation.** `APP3-D01-C1` says the drawer is
toggled "from the topbar". The accepted implementation has **no topbar**:
`APP3-S07` placed the Studio's one persistent control strip *below* the stage,
and that placement is accepted. The trigger therefore joins that strip rather
than inventing a second bar above the stage, which would have restructured
`APP3-S07`'s accepted markup for a composition no frame draws. The substance of
the authority holds exactly — the toggle is a persistent, always-reachable
control **outside** the panel, never a handle inside the thing it opens — and
DOM order, visual order and tab order all agree. The alternative considered and
rejected was CSS `order`, which would have put the trigger visually first while
leaving it late in the tab order: a known accessibility defect, in a correction
about accessibility.

**1440 is unchanged.** The desktop inspector renders exactly as accepted.

---

## D. The 390 boundary

`APP3-D01` assigns the Studio's mobile editing surfaces, the text bottom sheet
among them, to `APP3-S11`. `APP3-S05` had no mobile ruling and simply let the
desktop panel stack under the stage, which would have delivered that capability
early and unreviewed.

At the phone tier the panel renders **no** editable field, **no** font, style,
weight, size or alignment control, **no** drawer and **no** bottom sheet. When a
text element is selected it renders one bounded non-interactive sentence —
*"Màn hình này chưa đủ rộng để chỉnh sửa chữ thêu."* — and nothing else; when the
selection is not text it renders nothing at all.

The copy states the fact and **promises nothing**: no "coming soon", and nothing
naming a sheet, a tab or a touch gesture, because copy saying mobile editing is
coming would commit a checkpoint that has not been reviewed. A test asserts that
absence directly.

**The decision is made in React, not in CSS.** A hidden field is still focusable
and still submittable; hiding one would leave the `S11` surface in place and
merely out of sight.

---

## E. Variant readiness architecture

`model/studio-font-variant.ts` is the new authority. It answers one question:
*is this exact face available in this browser?*

```
fontId + fontStyle + fontWeight  →  variantShorthand()  →  document.fonts.load()
```

- `variantShorthand` resolves the family through `findControlledFont` and checks
  `supportsVariant` first. A font the registry does not control returns
  `undefined` — **not** a failure, because an unregistered font and an
  unsupported variant are `APP3-P01` refusals with their own sentences, and
  asking the browser about them would answer a different question and produce
  the wrong one.
- `loadControlledVariant` returns `true` **only** when a face actually matched
  and loaded. A rejected promise (the binary failed to fetch), an empty match
  set, and a browser with no font-loading API all answer `false` — the
  conservative direction, because the cost of a wrong `true` is a design shown
  in a face nobody approved.
- `fontLoadingAvailable()` is checked synchronously by the hook: "nobody to ask"
  is not a load result, and a state that arrives asynchronously when nothing
  asynchronous happened is a lie about timing.

`useControlledFont` now takes the variant and depends on all three fields, so
changing style or weight starts a new request instead of reusing the previous
answer. The three states `loading` / `ready` / `unavailable` are unchanged and
are now **per requested variant**.

---

## F. Probe construction

```
`${variant.fontStyle} ${String(variant.fontWeight)} ${String(PROBE_SIZE_PX)}px "${font.family}"`
```

- The style and the weight are carried, so the engine resolves the same face it
  would paint with.
- The controlled family is named **alone**. No fallback, no comma. A fallback
  makes every probe succeed by matching the fallback — the precise failure this
  module exists to detect. The gate reads the returned template itself, not the
  module around it, because the registry check a few lines above also names both
  fields and would satisfy a weaker rule.
- `PROBE_SIZE_PX` is a constant with no document semantic. A CSS shorthand is
  invalid without a size, and the size has no bearing on face selection; it is a
  constant precisely so it can never be read from a document.
- A variable binary legitimately answers several weights. Readiness is still
  requested with the weight the document holds, so the answer stays true if the
  registry ever ships separate weight files.

---

## G. Pending / success / failure

`applyPatch` in `use-studio-text.ts` splits on whether the patch touches
`fontId`, `fontStyle` or `fontWeight`:

| | behaviour |
|---|---|
| not a font change | ruled on and committed synchronously, exactly as before |
| a face the registry does not control | straight to `APP3-P01`, which has the exact sentence |
| **pending** | the working document keeps the variant it already had; the panel shows loading; the select shows the document's value |
| **success** | the candidate is ruled on by P01 structure → complexity → registry → P02 exactly as before, then committed |
| **failure** | the previous authoritative value stands, and a distinct bounded sentence says the chosen style could not be loaded |

The failure refusal is a new kind, `controlled-font-unavailable`, deliberately
**distinct** from `unsupported-variant`: one is a face that will never exist, the
other did not arrive, and only the second is worth trying again. It is raised
before validation rather than by it, because `APP3-P01` rules on documents and
cannot see a browser.

No synthesised or substituted face is ever accepted as authoritative.

---

## H. Stale variant races

Every request carries the value of a hook-local counter and writes nothing
unless it is still the newest. The counter is also bumped in the render-time
rebind, so a variant fetched for the element the customer just left cannot apply
to the one they arrived at.

`use-controlled-font.ts` uses effect teardown for the same purpose: the variant
is the dependency, so switching selection or variant cancels first and a late
answer from a superseded request writes nothing.

A `useRef` holds the newest `rule` for the one caller that resumes after an
`await` — a `useCallback` closes over the document it was built with, and
committing through a stale one would resurrect the document as it was when the
customer opened the picker.

**No `AbortController` is held in Zustand**, and no request state is stored
outside the hook.

---

## I. The italic-failure proof

Real browser, real interception of the emitted italic asset only. Production
font bytes untouched; no interception artifact committed.

Before the correction the page told the truth about a question nobody asked:

```
Inter | normal | 100 900 | loaded
Inter | italic | 100 900 | unloaded      ← never fetched, yet "ready"
```

With `**/InterVariable-Italic*` aborted and italic selected:

| | S05 (family probe) | S05-C1 (variant probe) |
|---|---|---|
| what was asked | `400 16px "Inter"` → resolves | `italic 400 16px "Inter"` → rejects |
| document `fontStyle` | would commit `italic` | stays `normal` |
| SVG paint | synthesised slant | `font-style="normal"`, unchanged |
| face status | — | `italic \| error` |
| UI | silent | *"Chưa tải được kiểu chữ vừa chọn nên thay đổi chưa được áp dụng. Bản thiết kế giữ nguyên kiểu chữ cũ."* |

The unblocked run is the other half: selecting italic moved the face from
`unloaded` to `loaded` and then committed — proof the probe is real and not a
formality.

---

## J. Font integrity

Canonical source unchanged at
`packages/design-document/assets/fonts/inter/4.1/`. No second copy under
`public/**`, no new font, no modified byte, no remote source.

The production build emits both faces with the SHA-256 `APP3-F01` recorded:

```
693b77d4f32ee9b8bfc995589b5fad5e99adf2832738661f5402f9978429a8e3  InterVariable.woff2
e564f652916db6c139570fefb9524a77c4d48f30c92928de9db19b6b5c7a262a  InterVariable-Italic.woff2
```

`node tools/check-app3-f01-font-assets.mjs` passes.

---

## K. S05 semantics preserved

`EDIT_ONLY_NO_CREATION`; a text edit changes only `text`; the 500 / 5000
code-point limits; NFC refused and never rewritten; the registry-driven picker
with General Sans excluded from the document-font picker; the `normal | italic`
enum and the `100..900` range; `fill` still not edited; `APP3-P02` declared-box
geometry; zero autosave; zero history. All still asserted by the existing
`APP3-S05` rules and tests, which continue to pass unchanged.

---

## L. S03 / S03-C1 preserved

One `<svg>`, one working Design Document, the `APP3-S03-C1` identity reuse, the
memoized `StudioStageElement`, the previous-scene build still offered back, and
move / resize / rotate unchanged. The drawer changes no stage geometry — proved
in jsdom by comparing the SVG's `outerHTML` across the toggle, and in a real
browser by its `getBoundingClientRect`.

Font readiness is **not** a second document truth: it is component state,
consumed only to decide whether a candidate may be offered to `APP3-P01`.

---

## M. Browser proof

`/san-pham/[slug]/thiet-ke`, real dev stack through the gateway, deterministic
Session from a seeded Template containing one text element and one image sibling.

**1440** — inspector in flow, no drawer, no trigger. Live Vietnamese typing
reached the SVG in NFC with the image sibling's matrix and the millimetre
read-out unchanged. Italic selected → loaded → committed → painted.

**1024** — trigger present with `aria-expanded="false"`; opening it gave
`aria-expanded="true"` and `aria-controls` matching the panel `id`. The SVG rect
was **byte-identical open and closed** (`x 37, width 935`) while the drawer
occupied `624 → 984`: the stage is not pushed and stays dominant. Editing worked
through the drawer; closing returned focus to the trigger; reopening kept the
draft. `scrollWidth === clientWidth`, no horizontal overflow.

**390** — `0` editable fields, `0` drawers, `0` triggers, `0` elements with
`role="dialog"`, one bounded notice, one `<svg>`, no horizontal overflow.

**Console** — two errors, neither attributable to `APP3-S05-C1`: a pre-existing
`favicon.ico` 404, and the blocked italic asset, which **is** the proof. Zero
warnings.

---

## N. API delta

**Zero.** Every request in the run belongs to bootstrap: the placement manifest,
the Template list, the Template detail, the Template asset, the Session creation
and the Side background. Nothing after it — not the italic variant change, not
the live typing, not the drawer toggles, not the three viewport changes —
produced a single API request. Static application font loading is not an API
mutation.

---

## O. Performance, including a regression this correction caused and repaired

`ADR-APP0-001` §6 freezes transform frame p95 at 20 ms desktop.

The first WebKit run breached it, and at `L` — the size §18 names:

| WebKit resize p95 | S (10) | M (50) | **L (100)** |
|---|---|---|---|
| first run, pre-repair | 22 | 17 | **28** ✗ |
| final run, post-repair | 20 | 19 | **18** ✓ |

**The cause was found by reading, not by re-running.** `useSyncExternalStore`
calls `getSnapshot` during render, more than once per render, and the panel
re-renders on **every frame** of a transform because a gesture commits the
working document per frame. The first implementation read `window.innerWidth`
there. That asks the engine for a geometric fact, and an engine holding a
hundred elements' worth of pending layout must flush that layout to answer.

The repair is local to `use-studio-viewport-tier.ts`: the width is measured at
subscription and on a `resize` event, and `getSnapshot` returns the cached tier.
**No renderer architecture was reopened** — §20 E was not reached. A gate rule
and a mutation test now encode it, because the composition the defect produced
was entirely correct and no test or screenshot could see it.

Delivered tree, both engines, all nine cells within budget:

```
chromium  S 16.7 / 16.7 / 16.8   M 16.7 / 16.7 / 16.8   L 16.8 / 16.8 / 16.7
webkit    S 16   / 20   / 16     M 16   / 19   / 16     L 17   / 18   / 16
                                              (move / resize / rotate)
```

Two contaminated runs are disclosed rather than dropped: after the wait for the
`IMP-D043` PO-07 window was cancelled, a background job and a foreground job
benchmarked **concurrently**, and one of them also hit the API mid-restart. They
agreed with the clean run (`L` resize 19 and 19) but neither is relied on. The
final numbers above come from single, isolated runs.

**Method note.** The PO-07 creation cap (5/hour/IP) was cleared between runs by
restarting the API container, which resets an in-memory counter. This changes no
tracked file and no rule, and it cannot affect the measurement: the limiter gates
Session creation only, while the benchmark measures frame times after the stage
is open. It is a deviation from the guidance in the S03 harness's own doc block,
taken on the operator's explicit instruction after the alternative — a ~1 hour
wait per iteration — was rejected.

---

## P. Tests, checkers, gates

| | result |
|---|---|
| Storefront unit + component (`jest`) | **594 passed / 42 suites** (from 562 / 41 at `APP3-S05`; `studio-text*` 81) |
| `node tools/check-app3-s05.mjs` | PASS |
| `node --test tools/check-app3-s05.test.mjs` | **54 / 54** |
| `check-app3-s01` · `.test` | PASS · 51 / 51 |
| `check-app3-s02` · `.test` | PASS · 55 / 55 |
| `check-app3-s03` · `.test` | PASS · 52 / 52 |
| `check-app3-s03-reuse` · `.test` | PASS · 14 / 14 |
| `check-app3-s07` · `.test` | PASS · 52 / 52 |
| `check-app3-p01`, `check-app3-p02` | PASS |
| `check-app3-f01-font-assets` | PASS |
| `check-figma-design-index` | PASS |
| Storefront typecheck / lint / production build | PASS (`/san-pham/[slug]/thiet-ke` still `ƒ`) |
| `pnpm lint` | 24 / 24 |
| `pnpm format:check`, `git diff --check` | clean |
| `check:generated` (api-client) | tree hash `d9aac2b3…` unchanged |

**New gate rules**, each with a mutation test that fails without it: a
family-only probe; a probe missing its style or its weight; a fallback family in
the probe; a failed variant committed anyway; a stale variant result not
discarded; readiness not depending on the exact variant; an editing surface
rendered at the mobile tier; an inspector mounted past the tier authority; a
drawer trigger with no `aria-controls`; a drawer that does not return focus; a
tablet drawer put back into flow; a stylesheet breakpoint moved away from the
renderer's; a panel that stops deciding a composition; a tier measured during
render. Plus: the correction's rules are proved **not** to run against a tree
that predates it.

**Predecessor gate evolution, world-aware and not deleted.** `APP3-S01`'s
whole-feature viewport ban is kept and narrowed to exclude only the files `S05`
introduced, and only once `S05` is recorded delivered — the exclusion names the
**new** files, so anything added later inherits the strict rule by default.

**Disclosed pre-existing failure.** `node --test
tools/check-app3-f01-font-assets.test.mjs` reports 37 pass / 3 fail. Verified to
reproduce identically at entry `HEAD` `4c6fd20` in a clean worktree, and the F01
checker itself passes. Not fixed here: §19 forbids repairing unrelated F01
harness debt.

---

## Q. Contract immutability

OpenAPI **35 paths / 40 operations / 83 schemas**, generated client tree hash
`d9aac2b3bfb322c1d604f2802e8a9b154bcb8744eabc780652658196d84735b9`, **34**
migrations, **30** root scripts — all unchanged. No file under `apps/api`,
`apps/worker`, `packages/database`, `packages/contracts` or
`packages/api-client` is in Commit A (verified mechanically: 0 matches). No
dependency added; `pnpm install` was not run.

---

## R. Changed files

Commit A: **28 files** — 7 added, 21 modified.

| file | lines |
|---|---|
| `components/studio-text-panel.tsx` *(new)* | 48 |
| `components/studio-text-drawer.tsx` *(new)* | 113 |
| `hooks/use-studio-viewport-tier.ts` *(new)* | 77 |
| `model/studio-responsive.ts` *(new)* | 45 |
| `model/studio-font-variant.ts` *(new)* | 104 |
| `hooks/use-controlled-font.ts` | 94 |
| `hooks/use-studio-text.ts` | 239 |
| `components/studio-text-inspector.tsx` | 171 |
| `test/components/studio-text-responsive.test.tsx` *(new)* | 486 |
| `tools/check-app3-s05-responsive.mjs` *(new)* | 191 |
| `tools/check-app3-s05-runtime.mjs` | 294 |
| `tools/check-app3-s05.test.mjs` | 643 |

Every runtime source is under 400, every runtime test under 600, every
`check-*.mjs` under the 450 soft cap and every `check-*.test.mjs` under 700. The
runtime checker reached 467 during the work and was split by responsibility into
`check-app3-s05-responsive.mjs`, which carries the correction's two rules.

---

## S. Commit A, clean tree, no push

Commit A `37ba103` contains no completion report. Working tree clean after
Commit B. Commit A immediately precedes Commit B. Nothing pushed. No amend, no
squash, no rebase.

Environment restored: benchmark and Studio fixtures reverted, and the
trustworthy-origin helper restored to the tracked configuration (`restored|tracked
configuration`). No `.env` was written, no credential read, logged or rotated.

---

## T. Roadmap

```text
APP3-S05-C1 = COMPLETE — REVIEW_DELIVERED
APP3-S05    = COMPLETE — CORRECTION_DELIVERED_FOR_REVIEW
APP3-B06C   = READY — BLOCKED_BY_APP3-S05_CORRECTION_REVIEW
```

After human acceptance:

```text
APP3-S05-C1 = COMPLETE — REVIEW_ACCEPTED
APP3-S05    = COMPLETE — REVIEW_ACCEPTED
APP3-B06C   = READY — NOT STARTED
NEXT_RECOMMENDED_CHECKPOINT = APP3-B06C      then APP3-B06C → APP3-S06
```

`APP3-B06C` was not started.

---

## What this report does not claim

- **No `APP3-S11` mobile text editing.** 390 has no editing surface at all.
- **No `APP3-S04` drawer content.** No layers list, tab strip or reorder.
- **No arbitrary font.** The picker is `DESIGN_FONT_REGISTRY` and holds Inter.
- **No family-level readiness claimed as variant readiness.** Every probe in
  every reported result named an exact style and weight.
- **No native-IME claim.** This correction exercised no IME; the `APP3-S05`
  composition proof stands as recorded there and was not re-run.
- **No live Figma read.** The rows resolve from the registry and accepted `D01`.
