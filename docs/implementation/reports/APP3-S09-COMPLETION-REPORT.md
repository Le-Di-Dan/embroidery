# APP3-S09 — Completion report

**Checkpoint:** `APP3-S09` — Studio runtime watermark
**Status:** `COMPLETE — REVIEW_DELIVERED`
**Commit A:** `6344a72` `feat(storefront): add Studio runtime watermark`
**Branch:** `production` · nothing pushed

---

## A. Entry and the `APP3-S04` acceptance

Recorded before any source edit:
`APP3-S04 = COMPLETE — REVIEW_ACCEPTED — GROUP_DEFERRED_BY_AUTHORITY` and
`FU-APP3-S04-GROUP-AUTHORITY-01 = OPEN — NONBLOCKING`. Group and ungroup stay
deferred: the approved S04 design has no member-selection interaction and
`IMP-D045` PO-07 does not choose a persisted group frame or pivot. Nothing here
reopens either. Entry anchor `33a5430`; the accepted `APP3-S04` Commit A is
`46ad62f`.

## B. The four approved `APP3-S09` design rows

Section **13 — Studio Watermark**, node `596:19`, page `APP_03`.

| Registry ID | State | Node |
| --- | --- | --- |
| `FIG-STUDIO-WATERMARK-DESKTOP-LIGHT` | Over Light Imagery · 1440 | `609:263` |
| `FIG-STUDIO-WATERMARK-DESKTOP-DARK` | Over Dark Imagery · 1440 | `609:299` |
| `FIG-STUDIO-WATERMARK-MOBILE-DEFAULT` | Default · 390 | `609:335` |
| `FIG-STUDIO-WATERMARK-POLICY` | Specification (annotation) | `609:371` |

All four were `REVIEW_REQUIRED` at entry and are the only rows promoted, with
`APP3-S09 §3 operator review` as evidence. `S08`, `S10` and `S11` rows remain
`REVIEW_REQUIRED`; `FIG-STUDIO-EDITING-TABLET-1024` stays `APP3-D01-C1`'s
reference. No Figma node was created, moved or edited. The design-index gate
passes (165 registry IDs).

**Disclosed:** the Figma MCP connector requires interactive OAuth, unavailable in
this run. Authority came from `FIGMA_DESIGN_INDEX.md` and `APP3-D01` §I.4, which
records the treatments exactly.

## C. What the design authority actually says

`APP3-D01` §I.4, verbatim:

> **The watermark is an overlay, and the design says so.** Ink at ~13% over light
> imagery, white at ~22% over dark. It is never part of the document, there is no
> toggle, there is no download or export control anywhere, and the policy note
> explicitly does *not* claim screenshots can be prevented.

`APP3-D01-C1` adds that each watermark tiles ~20 text nodes per canvas and that
its fills are **bound tokens** — a legibility fix that left a raw ink literal
behind is the defect C1 had to repair in the design file itself.
`docs/05-DESIGN-STUDIO-SPEC.md` §10 asks for a mark that repeats, is hard to crop
out, is readable on light and dark, carries a session identifier, and is not
mistaken for complete protection.
`docs/09-SECURITY-AND-ABUSE-PREVENTION.md` §6 ends: *"Do not claim absolute
screenshot prevention."*

## D. Runtime architecture and stacking

```
.studio-stage__frame
  └─ .studio-stage__viewport            position: relative; overflow: hidden
       ├─ .studio-stage__viewport-layer  transform: translate(P%) scale(Z)   ← APP3-S07
       │    └─ .studio-stage__scene
       │         ├─ svg.studio-stage__canvas   ← the one APP3-S02 scene
       │         └─ .studio-stage__overlay     ← APP3-S03 transform chrome
       ├─ .studio-watermark              position: absolute; inset: 0        ← APP3-S09
       └─ .studio-stage__pan-hint
```

`StudioStageViewport` gained one prop — `overlay` — rendered **after** the
transformed layer's closing tag. That single placement is the checkpoint's
central decision, and §E explains why.

## E. The viewport-space ruling

The watermark is anchored to the **visible viewport**, never to document
coordinates. A mark inside the transformed layer scales and translates with the
artwork: correct at fit, and at 400 % with a pan the visible preview is bare —
which is precisely the screenshot somebody would take. Outside the transform and
inside the viewport's own `overflow: hidden`, it covers exactly what is on
screen and never escapes the frame.

