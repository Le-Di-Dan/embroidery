# GOV-Q01 — Completion report

**Checkpoint:** `GOV-Q01` — Replace global quality aggregation with scoped
validation
**Date:** 2026-08-04
**Branch:** `production` (local)
**Entry HEAD:** `414ddc9ea86020352e297e801bfc48c9af96e6e0`
**Verdict:** `COMPLETE — REVIEW_DELIVERED`

---

## 1. Entry state

`APP3-G03` was `COMPLETE — REVIEW_DELIVERED` with both its commits already on
local `production` (`9c686c9` authority, `414ddc9` evidence) and a **clean
working tree**. Nothing of that checkpoint was stashed, reset, discarded,
absorbed, amended or rewritten.

`APP3-G03` remains `REVIEW_DELIVERED`. This report makes **no** claim about its
review status; human review owns that transition, and its open item
`FU-APP3-G03-QUALITY-AGGREGATE-01` is discussed in §11.

---

## 2. The old `quality` script

The deleted root script, verbatim in behaviour, ran **23 commands sequentially**:

```text
format:check → lint → typecheck → test →
check:file-size → check:secrets → check:lifecycle →
check:pagination-authority → check:storefront-route-authority →
check:storefront-product-detail-authority →
check:storefront-product-detail-correction →
check:app2-closure → check:app3-g01 → check:app3-g02 → check:app3-g03 →
check:styles → check:figma-design-index → check:frontend-boundaries →
check:e2e → check:spike-boundaries → check:openapi → check:api-client →
db:check:manifest
```

`pnpm test` alone fans out to `turbo run test` across 21 packages **plus**
`node --test "tools/*.test.mjs"` — 524 test cases in 56 suites.

The structural defect was not slowness but **compounding coupling**: every
checkpoint appended its own gate, so each later checkpoint permanently paid for
every earlier one, including gates owned by closed phases with no relationship to
the change under review. The observable cost in the immediately preceding
checkpoint was a multi-minute command pushed to background and then polled
repeatedly — spending time and tokens to rediscover output already written.

That model is now prohibited.

---

## 3. Locked global quality controls

| Control | Command | Status |
|---|---|---|
| Prettier | `pnpm format:check` | active |
| ESLint | `pnpm lint` | active |
| SonarQube | — | `REQUIRED_BUT_NOT_CONFIGURED` (§5) |

Nothing else is a global quality gate. Everything else — typecheck, unit,
integration, contract, E2E and smoke tests, builds, file-size, OpenAPI,
generated-client, database manifest, lifecycle, Figma, route-authority,
phase-closure, checkpoint-authority, spike and Docker/composition checks — is
**scoped validation**, run only when the change justifies it.

---

## 4. Deleted root scripts

| Script | Reason |
|---|---|
| `quality` | the prohibited global aggregate |
| `check:app2-closure` | checkpoint-specific gate registration |
| `check:app3-g01` | checkpoint-specific gate registration |
| `check:app3-g02` | checkpoint-specific gate registration |
| `check:app3-g03` | checkpoint-specific gate registration (added by APP3-G03, before this rule existed) |

**No replacement aggregate was created** — not `quality:fast`, `quality:full`,
`quality:ci`, `check:all`, `verify`, `verify:all`, `gate`, `gate:all`,
`regression` or `regression:all`.

**No checker or test file was modified or deleted.**
`tools/check-app2-closure.mjs`, `tools/check-app3-g01.mjs`,
`tools/check-app3-g02.mjs` and `tools/check-app3-g03.mjs` all still exist and are
run directly.

Script count: **106 → 101**. No stable public command was renamed.

### Preserved categories

