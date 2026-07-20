# DB7 — Test Matrix

**Compiled:** DB7-CP7, from two independent full-workspace `pnpm test` runs
(one cached, one forced/`--force`) against disposable PostgreSQL databases,
plus per-package `jest --json` output for exact per-suite counts. Both runs:
**585/585 tests, 8/8 turbo test tasks, 0 disposable databases left behind,
persistent dev database untouched** (verified by listing `pg_database` for
any `%test%`/`%cp%`/`%disposable%` name after the run).

All integration suites run against a real, disposable PostgreSQL instance —
`packages/database/src/testing` provisions one database per suite, applies
every migration, and drops it in `afterAll`. None of this matrix is unit
tests with a mocked driver.

## By package

| Package | Suites | Tests |
|---|---|---|
| `@embroidery/database` | 5 | 152 |
| `@embroidery/persistence` | 6 | 88 |
| `@embroidery/api` | 22 | 339 |
| `@embroidery/worker` | 2 | 6 |
| **Total** | **35** | **585** |

## `@embroidery/database` (152)

| Suite | Tests | Covers |
|---|---|---|
| `schema/column-metrics.spec.ts` | 82 | Static schema shape assertions — every table's column/constraint/index metadata matches the DB0–DB6 documented design (not integration; no database connection). |
| `errors/map-database-error.spec.ts` | 32 | SQLSTATE-family and named-constraint → `PersistenceError` mapping, unit-level (fabricated driver errors). |
| `config/database-config.spec.ts` | 18 | Environment parsing, URL redaction, SSL mode resolution. |
| `errors/error-mapping.integration.spec.ts` | 12 | The mapper against constraint violations a real PostgreSQL instance actually raises (S24 triggers, named uniques, FK violations). |
| `testing/harness.integration.spec.ts` | 8 | The disposable-database harness itself: provision, migrate, truncate, drop. |

## `@embroidery/persistence` (88)

| Suite | Tests | Covers |
|---|---|---|
| `query/keyset-cursor.spec.ts` | 22 | Cursor encode/decode, unit-level. |
| `transaction/transaction-manager.integration.spec.ts` | 17 | Ambient transaction context (DEC-DB7-006): join-by-default, savepoints, cross-async-task isolation, read-only probe. |
| `platform/job-attempts-and-policy.integration.spec.ts` | 16 | `BackgroundJobAttemptStore` (append-only, survives its own transaction's failure, G-DB7-51/57) and `PolicyConfigurationRepository` (version lifecycle, G-DB7-08). |
| `runtime/database-runtime.integration.spec.ts` | 12 | Pool lifecycle, health check states (`healthy`/`degraded`/`down`), DEC-DB7-009. |
| `platform/outbox-event-store.integration.spec.ts` | 11 | `OutboxEventStore` in isolation — append/rollback, outside-tx guard, G-DB7-47, claim ordering and batching, retry scheduling, dead-letter, S24 payload immutability (G-DB7-54/55/56/59). |
| `platform/idempotency-store.integration.spec.ts` | 10 | `IdempotencyStore` in isolation — claim, in-progress/completed replay, fingerprint mismatch (GRD-030), rollback, complete-once, release, outside-tx guard (G-DB7-52/53). |

## `@embroidery/api` (339)

| Module | Suite | Tests | Key guards |
|---|---|---|---|
| identity | `identity-persistence` | 25 | admin actor existence (G-DB7-50) |
| customer | `customer-identity` | 13 | — |
| customer | `verification-and-grants` | 20 | G-DB7-38/39/40/41/43/45 |
| catalog | `catalog-persistence` | 17 | placement hierarchy (G-DB7-10..13) |
| asset | `asset-persistence` | 19 | — |
| content | `content-persistence` | 24 | agreement current version (G-DB7-01) |
| design | `design-case` | 22 | G-DB7-02, G-DB7-09, G-DB7-15 |
| design | `approval-snapshot` | 17 | — |
| design | `design-template` | 9 | G-DB7-18 (CP5) |
| design | `design-session` | 10 | G-DB7-13, G-DB7-18, G-DB7-19 (CP5) |
| order | `custom-request` | 16 | — |
| order | `order` | 28 | G-DB7-05, G-DB7-21, G-DB7-23, G-DB7-24, G-DB7-25, G-DB7-37 |
| order | `order-outbox` | 6 | G-DB7-54 from a real caller (CP6) |
| quotation | `quotation` | 13 | G-DB7-14/16/17 |
| inventory | `inventory-persistence` | 17 | G-DB7-26, G-DB7-28, G-DB7-29, G-DB7-30 |
| inventory | `inventory-reservations` | 7 | G-DB7-27 (CP5) |
| payment | `payment-persistence` | 29 | G-DB7-06, G-DB7-31..37 |
| production | `production-persistence` | 16 | G-DB7-07, G-DB7-25 |
| notification | `notification-persistence` | 14 | G-DB7-48/49/58 |
| audit | `audit-persistence` | 9 | G-DB7-46 |
| health | `health.controller` | 3 | — |
| config | `app-config` | 5 | — |

## `@embroidery/worker` (6)

| Suite | Tests | Covers |
|---|---|---|
| `worker-persistence.integration.spec.ts` | 3 | The worker app boots on the same persistence runtime as the API (DB7-CP1 §8.2): health check, module boot, open/close a transaction. |
| `worker-lifecycle.service.spec.ts` | 3 | Startup/shutdown logging, unit-level. |

## Guard-ID → test cross-reference

Every guard row in `DB7_TX_APP_GUARD_MATRIX.md` marked "implemented, tested"
is backed by at least one `it()` in the suite named in its own "Owner"
column, verified above by the guard IDs already annotated per-suite in this
matrix and in each suite's own header comment. No guard in that matrix is
marked "tested" without a corresponding assertion — this was the CP5 closure
condition ("zero silent gaps") and CP7 re-confirms it by re-running every
suite rather than re-reading the matrix's own claims.

## What this matrix does not cover

- **Concurrency/race correctness** — every suite here is single-run. Every
  guard row that says "race → DB8 CC-NN" is exactly the boundary: DB7 proves
  the guard is correct for one caller, not for two racing callers. That is
  DB8's mandate, not a DB7 gap.
- **The 16 deferred outbox call sites** listed in `DB7_DB8_HANDOFF.md` (SE-001
  through SE-020 minus SE-006/SE-017/SE-019) have no test here because no
  code exists for them — they are undone business-flow work, not an
  untested guard.
