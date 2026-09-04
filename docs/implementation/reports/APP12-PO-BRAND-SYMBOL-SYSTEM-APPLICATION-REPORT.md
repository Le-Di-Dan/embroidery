# Product Owner Directive — Nét Thêu Brand Symbol System, Digital Application

## A. Verdict

```text
PO_BRAND_SYMBOL_SYSTEM_APPLICATION = COMPLETE

APP12-H06 = COMPLETE
APP12-H07 = NEXT

NEW_CHECKPOINT_ID   = 0
H06_CORRECTION_USED = unchanged (0 / 1)
PUSHED              = false
```

The approved symbol now appears on every current digital brand slot, from one
canonical geometry source, and the stale `Xưởng Thêu` wordmark is gone from every
surface that used it as the brand name.

Five things worth reading before the detail:

1. **The Editor topbar was not touched, and that is the directive working.** §15
   says to apply the mark "only if the current Editor has an existing brand
   identity slot". It has none — `studio-stage-topbar.tsx` holds a save chip and
   nothing else. Inventing the slot the mockup shows would have been a Wave-2 UI
   change wearing a brand directive's clothes.
2. **The watermark keeps its repeated pattern and its trace token.** Read
   literally, §16's "if runtime currently has only one watermark mode, apply only
   the default symbol-only treatment" would have replaced a 35-tile anti-copy
   pattern with one corner mark and dropped the runtime token. That is a security
   change, not a brand change. Raised before implementing; the Product Owner
   confirmed the pattern stays and only the branding inside it is productionized.
3. **The mark reached the watermark as CSS, not as elements.** The first
   implementation put a `<BrandSymbol>` in each tile and broke six suites at
   once: 35 tiles × 2 legibility passes is 70 extra `<svg>` nodes on the Studio
   stage, and this repository guards "exactly one SVG scene" (`ADR-APP0-001`) in
   half a dozen places. Rewriting those assertions would have spent a real
   architectural invariant on decoration. The mark is now a generated data-URI
   background: same source, same pixels, zero DOM nodes, zero test churn.
4. **The Admin compact bar was restructured, and the first fix was withdrawn.**
   Placing the symbol overflowed the 390 bar. The first attempt traded the
   wordmark away to make room; Product Owner review of the live result rejected
   the premise instead — the brand and the drawer trigger were both on the left
   while the right-hand operator block took most of the bar and could not be
   acted on there anyway. Brand left, trigger right, operator block in the
   drawer, which is where it already was.
5. **Two `APP12-H06` regressions surfaced and were fixed here.** H06 validated
   with `jest --testPathPatterns="seo-"` and so never ran the suites its own
   changes broke: a route-file inventory that counts `san-pham/[slug]/*.tsx`, and
   an assertion that a description-less Product's `description` is `undefined`
   when H06 deliberately made it `null`. Both were red on H06's own commit.

---

## B. PO authority / no-checkpoint status

```text
directive           = one-time Product Owner implementation directive
checkpoint          = NONE — this is not APP12-H06-C1 and not a new ID
ROADMAP_LOCK        = LOCKED
CHECKPOINTS         = 38            unchanged
NEW_CHECKPOINT_ID   = 0
APP12-H06           = COMPLETE      unchanged, not reopened
APP12-H07           = NEXT          unchanged, not started
H06_CORRECTION_USED = 0 / 1         unchanged
```

No roadmap row was added, renamed, reordered or re-scoped. `APP12-H07` was not
executed: no runbook was written and no operational procedure was touched.

---

## C. Live Figma re-read

Re-opened live before any implementation (§3), through the remote Figma MCP; the
local `figma-desktop` server was unreachable for this session and the operator
re-authorized the remote one.

| Node | Name | Read for |
|---|---|---|
| `583:52` | SYMBOL · Production (ring 4→6) | geometry, verified |
| `583:61` | SYMBOL · Micro (gesture only, stroke 16.9→21) | geometry, verified |
| `589:7` | Storefront desktop header | composition |
| `589:23` | Storefront mobile header | composition |
| `589:36` | Admin login | composition |
| `589:52` | Design Editor | composition |
| `586:287` | Watermark — C · Repeated pattern | composition |

### The geometry was verified, not assumed

