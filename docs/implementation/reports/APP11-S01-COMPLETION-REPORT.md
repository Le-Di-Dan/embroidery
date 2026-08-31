# APP11-S01 — Homepage / Store Introduction + Scoped SCSS Compile Gate

**Checkpoint:** `APP11-S01`
**Phase:** APP11 — Gallery, Content, SEO and Store Presentation
**Mode:** STOREFRONT UI · SCOPED VALIDATION TOOLING · NO BACKEND CHANGE
**Date:** 2026-08-31
**Entered because:** `APP11-A02` and `APP11-A02-C1` are both COMPLETE.

---

## A. Verdict

```text
APP11-S01            = COMPLETE
PO_DECISION_REQUIRED = NONE
NEXT_CHECKPOINT      = APP11-S02
```

The CP0 placeholder is gone, the six approved sections ship in the locked order,
no public Gallery API is consumed, no route was added or linked before its owning
checkpoint, and both follow-ups the checkpoint was asked to close are closed with
executable evidence.

---

## B. Entry baseline / design authority

Baseline confirmed on a clean `production` tree before any edit, and re-measured
after:

```text
Storefront routes  = 12  →  12      (route delta 0)
Admin routes       = 25  →  25      (untouched)
OpenAPI            = 116 paths / 128 operations / 252 schemas   (unchanged)
migrations         = 37                                          (unchanged)
Figma registry     = 532 rows, gate PASS                         (unchanged)
```

OpenAPI counted directly from `packages/contracts/openapi/openapi.generated.json`
(`116 / 128 / 252`); migrations counted from `packages/database/migrations/*.sql`
(37).

### Approved Homepage authority

Verified in `docs/design/FIGMA_DESIGN_INDEX.md` before implementation — all four
rows `APPROVED_FOR_IMPLEMENTATION` under `FIG-APPROVAL-APP11-D01-PO-001`, file
`BQwqV8GdfUIELvsQDB1UQE`, page `APP_11`:

| Registry ID | Node | Viewport |
|---|---|---|
| `FIG-APP11-HOME-DESKTOP` | `857:11` | Desktop 1440 |
| `FIG-APP11-HOME-TABLET` | `857:318` | Tablet 1024 |
| `FIG-APP11-HOME-MOBILE` | `857:506` | Mobile 390 |
| `FIG-APP11-HOME-PROVENANCE` | `858:442` | Provenance / routes |

Section authority `857:4`; provenance UI01 `183:7` / `189:266` / `191:412` plus
the `APP1-D02` Storefront shell.

### Figma access — declared fallback

**The live Figma authority could not be opened in this session.** The
`figma-desktop` MCP server failed to connect (`ConnectionRefused`), and the only
Figma tools exposed were `authenticate`/`complete_authentication`. Per §3.3 the
implementation therefore used the **registry rows above plus the accepted
`APP11-D01` and `APP11-D01-C1` evidence**, principally `APP11-D01` §F, which
records for these exact frames:

- the three frames are clones of UI01 with the Header/Footer instances left as
  the `APP1-D02` DS components;
- `Journal` (`857:42`, `857:363`, `857:548`) was **deleted** from all three and
  the auto-layout body reflowed, leaving `JOURNAL_IN_APP11_HOMEPAGE = false`;
- the six remaining sections in order — Hero · Featured Works · Discover Feed ·
  Collections · Studio Story · Commission CTA;
- the route targets recorded on `858:442`.

**No Figma node and no registry row was modified.** The registry gate still
reports 532 rows and passes.

---

## C. CP0 replacement

`apps/storefront/src/app/page.tsx` previously rendered:

```text
Embroidery Commerce Storefront
Ứng dụng storefront đã khởi tạo (checkpoint CP0). Tính năng nghiệp vụ chưa được
triển khai.
```

Both strings are gone from the shipped source and from the rendered page. Proven
three ways:

1. `test/boundary/homepage-source.test.ts` — "carries no CP0 scaffold copy
   anywhere in the shipped source" (matches `Embroidery Commerce Storefront`,
   `Ứng dụng storefront`, `CP0` across the whole feature plus the route file);
