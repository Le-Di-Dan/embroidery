# APP12-M01.S1 — Storefront Product Detail Multi-Image Gallery · Runtime Implementation

`APP12-M01.S1 = COMPLETE`

Internal implementation package inside the single `APP12-M01` checkpoint. Not a
new APP12 checkpoint id. Nothing was pushed, nothing was deployed, no
`APP12-G03` data was created, no Admin file was touched, no Figma artifact was
created or modified, no migration was added, no HTTP operation was added, and
the shared development database was not written to.

---

## A. Verdict

The approved multi-image experience was **almost entirely already delivered**.
`APP12-M01.B1` had shipped the two-address, two-size media contract; the strip,
the roving tabindex, the per-index failure tracking and the lightbox all existed
and all shared one selection state. What did not exist was the thing D1 §M made
mandatory and the thing a visitor at image seven of twenty most needs: **the
page never said where they were.** `positionLabel` — *"Ảnh 3 trên 20"* — had
existed since `APP2-S02` and was read by the lightbox and by nothing else.

S1 adds the counter and finishes the approved selected-state treatment. The
stage now carries an ink pill reading `7 / 20` that costs the composition zero
height, and beside it the sentence that already existed rather than a second one
invented for the occasion. The selected thumbnail now carries the three signals
`944:200` draws — an accent ring, full opacity against a subdued rest, and an
accent bar beneath the tile — where before it carried an ink border and nothing
else.

Measured live, at twenty images, in a headed browser: one `CATALOG_PREVIEW`
request, LCP 172 ms, CLS **0**, INP 48 ms, TTFB 31 ms, zero horizontal document
overflow at 1440/1024/390, one strip row at every one of them, and a purchase
price that sits within 2 px of where it sat with eight images.

```text
NEW HTTP OPERATIONS   0
NEW ROUTES            0
NEW MIGRATIONS        0
NEW DB TABLES/COLUMNS 0
NEW MESSAGE KEYS      0
NEW FIGMA ARTIFACTS   0

OpenAPI paths       127 (unchanged)
OpenAPI operations  140 (unchanged)
OpenAPI schemas     279 (unchanged)
public operations    49 (unchanged)
migrations           39 (unchanged)
```

One defect was found that S1 did **not** cause and did **not** fix. It is
recorded in §J.3 and it is the only thing in this report that is not green.

---

## B. A1 / B1 Product Owner reconciliation

The PO ruling in §1 of the brief is accepted without qualification and no work
in this package rests on the A1 report's stale sentence.

Verified against the running code rather than against either report:

| Claim | Where it is true in the code | Live evidence |
|---|---|---|
| stage → `CATALOG_PREVIEW` | `detail-media-stage.tsx:91` renders `media.url` | 1 request, journey A |
| strip → `THUMBNAIL` | `detail-thumbnail-strip.tsx:96` renders `item.thumbnailUrl` | 17–20 requests, journey A |
| thumbnail intrinsic dims | `detail-thumbnail-strip.tsx:98-100` | `width="800"` asserted, journey A |
| main intrinsic dims | `detail-media-stage.tsx:97` | `width="1600" height="1600"` asserted, journey A |
| non-selected previews not eager | strip carries `loading="lazy"`; only the stage is eager | `catalogPreview.length === 1`, journey A |

`FU-APP12-H05-03` was therefore already closed by B1 and S1 neither reopened nor
re-implemented it. The A1 limitation sentence was a copy of pre-B1 text; nothing
downstream of it was built on.

---

## C. Figma authority

`FIG-APPROVAL-APP12-M01-D1-PO-001`. Every entry resolved
`APPROVED_FOR_IMPLEMENTATION` before implementation began, and
`node tools/check-figma-design-index.mjs` passed (578 registry IDs, 578 node
rows, 26 registry tables).

