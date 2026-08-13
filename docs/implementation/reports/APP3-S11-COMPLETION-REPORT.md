# APP3-S11 — Completion report

**Checkpoint:** `APP3-S11` — Studio mobile controls, touch gestures and bottom
sheets
**Status:** `COMPLETE — REVIEW_DELIVERED`
**Commit A:** `9433693` `feat(storefront): add Studio mobile touch editing`
**Branch:** `production` · nothing pushed

---

## A. `APP3-S10` acceptance

Recorded before any source edit: `APP3-S08-C1`, `APP3-S08` and `APP3-S10` all
`COMPLETE — REVIEW_ACCEPTED`, with `APP3-S10 ACCEPTED_AT = ccf15f7`, and
`APP3-S11 = READY — NOT STARTED`. Ownership unchanged: `AUTOSAVE_UI_OWNER` and
`AUTOSAVE_CADENCE_OWNER` stay `APP3-S10`, `MOBILE_TOUCH_OWNER` is `APP3-S11`.

Recording it surfaced a defect in the phase document itself: a **second**
`APP3-S11 = READY — NOT STARTED` line survived in an older block, so the file
carried two answers to one question. The stale line was retired.

## B. The six approved rows

Section 15 (`596:21`), all six `REVIEW_REQUIRED` at entry, exactly six promoted:

| row | node |
| --- | --- |
| `FIG-STUDIO-MOBILE-STAGE-SELECTED` | `610:242` |
| `FIG-STUDIO-MOBILE-TRANSFORMSHEET` | `610:294` |
| `FIG-STUDIO-MOBILE-LAYERSSHEET` | `610:353` |
| `FIG-STUDIO-MOBILE-TEXTSHEET` | `610:409` |
| `FIG-STUDIO-MOBILE-IMAGESHEET` | `610:465` |
| `FIG-STUDIO-MOBILE-CONFLICT` | `610:514` |

No seventh frame, no Figma mutation, and the design gate passes. This release
closes the last Studio section, which is why the anti-blanket-approval guard had
to change shape rather than quietly expire (§AE).

**Design authority used, stated plainly:** the six frames were opened live during
human review and their contents transcribed into the directive's §§5–14. The
Figma MCP connector needs an interactive OAuth this run did not have, so the
frames were **not re-opened here**. The registry rows, their node ids and the
transcribed annotations are the authority; nothing was inferred from an icon.

## C. The 390 shell

One topbar, one save chip, one stage, one bottom toolbar. Zero desktop rail, zero
right drawer. Measured in a real touch browser: `{toolbar: 1, topbar: 1, rail: 0,
drawer: 0, stage: 1, svg: 1, canvas: 0}`, 107 watermark tiles, no horizontal
overflow.

## D. The toolbar mapping

`T` · image · `↶` · `↷` · `⋯`, measured at 55×56 each — above the shared 44 px
minimum — and every one carrying a word rather than a glyph as its accessible
name. `⋯` opens the layer sheet: every other approved mobile tool has a target of
its own, so layers is the only one left, and naming it that is truer than
promising a menu of things that do not exist. `T` is disabled without an editable
text selection and never became an Add Text control.

The transform sheet's trigger is **not** guessed from an icon: `610:242` draws
four corner knobs on a selected element, and they are the way into `610:294`.

## E–H. The gestures

- **Tap** reuses `APP3-S02` selection. No multi-select.
- **One finger** on a selected editable element drives the accepted `APP3-S03`
  candidate path — `APP3-P01` structure, quantization, `APP3-P02` containment and
  physical size — and closes into exactly **one** history entry for the whole
  gesture, never one per frame.
- **Pinch** resolves to an index in the frozen `APP3-S07` list, nearest in log
  space, from the separation the gesture began with. A 24 px floor and an 8 %
  dead zone keep a two-finger pan from flickering between steps.
- **Two-finger pan** moves the centroid into `panByPixels`.

Both viewport gestures reach the `APP3-S07` store and stop: no document seam, no
history, no autosave. The gesture hook may not even import the document store,
and the gate asserts it.

## I. Arbitration and cleanup

The rule is a total function of the live touch count, so it is decidable the
instant a finger lands rather than after enough movement to guess an intent — and
being wrong here means moving a design the customer thought they were only
looking at. A second finger closes an open drag through `APP3-S03`'s **own**
cancellation, the same path an unmount takes, so what was already validated
becomes one entry and nothing is half applied.

Cleanup covers `pointerup`, `pointercancel` and unmount; a stale contact would
make the next single tap look like the second finger of a pinch.

