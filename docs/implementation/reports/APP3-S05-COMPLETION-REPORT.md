# APP3-S05 — Studio text capability · completion report

**Status:** `COMPLETE — REVIEW_DELIVERED`. Not self-accepted.
**Commit A:** `7f5611b` `feat(storefront): add Studio text editing`
**Branch:** `production`. Nothing pushed.

---

## A. Entry, and the `APP3-S03-C1` acceptance

Entry `HEAD` was `fe1e9bf`. The operator's acceptance of `APP3-S03-C1` was
recorded before any source edit:

```text
APP3-S03-C1 = COMPLETE — REVIEW_ACCEPTED
APP3-S03    = COMPLETE — REVIEW_ACCEPTED
APP3-S11    = READY — NOT STARTED
```

The accepted correction anchor `cfe3659` is untouched. The frozen performance
result it established is the baseline §22 is measured against, and the
`APP3-S03-C1` render architecture is treated as **accepted architecture** rather
than as an optimization open to revision.

---

## B. The three `APP3-S05` Figma rows

Section `09 — Studio Text`, node `596:15`, page `APP_03`, file
`BQwqV8GdfUIELvsQDB1UQE`. Three frames, three registry rows, all three promoted
`REVIEW_REQUIRED` → `APPROVED_FOR_IMPLEMENTATION` with evidence
`APP3-S05 §4 operator review`:

| Registry ID | State | Node |
|---|---|---|
| `FIG-STUDIO-TEXT-DESKTOP-EDITING` | Editing | `608:176` |
| `FIG-STUDIO-TEXT-DESKTOP-FONTPICKER` | Font Picker | `608:231` |
| `FIG-STUDIO-TEXT-DESKTOP-VALIDATION` | Validation & Font Loading | `608:286` |

No fourth frame was created and no Figma node was created, moved or mutated. The
approval is scoped: `S04`, `S06`, `S08`, `S09`, `S10` and `S11` capability rows
are all still `REVIEW_REQUIRED`, and the gate asserts that in both directions.
`FIG-STUDIO-EDITING-TABLET-1024` (`618:140`) stays an `APP3-D01-C1` responsive
reference and was not re-attributed.

**Disclosed:** the live Figma read was **not** available. The MCP server required
an interactive OAuth authorization this run could not complete, so the three rows
were resolved from the canonical registry plus the accepted `APP3-D01` record —
the §4 nonblocking condition. `APP3-D01 §D` describes `S05` as "text editing,
font picker restricted to the `APP3-F01` registry, validation plus font-loading
fallback", which together with the three row *State* values resolves the three
frames without guessing. I did not read the frames' pixels, and nothing in this
report claims I did.

---

## C. 1440 and 1024 authority

Desktop authority is section `09` at 1440. At 1024 the shared reference
`FIG-STUDIO-EDITING-TABLET-1024` is activated **only** for its S05 portion: the
stage stays dominant, the inspector reflows to a single column beneath it without
rewriting stage geometry, and every control keeps the shared 44 px target. Nothing
from layers, upload, watermark, undo/redo or save state was pulled forward from
that frame. Measured at 1024: stage 961 px, inspector 935 px, no horizontal
overflow (1009 ≤ 1024), every control 44 px tall (the textarea 78 px).

---

## D. `APP3-P01` `TextElement` audit

Read from source, not from prose (`packages/design-document/src/schema/elements.ts`):

```ts
interface TextElement extends DesignElementBase {
  type: 'text'; text: string; fontId: string; fontSizePx: number;
  fontWeight: number; fontStyle: FontStyle; textAlign: TextAlign; fill: string;
}
```

plus `id`, `visible`, `locked`, `opacity`, `transform`. `TextAlign` is
`'left' | 'center' | 'right'`; `FontStyle` is `'normal' | 'italic'`.

