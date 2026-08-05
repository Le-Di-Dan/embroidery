# `APP3-W01C` — retry Design Session normalization while inspection is in progress

**Status:** `COMPLETE — REVIEW_DELIVERED`
**Branch:** `production`
**Entry HEAD:** `d3d9f1fa5a79c4554e13a07f7252f52efc79391f`
**Commit A:** `bb54f0c`
**Authority:** `IMP-D048` PO-08 (`APP3-G08`, accepted)

---

## 1. What changed

Exactly one worker classification. `AssociationResolutionService` admitted only
an `ACCEPTED` Asset and answered everything else with
`NORMALIZATION_CONTEXT_NO_LONGER_ELIGIBLE` — a `NormalizationRejection`, which
the use case *records and completes*. For a Design Session upload that is wrong
in a specific way: the association and the inspection request are committed in
one transaction, so an attempt can arrive before inspection has finished. The
Asset is not ineligible; it has not been judged yet.

That case now raises a retryable attempt failure. Nothing else moved.

## 2. Classification matrix

For `DESIGN_SESSION_ASSET`:

| Asset state | Outcome | Mechanism |
|---|---|---|
| `ACCEPTED` | proceed | unchanged |
| `INSPECTING` | **retryable** | `WorkerJobError('JOB_TRANSIENT_FAILURE')` |
| `UPLOADED` | terminal | deliberately not admitted — see §3 |
| `REJECTED` | terminal | `NORMALIZATION_CONTEXT_NO_LONGER_ELIGIBLE` |
| missing / deleted / tombstoned | terminal | same |
| wrong intake lane | terminal | same, checked *before* status |
| association missing / inactive / re-pointed | terminal | same, checked first |

For `PRODUCT_SIDE_BACKGROUND` and `DESIGN_TEMPLATE_ASSET`: **unchanged**, including
an `INSPECTING` Asset, which stays terminal. Those associations are created long
after inspection, so waiting could only loop to the dead-letter.

## 3. Why `UPLOADED` is excluded

§5 required evidence before admitting any additional state. There is none:
`APP2-B01`'s Tx B moves the Asset `UPLOADED → INSPECTING` and appends the event
in the *same* transaction, and `IMP-D048` PO-06 has `APP3-B06B` do likewise. A
committed normalization request therefore cannot observe `UPLOADED`. Admitting it
would convert a real defect — an event that should not exist — into a silent
retry loop, so the transient set is exactly `['INSPECTING']` and the gate fails
on any addition.

## 4. Retry signal

`JOB_TRANSIENT_FAILURE`, from the existing closed taxonomy in
`runtime/errors/worker-job-error.ts`. No new mechanism was introduced:

- `dispositionOf` already returns `RETRYABLE` before the attempt cap and
  `TERMINAL` at it, so the existing backoff, lease and dead-letter policy governs
  it and an inspection that never completes dead-letters for an operator rather
  than looping. Global retry counts are unchanged.
- The handler is untouched: a non-verdict failure propagates out of
  `normalize`'s catch exactly as an infrastructure failure already did.
- The message is fixed text carrying no asset, session, association or storage
  identity; only `errorClass` is ever persisted.

No polling, sleeping, scheduler, cron, sweep, second queue, second event
producer, migration or dependency.

## 5. Derivative-claim behaviour

The refusal is raised in step 1 of the use case (`associations.resolve`), and the
claim is taken in step 4 (`prepareOrRecover`). A waiting attempt therefore never
holds a claim, and leaves:

- no `PROCESSING` row — so the next attempt starts clean rather than taking over
  an abandoned one;
- no `FAILED` row — `failClaim` is guarded on `status = 'PROCESSING'`, so it
  matches zero rows;
- no object.

This is a property of *ordering*, not of cleanup, so the gate asserts the order
directly: if the claim ever moved above the resolve, every retry would strand a
row.

`APP3-W01A`'s revalidation rule is preserved — an existing `READY` derivative
does not short-circuit a Session Asset that is still inspecting, because the
association is validated before `REPLAY_READY` is considered. The waiting attempt
also never deletes the winner's bytes: it returns before any object call.

## 6. Convergence, proved

