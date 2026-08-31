# APP11-A02-C1 — SCSS Source-Size Compliance

## A. Verdict

```text
APP11-A02-C1 = COMPLETE
APP11-A02    = COMPLETE
```

The blocking defect is closed. Every stylesheet `APP11-A02` added or modified is
now at or below the locked 400-line source cap, the split is semantic, and the
emitted CSS is **byte-identical** to the pre-split build — proven, not asserted
(§F).

This is the only correction taken against `APP11-A02`. No `APP11-A02-C2`.

---

## B. Frozen A02 runtime

C1 changed no TypeScript, no TSX, no test, no route, no copy and no design
token. It moved SCSS rules between files and changed nothing else.

```text
/gallery                        unchanged
/gallery/[entryId]              unchanged
Admin routes                    25            (find apps/admin/src/app -name page.tsx | wc -l)
create bootstrap dialog         unchanged
authoring form                  unchanged
linked Product                  unchanged
media selection / order         unchanged
B03A media preparation          unchanged
publish / unpublish             unchanged
guarded concurrency handling    unchanged
api-client curated exports      unchanged
backend / worker / database     unchanged
OpenAPI                         116 / 128 / 252
migrations                      37
Figma                           unchanged
Storefront                      unchanged
```

Files changed by C1 that are **not** `.scss`: none, apart from this report, the
phase table row and a correction note appended to the A02 report.

---

## C. The SCSS defect

The A02 report stated:

> `styles/gallery-editor.scss` is 775 lines. SCSS is outside the checker's
> scanned extensions and within the Admin norm.

That reasoning was wrong on both halves, and the A02 report now carries a
correction note saying so.

1. **SCSS is runtime application source.** `CLAUDE.md` §6 caps logic/source
   files at 400 lines. It scopes the exemption to "generated files, lockfiles,
   generated migrations, snapshots, and pure data fixtures". A hand-written
   feature stylesheet is none of those.
2. **The tool's blind spot is not a policy exemption.**
   `tools/check-file-size.mjs` declares
   `SCANNED_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']`
   (line 23). A file the gate cannot see is unmeasured, not compliant. A02
   reported "0 files above the review threshold" from a run that never opened a
   `.scss` file, which made a hard violation read as a pass.
3. **"Within the Admin norm" argued from other violations.** Eight further Admin
   stylesheets are over 400 today. That is pre-existing debt outside this
   correction's scope, not a licence.

C1 did not modify the checker. Extending its scanned extensions would put those
eight other stylesheets into a gate this correction is not allowed to touch, and
`tools/` is outside the allowed-change list in §12 of the directive. The SCSS
audit below is therefore explicit and manual, exactly as §10 requires, and the
tool gap is recorded as a follow-up (§K).

---

## D. Audit of every A02-owned or A02-modified stylesheet

Both were measured, not just the one the PO named.

```text
apps/admin/src/features/gallery-editor/styles/gallery-editor.scss   775   A02 added
apps/admin/src/features/gallery-list/styles/gallery-list.scss       526   A02 modified (A01 475 -> A02 526)
apps/admin/src/styles/main.scss                                      53   A02 modified — already compliant, untouched by C1
```

`gallery-list.scss` was over the cap when A01 delivered it at 475 and A02 pushed
it to 526. C1 splits it too.

---

## E. Semantic stylesheet split

### E.1 The rule the split follows

Each partial owns one responsibility, holds every selector for it and no
selector for anything else, and declares the layout measures that only it uses.
The repository's established pattern — `order-detail`, `production-job`,
`sku-stock` — is a single feature entry that `main.scss` loads, composing
underscore-prefixed partials via `@use` in cascade order. C1 follows it exactly:
no new global import, no `@import`, no cross-feature partial import, no cycle.

`production-job` sets the precedent for a measure declared in more than one
partial (`$job-narrow-desktop` appears in two); C1 needs that once, for the
cover tile size the skeleton matches.

### E.2 Gallery editor — 8 partials

```text
gallery-editor.scss                    entry: header + @use in cascade order
_gallery-editor-layout.scss            page frame, header, two-column workspace,
                                       the 1024px switch, the panel chrome
_gallery-editor-actions.scss           the shared button base, primary variant,
                                       inline action
_gallery-editor-feedback.scss          failures, notices, validation summary,
                                       confirmation body, status line, the
                                       screen-reader live region
_gallery-editor-authoring.scss         form header, SEO group, textarea/readonly/
                                       checkbox fields, linked product + its
                                       picker list
_gallery-editor-media.scss             media header, ordered list, row with
                                       position/cover/actions, dirty footer,
                                       the fixed image tile
_gallery-editor-publication.scss       status summary, readiness requirements,
                                       publish/unpublish actions
_gallery-editor-dialogs.scss           backdrop, panel in both measures,
                                       title/body/footer bands
_gallery-editor-pickers.scss           picker grid, the vertical option card,
                                       empty state, cursor continuation
```