Validation (`validation/element.ts`): `text` must be a string and **NFC**; empty
text is legal; `fontSizePx` is 1…1000; `fontWeight` must be a **whole** number;
`fontStyle` and `textAlign` are exact enums; `fill` is validated only as a
non-empty NFC string. Limits (`schema/constants.ts`): 80 text elements, **500**
code points per element, **5000** per document.

No P01 or P02 schema change. No invented field: there is no `fontFamily`, font
URL or binary, HTML/rich text, `letterSpacing`, `lineHeight`, curved text,
text-on-path, thread palette id or stitch density anywhere in this checkpoint,
and the gate bans each by name.

---

## E. Text creation — audit and final ruling

**Ruling: `EDIT_ONLY_NO_CREATION`.**

The three approved frames are *Editing*, *Font Picker* and *Validation & Font
Loading*. None is a creation state, and `APP3-D01`'s own description of `S05`
lists editing, the restricted picker, validation and the font-loading fallback —
no add-text affordance. Per §11 the design is edit-only, so **no "Add text" was
invented**.

This was checked rather than assumed, and it is also the safe outcome: accepted
authority establishes none of the load-bearing creation defaults — no new element
id scheme, no initial string, no default typography, no `x`/`y`/`width`/`height`,
no insertion z-order. Had the design required creation, §11's
`TEXT_CREATION_DEFAULT_AUTHORITY_MISSING` block would have applied. It does not,
so `APP3-S05` is delivered rather than blocked. The existing empty-stage hint
("Các công cụ thêm chữ và hình sẽ có ở bước tiếp theo") remains true and was left
alone.

---

## F. Controlled Inter, and how it reaches the browser

Registry state is unchanged: `registryVersion 1`, `fontId inter`, family `Inter`,
styles `normal`/`italic`, weights `100..900`, `REJECT_IF_CONTROLLED_FONT_UNAVAILABLE`.

**Before this checkpoint the controlled face was never delivered to a browser at
all.** There was no `@font-face`, no `public/` directory and no `next/font` call
anywhere in the Storefront, so the stage painted `font-family="Inter"` and the
browser substituted whatever it had. That is now fixed.

Two `@font-face` rules in the feature stylesheet point directly at the binaries
`APP3-F01` acquired:

```scss
src: url('../../../../../../packages/design-document/assets/fonts/inter/4.1/InterVariable.woff2')
```

No copy under `public/`, no CDN, no Google Fonts host, and no second source that
could drift from the recorded hash. `APP3-F01` explicitly excluded `public/**` as
a canonical location, and referencing the canonical file honours that rather than
working around it. **Proof the bytes are the right bytes** — the production build
emits them and they hash identically to the F01 record:

| File | SHA-256 (F01 record = build output) |
|---|---|
| `InterVariable.woff2` | `693b77d4f32ee9b8bfc995589b5fad5e99adf2832738661f5402f9978429a8e3` |
| `InterVariable-Italic.woff2` | `e564f652916db6c139570fefb9524a77c4d48f30c92928de9db19b6b5c7a262a` |

`font-display: block`, not `swap` — a swap would paint the design in a substituted
face first, and a substituted face has different metrics, so the customer would
watch their design change shape having approved neither.

The family name is the literal `Inter` because that is what the registry
publishes for `fontId: inter` and what the renderer asks for; a generated or
aliased family (as `next/font/local` would produce) would simply never match.

Three states, from the CSS Font Loading API (`useControlledFont`): `loading`,
`ready`, `unavailable`. A failure is stated in text and never becomes a different
authoritative font silently.

**Scoped precisely:** the hook probes the controlled *family*, so it answers "is
the controlled face available", not "has the italic file finished downloading".
In the browser the normal face was `loaded` on open and the italic face loaded on
demand when italic was selected — both from the F01 binary, both verified.

---

## G. One working document

The chain is unchanged and still runs in one direction:

```text
Session snapshot → S02 adapter → S03 working document → S05 text candidate
→ P01 validation/quantization → the same working document → S03-C1 scene rebuild
```

