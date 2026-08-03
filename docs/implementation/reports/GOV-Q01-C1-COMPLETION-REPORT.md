# GOV-Q01-C1 — Completion report

**Checkpoint:** `GOV-Q01-C1` — Enforce the root package script boundary
**Date:** 2026-08-04
**Branch:** `production` (local)
**Entry HEAD:** `e649a6ec886e8e9e606e8c10861469190bc175fe`
**Verdict:** `COMPLETE — REVIEW_DELIVERED`

---

## 1. Human correction verdict

```text
GOV-Q01 = COMPLETE — CORRECTION_REQUIRED

Reason:
The global quality aggregate was removed, but root package.json still acts as a
registry for 101 package-, module-, phase-, checkpoint-, smoke-, E2E-, spike-,
benchmark- and diagnostic-specific commands.

Required correction:
Root package.json must contain only genuinely repository-global orchestration,
global quality controls and infrastructure lifecycle commands.
```

The verdict is accepted without reinterpretation. `GOV-Q01` deleted the
aggregate — the single command that ran everything — but kept a permissive test
("a stable product-development operation expected to outlive the checkpoint")
that admitted almost every alias it was meant to exclude. A test that classifies
`smoke:app2-s02-detail:production` and `explain:q01` as "stable operations" draws
no boundary at all. It is replaced.

---

## 2. Root script counts

| Point | Count |
|---|---|
| Before `GOV-Q01` | 106 |
| After `GOV-Q01` | 101 |
| **After `GOV-Q01-C1`** | **30** |

31 only once `FU-GOV-Q01-SONAR-COMMAND-01` produces a valid `sonar` script.

## 3. Exact final root script set

```text
dev                     format                  docker:dev:config
build                   format:check            docker:dev:build
clean                   lint                    docker:dev:up
                                                docker:dev:ps
db:up                   db:generate             docker:dev:logs
db:down                 db:generate:custom      docker:dev:down
db:logs                 db:migrate              docker:debug:up
db:reset                db:status               docker:debug:down
db:backup               db:restore              docker:quality:up
db:pitr:rehearse        db:retention            docker:quality:down
db:anonymize                                    docker:clean:volumes
```

| Group | Count | Rationale |
|---|---|---|
| Repository-wide orchestration | 3 | `dev`, `build`, `clean` are genuinely repository-global. |
| Global quality controls | 3 | Prettier (`format`, `format:check`) and ESLint (`lint`). SonarQube has no executable command — §8. |
| Shared Docker/infrastructure lifecycle | 11 | Manage the shared local stack, including the SonarQube profile. |
| Shared database lifecycle and operations | 13 | Migrations, status, reset, backup/restore, PITR, retention, anonymization. |

`docker:quality:up` / `docker:quality:down` are retained deliberately: they start
and stop shared **SonarQube infrastructure**. They are not a validation alias.

---

## 4. Removed categories — 71 aliases

| Category | Count | Aliases |
|---|---|---|
| Repository-wide aggregates | 4 | `typecheck`, `test`, `test:coverage`, `quality:e2e` |
| Targeted test suites | 22 | `test:object-storage:contract`, `test:asset-intake:*` (3), `test:catalog-draft:*` (3), `test:public-catalog:*` (3), `test:public-media:*` (2), `test:asset-processing:*` (2), `test:worker-runtime:*` (5), `test:storage-bootstrap:*` (3) |
| E2E | 9 | `e2e`, `e2e:smoke`, `e2e:full`, `e2e:app1`, `e2e:headed`, `e2e:debug`, `e2e:report`, `e2e:install`, `check:e2e` |
| Contract artifacts | 4 | `openapi:generate`, `check:openapi`, `api-client:generate`, `check:api-client` |
| Repository-tool checks | 14 | `db:check:manifest`, `check:file-size`, `check:secrets`, `check:styles`, `check:figma-design-index`, `check:frontend-boundaries`, `check:frontend-build-boundary`, `check:e2e-boundaries`, `check:spike-boundaries`, `check:lifecycle`, `check:pagination-authority`, `check:storefront-route-authority`, `check:storefront-product-detail-authority`, `check:storefront-product-detail-correction` |
| Spike operations | 7 | `spike:editor:build`, `:test`, `:check`, `:benchmark`, `:benchmark:linux`, `:bundle`, `:assets` |
| Smokes | 9 | `smoke:app1-bootstrap`, `smoke:app2-publication`, `smoke:app2-t01-public-media`(+`:production`), `smoke:app2-b04-public-catalog`(+`:production`), `smoke:app2-s01-discover:production`, `smoke:app2-s02-detail:production`, `smoke:app2-e01-publication:production` |
| Benchmark / diagnostic | 2 | `bench:db9`, `explain:q01` |