Actions and feedback are separated from layout because they are cross-cutting
primitives every section reuses, and they must load before the sections that
inherit them. The pickers load last because the option card is composed on top
of both the dialog shell and the image tile.

No `_gallery-editor-responsive.scss` was created. The feature has exactly one
media query, and it belongs to the layout frame it switches; hoisting it into a
separate file would be an arbitrary split, which §4 forbids.

### E.3 Gallery list — 3 partials

```text
gallery-list.scss                      entry
_gallery-list-layout.scss              page frame, heading + create action,
                                       status filter, the presentation switch
_gallery-list-presentations.scss       desktop table, the cover tile both draw,
                                       mobile card list
_gallery-list-states.scss              empty / filtered-empty / failure panels,
                                       shared panel-button treatment, live
                                       region, pagination, loading skeleton
```

The cover tile sits between the two presentations because both draw it; putting
it inside either one would be arbitrary. The skeleton re-declares
`$gallery-cover-size` so its geometry provably matches the real row.

### E.4 What the split did not do

```text
no minification
no whitespace or comment stripping to beat the count
no part1/part2 split
no change to the 400-line policy
no exclusion of SCSS from acceptance
```

The only comments removed are the eight `// ---- Section ---- //` banners that
became redundant once each section had its own file named for it; each partial
gained a real header comment in their place, which is why the partials total
more lines than the originals (833 + 564 vs 775 + 526).

---

## F. Proof that the emitted CSS is unchanged

This is the load-bearing evidence for "no visual behavior change", and it is
stronger than a screenshot comparison.

A production build from **before** the split had left its compiled CSS chunk on
disk at `apps/admin/.next/static/chunks/0a9xnibs35a4p.css` (171,913 bytes,
timestamped 08:53, and containing the picker layout correction —
`flex-direction:column`, `height:132px`). It was copied aside, then
`next build` was run again against the split source.

```text
pre-split chunk   0a9xnibs35a4p.css   md5 76edaa7a2cd6b98c68b05de89859917d   171913 bytes
post-split chunk  0a9xnibs35a4p.css   md5 76edaa7a2cd6b98c68b05de89859917d   171913 bytes
```

Identical md5, identical byte length — and identical **content hash in the
filename**, which Next derives from the chunk's bytes. The build could not have
produced that filename from different CSS. Zero declarations added, removed,
reordered or re-scoped.

---

## G. Sass compile proof

APP10-E01 established that Jest passes while SCSS is fatally invalid, because
component tests mock stylesheets. So the entry was compiled for real, with the
Admin app's own installed Sass (`sass@1.101.3`, resolved through
`apps/admin/next.config.ts`) and the same load path that config computes, plus a
package importer so the bare `@embroidery/styles` specifier resolves as
sass-loader resolves it in the Next build.

```text
node <scratchpad>/compile-admin.cjs <scratchpad>/admin-new.css
ADMIN_SCSS_COMPILE = PASS (210641 bytes)
```

210,641 bytes unminified against the 171,913-byte minified build chunk — the
difference is the minifier, as expected. No generated CSS is committed; the
output was written to the session scratchpad.

`APP11-S01` still owns the permanent scoped SCSS compile gate
(`FU-APP10-E01-02`). This run proves the refactor compiles; it is not that gate.

---

## H. Explicit source-size table

Manual `wc -l`, because the canonical checker does not scan `.scss`.

```text
PATH                                                                      TYPE   BEFORE  AFTER  HARD_LIMIT  RESULT
features/gallery-editor/styles/gallery-editor.scss                        scss      775     38         400  PASS
features/gallery-editor/styles/_gallery-editor-layout.scss                scss      NEW    115         400  PASS
features/gallery-editor/styles/_gallery-editor-actions.scss               scss      NEW     72         400  PASS
features/gallery-editor/styles/_gallery-editor-feedback.scss              scss      NEW     81         400  PASS
features/gallery-editor/styles/_gallery-editor-authoring.scss             scss      NEW    105         400  PASS
features/gallery-editor/styles/_gallery-editor-media.scss                 scss      NEW    137         400  PASS
features/gallery-editor/styles/_gallery-editor-publication.scss           scss      NEW     67         400  PASS
features/gallery-editor/styles/_gallery-editor-dialogs.scss               scss      NEW     83         400  PASS
features/gallery-editor/styles/_gallery-editor-pickers.scss               scss      NEW    136         400  PASS
features/gallery-list/styles/gallery-list.scss                            scss      526     28         400  PASS
features/gallery-list/styles/_gallery-list-layout.scss                    scss      NEW    121         400  PASS
features/gallery-list/styles/_gallery-list-presentations.scss             scss      NEW    240         400  PASS
features/gallery-list/styles/_gallery-list-states.scss                    scss      NEW    175         400  PASS
src/styles/main.scss                                                      scss       53     53         400  PASS  (untouched by C1)

ALL APP11 GALLERY SCSS <= 400 = true
largest = 240 (_gallery-list-presentations.scss), 40% headroom
```

