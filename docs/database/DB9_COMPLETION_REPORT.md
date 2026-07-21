# DB9 — Measured Performance & Query Plan Validation — Completion Report

## A. Verdict

```
DB9  COMPLETE
DB10 NOT STARTED
```

**Branch:** `production`. Tree clean. Not pushed.

## B. Preflight reconciliation

DB8's report left five things to verify before any measurement could
honestly begin. All five were resolved from the repository, not from the
report.

| Item | Finding |
|---|---|
| **DB8 final commits** | The header said 9 and §8 listed 7. Git says **8**: `3775ea7..f7ef9ec` inclusive, all present, linear parents, tree clean, never pushed. Report bookkeeping only — an addendum was added to `DB8_COMPLETION_REPORT.md` §10 and DB9 continued (DEC-DB9-004). |
| **CC-15b** | Not an independent matrix row. It is the name of the exact-fit boundary *test* inside `inventory-races.integration.spec.ts`, rolled up under CC-15. No P0 race was untested (DEC-DB9-003). |
| **The 13 deferred races** | Classified **1 A, 1 B, 10 C, 0 D**. CC-18 is the only genuine A — `reserve` and `adjust` share the *same* `stock-anchor.ts` lock, not merely a similar shape. CC-13 is B: the repository exists but nothing consumes the grant. The other ten were reclassified **C** because a similar shape on a different table or index is not the same code path, so DB8's proof does not transfer. |
| **CC-01** | Category **D** — a live autosave CAS (`DrizzleDesignSessionRepository.saveDocument`, G-DB7-19) with no test. Under §51.3 an unresolved D blocks DB9 closure. Rather than block, CP0 wrote the missing correctness test *first*: two independently pooled actors, released by an observed `pg_stat_activity` lock wait rather than a sleep; the loser gets `STALE_WRITE`, the revision lands on exactly 1, and the unbarriered variant repeats 10/10 clean. **D → PASS** (DEC-DB9-002). Concurrency correctness was not converted into a performance claim. |
| **DB9/DB10 numbering** | Locked (DEC-DB9-001): **DB9 = measured performance and query-plan validation; DB10 = backup, retention and operational durability plus the acceptance audit.** The two source documents reconcile rather than conflict — the roadmap's DB9 exit gate (a deterministic reproducible seed) is exactly what CP1's dataset generator is, and its DB10 acceptance audit is a superset of the handoff's backup scope. `DB_ROADMAP.md` gained a reconciliation note; no historical report was renamed. |
| **DB7 task state** | `DB7_COMPLETION_REPORT.md`'s closure hash `1d6d546` matches `git log`. No repository document asserts DB7 incomplete. Stale UI only; nothing to correct. |

## C. Environment and protocol

```
CPU:             12th Gen Intel(R) Core(TM) i7-12700K (20 logical cores)
RAM:             31.7 GB
Platform:        win32 10.0.26100
Node:            v22.14.0
PostgreSQL:      PostgreSQL 16.14 (Docker, alpine)
shared_buffers:  128 MB   work_mem: 4 MB   effective_cache_size: 4 GB
max_connections: 100
Storage:         container-backed local volume (Docker Desktop)
```

Warmup samples are discarded; 6–60 measured samples per row depending on
cost; the first sample is kept separately as a cold-ish reading rather than
averaged in; p99 is never quoted at these sample counts. Every benchmark
runs against its own disposable database, calls the **real repository
methods** through compiled Nest modules, and carries a correctness assertion
in the same block as its timing. Write plans are captured inside a
transaction the harness rolls back.

**Everything below is local, reproducible benchmark evidence. None of it is a
production SLA.**

## D. Dataset tiers

| Table | S | M | L |
|---|---|---|---|
| `products` | 11 | 201 | 1,001 |
| `skus` / `sku_stocks` | 21 / 20 | 801 / 800 | 6,001 / 6,000 |
| `customers` | 21 | 2,001 | 10,001 |
| `custom_requests` | 21 | 3,001 | 20,001 |
| `orders` / `order_items` | 10 / 20 | 1,500 / 4,500 | 10,000 / 40,000 |
| `design_versions` | 21 | 6,001 | 40,001 |
| `payment_obligations` | 20 | 3,000 | 20,000 |
| `payment_provider_events` | 40 | 8,000 | 60,000 |
| `audit_events` | 200 | 60,000 | 400,000 |
| `outbox_events` | 100 | 20,000 | 150,000 |
| `notification_intents` / attempts | 60 / 120 | 12,000 / 30,000 | 80,000 / 200,000 |
| `inventory_ledger_entries` | 100 | 20,000 | 150,000 |

