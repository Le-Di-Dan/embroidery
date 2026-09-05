# APP12-V02-C1 — i18n Copy Authority + Admin Login Reflow Correction

## A. Verdict

**`APP12-V02-C1 = COMPLETE`.**

Two narrow acceptance defects, both closed, both with the evidence that closes
them rather than an argument that they are closed.

```text
brand text authority          @embroidery/ui BRAND_NAME  →  common.brand.name (locale JSON)
frontend brand-name literals  1 → 0
generated brand artwork       5 / 5 files byte-identical

static-text gate rules        3 → 4   (the ASCII/indirect rule)
gate focused tests            15 → 26
ASCII escapes it then found   1  (a live Admin table header, closed)
explicit exemptions           0

admin/login @1024 overflow    292px → 0px      (scrollWidth 1316 → 1024)
admin/login @1440 overflow    0px  → 0px       (brand 780 · card 440, unchanged)
admin/login @768  overflow    0px  → 0px
axe serious/critical, login   0 at all six measured viewports
```

Nothing V02 delivered was reopened, redesigned or re-run beyond the focused
regressions §9/§10 ask for. No route, no operation, no migration, no deployment,
no push.

---

## B. PO correction authority

```text
APP12-V02      = CORRECTION_REQUIRED   →  COMPLETE_AFTER_C1
APP12-V02-C1   = AUTHORIZED            →  COMPLETE
CORRECTION_USED = 1 / 1                    (no V02-C2)
APP12-G03      = NOT_AUTHORIZED  →  NEXT   (not started)
ROADMAP_LOCK   = LOCKED · CHECKPOINTS = 38
```

V01 is not reopened. H08 is not re-run. G03 is not started and no G03 data
exists. Nothing is deployed and nothing is pushed.

---

## C. Accepted V02 baseline

Everything §1 lists as accepted is untouched and still measures the same:

```text
apps/storefront jest    2533 / 2533
apps/admin      jest    1930 / 1930
packages/i18n   jest      24 → 28   (+4, the new brand-authority test)
tools node:test           26 → 37   (+11 rule-4 fixtures)

OpenAPI                 125 paths / 138 operations / 278 schemas
public operations       49
release matrix          28 DENY / 18 ALLOW / 3 SCOPE_GATED   (spec 15/15)
migrations              38   (38 applied in the dev database)
DB tables               79
Admin routes            26
Storefront routes       20
```

The Product Detail fold, the content compression, the CTA and typography
hierarchies, the contrast correction, the focus token, the transactional shell,
the secure-order compression, the Admin dashboard/queue/order-detail work, the
Ready-Made FULL terminology, the responsive Gallery correction, the checkout
stale-error fix and the date formatting are all as V02 left them. This
checkpoint touched none of their files.

---

## D. Brand text authority correction (Defect A)

### What was wrong

V02 put `{brand}` in the JSON and hydrated it from `@embroidery/ui`'s
`BRAND_NAME`, which itself read `brandName` out of
`packages/ui/src/brand/brand-symbol.geometry.json`. The reasoning was sound —
one definition of the store's name — but the Product Owner's rule is literal and
this did not satisfy it: for the web applications, `Nét Thêu` **is** human-facing
static text, and it was defined by a presentation package rather than by the
message repository.

### What was built

```text
packages/i18n/messages/vi/common.json     + brand.name        "Nét Thêu"
                                          + brand.descriptor  "Xưởng thêu cá nhân hóa"
packages/i18n/src/brand.ts        NEW  the typed accessor, resolving those keys
packages/i18n/src/index.ts             publishes BRAND_NAME · BRAND_DESCRIPTOR

packages/ui/.../brand-symbol.geometry.json  − brandName  − brandDescriptor
packages/ui/.../brand-symbol-geometry.ts    − BRAND_NAME − BRAND_DESCRIPTOR
packages/ui/src/index.ts                    no longer publishes brand *text*
packages/ui/.../brand-lockup.tsx            takes a required `wordmark` prop
```

The accessor resolves; it does not own. `packages/i18n/src/brand.ts` contains no
`'Nét Thêu'` anywhere in its code, and a focused test asserts that by reading its
own source with comments stripped — the module explains why the name moved, and
explaining it means naming it, but the code may not hold it.