Development/build (`dev`, `build`, `clean`); global format/lint (`format`,
`format:check`, `lint`); scoped typecheck/tests (`typecheck`, `test`,
`test:coverage`, and the 19 explicitly targeted `test:*` suites); E2E (`e2e*`,
`check:e2e`, `quality:e2e`); OpenAPI and generated client; Docker and database
operations including backup/restore/PITR/retention/anonymize; stable scoped
checks (`check:file-size`, `check:secrets`, `check:styles`,
`check:figma-design-index`, `check:frontend-boundaries`,
`check:frontend-build-boundary`, `check:e2e-boundaries`,
`check:spike-boundaries`, `check:lifecycle`, and the four capability-named APP2
authority gates); spikes, smokes, benchmarks and operations.

Scripts were reordered into readable groups; the flat `scripts` object was kept
and no task runner, script package, shell framework, code generation or
dependency was introduced.

### Two dispositions worth naming

- **`quality:e2e` was kept.** It is `check:e2e` plus the Playwright matrix — a
  deliberately targeted browser tier, not a repository-wide aggregate. Renaming a
  stable public command was out of scope. It is documented as never being a
  default acceptance criterion.
- **The four capability-named APP2 gates were kept**
  (`check:pagination-authority`, `check:storefront-route-authority`,
  `check:storefront-product-detail-authority`,
  `check:storefront-product-detail-correction`). They are checkpoint authority
  gates under capability names, registered before this rule existed. §3.4
  prohibits mass deletion, so they were **reclassified** in
  `VALIDATION_GOVERNANCE.md` §5 as scoped validations and explicitly labelled the
  pattern not to repeat, rather than silently kept or silently removed. A later
  governance checkpoint may retire them.

---

## 5. SonarQube disposition

```text
SONAR_GLOBAL_CONTROL = REQUIRED_BUT_NOT_CONFIGURED
```

Evidence found in the repository:

| Artifact | Path |
|---|---|
| Scanner configuration | `sonar-project.properties` (projectKey `embroidery-commerce`, sources `apps,packages,tools`, lcov paths) |
| Server + database | `infrastructure/compose/docker-compose.dev.yml` — `sonarqube:10.7.0-community`, Compose `quality` profile, loopback `:9000` |
| Profile lifecycle | `pnpm docker:quality:up` / `pnpm docker:quality:down` |
| Runbook | `docs/development/LOCAL_DEVELOPMENT.md` §9 |
| Locked as a control | `CLAUDE.md` §4, `README.md` |

**No CI or external pipeline exists** — there is no `.github/` directory — so
Case B does not apply.

Case A does not apply either: what exists is not a *canonical executable
command*. The documented invocation is a manual
`docker run … sonarsource/sonar-scanner-cli` requiring a human-supplied
`SONAR_TOKEN` and a POSIX-only `$(pwd)` bind mount. Registering it as a root
script would mean either embedding a secret-bearing placeholder or shipping a
command that fails on this repository's primary platform — both inventions.

Case C's disposition was therefore applied, with the partial authority named
precisely rather than claiming none exists. Nothing was installed, no dependency
was added, and no command was invented. Blocking follow-up
**`FU-GOV-Q01-SONAR-COMMAND-01`**, owned by repository infrastructure
governance: provide a portable, token-safe canonical invocation, then register
exactly one root script named `sonar`.

Until then no report may claim SonarQube coverage. The package refactor completes
independently, because removing an invalid aggregate does not depend on
configuring Sonar.

---

## 6. Validation decision table

Canonical in `docs/implementation/VALIDATION_GOVERNANCE.md` §3. Every checkpoint
prompt derives a small matrix from its own changed files:

| Change category | Required validation |
|---|---|
| Markdown-only authority/docs | Prettier for touched docs when applicable, the direct checker/tests created by that checkpoint, `git diff --check` |
| One tool/checker | That tool's focused tests, file-size for touched production/test files, Prettier/ESLint where applicable |
| One backend module | Tests for that module and directly affected seams; scoped typecheck/build only when needed |
| One frontend screen/capability | Component tests for that capability; scoped lint/typecheck/build only when needed |
| OpenAPI operation changed | Relevant API tests plus OpenAPI generation/check and generated-client check |
| Database schema/migration changed | Migration/manifest tests and directly affected repository/integration tests |
| Shared package changed | Tests/typecheck/build for direct consumers, from dependency evidence |
| Gateway/composition changed | Relevant gateway/config/smoke tests |
| Phase closure | An explicit phase manifest of required checkpoints and integration seams — never automatic whole-history regression |
| Release/cross-cutting refactor | A deliberately authorized regression plan |