Canonical checker, for TS/TSX/tests (unchanged by C1, re-run as a regression):

```text
node tools/check-file-size.mjs apps/admin/src          PASS (0 above review threshold)
node tools/check-file-size.mjs apps/admin/test         PASS (0 above review threshold)
node tools/check-file-size.mjs packages/api-client/src PASS (0 above review threshold)
```

This report does **not** claim "0 warnings" for SCSS on the strength of that
tool. The SCSS numbers above come from `wc -l`.

---

## I. Focused runtime smoke

Live, through the Nginx gateway at `admin.embroidery.local`, against a dev
container restarted onto the split source. Style preservation only — the A02
create/edit/publish journey was not repeated, per §9.

```text
list    1440   PASS  table presented (desktop block / mobile none), cover 56x56,
                     entry cell flex, filter max-width 280px, header wraps,
                     row link href = /gallery/{id}, scrollWidth 1440 = clientWidth
list     390   PASS  cards presented (desktop none / mobile block), cover 72x72,
                     facts grid, title link 44px tall, scrollWidth 390 = clientWidth
editor  1440   PASS  two-column workspace, publication rail at its fixed measure,
                     authoring panel, ordered media rows with cover marker
editor   390   PASS  body stacks (flex-direction column), rail un-pinned,
                     widest element right edge 335 < 375, no horizontal overflow
picker  1440   PASS  vertical option card, full-width 132px image band, caption
                     on one line, dialog at its wide measure
picker   390   PASS  dialog 343px, single 295px grid column, label direction
                     column, thumb 277x132, no overflow
console        PASS  0 errors, 0 warnings across the whole run
```

Screenshots (git-ignored): `evidences/app_11/a02-c1/c1-list-1440.png`,
`c1-list-390.png`, `c1-editor-1440.png`, `c1-source-picker-1440.png`,
`c1-source-picker-390.png`.

The computed-style probes are the more precise evidence: `flex-direction`,
`display`, `max-width`, grid template and box sizes were read from the live DOM
and match the pre-split values exactly, which is what the byte-identical CSS
in §F predicts.

---

## J. Frozen artifacts

```text
apps/api                        untouched
apps/worker                     untouched
apps/storefront                 untouched
packages/database (migrations)  untouched — 37
packages/contracts (OpenAPI)    untouched — 116 / 128 / 252
packages/api-client/src/generated untouched
docs/design (Figma registry)    untouched
package.json (any)              untouched — no new dependency
```

Verified by filtering `git status --porcelain` against those prefixes:
`FROZEN ARTIFACTS UNTOUCHED`.

---

## K. Validation

```text
CHANGE_IMPACT
  Admin SCSS only. Two feature stylesheets split into 11 partials + 2 entries.
  Zero TS/TSX/test/route/copy/token change. Emitted CSS byte-identical.

TESTS_RUN
  npx tsc --noEmit -p apps/admin/tsconfig.json                      PASS
  pnpm --filter admin build (next build)                            PASS — 25 routes
  real Admin Sass compile (sass@1.101.3, app load path)             PASS
  compiled-CSS byte identity vs pre-split build chunk               PASS — md5 match
  jest gallery-editor-authoring / -media / -unsaved                 PASS
  jest gallery-create-and-list-actions                              PASS
  jest gallery-list-render (A01, list styles changed)               PASS
  jest gallery-editor-source / gallery-list-source (boundary)       PASS
  jest gallery-editor-model                                         PASS
    -> 8 suites, 176 tests, 0 failures
  prettier --check on all 13 gallery stylesheets                    PASS
  node tools/check-file-size.mjs (3 scopes)                         PASS
  manual wc -l SCSS audit                                           PASS — max 240
  no @import / no literal hex or rgb() in any partial               PASS
  live browser smoke at 1440 + 390                                  PASS
  git status / frozen-scope filter                                  PASS

TESTS_NOT_RUN
  full monorepo, full Admin suite, Storefront suite, API suite,
  worker suite, DB regression, full Playwright suite, APP11-E01,
  historical phase suites

WHY_NOT_RUN
  §11 forbids them, and the change cannot reach them. The two boundary suites
  already glob every .scss in each styles directory, so the new partials are
  covered by the existing token/prefix assertions without a test change. The
  decisive regression risk of a Sass split — a cascade or module-scope change —
  is closed by the byte-identical CSS in §F, which no broader Jest run could
  test, because component tests mock stylesheets.
```