Proved live at fit, at 300 %, after an extreme pan to the corner and after the
safe-area toggle: the mark's bounding box contains the viewport box in every one.
The watermark component names no `zoomStep`, `panXRatio`, `panYRatio` or
`viewportTransform`, and the gate refuses it if it ever does.

## F. The repeated pattern

35 marks — **7 rows × 5 columns**, staggered on alternate rows so they do not form
vertical corridors, over-drawn from −25 % to 125 % so the rotated corners are
covered, and rotated **−30°** because an axis-aligned band can be cropped along
its own edge and a diagonal one cannot.

`watermarkTiles()` takes **no argument**. The count is a function of the viewport
grid alone: not the element count, not the zoom, not the pan, not the number of
image layers. Proved live — 35 marks on a 10-element document and 35 on a
100-element one.

## G. The token and its lifecycle

8 characters from a 32-character alphabet with no `0`/`O` or `1`/`I` — it exists
to be read off a screenshot. Minted by `crypto.getRandomValues` inside a
`useState` **initialiser**, not a `useMemo`: a memo is a hint React may discard
and recompute, and a token that changed mid-session would mark two screenshots
of one session differently.

`Math.random()` is deliberately not a fallback. An environment with no
cryptographic source gets a constant marked as unavailable — a value meant to be
unguessable and quietly not would be worse than an obvious refusal.

| Fact | Evidence |
| --- | --- |
| Stable across every edit | live: `5LV2W7MW` unchanged through select, reorder, hide, lock, zoom, pan, safe-area toggle |
| New per runtime | live: `5LV2W7MW` → `J5LGSSAB` → `52DY9D3S` on successive runtimes |
| Not derived from the document | the same document mounted twice yields two tokens |
| 50 mints, 50 distinct values | unit |

## H. No PII

`mintWatermarkToken()` **takes no argument** — the strongest available form of
"it cannot contain a secret" is that there is no parameter through which one
could be passed, and the gate asserts the empty signature. No name, email, phone,
IP, user agent, Session id or secret, cookie, storage key, `assetId` or
`derivativeId` appears in the model or the hook, and none is reachable. The token
is never sent, never persisted, never logged, and authorizes nothing.

`docs/09-SECURITY-AND-ABUSE-PREVENTION.md` §6 allows an *optional* masked
customer identifier. This checkpoint takes the option of not having one: the
Studio is anonymous and there is no identity to mask.

## I. Not serialized

`APP3-P01` gains **nothing** — no watermark element type, no root field, no
token, no coordinates. The mark is therefore *unrepresentable* in a
`DesignDocument` rather than merely absent from one, which is what makes it
impossible to serialize, hash, list, select, transform, save or delete.

Proved by canonicalization rather than by inspection:

```
canonicalizeDesignDocument(document before the overlay mounts)
  ===
canonicalizeDesignDocument(document after)
```

and the serialized string contains neither the token nor the word. The gate also
rules on the schema package itself, so a future watermark field fails there.

## J. Non-selectable, non-deletable, absent from layers

Absent from selection, transform, the layer list, reorder, lock, hide, text
editing and image replacement — because it is absent from the document all of
those operate on. `pointer-events: none`, `user-select: none` and `aria-hidden`
sit on top of that guarantee, not in place of it.

Live: a click that lands on the mark selects `bench-000` underneath it. Unit:
hiding **and** locking every element leaves zero painted elements and the
watermark still present.

## K. Light and dark contrast

The customer's own photograph decides which treatment applies, and sampling it
would mean reading customer pixels every frame on the one surface
`ADR-APP0-001` measured — a cost and an authority this checkpoint does not have.

So each mark is drawn **twice**: white at 22 % beneath, ink at 13 % one pixel
above. On dark imagery the white pass reads, on light the ink pass, and on
mid-tone the pair reads as an embossed mark. Both bind existing tokens
(`$color-surface-primary`, `$color-text-primary`); the gate refuses a colour
literal anywhere in the watermark's own blocks.