The split §2 asks for is now structural rather than remembered:

```text
symbol / vector authority   @embroidery/ui   viewBox, path, ring, strokes, tones,
                                             sizes — every BRD0-F02 number
text "Nét Thêu"             locale JSON      common.brand.name
```

`@embroidery/ui` gained no dependency on `@embroidery/i18n`. The lockup renders
the name it is handed, which is what makes the separation real: the presentation
package now has no way to know what the store is called.

### The 22 consumers

Every `import { BRAND_NAME } from '@embroidery/ui'` in both applications became
`from '@embroidery/i18n'` — 20 source modules and 3 test modules (one file, the
Storefront SEO index, only re-exports `PUBLIC_BRAND_NAME` and needed no change).
No call site changed shape and no wording changed.

### The proof the artwork did not move

`tools/generate-brand-icons.mjs` was the second consumer of `brandName`: it
writes the `aria-label` and `<title>` of every generated icon. It now reads
`packages/i18n/messages/vi/common.json` instead of the geometry JSON.

```text
node tools/generate-brand-icons.mjs --check
check:brand-icons — 5 icon file(s) match 582:9 FIG-BRD0-C3-SYMBOL-MASTER
                    (APPROVED_FOR_IMPLEMENTATION)
```

Five committed files — two `icon.svg`, two `apple-icon.png`, one generated Sass
partial — regenerate **byte-identical** from the new source. The brand name moved
and the approved artwork did not change by one byte. That is the whole claim,
and it is checkable rather than asserted.

### The orphan-check consequence, and why the gate changed with it

`common.brand.name` is read from inside `packages/i18n/src`, which
`check-i18n-message-keys.mjs` did not scan — so on first run it reported the two
new keys as orphans. The honest fix was to widen the gate's *read* roots to
include `packages/i18n/src`, not to exempt the namespace: the key was being read,
and the checker was describing its own blind spot rather than the repository.

---

## E. Strengthened static-text gate (Defect B)

### The escape, stated as the PO stated it

```ts
const LABEL = 'Order';
return <button>{LABEL}</button>;
```

Not JSX text (rule 1), not a human-facing attribute literal (rule 2), no
Vietnamese diacritic (rule 3) — and read by every operator who opens the screen.

### Rule 4: classification by AST context, never by content

§3 forbids a naive global ban on string literals, and for the reason the gate's
own header already gave: this repository is mostly technical strings. So rule 4
inverts the question. Instead of asking *what does this string look like*, it
asks *where does this value end up*, starting from the two positions a person
actually reads a value from and walking **backwards**:

```text
seeds        a JSX expression container that is a child   <p>{X}</p>
             a human-facing JSX attribute expression      aria-label={X}

the walk     identifier      → local const
             destructuring   → const { brand } = COPY
             property access → COPY.table.slug, COPY['slug']
             conditional     → both branches
             + and ??        → both operands
             import          → the same resolution in the exporting file
             as const / () / satisfies / !   unwrapped

it stops at  a call, a function body, a .map(), a reassigned let,
             and the edge of the scanned roots
```

The stop at a call is the load-bearing one: every legitimate sentence in this
repository arrives as `someMessage.text('a.b')`, and a call has no literal behind
it to report. A route path is never reported because a route path is never
painted as a sentence — nothing about the string is inspected at all.

Implementation:

```text
tools/i18n-copy-flow.mjs     NEW  the resolver and the two seeds
tools/i18n-exemptions.mjs    NEW  the escape hatch and its inventory
tools/check-i18n-static-text.mjs  rules 1–4 and orchestration
```

Split three ways because the single file passed the 400-line hard limit once rule
4 was in it, and because "what is copy", "how a name resolves to a literal" and
"what has been excused" are three responsibilities (CLAUDE.md §6).

### What it caught on the first run

One live escape, in the Admin category table:

```text
apps/admin/src/features/categories/model/category-copy.ts:56
  slug: 'Slug',        →   slug: categoriesMessage.text('table.slug'),
packages/i18n/messages/vi/admin.json
  categories.table   + "slug": "Slug"
```

Every other header on that table — `name`, `status`, `publishedProducts`,
`indexable` — had been migrated by V02. `Slug` survived because it carries no
diacritic, which is precisely the class of miss §3 describes. The visible wording
is unchanged; the authority is not.