No second document store, no `localStorage`/`sessionStorage` draft, no autosave
cache, no parallel text model. The only local state is the transient field value
during editing or IME composition plus the last refusal — neither is
authoritative, and neither survives a selection change. The gate asserts exactly
one store holds a `DesignDocument` and that it is still `APP3-S03`'s.

---

## H. Selection and editability

Editing is enabled only for a selected, **visible**, **unlocked** text element.
The other four cases each say *why* rather than going blank:

| Case | Shown |
|---|---|
| no selection | "Chọn một đối tượng chữ trên khung thiết kế để chỉnh sửa." |
| non-text selected | "Đối tượng đang chọn không phải là chữ thêu." |
| hidden | "Đối tượng chữ này đang được ẩn nên chưa thể chỉnh sửa." |
| locked | "Đối tượng chữ này đang bị khoá nên chưa thể chỉnh sửa." |

`APP3-S02` remains the selection owner; `APP3-S04` remains the lock/hide **control**
owner — this panel reads both and offers neither. No multi-select, no bulk
formatting.

---

## I. Text editing and Vietnamese composition

Editing `text` changes only `text`. A composition in progress is held in the
field and never ruled on — "Vieejt" on the way to "Việt" cannot reach the
document — and a completed composition is ruled on immediately. Outside a
composition every keystroke is already a completed value, so it commits live and
the stage stays in step with the field.

`compositionstart` → transient draft; `compositionend` → validate the completed
candidate, reading `event.currentTarget.value` because in some engines
`compositionend` fires before React's change for the same frame.

**IME proof, stated exactly:** synthetic `compositionstart`/`compositionend`
proof is in the component suite, and **real completed Vietnamese text with full
diacritics was typed character-by-character in a real browser** — "Nguyễn Thị
Hồng Ánh — Xưởng Thêu", 47 code points, verified NFC, reaching the SVG. What was
**not** exercised is a real OS-level Vietnamese IME (Telex/VNI) driving
composition events; the real typing went through Playwright's key sequence. I do
not claim native-IME browser proof.

---

## J. `APP3-P01` limits

Preserved exactly: ≤80 text elements, **500 code points** per element, **5000**
per document. Counted with `[...text].length`, never `text.length` — proved on
both sides of the boundary and with an astral character, where a UTF-16 count
would silently halve the customer's allowance. No truncation, no silent deletion:
an invalid candidate never enters the working document. The gate bans the
literals `500`/`5000` in the S05 source (with the font-weight ladder excluded, so
the weight `500` is not mistaken for a limit) and requires the constants to be
read from P01.

---

## K. Font picker and variants

Built from `DESIGN_FONT_REGISTRY.map(...)`, so it holds exactly Inter today and
grows only when the registry does. Verified absent: General Sans, Arial, Roboto,
Times New Roman, `system-ui`. `fontStyle` offers exactly `normal`/`italic`.

The weight picker offers the nine conventional steps **plus the value the
document already holds** when that value is off-step — P01 accepts any integer
100…900, and a picker that dropped `450` would render with no matching option,
show the wrong weight, and carry it into the next edit. Unsupported variants are
refused through P01's own `supportsVariant`.

---

## L. Supported property controls

Six controls, each satisfying both conditions (in the accepted design **and**
persistable in P01 v1): `text`, `fontId`, `fontStyle`, `fontWeight`,
`fontSizePx`, `textAlign`. Numeric changes go through P01 quantization via the
shared `APP3-S03` path; no local alternate rounding.

---

## M. `fill` — ruling

**`fill` is not edited by this checkpoint, deliberately.**

Two independent reasons, both audited rather than assumed. None of the three
approved frames is a colour state. And P01 validates `fill` only as a non-empty
NFC string — it publishes no colour format, no palette, no thread code and no
manufacturing semantic — so a colour control would have had to invent both its
design *and* its contract. `S05` therefore carries the stored `fill` through
untouched and paints it exactly as stored (verified in the browser: `#101010`
survived every edit). Nothing in this checkpoint calls a fill a thread colour, a
Pantone value or a machine thread code.