```text
583:52   circle cx=150 cy=150 r=121.25 stroke #171717 stroke-width 7.5
         path   d="M68.75 176.936…"    stroke #171717 stroke-width 21.125
583:61   path   d="M68.75 176.936…"    stroke #171717 stroke-width 26.25
```

The `d` string is **identical** in both nodes — the micro variant is the
production symbol with the ring removed and the gesture thickened. That is why
this repository stores one path and two stroke widths rather than two paths, and
it is what makes "one canonical vector-path source per variant" structural.

The committed `icon.svg` from `APP12-H06` was diffed against the live node again
and still matches byte-for-byte.

### What the mockups actually show

- `589:7` — production symbol with ring, then `Nét Thêu`, nav right.
- `589:23` — micro symbol, then `Nét Thêu`, hamburger right.
- `589:36` — production symbol, `Nét Thêu`, supporting label `Quản trị xưởng`.
- `589:52` — micro symbol + `Nét Thêu` in an Editor topbar, plus one corner mark.
- `586:287` — a repeated diagonal symbol pattern, light and dark grounds.

Two mockup details were **not** implemented, deliberately: `589:7`/`589:23` put
the hamburger on the right where the delivered shell puts it on the left, and
`589:7`'s nav labels differ from the delivered navigation. §9 and §10 forbid
redesigning navigation, so only the brand slot changed.

`figma_write = 0`. No node was created, modified or moved.

---

## D. Current brand-slot inventory

Taken before editing (§7).

| Surface | Current treatment | Approved BRD0 target | Change |
|---|---|---|---|
| Storefront desktop header | text `Xưởng Thêu` | production 48px + `Nét Thêu` | **yes** |
| Storefront compact header | same component, text only | micro 28px + `Nét Thêu` | **yes** |
| Storefront mobile drawer | same component, text only | micro 28px + `Nét Thêu` | **yes** |
| Storefront footer | same component, text only | micro 28px + `Nét Thêu` | **yes** |
| Storefront footer rights | `© Xưởng Thêu · …` | `© Nét Thêu · …` | **yes** |
| Homepage story paragraph | `Xưởng Thêu làm việc…` | `Nét Thêu làm việc…` | **yes** |
| Admin login brand panel | eyebrow + `Xưởng Thêu` | production 72px + name + `Quản trị xưởng` | **yes** |
| Admin login route metadata | `…quản trị viên Xưởng Thêu.` | `…quản trị viên Nét Thêu.` | **yes** |
| Admin protected shell bar | eyebrow + `Xưởng Thêu` | micro 28px + eyebrow + `Nét Thêu` | **yes** |
| Studio watermark | text `Xưởng Thêu · …` | micro mark + `Nét Thêu · …` | **yes** |
| Studio Editor topbar | **no brand slot exists** | — | **no** (§15) |
| favicon `icon.svg` | micro symbol (H06) | unchanged | no (regenerated, identical) |
| `apple-icon` | **absent** | production 180px | **yes** (new) |
| Social dock Zalo/Messenger | provider marks `Z` / `M` | untouched | **no** (§18) |
| Admin nav icons | design-system iconography | untouched | **no** (§2) |

### Brand name vs descriptor

The two were separated by hand rather than by a global replace. Ten source
occurrences of `Xưởng Thêu` used it as the **brand name** and all ten are
corrected. Every lowercase `xưởng` / `xưởng thêu` was left alone: those are the
common noun, and the FAQ, Local and policy pages use it correctly throughout
("Ghé xưởng", "xưởng báo giá thủ công", "Xưởng thêu Nét Thêu").

Five `Xưởng Thêu` strings remain in the tree and all five are inside **code
comments** recording what the string used to be, which is history rather than
copy.

---

## E. Symbol single-source implementation

`@embroidery/ui` — the workspace package whose own description reads "React
components genuinely shared between storefront and admin", empty until now with
the note "Real content arrives with its owning checkpoint". No new package was
created.

```text
packages/ui/src/brand/brand-symbol.geometry.json   the ONE source: path, ring,
                                                   stroke widths, tones, name
packages/ui/src/brand/brand-symbol-geometry.ts     types + size/tone policy
packages/ui/src/brand/brand-symbol.tsx             <BrandSymbol variant tone size>
packages/ui/src/brand/brand-lockup.tsx             <BrandLockup> symbol + live text
tools/generate-brand-icons.mjs                     every static artifact, + a gate
```

