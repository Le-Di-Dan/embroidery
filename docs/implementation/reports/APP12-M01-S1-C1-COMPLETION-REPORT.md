# APP12-M01.S1-C1 — Product Detail Lightbox · Viewport Overlay / Stacking-Context Correction

`APP12-M01.S1-C1 = COMPLETE`

The single authorized correction for the internal Storefront package
`APP12-M01.S1`. Not a new APP12 checkpoint id. `CORRECTION_USED = 1 / 1`.
Nothing was pushed, nothing was deployed, no `APP12-G03` data was created, no
Admin file was touched, no Figma artifact was created or modified, no migration
was added, and no HTTP operation was added.

---

## A. Verdict

The lightbox was never a viewport overlay. It said it was — `position: fixed;
inset: 0; z-index: 100` — but where an element *paints* is decided by its
stacking context, not by its coordinates, and this one was sealed inside the
gallery column. The correction moves the subtree to `document.body`, which is
the only change that makes its `z-index` mean anything at all.

Proved mechanically rather than by eye. Before, at the point over the shell
header with the dialog open, `document.elementsFromPoint` returned:

```text
ul.storefront-shell__nav-list | nav.storefront-shell__nav | div.storefront-shell__bar-nav
```

After, at every one of the same points, at 1440, 1024 and 390, the top of the
stack belongs to the lightbox layer.

Two further defects were found while proving it, both inside this correction's
own subject and both fixed here:

1. **The scroll lock moved the page sideways.** Locking `body` removed the
   scrollbar and handed its width back to the layout: `documentElement.clientWidth`
   went 1425 → 1440 on open and back on close, so everything under the overlay
   slid ~15 px and returned. The lock now reserves the freed width.
2. **An unnamed control, avoided rather than found.** Turning the navigation
   buttons into icons (§F.3) is exactly the change that produces controls a
   screen reader cannot announce, so the words were moved to `aria-label` and
   pinned by a test rather than simply deleted.

And one Product Owner direction was taken during the correction: the
previous/next controls are now circular outline chevron buttons rather than the
words *"Ảnh trước"* / *"Ảnh sau"*. See §F.3 and the deviation in §T.

```text
NEW HTTP OPERATIONS   0
NEW ROUTES            0
NEW MIGRATIONS        0
NEW MESSAGE KEYS      0
NEW FIGMA ARTIFACTS   0
NEW DEPENDENCIES      0
```

---

## B. Product Owner correction authority

```text
APP12-M01.S1     = CORRECTION_REQUIRED   → addressed here
APP12-M01.S1-C1  = AUTHORIZED            → executed
CORRECTION_USED  = 1 / 1                 → no S1-C2 requested
APP12-M01.E1     = NOT_AUTHORIZED        → not executed
APP12-G03        = NOT_AUTHORIZED        → not started
```

No already-green S1 work was reopened. The whole S1 acceptance suite was re-run
unchanged alongside this correction and is green; see §M and §R.

---

## C. Accepted S1 baseline — preserved

Every line of §1 of the brief was re-proved live in the same run, not assumed.

| Baseline | Evidence |
|---|---|
| initial selection = `media[0]` | S1 journey A |
| main stage = `CATALOG_PREVIEW`, exact dims, eager + `fetchpriority=high` | S1 journey A |
| strip = `THUMBNAIL`, exact dims, lazy + async | S1 journey A |
| visible counter, hidden at total = 1 | S1 journeys A, E |
| one `aria-current`, 3-signal selected state, roving keyboard | S1 journey C |
| 1440 / 1024 / 390 at 20 images, no horizontal overflow | S1 journey B, C1 §I–K |
| V02 purchase hierarchy | S1 journey B (price within 2 px between 8 and 20 images) |
| lightbox opens the selected image, ordered prev/next | S1 journey D, C1 §M |
| LCP / CLS / INP / TTFB inside budget | S1 journey F, C1 §O |
| `FU-APP12-H05-03` closed by B1 | untouched |

---

## D. Root-cause verification

The reported mechanism was not taken on trust. It was reproduced, and the
reproduction is the first assertion in the new suite.

**The chain, verified in source:**