---

## N. `APP3-P02` geometry boundary

`APP3-P02` PO-08 measures a text element from its **declared box** and performs no
font measurement, so neither the string nor `fontSizePx` moves the envelope. No
`measureText`, `getBBox`, `getComputedTextLength`, DOM `Range` or any other local
text-layout engine exists anywhere in the feature, and the gate bans each by name.
No auto-resize from glyph metrics. A unit test sets `fontSizePx` to 96 and asserts
the declared box is byte-identical.

The candidate is still put through `APP3-P02` containment and physical size — a
formality for a text edit by the rule above, and asked anyway so that the property
stays *verified* per commit rather than assumed, and because that path is where
quantization happens.

---

## O. `APP3-S03` transforms preserved

Move (parent-local), resize (scale about the local-box centre), rotation
(clockwise about the untransformed centre), blocking containment and the
P02/`pxPerMm` millimetre read-out are exactly as accepted. A text edit resets no
transform, selection, zoom or pan — verified in the browser at Fit and at 400 %
with pan applied.

**Worth stating plainly:** during the browser journey an *outward* resize of the
edited text element produced no change and showed "Không thể đặt đối tượng ra
ngoài vùng thêu cho phép." That is not a broken control — it is `APP3-S03`'s
blocking containment refusing a candidate that would leave the safe area, still
working after a text edit. An inward resize on the same handle succeeded.

---

## P. `APP3-S03-C1` reuse preserved

One native SVG scene; structural identity reuse and the memoized element
component both intact, and the gate asserts both. The focused regression §18 asks
for: a one-element text edit in a three-element scene re-renders the edited
element and **zero** unchanged siblings, counted through `elementLabel` — the same
production call `APP3-S03-C1` uses, so no telemetry ships.

**The regression was verified non-vacuous, and the first attempt to verify it
failed to prove anything.** Rebuilding every element object in `withTextFields`
did *not* fail the test — because the S03-C1 identity layer restored identity by
value equality and correctly absorbed it. Removing `memo` from
`StudioStageElement` *did* fail it. The mutation that proves the assertion is the
second one, and that is the one the gate encodes.

Inspector form controls are HTML; the artwork is still the one SVG.

---

## Q. Validation UX and accessibility

Every P01 finding maps to bounded Vietnamese copy. No raw error, stack, document
JSON, font path, private Session data, element id or finding path reaches the
screen. Covered: text too long, document total exceeded, invalid/non-NFC input,
unknown font, unsupported variant, invalid numeric value, controlled font
unavailable, plus the two reused `APP3-S03` geometry refusals.

Every control has a `<label>` bound by `htmlFor`. The refusal is `role="alert"`
and is wired into the field's `aria-describedby` (verified in the browser:
`aria-describedby="_r_0_-text-hint studio-text-refusal"`). The font states use
`role="status"` for loading and `role="alert"` for unavailable. **No status is
colour-only** — each is a sentence. Validation does not steal focus.

---

## R. 1440 / 1024 / 390

| Viewport | Result |
|---|---|
| 1440 | full inspector beside the dominant stage; all 15 journey steps below |
| 1024 | stage 961 px, inspector 935 px, controls 44 px, **no horizontal overflow** (1009 ≤ 1024) |
| 390 | **no horizontal overflow** (375 ≤ 390); **0** bottom sheets; a `touch` pointer starts no transform and changes nothing |

At 390 the inspector is the same form reflowed to one column — not an `APP3-S11`
mobile text surface, and no touch text-editing capability was added.

---

## S. Browser journey (real route, real Session, real gateway)

`/san-pham/a03-live-check-redirect/thiet-ke`, Session cloned from a fixture
Template holding **one text element and one image sibling**.

