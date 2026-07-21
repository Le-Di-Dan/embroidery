# DB9 → DB10 Handoff

**Compiled:** DB9-CP7.

DB10's canonical scope was locked in DB9-CP0 (DEC-DB9-001): **backup,
retention and operational durability, plus the fresh-setup / upgrade /
recovery acceptance audit**. This document hands over what DB9 measured that
bears on it, and is explicit about what DB9 did *not* establish.

**No production SLA is claimed anywhere in DB9.** Every number below is local
benchmark evidence from one machine (i7-12700K, 31.7 GB, PostgreSQL 16.14 in
Docker) and is quoted as such.

## 1. Operational index-build risk

DB9 accepted **zero** tuning changes and produced **zero** migrations, so
DB10 inherits no pending index build. The relevant risk is therefore about
what already exists rather than what DB9 added:

| Table | Indexes | Index share of size | Note for DB10 |
|---|---|---|---|
| `audit_events` | 5 | **62%** | The amplification hotspot. At 400,000 rows (tier L) the table is the largest object in the schema and more than half of it is index. Any future index change here should use `CREATE INDEX CONCURRENTLY`; an ordinary build would hold a write lock on the busiest append path in the system. |
| `payment_provider_events` | 5 | 54% | Same shape, smaller volume. |
| `notification_delivery_attempts` | 2 | 44% | — |
| `inventory_ledger_entries` | 2 | 37% | — |
| `order_transitions` | 3 | 29% | — |
| `outbox_events` | 3 | 27% | Highest write *rate* despite the lowest index share; the claim path updates rows as well as inserting them. |

DB9 retired nothing: every index above still backs a query shape CP2
measured. If DB10 or a later phase wants to retire one, the §42 protocol
applies — measured evidence first, forward-only `DROP INDEX`, never a
correctness arbiter.

## 2. ANALYZE and autovacuum observations

- The dataset generator runs `ANALYZE` at the end of generation, because a
  plan captured against stale statistics measures the planner's ignorance
  rather than the schema. **DB10 should assume the same is true of the real
  database**: an operational restore or bulk import needs `ANALYZE` before
  any plan observed on it means anything.
- **One statistics gap is on the record.** `sku_stocks`' low-stock predicate
  (`quantity_on_hand <= low_stock_threshold`) shows a **6.67× estimate
  error** at tier L, because the planner cannot correlate two columns of the
  same row without an extended statistics object. DB9 rejected adding one:
  the table is 6,000 rows and the query costs ~1 ms, so it would be tuning
  for its own sake. **If this table ever grows by orders of magnitude, that
  is the first thing to revisit.**
- DB9 did **not** measure autovacuum behaviour, dead-tuple accumulation or
  bloat over time. Disposable benchmark databases live for seconds; nothing
  in DB9 says anything about a long-lived instance. That is DB10's to
  establish.

## 3. Pool and timeout ranges

Measured in CP5, offered as ranges with their hardware dependence stated:

| Setting | Current default | Recommendation | Evidence |
|---|---|---|---|
| API `DATABASE_POOL_MAX` | 10 | **keep 10** (band 8–16) | 24 concurrent reads: 17.7 ms at pool 2, 8.4 at 5, 6.9 at 10, 6.6 at 20 — the curve flattens exactly at the current default |
| Worker pool max | 10 | 4–8 per worker process | a 25-row outbox claim costs ~7 ms; 8 workers still scale sub-linearly |
| Claim batch size | 25 | keep 25 | 6.8 ms lock-hold window at 25; a larger batch lengthens it roughly linearly |
| `statement_timeout` | 30 s | keep 30 s | the mechanism is proven (fires at 152.7 ms when set to 150 ms, maps cleanly, returns the connection); the *value* is a policy choice DB9 has no basis to change |
| acquire timeout | 10 s | keep 10 s | never reached in the sweep |

**Sizing constraint for DB10 to carry into any deployment topology:**
`max_connections` is 100 on the local instance. API pool × API replicas +
worker pool × worker replicas must fit inside whatever the deployed instance
allows, with headroom for maintenance connections. DB9 measured one process
at a time; it did not measure N replicas against one instance.