## J. The handle ruling

`610:242` draws ~22 px knobs at four corners and **no rotate affordance**, and no
approved annotation authorizes direct corner-handle resize by touch. So at this
tier a knob is a ≥44 px button that opens the sheet, the eight desktop handles
are not reproduced, and no touch rotation gesture was invented. Verified in the
browser: 4 knobs, 0 rotate handle.

## K. The transform sheet

Every ± press builds a candidate and puts it through `ruleOnCandidate`, with no
clamp, snap or repair — `IMP-D045` PO-09 forbids all four, and a numeric control
is exactly where they look reasonable. One accepted press is one history entry; a
refused one commits nothing.

The size buttons write **scale**, because PO-04 makes scale the persisted resize
model and two of the five v1 kinds ignore a width field entirely. The millimetre
figures are the measured stroke-aware AABB through the Side's `pxPerMm`,
re-measured after every accepted press, so the number on screen is what the
element became rather than what was asked for.

`SIZE_STEP_MM = 1` and `ROTATION_STEP_DEG = 1` are **presentation** steps, chosen
here because no accepted authority states a UI increment, and both are far above
the `APP3-P01` four-decimal floor.

Browser evidence: rotation 0° → 1°; every stepper 44×44; growing the width one
millimetre at a time reached the `APP3-P02` refusal at 85.3 mm and a further press
changed nothing at all.

## L. The layer sheet

`APP3-S04`'s controller with a touch path, because native HTML drag events do not
fire for touch. Only the explicit `⋮⋮` handle starts a reorder, so scrolling a
list cannot restack a design by accident, and the two step buttons stay beside it
because `APP3-S04` §9 forbids a drag being the only way. One drop is one entry.
No group or ungroup — `FU-APP3-S04-GROUP-AUTHORITY-01` is open and `IMP-D045`
PO-07 defers the frame.

## M–N. The text sheet and the keyboard

The same `APP3-S05` inspector the desktop panel renders. `EDIT_ONLY_NO_CREATION`
holds, the exact controlled-font triple is unchanged, and the browser reported no
font-unavailable state and no "thêm chữ" control.

`610:409` promises the keyboard pushes the sheet up rather than covering it, and a
note is only true if the build makes it true: the inset is **measured** from
`VisualViewport` while the text sheet is open, never a constant — keyboard heights
differ by device, language and keyboard, so any number hard-coded here would be
wrong on most phones. A browser without the API reports `0` and nothing moves on
a guess.

## O. The image sheet, and the copy reconciliation

The same `APP3-S06` inspector, one upload path, one API.

`610:465` illustrates *"PNG hoặc JPG, tối đa 10 MB"*; the accepted `APP3-B06B`
contract is PNG, JPEG **and WebP** at a 10 MiB ceiling. The sheet reuses the
sentence the desktop panel already derives from those two constants, so WebP is
not quietly dropped from the product to match an illustration. Verified live:
`accept="image/png,image/jpeg,image/webp"` and the note *"Nhận PNG, JPEG, WebP,
tối đa 10 MB"*.

`MOBILE_IMAGE_COPY_RECONCILIATION = ALIGNED_TO_ACCEPTED_B06B_CONTRACT`.

## P. Undo and redo

`610:242`'s `↶` and `↷` drive the accepted `APP3-S08` controller — same bound,
same cursor, same selection reconciliation, no second history store. No mobile
history *list*: none of the six approved frames draws one, so there is none
rather than one invented to fill the tier. Browser evidence: redo restored the
document with the zoom and the watermark untouched.

## Q. The conflict sheet

`610:514` is where the `610:118` decision appears at 390, so the desktop region is
**suppressed** at this tier rather than joined by a second one. Exactly the two
authorized actions, no merge, no third button, no new retry or revision logic.
It cannot be dismissed: `APP3-S10` offers a conflict two ways out and neither is
"later", so the sheet draws no close control and its scrim does not close it.

## R. Sheet accessibility

One primitive, five callers. Focus enters, `Tab` and `Shift+Tab` are contained
both ways, `Escape` closes only what may be closed, focus returns to the invoking
control, and the page behind does not scroll. The scrim is a `<button>` rather
than a clickable `<div>` because the feature bans those and the ban is right — it
is then `aria-hidden` and out of the tab order, because a second unnamed way to
close is not something to announce.

## S–T. Transactions and autosave

