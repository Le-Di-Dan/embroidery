# APP12-G01 — Completion Report

**Checkpoint:** `APP12-G01` — Wave scope, release-exposure policy and
governance reconciliation
**Phase:** APP12 — Hardening, UAT and Production Readiness
**Type:** governance · documentation · test/gate reconciliation · non-runtime tooling
**Date:** 2026-09-01
**Branch:** `feat/app11-s04-seo-infrastructure` (entry `b695cf9d`)

---

## A. Verdict

```text
APP12-G01 = COMPLETE
CORRECTION_USED = 0 / 1
NEXT_CHECKPOINT = APP12-G02
```

---

## B. Locked roadmap confirmation

```text
ROADMAP_STATUS = LOCKED
ROADMAP_LOCK   = LOCKED
CHECKPOINTS    = 38   (unchanged)

added = 0   renamed = 0   merged = 0   split = 0   reordered = 0
```

Status table: `APP12-P01` `COMPLETE`, `APP12-G01` `COMPLETE`, `APP12-G02`
`NEXT`, 35 `NOT_STARTED`. 2 + 1 + 35 = 38, exactly one `NEXT`. No new
checkpoint ID was invented; every disposition below routes to an
already-locked checkpoint.

---

## C. Wave route ownership matrix

Delivered as §2 of the new authority document
[`../APP12-RELEASE-WAVE-AUTHORITY.md`](../APP12-RELEASE-WAVE-AUTHORITY.md).
Twenty-two Storefront route entries classified from
`apps/storefront/src/app/**`, each with existence, current reachability, wave,
audience, indexability, Wave-1 block decision, shared-infrastructure flag,
owner and evidence.

```text
WAVE1_PUBLIC            10   (incl. robots.txt + sitemap.xml)
WAVE1_SHARED_PRIMITIVE   2   /xac-minh-lien-he · /healthz
PRIVATE_SHARED           1   /truy-cap
WAVE2_CUSTOM             7   BLOCK IN WAVE 1
WAVE1_READY_MADE         2   NOT_RELEASED_YET (/mua-hang/[slug], /truy-cap/don-hang)
```

The single most important measured fact: **every existing route is reachable
today.** Nothing in the repository withholds anything, which is why `G02`
exists.

Two entries needed sub-rulings rather than a cell:

- **§2.1 `/san-pham/[slug]`** serves both waves. The page stays released
  (`APP12-S01` adds purchase state); the *personalisation CTA within it* is
  what must go. CTA suppression is `S01`'s and is explicitly **not** a
  substitute for blocking `/san-pham/[slug]/thiet-ke`.
- **§2.2 `/truy-cap`** must be gated by grant scope, not by path prefix.
  Blocking the prefix takes `/truy-cap/don-hang` — a Wave-1 surface — with it.

---

## D. Wave API ownership inventory

Mechanically inventoried from
`packages/contracts/openapi/openapi.generated.json`, not estimated:

```text
116 paths · 128 operations
  admin*    80
  public*   43
  staff*     3
  health*    2
```

Public exposure decision (authority doc §3):

```text
ALLOW  12  products 4 · gallery 3 · sitemap 1 · verification 4
DENY   31  placement 1 · side background 1 · templates 3 · sessions 6
           custom requests 4 · quotations 3 · design reviews 3
           deposit 5 · final payment 3 · shipping-fee ack 1
           secure-link resolve 1
```

12 + 31 = 43 = every public operation; each is classified, none is left
undecided.

Reserved for later checkpoints without inventing operation IDs: `B01`–`B05`
Ready-Made operations, `C01`/`C02` category operations.

---

## E. Release-exposure policy

Authority doc §4. Fail closed; enforced at **both** the route layer and the API
layer; configuration-driven; testable with one negative test per blocked route
and operation family; explicitly **not** navigation-only.

`APP12-G01` deliberately names **no** configuration key. Repository convention
does not make one canonical, and `IMP-D050` records what happens when four
lookalike variables coexist. `G02` selects the key, its withheld default and
its validation.

---

## F. Staff/Admin exposure policy

Authority doc §5. Admin is not blanket-blocked. Classified:

```text
WAVE1_OPERATOR_REQUIRED   login/shell/staff ops · products · SKUs · publication
                          gallery · categories (NOT_RELEASED_YET, C02/A01)
WAVE1_SHARED              assets · orders · payment verification · support
WAVE2_OPERATOR_ONLY       design templates/placement/background · custom requests
                          quotations · production jobs
                          → STAFF_ONLY_PRE_RELEASE
```

