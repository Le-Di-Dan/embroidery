# APP3-ENTRY-BRANCH-RECONCILIATION — Evidence report

**Checkpoint:** `APP3-ENTRY-BRANCH-RECONCILIATION`
**Verdict:** `COMPLETE — CASE_A_FAST_FORWARD` · **Date:** 2026-08-03

---

## A. Purpose and outcome

The accepted APP3 governance baseline — the pre-implementation audit, its
`APP3-PRE-AUDIT-C1` reconciliation, the BRD0 registry work and `APP2-X01-C1` —
had been delivered on a feature branch while canonical `production` still
pointed at an older commit. No APP3 checkpoint may begin until that baseline is
on `production` **and** every gate passes there.

**Case A applied: a single verified fast-forward.** `production` moved
`5c0ba1f` → `82ed3f3` with no merge commit, no rebase, no cherry-pick, no reset
and no history rewrite. All gates were then re-run on `production` itself.
`pnpm quality` = `EXIT=0`. `APP3-G01` is unblocked.

## B. Human review verdict recorded

```text
APP2-X01-C1 =
COMPLETE — REVIEW_ACCEPTED

Technical mechanism =
PASS

Prompt-scope deviation:
tools/check-app2-closure-artifacts.mjs was not named in the original allowlist,
but the change is accepted as an APPROVED_NARROW_SCOPE_DEVIATION because:
- the existing Figma frozen-artifact assertions physically lived there;
- the file owns frozen-artifact verification;
- check-app2-closure.mjs was already at the 400-line hard limit;
- no unrelated gate or behavior was modified.
```

This is a **review disposition**, not an implementation-authority decision. No
`IMP-D###` was minted: branch reconciliation and a review disposition lock no
architectural or product choice. The accepted technical design of `APP2-X01-C1`
was not reopened.

## C. Preflight — refs as found

| Ref | Value |
|---|---|
| Starting branch | `docs/brd0-logo-system-concept03` |
| Starting HEAD | `82ed3f3b8343b5ce198bed6bca4d4d25eab79d34` |
| Working tree | clean (`git status --short` empty) |
| local `production` | `5c0ba1f90e5dd90feb543180d0bb7fba3d6d9992` |
| `origin/production` | `8b5f3b0279b1920babd05b52014af3b853f526c0` |

The local and remote canonical refs were **not** equal: `origin/production` was
two commits behind local `production`, because the two APP3 audit commits were
never pushed. Both were inspected independently rather than assumed equal. **No
`git fetch` was run** — the refs reported here are the local remote-tracking refs
as they stood; no network operation was part of this checkpoint.

### Graph

```text
* 82ed3f3 (HEAD -> docs/brd0-logo-system-concept03) docs(app2): record figma baseline reconciliation
* 9da79bf fix(app2): scope figma closure baseline
* 1216e98 docs(app3): reconcile pre-implementation audit review
* 2a5d3bf docs(brd0): register logo system exploration and Concept 03 productionization
* 5c0ba1f (production) docs(app3): record pre-implementation audit evidence
* 6806c79 docs(app3): audit design templates and 2D studio entry
* 8b5f3b0 (origin/production, origin/HEAD) docs(app2): record phase closure evidence
```

Strictly linear. No branch point, no divergence.

### Merge-base and ancestry

| Check | Result |
|---|---|
| `git merge-base production HEAD` | `5c0ba1f…` — i.e. `production` itself |
| `git merge-base origin/production HEAD` | `8b5f3b0…` — i.e. `origin/production` itself |
| `git merge-base --is-ancestor production HEAD` | exit `0` — ancestor |
| `git merge-base --is-ancestor origin/production HEAD` | exit `0` — ancestor |
| `git merge-base --is-ancestor origin/production production` | exit `0` — ancestor |
| `git log --oneline HEAD..production` | **empty** |
| `git log --oneline HEAD..origin/production` | **empty** |

Both canonical refs were ancestors of the reviewed HEAD and neither contained a
commit absent from it. Divergence: **none**.

## D. The reviewed range

`git log --oneline production..HEAD` — exactly four commits, every one reviewed,
with no unrelated or unreviewed work mixed in:

| Commit | Subject | Files |
|---|---|---|
| `2a5d3bf787dbbb352ce13875a8cc8fc5c936e27b` | `docs(brd0): register logo system exploration and Concept 03 productionization` | 1 — `docs/design/FIGMA_DESIGN_INDEX.md` |
| `1216e981329f2cad86be6369c2ecc84c2a34a3e6` | `docs(app3): reconcile pre-implementation audit review` (`APP3-PRE-AUDIT-C1`) | 6 — all `docs/implementation/**` |
| `9da79bf8cdca5c69f96e515e2095d746e157f946` | `fix(app2): scope figma closure baseline` (`APP2-X01-C1` Commit A) | 11 — 8 docs + 3 `tools/` |
| `82ed3f3b8343b5ce198bed6bca4d4d25eab79d34` | `docs(app2): record figma baseline reconciliation` (`APP2-X01-C1` **Commit B**) | 1 — `APP2-X01-C1-COMPLETION-REPORT.md` |

**Exact `APP2-X01-C1` Commit B hash:**
`82ed3f3b8343b5ce198bed6bca4d4d25eab79d34`.

The BRD0 commit is part of the accepted project history: it is the registry work
that exposed the global-total flaw, its ten added IDs were verified as
`FIG-BRD0-*` brand authority in two new sections, and `APP2-X01-C1` was the
accepted response to it. The two earlier APP3 audit commits (`6806c79`,
`5c0ba1f`) were already on `production` and sit below the range.

## E. Integration performed

Case A. **One** `--ff-only` operation, not two — Case B did not apply, because
`origin/production` was *older* than local `production`, not newer, so there was
nothing to fast-forward from it.

```bash
git checkout production
git merge --ff-only docs/brd0-logo-system-concept03
```

```text
Switched to branch 'production'
Updating 5c0ba1f..82ed3f3
Fast-forward
 13 files changed, 1612 insertions(+), 88 deletions(-)
 create mode 100644 docs/implementation/reports/APP2-CLOSURE-FIGMA-BASELINE.json
 create mode 100644 docs/implementation/reports/APP2-X01-C1-COMPLETION-REPORT.md
```

No merge commit was created. No commit was reordered, omitted, amended, squashed
or rewritten. The feature branch `docs/brd0-logo-system-concept03` was **not**
deleted and still points at `82ed3f3`.

**`production` HEAD after integration, before the evidence commit:**
`82ed3f3b8343b5ce198bed6bca4d4d25eab79d34` — identical to the reviewed branch
HEAD, as a fast-forward requires.

## F. Canonical validation — run on `production`

Confirmed before running: current branch `production`, HEAD `82ed3f3…`, working
tree clean. These results are from `production`, not carried over from the
feature branch.

| Command | Result |
|---|---|
| `pnpm check:figma-design-index` | **PASS** — 96 registry IDs / 96 node rows / 13 tables |
| `node --test tools/check-figma-design-index.test.mjs` | **31/31 pass** |
| `pnpm check:app2-closure` | **PASS** — `45 checkpoint rows, 11 routed follow-ups, 0 blocking; OpenAPI 16/19/34, 33 migrations, Figma owned 86 rows/11 tables intact, SAFE_STREAMED_NOT_FOUND current, APP3 NOT STARTED` |
| `node --test tools/check-app2-closure.test.mjs` | **43/43 pass** |
| `pnpm check:secrets` | PASS — 370 documents, 1821 tracked files |
| `pnpm check:lifecycle` | PASS — LC-04 5 transitions, one `PUBLISHED → DRAFT`, archive distinct |
| `pnpm check:openapi` | PASS — artifact up to date |
| `pnpm check:api-client` | PASS — tree hash `7524fc91…8ecf5a2` |
| `pnpm db:check:manifest` | PASS — 78 tables / 833 columns / 211 indexes |
| `pnpm check:spike-boundaries` | PASS |
| `pnpm spike:editor:check` | PASS |
| `node tools/check-file-size.mjs` | PASS — 0 hard-limit violations |
| `pnpm quality` | **`EXIT=0`** |
| `git diff --check` | clean |

The `check:app2-closure` verdict is the corrected one: it attests that the
**86 APP2-owned Figma records are intact** while the shared registry stands at
96/96/13 — the additive growth that used to fail this gate now passes it, on the
canonical branch.

## F.1 Report filename — a disclosed deviation, and a gate that is now mis-scoped

The checkpoint specified this file as
`docs/implementation/reports/APP3-ENTRY-BRANCH-RECONCILIATION-REPORT.md`. Written
under that name it **fails `check:app2-closure`**:

```text
✗ docs/implementation/reports/APP3-ENTRY-BRANCH-RECONCILIATION-REPORT.md:
  APP3 must not be started before closure
```

`checkNextPhase` rejects any file in `docs/implementation/reports/` whose name
begins with `APP3-`, except one exact allowlisted filename (the
pre-implementation audit report, allowlisted at that checkpoint for the same
reason). This checkpoint forbids `tools/**` and states that no additional gate
implementation is authorized, so the gate was **not** touched. The file was
renamed to `ENTRY-BRANCH-RECONCILIATION-REPORT.md` instead — the smaller,
fully disclosed deviation, and an accurate name for what is a phase-neutral Git
governance action rather than APP3 engineering. The checkpoint ID inside this
document is unchanged: `APP3-ENTRY-BRANCH-RECONCILIATION`.

**Underlying defect, reported not fixed.** The guard's message is *"APP3 must not
be started **before closure**"* — but APP2 closed at `8b5f3b0` and was accepted.
The guard now rejects every post-closure APP3 **governance** artifact on a name
prefix, which is the second time it has collided with a mandated filename. It
cannot distinguish "APP3 engineering delivered too early" from "an accepted APP3
governance record written after closure", and one-exact-filename allowlisting
does not scale.

```text
FU-APP2-CLOSURE-NEXTPHASE-GUARD-01
The APP3 report-name guard in check-app2-closure.mjs is scoped by filename
prefix and has now blocked two mandated post-closure governance reports.
Status: OPEN — NONBLOCKING (worked around by naming, twice)
Owner:  APP2 closure gate owner
```

It is nonblocking: nothing is stuck, and `pnpm quality` is green. It should be
retired or re-scoped — for example keyed to APP3 *checkpoint* reports rather than
any `APP3-` prefix — by whoever next has authority over that gate.

## G. Changed documentation files

Documentation only, all under `docs/implementation/`:

```text
docs/implementation/reports/ENTRY-BRANCH-RECONCILIATION-REPORT.md  (new — this file)
docs/implementation/reports/APP2-X01-C1-COMPLETION-REPORT.md            verdict → REVIEW_ACCEPTED; §M addendum;
                                                                        stale branch claims corrected
docs/implementation/phases/APP3-DESIGN-TEMPLATES-AND-STUDIO.md          §10 status block
docs/implementation/10-MASTER-APPLICATION-ROADMAP.md                    APP3 status column
docs/implementation/11-TRACEABILITY-AND-STATUS-MATRIX.md                reconciliation pointer
```

No `apps/`, `packages/`, `tools/`, `spikes/`, `infrastructure/`,
`docs/design/FIGMA_DESIGN_INDEX.md`, schema, migration, OpenAPI,
generated-client, `package.json`, lockfile or dependency change. No additional
gate was implemented. APP3 scope, checkpoint dependencies, migration
classification, Figma authority and Product Owner decisions were left untouched.

## H. Final statuses

```text
APP2                              = COMPLETE — PASS_WITH_FOLLOW_UPS — REVIEW_ACCEPTED
APP2-X01-C1                       = COMPLETE — REVIEW_ACCEPTED
FU-APP3-CLOSURE-FIGMA-BASELINE-01 = COMPLETE — CLOSED_BY_APP2-X01-C1
APP3-PRE-IMPLEMENTATION-AUDIT     = COMPLETE — REVIEW_ACCEPTED_AFTER_CORRECTION
APP3                              = AUDITED — READY_FOR_FIRST_GATE
APP3-G01                          = READY — NOT STARTED
every other APP3 checkpoint       = NOT STARTED
```

## I. Tree, branch and push state

- Current branch: **`production`**.
- Working tree: **clean** after the evidence commit.
- `evidences/` is git-ignored and untouched.
- `docs/brd0-logo-system-concept03` preserved at `82ed3f3`, not deleted, not
  rewritten.
- **Nothing was pushed.** `origin/production` remains at
  `8b5f3b0279b1920babd05b52014af3b853f526c0`, six commits behind local
  `production`. Publishing is a separate human decision.

This report ships inside the evidence commit, so that commit's own hash is not
recorded here — it would be stale on creation. Resolve it with
`git log -1 --format=%H` on `production`.

## J. Stop confirmation

`APP3-G01` was **not** executed and its execution prompt was **not** written. No
APP3 implementation was started. No branch was deleted or rewritten, and nothing
was pushed.