2. `test/components/homepage.test.tsx` — "shows no CP0 scaffold or engineering
   copy" over the rendered screen, also rejecting `checkpoint`, `scaffold`,
   `khởi tạo`, `APP11`, `TBD`, `Lorem ipsum`, `placeholder`;
3. live browser at 1440 — `cp0Present: false`.

`test/smoke/home-page.test.tsx` **asserted the CP0 heading** and so could not
survive the checkpoint that removed it. It was rewritten in place (not deleted)
against the shipped segment — metadata, `force-dynamic`, and that the segment
renders `HomepageScreen` and nothing else.

---

## D. Homepage design implementation

Runtime compared against `857:11` / `857:318` / `857:506`.

### Six-section order — proven, not asserted by construction

`HomepageScreen` is the composition under test. The component suite renders the
**real** screen with only the async lane's `await` stubbed, so the order it
observes is the screen's own:

```text
h1  Xưởng thêu thủ công theo yêu cầu     (Hero)
h2  Tác phẩm nổi bật                     (Featured Works)
h2  Khám phá                             (Discover Feed)
h2  Bộ sưu tập                           (Collections)
h2  Câu chuyện của xưởng                 (Studio Story)
h2  Đặt thêu theo yêu cầu                (Commission CTA)
```

Measured live at **all three** viewports — byte-identical `h2Order` at 1440,
1024 and 390.

```text
JOURNAL_IN_APP11_HOMEPAGE = false
```

No Journal, blog, news or article feed section, no blog runtime, no `/nhat-ky`
route, no `features/journal` directory.

### Shell reuse

Header, footer, mobile navigation and the floating contact dock are **not**
rendered by the Homepage — they remain the root layout's `StorefrontShell`
(`APP1-D02`). No Homepage-only shell was built and no shell component was
modified. The only change inside `storefront-shell` is one **export** added to
its public index (`STOREFRONT_CUSTOM_REQUEST_ROUTE`), so the Homepage CTA reads
the same constant the header IA item does instead of writing a second literal.

`APP11-S05` (footer store-presentation block) was **not** started.

---

## E. Data-source mapping

| Section | Data source |
|---|---|
| 1 Hero | static canonical content |
| 2 Featured Works | existing Product authority — slice `[0,3)` of one bounded read |
| 3 Discover Feed | existing Product authority — slice `[3,9)` of the **same** read |
| 4 Collections | static canonical content + **staged S02 route action** |
| 5 Studio Story | static canonical content |
| 6 Commission CTA | static canonical content + existing request flow |

### One read, two non-overlapping slices

`fetchHomepageWorksOnServer` issues exactly one `publicProductList` call with
`limit = 9` — the already-delivered `APP2-B04` public discovery operation. No
Product API was added and no operation was regenerated.

`toHomepageWorks` slices `[0,3)` and `[3,9)`, so no product can appear twice, and
the boundary test pins **exactly one** `publicProductList(` call in the entire
feature. The card projection reuses `product-discovery`'s own `toDiscoverCard` —
the single place `price` and `isDisplayOutOfStock` are dropped from a public
product summary — rather than adding a parallel projection.

### No Gallery API — proven

`test/boundary/homepage-source.test.ts` asserts the feature source matches none
of `publicGalleryEntry`, `publicSitemapEntry`, `galleryEntry_`, `adminGallery`,
`adminProduct`. Live: the Homepage issued **zero** non-static network requests —
it is fully server-rendered and makes no client API call at all. There are no
hard-coded gallery slugs and no fabricated gallery entries anywhere.

### Truthful density

The dev catalog holds exactly **one** published product. The page rendered one
real work card and padded nothing; the boundary is covered by the test "renders
fewer real works rather than padding a short catalog".

---

## F. Route/action boundaries

| Action | Target | Status |
|---|---|---|
| Featured Works → | `/kham-pha` | live, HTTP 200, click-through verified |
| Work card → | `/san-pham/[slug]` | live, click-through to `/san-pham/ao-thun-cotton` |
| Discover preview → | `/kham-pha` | live |
| Hero explore → | `/kham-pha` | live |
| Hero / CTA commission → | `/yeu-cau/moi` | live, click-through verified |
| Collections → | `/bo-suu-tap` | **staged for `APP11-S02`** — no link rendered |