1. Selected the text element on the SVG stage. ✅
2. Inspector reflected document truth exactly: `Bụi tre sau nhà`, `inter`,
   `normal`, `400`, `16`, `left`, "Còn 485 ký tự" (15 code points used). ✅
3. Typed real Vietnamese: "Nguyễn Thị Hồng Ánh — Xưởng Thêu", 47 code points,
   NFC-valid. ✅
4. SVG `<text>` updated live. ✅
5. Selected id unchanged throughout. ✅
6–7. Changed `fontStyle` → italic, `fontWeight` → 700, `textAlign` → center;
   the SVG carried the exact P01 values (`font-style="italic"`,
   `font-weight="700"`, `text-anchor="middle"`, `x="40"` = half the 80 px box),
   `font-family="Inter"`. The italic face loaded on demand from the F01 binary. ✅
8. The image sibling's matrix stayed byte-identical across every edit. ✅
9–10. Genuine P01 refusal: 501 code points → "Nội dung chữ vượt quá 500 ký tự cho
   một đối tượng.", `role="alert"`, SVG still showing the last valid text, and the
   field keeping all 501 characters for correction. **Nothing truncated.** ✅
11. The element matrix was byte-identical before and after every property edit. ✅
12. Move ✅ and rotate ✅ on the edited text; resize outward correctly **refused**
    by containment, resize inward ✅ (see §O).
13. 400 %: document matrix byte-identical, mm unchanged, handles measured
    **44×44**. Pan at 400 % moved the layer to
    `translate(-10.6572%, -10.7858%) scale(4)` with the document matrix
    byte-identical; a text edit while zoomed **and** panned reached the SVG and
    changed no viewport value. ✅
14. Fit returned the layer to `scale(1)` and changed nothing else — document,
    text, style, weight, alignment, mm and selection all preserved. ✅
15. **API delta = 0** (see §T). ✅

**Console: 0 S05-attributable errors, 0 warnings.** Two errors appeared, neither
from the product: the dev `favicon.ico` 404, and
`setPointerCapture: No active pointer with the given id` — the known harness
artifact, because a synthetic `pointerdown` carries a `pointerId` that is not an
active pointer. A real pointer always is. The stack confirms it originates in my
own dispatched event.

---

## T. Zero API delta

The `/api/` request list after the full journey — every text edit, every property
change, three transforms, zoom, pan and Fit — is **byte-identical** to the
pre-edit baseline: the placement read, the Template list, the Template detail, the
Template asset, the Session `POST`, and the two Side-background reads. **No
request was added by anything `APP3-S05` does.**

Static application font loading is not an API mutation; the two `woff2` files are
`/_next/static/media/` assets.

---

## U. Performance sanity — and one honest complication

The real risk §22 guards is that mounting the inspector inside the stage screen
adds per-frame render cost to every transform. Measured on the production path,
`L = 100`, both browsers.

**Chromium — 9/9 in budget, and identical to the accepted S03-C1 baseline:**

| scene | move | resize | rotate |
|---|---|---|---|
| S / M / L p95 | 16.7 / 16.7 / 16.8 | 16.8 / 16.7 / 16.7 | 16.8 / 16.7 / 16.7 |

Zero dropped frames everywhere.

**WebKit — three runs, reported in full including the one that breached:**

| run | tree | S resize p95 | M resize p95 | L resize p95 | verdict |
|---|---|---|---|---|---|
| 1 | S05 | **30** | 18 | 17 | BUDGET breach at S |
| 2 | HEAD (S05 stashed) | 18 | 18 | 18 | 9/9 pass |
| 3 | S05 | 18 | 18 | 18 | 9/9 pass |

Run 1 breached, so I measured `HEAD` rather than re-running S05 and hoping. Three
things say this is not an `APP3-S05` regression:

- The breach was at **S (10 elements)** while **L (100 elements)** was *better*
  than HEAD (17 vs 18). Added per-frame render cost degrades the largest scene
  most; this is the opposite shape.