`STAFF_ONLY_PRE_RELEASE` is safe **because of** the customer-side gate: every
Wave-2 Admin surface acts on a custom request or custom order, and §3 denies
every custom customer entry point, so those surfaces have no reachable subject
in Wave 1. Stated as a dependency rather than an assumption — `G02` must verify
no Wave-2 Admin operation can create its own subject without a customer, and
`APP12-H01` re-audits it.

---

## G. SEO vs release-isolation distinction

```text
RELEASE_ISOLATION != SEO_ISOLATION
```

Authority doc §6, evidenced from the repository rather than asserted.
`ROBOTS_DISALLOW` already fences `/truy-cap`, `/xac-minh-lien-he`, `/yeu-cau`
and `/san-pham/*/thiet-ke`, and all four families also set
`robots: { index: false, follow: false }` — and **all of them work right now**.
Any visitor with the URL opens the Design Studio or submits a custom request.
Crawler exclusion is advisory metadata; it has never withheld anything.

Consequences recorded: `G02` denies server-side regardless of robots; and a
released Wave-1 surface may still be `noindex` (`/mua-hang`,
`/truy-cap/don-hang` — `APP12-H06` owns that metadata).

---

## H. G02 implementation authority

Authority doc §7 gives `G02` an exact block/allow list — 7 routes and 31
operations to block, the allow set including `publicVerification_*`
explicitly — plus four **must not** rules and the required evidence.

The one non-obvious input, recorded because a whole-operation denial written at
`G02` and never revisited would silently break Wave 1 (§3.2):

```text
publicSecureLink_resolve
  SecureLinkResolutionResponse today returns customRequestId and
  scopeKind whose only enum member is REQUEST_ACCESS — custom-only.

  at G02 (before DB01/B04):  DENY the whole operation
  after B04 ships ORDER_ACCESS: gate by scopeKind
                                ORDER_ACCESS   = ALLOW
                                REQUEST_ACCESS = DENY
```

`APP12-B04` must re-open it by scope or `/truy-cap/don-hang` cannot resolve.
Recorded in the authority doc §8 consuming-checkpoint table.

---

## I. Stale-spec classification

Evidence-based, from reading the test **and** the current implementation
authority — not from the follow-up label. All three were executed first; a
fourth failure the follow-ups never named was found and classified.

| Spec | Assertion | Class | Evidence |
|---|---|---|---|
| `zod-dto-publication.contract.spec.ts` | `keeps 19 paths and 23 operations` | `STALE_ASSERTION` | Ran: expected 19, received 116. The count is the endpoints shipped so far, so every checkpoint since APP3-P03 had to break it or edit a number. |
| `zod-dto-publication.contract.spec.ts` | `publicDesignSession_create publishes its fields` | `STALE_ASSERTION` — **not** a defect | Not named by any follow-up. `CreateDesignSessionBody` is a `oneOf` of two branches (`APP3-B06B`); both publish 4 and 5 fields with full `required`. The *sweep* reads only `properties` and so calls a correctly published union body empty. It is the repository's only union body. |
| `object-key.spec.ts` | SVG rejected (2 assertions) | `SUPERSEDED_TEST_AUTHORITY` | `packages/object-storage/src/object-key.ts:24-32` maps `image/svg+xml → svg` for the sanitized Template SVG derivative, `APP3-W01B` / `IMP-D047`. The test asserts a world that decision replaced. |
| `product-placement.contract.spec.ts` | no path contains `/background` | `SUPERSEDED_TEST_AUTHORITY` | `/api/admin/products/{productId}/sides/{sideId}/background` exists as `APP3-B02A`, with its own contract gate `catalog/admin-side-background.spec.ts`. |

```text
REAL_DEFECT = 0        ENVIRONMENT_DEPENDENT = 0
ACTIVE_RELEASE_GATE = 0 (none of the four assertions gates a release)
```

No runtime source was changed to satisfy any of them.

---

## J. Stale-spec corrections

Each replacement is derived from accepted authority, not from current
incidental output.

**1. `apps/api/src/platform/openapi/zod-dto-publication.contract.spec.ts`**

The count assertion did **not** become `116 paths / 128 operations`. The
`describe` guards that the publication mechanism emits a *coherent* document, so
the replacement asserts what survives growth:

- operations ≥ paths;
- **every** operation carries an `operationId` (an unidentified one publishes no
  client method — the exact failure this file exists to prevent);
