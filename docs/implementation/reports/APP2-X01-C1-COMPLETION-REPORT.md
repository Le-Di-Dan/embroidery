# APP2-X01-C1 — Completion report

**Checkpoint:** `APP2-X01-C1` — Scope the APP2 Figma closure baseline
**Verdict:** `COMPLETE — REVIEW_ACCEPTED` (human review 2026-08-03) · **Date:** 2026-08-03
**Delivered on:** `docs/brd0-logo-system-concept03` · **Entry HEAD:** `1216e981329f2cad86be6369c2ecc84c2a34a3e6`
**Integrated to `production`** by `APP3-ENTRY-BRANCH-RECONCILIATION` (§M)

---

## A. Verdict

`COMPLETE — REVIEW_ACCEPTED`. Human review 2026-08-03 passed the technical
mechanism and accepted the `check-app2-closure-artifacts.mjs` scope departure as
an `APPROVED_NARROW_SCOPE_DEVIATION` (§E).

The APP2 closure gate froze the **global total** of a shared, appendable
document. That is now replaced by verification of the **records APP2 actually
owned**. `pnpm quality` is green, `FU-APP3-CLOSURE-FIGMA-BASELINE-01` is closed,
and `APP3-G01` is unblocked.

## B. Entry state, read from Git

| Fact | Value |
|---|---|
| Branch | `docs/brd0-logo-system-concept03` |
| Entry HEAD | `1216e981329f2cad86be6369c2ecc84c2a34a3e6` — `docs(app3): reconcile pre-implementation audit review` |
| Tracked/staged tree at entry | clean |
| APP2 closure source commit | `8b5f3b0279b1920babd05b52014af3b853f526c0` — `docs(app2): record phase closure evidence` |
| BRD0 addition commit | `2a5d3bf787dbbb352ce13875a8cc8fc5c936e27b` — `docs(brd0): register logo system exploration and Concept 03 productionization` (1 file, `docs/design/FIGMA_DESIGN_INDEX.md`, +72/−2) |
| Registry at closure | 86 registry IDs / 86 node rows / **11 node tables**, across 10 sections |
| Registry at entry | 96 registry IDs / 96 node rows / **13 node tables** |
| Owned-record drift at entry | **0** — all 86 present, unique, same section, identical authority fields |

At the time this checkpoint ran, `production` was at `5c0ba1f` and this branch
carried the APP3 audit commits, the BRD0 commit and this correction. That was
resolved by `APP3-ENTRY-BRANCH-RECONCILIATION`, which fast-forwarded `production`
to `82ed3f3` (§M). Nothing was pushed.

### The ten added IDs are BRD0 brand authority, not APP2 application authority

Verified by diffing the parsed registry at `8b5f3b0` against `HEAD`:

```text
FIG-BRD0-LOGO-SYSTEM-PAGE            4.6 BRD0 — Logo System Exploration
FIG-BRD0-PREFLIGHT-TOKEN-LEGEND      4.6 BRD0 — Logo System Exploration
FIG-BRD0-C1-CONTINUOUS-THREAD        4.6 BRD0 — Logo System Exploration
FIG-BRD0-C2-ABSTRACT-STITCH          4.6 BRD0 — Logo System Exploration
FIG-BRD0-C3-SIGNATURE-MOTIF          4.6 BRD0 — Logo System Exploration
FIG-BRD0-C4-WORDMARK-LED             4.6 BRD0 — Logo System Exploration
FIG-BRD0-COMPARISON-MATRIX           4.6 BRD0 — Logo System Exploration
FIG-BRD0-C3-PRODUCTIONIZATION        4.6.1 BRD0-F02 — Concept 03 productionized
FIG-BRD0-C3-SYMBOL-MASTER            4.6.1 BRD0-F02 — Concept 03 productionized
FIG-BRD0-WRONG-DIRECTION-ARCHIVE     4.6.1 BRD0-F02 — Concept 03 productionized
```

Every one is a `FIG-BRD0-*` row in one of two **new** sections. No APP2-owned
section, ID or authority field was touched. Ownership was determined from Git
evidence, not inferred from totals.

## C. Why freezing a global total was structurally wrong