Every example the directive named explicitly is gone: `e2e:app1`,
`smoke:app1-bootstrap`, `smoke:app2-s01-discover:production`,
`smoke:app2-s02-detail:production`, `smoke:app2-e01-publication:production`,
`explain:q01`, `check:pagination-authority`,
`check:storefront-route-authority`, `check:storefront-product-detail-authority`,
`check:storefront-product-detail-correction`, `quality:e2e`.

**Nothing was deleted but the aliases.** No test, tool, Playwright project,
workspace script or source file was touched. No removed alias was replaced by a
renamed alias.

---

## 5. Canonical scoped-command index

```text
docs/implementation/SCOPED_COMMAND_INDEX.md
```

**71 indexed aliases**, one row each, with a stable semantic Command ID, former
root alias, owner, category, exact direct invocation, source/target, usage scope
and status.

| Status | Count | Meaning |
|---|---|---|
| `ACTIVE_SCOPED` | 54 | Current; run when its usage scope is met. |
| `HISTORICAL_SCOPED` | 13 | Owned by a delivered checkpoint; run only when the change touches its owned inputs, and say why. |
| `RETIRED_AGGREGATE` | 4 | `typecheck`, `test`, `test:coverage`, `quality:e2e`. Decomposed into owner commands; not a recommended entry point; reconstructable only under an authorized release/regression plan. |
| `BROKEN_LEGACY_REFERENCE` | 0 | — |

Owners used: `@embroidery/api`, `@embroidery/worker`, `@embroidery/e2e-testing`,
`@embroidery/api-client`, `@embroidery/object-storage`, `@embroidery/persistence`,
`@embroidery-spike/design-studio`, repository tool, historical checkpoint,
release/regression activity.

The index is documentation only — no command runner, dispatcher, JSON registry,
generated script, CLI or dependency backs it.

### Broken legacy references

**None.** Every removed alias was verified before removal: each workspace
invocation names a workspace that exists and a script it actually exposes
(assertion 8), and each tool invocation names a file that exists (assertion 7).

---

## 6. Governance rule superseded

Removed from `VALIDATION_GOVERNANCE.md` §5:

> A package-level script is allowed only when it is a **stable
> product-development operation expected to outlive the checkpoint itself** …

Replaced by §1.1, the three-level ownership model:

```text
Root scripts are allowed only for repository-global orchestration, the three
global quality controls, and shared infrastructure/database lifecycle.

Stable package-owned operations remain in the owning workspace package.json.

Checkpoint-, phase-, capability- and tool-owned operations are indexed and run
directly.
```

Plus §1.2:

```text
Do not add a root script merely to make a command discoverable.
Add or update SCOPED_COMMAND_INDEX.md instead.
```

Global quality remains exactly **Prettier, ESLint, SonarQube**. Typecheck, tests,
builds and every `check:*` tool are scoped validations even though their direct
commands remain available.

---

## 7. Active documents corrected

