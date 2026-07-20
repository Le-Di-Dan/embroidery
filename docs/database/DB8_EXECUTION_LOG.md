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