### Why the raw geometry is JSON

Because it has a consumer that cannot import TypeScript. Next serves
`app/icon.svg` and `app/apple-icon.png` as **static files at fixed per-app
paths**, so the React components' shared import cannot reach them, and the Studio
watermark needs the mark as CSS. Four hand-maintained copies of one path is
precisely the drift `BRD0-F02` forbids. `resolveJsonModule` is already enabled
repository-wide, so the TypeScript module and the generator read the same file.

```text
node tools/generate-brand-icons.mjs           writes 5 artifacts
node tools/generate-brand-icons.mjs --check   fails if any committed file differs
```

Indexed as `CMD-CHECK-BRAND-ICONS`. That turns "the icons still match the
approved mark" into something a gate answers rather than something a reviewer
eyeballs.

### Tone rules enforced structurally

`accent` colours the signature gesture only. The seal ring reads `ink`
regardless of what the caller asks for — `BRD0-F02` forbids Brand/Primary on the
ring and on the wordmark, and the component simply gives the ring no way to
receive that value.

No gradient, shadow, outline or new palette value exists anywhere in the package;
the four colours are the locked tokens.

### Size authority

Encoded as named constants rather than numbers at call sites:

```text
micro                stable from 16px, required below 32px
production on dark   floor 32px
production on light  floor 48px      ← the Storefront and Admin case
```

Where §4's earlier ladder said 40px for a desktop header, the later measured
minimum wins: the ring is not safe at 40px on a light ground, and the desktop
application mockup uses 48px.

---

## F. Storefront desktop and mobile

One responsive component renders **both** variants and the shell's own media
query shows exactly one — the production symbol above `$bp-nav` (1025px), the
micro symbol below. The alternative was a client component reading a media query,
which would have turned server-rendered brand chrome into hydration-dependent
chrome, or exporting the ring's geometry into the app stylesheet, which would put
brand authority in three stylesheets instead of one package. The cost is about
300 bytes of inline SVG.

```text
1440   production 48px + Nét Thêu      matches 589:7
1024   micro 28px + Nét Thêu           Compact tier; $bp-nav is 1025px
390    micro 28px + Nét Thêu           matches 589:23
390 drawer open   micro 28px + Nét Thêu
```

Header and nav dimensions are unchanged. The hamburger is still the hamburger,
still on the left where the delivered shell puts it, still the same target size.

---

## G. Footer and visible brand cleanup

The footer pins the **micro** variant at every width. Its brand sits above a
tagline and its usable height stays under the production symbol's proven 48px
light-ground floor even on desktop, so pinning the small variant is the truthful
reading of the size authority rather than shrinking the ring below what the
design proved readable.

```text
footer brand    micro 28px + Nét Thêu
footer rights   © Nét Thêu · Studio thêu theo yêu cầu.
```

No footer redesign: composition, columns and spacing are untouched.

`FU-APP12-H06-01` — the visible inconsistency `APP12-H06` reported between
metadata `Nét Thêu` and shell copy `Xưởng Thêu` — is closed. The rendered
Homepage now contains **zero** occurrences of the stale wordmark, measured on the
running stack.

---

## H. Admin login and shell

### Login (`589:36`)

```text
production symbol 72px
Nét Thêu
Quản trị xưởng
```

The current login card and layout are reused; no authentication behaviour, field,
validation or error path was touched. The former `BẢNG QUẢN TRỊ` eyebrow was
replaced by the supporting label rather than stacked above it, because the two
say the same thing and the approved mockup shows two lines, not three.

### Protected shell

The **micro** variant at 28px, deliberately: the eyebrow-over-title stack beside
it is about 36px of usable height, and the production ring is only proven from
48px on a light ground. Using the ring here would have meant shrinking it below
what the design showed is readable.

### The compact bar was restructured, on Product Owner review

Placing the symbol cost roughly 40px the 390 bar did not have. Two failure modes
were observed live, in order:

```text
first    brand wrapped to three lines  ("BẢNG / QUẢN / TRỊ")
then     nowrap pushed the bar past the viewport and clipped "Đăng xuất"
```

The first fix was a size compromise. Product Owner review of the live result
rejected the premise instead: the brand and the drawer trigger were both on the
left while the right-hand operator block took most of a compact bar and could not
be acted on there anyway. The compact tier is now:

```text
brand   left     symbol only
trigger right
identity + logout   NOT on the bar — the drawer already carried its own
```

That removed the space constraint entirely, so the symbol-only compact brand is
now a **simplification the Product Owner asked for**, not a workaround: with the
operator block gone the wordmark would fit, and a compact bar simply reads better
carrying one mark and one control than a three-line lockup opposite a hamburger.
The words stay in the DOM, hidden visually rather than removed from the
accessibility tree, so the brand keeps its accessible name at every width and the
symbol stays decorative.

The desktop bar is unchanged: symbol, eyebrow, wordmark, and the operator block
on the trailing edge.

```text
DOM order   brand -> status -> identity/logout -> trigger
compact     identity/logout display:none  (so the logout button leaves the
                                           tab order with it)
desktop     trigger display:none
```

### The drawer, corrected in the same pass

Three defects the Product Owner named, all of them alignment rather than brand:

1. **A second logo.** The drawer head repeated `AdminBrand` while the app bar's
   mark stays visible above the drawer's edge — the same logo twice in one view.
   Removed; the head now carries only the close control.
2. **The operator block sat at the top**, above the navigation, which is not what
   a drawer is opened for. It now sits at the foot beside the logout control as
   one account block, pinned with `margin-block-start: auto` so a short list
   holds it at the bottom and a long one can still push it down and scroll.
3. **Two competing left axes.** `.admin-shell__identity` declared
   `text-align: right` and `.admin-shell__logout` declared
   `align-items: flex-end` — correct for the desktop bar's trailing edge, wrong
   for a left-aligned column, and the reason both blocks hung off the axis. The
   alignment moved to `.admin-shell__bar-trail`-scoped rules, where it belongs.
   The navigation rows carry `spacing(16)` of inline padding for their active-row
   highlight, so the account block and the note now take the same inset and every
   label in the drawer starts on one axis.

No Admin nav icon was changed. Branding was not added to any Admin page: the one
inherited shell brand is the only one, and it is now the only one in the shell.

---

## I. Editor topbar and watermark

### Topbar — no change, and why

`studio-stage-topbar.tsx` renders a save chip and its children. There is **no
brand identity slot**. §15 permits application "only if the current Editor has an
existing brand identity slot", so none was created. Adding the mockup's lockup
would have been a Wave-2 surface change made under a brand directive.

```text
Wave2 release flag   unchanged
Editor route gating  unchanged
Editor behaviour     unchanged
```

### Watermark — pattern preserved, branding productionized

The delivered runtime has exactly one mode: 35 diagonal tiles, each drawn twice
(white pass under, ink pass over) so it reads on any customer imagery, carrying
`wordmark · BẢN XEM TRƯỚC · <runtime token>`.

§16 read literally would have replaced that with a single lower-right symbol.
That was raised rather than implemented, because it would have removed an
anti-copy control and the traceability token — a security change, not a brand
change. The Product Owner confirmed: keep the pattern and all trace semantics,
productionize only the branding inside it. `BRD0`'s own mode C (`586:287`) is a
repeated pattern, so the runtime is already on an approved treatment.

```text
kept       35 tiles · 35° angle · dual ink/white passes · runtime token
kept       aria-hidden · pointer-events: none · viewport-space placement
changed    Xưởng Thêu -> Nét Thêu
added      the approved micro mark before the wordmark, per tile
```

**The mark is a CSS background, not an element.** The first attempt rendered
`<BrandSymbol>` per pass and broke six suites: 70 extra `<svg>` nodes on the
Studio stage against an "exactly one SVG scene" invariant this repository asserts
in many places to guard `ADR-APP0-001`. Relaxing those assertions would have
spent a real architectural property on decoration. The data URI is generated from
the same geometry JSON and covered by the same gate, so single-source is intact
and the DOM is byte-identical to before.

No new watermark mode, no user-selectable watermark feature, and modes B and D
were not built.

---

## J. Favicon and app icons

```text
icon.svg         micro       kept from APP12-H06, regenerated, byte-identical
                             path to live node 583:61
apple-icon.png   production  180×180, NEW
```