| File | Correction |
|---|---|
| `docs/implementation/VALIDATION_GOVERNANCE.md` | new §1.1 root-script boundary and §1.2 "root aliases are not documentation"; §2.1 records the retired aggregates; §5 replaces the permissive rule; the `quality:e2e` exception is withdrawn |
| `docs/implementation/SCOPED_COMMAND_INDEX.md` | **new** — the 71-row index |
| `CLAUDE.md` | §2 indexes the command index; §3 Figma gate now `node tools/check-figma-design-index.mjs`; §9 states the root-script boundary |
| `docs/implementation/01-DELIVERY-GOVERNANCE.md` | completion rule cites both governance documents and `node tools/check-file-size.mjs` |
| `docs/implementation/07-TESTING-AND-ACCEPTANCE-GATES.md` | §5.1 E2E commands are owner-invoked; §5.2 spike gate is a direct tool call; §5.3 supersession note extended to the 71 aliases; §6.1 Figma gate |
| `docs/implementation/README.md` | indexes `SCOPED_COMMAND_INDEX.md` |
| `docs/implementation/phases/APP1-STAFF-ACCESS-AND-SHELLS.md` | Figma registry gate invocation |
| `docs/implementation/phases/APP2-ASSETS-AND-CATALOG-PUBLICATION.md` | three machine-checked-facts gates, the E01 smoke, the exit-gate browser tier and the closure gate; plus one forward note |
| `docs/implementation/phases/APP3-DESIGN-TEMPLATES-AND-STUDIO.md` | the three G01/G02/G03 fact-table gates and the two dated-record references; §6.2 now forbids **any** root script registration; plus one forward note |
| `docs/architecture/REPOSITORY_STRUCTURE.md` | E2E and spike tier descriptions |
| `docs/development/LOCAL_DEVELOPMENT.md` | §8 "Quality gates" rewritten around the three global controls plus scoped commands; §9 Sonar coverage step; spike boundary gate |

### What was deliberately **not** rewritten

Dated evidence that recorded a command **as it existed when it was run** —
`pnpm quality EXIT=0` in APP2 checkpoint blockquotes, the APP3 §10 narrative,
audits, the roadmap, the traceability matrix, the decision register and every
completion report. Rewriting those would destroy evidence rather than correct an
instruction.

Instead, each of the two phase plans carrying such evidence gained **one forward
note** stating that a `pnpm …` alias appearing in a dated record below names the
alias that existed at the time, and pointing at the index for the current
invocation. That is the whole of the change to those files' historical sections.

The rule applied throughout: **correct every line that tells a reader to run
something; leave every line that records that something was run.**

---

## 8. Sonar disposition — unchanged

```text
SONAR_GLOBAL_CONTROL = REQUIRED_BUT_NOT_CONFIGURED
FU-GOV-Q01-SONAR-COMMAND-01 = OPEN
```

No portable, token-safe canonical invocation was completed independently, so
nothing was invented or installed here. `sonar-project.properties`, the Compose
`quality` profile and the `LOCAL_DEVELOPMENT.md` §9 runbook are unchanged;
`docker:quality:up` / `docker:quality:down` remain in the root allowlist as
shared infrastructure lifecycle.

---

## 9. Follow-up closure

```text
FU-GOV-Q01-DOC-SWEEP-01 = COMPLETE — CLOSED_BY_GOV-Q01-C1
```

`GOV-Q01` left `docs/architecture/REPOSITORY_STRUCTURE.md` and
`docs/development/LOCAL_DEVELOPMENT.md` still naming `pnpm quality`, because both
were outside that checkpoint's allowed files. Both are inside this checkpoint's
allowed files and both are now reconciled, along with every other active
reference found by a repository-wide search. Assertion 10 verifies mechanically
that no active document instructs a deleted root alias.

---

## 10. One-time mechanical assertions

Run as a single bounded `node` script; **no permanent checker was created or
committed**.

| # | Assertion | Result |
|---|---|---|
| 1 | root script count is exactly 30 (31 only with a valid `sonar`) | **PASS** — 30 |
| 2 | script-key set exactly equals the §2 allowlist | **PASS** |
| 3 | no root key begins with `test:`, `e2e`, `check:`, `openapi:`, `api-client:`, `spike:`, `smoke:`, `bench:`, `explain:`, `quality:` | **PASS** |
| 4 | root has no `test`, `test:coverage`, `typecheck`, `quality` | **PASS** |
| 5 | every removed former alias has exactly one index entry | **PASS** — 71 aliases, 71 rows |
| 6 | every index Command ID is unique | **PASS** — 71 unique |
| 7 | every active tool invocation references an existing file | **PASS** |
| 8 | every workspace invocation names an existing workspace and script | **PASS** |
| 9 | the index is linked from the implementation README and validation governance | **PASS** |
| 10 | active docs contain no instruction to invoke a deleted root alias | **PASS** |
| 11 | historical reports were not mass-rewritten | **PASS** — `git diff --stat HEAD -- docs/implementation/reports/` empty |

