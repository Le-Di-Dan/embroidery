# Validation Governance

Canonical authority for **which validations run, when, and why**. Locked by
`GOV-Q01` and corrected by `GOV-Q01-C1` (2026-08-04).

Its companion is [`SCOPED_COMMAND_INDEX.md`](./SCOPED_COMMAND_INDEX.md), which
records **where each command lives and how to invoke it** now that root
`package.json` is no longer a command registry.

Where an older document still describes a repository-wide `pnpm quality` chain as
the per-change gate, **this document supersedes it**. Historical completion
reports are evidence of what was true when they were written and are not
rewritten.

---

## 1. Global quality controls

The repository has exactly three global quality controls. Only these may inspect
the whole repository:

| Control | Command | Status |
|---|---|---|
| Prettier | `pnpm format:check` | active |
| ESLint | `pnpm lint` | active |
| SonarQube | — | see §6 |

**Nothing else is a global quality gate.** There is no aggregate command whose
purpose is to prove the whole repository, and none may be created — not as
`quality`, `quality:fast`, `quality:full`, `quality:ci`, `check:all`, `verify`,
`verify:all`, `gate`, `gate:all`, `regression`, `regression:all`, or any
equivalent.

`quality:e2e` was itself removed by `GOV-Q01-C1`: an alias that chained a
boundary check to a full browser matrix is an aggregate, however narrow. The
browser tier is now
`pnpm --filter @embroidery/e2e-testing check:e2e` followed by
`pnpm --filter @embroidery/e2e-testing e2e:full`, run only under an authorized
release/regression plan (`CMD-QUALITY-E2E`). It is never a default acceptance
criterion.

### 1.1 The root-script boundary

Root `package.json` is **not** a command registry. It may contain only:

```text
repository-wide development/build orchestration
global Prettier
global ESLint
global SonarQube when canonically configured
shared Docker/infrastructure lifecycle
shared database lifecycle and operations
```

Exactly **30 scripts**, enumerated in
[`SCOPED_COMMAND_INDEX.md`](./SCOPED_COMMAND_INDEX.md) §2 (31 only once a valid
`sonar` exists). Three ownership levels:

| Level | Owner | Examples |
|---|---|---|
| 1 | root `package.json` | `dev`, `build`, `clean`, `format:check`, `lint`, `docker:*`, `db:*` |
| 2 | the owning workspace `package.json` | API/worker tests, E2E modes, OpenAPI and generated-client generation/checking, spike operations, package-scoped typecheck/build/test |
| 3 | the owning file, run directly | checkpoint, phase, capability, smoke, benchmark, explain and one-off validation commands |

**Root aliases for Level 2 and Level 3 commands are prohibited**, including
renamed ones.

> **Superseded rule.** `GOV-Q01` allowed a root script for "a stable
> product-development operation expected to outlive the checkpoint". That test
> was too permissive — it left 101 package-, module-, phase-, checkpoint-,
> smoke-, E2E-, spike-, benchmark- and diagnostic-specific commands in the root
> file. It is replaced by the three levels above.

### 1.2 Root aliases are not documentation

```text
Do not add a root script merely to make a command discoverable.
Add or update SCOPED_COMMAND_INDEX.md instead.
```

---

## 2. Everything else is scoped validation

The following are scoped validations, never mandatory global checks:

```text
TypeScript typecheck        unit tests                integration tests
contract tests              E2E tests                 smoke tests
builds                      file-size checks          OpenAPI checks
generated-client checks     database manifest checks  lifecycle checks
Figma checks                route-authority checks    phase-closure checks
checkpoint-authority checks spike checks              Docker/composition checks
```

They run only when justified by one of:

- the files changed;
- the module changed;
- the checkpoint acceptance criteria;
- the phase closure scope;
- a deliberate integration/regression exercise;
- a release candidate;
- a cross-cutting dependency or infrastructure change;
- an explicit human request.

Record the justification in the checkpoint report. A validation run without a
stated reason is cost without evidence.

### 2.1 Typecheck, build and tests