- **no duplicate id** (a duplicate silently overwrites a generated client method);
- every id matches the locked `<domain>_<method>` form (`APP0-B05`).

A new endpoint no longer breaks it; a corrupt document still does.

The union sweep gained `publishedPropertySets()`, which resolves
`oneOf`/`anyOf`/`allOf` branches. The invariant is **strengthened**, not
loosened: every branch must publish fields, so an empty branch is still caught.
Applied to the nested-component sweep as well.

**2. `packages/object-storage/test/unit/object-key.spec.ts`**

`image/svg+xml` left the rejected list, and the "rejects SVG explicitly" test
became a positive assertion of the current authority — SVG maps to `.svg` on a
`TEMPLATE_SANITIZED` **derivative** key. What the original protected is kept and
made explicit by a new test asserting the allowlist **exactly**
(`image/jpeg`, `image/png`, `image/svg+xml`, `image/webp`), so a format still
cannot enter without a decision. Twelve other rejection cases are untouched.

**3. `apps/api/src/modules/catalog/presentation/product-placement.contract.spec.ts`**

The emptiness sweep became an authority-anchored allowlist naming both
background-delivery routes and their owning checkpoints (`APP3-B02`,
`APP3-B02A`). The real invariant is preserved and now stated in the test name:
placement is one whole-document resource per audience, so no Side or Area is
separately addressable — a *new* `/sides/` or `/areas/` path still fails until
it is named.

`/templates` and `/sessions` were dropped from the loop. They were passing by
accident: the real paths are `design-templates` and `design-sessions`, which do
not contain those substrings. Asserting a truth by luck is worse than not
asserting it, and both families legitimately exist since `APP3-B05`/`B06B`.

```text
tests deleted = 0        tests weakened = 0
runtime changed = 0      assertions added = 5
```

---

## K. File-size governance

Limits unchanged and not relaxed: **400/600 hard, 300/500 review**; SCSS is
runtime source; `tools/**` keeps the §5.1 bounded soft caps (450/700), with the
tool reporting 400/600 and §5.1 governing the response.

Active APP12 rule, locked in `VALIDATION_GOVERNANCE.md` §3A.2:

```text
ANY NEW OR MODIFIED APP12-IMPACTED SOURCE FILE
must satisfy the hard limit before checkpoint PASS.
```

- A touched existing over-limit file must be split by the touching checkpoint
  before PASS, unless the Product Owner grants a recorded exception.
- Untouched historical violations do **not** block an unrelated checkpoint.
- They are **not** declared compliant. Measured at `APP12-G01`:

```text
repository-wide sweep = 80 hard-limit violations, 214 review warnings
                        77 of the violations in tools/ scripts
```

(The APP11 record said 79; the current measured value is 80.)

### K.1 Tooling reconciliation

`tools/check-file-size.mjs` gained a **scoped mode**; the repository-wide sweep
is byte-for-byte unchanged in behaviour, proven by its six original tests still
passing.

```text
node tools/check-file-size.mjs --paths <path> [path...]
```

- measures `.ts/.tsx/.js/.jsx/.mjs/.cjs` **and `.scss`** — one command for a
  mixed change;
- directories recurse; duplicates measured once; build output skipped;
- a **missing path fails** rather than passing silently;
- reports hard failure, review warning, path, line count and file class;
- never sweeps the tree, so it inherits none of the 80 historical violations —
  which is exactly what makes it usable as a gate.

Why not widen the default scan: the `APP11-S01` reasoning still holds and is
preserved verbatim — teaching the repository-wide sweep to read `.scss` would
make it start failing on debt no current change introduced
(`design-studio.scss` is 1876 lines). Scoped mode has no such exposure.

`CMD-CHECK-FILE-SIZE`'s index row was corrected: it advertised "any touched
production/test source file" while offering only a repository-wide invocation
that cannot exit 0 — the exact ambiguity `FU-APP11-B01-C1-02` names. It is now
documented as a measurement, not a gate, with `CMD-CHECK-FILE-SIZE-SCOPED` as
the checkpoint gate.

No historical file was refactored. No runtime source was touched.

---

## L. SCSS governance

- SCSS is **runtime source** for size governance (CLAUDE.md §6) — now stated in
  `VALIDATION_GOVERNANCE.md` §3A.2 and enforceable through one scoped command.