Generated set-based in SQL against the real migrated schema with every CHECK,
FK and S24 trigger live — nothing is disabled to make seeding faster.
Deterministic from a seed, time-ordered ids matching production's UUIDv7, and
deliberately skewed (hot SKUs, a small queue-ready subset, mostly-terminal
history). Counts are read back and verified, never assumed.

## E. Read performance (CP2, tier M)

Every P0 and operational read resolves through its intended index; medians
1.0–1.5 ms, p95 within roughly 1.5× of median. Details and plans:
`DB9_QUERY_PLAN_CATALOG.md`.

- **No N+1** — a four-variant product's structure load issues a constant six
  child-table scans across five child tables.
- **Keyset pagination correct at depth** — 1,000+ distinct rows over 40 pages
  at tier M and 3,000 over 60 at tier L, zero duplicates, zero skips, index
  scan throughout, latency flat with depth.
- **Four sequential scans flagged, none condemned.** Carried to CP6 and
  resolved there.

## F. Queue and lock performance (CP3, tier M)

| Primitive | 1 worker | 2 | 4 | 8 |
|---|---|---|---|---|
| Outbox `claimBatch` (25 rows each) | 8.2 ms | 9.9 | 14.7 | 22.6 |
| Idempotency `claim` (same key) | 3.5 ms | 4.7 | 7.0 | 9.6 |
| Notification `claimBatch` | 4.9 ms | 6.8 | 9.8 | — |

Lock-hold window for a 25-row outbox claim: **6.8–7.1 ms**. Correctness held
at every level — zero concurrent double-claims, exactly one idempotency owner
per key, at-least-once for notifications (which is all G-DB7-58 promised).

**All ten category-C races measured under real two-connection contention,
each asserting its own documented winner/loser outcome** — never PASS on
throughput alone. Lock waits 5–18 ms depending on the path.

## G. Write and trigger amplification (CP4, tier M)

Audit append 4.5 ms, outbox append 3.3 ms, WAL recorded for both.

S24 measured, never disabled: a protected update (2.9 ms) is
indistinguishable from a same-shape update on an unprotected table (3.0 ms),
and a *rejected* write is cheaper still (1.8 ms) because it aborts before
doing any work — carrying `23000` → `IMMUTABLE_EVIDENCE` through the real
mapper.

Index share of relation size: `audit_events` 5 indexes / **62%**,
`payment_provider_events` 5 / 54%, `notification_delivery_attempts` 2 / 44%,
`inventory_ledger_entries` 2 / 37%, `order_transitions` 3 / 29%,
`outbox_events` 3 / 27%.

## H. Pool and mixed workload (CP5)

24 concurrent reads at pool max 2 / 5 / 10 / 20: **17.7 / 8.4 / 6.9 / 6.6 ms**
median. The curve flattens at 10, which is the current default — evidence for
keeping it. `statement_timeout` fires at 152.7 ms when set to 150 ms, maps to
a typed error, leaks no credential, and returns its connection. Mixed
workload degrades reads **~1.2×** while writer and worker profiles both make
real progress; no starvation.

## I. Tuning changes

**Accepted: none. Migrations: none.**

| Candidate | Tier L evidence | Decision |
|---|---|---|
| Index for Q-02 product slug | plan flips to `uq_products__slug` at 1,001 products | **REJECTED** — the existing index already earns its keep |
| Index for Q-20 low-stock | still a scan, estimate ratio 6.67, 1.05 ms for the whole table | **REJECTED** — a two-column same-row comparison no B-tree satisfies; extended statistics would fix the estimate, not the plan, and is not worth adding to a 6,000-row table |
| Index for Q-17 live obligations | still a scan, but `LIMIT` stops after 49 filtered rows; 0.64 ms | **REJECTED** — the scan never walks the table |
| Pagination change | keyset flat with depth, zero duplicates | **REJECTED** — nothing to fix; offset is explicitly not substituted |

Every candidate was rejected on measured evidence rather than waved through,
and no correctness index was dropped to buy write throughput. The DB6
physical baseline is therefore untouched — 78 tables, 833 columns, 160 FKs,
189 CHECKs, 211 indexes, 30 triggers, 31 migrations, all unchanged.

## J. Regression

- Migration checksums **31/31**; `pnpm db:check:manifest` passes on all 78
  tables (833 columns, 164 FK edges, 211 indexes).