`/bo-suu-tap` and `/dich-vu` both answer **404** and neither is created,
referenced or linked. The boundary suite enumerates all five later-checkpoint
segments (`bo-suu-tap`, `dich-vu`, `cau-hoi-thuong-gap`, `cua-hang`,
`chinh-sach`) and asserts, for each, both that no route directory exists and that
the Homepage source never names it. Live at 1440:
`deadCollectionLink: false`, `dichVuLink: false`.

Product Detail paths are built only through `buildStorefrontProductDetailPath`;
the boundary test additionally rejects any template literal spelling of
`/san-pham/${…}`, so a path can never be composed from a raw product id. No
storage key, bucket, private media URL, Admin metadata or publication status is
exposed — `toDiscoverCard` cannot carry them.

### Collections staging — recorded

The approved Collections section links into the gallery feed. S01 ships its
**heading and editorial framing only**: no cards, no slugs, no API, no
`/bo-suu-tap` anchor, and deliberately **no "coming soon" note** (§7 forbids
copy explaining that later checkpoints are pending; the shell's own nav already
carries the truthful affordance for the unbuilt area). `model/homepage-routes.ts`
records the staged action and the reason the path is not written as a constant.
`APP11-S02` adds the route and the link together.

### Commission CTA

Uses the existing canonical `/yeu-cau/moi` flow (`APP5-S01`). No second intake
flow; `/cart`, `/checkout`, `/commission-new`, `/contact-form` are neither
created nor referenced (asserted in both suites).

---

## G. Responsive / accessibility

Live measurements through the canonical gateway (`http://embroidery.local/`):

| | 1440 | 1024 | 390 |
|---|---|---|---|
| Verdict | **PASS** | **PASS** | **PASS** |
| Horizontal overflow | none | none | none |
| Elements overflowing `main` | 0 | 0 | 0 |
| `<h1>` count | 1 | 1 | 1 |
| `<h1>` size | 64px (display-l) | 56px (display-m) | 40px (heading-l) |
| Section order | correct | correct | correct |
| Work card | 368 × 516 | 304 × 437 | 343 × 485 |
| Min action height | 44px | 44px | 44px |
| Clickable `div` cards | 0 | 0 | 0 |

The three tiers are a genuine recomposition, not a shrunken desktop: the type
scale steps down through three foundation sizes, Featured Works goes 3-up → 3-up
→ 1-up, the Discover preview 3 → 3 → 2, and the commission steps go from a
three-column row to a stack.

**One defect was found and fixed by live measurement.** Holding Featured Works to
one column until 1025px made a single card 961px wide at 1024, with its 4:5 media
**1258px tall** — one work swallowing the whole tablet viewport. The three-up now
starts at the medium tier (640px); re-measured at 1024 the card is 304 × 437. The
reason is recorded in `_homepage-works.scss` beside the rule.

Accessibility: exactly one `<h1>`; five semantic `<h2>` section headings; work
titles at `<h3>` (a Homepage-specific card exists precisely so a work does not
title itself as a peer of "Câu chuyện của xưởng"); every action a real `<a>` with
descriptive text and a visible `:focus-visible` ring; the commission steps an
`<ol>` with an accessible name; a work with no thumbnail renders an accessible
placeholder (`role="img"`, "Chưa có ảnh cho tác phẩm này.") rather than a
fabricated URL; the skeleton's placeholders are `aria-hidden` with one polite
live region carrying the state in words. All store-introduction text is DOM text
— the Studio Story section contains zero `<img>` elements. The continuation link
is underlined rather than colour-coded, so no meaning is carried by colour alone.

**Floating social dock:** the dock renders nothing, and that is the **preserved
pre-existing** behaviour, not a regression — `NEXT_PUBLIC_ZALO_CONTACT_URL` and
`NEXT_PUBLIC_MESSENGER_CONTACT_URL` are both empty in the dev compose, and the
dock is equally absent on `/kham-pha`, a route S01 did not touch. The dock was
neither moved, restyled nor re-placed; the Homepage's own actions are
left-aligned and the footer follows the last section, so nothing sits under the
bottom-right dock position.

---

## H. Scoped SCSS compile gate