- The size check is **not** a Sass compile. The APP11 precedent stands: **any
  checkpoint that modifies SCSS must run a real compile**, because `next/jest`
  mocks SCSS and no Jest suite can see a Sass error (`FU-APP10-E01-02`, six
  fatal defects that took both apps down).

```text
node tools/check-app-scss.mjs storefront     CMD-CHECK-APP-SCSS-STOREFRONT
node tools/check-app-scss.mjs admin          CMD-CHECK-APP-SCSS-ADMIN
```

A `packages/styles` change runs **both**. A checkpoint with no SCSS change does
not run a compile unless a release gate requires it. `CMD-CHECK-SCSS-FILE-SIZE`
stays canonical for an SCSS-only directory sweep; the two size gates agree on
400/300.

---

## M. Scoped command authority

`VALIDATION_GOVERNANCE.md` §3A.1 adds the APP12 change-type table — 13 change
types × required / conditional / **forbidden** — refining §3 without replacing
it and introducing no aggregate. §3A.3 adds the release-gate test
classification (`CHECKPOINT_CHANGE_IMPACT`, `WAVE1_RELEASE_GATE`,
`WAVE2_RELEASE_GATE`, `HISTORICAL_EVIDENCE_ONLY`, `STALE`/`SUPERSEDED`), with
`E01`/`W04` as the bounded cross-boundary authorities and `R01`/`R02` consuming
accepted evidence. No full-repository run is declared a release gate.

`SCOPED_COMMAND_INDEX.md` gains `CMD-CHECK-FILE-SIZE-SCOPED` and
`CMD-TEST-FILE-SIZE-TOOLING`, and corrects `CMD-CHECK-FILE-SIZE` and
`CMD-CHECK-SCSS-FILE-SIZE`.

**Registry drift.** `FIGMA_DESIGN_INDEX.md` §1 and `FIGMA_ARCHITECTURE.md`
advertised the gate as `pnpm check:figma-design-index` "in `pnpm quality`" —
both deleted by `GOV-Q01-C1`. Corrected to the direct invocation
`node tools/check-figma-design-index.mjs` with its command ID. **No deleted
aggregate was resurrected and no new root script was added**; root
`package.json` is unchanged at 30 scripts. Remaining `pnpm quality` mentions are
historical audit and phase records, which correctly preserve what was run at the
time (`07-TESTING-AND-ACCEPTANCE-GATES.md` §121 already carries the standing
note).

---

## N. Route-authority dynamic-category routing

```text
tools/check-storefront-route-authority.mjs
  EXPECTED.categorySlugs = ['thu-bong', 'khan', 'quan-ao', 'khac']
  disposition = TEMPORARILY_STALE_AGAINST_LOCKED_APP12_TARGET
  owner       = APP12-C03
```

Measured, not assumed: the gate exits **1** today, on
`✗ IMP-D038 is not LOCKED`. It is a docs-consistency gate asserting the register
row reads exactly `LOCKED`, and `APP12-P01` legitimately changed that cell to
`LOCKED — CATEGORY VALUE-SET CLAUSE SUPERSEDED IN PART BY IMP-D059`. The gate is
failing **because accepted authority moved**, not because anything is broken.

`APP12-G01` changed neither the tool nor Product/Discover runtime. The
governance record now says what the tool is, so it is not misrepresented as a
future-compatible authority before `C03` reconciles it.

---

## O. Follow-up reconciliation

| ID | Status | Owner | Evidence | Blocks G01 | Blocks R01 |
|---|---|---|---|---|---|
| `FU-APP11-B01-02` | **CLOSED** | `APP12-G01` | §J.1 — count assertion replaced by identity/uniqueness/convention invariants; 98 tests pass | no | no |
| `FU-APP11-B03A-04` | **CLOSED** | `APP12-G01` | §J.2 — SVG expectations reconciled to `IMP-D047`; allowlist now asserted exactly; 46 tests pass | no | no |
| `FU-APP11-B04-01` | **CLOSED** | `APP12-G01` | §J.3 — APP3-era sweep replaced by an authority-anchored allowlist; 24 tests pass | no | no |
| `FU-APP11-B01-C1-02` | **CLOSED** | `APP12-G01` | §K.1 — `CMD-CHECK-FILE-SIZE-SCOPED`; the gate can now fail a checkpoint that adds a violation without demanding 80 unrelated refactors | no | no |
| `FU-APP11-B04-02` | **CLOSED — duplicate** | `APP12-G01` | Same defect and same fix as `B01-C1-02`; closed with it | no | no |
| `FU-APP11-A02-C1-01` | **CLOSED** | `APP12-G01` | §K.1/§L — `.scss` is measured by the scoped gate; SCSS is stated as runtime source in §3A.2 | no | no |
| `FU-APP11-G01-06` | **CLOSED** | `APP12-G01` | §M — both registry docs corrected to the direct invocation; no aggregate resurrected | no | no |
| `FU-APP11-S01-03` | **OPEN — INTENTIONAL_LIMITATION** | dev-environment docs | §O.1 | no | no |
| `FU-APP11-S01-04` | **ROUTED → `APP12-H02`** | `APP12-H02` | §O.2 — **re-routed on new evidence** | no | **yes** |
| `FU-APP11-A01-04` | **ROUTED → `APP12-H02`** | `APP12-H02` | §O.3 | no | yes |