### Cross-file resolution, proved on real source rather than on a fixture

The literal and the component that paints it are two files apart
(`model/category-copy.ts` → `components/category-table.tsx` via
`CATEGORY_COPY.table.slug`). Re-introducing it temporarily and running the gate:

```text
apps\admin\...\category-table.tsx:40:27  [jsx-child-copy]  Slug column
```

and restoring it returns the gate to green. The gate reports the render site,
where the string was *proved* human-facing, and names the origin file, where the
fix goes.

---

## F. ASCII/indirect-copy regression fixtures

`tools/check-i18n-static-text.test.mjs` — **26 cases, 26 passing** (was 15).
Eleven are new, and the Product Owner's four are among them verbatim:

| fixture | rule reported | literal |
|---|---|---|
| `const LABEL = "Order"; <button>{LABEL}</button>` | `jsx-child-copy` | `Order` |
| `const EMPTY_STATE = "No orders"; <p>{EMPTY_STATE}</p>` | `jsx-child-copy` | `No orders` |
| `const SR_LABEL = "Close dialog"; <button aria-label={SR_LABEL} />` | `jsx-attribute-copy:aria-label` | `Close dialog` |
| `const COPY = { title: "Payment", … }; <section>{COPY.title}</section>` | `jsx-child-copy` | `Payment` |
| `const { brand } = COPY; <p>{brand.title}</p>` | `jsx-child-copy` | `Workshop admin` |
| `{open ? OPEN_LABEL : SHUT_LABEL}` | 2 violations | both branches |
| location is the literal's line, not the render site | line 1 of 3 | — |

And the negatives, which are what make the rule usable:

| fixture | expected |
|---|---|
| `const copy = message.text('orders.title'); <h1>{copy}</h1>` | **not** reported — the walk stops at the call |
| `<a href="/don-hang">{order.code}</a>`, `<time dateTime={…}>{…}</time>`, `className`, `data-testid` | **not** reported — no literal behind a rendered value |
| `ROUTE` · `TESTID` · `MIME` · `OP` · `METHOD` · message-key constants, passed to `href`/`data-testid` | **not** reported |
| `const UNIT = "px"; // i18n-exempt: …` rendered as a child | **not** reported — the hatch is honoured on the *literal*, not the render site |

The eleven original negative cases from V02 — route path, slug, CSS class, test
id, business-state enum, error code, operation id, MIME type, query key,
Vietnamese comment prose, JSX punctuation — all still pass unchanged, and the
Vietnamese and accessibility-copy positives are untouched.

### The gap that remains, stated rather than hidden

Rule 4's walk is syntactic. A string laundered through a function body, through
`.map()`, or through a `let` reassignment is still invisible to it. What that
leaves uncovered is an *unaccented ASCII* string laundered through a helper:
rule 3 still sees any Vietnamese literal in any position at all, and this product
ships one language. Closing the remainder would mean guessing whether an ASCII
string is prose, which is the false-positive solution §3 rules out by name.

---

## G. Exemption inventory

```text
node tools/check-i18n-static-text.mjs
check-i18n-static-text: OK — no hard-coded human-facing text.
check-i18n-static-text: 0 explicit exemption(s) in scanned source.
```

| file | literal / context | reason | category |
|---|---|---|---|
| — | — | — | — |

**The inventory is empty.** No `// i18n-exempt:` exists anywhere in
`apps/storefront/src`, `apps/admin/src` or `packages/ui/src`, and the one live
escape rule 4 found was fixed rather than excused.

Two structural exemptions remain, both pre-existing and both files rather than
patterns:

| kind | entry | why |
|---|---|---|
| `EXEMPT_FILES` | `packages/i18n/src/messages.ts` | the repository's own loader names its namespaces (and is outside the scanned roots anyway) |
| `EXEMPT_DIRECTORIES` | `node_modules`, `__snapshots__`, `test`, `tests` | a test's job is to assert the exact rendered sentence; reading it from the same repository the component reads would assert that a value equals itself |

No directory or source-tree exemption was added, and none was widened. The
inventory is printed by the gate on **every** clean run, so a future entry
appears in the gate's own output the day it is added rather than when somebody
goes looking.

---

## H. Admin login 1024 root cause

Arithmetic, not a rendering accident.