- Forced full-workspace run, no cache: **8/8 tasks** — database 152,
  persistence 88, api **367**, worker 6, contracts 9, api-client 13,
  storefront 2, admin 2.
- The DB7 suites and the DB8 race suite are inside that run and pass
  unchanged; the two API tests added since DB8 are CC-01's.

## K. Metrics

```
Benchmark suites            9
Benchmark tests            43
Independent closure runs    2  (identical suite counts, dataset counts and plans)
DB5 query shapes in scope  44  (all represented, none dropped)
Scope-matrix rows          64
  PASS                     29
  TUNED                     0
  DEFERRED (owner+reason)  34
  N/A (evidence)            1
  BLOCKED                   0
Category-C races measured  10 / 10
Tuning candidates          4 evaluated, 0 accepted
Migrations added            0
```

## L. Handoff

`DB9_DB10_HANDOFF.md` — operational index-build risk (`audit_events` is the
hotspot and would need `CREATE INDEX CONCURRENTLY`), the one recorded
statistics gap, pool/timeout ranges with their `max_connections` constraint,
high-write table monitoring order, and an explicit list of what DB9 did *not*
establish: autovacuum behaviour over time, retention deletion cost, and
backup/restore workload. Application-feature gaps are listed with owners
rather than absorbed.

## M. Commits

DB9-CP0 → closure, oldest first, on `production`, parents linear, never
pushed:

```
623eb78  docs(database): lock DB9 performance scope
0b3a427  test(database): add reproducible benchmark harness
912718e  perf(database): measure critical read paths
ebc019a  perf(database): validate worker queue contention
c2af37b  perf(database): reduce write amplification
d7ab4b6  perf(database): tune pool and mixed workloads
3ce5b88  perf(database): evaluate tuning candidates at scale
```

This report, the plan catalog, the DB10 handoff and the CP1–CP7 execution-log
entries land in one further commit, closing DB9 at that HEAD.

## N. Deviations recorded rather than hidden

- **`623eb78` was amended once**, seconds after its creation and before any
  other work built on it, because a shell quoting mistake had reduced its
  subject line to a single `@`. The tree was identical; only the message
  changed. Recorded here rather than left as an unexplained gap between the
  commit this report cites and any hash a reader might have seen mid-run.
- **The harness had a real defect, found by its own output.** `measure`
  swallowed thrown assertions into an error tally, so a failing correctness
  check could report cleanly. Fixed in CP2: failures rethrow by default.
- **Three dataset skews were corrected** during CP2 and CP3 — a page type, an
  obligation/attempt modulus collision, and a design-case index offset. Each
  made a query or race untestable; none indicated a defect in the code under
  measurement.
- **CC-04 was mis-specified in the DB8 matrix.** Its race is two concurrent
  `publishVersion` calls, not two `setCurrentVersion` calls: a DRAFT cannot
  be made current directly, and G-DB7-01 is right to refuse it.
- **PERF-Q01's first assertion was wrong**, not the outbox. Claiming a row
  can never be claimed twice for all time contradicts the at-least-once retry
  lease the outbox is built on. The guarantee — and the assertion now — is
  that concurrent workers never claim the same row.
- **No true cold-cache measurement is claimed.** OS and PostgreSQL caches
  were not controlled, so the first sample is reported separately as
  "cold-ish" and nothing more is inferred from it.

## O. Final verdict

```
DB9                  COMPLETE
DB10                 NOT STARTED
OVERALL PERSISTENCE  IN PROGRESS
```

---

## P. DB10-CP0 addendum — scope-matrix tally correction

Recorded by DB10's preflight reconciliation (DEC-DB10-003), after
re-deriving the counts from `DB9_PERFORMANCE_SCOPE_MATRIX.md` rather than
from §K.

`PERF-R33` appears twice in that document — once as a scope row and once in
the deferred/handoff table at the end — and was counted twice in the tally.
The corrected figures are:

| Figure | §K said | Actual |
|---|---|---|
| Scope-matrix rows | 64 | **63** unique row ids |
| PASS | 29 | 29 |
| TUNED | 0 | 0 |
| DEFERRED | 34 | **33** |
| N/A | 1 | 1 |
| BLOCKED | 0 | 0 |

No measurement, plan, status or conclusion changes; every row still ends in
exactly one terminal state and none is silently open. The 33 deferred rows
are classified A–F in `DB10_EXECUTION_LOG.md` (DB10-CP0 §5): **1** is DB10
durability scope, **30** are application-feature handoffs, **2** are future
production performance validation, **0** are blockers. No historical text is
rewritten and no report is renamed.