The gate asserted `86 registry IDs / 86 node rows / 11 tables` against
`docs/design/FIGMA_DESIGN_INDEX.md`. That document is **one shared, appendable
registry** every design checkpoint in every phase writes into. Freezing its
totals fails in both directions at once:

- **Too strict.** Any unrelated, valid later addition breaks a closed phase's
  gate. That is not a hypothetical — BRD0 logo work did exactly this and took
  `check:app2-closure`, two of its tests and `pnpm quality` down with it. The
  gate was demanding that the rest of the product stop designing.
- **Too weak.** A count cannot see the failure that matters. Delete an
  APP2-owned row, insert an unrelated row in its place, and the totals are
  unchanged — the old gate passed. The thing a closed phase most needs
  protecting from was invisible to it.

A count bump to `96/96/13` would have fixed neither: it would break again on the
next legitimate Figma addition, and would still be blind to substitution.

## D. The mechanism

**Baseline.** `docs/implementation/reports/APP2-CLOSURE-FIGMA-BASELINE.json`,
transcribed mechanically from the closure commit `8b5f3b0`. It records
`sourceCommit`, `sourceSubject`, `sourcePath`, the authority-field list, the 10
owned sections, and per registry ID a `"<sectionIndex>:<digest>"` pair — 123
lines, one line per owned record.

**Digest.** First 16 hex of `sha256` over `id`, `section` and the eleven
authority fields, joined by the ASCII unit separator (0x1F, which cannot appear
inside a markdown table cell).

**Authority fields frozen** — the ones APP2 closure attested:

```text
App/Library · Route/Capability · Screen/Asset · State · Viewport · Class
Status · File Key · Page · Node · Owning Phase
```

**Deliberately not frozen:** `Direct URL`, `Supersedes/By`, `Approval Evidence`,
`Last Verified`. These legitimately evolve — re-verification dates and later
supersession pointers are normal registry life, and freezing them would recreate
the same over-strictness one level down. Authority **demotion** is still caught,
because `Status` is frozen.

**Section as identity.** A row's section is part of its frozen identity: moving
an APP2-owned record into an unrelated section changes what the closure
attested even when every field survives. This also makes a disappeared owned
section detectable through its rows.

**Registry consistency.** Dropping the totals removed the only thing that
previously noticed structural corruption, so `checkOwnedFigmaBaseline` now runs
`checkFigmaDesignIndex` and fails on any violation — reusing the real registry
gate rather than re-implementing it. A closure cannot attest over a broken
registry.

**Printed verdict.** `Figma 86/86/11` became `Figma owned 86 rows/11 tables
intact` — derived from `EXPECTED.figmaOwnedRows`/`figmaOwnedTables`, so unrelated
registry growth cannot change it.

## E. Changed files

Commit A (`9da79bf8cdca5c69f96e515e2095d746e157f946`), 11 files:

```text
tools/check-app2-closure.mjs                      global Figma totals removed from EXPECTED;
                                                  verdict line rescoped (stays at the 400-line limit)
tools/check-app2-closure-artifacts.mjs            three global Figma claims removed; adds
                                                  parseFigmaRegistryRows + checkOwnedFigmaBaseline
tools/check-app2-closure.test.mjs                 32 -> 43 cases
docs/implementation/reports/APP2-CLOSURE-FIGMA-BASELINE.json   NEW — the frozen owned subset
docs/implementation/reports/APP2-X01-COMPLETION-REPORT.md      addendum (dated record intact)
docs/implementation/reports/APP3-PRE-IMPLEMENTATION-AUDIT-COMPLETION-REPORT.md
docs/implementation/audits/APP3_PRE_IMPLEMENTATION_AUDIT.md
docs/implementation/phases/APP3-DESIGN-TEMPLATES-AND-STUDIO.md
docs/implementation/10-MASTER-APPLICATION-ROADMAP.md
docs/implementation/11-TRACEABILITY-AND-STATUS-MATRIX.md
docs/implementation/13-PHASE-SOURCE-MAP.md
```

No `apps/`, `packages/`, `spikes/`, `infrastructure/`, schema, migration,
OpenAPI, generated-client, `pnpm-lock.yaml` or dependency change. **No Figma
content and no `docs/design/FIGMA_DESIGN_INDEX.md` change** — BRD0 design records
were not touched. `package.json` was not changed; the existing scripts sufficed.