The table is a selection aid. **It must never become a command.**

A closed checkpoint is re-run only when the current change touches one of its
owned inputs or invariants, and the reason is stated in the current report.

---

## 7. Checkpoint checker execution rule

```text
A checkpoint may add a checker or test file under tools/**,
but it must not register a checkpoint-specific script in root package.json.

Run checkpoint files directly.
```

```bash
node tools/check-app3-g03.mjs
node --test tools/check-app3-g03.test.mjs
```

A package-level script is allowed only for a stable product-development operation
expected to outlive the checkpoint itself.

---

## 8. Full regression rule

A full regression requires an explicit trigger — release candidate, major
dependency upgrade, shared infrastructure refactor, cross-module schema or
contract change, large repository-wide refactor, or explicit human instruction.
It is a separate checkpoint or release activity, **not** a default acceptance
criterion.

## 9. Background and polling prohibition

```text
Do not send a repository-wide aggregate validation to background.
Do not repeatedly poll a long aggregate command.
Prefer small foreground commands with direct bounded output.
```

An individually justified long command is started once, waited on with the
execution mechanism's normal completion signal, and never re-run merely to obtain
output it already produced.

Both required validations for this checkpoint ran in the **foreground** and were
not polled.

---

## 10. Changed files

| File | Change |
|---|---|
| `package.json` | deleted `quality` and the four `check:app*` registrations; regrouped 101 scripts; no renames, no dependency |
| `docs/implementation/VALIDATION_GOVERNANCE.md` | **new** canonical authority |
| `CLAUDE.md` | §2 indexes the new standard; §3 Figma gate no longer described as living in an aggregate; §7 replaces the fixed after-coding command list with the decision table; §9 adds the prohibition; §10 completion standard names the scoped commands actually run |
| `docs/implementation/01-DELIVERY-GOVERNANCE.md` | completion rule points at scoped validation |
| `docs/implementation/07-TESTING-AND-ACCEPTANCE-GATES.md` | §5.1/§5.2 wording, §5.3 forward supersession note, §6.1 Figma gate, §8 "required subset is derived, not fixed" |
| `docs/implementation/README.md` | indexes `VALIDATION_GOVERNANCE.md` |
| `docs/implementation/phases/APP3-DESIGN-TEMPLATES-AND-STUDIO.md` | §6.2 locked inheritance now binds every remaining APP3 checkpoint to scoped validation, direct checker invocation and no script registration |

**Not touched:** `apps/**`, `packages/**`, `tools/**` (read-only), `docs/database/**`,
`docs/design/**`, schema, migrations, OpenAPI artifact, generated client,
`spikes/**`, `infrastructure/**`, `pnpm-lock.yaml`, dependencies.

**No completion report was rewritten** — `git diff --stat -- docs/implementation/reports/`
was empty for Commit A.

### Disclosed remainder — outside allowed files

`docs/architecture/REPOSITORY_STRUCTURE.md` and
`docs/development/LOCAL_DEVELOPMENT.md` still mention `pnpm quality`. Neither is
in this checkpoint's allowed file list, so neither was edited. They are the only
known active documents still naming the deleted command. Follow-up
**`FU-GOV-Q01-DOC-SWEEP-01`**.

Historical evidence still naming `pnpm quality` — completion reports, phase
status blocks, audits, the roadmap, the traceability matrix, the decision
register — was **deliberately left intact**. Those documents record what was true
and what was run at the time; rewriting them would destroy evidence, not correct
instructions.

---

## 11. Interaction with `FU-APP3-G03-QUALITY-AGGREGATE-01`