```text
apps/storefront/src/features/product-detail/styles/_product-detail-hero.scss:60
  .product-detail__gallery { position: sticky; top: …; }
      ↳ inside @media (min-width: $bp-detail-hero-split)   ← APP12-V02

CSS: position: sticky creates a stacking context UNCONDITIONALLY,
     regardless of z-index.

  .product-detail__scrim { position: fixed; inset: 0; z-index: 100; }
      ↳ rendered as a descendant of .product-detail__gallery
      ↳ so its z-index competed only with its own siblings

  .product-detail__gallery entered the hero at z-index: auto
  .storefront-shell__bar   is z-index: $z-drawer - 1 = 99, sticky, at the root
  .ready-made-purchase__option { position: relative }  → positioned, z-auto,
      later in DOM order than the gallery
```

So the header won on a positive `z-index` against a context whose own level was
`auto`, and the variant pills won on DOM order at the same level. Neither
comparison ever involved the number `100`.

**Reproduced live, before any code changed** — the new hit-test suite run against
the unfixed build:

```text
1440: the lightbox must own the point over the shell header;
      top of stack was ul.storefront-shell__nav-list
                     | nav.storefront-shell__nav storefront-shell__nav--bar
                     | div.storefront-shell__bar-nav
```

**Why a bigger number could not have worked.** `z-index` is only compared
between elements in the same stacking context. Raising `100` to `10000` would
have changed the scrim's rank among its siblings inside the gallery column and
nothing else. That is precisely the brittle patch §6 forbids, and the reason it
is forbidden is that it does not work, not merely that it is inelegant.

**Why it appeared only now.** The decision column held nothing positioned until
`APP12-V02` added `&__option { position: relative }` to the purchase panel, and
no package before `M01.S1` opened this lightbox over a Product carrying real
variant options.

---

## E. Existing overlay / portal preflight

Searched before choosing an approach, as §4 requires:

```text
createPortal / ReactDOM.createPortal    0 occurrences in the entire repository
modal root / overlay root / dialog layer  none
shared z-index scale in @embroidery/styles  none — the foundation publishes no
                                            z-index tokens at all
```

What does exist:

| Surface | Layer | Notes |
|---|---|---|
| `storefront-shell` `$z-drawer` | 100 | mobile drawer; header at `$z-drawer - 1` |
| `gallery-detail` `$scrim-layer` | 100 | the sibling APP11 lightbox — **same non-portal pattern** |
| `secure-*` dialogs | 20 / 40 | in-page dialogs, not viewport overlays |
| `admin` `$payment-dialog-layer` | 250 | different application |

The sibling `gallery-detail` lightbox is the closest precedent and is **not** a
solution to reuse: it is the same in-place `position: fixed` construction. It
does not exhibit the defect only because the Gallery Entry page has no sticky
media column to seal it inside — which is luck, not design.

There was therefore no existing overlay authority to reuse, and §5's authorization
applies.

---

## F. Chosen implementation

### F.1 — the portal

`DetailLightbox` returns `createPortal(<scrim…>, document.body)`.

That is the whole structural change. It is the minimum that fixes the *ownership*
rather than the symptom: the scrim becomes a child of the root stacking context,
where the shell's layers actually live, so the two are finally comparable.

Deliberately **not** done: no overlay-root element, no provider, no portal
hook, no shared modal layer. §5 forbids a general portal framework unless
mechanically necessary, and one dialog needs none.

**SSR and hydration safety.** The component touches `document` during render, so
it guards:

```tsx
if (typeof document === 'undefined') return null;
```

placed after every hook, so hook order stays unconditional. In practice the
branch is never taken — `lightboxOpen` starts `false`, so the server never
renders this component — which is also why there is no open-on-mount flash to
suppress and no `mounted` state to add.

**No second state machine.** The dialog keeps its existing props; selection still
lives in `DetailGallery`'s single `useGallerySelection`. React keeps portalled
children in the *React* tree, so events still bubble to the gallery island, and
the focus trap keeps working because it is driven by a ref, which follows the
node wherever React renders it.

### F.2 — the layer number, and why it is not a brittle patch

`$scrim-layer: 200`, replacing the literal `100`.

