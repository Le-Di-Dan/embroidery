# `APP3-S05-MI01` — completion report

**Class** `FINAL_OPERATOR_INTERVENTION`. Not a second ordinary correction; no
`APP3-S05-C2` exists.
**Status** `COMPLETE — REVIEW_DELIVERED`. Not self-accepted.
**Commit A** `f8b269d` `fix(storefront): place Studio text drawer trigger in topbar`
**Branch** `production`, nothing pushed.

---

## A. Human-review residual

`APP3-S05-C1` closed the controlled-font variant problem and the drawer/mobile
boundaries. One requirement was **knowingly deviated from**, and that deviation
is the whole of this intervention:

> `APP3-D01-C1` / `FIG-STUDIO-EDITING-TABLET-1024` (`618:140`) —
> *drawer is toggled **from the topbar***.

`APP3-S05-C1` placed the trigger in `APP3-S07`'s persistent control strip below
the stage instead, and argued in its own report that the authority was really
about the toggle living *outside* the drawer, so a persistent control anywhere
satisfied it.

That argument is rejected, and correctly. **Trigger placement is part of the
approved composition.** A reviewer approving `618:140` approved where the control
sits, not merely that one exists; "functionally equivalent" is the shape of every
drift that survives review. The reasoning was disclosed rather than hidden, which
is why it could be overruled — but disclosure is not authorisation.

---

## B. The literal authority

For this intervention the operator fixed the reading, and it is not to be
re-interpreted again:

```text
"topbar" = a control region ABOVE the Studio stage,
           not the accepted APP3-S07 control strip below the stage.
```

Everything else `618:140` draws is unchanged and was already satisfied: the tool
rail persists, the inspector is a right drawer, the drawer does not push the
stage, stage width is prioritized, and layers merge into the same drawer later
under `APP3-S04`.

---

## C. The previous below-stage deviation, removed

`.studio-stage__drawer-bar` — the row `APP3-S05-C1` added next to the S07 strip —
no longer exists. It is not hidden, not renamed, not conditionally rendered: the
class is gone from the feature, and a gate mutation restoring it fails.

---

## D. The topbar host and the trigger

`.studio-stage__topbar`, `data-testid="studio-stage-topbar"` — a flex row that is
the **first child of the stage frame**, rendered before `<StudioStageViewport>`.

It is genuinely first in the DOM, not a later child reordered with CSS. `order`
was available and refused: it would have put the control above the stage for the
eye while leaving it late in the tab sequence — an accessibility defect traded
for a screenshot, which is the same class of substitution this intervention
exists to undo.

**Nothing was invented to fill it.** It carries the S05 drawer trigger and
nothing else. No save chip (`S10`), no layers trigger or content (`S04`), no
upload (`S06`), no undo/redo (`S08`), no watermark (`S09`), no mobile control
(`S11`). And no `APP3-S07` control was moved up to make it look populated —
zoom out, zoom value, zoom in, fit and the safe-area toggle are exactly where
`APP3-S07` put them.

Mounting required one structural change: `StudioTextPanel` now takes a `slot`
(`'topbar' | 'body'`) and the screen mounts it twice. The compositions do not
live in the same place in the frame — the tablet toggle belongs above the stage,
the accepted desktop inspector below it — and one mount point could only serve
both by reordering. Each tier answers exactly one slot; nothing renders in both.

---

## E. Stage and drawer geometry

The topbar is an in-flow row above the stage, so it moves the stage's page
offset. It changes nothing else: **`viewBox` `0 0 400 400`**, SVG width `935`,
height `537.59` — before opening, while open, and after closing.

Measured against the frame rather than the viewport, so page scroll cannot
masquerade as layout:

| | SVG width | SVG height | `viewBox` | offset in frame |
|---|---|---|---|---|
| drawer closed | 935 | 537.59 | `0 0 400 400` | 65 |
| drawer open | 935 | 537.59 | `0 0 400 400` | 65 |
| after close | 935 | 537.59 | `0 0 400 400` | 65 |