```text
closed = 7    routed = 2    open_nonblocking = 1    blocking_for_G01 = 0
```

### O.1 `FU-APP11-S01-03` — Turbopack SCSS partial hot-reload

```text
NONBLOCKING_DEVELOPMENT_TOOLING_LIMITATION
```

Not closed as fixed — no tool or runtime evidence proves it fixed, and `G01`
neither rewrote nor could rewrite Turbopack. Production correctness is
unaffected: the deployed applications compile SCSS at build time, and the real
compile gate (§L) sees every partial regardless of dev-server behaviour.

Deterministic developer recovery: restart or rebuild the affected development
app, or run `node tools/check-app-scss.mjs <storefront|admin>` to compile for
real and see the true result. No later owner is assigned, because production
correctness is not affected.

### O.2 `FU-APP11-S01-04` — Sass `slash-div` — routed to H02, not W03

The prompt's default routing is `APP12-W03`, on the premise that the expression
affects only a Wave-2 custom surface. **Measured evidence contradicts that
premise**, so the §16 alternative applies.

`$preview-ratio: 4 / 3;` at `secure-design-review.scss:43` is APP6-owned and its
*screen* is Wave-2. But the stylesheet is `@use`d from
`apps/storefront/src/styles/main.scss:27` — the single global Storefront bundle
compiled for **every** page, Wave 1 included:

```text
node tools/check-app-scss.mjs storefront
  → PASS, 139572 bytes CSS, 1 deprecation warning
```

Exactly one deprecation in the whole Wave-1 bundle, and this is it. `slash-div`
is removed in Dart Sass 2.0 (`sass ^1.83.0` today), so that major would fail the
Storefront production build outright — Wave-1 pages and all. That is build
reproducibility, which `APP12-H02` owns.

`APP12-G01` changed no runtime SCSS. Blocking for `R01` only in the sense that
`H02` must resolve it before the Wave-1 release gate; it blocks nothing now.

### O.3 `FU-APP11-A01-04` — stale dev API image

```text
owner = APP12-H02   (production/staging deployment and build reproducibility)
```

Confirmed routed. No Docker image was rebuilt and no Docker command was run —
classification needed none.

### O.4 New observation — not a follow-up, no owner invented

`packages/object-storage/src/object-key.ts:23` still reads "The closed raster
allowlist. SVG and everything else are rejected (ADR §4.6)", which `APP3-W01B`
made untrue in the same file that now maps `image/svg+xml → svg` eleven lines
below. Documentation drift **inside runtime source**, so §25 forbids `G01` from
touching it. Non-blocking and remediable by any checkpoint that next touches the
file. Recorded rather than silently fixed or silently ignored.

---

## P. Files changed

**Created (2)**

```text
docs/implementation/APP12-RELEASE-WAVE-AUTHORITY.md
docs/implementation/reports/APP12-G01-COMPLETION-REPORT.md
```

**Modified — governance/docs (6)**

```text
docs/implementation/VALIDATION_GOVERNANCE.md              +§3A (3A.1/3A.2/3A.3)
docs/implementation/SCOPED_COMMAND_INDEX.md               +2 rows, 2 corrected
docs/implementation/phases/APP12-...-READINESS.md         +§0.5a, status, NEXT
docs/implementation/10-MASTER-APPLICATION-ROADMAP.md      APP12 row
docs/design/FIGMA_DESIGN_INDEX.md                         gate command drift
docs/design/FIGMA_ARCHITECTURE.md                         gate command drift
```

**Modified — non-runtime tooling (2)**

```text
tools/check-file-size.mjs           152 → 290 lines   scoped mode
tools/check-file-size.test.mjs       92 → 163 lines   7 new tests
```