§6 permits a `z-index` decision only when all relevant elements are proved to
share a stacking context. **The portal is that proof**: after it, the scrim and
the shell's layers are siblings in the root context, and the comparison is real
for the first time. The value clears `$z-drawer: 100`, mirrored from the shell
with a comment (the same concession `$bp-shell-wide` already records) and pinned
by a new boundary test that fails if either side moves.

200 rather than 101 so the next shell layer to be added does not land in the gap.

The shell header's `z-index` was **not** lowered and no unrelated page was
touched.

### F.3 — Product Owner direction: chevron navigation controls

Taken during this correction at the Product Owner's explicit instruction: the
lightbox's previous/next controls were the words *"Ảnh trước"* and *"Ảnh sau"*
in filled pills, which read as instructions to a reader rather than as controls
on a viewer and competed with the artwork for attention.

They are now **circular outline buttons with a centred chevron**:

```text
size          $size-touch-target-min in both axes (the shared token, so the
              circle IS the minimum target rather than a number near it)
border        1px $scrim-foreground-muted, transparent fill
hover         border brightens, fill becomes $scrim-control-surface
focus-visible 2px $scrim-foreground outline, offset 2
disabled      opacity 0.4 — the ring fades with the icon, so "you are at the
              last image" is not carried by colour alone
icon          inline SVG, currentColor stroke, aria-hidden, focusable=false
```

**The words did not disappear — they moved.** `PRODUCT_DETAIL_COPY.lightboxPrevious`
and `.lightboxNext` are now the buttons' `aria-label`, so the copy stays owned by
`packages/i18n/messages/vi/storefront.json`, **no new message key exists**, and
the accessible names are byte-identical to what they were. The proof is that
every pre-existing test selecting these controls by `getByRole('button', { name:
'Ảnh trước' })` still passes, unmodified.

**Close keeps its word.** `Đóng` is the one control whose meaning an icon
genuinely obscures, and it sits in the header rather than over the artwork, so it
was left alone.

**Inline SVG rather than an icon package or a glyph.** The repository has no icon
library, and adding one to draw two arrows would be a dependency bought for two
arrows. The shell draws its menu with a literal `☰`, which is adequate for one
control but wrong here: a text glyph inherits font metrics, renders differently
per platform, and cannot be centred reliably inside a circle.

---

## G. Stacking-context model, before and after

**Before**

```text
root stacking context
├── .storefront-shell__bar            sticky, z-index: 99      ← painted over the modal
└── main
    └── .product-detail__hero
        ├── .product-detail__gallery  STICKY → own context, level auto
        │   └── .product-detail__scrim  fixed, z-index: 100
        │       └── (sealed: 100 only ranks it among its own siblings)
        └── .product-detail__decision
            └── .ready-made-purchase__option  relative, z-auto, later in DOM
                                              ← painted over the modal
```

**After**

```text
root stacking context
├── .storefront-shell__bar            sticky, z-index: 99
├── main
│   └── … .product-detail__gallery    STICKY → own context, level auto
│       └── (the dialog no longer renders here)
└── .product-detail__scrim            fixed, z-index: 200   ← portalled to body
                                                              a sibling of the
                                                              shell, and above it
```

The gallery's sticky context is untouched; `APP12-V02`'s composition decision
stands. What changed is that the overlay stopped living inside it.

---

## H. Scroll and focus semantics

### H.1 — the lock already existed and is preserved

`useDialogFocus` already set `body.style.overflow = 'hidden'` on open and
restored the previous value on cleanup. §8 says to preserve an existing lock, and
it is preserved.

### H.2 — DEFECT FOUND AND FIXED: the lock shifted the page sideways

Locking `body` removes the scrollbar, and the width it occupied is handed back to
the layout. Measured live:

```text
documentElement.clientWidth   before open   1425
                              while open    1440    ← everything under the
                                                      overlay slid ~15px
```

§9 requires "no body-width jump from scroll locking", so this is inside the
correction rather than beside it. The lock now reserves the freed width:

```ts
const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
document.body.style.overflow = 'hidden';
if (scrollbarWidth > 0) document.body.style.paddingRight = `${scrollbarWidth}px`;
```

with `paddingRight` restored alongside `overflow` on cleanup. The scrim is
`position: fixed` and therefore measured against the viewport rather than the
padded body, so it still spans the full width — asserted, so the compensation
cannot silently narrow the overlay it was meant to steady.