Live computed styles: `rgb(255, 255, 255)` at `0.22` and `rgb(23, 23, 23)` at
`0.13` — the approved values exactly.

## L–N. Browser proof at 1440, 1024 and 390

Real Studio route, real Session, real cloned Template, `http://localhost` via the
accepted trustworthy-origin helper (applied and restored).

**1440** — 35 marks; label `Xưởng Thêu · BẢN XEM TRƯỚC · 5LV2W7MW`;
`aria-hidden="true"`; `pointer-events: none`; `user-select: none`;
`matrix(0.866, −0.5, 0.5, 0.866)` = −30°; inside the viewport and **outside** the
transformed layer; one SVG root; zero canvas; policy text present; a click
through the mark selects the artwork; reorder, hide and lock leave it untouched;
**API delta 0**.

**1024** — one watermark, 35 marks, one topbar, one drawer, **zero watermark
controls**, SVG width 935 px, no horizontal overflow.

**390** — watermark present with 35 marks, zero layer lists, zero bottom sheets,
zero download affordances, policy present, no horizontal overflow. No S11 editing
surface was added.

## O. Zoom, pan, fit

| State | Covers the visible viewport |
| --- | --- |
| Fit (100 %) | yes |
| 300 % | yes |
| 300 % + extreme pan to the corner | yes |
| Safe area hidden | yes |

Viewport state unchanged by every watermark-adjacent action; the watermark
mutates no zoom, pan or safe-area value.

## P. Reload and regeneration

Three successive Studio runtimes produced `5LV2W7MW`, `J5LGSSAB`, `52DY9D3S`. The
persisted Design Document is untouched by any of it — the token lives only in a
`useState` cell, never in a store, never in `localStorage`, never in a request.
No Session secret was exposed to obtain this proof.

## Q. One SVG and `APP3-S03-C1`

One `<svg>` root and zero `<canvas>` before and after, at 10 and at 100 elements.
The watermark is DOM and CSS, so it enters no scene, invalidates no
`RenderableElement`, and is not a second renderer cache. `APP3-S03-C1`'s reuse
machinery is untouched — the watermark's identity is independent of the
document's, and no watermark change can invalidate a scene.

## R. `APP3-S04` and `APP3-S06` coexistence

Absent from the layer list; layer actions do not regenerate the token; the real
image Blob stays beneath the mark and no additional `APP3-B06C` request is caused
by the watermark, by a zoom, by a pan or by the safe-area toggle — asserted as a
**delta** rather than as a flat zero, because the image request legitimately
belongs to S06 and a flat assertion would have been false.

## S. Accessibility

The repeated pattern is `aria-hidden`: 35 repetitions of one string is noise, not
information. It contains no `<button>`, `<a>`, `href`, `onClick` or `tabIndex`, so
it is not focusable and is not a tab stop, and it takes no pointer, so no control
underneath becomes unreachable. The fact it conveys is stated **once**, as real
text, by the policy note beside the stage status.

## T. No export, and honesty about screenshots

No download, export, print, share or copy-image control exists anywhere in the
feature, and the gate refuses `download`, `toDataURL`, `navigator.share`,
`window.print` and `saveAs`.

No screenshot-prevention hack was implemented, and none will work: a PrintScreen
trap, a blur-on-blur trick, a contextmenu block and a canvas-taint trick are all
defeated by a phone camera. Shipping one is what tempts a policy note into
claiming screenshots are prevented, so the gate refuses the hacks **and** the
claim.

The policy note says exactly two things: *"Bản xem trước có đóng dấu. Dấu này
không nằm trong mẫu thêu của bạn."* and *"Studio không cung cấp tải xuống bản
thiết kế."* Both are facts about this build. Nothing about screenshots, recording,
copying or printing.

## U. API delta zero

A request listener over every `/api/` call during mount, zoom, pan, safe-area
toggle, click-through, reorder, hide and lock: **empty**. No operation was added,
called or curated; no autosave; no analytics; no tracking.

## V. DOM and performance sanity

| Fact | 10 elements | 100 elements |
| --- | --- | --- |
| SVG roots / canvases | 1 / 0 | 1 / 0 |
| Watermarks / marks | 1 / 35 | 1 / **35** |
| DOM nodes before cycles | — | 1360 |
| DOM nodes after 4 select+reorder+zoom cycles | — | 1382 |
| DOM nodes after 5 further zoom cycles | — | **1382** |