```text
FU-APP10-E01-02 = CLOSED
```

| | |
|---|---|
| Tool path | `tools/check-app-scss.mjs` (145 lines) |
| Storefront command | `node tools/check-app-scss.mjs storefront` |
| Admin command | `node tools/check-app-scss.mjs admin` |
| Command IDs | `CMD-CHECK-APP-SCSS-STOREFRONT`, `CMD-CHECK-APP-SCSS-ADMIN` |

**Resolution strategy.** `APP11-G01` measured that a plain `sass` CLI invocation
**cannot** compile these entry points — four attempts failed — because
`main.scss` opens with the bare package specifier `@use '@embroidery/styles'`,
which the CLI has no way to resolve and `--load-path` cannot supply. Next solves
it in two halves, and the gate mirrors both, deriving each from the **app's own**
`require` rather than a hard-coded monorepo path:

1. a Sass **file importer** that resolves bare specifiers through
   `createRequire(<app>/next.config.ts).resolve(url)`, returning `null` for
   relative/absolute loads so Sass's normal precedence is preserved;
2. `loadPaths: [dirname(require.resolve('@embroidery/styles'))]` — byte-identical
   to what `next.config.ts` computes — so the package's internal
   `@use 'settings'` graph resolves.

It uses the **app's installed** `sass` (`require.resolve('sass')`), not a
tool-local copy.

**Results:**

```text
SCSS compile PASS  apps/storefront/src/styles/main.scss (120084 bytes CSS, 1 deprecation warning(s), not written to disk).
SCSS compile PASS  apps/admin/src/styles/main.scss     (210641 bytes CSS, 0 deprecation warning(s), not written to disk).
```

**Negative behaviour** (all covered by `tools/check-app-scss.test.mjs`):

| Case | Behaviour |
|---|---|
| Unknown app (`nope`) | non-zero + usage naming `storefront\|admin` |
| No argument | non-zero + usage |
| Invalid Sass fixture | non-zero; the Sass message naming file/line/column is printed |
| Unresolvable bare specifier | non-zero |
| Compile output | in-memory only; the fixture directory still contains exactly the one `.scss` file afterwards |
| Committed CSS | a test asserts no `.css` file sits beside either app's `main.scss`; `git status` confirms none |

Deprecation warnings are **counted, not fatal**. Failing on them would sweep
historical Sass debt (one pre-existing `slash-div` warning in
`secure-design-review.scss`, owned by APP6) into whichever checkpoint next
touches a stylesheet — a decision this tool may not make on its own.

The gate is **not** added to any global control; Prettier, ESLint and SonarQube
remain the only three.

---

## I. Scoped SCSS source-size enforcement

```text
FU-APP11-A02-C1-01 = CLOSED
```

| | |
|---|---|
| Tool path | `tools/check-scss-file-size.mjs` (152 lines) |
| Command | `node tools/check-scss-file-size.mjs <path> [path...]` |
| Command ID | `CMD-CHECK-SCSS-FILE-SIZE` |

**How historical debt is kept out.** `tools/check-file-size.mjs` was **not
modified** — its default behaviour, its scanned extensions and its exclusion
sets are byte-identical, and it still reports the same 79 pre-existing
repository-wide violations it reported before this checkpoint (none of them an
S01 file). Teaching it to read `.scss` would have made it start failing on debt
no current change introduced — `design-studio.scss` alone is 1876 lines.

Instead the enforcement is a **separate tool with no repository-wide mode**:

- explicit file/directory arguments only; directories recurse;
- `.scss` only — a mixed changed-file list can be passed unfiltered and non-SCSS
  entries are ignored;
- hard limit 400 (review warning at 300, non-fatal), reporting path + line count;
- a supplied path that does not exist is an **error**, not a silent skip;
- **no arguments → usage + exit 1**, never a global sweep.

Run for this checkpoint:

```text
node tools/check-scss-file-size.mjs apps/storefront/src/features/homepage/styles apps/storefront/src/styles/main.scss
→ SCSS file-size check passed (7 stylesheet(s), 0 above the review threshold).
```

---

## J. Frozen artifacts