- M and L never moved in any run.
- Run 3 on the S05 tree reproduces HEAD's numbers exactly.

The accepted `APP3-S03-C1` evidence already disclosed that WebKit resize carries a
**gesture-startup** spike reaching ~31 ms that "appears at S as readily as at L",
with 2–3 frames above 20 ms in a 60-frame gesture. A 60-frame p95 is the third
slowest frame, so that startup frame sits directly on the p95 boundary at S and
tips it when it lands late.

**I am not averaging the failing run away.** The honest statement is: WebKit S
resize p95 is at the budget boundary and is intermittently above it, that this
predates `APP3-S05` and is a property of the accepted S03-C1 result, and that the
`L = 100` sanity §22 actually requires is met in every run (17–18 ms). §25(7) does
not apply, because the evidence says the variance is not S05-caused. If review
disagrees, the natural owner is the frozen S03 benchmark rather than this
checkpoint.

Benchmark result files were not committed; fixtures were reverted.

---

## V. Tests, checkers, gates

| Command | Result |
|---|---|
| `pnpm --filter @embroidery/storefront test` | **41 suites / 562 tests** (was 41/562 → +2 suites, +49 tests over HEAD's 39/513) |
| `node tools/check-app3-s05.mjs` | PASS |
| `node --test tools/check-app3-s05.test.mjs` | **37/37** |
| `check-app3-s01` · `.test` | PASS · 51/51 |
| `check-app3-s02` · `.test` · `-evolution.test` | PASS · 55/55 · 9/9 |
| `check-app3-s03` · `.test` · `-reuse.test` | PASS · 52/52 · 14/14 |
| `check-app3-s07` · `.test` | PASS · 52/52 |
| `check-app3-p01` · `check-app3-p02` · `check-app3-f01-font-assets` | PASS · PASS · PASS |
| `check-figma-design-index` | PASS (165 registry IDs) |
| `@embroidery/design-document` tests | 177/177 |
| `@embroidery/design-engine` tests | 137/137 |
| storefront `typecheck` · `lint` · `build` | PASS · PASS · PASS (`/san-pham/[slug]/thiet-ke` still `ƒ`) |
| `api-client` `check:generated` · `typecheck` · `test` | tree hash `d9aac2b3…` unchanged · PASS · 44/44 |
| `pnpm lint` · `pnpm format:check` · `git diff --check` | 24/24 · clean · clean |

**Not run, deliberately (§17/§26):** `pnpm quality`, the full API suite, DB
integration, the worker suite, repository E2E, OpenAPI generation, api-client
generation, `APP3-B06C`, `APP3-S06`, any Figma mutation, `pnpm install`.

**Pre-existing failure, disclosed:** `node --test tools/check-app3-f01-font-assets.test.mjs`
reports **37 pass / 3 fail**. I verified these reproduce at `HEAD` with the S05
tree stashed — they are not caused by this checkpoint and I did not repair them
here, as that is outside §1 scope.

---

## W. Contract immutability

```text
OpenAPI              = 35 paths / 40 operations / 83 schemas   unchanged
generated client     = d9aac2b3bfb322c1d604f2802e8a9b154bcb8744eabc780652658196d84735b9   unchanged
curated HTTP ops     unchanged
migrations           = 34   unchanged
root scripts         = 30   unchanged
API / worker / DB    untouched
dependencies         none added (no `pnpm install`)
```

Commit A was audited to contain nothing under `apps/api`, `apps/worker`,
`packages/database`, `packages/contracts/openapi` or
`packages/api-client/src/generated`.

The `APP3-D01-C1` Design System Input gap was **not** reopened; `S05` uses the
canonical Input semantics as the repository already realizes them (the shared
tokens `$radius-input`, `$size-touch-target-min`, `$color-border-primary`, exactly
as the existing placement select does) and this report does not claim S05 closed
anything there.

---

## X. Files, sizes, deviations, follow-ups

**New production source** (all ≤400):

| File | Lines |
|---|---|
| `model/studio-text-copy.ts` | 65 |
| `model/studio-text-fields.ts` | 150 |
| `model/studio-text-authority.ts` | 154 |
| `hooks/use-controlled-font.ts` | 84 |
| `hooks/use-studio-text.ts` | 140 |
| `components/studio-text-inspector.tsx` | 154 |
| `components/studio-text-controls.tsx` | 231 |

Modified: `components/studio-stage-screen.tsx` (307), `styles/design-studio.scss`.

**Tests** (≤600): `test/unit/studio-text-model.test.ts` 303 ·
`test/components/studio-text.test.tsx` 351 · `test/boundary/design-studio-source.test.ts` 594.

**Checker** (≤450 each after a split): `check-app3-s05.mjs` 278 ·
`check-app3-s05.sources.mjs` 111 · `check-app3-s05-runtime.mjs` 288 ·
`check-app3-s05.test.mjs` 437.

**Deviation, disclosed:** the checker was first written as a single 599-line file,
over the 450 soft cap, and was split by responsibility (paths/helpers ·
governance · runtime rules) before Commit A. No rule was dropped in the split; the
gate and all 37 mutation tests pass after it.

**Predecessor gate evolution — world-aware, not deleted.** `APP3-S01`'s
whole-feature ban on reaching the `APP3-P01` authority is kept and narrowed to
exclude only the seven files S05 introduces (`S05_FILES`), and the `S01`, `S02`,
`S03` and `S07` "this row belongs to a checkpoint that has not opened" assertions
are made world-aware on the section-09 text row **alone**. The lists name the
**new** files, so anything added later inherits the strict rule by default. `S03`'s
`fontPicker`/`setFontId`/`onChangeText` bans still apply to every file outside
`S05_FILES`, in every world.

**Environment, all reverted:** `smoke-app3-s01-fixtures` and
`bench-app3-s03-fixtures` generations were bumped (`3`→`4` and `1`→`2`) because a
published version is frozen, `revert` archives rather than deletes, and
`on conflict do nothing` would otherwise keep the archived rows. Both reverted.
`smoke-app3-s01-trustworthy-origin` applied and restored. `docker restart` of the
API between benchmark halves for the `IMP-D043` PO-07 5-per-hour Session cap, as
`APP3-S03` disclosed. The Storefront again needed a **second** restart before the
route stopped serving its own 404.

**Follow-ups carried unchanged.** No new one is opened by this checkpoint, other
than the WebKit S-resize boundary noted in §U, which belongs to the frozen S03
benchmark rather than to S05.

---

## Y. Commit A and tree state

```text
Commit A = 7f5611b  feat(storefront): add Studio text editing
28 files: 11 added, 17 modified
```

Contains no completion report, no API/DB/worker change, no OpenAPI or generated
client, no Figma mutation, no `S04`/`S06`/`S08`/`S09`/`S10`/`S11` capability, no
`B06C`, no autosave/history/upload/watermark/touch editing, no external
dependency, no P01/P02 schema change.

---

## Z. Roadmap

On delivery:

```text
APP3-S03-C1 = COMPLETE — REVIEW_ACCEPTED
APP3-S03    = COMPLETE — REVIEW_ACCEPTED
APP3-S05    = COMPLETE — REVIEW_DELIVERED
APP3-S11    = READY — NOT STARTED
APP3-B06C   = READY — NOT STARTED
APP3-S06    = BLOCKED_BY_APP3-B06C_REVIEW_ACCEPTANCE
```

`APP3-S05` is **not** self-accepted. After human acceptance it becomes
`COMPLETE — REVIEW_ACCEPTED` and
`NEXT_RECOMMENDED_CHECKPOINT = APP3-B06C`, then `APP3-B06C → APP3-S06`. Neither is
implemented here.