| Registry ID | Node | What it governed here |
|---|---|---|
| `FIG-APP12-M01-D1-SF-DETAIL-8-DESKTOP` | `942:187` | the 8-image state at 1440 |
| `FIG-APP12-M01-D1-SF-DETAIL-20-DESKTOP` | `942:237` | the 20-image state, counter placement |
| `FIG-APP12-M01-D1-SF-DETAIL-TABLET` | `943:187` | 1024 bounding |
| `FIG-APP12-M01-D1-SF-DETAIL-MOBILE` | `943:273` | 390 horizontal strip, touch targets |
| `FIG-APP12-M01-D1-SF-LIGHTBOX` | `944:187` | lightbox opens on the selected image |
| `FIG-APP12-M01-D1-SF-SELECTION-STATES` | `944:200` | the three-signal selected treatment |

No Figma work was created or modified. `docs/design/FIGMA_DESIGN_INDEX.md` is
byte-identical to its state at entry.

### C.1 — one documented deviation

**The right-edge fade (`D1` §N.1) was not implemented.** It is the only element
of the approved frames that S1 leaves out, and the reason is that a CSS-only
fade cannot tell "more images exist to the right" from "you have scrolled to the
end". A static mask would soften the **last** thumbnail exactly when the visitor
reaches it — reporting the opposite of the truth in the one state the required
`last-image-selected` evidence captures. The information the fade stood in for
is carried, mandatorily and unambiguously, by the counter D1 §M added in the
same package: `20 / 20` says there is nothing further far more plainly than a
gradient. The runtime also happens to clip the eighth tile mid-width at 1440
(see `evidences/m01-s1/1440-20.png`), which is an honest overflow cue rather
than a decorative one.

---

## D. Runtime preflight

The first live run failed on a missing counter that the source plainly
contained. The cause is the e2e tier's own contract: it starts the Storefront
with `next start` and **never builds it**, so it served a `.next` directory
predating the change. `pnpm --filter @embroidery/storefront build` before the run
is therefore not optional for this package, and every figure below comes from a
run made after that build.

---

## E. Product media view model

Unchanged. `ProductDetailMedia` already carried `url` / `width` / `height` /
`thumbnailUrl` / `thumbnailWidth` / `thumbnailHeight` from `APP12-M01.B1`, and
S1 needed nothing that was not already there.

`media[0]` is used as the initial selection **because B1 guarantees public
effective-primary ordering**, and for no other reason. Nothing in S1 sorts,
filters or inspects a stored role, an asset id or a display order on the client;
`useGallerySelection` starts at index 0 and the array is rendered as received
(§18, §29.24).

---

## F. Main-stage implementation

Unchanged, deliberately. The stage still renders `media[selectedIndex].url` with
`loading="eager"`, `fetchPriority="high"`, `decoding="async"` and the
derivative's own `width`/`height` applied as a complete pair. B1's loading
authority is preserved exactly (§5), and journey A asserts all of it live.

The only structural change around it is a wrapper: `.product-detail__stage-frame`,
`position: relative`, width 100%. It exists so the counter can sit **on** the
stage without being **inside** the button that opens the large view — nesting it
there would have made the position readout a second thing to press with the
button's one meaning.

---

## G. Thumbnail-strip implementation

Unchanged in markup. `thumbnailUrl` with `loading="lazy"` and
`decoding="async"`, the roving tabindex, `aria-current`, the per-index failure
fallback and the ordered `<button>` controls were all already correct.

What changed is the **selected state**, which was one signal and is now the
approved three (`944:200`):

| Signal | Mechanism |
|---|---|
| accent ring | `&[aria-current='true'] { border-color: $color-action-primary }` — 2 px, on the transparent border every tile already reserves, so nothing reflows |
| opacity step | unselected tiles at `0.55`, selected (and hovered, and focus-visible) at `1` |
| accent bar | `.product-detail__thumbnail-item::after`, a 3 px rail always laid out and only ever recoloured, so selection cannot change the strip's height |

The bar is driven by `&:has([aria-current='true'])::after` rather than by a
second class, so the visual state and the announced state are the same fact and
cannot disagree. Where `:has()` is unsupported the ring and the opacity step
still carry the selection — which is the point of specifying three signals.