The one-time +22 is `APP3-S03`'s transform chrome appearing when an element was
first selected (12 `studio-transform-*` nodes and their labels); it stabilises and
does not grow. No node growth, no listener leak, and the watermark's own node
count is identical at L=10 and L=100. No APP0/S03 benchmark was rerun: no
frame-render code changed, and S09 introduces no performance budget.

## W. Tests, checker and mutations

`node tools/check-app3-s09.mjs` → PASS.
`node --test tools/check-app3-s09.test.mjs` → **49 tests, 49 pass, 0 fail**.
`pnpm --filter storefront test` → **48 suites / 776 tests** (from 46 / 727).

Mutations that leave a **visible watermark** behind: the mark moved inside the
transformed layer; a watermark element type added to `APP3-P01`; a watermark
field on the document; the mark written into a document or parked in a store;
`Math.random()`; a `useMemo`-minted token; a mint that accepts a `sessionId`; a
token derived from `document.cookie`; a token written to `localStorage` or a
console; a tile count that takes an input; an axis-aligned angle; one contrast
treatment; a colour literal; pixel sampling; the pattern announced to assistive
technology; `pointer-events` removed; an interactive mark; the policy text
dropped; a `download` control; a PrintScreen trap; a contextmenu block; a policy
note claiming screenshots are prevented; a `<canvas>`; a watermark built outside
the four owned files; an unregistered command; a new dependency.

**Two findings from writing the gate, both caught before shipping.**

1. The first version of the "policy claims nothing untrue" rule read the **raw
   copy file** — and the docblock above the strings explains *why* a screenshot
   claim is forbidden and therefore contains the words. It failed on the gate's
   own first run. The rule now inspects the **published strings**, and a mutation
   pins that the honest prose still passes. This is the same proxy failure
   `APP3-B06B`, `APP3-B06C` and `APP3-S06` each recorded.
2. The "overlay is a sibling" rule compared the slot's index to the index of the
   **class name**, which is on the *opening* tag — so moving `{overlay}` inside
   the layer still satisfied it. The mutation caught it. The rule now anchors on
   the layer's **closing tag**. A rule weaker than the thing it protects passes
   every test until the defect ships.

## X. Predecessor-gate evolution

Six accepted gates banned `watermark` feature-wide because no checkpoint owned
one. Each was **narrowed, never deleted**, and the narrowing is on the
**construction** rather than the word — the composition may *mount* the mark;
nothing outside the four owned files may *build* one (`studio-watermark__`,
`mintWatermarkToken`, `watermarkTiles(`):

- `check-app3-s02-runtime`, `-s03-runtime`, `-s07-runtime`: the owners map;
- `check-app3-s05-runtime`: the `checkNonScope` early-arrival map;
- the S01/S02/S03/S05/S06/S07 registry rules: the four S09 rows stopped being
  evidence of a blanket approval, and the blanket-approval mutations were
  repointed to `FIG-STUDIO-AUTOSAVE-DESKTOP-SAVED`, whose checkpoint is closed;
- `APP3-S09 = COMPLETE` stopped being evidence of a later checkpoint claiming
  credit in the S04, S05 and S06 gates;
- the S04 gate accepts the renamed
  `COMPLETE — REVIEW_ACCEPTED — GROUP_DEFERRED_BY_AUTHORITY`, and the watermark
  rows left its later-row list because S09 now owns them;
- three component suites (`design-studio-source`, `studio-stage-viewport`,
  `studio-transform`) now assert *no **second** watermark* rather than *no
  watermark*, and the viewport suite additionally pins the property it is
  uniquely placed to check: the mark is a **sibling** of the transformed layer.

## Y. Contract immutability

| Artifact | Value | Status |
| --- | --- | --- |
| OpenAPI | 37 paths / 42 operations / 84 schemas | unchanged |
| OpenAPI SHA-256 | `f39e9e8fca1de08417359aeb299b874c346e21902b21375c9159124ed63d3817` | identical |
| Generated client tree | `c2fb229f69f4d0033b081e7f2aca7328653c5eeb6bebfb5658feb6fe8ba4a2d6` | identical |
| Migrations | 34 | unchanged |
| Root scripts | 30 | unchanged |