### Disclosed scope note

The prompt allowed `tools/check-app2-closure.mjs` and its test. The work also
required `tools/check-app2-closure-artifacts.mjs`, because **that is where the
three Figma claims physically live** (`checkFrozenArtifacts`), and because
`check-app2-closure.mjs` sits at exactly the 400-line hard limit with no room for
the new logic. The new code went where the assertion already was, which is also
the correct home by responsibility — that file's stated job is verifying frozen
artifacts. No other tool was touched, and no further gate was weakened.

## F. Test matrix

`node --test tools/check-app2-closure.test.mjs` — **43/43 pass** (was 32).
Eleven new cases, plus one existing case updated because it asserted the removed
global totals.

| # | Case | Expectation |
|---|---|---|
| 1 | baseline is transcribed from the closure commit | regenerates from `git show 8b5f3b0:…` and asserts row count, table count, sections, zero duplicates and every `section:digest` match the committed fixture |
| 2 | exact closure-commit registry | passes |
| 3 | current registry with additive BRD0 rows | passes (asserts additive rows exist first, so the case cannot go vacuous) |
| 4 | one frozen APP2 record removed | fails — `record removed` |
| 5 | frozen authority field mutated (`APPROVED_FOR_IMPLEMENTATION` → `REFERENCE_ONLY`) | fails — `changed an authority field` |
| 6 | frozen APP2 ID duplicated | fails — `record duplicated` |
| 7 | **same total count**, owned row swapped for an unrelated ID | fails — `record removed` |
| 8 | owned record moved to a different section | fails — `moved section` or `removed` |
| 9 | registry made internally inconsistent (node link retargeted) | fails — `Figma registry is internally inconsistent` |
| 10 | frozen baseline file missing | fails — `frozen APP2 Figma baseline is missing` |
| 11 | printed verdict independent of registry growth | asserts `figmaIds`/`figmaNodeRows`/`figmaTables` are gone from `EXPECTED` |
| — | *(updated)* frozen artifacts measured | Figma totals now asserted `>=` owned counts, never `===` |

Existing non-Figma closure assertions were not weakened: every prior case still
runs and passes.

## G. Proof of additive-pass and tamper-fail

Run out-of-band against real copies of the current registry, driving
`checkOwnedFigmaBaseline` directly:

```text
### current registry, 96 rows incl. 10 additive BRD0
   PASS (no owned-baseline failure)

### removed one owned row (95 rows)
   FAIL: APP2-owned Figma record removed: FIG-ADMIN-LOGIN-DESKTOP-DEFAULT

### same total: owned row swapped for an unrelated id
   FAIL: APP2-owned Figma record removed: FIG-ADMIN-LOGIN-DESKTOP-DEFAULT

### owned row demoted APPROVED_FOR_IMPLEMENTATION -> REFERENCE_ONLY
   FAIL: APP2-owned Figma record changed an authority field:
         FIG-ADMIN-LOGIN-DESKTOP-DEFAULT (frozen 1cfd98a4d5617670,
         measured 00ec3219344c6fac; … Status = REFERENCE_ONLY …)

### owned id duplicated
   FAIL: Figma registry is internally inconsistent (registry-id-unique)
   FAIL: APP2-owned Figma record duplicated: FIG-ADMIN-LOGIN-DESKTOP-DEFAULT

### owned row node id retargeted 375-12 -> 999-999
   FAIL: Figma registry is internally inconsistent (url-node-id line 70 —
         Row "FIG-ADMIN-LOGIN-DESKTOP-DEFAULT" URL node 999-999 ≠ row Node 375:12)
```

The third case is the one a global total could never catch: the registry still
has 96 rows and 13 tables, and the gate still fails.

## H. Validation

Every command was run. All pass.