The drawer remains out of flow (`position: absolute`, `624 → 984` over a stage
spanning `37 → 972`), so opening it changes no in-flow box. No document canvas
and no `APP3-P02` geometry is touched; the millimetre read-out is derived from
the same document as before.

---

## F. Placement and accessibility, proved by position

Class names prove nothing about placement, so the evidence is geometric and
structural:

```text
trigger  bottom  -23      ← the control ends here
stage    top     -15      ← the stage begins here          → trigger is ABOVE the stage
stage    bottom  522.59
S07 strip top    530.59   ← the strip is still BELOW the stage
```

- `topbar.contains(trigger)` → **true**
- `topbar.compareDocumentPosition(svg) & DOCUMENT_POSITION_FOLLOWING` → **true**
  (the topbar precedes the stage in the document, so tab order matches sight)
- `strip.querySelector('[data-testid="studio-text-drawer-trigger"]')` → **null**
- strip buttons → `studio-zoom-out`, `studio-zoom-in`, `studio-zoom-fit`,
  `studio-safe-area-toggle` — exactly `APP3-S07`'s set
- trigger min dimension → **44 px**
- `aria-expanded` `false → true`, `aria-controls` === the drawer's `id`
- drawer is a `<section>` with an accessible name
- `Escape` from inside the panel → drawer `hidden`, `document.activeElement` is
  the **topbar** trigger (`topbar.contains(activeElement)` → true)
- reopening restores the in-progress draft and the painted text

---

## G. 1440 regression

`0` topbars, `0` triggers, the inspector in flow, one `<svg>`, no horizontal
overflow. The accepted desktop composition is untouched.

---

## H. 1024 browser proof

Real Studio route, real dev stack, deterministic Session from a seeded Template
with one text element and one image sibling. Steps 1–11 all pass: the topbar
exists above the stage, the trigger is inside it, the below-stage strip has no
text trigger, the drawer opens without moving the stage, text edited through the
drawer reached the SVG (`Từ thanh trên`), `Escape` closed it and returned focus
to the topbar trigger, reopening showed the authoritative state, and
`scrollWidth === clientWidth`.

**Console:** one pre-existing `favicon.ico` 404, and two HMR WebSocket 502s
caused by my own container restarts mid-session. Zero warnings, zero errors
attributable to `APP3-S05-MI01`.

---

## I. 390 boundary

`0` topbars, `0` triggers, `0` drawers, `0` editable fields, `0` elements with
`role="dialog"`, one bounded notice, one `<svg>`, no horizontal overflow, no
touch transform. `APP3-S11` still owns every mobile editing surface.

---

## J. Font-variant regression

Untouched and passing. Exact `fontId + fontStyle + fontWeight` probing, no
fallback family, a pending candidate that is not authoritative, a failed variant
that preserves the previous document value, a stale result that is discarded, the
`APP3-F01` hashes and the Inter registry — all unchanged, all still asserted by
their own tests and gate rules. No font code was refactored.

---

## K. One SVG / S03-C1 regression

One `<svg>`, one `APP3-S03` working Design Document, the `APP3-S03-C1` identity
reuse and memoized element, the `APP3-S07` viewport wrapper, and `APP3-S03`
move/resize/rotate — all intact and asserted by the existing suites.

---

## L. Tests, checker, mutations

| | result |
|---|---|
| Storefront unit + component | **599 passed / 42 suites** (from 594; `studio-text*` 86) |
| `node tools/check-app3-s05.mjs` | PASS |
| `node --test tools/check-app3-s05.test.mjs` | **57 / 57** |
| `check-app3-s01` · `s02` · `s03` · `s03-reuse` · `s07` | PASS · 51 / 55 / 52 / 14 / 52 |
| `check-app3-p01`, `check-app3-p02`, `check-app3-f01-font-assets` | PASS |
| `check-figma-design-index` | PASS |
| typecheck / lint / production build | PASS (`/san-pham/[slug]/thiet-ke` still `ƒ`) |
| `pnpm lint` 24/24, `format:check`, `git diff --check` | clean |
| `check:generated` | tree hash `d9aac2b3…` unchanged |