Both apps. `apple-icon` is a PNG because Next accepts only `jpg`, `jpeg` and
`png` for that convention — SVG is valid for `icon` but not for `apple-icon`,
verified in the installed framework's own route table rather than assumed.

No composition was invented: the icon is the approved symbol centred on a
full-bleed square of the locked canvas token. No corner radius, no padding
scheme, no platform treatment, no second colour. The ground is opaque only so an
ink mark stays legible against dark browser chrome and the iOS home screen.

Live:

```text
GET /icon.svg         200  image/svg+xml
GET /apple-icon.png   200  image/png
<link rel="icon" … type="image/svg+xml">
<link rel="apple-touch-icon" … sizes="180x180" type="image/png">
```

```text
FU-APP12-H06-04 = CLOSED_BY_PO_BRAND_SYSTEM_APPLICATION
```

Closed because a real supported icon was produced and live-verified, which is the
condition §17 attaches.

---

## K. Social and provider icon boundary

```text
SOCIAL_AVATAR = EXTERNAL_BRAND_ASSET
```

The repository owns no marketing or brand-asset directory, so no unused runtime
asset was added. The floating contact dock is untouched: its Zalo and Messenger
marks remain provider marks and were not replaced with the Nét Thêu symbol. No
functional UI icon anywhere — menu, search, close, chevron, status, upload,
payment, shipping — was replaced by the brand mark.

---

## L. Accessibility

```text
symbol beside visible "Nét Thêu"     aria-hidden, focusable="false"
symbol alone (Admin compact bar)     wordmark kept in the accessibility tree,
                                     hidden visually only — so the symbol stays
                                     decorative and the name is still announced
watermark                            aria-hidden, and now a CSS background,
                                     so it is not in the tree at all
brand home link                      keeps its aria-label from one constant
```

No duplicate announcement is possible: the symbol carries an accessible name only
when it is the sole carrier of the brand, and that case does not arise — the
Admin compact bar keeps its words. Focus rings, touch targets and the drawer's
focus trap are unchanged, and the drawer's focus-trap suites still pass.

---

## M. Live visual evidence

Real Chromium against the running applications through the real gateway.

| Surface | Viewport | Result |
|---|---|---|
| Storefront header | 1440 | production 48px + `Nét Thêu` |
| Storefront header | 1024 | micro 28px + `Nét Thêu` |
| Storefront header | 390 | micro 28px + `Nét Thêu`, hamburger intact |
| Storefront drawer open | 390 | micro + `Nét Thêu`, close control intact |
| Storefront footer | 390 | micro + `Nét Thêu` + `© Nét Thêu · …` |
| Admin login | 1440 | production 72px + name + `Quản trị xưởng` |
| Admin protected shell | 1440 | micro + eyebrow + `Nét Thêu`, operator block right |
| Admin protected shell | 768 | symbol left, trigger right, no operator block |
| Admin protected shell | 390 | symbol left, trigger right, no overflow |
| Admin drawer | 390 | no second logo, nav first, account block at the foot, one left axis |
| `icon.svg` / `apple-icon.png` | — | 200, correct content types, in `<head>` |

Machine-checked alongside: the rendered Homepage contains `Xưởng Thêu` **zero**
times, and the header markup carries both symbol variants with exactly one shown.

The Admin protected shell required an authenticated session. `STAFF_BOOTSTRAP_
PASSWORD` is listed in `.env-ignore`, so it was **not** read from `.env`: the
operator was asked for it and supplied it for this run only. It was not echoed
into a file, a log, a fixture, a command-line argument or this report.

The Editor topbar and watermark were **not** driven in a Wave-2-enabled world,
because §15 attaches that obligation to changed Editor code paths and the Editor
topbar was not changed. The watermark change is covered by its own component
suite, which renders the real stage.

---

## N. Functional regression

```text
@embroidery/storefront jest    2510 / 2510   PASS   (HEAD baseline 2494)
@embroidery/admin      jest    1924 / 1924   PASS
e2e:app12:h06                    33 / 33     PASS   no SEO regression
```

Preserved and covered by suites that still pass: Storefront navigation, the
mobile drawer's open/close/focus-trap/scroll-lock behaviour, the header CTA,
Admin login, Admin protected navigation and logout, the Editor route gate, and
the social dock's provider links and icons.

