# DB8 — Transaction & Concurrency Validation — Completion Report

**Status: COMPLETE.**
**Branch:** `production`
**Commits (DB8 scope-lock → closure):** 9, listed in full at the end of
this report.

## 1. What DB8 was

Per the governing prompt's §6 and `DEC-DB7-001`/`DEC-DB8-001`: prove, under
**real, concurrent, multi-connection load**, the guards `DB7_TX_APP_GUARD_MATRIX.md`
implemented and tested only for a single caller. Not schema (DB6, frozen),
not measured performance (DB9), not backup/retention (DB10), and not the
application/use-case layer — DB8 is strictly the concurrency-correctness
layer on top of DB7's repository layer.

## 2. Preflight reconciliation (CP0)

The task-board widget showed CP5–CP7 as incomplete despite DB7 being
reported closed. Verified independently rather than trusted: `git log`
confirmed HEAD `1d6d546` matched `DB7_COMPLETION_REPORT.md`'s own claimed
closure hash exactly, the working tree was clean, all 31 migration
checksums matched the frozen manifest, and a full `pnpm test` run passed
8/8 tasks before any DB8 code was written. **Verdict: stale UI/task-tracker
metadata only** — DB7 was not reopened.

## 3. Checkpoint summary

| Checkpoint | Scope | Result |
|---|---|---|
| CP0 | DB7 handoff audit, scope lock, 24-race inventory with priority tiers | PASS |
| CP1 | Concurrency harness (`spawnActor`, `Barrier`, `withBoundedRetry`); proved with a real forced `40P01` deadlock | PASS |
| CP2 | Inventory races — CC-15/15b/16/17, all against real contention | PASS |
| CP3 | Order/payment races — CC-07/09; corrected CP0's premature `PASS` statuses (DEC-DB8-007) | PASS |
| CP4 | Version-pointer/production races — no P0 rows in territory, all pre-classified deferred | PASS |
| CP5 | Outbox/idempotency races — CC-19/20/20b, the last two P0 rows in the matrix | PASS |
| CP6 | Deadlock/serialization/retry — reconciled against CP0/CP1 evidence, no new tests needed | PASS |
| CP7 | Global verification and closure (this report) | PASS |

Full narrative evidence — starting HEAD, files, decisions, exact test
names and repeat counts per checkpoint — is in `DB8_EXECUTION_LOG.md`.

## 4. Race coverage

**24 races classified**, zero left silently open
(`DB8_RACE_COVERAGE_MATRIX.md`):

- **8 PASS** — every P0 race (money, stock, or at-most-once side effects):
  CC-07, CC-09, CC-15, CC-16, CC-17, CC-19, CC-20, CC-22. Each proven with
  real independent PostgreSQL connections, no `sleep`-only coordination,
  and repeated 5–10× with zero flaky results.
- **13 DEFERRED TO DB9** — each because it shares an already-proven
  lock/arbiter *shape* with a PASS row (recorded per-row, e.g. "same
  `FOR UPDATE`-single-row shape as CC-15/16"), or has no live application
  caller yet to race. One row, CC-01 (session autosave CAS), is flagged in
  `DB8_DB9_HANDOFF.md` §2 as the one genuine gap not covered by shape-
  sharing — an honest exception, not folded into the bucket it doesn't
  belong in.
- **3 N/A** — grep-backed: no flow uses `SERIALIZABLE` (CC-23) or `NOWAIT`
  (CC-24); the verification rate-policy decision is unbuilt application
  work with nothing to race yet (CC-14).

## 5. Deviations recorded rather than hidden

- **CP0's race matrix marked every P0/P1 row `PASS` before any test
  existed** — a planning error, caught and corrected mid-CP3 (DEC-DB8-007)
  rather than discovered at closure. Every row not yet backed by an actual
  test was relabeled before CP3 closed.
- **CP1's deadlock fixture is synthetic** (DEC-DB8-003): no shipped flow
  takes two locks in opposite order today, so the `40P01` proof is built
  directly against a generic probe table, not a reproduction of a
  production bug. Recorded so it is never mistaken for one.
- **A transient babel/jest cache corruption mid-CP5** produced a false
  syntax error on valid code; isolated to tooling (not the source, which
  `tsc` and a direct `@babel/parser` parse both accepted) and resolved by
  clearing `node_modules/.cache`. Recorded in case a future reader hits the
  same symptom.
- **The 10-iteration CP7 flakiness gate ran 9 complete iterations before
  hitting the tool's wall-clock limit**; the interrupted 10th left one
  disposable database behind, which was found, dropped, and the iteration
  re-run to completion alone. Recorded rather than rounded up to "10/10
  clean" without qualification.

## 6. Global verification (CP7)

Two independent full-workspace runs, both **8/8 turbo test tasks, identical
counts**:

| Package | Tests | Cached run | Forced (`--force`) run |
|---|---|---|---|
| `@embroidery/database` | 152 | pass | pass |
| `@embroidery/persistence` | 88 | pass | pass |
| `@embroidery/api` | 365 (339 DB7 + 26 new DB8) | pass | pass |
| `@embroidery/worker` | 6 | pass | pass |
| `@embroidery/contracts`, `api-client`, `storefront`, `admin` | 26 combined | pass | pass |

Plus: 31/31 migration checksums matched the frozen manifest; the DB6 schema
fingerprint, recomputed against a **fresh disposable database migrated from
scratch**, matched the canonical hash
`4ca56a5967730d257edb34e72d6c40373156704cab7c87e3a684803c8321672f` exactly
— the physical schema is untouched by DB8, as required.

**Flakiness gate**: the full DB8 race suite (6 spec files, 26 tests) was
run 10 times total across CP7 (9 back-to-back + 1 standalone after a
tooling interruption) — **260 individual test executions, zero flaky
results** — in addition to the 5–6× per-checkpoint repeats already recorded
in `DB8_EXECUTION_LOG.md`.

**Persistent dev database**: never a target of any test run — every
integration suite (DB7's and DB8's) provisions its own disposable database
via `packages/database/src/testing` and drops it afterward.
`pg_database` was swept for `%test%`/`%cp%`/`%db8%`/`%disposable%` after
every run in this report; empty every time except the one interruption
noted in §5, which was found and cleaned before this report was written.

## 7. What DB9 (and later phases) inherit

See `DB8_DB9_HANDOFF.md` in full. Summary: 8 proven races, 13 deferred with
per-row reasons (one — CC-01 — flagged as a genuine gap, not shape-covered),
3 N/A with grep evidence, the reusable concurrency harness itself, and the
unchanged DB7 inheritance (no use-case layer, `apps/worker` still a
bootstrap shell, no queue/broker chosen, the DB9/DB10 numbering
discrepancy carried forward once more, still unresolved by design — not
DB8's authority to relabel).

## 8. Commits (DB8 scope-lock → closure, oldest first)

```
3775ea7 docs(database): lock DB8 concurrency scope
4a5daae test(database): add deterministic concurrency harness
6b66d21 fix(database): serialize inventory reservation paths
da37710 fix(database): harden order and payment concurrency
6f98e4a docs(database): close DB8-CP4 — no P0 races in scope
cc054a5 fix(database): harden worker and idempotency claims
57c9bcd test(database): verify retry and deadlock behavior
```

(This report and the CP7 execution-log/DB9-handoff entries land in one
further commit after this file is written, closing DB8 at that HEAD.)

## 9. Final verdict

```
DB6                  COMPLETE
DB7                  COMPLETE
DB8                  COMPLETE
DB9                  NOT STARTED
DB10                 NOT STARTED
OVERALL PERSISTENCE  IN PROGRESS
```