```text
OpenAPI            = 116 / 128 / 252     unchanged
migrations         = 37                  unchanged
Admin routes       = 25                  unchanged
Storefront routes  = 12                  unchanged
backend / worker / database / Figma / Admin = changed: false
```

Drift checks:

```text
pnpm --filter @embroidery/api openapi:check
→ OpenAPI artifact is up to date

pnpm --filter @embroidery/api-client check:generated
→ generated client is up to date (tree hash a19cb87a…88a70)

node tools/check-figma-design-index.mjs
→ PASS (532 registry IDs, 532 node rows, 23 registry tables)
```

`git status` confirms not one file under `apps/api`, `apps/worker`,
`packages/database`, `packages/contracts/openapi`, `packages/api-client`,
`apps/admin` or `docs/design` was touched. No OpenAPI or client regeneration was
run. No new dependency was added. No generated file was edited.

---

## K. File-size compliance

Every S01-owned or modified file, measured. **Stylesheets listed explicitly:**

| Stylesheet | Lines | Limit |
|---|---|---|
| `apps/storefront/src/features/homepage/styles/homepage.scss` | 16 | 400 |
| `apps/storefront/src/features/homepage/styles/_homepage-tokens.scss` | 34 | 400 |
| `apps/storefront/src/features/homepage/styles/_homepage-hero.scss` | 57 | 400 |
| `apps/storefront/src/features/homepage/styles/_homepage-editorial.scss` | 103 | 400 |
| `apps/storefront/src/features/homepage/styles/_homepage-works.scss` | 137 | 400 |
| `apps/storefront/src/features/homepage/styles/_homepage-layout.scss` | 134 | 400 |
| `apps/storefront/src/styles/main.scss` (modified, +1 line) | 42 | 400 |

Semantic partials from the start, not a later rescue.

**Source (≤400) and tests (≤600):** largest source file is
`model/homepage-copy.ts` at 101; largest tool is
`tools/check-scss-file-size.mjs` at 152; largest test is
`test/components/homepage.test.tsx` at 195. Every S01 file is comfortably
inside its limit, and zero S01 files appear in `check-file-size.mjs`'s violation
list.

**No repository-wide file-size compliance is claimed.** The canonical checker
reports 79 pre-existing hard-limit violations across the repository; all of them
predate this checkpoint and none is an S01 file.

---

## L. Validation / live browser evidence

```text
CHANGE_IMPACT
  Storefront `/` route segment (CP0 placeholder → Homepage feature)
  New Storefront `homepage` feature (14 TS/TSX + 6 SCSS)
  Two Storefront feature public indexes gained one export each
  apps/storefront/src/styles/main.scss — one @use line
  Two new repository SCSS validation tools + their tests
  SCOPED_COMMAND_INDEX.md, APP11 phase roadmap, this report
  No backend, worker, database, contract, generated-client, Admin or Figma input
```

```text
TESTS_RUN
  pnpm --filter @embroidery/storefront typecheck ......................... PASS
  pnpm --filter @embroidery/storefront build ............................. PASS (route set 12, `/` dynamic)
  npx eslint <7 changed storefront paths> ................................ PASS (0 problems)
  npx jest test/components/homepage.test.tsx ............................. PASS 16
  npx jest test/boundary/homepage-source.test.ts ......................... PASS 23
  npx jest test/smoke/home-page.test.tsx ................................. PASS  3
  npx jest test/boundary/storefront-shell-source.test.ts ................. PASS (touched shell index)
  npx jest test/boundary/product-discovery-source.test.ts ................ PASS (touched discovery index)
        → 5 suites, 67 tests, 0 failures
  node --test tools/check-app-scss.test.mjs .............................. PASS  9
  node --test tools/check-scss-file-size.test.mjs ........................ PASS  9
  node tools/check-app-scss.mjs storefront ............................... PASS
  node tools/check-app-scss.mjs admin .................................... PASS
  node tools/check-scss-file-size.mjs <S01 stylesheets> .................. PASS (7)
  pnpm --filter @embroidery/api openapi:check ............................ PASS
  pnpm --filter @embroidery/api-client check:generated ................... PASS
  node tools/check-figma-design-index.mjs ................................ PASS (532 rows)
  npx prettier --check <all changed files> ............................... PASS
  Live browser 1440 / 1024 / 390 through the gateway ..................... PASS
```