One touch move gesture → one entry. Pinch and pan → zero. One accepted sheet
press → one entry. One reorder drop → one entry. Nothing in the mobile UI calls
autosave: `mobileAutosave`, `touchAutosave` and `sheetAutosave` are all asserted
absent, and the S11 files may not name the autosave operation at all. Edits reach
`APP3-S10` as document mutations, and it saves them on its own cadence — verified
live, chip `Đã lưu lúc 16:30` after one PUT.

## U–V. The tiers above

1440 and 1024 keep their accepted compositions. At 1024 the browser measured
0 mobile toolbar, 0 hint, 0 sheet, 1 rail, 1 drawer, 1 topbar, 1 stage and no
touch binding. Every mobile surface is mounted **by tier**, not hidden by CSS, so
none of it exists to be reached by a keyboard on a desktop.

## W–X. The browser journey, and what it found

A Chromium context with `hasTouch`, `isMobile` and `deviceScaleFactor: 3` at
390×844, driving **real CDP touch contacts**. Journeys A–H, J and the 1024 tier
pass; the measurements are in the phase status verbatim.

**Two real defects were found here and nowhere else.** Both pass every jsdom test
and every desktop interaction:

1. **The arbitration was bound in the bubble phase.** `APP3-S03` calls
   `stopPropagation()` when a gesture starts on the move surface — correctly — so
   a bubble-phase listener never saw a finger that landed on an element. Two
   fingers counted as one whenever the first was on the artwork, and a pinch that
   began on the design silently stayed an element drag. Fixed by binding the
   arbitration in the **capture** phase; the jsdom suite now proves it and the
   gate refuses a bubble-phase binding.
2. **`touch-action` does not inherit.** `none` was set on the stage container
   only, so the browser still owned the gesture on the move surface and the corner
   knobs: it withheld every `pointermove` while deciding whether the contact was a
   scroll, then cancelled it. A one-finger drag did **nothing at all** on a phone
   and worked perfectly on a desktop. Fixed by scoping the suppression to the
   stage subtree while the arbitration is bound to it — the page outside still
   scrolls.

**Recorded gaps.** The conflict journey did not produce a `409`: the mobile tab
had already reconciled to the newer revision before its own edit landed. The 1440
regression check and a retry both needed a further anonymous Session while the
`IMP-D043` PO-07 window held 8 of 5 for the hour. The run did **not** restart the
API to clear the counter and did **not** sleep out the window. Both are covered by
`studio-mobile-sheets.test.tsx` — the conflict sheet, its two actions and its
undismissability, and "renders no toolbar, sheet or gesture surface at 1024 or
1440" — and both are recorded as not reproduced rather than claimed.

## Y–Z. Benchmark disposition

`APP0` makes `APP3-S11` a benchmark owner and this checkpoint has a **delivered
tool and no measurement**. `tools/bench-app3-s11-touch.mjs` ships, is registered
as `CMD-BENCH-APP3-S11`, measures tap, one-finger move, pinch, two-finger pan,
sheet open/close and layer reorder on the accepted S/M/L scenes in an emulated
Chromium touch context, and reports against the frozen `ADR-APP0-001` 20 ms p95
rather than a looser mobile budget it invented for itself. Its own output states
that emulation is not physical-device evidence.

It was not run: each scene needs one anonymous Session and the PO-07 window was
exhausted by the journeys above. **No number is estimated and none is carried over
from another checkpoint.** WebKit was not run for the same reason. Carried as
`FU-APP3-S11-BENCHMARK-01`.

## AA. The desktop regression

Also unrun, for the same reason and recorded the same way. What *is* known: the
storefront suite's 976 tests include the full `APP3-S03` transform coverage and
pass, and no desktop code path changed — the touch seam is one option that is
`false` at every tier but mobile, and the capture-phase listeners are `undefined`
off mobile.

## AB. One SVG, the watermark, no export

`1` `<svg>`, `0` `<canvas>`, the `APP3-S09` watermark rendering at 390 (107 tiles
measured), and no `download`, `toDataURL`, `toBlob` or `saveAs` anywhere in the
feature. No gesture dependency: every gesture here is Pointer Events and
arithmetic.

## AC. API delta zero

37 paths / 42 operations / 84 schemas, 34 migrations, 30 root scripts — all
unchanged and asserted. No client regeneration, no new operation, no backend,
worker or database change.

## AD. Tests, checker, mutations

| suite | count |
| --- | --- |
| `test/unit/studio-touch-model.test.ts` | 14 |
| `test/components/studio-mobile-touch.test.tsx` | 7 |
| `test/components/studio-mobile-sheets.test.tsx` | 13 |