```text
typecheck is scoped validation, not global quality;
build is scoped validation, not global quality;
tests are scoped evidence, not global quality.
```

Their **direct commands remain available** — `pnpm --filter <workspace> test`,
`pnpm --filter <workspace> typecheck` — but the repository-wide `typecheck`,
`test` and `test:coverage` aliases were removed by `GOV-Q01-C1` and are
indexed as `RETIRED_AGGREGATE`. `pnpm build` remains, as repository-wide build
orchestration. A checkpoint prompt must not invoke a full run without a written
impact reason.

---

## 3. Checkpoint validation matrix

Every checkpoint prompt carries a small validation matrix **derived from its own
changed files**. Use this decision table to build it.

| Change category | Required validation |
|---|---|
| Markdown-only authority/docs | Prettier for touched docs when applicable, the direct checker/tests created by that checkpoint, `git diff --check` |
| One tool/checker | That tool's focused tests, file-size for touched production/test files, Prettier/ESLint where applicable |
| One backend module | Tests for that module and directly affected seams; scoped typecheck/build only when needed |
| One frontend screen/capability | Component tests for that capability; scoped lint/typecheck/build only when needed |
| OpenAPI operation changed | Relevant API tests plus OpenAPI generation/check and generated-client check |
| Database schema/migration changed | Migration/manifest tests and directly affected repository/integration tests |
| Shared package changed | Tests/typecheck/build for direct consumers, selected from dependency evidence |
| Gateway/composition changed | Relevant gateway/config/smoke tests |
| Phase closure | An explicit phase manifest of required checkpoints and integration seams — never automatic whole-history regression |
| Release/cross-cutting refactor | A deliberately authorized regression plan |

**This table must never become a command.** It is a selection aid, not an
aggregate.

---

## 4. Previously closed checkpoints

A closed checkpoint is **not** re-run merely because a later checkpoint exists.

Re-run it only when the current change touches one of its owned inputs or
invariants — and state that reason in the current checkpoint report.

This replaces the previous model, in which every new gate was appended to a
global chain and every subsequent checkpoint paid for it forever.

---

## 5. Checkpoint checkers are run directly

```text
A checkpoint may add a checker or test file under tools/**,
but it must not register a checkpoint-specific script in root package.json.

Run checkpoint files directly.
```

For example:

```bash
node tools/check-app3-g03.mjs
node --test tools/check-app3-g03.test.mjs
```

Root scripts are allowed only for repository-global orchestration, the three
global quality controls, and shared infrastructure/database lifecycle (§1.1).
Stable package-owned operations remain in the owning workspace
`package.json`. Checkpoint-, phase-, capability- and tool-owned operations are
indexed in [`SCOPED_COMMAND_INDEX.md`](./SCOPED_COMMAND_INDEX.md) and run
directly.

Root registrations removed by `GOV-Q01`: `quality`, `check:app2-closure`,
`check:app3-g01`, `check:app3-g02`, `check:app3-g03`. `GOV-Q01-C1` then
removed the remaining **71** aliases, taking the root file from 101 scripts to
30. **No checker, test, tool, Playwright project, workspace script or source
file was deleted** — only the aliases.

> **The four capability-named APP2 gates are gone from root too.**
> `check:pagination-authority`, `check:storefront-route-authority`,
> `check:storefront-product-detail-authority` and
> `check:storefront-product-detail-correction` were kept by `GOV-Q01` and
> removed by `GOV-Q01-C1`. They are indexed as `HISTORICAL_SCOPED` and run
> directly from `tools/`.

### 5.1 Tooling file size — bounded soft caps (`APP3-P03`)

Application code keeps the hard limits `CLAUDE.md` §6 states. They are **not**
relaxed:

```text
application production source ≤ 400 lines
application test              ≤ 600 lines
```

Files under `tools/` — checkpoint checkers and their test suites — use bounded
**soft caps** instead:

```text
tools/check-*.mjs      ≤ 450 lines
tools/check-*.test.mjs ≤ 700 lines
```