```text
TESTS_NOT_RUN            WHY_NOT_RUN
  full Storefront suite    Change-impact only (phase §9). The two shared seams S01
                           actually touched — the shell and discovery public
                           indexes — were run; nothing else depends on the new
                           feature, which no other module imports.
  full Admin suite         No Admin source changed. The Admin SCSS **compile**
                           gate was run because the new tool must prove both apps.
  API / worker suites      No backend or worker file changed; both drift checks
                           pass, proving the contract inputs are untouched.
  DB regression            No migration, schema or persistence change (37 → 37).
  full Playwright          §24 requires targeted browser acceptance, not the suite.
  APP11-E01                Not this checkpoint; E01 is bounded cross-boundary
                           acceptance and is NOT STARTED.
  historical phase suites  No dependency reason (phase §9 rule 6).
  repository-wide aggregate Forbidden (CLAUDE.md §9; VALIDATION_GOVERNANCE §1.1).
```

### Live browser acceptance — all 15 checks

Real Storefront through the canonical Nginx gateway at `embroidery.local`.

| # | Check | Result |
|---|---|---|
| 1 | `/` returns 200 | **PASS** |
| 2 | CP0 placeholder absent | **PASS** (`cp0Present: false`) |
| 3 | Existing Header/Footer reused | **PASS** (shell untouched; `<main>` shell-owned) |
| 4 | Six sections in correct order | **PASS** at 1440 / 1024 / 390 |
| 5 | Journal absent | **PASS** (`journalInMain: false`) |
| 6 | Featured Works → `/kham-pha` | **PASS** (clicked; landed on Khám phá) |
| 7 | Work card → existing `/san-pham/[slug]` | **PASS** (clicked; `/san-pham/ao-thun-cotton`, 200) |
| 8 | Collections has no dead `/bo-suu-tap` link | **PASS** (`deadCollectionLink: false`) |
| 9 | Commission CTA reaches the existing request flow | **PASS** (clicked; `/yeu-cau/moi`) |
| 10 | No `/dich-vu` link/route fabricated | **PASS** (`dichVuLink: false`; route 404) |
| 11 | Floating dock correct | **PASS** (unchanged; see §G) |
| 12 | Missing social config → render-nothing preserved | **PASS** (both env URLs empty; identical on untouched `/kham-pha`) |
| 13 | No horizontal overflow at 1024 / 390 | **PASS** (`scrollWidth == clientWidth`; 0 overflowing elements) |
| 14 | No console error | **PASS** for S01 — see note |
| 15 | No failed request to invented routes/APIs | **PASS** (zero non-static requests issued) |

**Check 14 note.** One console error occurs: `GET /favicon.ico 404`. It is
**pre-existing and repository-wide**, not S01's — the Storefront has never
shipped a favicon (no `src/app/favicon.ico`, no `public/` directory, no git
history for either), and the 404 occurs identically on `/kham-pha` and
`/truy-cap`. Recorded as a nonblocking follow-up. No other console error was
produced at any viewport.

---

## M. Files changed

Git-authoritative.

**Modified (7)**

```text
apps/storefront/src/app/page.tsx                          CP0 placeholder → thin Homepage segment
apps/storefront/src/features/product-discovery/index.ts   +2 exports (toDiscoverCard, DiscoverCard)
apps/storefront/src/features/storefront-shell/index.ts    +1 export (STOREFRONT_CUSTOM_REQUEST_ROUTE)
apps/storefront/src/styles/main.scss                      +1 @use for the homepage entry
apps/storefront/test/smoke/home-page.test.tsx             rewritten off the removed CP0 copy
docs/implementation/SCOPED_COMMAND_INDEX.md               +4 command rows
docs/implementation/phases/APP11-GALLERY-CONTENT-AND-SEO.md  S01 COMPLETE, S02 NEXT
```

**Added (26)**