The Admin app-bar restructure changed DOM **order** but not DOM **content**: the
identity block and the logout control are still rendered by the bar and still
found by `admin-shell-render`'s `banner.getByText('Quản trị viên')`, because
jsdom does not apply the media query that hides them. The drawer lost only its
duplicate brand mark. All 134 Admin suites pass unchanged apart from the two
noted above.

### Test changes, and why each is not a weakening

| Change | Reason |
|---|---|
| Six brand assertions now read `STOREFRONT_SHELL_COPY` / `BRAND_NAME` instead of a literal | They asserted a hard-coded `Xưởng Thêu`; reading the authority means they cannot rot again the next time the brand moves |
| Admin login asserts `Quản trị xưởng` instead of `BẢNG QUẢN TRỊ` | The approved mockup replaces the eyebrow with the supporting label |
| The frozen Admin dependency list gains `@embroidery/ui` | The list is still exact. The guard exists to catch a drag-and-drop or dialog library; a workspace package holding one `<svg>` is not that |
| `product-detail` route-file count 3 → 4 | `APP12-H06`'s `layout.tsx`. **Red on H06's own commit** |
| `meta.description` `undefined` → `null` | `APP12-H06` made it `null` on purpose so Next stops inheriting the root fallback. **Red on H06's own commit** |
| The single-SVG-scene assertion | **Unchanged.** It was briefly relaxed and then restored when the watermark mark became a CSS background |

---

## O. Files changed

### New

```text
packages/ui/src/brand/brand-symbol.geometry.json
packages/ui/src/brand/brand-symbol-geometry.ts
packages/ui/src/brand/brand-symbol.tsx
packages/ui/src/brand/brand-lockup.tsx
tools/generate-brand-icons.mjs
apps/storefront/src/app/apple-icon.png                         generated
apps/admin/src/app/apple-icon.png                              generated
apps/storefront/src/features/design-studio/styles/_brand-mark.generated.scss
```

### Modified — application

```text
packages/ui/src/index.ts · package.json · tsconfig.json
apps/{storefront,admin}/package.json                    @embroidery/ui
apps/{storefront,admin}/next.config.ts                  transpilePackages
apps/{storefront,admin}/src/app/icon.svg                regenerated, same path data
apps/storefront/src/features/storefront-shell/components/storefront-brand.tsx
apps/storefront/src/features/storefront-shell/components/storefront-footer.tsx
apps/storefront/src/features/storefront-shell/model/storefront-shell-copy.ts
apps/storefront/src/features/storefront-shell/styles/storefront-shell.scss
apps/storefront/src/features/homepage/model/homepage-copy.ts
apps/storefront/src/features/design-studio/model/studio-watermark-copy.ts
apps/storefront/src/features/design-studio/styles/design-studio.scss
apps/admin/src/features/admin-shell/components/admin-brand.tsx
apps/admin/src/features/admin-shell/components/admin-app-bar.tsx      restructured
apps/admin/src/features/admin-shell/components/admin-mobile-drawer.tsx restructured
apps/admin/src/features/admin-shell/model/admin-shell-copy.ts
apps/admin/src/features/admin-shell/styles/admin-shell.scss
apps/admin/src/features/staff-auth/components/staff-login-brand-panel.tsx
apps/admin/src/features/staff-auth/model/staff-login-copy.ts
apps/admin/src/features/staff-auth/styles/staff-login.scss
apps/admin/src/app/login/page.tsx
infrastructure/compose/docker-compose.dev.yml           packages/ui/src bind mounts
.prettierignore                                         generated artifacts
```

### Modified — tests and docs

```text
apps/storefront/test/{components,acceptance,smoke,boundary}/…   8 files
apps/admin/test/{components,boundary}/…                         2 files
docs/implementation/SCOPED_COMMAND_INDEX.md                     CMD-CHECK-BRAND-ICONS
docs/implementation/reports/APP12-PO-BRAND-SYMBOL-SYSTEM-APPLICATION-REPORT.md
```

`packages/ui/src/index.ts` replaced a deliberate `export {}` placeholder. The dev
images for both apps were rebuilt once: `@embroidery/ui` is a new dependency and
the container's `node_modules` symlink lives in the image, which is the
bind-mount asymmetry `APP12-G02` recorded.

---

## P. File-size

```text
81 hard-limit violations repository-wide    unchanged baseline
violations created by this directive        0
```