| Scenario | Result |
|---|---|
| attempt N while `INSPECTING` | retryable; no row, no object, no second event |
| repeated early attempts | still retryable; nothing consumed |
| inspection → `ACCEPTED`, attempt N+1 | one `READY NORMALIZED` derivative, `240×180`, one object |
| further delivery | `ALREADY_NORMALIZED`, still one row and one object |
| inspection → `REJECTED`, attempt N+1 | terminal `NORMALIZATION_CONTEXT_NO_LONGER_ELIGIBLE`, no derivative |
| association deleted while waiting | terminal, no derivative |
| `READY` exists, Asset returned to `INSPECTING` | retryable; winner's row and bytes untouched |
| Product Side background `INSPECTING` | terminal (narrowing, against the live schema) |

The producer event count is asserted as `1` throughout: convergence needed no
second event.

## 7. Changed files

Commit A, 9 files.

**Worker (3):** `domain/inspection-pending.ts` (new, 54 lines) — the transient
set, the predicate and the retry factory; `application/association-resolution.service.ts`
(+22 lines, 123 total) — the narrowed branch, with the lane check moved above the
status check so a wrong-lane Asset stays terminal however it is inspected;
`application/association-resolution.service.spec.ts` (+118, 337 total).

**Worker tests (1 new):** `tests/asset-normalization-session-inspection.integration.spec.ts`
(238 lines), live PostgreSQL + MinIO. Named to match the existing
`asset-normalization.*\.integration` convention so it is excluded from the
Docker-free project and picked up by the indexed integration command — **no jest
config change was needed**.

**Tooling (2 new, 1 modified):** `tools/check-app3-w01c.mjs` (449),
`tools/check-app3-w01c.test.mjs` (~530); `tools/check-app3-g08.mjs` — see §9.

**Documentation (2):** phase plan §6.23 + status block; `SCOPED_COMMAND_INDEX.md`
(4 rows).

Zero API, database schema, migration, dependency, lockfile, object-storage,
domain-types, infrastructure, Admin, Storefront, Figma or root-script change.
Root scripts remain 30; migrations remain 34; OpenAPI remains 19 paths.

## 8. Validation

| Command | Result |
|---|---|
| `jest --testPathPatterns=association-resolution` | 21/21 |
| `jest --runInBand --testPathPatterns=asset-normalization.*[.]integration` | **50/50, 4 suites** |
| `jest --runInBand --testPathPatterns=template-svg-normalization[.]integration` | 16/16 |
| `pnpm --filter @embroidery/worker typecheck` | PASS |
| `pnpm --filter @embroidery/worker build` | PASS |
| `node tools/check-app3-w01c.mjs` | PASS |
| `node --test tools/check-app3-w01c.test.mjs` | 47/47 |
| `node --test tools/check-app3-g08.test.mjs` | 56/56 |
| `node tools/check-app3-g08.mjs` / `w01a` / `w01b` / `g06` | PASS (chained) |
| `pnpm format:check` | PASS |
| `pnpm lint` | PASS (24/24) |
| `git diff --check` | clean |

The W01A and W01B integration suites are the directly affected regressions; the
full worker suite was not run. `pnpm quality` was not run.

## 9. Disclosed deviation

**`G08_GATE_MADE_MODE_AWARE_ON_W01C`.** §11 allows `tools/check-app3-w01c*.mjs`
only, and `tools/check-app3-g08.mjs` was edited. G08 was the frontier when it
ran, so it pinned its successors as `BLOCKED_BY_APP3-G08_REVIEW_ACCEPTANCE` —
which §0 and §14 of this directive require to change. Its status assertions are
now mode-aware: exactly two consistent worlds (before W01C and after), with any
mixture failing, keyed on `APP3-W01C = COMPLETE`. The §6.22.5 dependency table
was **not** touched — it records "status after `APP3-G08`", a snapshot that
remains true. This follows the established
`PREDECESSOR_GATES_MADE_MODE_AWARE_ON_*` precedent; the alternative was to leave
an accepted gate red.

Also recorded: the stale duplicate `APP3-B07 = READY_BY_P01_AND_P02 — NOT STARTED`
line was removed in favour of the single `APP3-B07 = READY — NOT STARTED` the
directive requires, completing the reconciliation begun in `APP3-G08`.

## 10. Command ledger

Fingerprint = HEAD + `git diff --name-only` + the files each command reads.

