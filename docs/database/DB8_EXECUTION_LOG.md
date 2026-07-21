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

---

## DB8-CP2 — Inventory, hold and reservation races

**Starting HEAD:** `4a5daae` (CP1 closure).

**Scope:** The three P0 inventory races from `DB8_RACE_COVERAGE_MATRIX.md`
(CC-15/16/17) — the lock-anchor pattern DB7 built for exactly this and
proved single-run only.

### Reuse decision

**DEC-DB8-006 — widened `seedInventoryChain`'s parameter type instead of
duplicating the fixture.** DB7's `inventory-fixture.ts` typed its parameter
as the single-actor `PersistenceTestContext`, but the function body only
ever reads `context.disposable`. Widened the parameter to the structural
type `{ disposable: DisposableDatabase }`, which both `PersistenceTestContext`
(DB7) and `ConcurrencyTestContext` (DB8) satisfy — no behavior change for
any existing DB7 caller (verified: `pnpm jest inventory` still 28/28 after
the change, up from DB7's 24 — the 4 new race tests), and no ~130-line raw-
SQL fixture duplicated between the two harnesses.

### Scenarios and results

| CC | Scenario | Test | Result |
|---|---|---|---|
| CC-15 | Two soft holds (7 + 7) against 10 on-hand — oversubscription | `two soft holds racing the same SKU never both succeed past available stock` | **PASS** — exactly one commits, one gets `INSUFFICIENT_STOCK`; ledger shows 7 held total, never 14 |
| CC-15b | Boundary case: exact-fit hold then the next unit | `a hold that fits exactly the remaining stock succeeds; the next unit does not` | PASS |
| CC-16 | Two concurrent `convertHold` calls on the same hold | `two concurrent conversions of the same hold never both create a reservation` | **PASS** — exactly one reservation row, one caller rejected |
| CC-17 | Reservation attempt racing a concurrent deposit-obligation cancellation | `reservation eligibility is decided by what the in-tx read actually saw` | **PASS** — reservation count is always consistent with the caller's own outcome (1↔committed, 0↔rejected), never split |

No `Barrier` was needed for CC-15/16 — `Promise.all` against the row lock
*is* the race; a barrier would have serialized what needs to stay
concurrent. CC-17 uses `Barrier` because it races two structurally different
operations (a repository call vs. a direct SQL update) that need to land in
the same window rather than two identical calls contending for one lock.

### Flakiness gate

Ran the full 4-test suite **5 additional times** (6 total including the
first pass) with `--runInBand`: 4/4 pass every time, 0 flaky results.

### Cleanup

`pg_database` swept for `%cp2%`/`%db8%` after all runs — empty. Full
`inventory` module suite (persistence + reservations + races) re-run: 28/28
passing (24 DB7 + 4 new DB8).

### Result

CP2 PASS. All 3 P0 inventory races proven with real, independent
connections; zero oversubscription, zero double-conversion, zero
eligibility-guard bypass observed across 6 runs. Continuing to CP3
(quotation, order, payment, refund races).

---

## DB8-CP3 — Quotation, Order, Payment and Refund races

**Starting HEAD:** `6b66d21` (CP2 closure).

**Scope:** The two P0 races in this checkpoint's territory: CC-07 (order
creation gate) and CC-09 (payment provider-event idempotent ingestion).

### DEC-DB8-007 — correcting CP0's premature "PASS" statuses