Proved: locked (page frozen, wheel moves nothing), no width jump, scroll position
kept across close, `overflow` and `paddingRight` both back to `''`, and clean
after three open/close cycles.

### H.3 — focus

Preserved and re-proved, because a portal is exactly the change that could have
broken it by moving the DOM out of the page's order. Eight consecutive `Tab`
presses inside the open dialog were each asserted to land on an element still
inside `.product-detail__scrim`; focus never reaches the page behind. On close it
returns to the stage trigger that opened it. `role="dialog"`, `aria-modal`, the
accessible name and Escape-to-close are unchanged.

---

## I. 1440 proof

`evidences/m01-s1-c1/1440-lightbox.png`.

```text
scrim box            top 0, left 0, width = innerWidth, height = innerHeight
hit over header      lightbox layer
hit over pill        lightbox layer
hit over CTA         lightbox layer
close control        visible, not clipped on any edge
document overflow    0 px
```

The screenshot shows the shell header dimmed under the scrim and the variant
pills gone — the direct visual inverse of the S1 evidence that opened this
correction.

---

## J. 1024 proof

`evidences/m01-s1-c1/1024-lightbox.png`. Same assertions, same results. 1024 is
inside the split-hero media query, so the sticky gallery — and therefore the
original defect — is live at this width too.

---

## K. 390 proof

`evidences/m01-s1-c1/390-lightbox.png`.

```text
scrim box            covers the viewport exactly
hit over header      lightbox layer
close control        visible, not clipped
document overflow    0 px
no body-width jump   (no scrollbar to reclaim at this width)
```

**The purchase panel is not hit-tested at 390, and that is the honest result.**
`elementsFromPoint` is defined on the viewport, not the document: below the fold
it returns an empty stack, which reads exactly like "nothing is on top". At 390
the panel sits far below the fold and the scroll lock freezes it there, so
nothing can be painting over the overlay at a point the visitor cannot see. The
suite filters targets to those actually on screen and then **requires the header
to be among them**, so a run that tested nothing fails instead of passing
silently. The first version of this check did not filter, and reported a false
failure with an empty stack — recorded here because the assertion was wrong, not
the code.

---

## L. Mechanical hit-test proof

Not screenshots. `document.elementsFromPoint(x, y)` — the plural, so a failure
reports *what* was on top rather than only that something was.

Points are measured **after** the dialog opens, because the scroll lock freezes
the page beneath and those are the coordinates the controls actually hold while
the overlay is up. Targets outside the viewport are excluded for the reason in
§K.

```text
target            1440      1024      390
shell header      lightbox  lightbox  lightbox
variant pill      lightbox  lightbox  (below fold — not testable)
purchase CTA      lightbox  lightbox  (below fold — not testable)
```

Plus the geometric assertion at every viewport: the scrim's bounding box top,
left, width and height equal `0, 0, innerWidth, innerHeight`.

---

## M. Selected-image and lightbox regression

§12, live:

```text
select image 7   → counter 7 / 20
open             → dialog states "Ảnh 7 trên 20", renders media[6]
next             → "Ảnh 8 trên 20"
previous         → "Ảnh 7 trên 20"
Escape           → dialog hidden
page             → counter still 7 / 20, exactly one aria-current, on thumbnail 7
focus            → returned to the stage trigger
```

All six S1 gallery journeys were re-run unchanged in the same run and pass, which
is what proves the portal did not disturb the accepted work.

---

## N. Accessibility

Focused axe on the overlay at 1440 and 390, gate serious/critical = 0, with
`color-contrast` excluded from the gate only, for the reason `APP12-H08` recorded
and `PO-APP12-004` ruled. No other rule was disabled.

Additionally proved:

```text
role="dialog" + aria-modal="true"        preserved
accessible name (the Product name)       preserved
Escape closes                            preserved
close labelled                           "Đóng", visible text
previous/next labelled                   "Ảnh trước" / "Ảnh sau" via aria-label
chevron announced                        never — aria-hidden, focusable=false
focus cannot reach the page behind       8 tab presses asserted
focus returns to opener on close         asserted
```

The icon-button change is the one that most easily produces an unnamed control,
so it carries its own component test: both buttons have empty text content, both
have the exact Vietnamese accessible name, both chevrons are `aria-hidden`, and
the two glyphs differ — so "back" and "forward" are not the same picture.