```scss
$login-breakpoint: 1024px;      // the row starts here
$brand-panel-width: 780px;      // flex-shrink: 0
$auth-card-width: 440px;        // inside 48px of panel padding
```

```text
780  brand panel (could not shrink)
 96  form-panel padding (48 + 48)
440  auth card
────
1316px  the width the two-column row needed to draw

1316 − 1024 = 292px
```

The row's composition was fixed on **both** sides while the breakpoint that
turned it on was 292px below what it cost. Every width in `[1024, 1316)` overflowed,
by exactly `1316 − width`. At 1440 there was 124px of slack, which is why the
approved frame never showed it.

The measured before-state confirms the arithmetic exactly:

```text
before  1024   scrollWidth 1316   clientWidth 1024   overflow 292px   brand 780   card 440
before  1440   scrollWidth 1440   clientWidth 1440   overflow   0px   brand 780   card 440
```

---

## I. H08 / V02 evidence reconciliation

The two reports do not disagree. **H08 never measured the login page's reflow.**

`packages/e2e-testing/specs/app12/h08-admin-shell.acceptance.spec.ts` case B is
the file that carries the `Admin = 1440 / 1024 / zoom equivalents` claim, and its
loop body is:

```ts
for (const viewport of [...ADMIN_VIEWPORTS, ...ZOOM_200]) {
  await operator.setViewportSize(...);
  await operator.goto(ORDERS_PATH);          // ← the queue, at every width
  await expectNoHorizontalOverflow(operator, `admin-queue@${viewport.name}`);
}
```

Every measurement is taken on `ORDERS_PATH`. The login page appears in that file
only inside `openOperator`, which is **setup** — it opens a context with
`viewport: { width: 1440, height: 900 }`, navigates to `/login`, fills the form
and clicks submit. So the login screen was visited exactly once, at 1440, where
it has 124px of slack and no overflow, and was never revisited at 1024.

Against §6's candidate list:

| candidate | verdict |
|---|---|
| **H08 did not include login in that specific reflow assertion** | **this is the answer** |
| different selector / document geometry | no — both use `documentElement.scrollWidth − clientWidth` |
| different fixture / runtime shell | no — same production `next start`, same stylesheet |
| different viewport semantics | no — both 1024 CSS px |
| measurement bug | no — the before-run reproduces V01/V02's 292px to the pixel |
| real pre-existing defect missed by H08 | yes, and the sentence above is *why* it was missed |

H08's own claim is therefore true as written — "every audited route" did not
include `/login` — and V01/V02's 292px is true as written. Neither report is
rewritten, and both remain accurate. What was wrong was the inference a reader
would naturally draw from putting them side by side, and the audited-route list
is what resolves it.

The V02 report's own line already scoped the claim honestly
(`admin/login/1024 … present in the V01 capture and this one`), and the new
runner closes the coverage gap that let it survive H08.

---

## J. Admin login responsive correction

Three declarations, and no redesign.

```scss
.staff-login__brand {
  @media (min-width: $login-breakpoint) {
    flex: 0 1 $brand-panel-width;   // was: flex-shrink: 0; width: 780px
    min-width: 0;
    padding: spacing(64) spacing(48);   // 72px from $login-wide-breakpoint up
  }
}

.staff-login__form-panel {
  @media (min-width: $login-breakpoint) {
    flex: 1 0 auto;   // grow, never shrink
    width: auto;      // the base `width: 100%` also resolves flex-basis
  }
}
```

`flex: 0 1 780px` is the whole correction. The brand panel still *asks* for the
approved 780px and never grows past it, and it is now the only item in the row
allowed to shrink — so above 1316px the row is byte-for-byte the approved
composition, and below it the brand column gives back exactly the width the row
was overflowing by. The card is the half that must not give way, because a login
form squeezed to fit is the failure §7 forbids by name.

`width: auto` on the form panel is the part that is easy to get wrong, and did
go wrong on the first attempt: the base rule sets `width: 100%` for the stacked
layout, and with `flex-basis: auto` that resolves to the whole row — the panel
asked for 1440px and starved the brand column to its padding. The first
measurement caught it (brand 144px, overflow 144px at 1440), which is exactly
what a live measurement is for.

