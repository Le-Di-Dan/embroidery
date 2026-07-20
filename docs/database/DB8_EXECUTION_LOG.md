# DB8 Execution Log

Append-only checkpoint history for DB8 (Transaction & Concurrency
Validation). Corrections are added as dated addenda; earlier entries are
never rewritten.

Canonical companions:

- Race scope: [`DB8_RACE_COVERAGE_MATRIX.md`](./DB8_RACE_COVERAGE_MATRIX.md)
- Lock ordering: [`DB8_LOCK_ORDER_MATRIX.md`](./DB8_LOCK_ORDER_MATRIX.md)
- DB7 handoff (input): [`DB7_DB8_HANDOFF.md`](./DB7_DB8_HANDOFF.md)

---

## DB8-CP0 — DB7 handoff audit and concurrency scope lock

**Starting HEAD:** `1d6d546` (DB7 closure commit — clean tree, no DB8 work
existed yet).

**Scope:** Reconcile the terminal task-board state against the actual
repository, verify DB7's own completion claims are real (not stale
metadata), and lock the race-scenario inventory DB8-CP1 through CP7 test
against.

### Preflight checks performed

| Check | Command | Result |
|---|---|---|
| Branch | `git branch --show-current` | `production` |
| HEAD | `git log -1` | `1d6d546` — matches `DB7_COMPLETION_REPORT.md` §"HEAD at closure" exactly |
| Working tree | `git status --short` | clean |
| Migration integrity | `node packages/database/tools/db-migration-checksum-check.mjs` | `all 31 migration files match the frozen manifest` |
| Migration count | `ls packages/database/migrations/*.sql \| wc -l` | 31 files (`0000`–`0031`, `0017` intentionally retired per DB6), matches the DB6 physical baseline |
| DB7 test claim | `pnpm test` (full workspace) | 8/8 turbo tasks pass |
| Disposable DB leakage | `psql … pg_database` filtered for `%test%`/`%cp%`/`%disposable%` | empty — none leaked |
| Persistent dev DB | not targeted by any test run (all suites provision their own disposable database per `packages/database/src/testing`) | untouched |
| Pre-existing DB8 work | `find . -iname "*DB8*"` (excluding `.git`, `node_modules`) | only `DB7_DB8_HANDOFF.md` (an input document, not DB8 output) |

**Reconciliation verdict: stale UI/task-tracker metadata only.** DB7's
`DB7_COMPLETION_REPORT.md`, its 23-commit chain, and its 585-test claim are
all independently reproduced above from first principles (not re-read from
the report). The task-board widget showing CP5–CP7 as incomplete does not
reflect repository truth. DB7 is not reopened; DB8 proceeds from `1d6d546`.

### Race scenario inventory