Boundedness was already correct and is now proved rather than assumed: the strip
is `max-width: 100%; overflow-x: auto` inside the gallery column, one row at
every viewport, scrollable at twenty (§M, §N, §O, §P).

---

## H. Counter semantics

`detail-media-counter.tsx`, 47 lines, one component.

| Aspect | Decision |
|---|---|
| visible | `7 / 20`, `font-variant-numeric: tabular-nums` so the width does not jitter as the digits change |
| position | absolute, bottom-right inside the stage frame, `pointer-events: none` |
| height cost | **zero** — it is an overlay, which is how §4 is satisfied by subtraction rather than by argument |
| non-visual | `positionLabel(index, total)` — *"Ảnh 7 trên 20"*, **the existing string**, no new key |
| numerals | `aria-hidden="true"`: "7 / 20" read aloud is "seven slash twenty", which is worse than the sentence beside it and would be heard immediately after it |
| display rule | `total > 1` shows, `total = 1` omits |
| live region | **none** — see below |

**No new message key was created** (§21). The visible half is numerals and a
separator; the spoken half is the string the lightbox has always used, so the
in-page counter and the large view now state the position in one voice.
`node tools/check-i18n-static-text.mjs` and
`node tools/check-i18n-message-keys.mjs` both pass, and the static-text gate
reports **0 explicit exemptions** — the numerals are not exempted from anything,
because there is no sentence there to translate.

**Why there is no `aria-live` region.** A selection change already announces
itself twice: the stage image's `alt` is rebuilt with the new position, and
`aria-current` moves to the pressed thumbnail. A third announcement would
interrupt the visitor on every arrow-key press with a fact they just caused
(§10). The hidden sentence is a label, read on demand.

The counter carries **no `'use client'` directive**. It holds no state, no effect
and no handler, and its only consumer is the gallery island, which is already a
client component — so the directive would have widened the app's declared client
boundary without moving one byte of behaviour across it. The boundary test that
counts client files stays at 9.

---

## I. Selection and keyboard behaviour

Unchanged and preserved (§9). Proved live in journey C rather than only in jsdom:

- thumbnails are `<button>` elements, never clickable `<div>`s;
- one Tab stop inside the strip, `tabIndex={selected ? 0 : -1}`;
- `ArrowLeft` / `ArrowRight` move selection, `Home` / `End` reach the ends;
- focus follows selection;
- **exactly one** `aria-current` at every point — asserted as a count over the
  whole strip, not as a check on one index, so a second one would fail;
- `focus-visible` is a `$color-focus-ring` outline and is not swallowed by the
  selection ring, which is a `border-color` on a different property.

Selecting thumbnail *N* updates the index, the stage `src`, the counter, both
readouts, `aria-current` and the truthful alt — all from the single
`useGallerySelection` state.

---

## J. Lightbox reconciliation

### J.1 — there was never a second state machine

`DetailGallery` passes its own `selectedIndex` to `DetailLightbox` and hands it
`selectPrevious` / `selectNext` from the same hook. Opening the large view
therefore already started at the selected image and navigation already moved the
page selection with it. S1 changed nothing here and introduced no second
gallery state (§11).

Proved live (journey D): select image 7 → open → the dialog states *"Ảnh 7 trên
20"* and renders `media[6]` → next → 8 → previous → 7 → close → the page still
reads `7 / 20` with exactly one `aria-current`.

### J.2 — stage arrows remain absent

D1 §O omitted them as a decision. None were added (§12).

### J.3 — DEFECT FOUND, NOT CAUSED BY S1, NOT FIXED

**The lightbox scrim does not cover the whole viewport.** Visible in
`evidences/m01-s1/lightbox-current-selected.png`: the purchase panel's `Kem` and
`M` variant pills, and the shell header, paint **on top of** the scrim and its
image.