Full storefront regression: **58 suites / 976 tests pass**.

`tools/check-app3-s11.mjs` (+ `-runtime`, `.sources`) and its mutation suite —
**86 pass / 0 fail**. Every load-bearing rule is proved to fail when the thing it
protects is removed: an arbitration decided by movement, a bubble-phase binding, a
computed scale, a viewport gesture that commits, a drag left open, a press that
skips `APP3-P02` or repairs its refusal, a millimetre button that writes width, an
echoed read-out, a sheet that leaks focus, a dismissible conflict, a duplicated
conflict surface, a hidden mobile surface, a second toolbar, a create-text
control, a group control, a sub-44 px target, a globally disabled page scroll, a
hard-coded keyboard height, a gesture dependency and a changed API surface.

One rule was rewritten during the build because it would have passed while
asserting nothing: the pinch rule asked whether `nearestStep` was *defined* rather
than whether the pinch **returns** it — a helper nothing calls is a comment.

## AE. Predecessor evolution

All ten predecessor gates evolved `PRE_S11 → S11_DELIVERED` — narrowed on
`isS11Delivered(rootDir)` and `S11_FILES`, never deleted. All ten pass, and their
mutation suites are back to the five failures `APP3-S10` measured at HEAD.
Twenty-two mutations were **retargeted**, every one because its anchor had become
a silent no-op or its assertion had stopped being true of the world.

The structural change worth reading twice: with section 15 released, **every**
Studio design row belongs to a checkpoint that consumed it, so the
"later rows stay `REVIEW_REQUIRED`" guard had run out of rows — the exact
self-emptying failure `APP3-S04` recorded once already. It is now paired with an
**approval-evidence** rule (`foreignApprovals`) that cannot empty: a checkpoint
may be the evidence for its own rows and for no others. Each guard also gained
`FIG-APP3-HANDOFF-DEPENDENCY`, an annotation no capability checkpoint consumes, so
a blanket approval still has something to move.

## AF–AH. Follow-ups

```text
FU-APP3-STUDIO-TOOL-RAIL-01        = STILL OPEN — S11 gave 390 one coherent tool
                                     surface but did not move the S05/S06 tools
                                     into the 1440/1024 rail, which is the ask
FU-APP3-S10-RETRY-EXTRA-ATTEMPT-01 = OPEN — ROUTED_TO_APP3-E01, untouched here
FU-APP3-TRANSFORM-BUDGET-01        = OPEN — not bisected
FU-APP3-S04-GROUP-AUTHORITY-01     = OPEN — unchanged
FU-APP3-S01-FIXTURE-IDEMPOTENCY-01 = OPEN — confirmed again this run
FU-APP3-S11-BENCHMARK-01           = NEW — OPEN — NONBLOCKING
```

The tool-rail follow-up was named a **candidate** for closure here and is not
closed: at 1440 and 1024 the text and image tools are still panel surfaces, and
closing it by prose is what the directive forbids.

## AI. Contract immutability

```text
pnpm --filter @embroidery/api openapi:check          → up to date, 37/42/84
pnpm --filter @embroidery/api-client check:generated → up to date (c2fb229f…)
```

## AJ. Files, deviations, ledger

12 new production modules, 12 modified production files, 3 new test files, 8
modified test files, 5 new tools, 24 modified tools, 3 modified documents. Commit
A: **83 files**. Every file inside its limit.

Ledger at `.git/app3-s11-finish-state.md` (untracked by design). One environment
finding worth repeating: `pnpm run format` twice pushed a file past a line gate it
had just passed — formatting is not a neutral step for a file at its ceiling.

## AK–AM. Commit, roadmap, tree

Commit A `9433693` `feat(storefront): add Studio mobile touch editing`.

```text
APP3-S10 = COMPLETE — REVIEW_ACCEPTED
APP3-S11 = COMPLETE — REVIEW_DELIVERED
APP3-E01 = BLOCKED_BY_APP3-S11_REVIEW_ACCEPTANCE
```

After human acceptance, `APP3-S11 = COMPLETE — REVIEW_ACCEPTED`,
`APP3-E01 = READY — NOT STARTED`, and the order continues `E01 → X01`.

Branch `production`; Commit A immediately precedes Commit B; nothing pushed. The
development environment was restored: the trustworthy-origin helper reverted to
tracked configuration, and the only rows the run created beyond fixture state are
the anonymous Sessions the journeys opened. No `.env` was written and no
credential was read, logged or rotated.

**Not self-accepted.**