---

## O. Performance and media smoke

§14 only; no full H05 rerun.

```text
initial CATALOG_PREVIEW requests   1
thumbnail strip rendition          THUMBNAIL
other renditions                   0
no eager full-preview burst        confirmed
CLS after a full open/close cycle  0
```

The S1 budget journey ran unchanged in the same run:

```text
[m01s1] core web vitals {"lcpMs":420,"cls":0,"worstInteractionMs":0,"ttfbMs":54.7}
```

| Metric | Budget | Measured |
|---|---|---|
| LCP | <= 2500 ms | 420 ms |
| CLS | <= 0.10 | **0** |
| INP | <= 200 ms | 0 ms |
| TTFB | <= 800 ms | 55 ms |

A layering correction must not move the rendition policy B1 owns, and it did
not. The scrollbar compensation in §H.2 can only improve CLS, because the shift
it removes was a real one.

---

## P. Files changed

```text
A  apps/storefront/src/features/product-detail/components/detail-chevron.tsx        42
M  apps/storefront/src/features/product-detail/components/detail-lightbox.tsx      +40
M  apps/storefront/src/features/product-detail/hooks/use-dialog-focus.ts           +15
M  apps/storefront/src/features/product-detail/styles/_product-detail-lightbox.scss +57
M  apps/storefront/src/features/product-detail/styles/_product-detail-tokens.scss   +19
M  apps/storefront/test/components/product-detail-gallery.test.tsx                  +20
M  apps/storefront/test/boundary/product-detail-mobile-band.test.ts                 +12
A  packages/e2e-testing/specs/app12/m01s1-c1-lightbox.acceptance.spec.ts           378
A  docs/implementation/reports/APP12-M01-S1-C1-COMPLETION-REPORT.md
```

No Admin file, no API file, no persistence file, no migration, no route, no
generated file, no Figma artifact, no message-repository key, no new dependency.
The e2e tier itself needed no change: the new spec rides the existing
`app12-m01s1-chromium` project and its fixture, because `testMatch` already
covers `m01s1-*`.

---

## Q. File size

```text
detail-chevron.tsx                       42   (source limit 400)
detail-lightbox.tsx                     183
use-dialog-focus.ts                      91
_product-detail-lightbox.scss           164
m01s1-c1-lightbox.acceptance.spec.ts    378   (test limit 600)
product-detail-gallery.test.tsx         393
```

`node tools/check-file-size.mjs --paths <C1 paths>` — 33 files, 0 above the
review threshold. `node tools/check-scss-file-size.mjs …/product-detail/styles` —
8 stylesheets, 0 above threshold.

The portal seam is one `createPortal` call and one guard, inside the component
that already owned the dialog. Nothing was extracted to a shared layer.

---

## R. Validation

```text
git diff --check                                              clean
pnpm --filter @embroidery/storefront typecheck                pass
pnpm --filter @embroidery/storefront lint                     pass
pnpm --filter @embroidery/storefront test                     134 suites, 2549 tests, all pass
pnpm --filter @embroidery/e2e-testing typecheck               pass
pnpm --filter @embroidery/e2e-testing lint                    pass

node tools/check-app-scss.mjs storefront                      compile PASS
node tools/check-scss-file-size.mjs …/product-detail/styles   pass
node tools/check-file-size.mjs --paths <C1 paths>             pass
node tools/check-i18n-static-text.mjs                         OK, 0 exemptions
node tools/check-i18n-message-keys.mjs                        OK
node tools/check-storefront-product-detail-authority.mjs      pass
node tools/check-storefront-product-detail-correction.mjs     pass
node tools/check-storefront-route-authority.mjs               pass
node tools/check-report-secrets.mjs                           pass
pnpm --filter @embroidery/api-client check:generated          up to date

pnpm --filter @embroidery/e2e-testing e2e:app12:m01s1:headed  13 passed (7 C1 + 6 S1)
```

The i18n gates were run despite §17 scoping them to copy changes, because the
chevron change *moves* copy from visible text to `aria-label` — a position the
static-text gate classifies differently — and "no new key, no hard-coded string"
had to be proved rather than asserted.