A second breakpoint, `$login-wide-breakpoint: 1280px`, keeps the approved 72px
editorial inset where the panel is wide enough for it and uses 48px between 1024
and 1280. At 1440 nothing about the approved frame changes.

Preserved, and asserted in §K/§L: the approved production symbol at
`BRAND_SYMBOL_APPLICATION_PX.adminLogin` (72px), the live-text wordmark, the
`Quản trị xưởng` supporting label, the form semantics, the labels, the password
type, the submit behaviour, the error surfaces, keyboard operation and the brand
accessibility rule. Authentication was not redesigned; nothing in
`staff-auth/components`, `hooks`, `services` or `model` changed for this defect.

### The file-size consequence, handled rather than deferred

`staff-login.scss` was **411 lines at entry** — already over the 400-line SCSS
hard limit before this checkpoint touched it — and the correction's comments
would have taken it to 439. It was split by responsibility (CLAUDE.md §6), in the
repository's existing entry-plus-partials convention:

```text
staff-login.scss          201  the screen composition: row, brand panel, form panel, card
_staff-login-form.scss    107  the form: title, submit, retry status, footer
_staff-login-field.scss   103  one labelled field: label, control, input, toggle, error
_staff-login-alert.scss    48  the error and rate-limit surfaces
```

`node tools/check-scss-file-size.mjs apps/admin/src/features/staff-auth/styles`
— **4 stylesheets, 0 above the review threshold** (was 1 over the hard limit).
`node tools/check-app-scss.mjs admin` compiles `main.scss` end to end: **PASS,
0 deprecation warnings**.

---

## K. Live reflow evidence

Production mode, real Chromium, `NODE_ENV=production` + `next start` against the
built `apps/admin`.

```text
node packages/e2e-testing/support/app12/v02-c1-login-reflow.mjs \
     evidences/v02-c1/admin-login/<before|after>
```

### Before (the entry stylesheet, rebuilt and measured)

| viewport | scrollWidth | clientWidth | overflow | brand | card | axe s/c |
|---|---:|---:|---:|---:|---:|---:|
| 1440 | 1440 | 1440 | **0** | 780 | 440 | 0 |
| **1024** | **1316** | **1024** | **292** | 780 | 440 | 0 |
| 768 | 768 | 768 | 0 | 768 | 728 | 0 |
| 390 | 390 | 390 | 0 | 390 | 350 | 0 |
| 1440@200 % (720) | 720 | 720 | 0 | 720 | 680 | 0 |
| 1024@200 % (512) | 512 | 512 | 0 | 512 | 472 | 0 |

### After

| viewport | scrollWidth | clientWidth | overflow | brand | card | axe s/c |
|---|---:|---:|---:|---:|---:|---:|
| 1440 | 1440 | 1440 | **0** | **780** | **440** | 0 |
| **1024** | **1024** | **1024** | **0** | 488 | 440 | 0 |
| 768 | 768 | 768 | 0 | 768 | 728 | 0 |
| 390 | 390 | 390 | 0 | 390 | 350 | 0 |
| 1440@200 % (720) | 720 | 720 | 0 | 720 | 680 | 0 |
| 1024@200 % (512) | 512 | 512 | 0 | 512 | 472 | 0 |

At 1440 the brand panel is **exactly 780** and the card **exactly 440** — the
approved frame is unchanged, which is the assertion that matters most. At 1024
the brand panel gives back exactly 292px (780 → 488) and the card keeps every
one of its 440.

Required controls at every viewport, from the geometry rather than from a class
name:

```text
email · password · submit   visible and inside the client width   6 / 6 viewports
login card                  not clipped                            6 / 6
brand block                 present, undistorted                   6 / 6
```

390 is measured and reported because the login is the one Admin surface with a
real mobile composition — the stacked layout is the stylesheet's *base*, not a
fallback — so §8's "only if currently supported" is satisfied.

Artifacts under `evidences/v02-c1/admin-login/`:

```text
before/login-reflow.json   after/login-reflow.json
before/admin-login-{1440,1024,768,390,1440-200-,1024-200-}.png   (6)
after/ same six
```

### Why this runner and not the full e2e orchestrator