Largest new files: `tools/generate-brand-icons.mjs` 195, `brand-symbol-geometry.ts`
133, `brand-symbol.tsx` 96, `brand-lockup.tsx` 82. All under both thresholds.

### Three SCSS files were already over the limit and are now longer

Stated plainly rather than left for a reader to discover:

```text
                                                     HEAD    now
apps/admin/.../admin-shell.scss                       549    652
apps/storefront/.../storefront-shell.scss             429    456
apps/storefront/.../design-studio.scss               1876   1917
```

All three breached the 400-line SCSS hard limit **before** this directive, and
none was created by it. This change did make them longer. They were not split
here: `design-studio.scss` alone is a 1 900-line refactor with no relationship
to a brand directive, and `CLAUDE.md` §7 forbids unrelated refactoring inside a
change. Raised as `FU-APP12-PO-BRAND-04` with the exact numbers, so the decision
is the Product Owner's rather than a silent deferral.

---

## Q. Follow-up reconciliation

```text
FU-APP12-H06-01 = CLOSED_BY_PO_BRAND_SYSTEM_APPLICATION
                  the visible wordmark inconsistency is gone from every surface

FU-APP12-H06-04 = CLOSED_BY_PO_BRAND_SYSTEM_APPLICATION
                  apple-icon delivered from the production symbol and
                  live-verified 200 image/png

FU-APP12-H06-05 = OPEN — unchanged
```

`FU-APP12-H06-05` is **not** closed, and the distinction matters. It is about the
Figma **wordmark artwork**, which is still set in Inter because `General Sans` is
not installed in the file and must be rebuilt and re-judged before any wordmark
asset is exported. This directive exported no wordmark artwork: every wordmark in
the product is live text in the application's own approved typography, which is
what §6 requires and what leaves that question exactly where it was.

### Raised

| ID | Finding | Owner |
|---|---|---|
| `FU-APP12-PO-BRAND-01` | The Admin login e-mail placeholder is `ban@xuongtheu.vn`, a domain matching the retired wordmark. Not changed here: replacing it would invent a domain the operator owns | `APP12-V01` |
| ~~`FU-APP12-PO-BRAND-02`~~ | **Not raised.** It would have asked whether the compact bar should trade the wordmark for room; the Product Owner answered during this directive by restructuring the bar, and the symbol-only compact brand is now a deliberate simplification rather than a space compromise | — |
| `FU-APP12-PO-BRAND-03` | `FIG-BRD0-C3-PRODUCTIONIZATION` (`582:18`) is still `REFERENCE_ONLY` pending the General Sans wordmark rebuild | `BRD0` |
| `FU-APP12-PO-BRAND-04` | Three shell stylesheets exceed the 400-line SCSS hard limit — `admin-shell.scss` 652, `storefront-shell.scss` 456, `design-studio.scss` 1917. All three were already over at HEAD; this directive lengthened them. Splitting is a refactor of its own | `APP12-V02` |

---

## R. Frozen baseline

```text
NEW HTTP OPERATIONS   = 0
NEW ROUTES            = 0     no page.tsx added; icon/apple-icon are metadata
                              conventions, not browser routes
NEW MIGRATIONS        = 0
DB schema delta       = 0

OpenAPI               unchanged   zero files under apps/api, packages/contracts
public operations     unchanged
release matrix        unchanged
Figma artwork         unchanged   0 nodes created, modified or moved
Wave2 release flag    unchanged
production deployed   false
pushed                false
```

This was visual brand-system application only. No print or packaging collateral
was implemented as a web feature: no label, thank-you card, sticker, care label,
quotation cover or gift card exists anywhere in the change.

---

## S. Roadmap preservation

```text
ROADMAP_LOCK = LOCKED
CHECKPOINTS  = 38

APP12-H06 = COMPLETE
APP12-H07 = NEXT          exactly one NEXT, unchanged

NEW_CHECKPOINT_ID   = 0
H06_CORRECTION_USED = 0 / 1   unchanged
```

`APP12-H07` was not executed. No Figma artifact was altered. No unresolved
Inter-based wordmark artwork was exported. No functional UI icon was replaced by
the brand mark. No provider icon was touched. Wave 2 was not enabled. Nothing was
deployed and nothing was pushed.