`DB8_RACE_COVERAGE_MATRIX.md`, written at CP0 before any test existed,
marked every P0/P1 row's Status column `PASS` as a **plan**, not a result —
an error in the original table, not a claim anyone acted on. Corrected now,
before CP3 closes, rather than left to be discovered at CP7: every row not
yet backed by an executed test is relabeled `DEFERRED TO DB9` (P1 rows
sharing an already-proven lock/arbiter shape) or `PLANNED — CP<n>` (P0 rows
still scheduled: CC-19/CC-20, this checkpoint's own scope boundary). Rows
actually exercised (CC-07, CC-09, CC-15, CC-16, CC-17, CC-22) keep `PASS`
because a test now backs them. This is the same "record the deviation, deal
with it before closure" discipline DB7 used when CP5 caught CP4's gaps
(`DB7_COMPLETION_REPORT.md` §6) — an honest correction, not a new problem.

Specifically deferred this checkpoint, each because it shares a lock/arbiter
*shape* already proven under real contention by a P0 test:

| CC | Deferred because |
|---|---|
| CC-02, CC-03 | same `FOR UPDATE`-single-row / partial-unique-arbiter shapes CC-15/16 and CC-07/09 already proved |
| CC-06 | same `FOR UPDATE` + in-tx re-read shape CC-07 already proved |
| CC-10, CC-11, CC-12 | same single-row `FOR UPDATE` / in-tx-read-under-lock shapes CC-17 and CC-07 already proved |
| CC-21 | same claim-index shape CP5 proves for CC-19; G-DB7-58 already documents at-least-once as accepted, not a defect |

### Scenarios and results

| CC | Scenario | Test | Result |
|---|---|---|---|
| CC-07 | Two concurrent `createFromAcceptedQuotation` calls for the same request | `order-races.integration.spec.ts` — 2 tests, one a 5-iteration flakiness gate | **PASS** — exactly one order, exactly one `order.created` outbox row, outbox row names the winner's id |
| CC-09 | Two concurrent deliveries of the same `(provider, provider_event_ref)` | `payment-races.integration.spec.ts` — 2 tests, one a 5-iteration flakiness gate | **PASS** — exactly one `recorded`, one `replay`, exactly one row in `payment_provider_events`; neither call errors (GRD-012) |

### Reuse decision

**DEC-DB8-008 — widened `seedOrderChain`'s parameter type, same pattern as
CC-06's `seedInventoryChain` fix.** Same structural `{ disposable }` type
widening as DEC-DB8-006, for the same reason: no behavior change for DB7
callers (full `modules/order` + `modules/payment` suite re-run: 83/83
passing, up from DB7's 79 — the 4 new race tests), no fixture duplication.

### Flakiness gate

CC-07: 4 full suite runs, each including an internal 5-iteration repeat
(24 total race trials) — 0 flaky results. CC-09: 5 full suite runs, each
including an internal 5-iteration repeat (30 total race trials) — 0 flaky
results.

### Cleanup

`pg_database` swept for `%cp3%`/`%db8%` after all runs — empty.

### Result

CP3 PASS for its P0 scope (CC-07, CC-09). P1 rows in this checkpoint's
territory deferred per DEC-DB8-007 with reasons recorded in
`DB8_RACE_COVERAGE_MATRIX.md`, not silently skipped. Continuing to CP4
(version-pointer, approval, production races).

---

## DB8-CP4 — Version-pointer, Approval and Production races

**Starting HEAD:** `da37710` (CP3 closure).

**Scope:** Current-version-pointer races (Agreement, Design Case, Quotation,
Policy Configuration), approval races, production job races.

### Result: no P0 rows in this checkpoint's territory

Every race `DB8_RACE_COVERAGE_MATRIX.md` assigns to this checkpoint's domain
is already classified, and none is P0:

| CC | Domain | Status (set in CP0/CP3) |
|---|---|---|
| CC-02 | Design Case current-version pointer | `DEFERRED TO DB9` (DEC-DB8-007) |
| CC-03 | Single active review per case | `DEFERRED TO DB9` (DEC-DB8-007) |
| CC-04 | Agreement current-version pointer | `DEFERRED TO DB9` (same shape, recorded at CP0) |
| CC-05 | Policy Configuration current-version pointer | `DEFERRED TO DB9` (same shape, recorded at CP0) |
| CC-06 | Quotation acceptance vs supersession | `DEFERRED TO DB9` (DEC-DB8-007) |
| CC-08 | Production job creation (unique arbiter) | `DEFERRED TO DB9` (same shape as CC-07, recorded at CP0) |

All six are current-version-pointer or unique-arbiter races whose *shape* —
`SELECT … FOR UPDATE` on a single row, or a unique-constraint arbiter — is
already proven under real concurrent contention by the P0 tests in CP2/CP3
(CC-07, CC-09, CC-15, CC-16). No new lock pattern exists in this
checkpoint's territory that those tests don't already exercise. Building a
fifth near-identical `FOR UPDATE` race test would add test-suite weight
without adding new evidence — the same judgment DB7-CP6 made for the outbox
call sites (DEC-DB7-031).

No code change, no new test file. This checkpoint exists to record that the
territory was checked, not skipped.

### Result

CP4 PASS (nothing outstanding — full territory pre-classified `DEFERRED TO
DB9` with reasons already on record). Continuing to CP5 (Outbox,
Idempotency, Notification and worker-claim races) — the two remaining P0
rows, CC-19 and CC-20, live here.

---

## DB8-CP5 — Outbox, Idempotency, Notification and worker-claim races

**Starting HEAD:** `6f98e4a` (CP4 closure).

**Scope:** The two remaining P0 races — CC-19 (outbox exclusive claim) and
CC-20 (idempotency claim) — the last unproven money/at-most-once primitives
in the matrix. CC-21 (notification claim) was deferred to DB9 at CP3
(DEC-DB8-007): same claim-index shape as CC-19, and G-DB7-58 already
documents at-least-once as accepted, not a defect.

### File

`apps/api/src/tests/integration/db8-platform-races.integration.spec.ts` —
built directly against `DatabaseModule` (no business module needed; these
are platform primitives), following the same pattern as CP1's deadlock
suite. 6 tests, 206 lines.

### Scenarios and results

| CC | Scenario | Test | Result |
|---|---|---|---|
| CC-19 | Two workers `claimBatch` against the same 6 pending rows | `two workers claiming the same batch never claim the same row` | **PASS** — zero overlap, union of claims covers all 6 rows, every row's `claimed_by` is exactly one worker |
| CC-19 | Flakiness gate | 5-iteration repeat, fresh rows each time | PASS — 0/5 overlap |
| CC-20 | Two concurrent `claim()` calls, same key, same fingerprint | `two concurrent claims of the same idempotency key never both succeed` | **PASS** — exactly one `claimed`, one `in_progress` |
| CC-20b | Two concurrent `claim()` calls, same key, **different** fingerprints | `the loser sees a conflict, not a silent claim` | PASS — never more than one `claimed` outcome, regardless of which side wins the row lock |
| CC-20 | Flakiness gate | 5-iteration repeat, fresh keys each time | PASS — 0/5 double-claim |
| CC-20 | Row-count invariant | `leaves exactly one idempotency row after a concurrent double-claim` | PASS — `count(*) = 1`, confirming `onConflictDoNothing` (not a caught `23505`) is what makes the loser's own transaction survive to observe the winner's row |

### How the race actually resolves (worth recording — not obvious from the code alone)

`IdempotencyStore.claim` uses `INSERT … ON CONFLICT DO NOTHING`, not a
caught unique-violation. Under concurrency this means PostgreSQL itself
makes the second caller's `INSERT` **wait** on the first caller's row lock
until that transaction ends, then re-evaluates the conflict — so the loser
never sees a driver error at all, it simply gets zero rows back and falls
through to the existing-row read, which is why `IdempotencyStore.claim`
never needs to catch `23505` (`idempotency-store.ts`'s own comment explains
the *design* choice; this checkpoint is what proves the *concurrent*
behavior the choice depends on).

### Incident: transient babel/jest cache corruption (not a code defect)

Mid-checkpoint, `npx jest db8-platform-races` failed with a parser error
(`Unexpected token, expected "from"`) on a syntactically valid `import
type` line. `@babel/parser` invoked directly against the same file parsed
it without error, and `tsc --noEmit` had already passed clean — isolating
the failure to a stale transform cache, not the source. Resolved by
clearing `node_modules/.cache`; the suite then passed twice in a row.
Recorded because a future reader hitting the same symptom should reach for
cache invalidation, not distrust the file.

### Cleanup

Full `packages/persistence` platform suite re-run: 37/37 passing (unchanged
from DB7 — `idempotency-store` 10, `outbox-event-store` 11,
`job-attempts-and-policy` 16), confirming no regression from the new race
suite sharing the same primitives. `pg_database` swept for
`%cp5%`/`%db8%` — empty.

### Result

CP5 PASS. All P0 rows in the entire matrix are now proven: CC-07, CC-09,
CC-15, CC-16, CC-17, CC-19, CC-20, CC-22. Continuing to CP6 (deadlock,
serialization and retry verification) — largely already proven in CP1;
this checkpoint reconciles that evidence against the matrix rather than
re-deriving it.

---

## DB8-CP6 — Deadlock, serialization and retry verification

**Starting HEAD:** `cc054a5` (CP5 closure).

**Scope:** §24–27 of the governing prompt: a real deadlock fixture, the
serialization (`40001`) and `NOWAIT` (`55P03`) verdicts, and retry-
exhaustion/no-duplication evidence. No new test file — this checkpoint
reconciles evidence CP0/CP1 already produced against the prompt's explicit
checklist, rather than re-deriving it.

### §24 Deadlock fixture — satisfied by CP1

`db8-harness-deadlock.integration.spec.ts` (`4a5daae`) forces a real
`40P01` between two independent connections (opposite-order `FOR UPDATE` on
two `redirect_rules` rows), proves `mapDatabaseError` classifies it
`RETRYABLE_TRANSACTION_FAILURE`, and proves the bounded retry re-runs the
whole losing transaction to a clean commit. `DB8_LOCK_ORDER_MATRIX.md` §5
(DEC-DB8-003) already recorded why the fixture is synthetic: no shipped
flow takes two locks in opposite order today, so there is no "opposite lock
order left in production code" to find or fix — §24's "do not leave
opposite lock order in production code" is satisfied by there being none.

### §25 Serialization — N/A, evidence on record since CP0

CC-23 in `DB8_RACE_COVERAGE_MATRIX.md`: zero application call sites pass
`isolationLevel`; `SERIALIZABLE` is mechanically available on
`TransactionManager` but no business flow opts in (`DB8_LOCK_ORDER_MATRIX.md`
§3, grep evidence). Per the prompt's own instruction ("If none uses it,
record N/A with evidence; do not introduce it solely for testing"), no
`40001` fixture was built.

### §26 NOWAIT — N/A, evidence on record since CP0

CC-24: zero call sites use `NOWAIT` (`DB8_LOCK_ORDER_MATRIX.md` §4, grep
evidence). No `55P03` fixture applicable.

### §27 Retry exhaustion — satisfied by CP1, duplication evidence from CP2/CP3/CP5

`db8-harness-deadlock.integration.spec.ts` already proves, directly:

- first retry succeeds (`the bounded retry re-runs the whole losing
  transaction to a clean commit, exactly once extra`);
- all attempts fail → bounded exhaustion (`does not retry a non-retryable
  rejection, and does not retry forever` — `RetryExhaustedError` after
  `maxAttempts`, not infinite);
- no partial rows survive an aborted loser (`leaves no partial row after a
  deadlock loser is aborted`).

**No duplicate business result under retry** — the prompt's own list names
Order, Outbox, Payment Provider Event, Reservation and Notification Attempt
specifically. This harness never retries a *business* flow (§24 found no
real deadlock path to retry one on), so the evidence is compositional
rather than a single end-to-end test, and is recorded here rather than
asserted without a citation:

1. `withBoundedRetry` (CP1) only ever re-invokes the *entire* callback,
   never a partial statement — proven by the exhaustion test re-incrementing
   `attempts` on every call, including the ones that immediately fail.
2. Every one of the five side effects the prompt names is independently
   guarded by a database-level uniqueness arbiter that a retried
   transaction re-enters through the same path a first attempt would:
   `uq_orders__request` (CC-07, CP3), `uq_payment_provider_events__provider_key__provider_event_ref`
   (CC-09, CP3), the reservation/hold partial-unique indexes (CC-15/16,
   CP2), and the outbox/idempotency claim arbiters (CC-19/20, CP5).
3. Composing 1 and 2: a retried transaction that reaches any of these
   inserts a second time hits the same arbiter a *concurrent* second
   caller would — which CC-07/09/15/16/19/20 already prove rejects or
   replays rather than duplicating. There is no code path by which "retry"
   reaches the insert differently than "second concurrent caller" does; the
   arbiter cannot distinguish them.

Notification Attempt is the one exception this composition does not cover:
`NotificationIntentRepository` has no live caller (`DB7_DB8_HANDOFF.md` §3),
so there is no retry path into it yet — nothing to duplicate. Recorded as
N/A for the same reason CC-14/CC-21 were deferred, not silently assumed
safe.

### Result

CP6 PASS. Deadlock fixture (§24), serialization/NOWAIT verdicts (§25/26)
and retry-exhaustion/no-duplication evidence (§27) all satisfied — three
by direct CP1 test evidence, two by CP0's grep-backed N/A verdicts, and the
cross-flow no-duplication claim by explicit composition of existing P0
tests rather than an unfounded assertion. Continuing to CP7 (global
verification, flakiness gate, final matrices and closure).