**Modified — test source (3)**

```text
apps/api/src/platform/openapi/zod-dto-publication.contract.spec.ts
apps/api/src/modules/catalog/presentation/product-placement.contract.spec.ts
packages/object-storage/test/unit/object-key.spec.ts
```

`tools/check-file-size.mjs` is a repository validation tool: it is imported by
no application, is not in any workspace `dependencies`, and executes only as a
CLI or from its own test file. Both tooling files sit inside the §5.1 soft caps
(450/700) and inside the 400/600 hard limits.

---

## Q. Validation run / not run

**Run — change-impact only**

| Command | Result |
|---|---|
| `git diff --check` | clean |
| `npx jest src/platform/openapi/ product-placement.contract.spec.ts admin-side-background.spec.ts` (`@embroidery/api`) | **5 suites, 197 tests, PASS** — the smallest enclosing suites for both corrected API specs, plus `APP3-B02A`'s own gate |
| `npx jest` (`@embroidery/object-storage`) | **5 suites, 150 tests, PASS** |
| `node --test tools/check-file-size.test.mjs tools/check-scss-file-size.test.mjs tools/check-app-scss.test.mjs` | **31 tests, PASS** — 13 file-size (6 pre-existing unchanged + 7 new), plus both SCSS tools |
| `node tools/check-file-size.mjs --paths` (5 changed files) | PASS — 5 files, 0 above review threshold |
| `node tools/check-file-size.mjs` (repo-wide) | 80 violations / 214 warnings — **measurement**, recorded in §K, not a gate |
| `node tools/check-figma-design-index.mjs` | PASS — 532 IDs, 532 rows, 23 tables (edited registry header) |
| `node tools/check-report-secrets.mjs` | EXIT 1 — **pre-existing, not G01**. Two findings, both in committed historical reports (`APP6-B04`, `APP9-G01`); **zero** in any APP12 file. Reported rather than omitted. |
| `npx tsc --noEmit` (`@embroidery/api`) | EXIT 0 |
| `npx tsc --noEmit` (`@embroidery/object-storage`) | EXIT 0 |
| `npx eslint` on both corrected API specs | EXIT 0 |
| `npx prettier --write` on all 5 changed code files | all unchanged (already conformant) |
| `node tools/check-app-scss.mjs storefront` | PASS, 1 deprecation — **evidence for §O.2**, not a G01 gate (no SCSS was modified) |
| `node tools/check-storefront-route-authority.mjs` | EXIT 1 — **evidence for §N**, expected and routed |

Baseline failures were captured **before** correction, so every disposition
rests on an observed failure rather than a label:
`19 vs 116 paths`; `publicDesignSession_create` 0 properties;
`image/svg+xml` did not throw ×2; `/api/admin/products/{productId}/sides/{sideId}/background`
present.

**Not run, and why**

Full monorepo, full API/Admin/Storefront/worker suites, full Playwright,
performance, UAT, production build, Docker rebuild, Figma live, OpenAPI or
client generation. No change justifies any of them: no runtime, contract,
schema, stylesheet or Figma input was touched, and every modified test and tool
has a smaller authoritative suite that was run instead.

`npx eslint tools/*.mjs` is **not** reported as passing: the repository root has
no ESLint configuration, so `tools/**` is Prettier-covered but outside ESLint's
scope. Pre-existing, and stated rather than glossed.

---

## R. Runtime freeze

```text
runtime_changed        = false
DB_changed             = false
OpenAPI_changed        = false
generated_client_changed = false
Figma_changed          = false
business_data_changed  = false
```

Also unchanged: `apps/**` runtime source (only three `*.spec.ts` files under
`apps/api/src` were edited), business package runtime source, migrations, SCSS
runtime source, category data, Product data, Docker images, Kubernetes,
monitoring, feature flags/release gates, UAT fixtures, and root `package.json`
(still 30 scripts). No release gate was implemented. No push.

---

## S. Roadmap

```text
APP12-P01  COMPLETE
APP12-G01  COMPLETE
APP12-G02  NEXT          Wave-2 release isolation gate
remaining  NOT_STARTED   (35)

CHECKPOINTS = 38   ROADMAP_LOCK = LOCKED
WAVE_1_GO = NOT_DECLARED   WAVE_2_GO = NOT_DECLARED
```

`APP12-G02` is next because §7 of the authority document is its direct and
complete input. `G02` was not started.