```text
apps/storefront/src/features/homepage/index.ts
apps/storefront/src/features/homepage/components/homepage-screen.tsx
apps/storefront/src/features/homepage/components/homepage-hero.tsx
apps/storefront/src/features/homepage/components/homepage-works-lane.tsx
apps/storefront/src/features/homepage/components/homepage-works-sections.tsx
apps/storefront/src/features/homepage/components/homepage-works-skeleton.tsx
apps/storefront/src/features/homepage/components/homepage-work-card.tsx
apps/storefront/src/features/homepage/components/homepage-collections.tsx
apps/storefront/src/features/homepage/components/homepage-studio-story.tsx
apps/storefront/src/features/homepage/components/homepage-commission-cta.tsx
apps/storefront/src/features/homepage/model/homepage-copy.ts
apps/storefront/src/features/homepage/model/homepage-routes.ts
apps/storefront/src/features/homepage/model/homepage-works.ts
apps/storefront/src/features/homepage/services/homepage-catalog.server.ts
apps/storefront/src/features/homepage/styles/homepage.scss
apps/storefront/src/features/homepage/styles/_homepage-tokens.scss
apps/storefront/src/features/homepage/styles/_homepage-layout.scss
apps/storefront/src/features/homepage/styles/_homepage-hero.scss
apps/storefront/src/features/homepage/styles/_homepage-works.scss
apps/storefront/src/features/homepage/styles/_homepage-editorial.scss
apps/storefront/test/components/homepage.test.tsx
apps/storefront/test/boundary/homepage-source.test.ts
tools/check-app-scss.mjs
tools/check-app-scss.test.mjs
tools/check-scss-file-size.mjs
tools/check-scss-file-size.test.mjs
```

Plus this report. **Nothing was pushed.** No compiled CSS artifact exists in the
tree; the Playwright artifacts under `.playwright-mcp/` are git-ignored.

---

## N. Follow-ups

Genuine, nonblocking.

| ID | Item |
|---|---|
| `FU-APP11-S01-01` | **Storefront ships no favicon.** `GET /favicon.ico` 404s on every route, producing one console error site-wide. Pre-existing and not S01's; a `src/app/icon` asset is the App Router fix. Suggest `APP11-S04` (technical SEO/metadata) or `APP12`. |
| `FU-APP11-S01-02` | **Brand-name divergence.** The shell wordmark is `Xưởng Thêu` but `/yeu-cau/moi` titles itself `— Nét Thêu` (`APP5-S01` copy). One of the two is wrong; the Homepage follows the shell. Product Owner copy decision, not an implementation defect. |
| `FU-APP11-S01-03` | **Turbopack does not hot-reload a changed SCSS partial** in the dev container — a corrected rule kept serving the stale chunk until `docker-dev restart storefront`. It cost one confusing measurement cycle here and will cost the five remaining APP11 frontend checkpoints the same. Worth a note in the dev-environment docs. |
| `FU-APP11-S01-04` | **`slash-div` deprecation in `secure-design-review.scss:43`** (`$preview-ratio: 4 / 3`), owned by APP6. Surfaced by the new compile gate, which counts but does not fail on deprecations. Removed in Dart Sass 2.0; `math.div` is the fix. |
| `FU-APP11-S01-05` | **Shared breakpoint scale still deferred** (FU-A16). The Homepage declares its own 640/1025 tiers, deliberately identical to `product-discovery`'s so two adjacent surfaces cannot reflow at different widths. A third feature repeating them is the point at which this should move into `@embroidery/styles`. |

---

## O. Roadmap

```text
APP11-G01      COMPLETE
APP11-G01-C1   COMPLETE
APP11-D01      COMPLETE
APP11-D01-C1   COMPLETE
APP11-B01      COMPLETE
APP11-B01-C1   COMPLETE
APP11-B02      COMPLETE
APP11-B03      COMPLETE
APP11-B03-C1   COMPLETE
APP11-B03A     COMPLETE
APP11-B04      COMPLETE
APP11-B04-C1   COMPLETE
APP11-A01      COMPLETE
APP11-A02      COMPLETE
APP11-A02-C1   COMPLETE
APP11-S01      COMPLETE
APP11-S02      NEXT
APP11-S03      NOT STARTED
APP11-S04      NOT STARTED
APP11-S05      NOT STARTED
APP11-E01      NOT STARTED
APP11-X01      NOT STARTED
```

Exactly one `NEXT`. `APP11-S02` was **not** started.