`/login` is a Server Component that renders no data: its only API call is the
already-authenticated redirect probe, and an unreachable API falls through to
rendering the form, which is the state under test. Provisioning Postgres, MinIO,
the API, the worker, the gateway and a seeded commercial universe to measure a
two-column layout would add every orchestrator failure mode to a measurement that
needs none of them — and would put rows in a database this checkpoint is required
to leave clean. The runner points `INTERNAL_API_BASE_URL` at a deliberately
unreachable port and opens no database connection at all. Nothing is typed into
the form and no credential is read.

---

## L. Focused accessibility regression

Login only. The H08 matrix was **not** re-run: no shared primitive changed —
the diff is three flex declarations in one feature stylesheet and a file split
that moved rules without editing them.

```text
axe WCAG 2.2 AA, serious/critical      0   at all six viewports   (axe-core 4.13.0)
200 % reflow (720 and 512 viewports)   0px overflow, controls reachable
h1 per screen                          1
programmatic labels                    label[for] present for email and password
password field type                    "password"
```

Keyboard, driven at 1024:

```text
Tab 1  input#staff-login-email      (type=email)
Tab 2  input#staff-login-password   (type=password)
Tab 3  button                       password-visibility toggle
Tab 4  button[type=submit]
Tab 5  wraps out of the form
```

Four stops, in document order, submit reachable. The two buttons draw a
`2px solid` focus outline. The two inputs set `outline: none` by design and the
indicator is the **control wrapper's border**, which the run measures rather than
assumes:

```text
resting  rgb(231, 229, 228)  1px
focused  rgb(232, 71, 95)    1px      changes = true
```

That is the pattern H08 audited and passed and V02 accepted; it is recorded here
so the report states what the indicator is instead of implying an outline that is
not there. Nothing about it changed in this checkpoint.

---

## M. Brand/i18n regression

### Admin login, live

```text
brand name read from        packages/i18n/messages/vi/common.json
visible occurrences         1     (.staff-login__brand-title)
symbol present              yes   aria-hidden="true", no accessible name
duplicate announcements     0
```

The mark stays unnamed beside the name it sits under, so a screen reader
announces the brand once — the rule the brand panel's own comment states, and it
survives the authority move.

### Storefront, live production build

`next start` against the running development API, `NODE_ENV=production`:

```text
<html lang="vi">
header wordmark    <span class="storefront-shell__brand-wordmark">Nét Thêu</span>
footer wordmark    same class, same value
<title>            Thêu tay, làm tại xưởng — Nét Thêu
og:title           Thêu tay, làm tại xưởng — Nét Thêu
og:site_name       Nét Thêu
og:locale          vi
```

Every one of those strings is now resolved from `common.brand.name`.

### Admin shell and the rest, by test

```text
apps/admin/test/components/staff-login-render.test.tsx   asserts the visible brand
apps/storefront/test/components/store-presentation-block.test.tsx
apps/storefront/test/smoke/content-routes.test.tsx       metadata carries the brand
apps/storefront/test/smoke/discover-page.test.tsx        `… — ${BRAND_NAME}` titles
apps/storefront/test/smoke/gallery-detail-page.test.tsx
packages/i18n/src/brand.test.ts   NEW — 4 cases
```

`brand.test.ts` is the acceptance test §14 asks for, written so it cannot pass by
coincidence: it reads `common.json` **from disk** and compares the accessor
against it, rather than asserting equality with a literal of its own, and it
reads `brand.ts`'s own source (comments stripped) to prove no literal came back.

### Symbol and Figma

`FIGMA_DESIGN_INDEX.md` is unchanged and no Figma node was opened, read or
modified — the `figma-desktop` MCP server was `ConnectionRefused` for this
session, as it was for V02. No registry entry was written for a node nobody
opened. The approved artwork is unchanged and proved so by the byte-identical
regeneration in §D.

---

## N. Files changed

**New (8)**

```text
packages/i18n/src/brand.ts                                   the typed accessor
packages/i18n/src/brand.test.ts                              its acceptance test
tools/i18n-copy-flow.mjs                                     rule 4's resolver + seeds
tools/i18n-exemptions.mjs                                    the escape hatch + inventory
packages/e2e-testing/support/app12/v02-c1-login-reflow.mjs   the live login runner
apps/admin/src/features/staff-auth/styles/_staff-login-form.scss
apps/admin/src/features/staff-auth/styles/_staff-login-field.scss
apps/admin/src/features/staff-auth/styles/_staff-login-alert.scss
```

