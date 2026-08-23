# APP7-A01-C1 — Correction Report

## Split the Oversized Runtime Stylesheet Without Behaviour Change

- Phase: `APP7 — Deposit Payment and Order Creation`
- Checkpoint: `APP7-A01-C1`
- Parent: `APP7-A01`
- Mode: `NARROW FRONTEND STRUCTURE CORRECTION`
- Correction budget: `1 / 1`
- Date: 2026-08-24

---

## 1. Verdict

```text
APP7-A01-C1 = COMPLETE
APP7-A01 = COMPLETE — CORRECTED (C1)
APP7-A01-C2 = MUST_NOT_BE_CREATED

DEFECT =
  A01_RUNTIME_STYLESHEET_EXCEEDED_400_LINE_HARD_LIMIT

ORIGINAL_FILE =
  apps/admin/src/features/order-detail/styles/order-detail.scss
ORIGINAL_LINES = 869

FINAL_STYLE_MODULES =
  apps/admin/src/features/order-detail/styles/order-detail.scss                   33
  apps/admin/src/features/order-detail/styles/_order-detail-layout.scss          154
  apps/admin/src/features/order-detail/styles/_order-detail-cards.scss           149
  apps/admin/src/features/order-detail/styles/_order-tables.scss                 100
  apps/admin/src/features/order-detail/styles/_order-payment-workbench.scss      176
  apps/admin/src/features/order-detail/styles/_order-payment-dialogs.scss        217
  apps/admin/src/features/order-detail/styles/_order-payment-outcome.scss        128

MAX_A01_RUNTIME_SOURCE_LINES = 377   (order-queue.scss — unchanged by C1)
MAX_A01_TEST_LINES = 312             (order-payment-verify.test.tsx — unchanged by C1)

VISUAL_BEHAVIOR_CHANGE = NONE        (proved: compiled CSS byte-for-byte identical)
BUSINESS_BEHAVIOR_CHANGE = NONE
API_CLIENT_BEHAVIOR_CHANGE = NONE

BACKEND_CHANGE = NONE
OPENAPI_CHANGE = NONE
SCHEMA_CHANGE = NONE
MIGRATION_CHANGE = NONE
FIGMA_CHANGE = NONE

SASS_COMPILE_PROOF = PASS
FOCUSED_UI_TESTS = 4 suites / 52 tests — PASS
BROAD_REGRESSION = NOT_RUN_BY_DESIGN

NEXT_CHECKPOINT = APP7-S01
```

The Product Owner's ruling is accepted without qualification: a runtime SCSS
stylesheet is application source, and the pre-existing oversized Admin
stylesheets are historical debt that authorise nothing. The A01 report flagged
`869` as a high-water mark and proposed a split; this correction performs it.

---

## 2. What changed, and what deliberately did not

Only the one stylesheet was touched. `main.scss` is **unchanged**: the feature
still exposes exactly one entry, `order-detail.scss`, at the same path the Admin
styling architecture already loaded, so no new global import was added.

```text
M  apps/admin/src/features/order-detail/styles/order-detail.scss   869 → 33 (now a composition)
A  apps/admin/src/features/order-detail/styles/_order-detail-layout.scss
A  apps/admin/src/features/order-detail/styles/_order-detail-cards.scss
A  apps/admin/src/features/order-detail/styles/_order-tables.scss
A  apps/admin/src/features/order-detail/styles/_order-payment-workbench.scss
A  apps/admin/src/features/order-detail/styles/_order-payment-dialogs.scss
A  apps/admin/src/features/order-detail/styles/_order-payment-outcome.scss
```

No `.ts`, `.tsx`, test, document, generated, backend, contract, database or
Figma artifact was modified. No token layer was created; no selector was
duplicated, renamed, merged or given a specificity override; no declaration was
added or removed.

---

## 3. Split rationale — by visual responsibility, not by line number

The original file already carried ten banner-delimited sections. The cut follows
those banners and groups them by what they actually style, and the partials are
listed in the entry in the **same order the rules were written**, because that
order is the cascade.

| Partial | Sections it owns | Responsibility |
|---|---|---|
| `_order-detail-layout.scss` | page shell | The outermost frame of `734:3`: header row, frozen/payment column split, page-level loading and failure states, and the button treatment those states share. Owns the feature's only two layout thresholds. Loaded first so everything cascades over it. |
| `_order-detail-cards.scss` | cards | The surface every panel is built from: card box, title, help, note, definition list, badge rows, read-only expected block, `REQUIRES_REVIEW` banner (`734:34`, `734:109`, `741:3`). Shared by both columns, so it sits between the layout and the panels that consume it. |
| `_order-tables.scss` | frozen order lines | The **base rule shared by all three tables** on the screen, plus the frozen order-line specifics (`734:64`). |
| `_order-payment-workbench.scss` | attempts · evidence · history | The three read-only surfaces of `adminOrderPayment_read` in render order (`734:128`, `736:149`, `743:3`, `743:35`), including the long-value reveal a bank memo needs. |
| `_order-payment-dialogs.scss` | dialogs · fields | The modal shell, scrim and action row shared by verify, review and the lightbox (`737:3`, `740:111`, `742:3`), plus the decision-form field treatment (`737:27`, `740:119`). |
| `_order-payment-outcome.scss` | outcome · comparison · preview | What a settled or in-flight decision looks like (`740:3`, `740:56`, `741:51`, `741:87`), the expected-vs-observed comparison beside it, and the evidence preview stage. Loaded last, sitting on top of the dialog shell it renders inside. |