| Command | Result |
|---|---|
| `pnpm check:figma-design-index` | **PASS** — 96 registry IDs / 96 node rows / 13 tables (current global size) |
| `node --test tools/check-figma-design-index.test.mjs` | **31/31 pass** |
| `pnpm check:app2-closure` | **PASS** — `45 checkpoint rows, 11 routed follow-ups, 0 blocking; OpenAPI 16/19/34, 33 migrations, Figma owned 86 rows/11 tables intact, SAFE_STREAMED_NOT_FOUND current, APP3 NOT STARTED` |
| `node --test tools/check-app2-closure.test.mjs` | **43/43 pass** |
| `pnpm check:secrets` | PASS — 369 documents, 1819 tracked files |
| `pnpm check:lifecycle` | PASS — LC-04 5 transitions, one `PUBLISHED → DRAFT`, archive distinct |
| `pnpm check:openapi` | PASS — artifact up to date |
| `pnpm check:api-client` | PASS — tree hash `7524fc91…8ecf5a2` |
| `pnpm db:check:manifest` | PASS — 78 tables / 833 columns / 211 indexes |
| `pnpm check:spike-boundaries` | PASS |
| `pnpm spike:editor:check` | PASS |
| `node tools/check-file-size.mjs` | PASS — 0 hard-limit violations (`check-app2-closure.mjs` at exactly 400) |
| `pnpm quality` | **`EXIT=0`** |
| `git diff --check` | clean |

## I. Follow-up closure

```text
FU-APP3-CLOSURE-FIGMA-BASELINE-01 = COMPLETE — CLOSED_BY_APP2-X01-C1
owner: APP2-X01-C1
```

The previous ambiguous ownership (`APP2 closure owner + BRD0 owner`) is replaced
by a single concrete owner in every document that carried it.

The distinction now recorded:

```text
APP2 frozen Figma baseline:
the exact APP2-owned registry subset from APP2 closure Git evidence.

Current global Figma registry:
may grow additively when later authority is valid and internally consistent.
```

## J. Final statuses

```text
APP2                              = COMPLETE — PASS_WITH_FOLLOW_UPS — REVIEW_ACCEPTED
APP2-X01-C1                       = COMPLETE — REVIEW_ACCEPTED
FU-APP3-CLOSURE-FIGMA-BASELINE-01 = COMPLETE — CLOSED_BY_APP2-X01-C1
APP3-PRE-IMPLEMENTATION-AUDIT     = COMPLETE — REVIEW_ACCEPTED_AFTER_CORRECTION
APP3                              = AUDITED — READY_FOR_FIRST_GATE
APP3-G01                          = READY — NOT STARTED
every other APP3 checkpoint       = NOT STARTED
```

No APP3 implementation was started. `APP3-G01` was not executed and its execution
prompt was not written.

## K. Commits

```text
Commit A: 9da79bf8cdca5c69f96e515e2095d746e157f946
          fix(app2): scope figma closure baseline

Commit B: docs(app2): record figma baseline reconciliation
```

Commit B's own hash is not recorded here — this report ships inside it, so any
hash written here would be stale on creation. Resolve it with
`git log -1 --format=%H`. No prior commit was amended, squashed or rewritten.

## L. Tree and push state

Working tree clean after Commit B. `evidences/` is git-ignored and untouched.
**Nothing was pushed.**

At delivery time this work sat only on `docs/brd0-logo-system-concept03`, with
`production` at `5c0ba1f`, and moving it was flagged as a human decision.

## M. Addendum — canonical integration (`APP3-ENTRY-BRANCH-RECONCILIATION`, 2026-08-03)

The human decision was taken. `production` was fast-forwarded — no merge commit,
no rebase, no cherry-pick — from `5c0ba1f` to **`82ed3f3`**, the exact HEAD of
the reviewed branch. The graph was strictly linear and both `production` and
`origin/production` were already ancestors of that HEAD, so a single
`git merge --ff-only` was sufficient and no commit was reordered or omitted.

Every gate was then re-run **on `production` itself** rather than trusting the
feature-branch run: `pnpm quality` = `EXIT=0`. `docs/brd0-logo-system-concept03`
is preserved and unmodified, and nothing was pushed —
`origin/production` remains at `8b5f3b0`, six commits behind.

Evidence: [`ENTRY-BRANCH-RECONCILIATION-REPORT.md`](./ENTRY-BRANCH-RECONCILIATION-REPORT.md).