**Modified — brand authority (26)**

```text
packages/i18n/messages/vi/common.json          + brand.name, brand.descriptor
packages/i18n/src/index.ts                     publishes the accessor
packages/i18n/src/hydrate.ts                   rationale now that both halves are JSON
packages/ui/src/index.ts                       no longer publishes brand text
packages/ui/src/brand/brand-symbol-geometry.ts − BRAND_NAME, − BRAND_DESCRIPTOR
packages/ui/src/brand/brand-symbol.geometry.json − brandName, − brandDescriptor
packages/ui/src/brand/brand-lockup.tsx         required `wordmark` prop
tools/generate-brand-icons.mjs                 reads the name from the message repository
apps/admin/src/app/login/page.tsx              ┐
apps/admin/src/features/admin-shell/model/admin-shell-copy.ts
apps/admin/src/features/staff-auth/model/staff-login-copy.ts
apps/storefront/src/features/… (14 copy/metadata models)   │ import moved to
apps/admin/test/components/staff-login-render.test.tsx      │ @embroidery/i18n
apps/storefront/test/smoke/discover-page.test.tsx           │
apps/storefront/test/smoke/gallery-detail-page.test.tsx     ┘
```

**Modified — the gate (4)**

```text
tools/check-i18n-static-text.mjs         rule 4, the split, the inventory print
tools/check-i18n-static-text.test.mjs    +11 fixtures
tools/check-i18n-message-keys.mjs        packages/i18n/src added to the read roots
packages/e2e-testing/eslint.config.mjs   browser globals for the new runner
```

**Modified — the ASCII escape it found (2)**

```text
apps/admin/src/features/categories/model/category-copy.ts   'Slug' → message read
packages/i18n/messages/vi/admin.json                        + categories.table.slug
```

**Modified — the login correction (1)**

```text
apps/admin/src/features/staff-auth/styles/staff-login.scss
```

**Documentation (3)**

```text
docs/implementation/reports/APP12-V02-C1-COMPLETION-REPORT.md   this file
docs/implementation/reports/APP12-V02-COMPLETION-REPORT.md      correction notice only
docs/implementation/SCOPED_COMMAND_INDEX.md   strengthened gate row + the new runner
```

No API module, no controller, no migration, no route file and no generated
artifact was touched.

---

## O. File-size

```text
node tools/check-file-size.mjs --paths <every changed .ts/.mjs>
  PASS — 0 over the 400-line hard limit

  REVIEW  tools/check-i18n-static-text.mjs   345   (threshold 300)
  REVIEW  tools/i18n-copy-flow.mjs           380   (threshold 300)

node tools/check-scss-file-size.mjs apps/admin/src/features/staff-auth/styles
  PASS — 4 stylesheets, 0 above the review threshold
```

Both `REVIEW` files are named rather than glossed. Each is a checker whose value
is in the reasoning it carries, and roughly a third of each is the module header
that states what the rule is and what it deliberately does not catch — the
material §3 asks to be documented. Both are comfortably inside the hard limit and
both are already split by responsibility; splitting either further would separate
a rule from its own explanation.

The login stylesheet went the other way: it was **over the hard limit at entry**
(411) and is now four files, the largest 201.

---

## P. Validation

Change-impact only. Every command below was run; nothing is a repository-wide
aggregate (`VALIDATION_GOVERNANCE.md` §1.1).