**The one judgement worth stating.** The three tables — frozen order lines,
reconciliation history and the expected-vs-observed comparison — share a single
base selector list:

```scss
.order-items,
.order-history,
.order-comparison__table { … }
```

A tidy-looking "one partial per table" split would have had to duplicate that
list across three files, which §3 of the directive explicitly forbids and which
would have been the exact defect this correction exists to avoid creating. So the
base stays in `_order-tables.scss`, emitted before all three consumers, and the
history and comparison specifics live with the panels they belong to. The file's
own header says so, so the next person does not "fix" it.

---

## 4. Sass composition graph

```text
apps/admin/src/styles/main.scss                    (unchanged)
└── @use '../features/order-detail/styles/order-detail'
    ├── @use 'order-detail-layout'        ─┐
    ├── @use 'order-detail-cards'          │  emitted in this order;
    ├── @use 'order-tables'                │  the order IS the cascade
    ├── @use 'order-payment-workbench'     │
    ├── @use 'order-payment-dialogs'       │
    └── @use 'order-payment-outcome'      ─┘
```

Each partial carries its own `@use '@embroidery/styles' as styles;` — `@use` is
file-scoped, and this is the current Sass module convention the repository
already follows. The shared foundation is loaded once and emitted once regardless
of how many partials reference it.

The two layout thresholds (`$order-detail-stack`, `$order-detail-frozen-column`)
were verified to be referenced only within the layout section before the cut, so
they move with it and no cross-partial variable dependency was created.

---

## 5. Proof that nothing visual changed

The strongest available evidence, rather than an assurance: the canonical Admin
stylesheet entry was compiled **before** the split and **after** it, and the two
outputs were diffed.

```text
before: 8669 lines of CSS
after:  8669 lines of CSS
diff:   IDENTICAL — byte-for-byte
```

Not "equivalent", not "visually indistinguishable" — the emitted CSS is the same
bytes. Every selector, declaration, media query, and crucially every rule's
**position in the cascade**, is unchanged. That is what makes
`VISUAL_BEHAVIOR_CHANGE = NONE` a measurement rather than a claim.

`main.scss` compiles the whole Admin surface, so the diff also proves no other
feature's styles were disturbed.

**How it was compiled.** No committed Sass-compile script exists, and adding one
would be scope expansion, so §7 option 2 applies: direct compilation of the
canonical entry with the workspace's own installed `sass`. `main.scss` imports
`@embroidery/styles` as a bare package specifier, which Next resolves through
webpack; the Sass CLI has no equivalent, so a throwaway harness supplied that one
mapping. It ran from the `apps/admin` workspace (for `sass` resolution) and was
deleted afterwards — it is **not** in the repository. Reproduced in full so the
proof is repeatable:

```js
import { pathToFileURL } from 'node:url';
import { compile } from 'sass';

const [entry, packageRoot] = process.argv.slice(2);
const stylesEntry = pathToFileURL(`${packageRoot}/packages/styles/src/index.scss`);

const result = compile(entry, {
  quietDeps: true,
  importers: [{ findFileUrl: (url) => (url === '@embroidery/styles' ? stylesEntry : null) }],
});

process.stdout.write(result.css);
```

Run once per side (before / after) against changed input. Not re-run afterwards.

---

## 6. File-size evidence

The repository **has** a file-size gate — `tools/check-file-size.mjs` (D-032,
`CLAUDE.md` §6) — and it was used rather than a hand count for TS/TSX.

```text
node tools/check-file-size.mjs
→ 79 hard-limit violation(s)
→ A01-owned files among them: ZERO

Baseline at the APP7-A01 commit (C1 stashed): 79 violation(s)
After C1:                                     79 violation(s)
```

The 79 are pre-existing `tools/**` and historical app files, unchanged in count
and identity by this correction, and outside A01's change impact (§5, §6). A01
contributes none of them.

**A finding the Product Owner should see.** That gate scans
`['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']` only — `.scss` is **not** in
`SCANNED_EXTENSIONS`. That is why an 869-line stylesheet never tripped it, and
why the historical 783/753/712-line stylesheets exist unchallenged. The ruling in
this directive — that a runtime stylesheet is application source under §6 — is
therefore stricter than what the repository currently automates. Bringing the
checker in line would immediately fail at least four historical stylesheets, so
it is deliberately **not** done here (§5 forbids turning C1 into a repository-wide
cleanup). It is raised as a decision for the Product Owner, not actioned.

