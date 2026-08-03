# Validation Governance

Canonical authority for **which validations run, when, and why**. Locked by
`GOV-Q01` (2026-08-04).

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

`pnpm quality:e2e` is **not** an exception: it is a deliberately targeted browser
tier (`check:e2e` plus the Playwright matrix), not a repository-wide aggregate.
It is never a default acceptance criterion.

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

Root commands for deliberate full runs still exist (`pnpm typecheck`,
`pnpm build`, `pnpm test`). A checkpoint prompt must not invoke them without a
written impact reason.

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

A package-level script is allowed only when it is a **stable product-development
operation expected to outlive the checkpoint itself** — `dev`, `build`,
`format:check`, `lint`, an explicit test suite, an E2E command, OpenAPI or
generated-client generation/checking, a database or Docker operation, a
backup/restore, a benchmark, a smoke command, or a stable cross-cutting tool.

Root registrations removed by `GOV-Q01`: `quality`, `check:app2-closure`,
`check:app3-g01`, `check:app3-g02`, `check:app3-g03`. Their checker and test
files are unchanged and remain directly runnable.

> **Legacy names retained, reclassified.** `check:pagination-authority`,
> `check:storefront-route-authority`,
> `check:storefront-product-detail-authority` and
> `check:storefront-product-detail-correction` are capability-named APP2
> authority gates registered before this rule existed. They were **kept** rather
> than mass-deleted, but they are scoped validations under §2, not global
> controls, and they are the pattern **not** to repeat. A later governance
> checkpoint may retire them.

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