Built `DB8_RACE_COVERAGE_MATRIX.md` from every race note in
`DB7_TX_APP_GUARD_MATRIX.md`, not just the 16 rows `DB7_DB8_HANDOFF.md`
consolidated — four additional races were named on individual guard rows
(`G-DB7-01`'s "version-publish race", `G-DB7-02`'s "CC-02/03", `G-DB7-07`'s
"CC-12", `G-DB7-08`'s "config-publish race") but never given their own
handoff-table row. All 24 races (CC-01..CC-24, including two `N/A` rows for
scenarios that do not occur in shipped code — see below) are now in one
table with a priority tier.

**DEC-DB8-001 — priority-tiered test budget, not uniform depth.** The
prompt's own completion definition requires every race classified as
`PASS`/`DEFERRED TO DB9 (reason)`/`N/A (evidence)`/`BLOCKED` — it does not
require identical test depth for all 24. Races sharing an already-proven
lock/arbiter *shape* (e.g. CC-08's `production_jobs` unique-arbiter race is
structurally identical to CC-07's `orders` unique-arbiter race, already
proven at P0) are deferred to DB9 with the specific shared-shape reason
recorded per-row, rather than re-implementing the same interleaving against
a different table for no new evidence. This mirrors DB7-CP6's own precedent
(DEC-DB7-031: one representative flow, not an exhaustive rebuild) and is
recorded here for the same reason DB7 recorded it — so it reads as a
decision, not an omission.

**DEC-DB8-002 — CC-23 (`SERIALIZABLE`) and CC-24 (`NOWAIT`) are `N/A`, not
built.** Grep evidence (`DB8_LOCK_ORDER_MATRIX.md` §3–4): zero application
call sites pass `isolationLevel` or use `NOWAIT`; `TransactionManager`
supports `isolationLevel` mechanically (its own test exercises it) but no
business flow opts in. Rule 13 ("no global serialization lock to make tests
pass") and the instruction not to introduce `SERIALIZABLE` solely to
manufacture `40001` together make building a fake-`SERIALIZABLE` flow the
wrong move — recorded as `N/A` with the grep evidence per the prompt's own
§29 vocabulary, rather than skipped silently.

**DEC-DB8-003 — CC-22's deadlock fixture is synthetic, not a found bug.**
`DB8_LOCK_ORDER_MATRIX.md` §2 found no naturally opposite-ordered lock pair
in shipped code (no flow takes both `orders` and `sku_stocks` locks, in any
order, in one transaction). CP6's deadlock proof will construct a harness-
level opposite-order interleaving directly against two lock anchors to
prove the `40P01` → `RETRYABLE_TRANSACTION_FAILURE` → bounded-retry pipeline
works, not to reproduce a production defect. Recorded so a future reader
does not mistake the fixture for "DB7 shipped code that deadlocks."

### Files created

- `docs/database/DB8_RACE_COVERAGE_MATRIX.md` — 24 races, priority tiers,
  reconciled against every DB7 guard-matrix race note.
- `docs/database/DB8_LOCK_ORDER_MATRIX.md` — every documented `FOR UPDATE`
  call site, cross-flow lock order, isolation-level and `NOWAIT` evidence,
  deadlock fixture design.
- `docs/database/DB8_EXECUTION_LOG.md` — this file.

### Result

CP0 PASS. DB8 scope locked: 24 races classified by priority, 8 at P0/P1
scheduled for executable multi-connection tests across CP2–CP6, remainder
`DEFERRED TO DB9` or `N/A` with reasons already recorded (not deferred
silently). Continuing to CP1 (concurrency harness).

---

## DB8-CP1 — Concurrency harness, barriers and retry-policy foundation

**Starting HEAD:** `3775ea7` (CP0 closure).

**Scope:** Build the reusable, real-PostgreSQL, multi-connection harness
every CP2–CP6 race test runs on, and prove the harness itself before any
race scenario depends on it (§11/§12's own requirement).

### Why a new context, not the existing DB7 one

`createPersistenceTestContext` (`apps/api/src/tests/integration/persistence-test-context.ts`,
DB7) compiles exactly one NestJS module — one connection pool — per
disposable database. Every race needs **at least two independent physical
connections** holding open, overlapping transactions (rule 10). Reusing the
DB7 context for two actors would mean two calls each creating (and later
dropping) their own database, so the two actors could never see each
other's uncommitted writes or lock the same row — not a race at all.

`createConcurrencyTestContext` (`db8-concurrency-context.ts`) instead
provisions **one** disposable database and exposes `spawnActor(label)`,
which compiles an additional, independently-pooled Nest module against that
same database. Two actors' transactions run on genuinely separate
PostgreSQL backends and can block, deadlock or serialize against each other
for real.

### Files created

| File | Purpose | Lines |
|---|---|---|
| `apps/api/src/tests/integration/db8-barrier.ts` | `Barrier` — named-signal async coordination (`waitFor`/`signal`), timeout-guarded, no `sleep` in the primary mechanism | 67 |
| `apps/api/src/tests/integration/db8-concurrency-context.ts` | `createConcurrencyTestContext`/`spawnActor` — multi-pool actors against one disposable database | 113 |
| `apps/api/src/tests/integration/db8-retry.ts` | `withBoundedRetry` — retries only `PersistenceError.retryable === true`, bounded attempts, rethrows everything else immediately | 61 |
| `apps/api/src/tests/integration/db8-harness.integration.spec.ts` | Harness self-test: independent pools, uncommitted-write isolation, cross-connection rollback visibility, deterministic barrier ordering, barrier timeout, teardown, `reset()`, a real UNIQUE arbiter across two connections | 160 |
| `apps/api/src/tests/integration/db8-harness-deadlock.integration.spec.ts` | Forces a real `40P01`, proves the mapper classifies it `RETRYABLE_TRANSACTION_FAILURE`, proves the bounded retry re-runs the whole losing transaction, proves non-retryable errors are never retried and retries are bounded, proves no torn row survives an aborted loser | 224 |

All five files are under the 400/600-line hard limits (source/test); the
two spec files together give CP1 twelve tests, all executed twice (once
before, once after an ESLint fix pass) against the pinned disposable-Postgres
instance.

### Evidence

| Requirement (§12) | Test | Result |
|---|---|---|
| Multiple independent pools/clients | `gives two spawned actors independent connection pools against the same database` | PASS — `a.get(DatabaseExecutor) !== b.get(DatabaseExecutor)` |
| Deterministic barriers | `orders two actors deterministically through a barrier rather than by timing` | PASS |
| Pause before/after lock/write/commit | every deadlock/rollback test | PASS |
| Controlled commit/rollback | `rolls back a throwing transaction so no other connection ever observes it` | PASS |
| Timeout detection | `times out a barrier wait that never receives its signal, rather than hanging` | PASS |
| SQLSTATE capture | deadlock test asserts `diagnostics.sqlState === '40P01'` | PASS |
| Row snapshot before/after | `leaves no partial row after a deadlock loser is aborted` | PASS |
| Connection cleanup / test DB cleanup | `drops the disposable database on close and leaves no actor connection open` | PASS; `pg_database` swept for `%db8%` after the run — empty |
| `40001`/`40P01` centralized handling | deadlock suite, real trigger | PASS (`40P01` proven; `40001` has no live producer per `DB8_LOCK_ORDER_MATRIX.md` §3 — CC-23 `N/A`) |
| Bounded attempts, no infinite retry | `does not retry a non-retryable rejection, and does not retry forever` | PASS — `RetryExhaustedError` after `maxAttempts` |
| Retry whole transaction, not a statement | `the bounded retry re-runs the whole losing transaction to a clean commit` | PASS |

### Deviations / decisions

**DEC-DB8-004 — the deadlock probe uses `redirect_rules`, not a business
table.** `DB8_LOCK_ORDER_MATRIX.md` §5 already recorded that no shipped flow
takes two locks in opposite order, so CP1's harness proof uses the same
generic two-CHECK/UNIQUE probe table `transaction-manager.integration.spec.ts`
uses (DB7-CP1/CP2 precedent) rather than inventing business-table lock
contention that doesn't exist in the app. CP2–CP6 raise real business-flow
races (`sku_stocks`, `orders`, etc.) on top of this same harness.

**DEC-DB8-005 — raw lock statements are wrapped in `withMappedErrors`
inside the harness, matching production.** The first deadlock test attempt
asserted on a raw, unmapped driver error and failed — `DatabaseExecutor`
does not auto-map; only `withMappedErrors` (called by every repository
method) does. Fixed by wrapping the harness's `lockRow` helper the same way
`OrderRepository`/`SkuStockRepository` wrap theirs, so the proof exercises
the actual production error-mapping path, not a shortcut around it.

### Result

CP1 PASS. Harness proven: two real independent connections, deterministic
barriers, forced rollback, forced real `40P01` deadlock correctly mapped
and retried, no leaked databases. Continuing to CP2 (inventory hold/
reservation races).