The reason is what the two kinds of file are for. A checker is one cohesive
argument about one checkpoint; splitting it to land under an arbitrary line
count scatters that argument across files whose only relationship is size, and
the split itself has to be re-verified. `APP3-B02` spent more effort on repeated
checker splitting than the bounded excess could justify — and a checker made
harder to read is a checker made easier to weaken.

Rules:

- do **not** open a correction solely because a tooling file sits above 400/600
  but within 450/700;
- split when the soft cap is exceeded, or when responsibilities are genuinely
  distinct — never to satisfy a line count alone;
- semantic correctness, test quality and checkpoint throughput take priority
  over cosmetic line-count compliance;
- every excess over the former 400/600 limit is still **disclosed** in the
  completion report;
- do not pad a file toward the soft cap. The cap is a ceiling, not a target.

`APP3-B02` carries the approved bounded deviation
`B02_PREDECESSOR_GATE_AND_TEST_FILES` for the gate and gate-test files its
mode-aware edits pushed over the former limit. No runtime application source
exceeded its limit: the one repository that crossed it was split by
responsibility instead.

---

## 6. SonarQube disposition

```text
SONAR_GLOBAL_CONTROL = REQUIRED_BUT_NOT_CONFIGURED
```

SonarQube is a locked global control (`CLAUDE.md` §4, `README.md`), and partial
authority exists in the repository:

| Artifact | Path | What it provides |
|---|---|---|
| Scanner configuration | `sonar-project.properties` | project key, sources/tests, exclusions, lcov paths |
| Server + database | `infrastructure/compose/docker-compose.dev.yml` (Compose `quality` profile) | `sonarqube:10.7.0-community` on loopback `:9000` |
| Profile lifecycle | `pnpm docker:quality:up` / `pnpm docker:quality:down` | start/stop the quality profile |
| Runbook | `docs/development/LOCAL_DEVELOPMENT.md` §9 | first-time setup and the scanner CLI invocation |

What does **not** exist is a canonical *executable* command. The documented
invocation is a manual `docker run sonarsource/sonar-scanner-cli` that requires a
human-supplied `SONAR_TOKEN` and a POSIX-only `$(pwd)` bind mount, so it cannot
be registered as a portable root script without inventing one.

`GOV-Q01` therefore did **not** install, invent or wrap a Sonar command, and did
not add a dependency. Follow-up **`FU-GOV-Q01-SONAR-COMMAND-01`** is owned by
repository infrastructure governance: provide a portable, token-safe canonical
invocation, then register exactly one root script named `sonar`.

Until then, ESLint and Prettier are the only executable global controls, and no
report may claim SonarQube coverage.

---

## 7. Full regression

A full regression requires an explicit trigger:

```text
release candidate
major dependency upgrade
shared infrastructure refactor
cross-module schema or contract change
large repository-wide refactor
explicit human instruction
```

It is a **separate checkpoint or release activity**, not a default acceptance
criterion. `09-RELEASE-AND-MILESTONE-POLICY.md` owns release gating;
`07-TESTING-AND-ACCEPTANCE-GATES.md` §8 owns the layered suite strategy.

---

## 8. Execution discipline

```text
Do not send a repository-wide aggregate validation to background.
Do not repeatedly poll a long aggregate command.
Prefer small foreground commands with direct bounded output.
```

When an individually justified command is inherently long:

- start it once;
- use the execution mechanism's normal completion wait when one exists;
- do not poll in a tight loop;
- do not re-run it merely to obtain output it already produced.

The failure this removes is concrete: a single aggregate that ran every
historical gate took minutes, was pushed to background, and was then polled
repeatedly — spending time and tokens to rediscover output that had already been
written.

---

## 9. Evidence language

Unchanged from `07-TESTING-AND-ACCEPTANCE-GATES.md` §9:

- `PASS — command and result recorded`
- `FAIL — defect recorded`
- `N/A — reason recorded`

A report states the commands it actually ran. It never claims a global pass it
did not execute, and never substitutes "quality passed" for the scoped evidence
its own change required.