| # | Command | Fingerprint | Result | Decision derived |
|---|---|---|---|---|
| W1 | preflight batch: branch/HEAD/status, g08, w01a, w01b, g06, worker typecheck, worker build | `d3d9f1f`, clean | all PASS | entry accepted |
| W2 | usecase read | as W1 | resolve precedes claim | retryable throw leaves no claim |
| W3 | `storage-failure.ts` + handler read | as W1 | `toRetryableFailure` → `WorkerJobError` | signal identified |
| W4 | `worker-job-error.ts` + runtime grep | as W1 | `JOB_TRANSIENT_FAILURE` not always-terminal | no runtime change needed |
| W5 | repository contract + `failClaim` read | as W1 | guarded on `PROCESSING` | no stale row, no terminal FAILED |
| W6 | resolver spec read | as W1 | existing coverage | extend rather than replace |
| W7 | `jest --testPathPatterns=association-resolution` | after resolver + spec edits | 21/21 | unit classification proved |
| W8 | integration harness reads | as W7 | `seedAsset({status})`, `seedSessionAssociation` exist | no harness change needed |
| W9 | `jest --testPathPatterns=session-inspection-retry` | after spec written | **no terminal result** — 0 matches | file name outside the ignore convention |
| W10 | worker `package.json` + `jest.config.mjs` read | as W9 | integration suites run from an indexed command | renamed the file instead of editing config |
| W11 | `jest --testPathPatterns=asset-normalization-session-inspection.*[.]integration` | after rename | 12/12 | convergence proved |
| W12 | `node tools/check-app3-w01c.mjs` | after checker written | 5 failures, all missing docs/tests | write docs + gate test |
| W13 | `node tools/check-app3-w01c.mjs` + `--test` | after docs, index, gate test | PASS; 44/47 | three checker weaknesses, mine |
| W14 | same pair | after strengthening the checker | 1 failure (line cap), 45/47 | trim the checker |
| W15 | same pair | after trimming | PASS; 47/47 | gate complete |
| W16 | batch: g08 gate tests, worker typecheck, worker build, W01A integration, W01B integration | after all source edits | 56/56; PASS; PASS; 50/50; 16/16 | regressions clear |
| W17 | batch: format, lint, diff, status | as W16 | 5 files unformatted; lint PASS; clean | format them |
| W18 | `prettier --write` + `format:check` + w01c gate | after formatting | PASS | resolver still unformatted |
| W19 | `prettier --write` resolver + format, unit, gate, lint, diff | after formatting | all PASS; 21/21 | ready to commit |

### 10.1 Reused results and skipped duplicates

- `REUSED_RESULT_FROM = W15` for the four predecessor gates in §13's final list.
  `checkApp3W01C` chains `checkApp3G08`, `checkApp3W01A`, `checkApp3W01B` and
  `checkApp3G06` and reported zero failures, so running each again as a separate
  command would have been four duplicate invocations on an unchanged
  fingerprint. Skipped.
- `REUSED_RESULT_FROM = W11` for the focused integration suite: W16 re-ran it as
  part of the broader `asset-normalization.*[.]integration` regression, which
  supersedes rather than repeats it.
- The §4 preflight was run once and never re-run. `git status` was read as part
  of batches, never as a standalone poll.

### 10.2 Rerun accounting

Every repeated command is condition **C** — a targeted fix was made and the
command is the narrowest one proving it: the W01C checker and its tests (W12 →
W13 → W14 → W15, each after a specific fix), `format:check` (W17 → W18 → W19,
after formatting fixes, which §12 explicitly allows), and the unit suite (W7 →
W19, after prettier rewrote the file).

W9 is condition **B**: it produced no terminal test result — the pattern matched
zero files — so W11 is its first real execution, not a rerun.

Worker `typecheck` and `build` were each run exactly twice: once in preflight and
once in final validation, with all source edits in between. No long command was
run twice consecutively on unchanged relevant files, no command exceeded its §12
budget, the full worker suite was never run, and every returned result was
consumed and recorded before the next command was issued.

## 11. Status

```text
APP3-G08 = COMPLETE — REVIEW_ACCEPTED
IMP-D048 = LOCKED
APP3-W01C = COMPLETE — REVIEW_DELIVERED
APP3-W01C RETRY_SIGNAL = JOB_TRANSIENT_FAILURE
APP3-W01C TRANSIENT_ASSET_STATUSES = INSPECTING
APP3-W01C SCOPE = DESIGN_SESSION_ASSET_ONLY
APP3-B06 = REPLANNED — REPLACED_BY_APP3-B06A_AND_APP3-B06B
APP3-B06A = READY — NOT STARTED
APP3-B07 = READY — NOT STARTED
APP3-B06B = BLOCKED_BY_APP3-B06A_AND_APP3-B07
```

Human review owns `APP3-W01C = COMPLETE — REVIEW_ACCEPTED`.

Working tree clean. Nothing pushed.