## 4. High-write table monitoring

Worth watching once real traffic exists, in rough order of expected volume:

1. `audit_events` — largest table, highest index share, appended on every
   audited action.
2. `outbox_events` — insert plus claim-update per event; the claim path takes
   row locks.
3. `notification_delivery_attempts` — one row per delivery attempt, including
   retries.
4. `inventory_ledger_entries` — one row per stock movement.
5. `payment_provider_events` — one row per provider callback, including
   duplicates the idempotency arbiter rejects.

Local write costs for reference only: audit append 4.5 ms, outbox append
3.3 ms, both into an already-populated table at tier M.

## 5. Retention query costs

DB9 measured the *read* shapes retention would use (Q-25 session expiry,
QX-06 grant sweep, QX-10 hold/reservation expiry all appear in the scope
matrix), but did **not** measure retention deletion itself. Specifically not
established:

- The cost of a bulk `DELETE` under the S24 `retention_exempt` path.
- Whether that DELETE needs batching to avoid a long lock hold.
- Bloat and vacuum pressure after a large retention run.

`DB6_S24_TRIGGER_REPORT.md` documents the exemption *mechanism* (a session
GUC an operator job sets); no job exists, and DB9 did not build one. This is
DB10 scope in full.

## 6. Backup and restore workload implications

Not measured by DB9, and flagged rather than guessed:

- Tier L is ~400 MB of generated data across 78 tables; a real dataset's
  size profile is unknown.
- `audit_events` dominates both row count and index footprint, so it will
  dominate backup time and restore index-rebuild time. A restore that rebuilds
  five indexes over hundreds of thousands of rows is the slow step to plan
  around.
- DB9 provisions and drops databases constantly and never saw a restore path;
  nothing here validates `pg_dump`/`pg_restore` behaviour.

## 7. Maintenance-window needs

DB9 produced no schema change, so **no maintenance window is required by
anything DB9 did**. The window-sensitive operations DB10 will need to plan
for are its own: retention runs, any future `CREATE INDEX CONCURRENTLY` on
`audit_events`, and restore rehearsals.

## 8. Remaining application-feature performance gaps

Not DB9's to close, and not silently absorbed:

| Gap | Owner |
|---|---|
| No use-case/application-service layer exists. CP2 measured repository methods; the request-to-response path above them is unbuilt and unmeasured. | application feature work |
| `apps/worker` is still a bootstrap shell. CP3 measured the claim *primitives* under multiple pooled actors; no worker loop calls them in production. | worker application |
| No queue/broker is chosen (`CLAUDE.md` §8). | open ADR |
| Several DB5 shapes have no repository method yet — Q-01 listing, Q-06 sitemap, Q-17/Q-18 admin lists, Q-20 low-stock dashboard, Q-22 admin aggregate, Q-23 unmatched payments, Q-24 expiring quotations. DB9 measured the *query shape* and recorded the absence; it did not invent the method. | application feature work |
| CC-13 (grant revoke-vs-use) — no live consumer of the grant, so nothing races. | the feature that builds signed-link consumption |
| Q-33 analytics readiness — analytics storage is an unresolved DB2 decision; nothing to measure. | DB2 decision |

## 9. What DB9 built that outlives this phase

- **The benchmark harness** (`apps/api/src/tests/benchmark/`): deterministic
  S/M/L dataset generation in SQL against the real migrated schema, plan
  capture, distribution timing, environment capture, and a result recorder
  that prints the tables these documents were transcribed from. Run with
  `pnpm bench:db9`. It is a separate Jest project, so it never slows the
  correctness gate.
- **Per-actor environment overrides** on the DB8 concurrency harness, which
  is what made the pool and timeout sweeps possible without touching any
  other actor's runtime.
- **`DB9_PERFORMANCE_SCOPE_MATRIX.md` and `DB9_QUERY_PLAN_CATALOG.md`**, which
  stay accurate as long as the query shapes and index inventory do. A new
  query shape should add a row rather than start a new document.