New focused tests: the topbar exists and contains the trigger; the topbar
precedes the stage in the document; the S07 strip does not contain the trigger
and still holds its own controls; the trigger controls the same drawer and
`Escape` returns focus into the topbar; 1440 and 390 have no topbar at all.

New gate rules, each with a mutation that fails without it:

1. the trigger moved back into the below-stage strip (the exact `APP3-S05-C1`
   shape — it works, and no behavioural test can call it wrong);
2. a topbar mounted below the stage (right class, wrong placement);
3. the text trigger leaking into the `APP3-S07` control strip.

**A rule I broke and the mutations caught.** Reordering the panel's branches so
the tablet slot could answer first silently emptied the checker's mobile-branch
slice — it ran from `tier === 'mobile'` to `tier === 'tablet'`, which after the
reorder was a backwards range. The rule kept passing while reading nothing. It
now runs to the desktop fall-through, which is positional rather than
order-dependent. Worth stating plainly: a gate that stops reading is
indistinguishable from a gate that finds nothing wrong.

---

## M. Contract immutability

OpenAPI **35 paths / 40 operations / 83 schemas**, generated client tree hash
`d9aac2b3bfb322c1d604f2802e8a9b154bcb8744eabc780652658196d84735b9`, **34**
migrations, **30** root scripts — unchanged. Zero files under `apps/api`,
`apps/worker`, `packages/database`, `packages/contracts` or
`packages/api-client` in Commit A, verified mechanically. No dependency added;
`pnpm install` was not run. **API delta 0** — every request in the browser run
belongs to a bootstrap; the topbar toggles, the text edit and the viewport
changes produced none.

### Performance

The topbar renders inside `StudioTextPanel`, which re-renders on every document
commit — that is frame-render code, so the bounded sanity was run rather than
waived. `L = 100`, the size §6 names:

```text
chromium L   move 16.7   resize 16.7   rotate 16.8      ✓
webkit   L   move 16     resize 18     rotate 17        ✓
```

Disclosed: the same run flagged **WebKit M resize at 25 ms**. This is the
wandering gesture-startup spike `APP3-S03-C1` recorded and `APP3-S05` measured at
`HEAD`; across runs it has landed at S (22, 20), nowhere, and now M (25), while
`L` — the size that would degrade first under genuine added per-frame cost — has
been in budget on every post-repair run (18, 19, 18, 18). It is reported as
measured, not explained away.

---

## N. Commit A, clean tree, no push

Commit A `f8b269d`, 13 files, contains no completion report. Working tree clean
after Commit B; Commit A immediately precedes Commit B; nothing pushed; no amend,
squash or rebase.

Environment restored: benchmark and Studio fixtures reverted, trustworthy-origin
helper restored to the tracked configuration. No `.env` written, no credential
read, logged or rotated. The `IMP-D043` PO-07 creation counter was cleared
between benchmark runs by restarting the API container — an in-memory counter,
no tracked file and no rule changed, and it cannot affect a measurement taken
after the stage is open.

---

## O. Roadmap

```text
APP3-S05      = COMPLETE — CORRECTION_DELIVERED — FINAL_INTERVENTION_DELIVERED_FOR_REVIEW
APP3-S05-C1   = COMPLETE — REVIEW_DELIVERED — FINAL_INTERVENTION_APPLIED
APP3-S05-MI01 = COMPLETE — REVIEW_DELIVERED
APP3-B06C     = READY — DO_NOT_START_BEFORE_APP3-S05_FINAL_ACCEPTANCE
```

After final human acceptance of `APP3-S05`, `APP3-B06C` becomes
`READY — NOT STARTED` and is the next recommended checkpoint, then
`APP3-B06C → APP3-S06`. `APP3-B06C` was not started.

---

## What this report does not claim

- **No `APP3-S04` drawer content**, no tab strip, no layers trigger.
- **No `APP3-S10`, `S06`, `S08`, `S09` or `S11` surface** was added to the topbar
  or anywhere else.
- **No `APP3-S07` control was moved.** The strip below the stage is untouched.
- **No font semantics were refactored.**
- **No live Figma read and no Figma mutation.** No registry row changed status.
- **No claim that the WebKit M spike was fixed** — it was measured and disclosed.