**Every Playwright run was headed and visible**, never headless or hidden. The
final run: **13 passed** — the seven new C1 journeys plus, unchanged, all six S1
gallery journeys.

### R.1 — three assertions this correction had to correct

Each was the test being wrong while the code was right, and each is recorded
because a suite that had passed on any of them would have proved less than it
claimed:

1. **An empty hit stack read as success.** `elementsFromPoint` is defined on the
   viewport; a below-the-fold coordinate returns `[]`, which is
   indistinguishable from "nothing on top". The suite now filters to on-screen
   targets and requires the header to be among them. §K.
2. **A stale scroll baseline.** Playwright scrolls a control into view before
   clicking it, so a position sampled before opening the dialog is one the page
   has already left — 400 compared against the 213 the auto-scroll produced. The
   baseline is now read after opening.
3. **The wrong width metric.** `documentElement.clientWidth` *is*
   viewport-minus-scrollbar, so it changes when the scrollbar goes no matter what
   `body` does; asserting on it reported a failure that was true of the metric
   and false of the page. The check now measures a real block-level child of
   `body`. §H.2.

---

## S. Hygiene

```text
shared_dev_mutations      0      (fixture refuses any database not embroidery_db7_*)
G03_data_created          false
production_deployed       false
pushed                    false
migrations_added          0
admin_files_changed       0
figma_artifacts_changed   0
http_operations_added     0
message_keys_added        0
dependencies_added        0
secrets_written           0
disposable_teardown       verified — "cleanup verified: all E2E ports closed,
                                     disposable database dropped"
```

---

## T. Baseline

```text
OpenAPI paths       127   expected 127   ✓
OpenAPI operations  140   expected 140   ✓
OpenAPI schemas     279   expected 279   ✓
public operations    49   expected  49   ✓
migrations           39   expected  39   ✓  (no 0040)
DB tables            79   unchanged      ✓
Admin routes         26   unchanged      ✓
Storefront routes    20   unchanged      ✓
```

`git diff HEAD -- apps/api packages/persistence packages/contracts apps/admin docs/design`
is **empty**, so every one of these is unchanged by construction rather than by
measurement.

### T.1 — one design deviation, requiring a Figma redraw

```text
FU-APP12-M01-S1-C1-01
```

The lightbox's previous/next controls are now circular outline chevron buttons
(§F.3), taken on explicit Product Owner direction during this correction. The
approved frames — `944:187` (`FIG-APP12-M01-D1-SF-LIGHTBOX`) and the older
`533:3` / `533:26` — draw text buttons, so the runtime is now **ahead of the
registry** for those two controls.

`docs/design/FIGMA_DESIGN_INDEX.md` was deliberately **not** edited, because §15
forbids a Figma change in this correction. The gap is recorded here instead and
needs a redraw plus re-approval in a design package before `M01.E1` closes.
`node tools/check-figma-design-index.mjs` still passes — the registry is
internally consistent; it is the drawing that is now stale, which no mechanical
gate can detect.

---

## U. M01 internal roadmap

```text
APP12-M01.A      COMPLETE — PO PASS
APP12-M01.B1     COMPLETE — PO PASS
APP12-M01.DB1    COMPLETE — PO PASS
APP12-M01.B2     COMPLETE — PO PASS
APP12-M01.D1     COMPLETE_AFTER_C1 — PO APPROVED
APP12-M01.D1-C1  COMPLETE — PO PASS
APP12-M01.A1     COMPLETE — PO PASS
APP12-M01.S1     COMPLETE_AFTER_C1 — PO REVIEW READY
APP12-M01.S1-C1  COMPLETE           ← this package

APP12-M01        IMPLEMENTATION_IN_PROGRESS
CORRECTION_USED  1 / 1

INTERNAL_NEXT    = M01.E1
APP12-G03        = NOT_AUTHORIZED
```

`M01.E1` was **not** executed. One open item is carried into it:

```text
FU-APP12-M01-S1-C1-01   the lightbox navigation controls are chevron icon
                        buttons ahead of frames 944:187 / 533:3 / 533:26.
                        Needs a Figma redraw and re-approval. §T.1.
```

`FU-APP12-M01-S1-01` — the defect this correction existed to fix — is **CLOSED**.

STOP.