The mechanism is exact and is not in the lightbox's own CSS. `.product-detail__scrim`
is `position: fixed; z-index: 100` — correct. But at the split hero width,
`_product-detail-hero.scss:60` makes `.product-detail__gallery` `position:
sticky` (an `APP12-V02` composition decision), and **`position: sticky` creates a
stacking context unconditionally**, regardless of `z-index`. The scrim's
`z-index: 100` is therefore scoped *inside* the gallery column, whose own level
in the hero is `z-index: auto`. The decision column's positioned controls come
later in DOM order at the same level, so they win.

Why it appears now and not before: the decision column had nothing positioned in
it until the `APP12-V02` purchase panel added `&__option { position: relative }`,
and no earlier package opened a lightbox over a panel carrying real variants.

**Not fixed here, deliberately.** The correct fix is to render the lightbox
through a portal to `document.body`, so a viewport-level overlay actually lives
at the viewport level. The repository has **no `createPortal` anywhere** today,
so that is a new pattern rather than a line change, it touches `APP12-V02`'s hero
composition and the shell's header stacking, and it is outside a package whose
§11 instruction is to *preserve* lightbox behaviour. Raising the sticky gallery's
`z-index` would fix the pills and leave the header wrong, which is a worse
outcome than a clearly-reported defect.

Recommended as `FU-APP12-M01-S1-01`, owner to be assigned by the Product Owner.

---

## K. One-image state

`evidences/m01-s1/one-image-state.png`, journey E.

```text
main preview          present, alt "… — ảnh 1 trên 1"
counter               ABSENT
thumbnail strip       ABSENT
zoom hint             present
lightbox              opens, no previous/next controls at all
```

No empty navigation chrome anywhere (§16). The strip omission was already the
delivered behaviour; the counter omission is new and is asserted both ways —
`1 / 1` and *"Ảnh 1 trên 1"* are each queried and each absent.

---

## L. No-media state

Untouched (§17). `media.length === 0` still renders `DetailMediaEmpty` and
removes the zoom hint, the strip and the lightbox trigger. No product imagery is
fabricated anywhere in this package; the disposable fixture's images belong to
disposable test Products only.

---

## M. Eight-image state

`evidences/m01-s1/1440-8.png`, journey B.

```text
thumbnails            8
strip rows            1
document overflow     0 px
counter               1 / 8
```

D1 measured this state as 596 px inside a 660 px bound — fitting exactly — which
makes it the state that would expose a strip that had begun to wrap. It has not.

---

## N. Twenty-image state

Journeys A, B, C, D.

```text
thumbnails                       20
strip rows                        1     (no multi-row wall)
strip scrollable                  true  (scrollWidth > clientWidth)
document horizontal overflow      0 px
counter                           1 / 20 → 7 / 20 → 8 / 20 → 20 / 20
aria-current elements             exactly 1, always
purchase price vertical position  within 2 px of the 8-image page
```

The last line is §4 measured rather than asserted: the counter is an overlay and
the strip is one row, so adding twelve images moves the price by less than the
rounding of a bounding box.

---

## O. 1440 · 1024 · 390

| Viewport | Thumbs | Rows | Overflow | Strip box | Counter | Touch target |
|---|---|---|---|---|---|---|
| 1440 | 20 | 1 | 0 px | bounded to gallery column, scrolls | visible | 64 px |
| 1024 | 20 | 1 | 0 px | ≤ 1024, scrolls | visible | 64 px |
| 390 | 20 | 1 | 0 px | ≤ 390, scrolls | visible | 64 px |

At 390 (`evidences/m01-s1/390-20.png`) the strip is **horizontal**, never a
vertical stack, and the V02 hierarchy above and below it is untouched: title,
price, availability and `Mua ngay` sit exactly where V02 placed them. At 1024
(`evidences/m01-s1/1024-20.png`) the counter stays inside the stage, so no
thumbnail control competes with the CTA.

Touch targets are measured from the rendered bounding box, `>= 44 px` asserted,
64 px actual.

---

## Q. Network and rendition evidence

Recorded from real Chromium request events on a cold load of the twenty-image
Product at 1440:

```text
CATALOG_PREVIEW requests    1
THUMBNAIL requests         17
other renditions            0
```

**Seventeen, not twenty, and that is correct.** The strip carries
`loading="lazy"` and scrolls horizontally, so the browser fetches only the
thumbnails it actually lays out inside the viewport. The first assertion written
here demanded twenty and failed; the code was right and the assertion was wrong,
and it now asserts what matters — every image the strip requested is a
`THUMBNAIL`, it requested more than a couple, and no third rendition appeared
from anywhere.

After viewing three further images, `CATALOG_PREVIEW` requests remained `<= 4` —
one per image actually looked at, never the other sixteen (§26).

Pixel checks (§24), on the stage and on the first thumbnail:

```text
status              200
content-type        image/webp
naturalWidth        > 0
naturalHeight       > 0
```

No broken-image glyph appears in any of the eight evidence screenshots.

---

## R. Performance evidence

Measured with the `APP12-H05` probe on a cold desktop load of the twenty-image
Product with one real interaction, so INP has something to report.

```text
run 3  [m01s1] core web vitals {"lcpMs":444,"cls":0,"worstInteractionMs":24,"ttfbMs":38.2}
run 4  [m01s1] core web vitals {"lcpMs":172,"cls":0,"worstInteractionMs":48,"ttfbMs":30.8}
```

Two green runs are quoted rather than one, because a single sample of a
sub-second figure says less than two that agree about which side of the budget
they are on. Run 4 is the final one, made after the §X.1 tightening and a fresh
Storefront build; run 3 is the run before it. The gate figures below are run 4's.

| Metric | Budget | Measured (run 4) | Run 3 | Margin |
|---|---|---|---|---|
| LCP | ≤ 2500 ms | **172 ms** | 444 ms | 14.5× |
| CLS | ≤ 0.10 | **0** | 0 | exact zero, both runs |
| INP | ≤ 200 ms | **48 ms** | 24 ms | 4.2× |
| TTFB | ≤ 800 ms | **31 ms** | 38 ms | 26× |

CLS of exactly zero **in both runs** is the direct consequence of `APP12-H05-C1` + `M01.B1`: both
images carry their own derivative's intrinsic dimensions, so every box is the
right shape before its bytes arrive, and switching images does not move the page.

**The fixture was chosen so these numbers mean something.** It seeds from the
**H05** image pool — 800 px `THUMBNAIL` against 1600 px `CATALOG_PREVIEW` — and
not from the 400/800 H06 pool `M01.A1` used. The H06 proportions would have
compressed the very ratio `M01.B1` exists to create and would have reported a
saving owed as much to the fixture as to the code. Twelve real sources back
twenty Assets; the bodies repeat but every Asset has its own rows and its own
storage keys, so the browser fetches twenty distinct addresses and no
measurement is flattered by a cache hit.

`FU-APP12-H05-03` was not reopened.

---

## S. Accessibility

`axe` via `h08-axe.mjs`, gate = serious/critical `0`, on the three required
surfaces:

```text
1440 · 20 images    0 serious/critical
390  · 20 images    0 serious/critical
lightbox            0 serious/critical
```

`color-contrast` is excluded from the **gate** and from nothing else, for the
reason `APP12-H08` recorded and `PO-APP12-004` ruled: the failing token pairs are
`APP12-V02`'s to change. No other rule was disabled and no rule was disabled to
reach a number.

Also proved live: keyboard thumbnail navigation, `focus-visible`, `aria-current`
uniqueness, a truthful main alt that invents no picture content, a counter
understandable non-visually, and labelled lightbox close/previous/next controls.

---

## T. Visual evidence

`evidences/m01-s1/` — all eight required captures, deterministic names, full page:

```text
1440-8.png                     8 images at 1440
1440-20.png                    20 images at 1440, counter 1 / 20
1024-20.png                    20 images at 1024
390-20.png                     20 images at 390, horizontal strip
middle-image-selected.png      image 7 of 20 selected
last-image-selected.png        image 20 of 20 selected
lightbox-current-selected.png  lightbox opened on image 7 (see §J.3)
one-image-state.png            single image, no counter, no strip
```