SCSS was therefore proved by deterministic line count:

```text
order-detail.scss                  33   ✓
_order-detail-layout.scss         154   ✓
_order-detail-cards.scss          149   ✓
_order-tables.scss                100   ✓
_order-payment-workbench.scss     176   ✓
_order-payment-dialogs.scss       217   ✓
_order-payment-outcome.scss       128   ✓

Largest A01 runtime source of any kind:  377  (order-queue.scss, untouched)
Largest A01 test:                        312  (order-payment-verify.test.tsx, untouched)
```

Every A01 runtime source file is ≤ 400 and every A01 test is ≤ 600.

---

## 7. Focused command ledger

| Command | Scope | Result |
|---|---|---|
| Direct Sass compile of `src/styles/main.scss`, before and after | Sass module resolution + cascade | **PASS** — compiled CSS byte-for-byte identical |
| `pnpm --filter @embroidery/admin test -- order-detail-render order-payment-panel order-payment-verify order-evidence-preview` | component/import regression | **PASS** — 4 suites, 52 tests |
| `node tools/check-file-size.mjs` | A01 changed-set isolated | **PASS for A01** — 0 A01 violations; 79 pre-existing, identical before and after |
| `node tools/check-styling-boundaries.mjs` (`CMD-CHECK-STYLES`) | scoped styling gate for any SCSS change | **PASS for A01** — 0 `apps/admin` violations; 14 pre-existing `apps/storefront` violations, identical before and after (verified by stashing C1) |
| `npx prettier --check <the 7 stylesheets>` | changed files | **PASS** |
| `git diff --check` | whitespace | clean |

**Honest limits on what the tests prove.** `next/jest` stubs SCSS, so the four
component suites observe **no CSS at all**. They are here to prove that the
components still mount and compose after the styling change — an import/render
regression check — and nothing more. The visual equivalence claim rests entirely
on the byte-identical CSS diff in §5, which is why that proof was taken.

Deliberately **not** run, per §9: `pnpm quality`, `quality:e2e`, the full Jest or
Admin suite, Playwright, backend API tests, `B02`/`B04`/`B06`, OpenAPI
generation or check, database gates, worker, SonarQube, and the Figma index
checker — the D01 approval registry did not change.

`apps/admin typecheck` was **not** run: §9 gates it on imports or source modules
changing, and no `.ts`/`.tsx` file was touched. No component imports these
stylesheets directly; the single global entry does. **Changed-file ESLint** is
not applicable — the ESLint configuration matches TS/TSX, and invoking it on a
`.scss` file returns a no-matching-configuration warning with zero errors rather
than a meaningful result.

No PASS was re-run against unchanged input.

---

## 8. Frozen A01 behaviour — untouched

Nothing in the accepted parent surface changed. No `.ts`/`.tsx` file was edited,
so all of it is unchanged by construction:

```text
39/39 D01 rows APPROVED_FOR_IMPLEMENTATION · FIG-APPROVAL-APP7-D01-PO-001
/orders · /orders/{orderId}
queue filter and cursor behaviour · frozen order detail · DEPOSIT payment panel
Verify · Review · REQUIRES_REVIEW resolution
network-ambiguity reconciliation · stale/concurrent refresh
evidence metadata · B06 preview by evidenceId · Blob URL cleanup
zero-evidence verification · expected-vs-observed separation
unrestricted observedTransferReference · accessibility · status vocabulary
query keys and invalidation · curated api-client exports
```

---

## 9. Commits

```text
2fef976  refactor(app7): split the oversized order-detail stylesheet (APP7-A01-C1)
         apps/admin/src/features/order-detail/styles/order-detail.scss        (869 → 33)
         apps/admin/src/features/order-detail/styles/_order-detail-layout.scss     (new)
         apps/admin/src/features/order-detail/styles/_order-detail-cards.scss      (new)
         apps/admin/src/features/order-detail/styles/_order-tables.scss            (new)
         apps/admin/src/features/order-detail/styles/_order-payment-workbench.scss (new)
         apps/admin/src/features/order-detail/styles/_order-payment-dialogs.scss   (new)
         apps/admin/src/features/order-detail/styles/_order-payment-outcome.scss   (new)
         docs/implementation/reports/APP7-A01-C1-CORRECTION-REPORT.md              (new)
         docs/implementation/phases/APP7-DEPOSIT-PAYMENT-AND-ORDER-CREATION.md
         docs/implementation/10-MASTER-APPLICATION-ROADMAP.md

NOT_PUSHED = true
```

One commit: the split and its evidence are a single reviewable change, and the
parent A01 commits (`a3956fd`, `2907b2d`) are untouched.

No predecessor commit was amended; `APP7-A01`'s two commits stand unchanged.

---

## 10. Next

```text
APP7-A01 = COMPLETE — CORRECTED (C1)
APP7-A01-C2 = MUST_NOT_BE_CREATED
NEXT_CHECKPOINT = APP7-S01
```

`APP7-S01` was not started.