Assertion 10 first reported a false positive: it matched an alias name
line-by-line, and the sentence saying those aliases "no longer exist as root
commands" had hard-wrapped onto the next line. The check now evaluates its
exemption over a surrounding window rather than a single line — the same
markdown-wrapping defect that has bitten three checkers in this repository.

---

## 11. Validation

This correction changes root JSON and governance Markdown only. No owned input
of any test, gate, contract, schema or browser suite changes.

| Command | Result |
|---|---|
| `pnpm format:check` | **PASS** — "All matched files use Prettier code style!", exit 0 |
| `pnpm lint` | **PASS** — 21/21 tasks successful, exit 0 |
| `git diff --check` | **PASS** — clean |
| One-time assertions (§10) | **PASS** — 11/11 |

**Deliberately not run**, per §10 of the directive and because none of their
owned inputs changed: root test, the workspace test matrix, E2E, smokes,
APP2/APP3 gates, OpenAPI, generated client, database manifest, Figma, lifecycle,
spike, full regression. Nothing was sent to background and nothing was polled.

---

## 12. Changed files

| File | Change |
|---|---|
| `package.json` | 101 → 30 scripts; 71 aliases removed; no renames, no additions, no dependency |
| `docs/implementation/SCOPED_COMMAND_INDEX.md` | **new** |
| `CLAUDE.md` | §2, §3, §9 |
| `docs/implementation/VALIDATION_GOVERNANCE.md` | §1, §1.1, §1.2, §2.1, §5 |
| `docs/implementation/01-DELIVERY-GOVERNANCE.md` | completion rule |
| `docs/implementation/07-TESTING-AND-ACCEPTANCE-GATES.md` | §5.1, §5.2, §5.3, §6.1 |
| `docs/implementation/README.md` | index row |
| `docs/implementation/phases/APP1-STAFF-ACCESS-AND-SHELLS.md` | registry gate invocation |
| `docs/implementation/phases/APP2-ASSETS-AND-CATALOG-PUBLICATION.md` | gate invocations + forward note |
| `docs/implementation/phases/APP3-DESIGN-TEMPLATES-AND-STUDIO.md` | gate invocations, §6.2 rule, forward note |
| `docs/architecture/REPOSITORY_STRUCTURE.md` | E2E and spike tier wording |
| `docs/development/LOCAL_DEVELOPMENT.md` | §8, §9, spike gate |

**Not touched:** `apps/**`, `packages/**`, `tools/**`, `docs/database/**`,
`docs/design/**`, `spikes/**`, `infrastructure/**`, `pnpm-lock.yaml`,
dependencies, and every workspace `package.json`.

---

## 13. Commit protocol

| Commit | Hash | Subject |
|---|---|---|
| A | `c9ec088c46468cbddc17a5f5186a21647886be47` | `refactor(governance): enforce root script boundary` |
| B | *(this report)* | `docs(governance): record root script correction` |

- branch is local `production`; **nothing pushed** — `origin/production` remains
  `8b5f3b0279b1920babd05b52014af3b853f526c0`;
- no commit was amended, squashed, rebased or rewritten;
- working tree clean after Commit B;
- `.env` was not written and no secret-bearing variable was read or committed.

---

## 14. Status

```text
GOV-Q01-C1 = COMPLETE — REVIEW_DELIVERED
GOV-Q01 = COMPLETE — CORRECTION_DELIVERED_FOR_REVIEW
FU-GOV-Q01-DOC-SWEEP-01 = COMPLETE — CLOSED_BY_GOV-Q01-C1

SONAR_GLOBAL_CONTROL = REQUIRED_BUT_NOT_CONFIGURED
FU-GOV-Q01-SONAR-COMMAND-01 = OPEN
FU-APP3-G03-QUALITY-AGGREGATE-01 = OPEN — re-scoped
FU-APP3-G02-DEPENDENCY-TABLE-BOUND-01 = OPEN
```

Human review owns `GOV-Q01 = COMPLETE — REVIEW_ACCEPTED`. No claim is made about
`APP3-G03`'s review status, which remains `REVIEW_DELIVERED`.