**Follow-up raised.**

```text
FU-APP11-A02-C1-01  tools/check-file-size.mjs does not scan .scss, so stylesheet
                    violations pass silently. Eight Admin stylesheets outside
                    APP11 are over 400 lines today (product-placement 783,
                    product-form 753, custom-request-detail 712,
                    design-template-editor 676, customer-access-support 652,
                    assets 587, request-design-case 555, admin-shell 549) and
                    two more sit within 25 lines of it. Extending the checker is
                    out of scope here (tools/ is not in the C1 allowed-change
                    list, and the extension would immediately fail on debt this
                    correction may not touch). Owner: the SCSS gate checkpoint,
                    APP11-S01 (FU-APP10-E01-02).
```

---

## L. Git-authoritative files changed

```text
M  apps/admin/src/features/gallery-editor/styles/gallery-editor.scss     775 -> 38
A  apps/admin/src/features/gallery-editor/styles/_gallery-editor-layout.scss
A  apps/admin/src/features/gallery-editor/styles/_gallery-editor-actions.scss
A  apps/admin/src/features/gallery-editor/styles/_gallery-editor-feedback.scss
A  apps/admin/src/features/gallery-editor/styles/_gallery-editor-authoring.scss
A  apps/admin/src/features/gallery-editor/styles/_gallery-editor-media.scss
A  apps/admin/src/features/gallery-editor/styles/_gallery-editor-publication.scss
A  apps/admin/src/features/gallery-editor/styles/_gallery-editor-dialogs.scss
A  apps/admin/src/features/gallery-editor/styles/_gallery-editor-pickers.scss
M  apps/admin/src/features/gallery-list/styles/gallery-list.scss         526 -> 28
A  apps/admin/src/features/gallery-list/styles/_gallery-list-layout.scss
A  apps/admin/src/features/gallery-list/styles/_gallery-list-presentations.scss
A  apps/admin/src/features/gallery-list/styles/_gallery-list-states.scss
M  docs/implementation/phases/APP11-GALLERY-CONTENT-AND-SEO.md           A02-C1 row
M  docs/implementation/reports/APP11-A02-COMPLETION-REPORT.md            correction note
A  docs/implementation/reports/APP11-A02-C1-COMPLETION-REPORT.md         this file
```

`apps/admin/src/styles/main.scss` needed no change: both feature entries kept
their filenames, so the two `@use` lines that register them still resolve. The
"import wiring" allowance in §12 was not needed.

Nothing pushed. Nothing committed.

---

## M. Roadmap

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
APP11-S01      NEXT
APP11-S02      NOT STARTED
APP11-S03      NOT STARTED
APP11-S04      NOT STARTED
APP11-S05      NOT STARTED
APP11-E01      NOT STARTED
APP11-X01      NOT STARTED
```

Exactly one `NEXT`. `APP11-S01` not started.

---

## N. Acceptance criteria

```text
 1 gallery-editor.scss no longer 775                                    PASS  38
 2 every A02-owned/modified .scss <= 400                                PASS  max 240
 3 gallery-list.scss measured and split                                 PASS  526 -> 28 + 3 partials
 4 split semantic, not arbitrary/minified                               PASS  §E
 5 no visual/copy/layout behavior change                                PASS  §F byte-identical CSS
 6 list 1440 renders correctly                                          PASS
 7 list 390 renders, no overflow                                        PASS  scrollWidth == clientWidth
 8 editor 1440 renders correctly                                        PASS
 9 editor 390 renders, no overflow                                      PASS  scrollWidth == clientWidth
10 picker/dialog renders correctly                                      PASS  1440 and 390
11 real Admin Sass compile passes                                       PASS  §G
12 Admin production build passes                                        PASS  25 routes
13 A02 focused tests pass                                               PASS  8 suites / 176 tests
14 affected A01 render tests pass                                       PASS  gallery-list-render
15 TS/TSX/test hard limits still pass                                   PASS
16 no backend/worker/db/OpenAPI/generated/Figma/Storefront change        PASS  §J
17 OpenAPI 116/128/252                                                  PASS
18 migrations 37                                                        PASS
19 Admin routes 25                                                      PASS
20 no broad regression                                                  PASS  §K
21 roadmap A02/A02-C1 COMPLETE, one NEXT = S01                          PASS  §M
22 completion report exists                                             PASS  this file
23 no push                                                              PASS
```