---

## U. API and DB baseline

Verified against `packages/contracts/openapi/openapi.generated.json` and the
migration directory, not assumed:

```text
OpenAPI paths       127   expected 127   ✓
OpenAPI operations  140   expected 140   ✓
OpenAPI schemas     279   expected 279   ✓
public operations    49   expected  49   ✓
migrations           39   expected  39   ✓  (no 0040)
DB tables            79   unchanged      ✓  (no migration added)
Admin routes         26   unchanged      ✓  (no Admin file touched)
Storefront routes    20   unchanged      ✓  (no route file added)
```

`git diff HEAD -- apps/api packages/persistence packages/contracts` is **empty**.
`pnpm --filter @embroidery/api-client check:generated` reports the generated
client up to date; no OpenAPI or client drift exists because no contract moved.

---

## V. Files changed

**Storefront — the whole of the implementation (4 files, 1 new):**

```text
A  src/features/product-detail/components/detail-media-counter.tsx    47
M  src/features/product-detail/components/detail-gallery.tsx          +18
M  src/features/product-detail/styles/_product-detail-gallery.scss    +72
M  src/features/product-detail/styles/_product-detail-tokens.scss     +21
M  test/components/product-detail-gallery.test.tsx                    +60
M  test/boundary/product-detail-source.test.ts                        +8/-2
```

**E2E harness (6 files, 3 new):**

```text
A  packages/e2e-testing/support/app12/m01s1-gallery-fixture.mjs
A  packages/e2e-testing/specs/app12/support/m01s1-world.ts
A  packages/e2e-testing/specs/app12/m01s1-gallery.acceptance.spec.ts
M  packages/e2e-testing/playwright.config.ts        (one project)
M  packages/e2e-testing/scripts/run-e2e.mjs         (one tier)
M  packages/e2e-testing/package.json                (two scripts)
```

**Documentation:**

```text
M  docs/implementation/SCOPED_COMMAND_INDEX.md      (CMD-E2E-APP12-M01S1)
A  docs/implementation/reports/APP12-M01-S1-COMPLETION-REPORT.md
```

No Admin file, no API file, no persistence file, no migration, no generated
file, no Figma index row, no message-repository key.

---

## W. File size

`node tools/check-file-size.mjs --paths …` over every file this package touched:
**33 files, 0 above the review threshold.** Largest new source is the acceptance
spec at 297 lines (test limit 600); largest new logic file is the fixture at 224
(source limit 400); the counter component is 47.

`node tools/check-scss-file-size.mjs apps/storefront/src/features/product-detail/styles`
— 8 stylesheets, 0 above threshold.

Pre-existing, not caused here and not fixed here:
`packages/e2e-testing/specs/app12/support/s03-world.ts` is 426 lines against the
400 hard limit. It is `APP12-S03`'s file and S1 did not touch it.

---

## X. Validation

Every command below was run and its result is what is reported.

```text
git diff --check                                              clean
pnpm --filter @embroidery/storefront typecheck                pass
pnpm --filter @embroidery/storefront lint                     pass
pnpm --filter @embroidery/storefront test                     134 suites, 2547 tests, all pass
pnpm --filter @embroidery/e2e-testing typecheck               pass
pnpm --filter @embroidery/e2e-testing lint                    pass

node tools/check-i18n-static-text.mjs                         OK, 0 exemptions
node tools/check-i18n-message-keys.mjs                        OK
node tools/check-app-scss.mjs storefront                      compile PASS
node tools/check-scss-file-size.mjs …/product-detail/styles   pass
node tools/check-styling-boundaries.mjs                       31 violations — 31 at HEAD, none in product-detail
node tools/check-storefront-route-authority.mjs               pass
node tools/check-storefront-product-detail-authority.mjs      pass
node tools/check-storefront-product-detail-correction.mjs     pass
node tools/check-figma-design-index.mjs                       pass (578 IDs)
node tools/check-report-secrets.mjs                           pass (684 docs, 5400 files)
node tools/check-file-size.mjs --paths <S1 paths>             pass (33 files)
pnpm --filter @embroidery/api-client check:generated          up to date

pnpm --filter @embroidery/e2e-testing e2e:app12:m01s1:headed  6 passed (final run, after a fresh Storefront build)
```