`openapi:check` and `api-client check:generated` both up to date. No generation
was run. No API, worker, database, dependency or lockfile change.

## Z. Files and deviations

**New (8):** `studio-stage-watermark.tsx` (109), `studio-watermark.ts` (123),
`studio-watermark-copy.ts` (37), `use-studio-watermark-token.ts` (28),
`studio-watermark-model.test.ts` (168), `studio-watermark.test.tsx` (394),
`check-app3-s09.mjs` (229) + `-runtime.mjs` (346) + `.sources.mjs` (109) +
`.test.mjs` (494).

**Modified (36):** the stage screen (388), the S07 viewport (one prop), the
stylesheet, three component suites, the boundary partitions, the design registry,
the command index, the phase document, and 26 predecessor gate/source/test
modules.

Every runtime source is inside CLAUDE.md §6's 400 lines, every runtime test
inside 600, and all tooling inside §15's soft caps.

**Deviation, disclosed.** The approved design draws two contrast *states* — one
over light imagery, one over dark — and does not say how a runtime chooses
between them. This build draws **both**, paired per mark, because the alternative
is sampling the customer's own artwork every frame. The visual result on any one
background is the approved treatment for that background; the pairing itself is
not drawn in an approved frame. Flagged for review rather than treated as
authorised.

### Validations run

| Command | Result |
| --- | --- |
| `node tools/check-app3-s09.mjs` | PASS |
| `node --test tools/check-app3-s09.test.mjs` | 49/49 |
| `pnpm --filter storefront test` | 48 suites / 776 tests |
| `pnpm --filter storefront lint` / `typecheck` / `build` | clean |
| `node tools/check-figma-design-index.mjs` | PASS, 165 registry IDs |
| all 16 `check-app3-{s01,s02,s03,s04,s05,s06,s07}*` gates | PASS |
| `openapi:check`, `api-client check:generated` | up to date |
| `prettier --check`, `git diff --check` | clean |

**Pre-existing failures, disclosed not repaired.** Seven gate mutations fail, and
failed identically at entry: `s02` ×3 (`refuses B06C recorded complete inside
this checkpoint`, `refuses B05A used as a Session media shortcut`, `refuses a
changed OpenAPI surface`), `s03` ×1 and `s07` ×1 (`refuses a changed OpenAPI
surface`), `s05` ×2 (`refuses a later checkpoint recorded complete`, `refuses a
topbar mounted below the stage`). None is in `APP3-S09`'s scope.

No API, worker, database or E2E suite was run: nothing they own changed.

## AA. Command ledger

No unchanged-fingerprint confidence rerun; no real-time sleep used as a test
technique. One environment finding: applying the trustworthy-origin helper
**recreates the API container**, and the storefront then holds a stale connection
to it — the Studio route 404s from application code until the storefront is
restarted *after* the helper, not before.

## AB. Follow-ups

```text
FU-APP3-S04-GROUP-AUTHORITY-01 = OPEN — NONBLOCKING (unchanged)
FU-APP3-TEMPLATE-SOURCE-ASSET-INTAKE-01 = OPEN (unchanged, still unowned)
```

No new follow-up.

## AC–AE. Commit, roadmap, tree

Commit A `6344a72` `feat(storefront): add Studio runtime watermark` — 46 files.
No completion report, no P01/P02, no API, worker or database, no generation, no
Figma mutation, no dependency, no later-checkpoint capability.

```text
APP3-S09 = COMPLETE — REVIEW_DELIVERED
APP3-S08 = BLOCKED_BY_APP3-S09_REVIEW_ACCEPTANCE
```

After human acceptance, `APP3-S09 = COMPLETE — REVIEW_ACCEPTED`,
`APP3-S08 = READY — NOT STARTED`, and the order continues `S08 → S10 → S11`.

Branch `production`, working tree clean, Commit A immediately precedes Commit B,
nothing pushed. The development environment was restored: the trustworthy-origin
helper reverted to tracked configuration, browser artifacts deleted, no database
row created beyond the Sessions the proof itself opened. No `.env` was written and
no credential was read, logged or rotated.

**Not self-accepted.**