`APP3-G03` reported `pnpm quality = EXIT 1` from one unattributed failure among
524 cases in the aggregated `node --test "tools/*.test.mjs"` run.

This checkpoint **does not close that follow-up and does not hide it.** Deleting
the aggregate removes the *command*, not the failing case. What changes is that
the failure is no longer a blanket blocker on unrelated checkpoints: under scoped
validation, it is owned by whichever suite contains it and is re-run when that
suite's inputs are touched.

`FU-APP3-G03-QUALITY-AGGREGATE-01` is **re-scoped, still OPEN**: identify the
failing case by running `node --test "tools/*.test.mjs"` once, deliberately, as
its own bounded activity. `GOV-Q01` did not run it — §9 of the directive
explicitly forbids running the root test suite here, and this checkpoint changes
none of its owned inputs.

---

## 12. Validation

Only the validations this checkpoint justifies. It changes `package.json` script
registrations and Markdown governance — no source, no tests, no checkers, no
contracts, no schema.

| Command | Result |
|---|---|
| `pnpm format:check` | **PASS** — "All matched files use Prettier code style!", exit 0 |
| `pnpm lint` | **PASS** — 21/21 tasks successful, exit 0 |
| SonarQube | **N/A — no canonical executable command exists** (§5); `FU-GOV-Q01-SONAR-COMMAND-01` |
| `git diff --check` | **PASS** — clean |

### One-time mechanical assertions

Run as a single bounded `node -e` command; **no permanent checker was created**.

| # | Assertion | Result |
|---|---|---|
| 1 | root `package.json` has no `quality` script | PASS |
| 2 | none of the ten prohibited replacement aggregate names exists | PASS |
| 3 | `format:check` exists | PASS |
| 4 | `lint` exists | PASS |
| 5 | Sonar disposition documented from repository facts | PASS |
| 6 | no root script name matches `check:app<phase>…` | PASS |
| 7 | the four underlying checker files still exist | PASS |
| 8a | `CLAUDE.md` no longer instructs `pnpm quality` | PASS |
| 8b | `01-DELIVERY-GOVERNANCE.md` no longer mandates "quality gates pass" | PASS |
| 8c | `07-TESTING-AND-ACCEPTANCE-GATES.md` carries the supersession note | PASS |
| 9 | 101 scripts preserved (106 − 5 removed); no report rewritten | PASS |

**Deliberately not run**, because this checkpoint changes none of their owned
inputs: root `pnpm test`, all workspace tests, every APP2/APP3 checker, E2E,
OpenAPI checks, database checks, Figma checks, lifecycle checks. No command was
sent to background and none was polled.

---

## 13. Commit protocol

| Commit | Hash | Subject |
|---|---|---|
| A | `fc31a5431188e9b38be4a351f69e88f8633c1948` | `refactor(governance): adopt scoped validation` |
| B | *(this report)* | `docs(governance): record validation refactor` |

- branch is local `production`; **nothing pushed** — `origin/production` remains
  `8b5f3b0279b1920babd05b52014af3b853f526c0`;
- no commit was amended, squashed, rebased or rewritten;
- `APP3-G03`'s two commits are intact and untouched;
- working tree clean after Commit B;
- `.env` was not written and no secret-bearing variable was read or committed —
  `SONAR_TOKEN` was **not** read, and that is precisely why no Sonar script was
  registered.

---

## 14. Status

```text
GOV-Q01 = COMPLETE — REVIEW_DELIVERED

SONAR_GLOBAL_CONTROL = REQUIRED_BUT_NOT_CONFIGURED
FU-GOV-Q01-SONAR-COMMAND-01 = OPEN
FU-GOV-Q01-DOC-SWEEP-01 = OPEN
FU-APP3-G03-QUALITY-AGGREGATE-01 = OPEN — re-scoped
FU-APP3-G02-DEPENDENCY-TABLE-BOUND-01 = OPEN
```

Human review owns `GOV-Q01 = REVIEW_ACCEPTED`.