**The Playwright run was headed, visibly, every time** — never in a hidden or
headless mode. `--headed` is baked into the `:headed` script the Product Owner
watches.

Two pre-existing harness facts, neither caused by S1 and both verified against
`HEAD` and against `ca62cb73` (pre-A1):

1. `node scripts/check-e2e.mjs` cannot list tests. `specs/app12/support/v02-c2-world.ts:12`
   imports `admin.json` without an import attribute, which fails the whole
   `playwright --list`. It does **not** affect a scoped project run:
   `npx playwright test --project=app12-m01s1-chromium --list` lists all six
   journeys correctly.
2. `node tools/check-styling-boundaries.mjs` reports 31 violations, all in
   `secure-ready-made-order` and `secure-deposit-payment`. The count is
   identical at `HEAD` with S1 stashed.

### X.1 — the two assertions this package corrected

Reported because both are places where a first attempt asserted the wrong thing
and the code was right:

1. **Twenty thumbnail requests.** Corrected to a range plus "no other
   rendition". The strip is lazy; 17 of 20 load at 1440. See §Q.
2. **Two boundary constants.** `keeps the client boundary narrow` expected 9
   client files and `uses shared tokens` allowed 4 raw colours. Rather than
   raise both, the code was tightened first: the counter's `'use client'` was
   removed (it needs none), holding the boundary at 9; and the pill was rewritten
   as `rgba(styles.$color-text-primary, 0.86)` and
   `styles.$color-surface-primary`, so only **one** new literal exists and only
   the opacity is local. The colour budget then moved 4 → 5 with the reason
   written at the assertion.

---

## Y. Hygiene

```text
shared_dev_mutations      0      (the fixture refuses any database not named embroidery_db7_*)
G03_data_created          false
production_deployed       false
pushed                    false
migrations_added          0
admin_files_changed       0
figma_artifacts_created   0
http_operations_added     0
message_keys_added        0
secrets_written           0      (.env untouched; no credential read, logged or committed)
disposable_teardown       verified — "cleanup verified: all E2E ports closed, disposable database dropped"
```

Every acceptance run provisioned its own `embroidery_db7_*` database and dropped
it. The fixture's `assertDisposable` refuses anything else outright, so
`VALIDATION_GOVERNANCE.md` §3A.4 and the `APP12-G03` reservation are enforced
rather than remembered.

---

## Z. M01 internal roadmap

```text
APP12-M01.A      COMPLETE — PO PASS
APP12-M01.B1     COMPLETE — PO PASS
APP12-M01.DB1    COMPLETE — PO PASS
APP12-M01.B2     COMPLETE — PO PASS
APP12-M01.D1     COMPLETE_AFTER_C1 — PO APPROVED
APP12-M01.D1-C1  COMPLETE — PO PASS
APP12-M01.A1     COMPLETE — PO PASS
APP12-M01.S1     COMPLETE           ← this package

APP12-M01        IMPLEMENTATION_IN_PROGRESS
ROADMAP_CHECKPOINTS 39

INTERNAL_NEXT    = M01.E1
APP12-G03        = NOT_AUTHORIZED
```

`M01.E1` was **not** executed. One open item is carried into it or into a
correction package at the Product Owner's discretion:

```text
FU-APP12-M01-S1-01   the lightbox scrim is trapped inside the sticky gallery's
                     stacking context, so the purchase panel's variant pills and
                     the shell header paint over the enlarged image. Mechanism and
                     recommended fix in §J.3. Not caused by S1; not fixed by S1.
```

STOP.