```text
git diff --check                                                   clean

pnpm --filter @embroidery/i18n typecheck                           clean
pnpm --filter @embroidery/i18n test                                28 / 28
pnpm --filter @embroidery/ui   typecheck                           clean
pnpm --filter @embroidery/ui   lint                                clean
pnpm --filter admin       typecheck · lint · test                  clean · clean · 1930 / 1930
pnpm --filter storefront  typecheck · lint · test                  clean · clean · 2533 / 2533
pnpm --filter @embroidery/e2e-testing typecheck · lint             clean · clean

node tools/check-i18n-static-text.mjs        OK — 0 hard-coded, 0 exemptions
node tools/check-i18n-message-keys.mjs       OK — every key exists, every key read
node --test tools/check-i18n-static-text.test.mjs
             tools/check-i18n-message-keys.test.mjs                37 / 37

node tools/generate-brand-icons.mjs --check  5 / 5 byte-identical
node tools/check-app-scss.mjs admin          compile PASS, 0 deprecations
node tools/check-scss-file-size.mjs …/staff-auth/styles             PASS
node tools/check-file-size.mjs --paths …                            PASS
node tools/check-storefront-route-authority.mjs                     PASS
node tools/check-report-secrets.mjs          PASS (675 docs, 5338 tracked files)

pnpm --filter @embroidery/api openapi:check          artifact up to date
pnpm --filter @embroidery/api-client check:generated up to date (tree hash 60443066…)
pnpm --filter @embroidery/api exec jest --testPathPatterns="release-gate.contract"
                                                     15 / 15

apps/admin      production build                     OK
apps/storefront production build                     OK  (STOREFRONT_PUBLIC_ORIGIN set)

node packages/e2e-testing/support/app12/v02-c1-login-reflow.mjs …/before   1 overflow (292px @1024)
node packages/e2e-testing/support/app12/v02-c1-login-reflow.mjs …/after    0 overflow, 0 axe s/c

node tools/db-disposable-inventory.mjs   total=4 disposable=0 droppable=0 in_use=0
```

**Not run, by instruction:** `--app12-g03`, `--app12-u01`, `--app12-e01`, and
`--app12-r01`. The full H08 matrix and the 260-screenshot V02 recapture were not
re-run either — §9 and §8 both say not to, and nothing changed that would move
them.

---

## Q. Hygiene

```text
shared development database   orders = 0 · order_items = 0   commercial residue = 0
                              79 tables · 38 migrations applied
disposable databases          disposable=0 droppable=0 in_use=0
G03 data                      none created
production deployed           no
pushed                        no
credentials                   none read, none written, none printed;
                              the login runner types nothing into the form
.env                          not written
```

The live evidence run started `next start` and nothing else. It opened no
database connection — `INTERNAL_API_BASE_URL` points at a deliberately
unreachable port — so §13's "shared-dev commercial residue = 0" is a property of
the method, not only of the count afterwards.

One pre-existing artefact is reported rather than removed: the disposable
inventory lists `embroidery_db10_restore_b_24308` as `UNKNOWN` (it does not carry
the prefix this repository mints). It predates this checkpoint and dropping a
database nobody authorised dropping is not a correction's business.

---

## R. Frozen baseline

Every number §14 requires to be unchanged, re-measured rather than copied:

```text
OpenAPI paths / operations / schemas    125 / 138 / 278     unchanged
public operations                       49                  unchanged
release matrix                          28 / 18 / 3         unchanged (spec 15/15)
migrations                              38                  unchanged
DB tables                               79                  unchanged
Admin routes                            26                  unchanged
Storefront routes                       20                  unchanged
Figma artwork                           unchanged (no node opened; index untouched)
generated brand icons                   5 / 5 byte-identical
```

New business operation: **none**. New route: **none**. New migration: **none**.

i18n authority after C1:

```text
DEFAULT_LOCALE = vi          SUPPORTED_LOCALES = [vi]
LANGUAGE_SWITCHER = false    LOCALE_ROUTE_PREFIX = false
BROWSER_AUTO_DETECTION = false

human-facing static frontend copy  →  packages/i18n/messages/vi/*.json
brand textual copy                 →  common.brand.name · common.brand.descriptor
dynamic DB/API/business values     →  runtime data
technical identifiers/constants    →  code
```

No `/vi`. No English locale. No language switcher. `<html lang="vi">` measured
live on the production Storefront build.

---

## S. Parent correction notice

A single notice was appended to
`docs/implementation/reports/APP12-V02-COMPLETION-REPORT.md`. Its original
evidence, history, counts and finding ledger are unchanged — including the two
lines that recorded `admin/login/1024` as present and untouched, which were
accurate when written and are what made this correction findable.

---

## T. Roadmap

```text
APP12-V02-C1 = COMPLETE
APP12-V02    = COMPLETE_AFTER_C1
CORRECTION_USED = 1 / 1        (no V02-C2)

NEXT = APP12-G03               not started, no data created
ROADMAP_LOCK = LOCKED · CHECKPOINTS = 38
```

Exactly one NEXT. G03 remains `NOT_AUTHORIZED` until the Product Owner authorises
it.
