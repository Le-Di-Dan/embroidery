# DB9 — Measured Performance & Query Plan Validation — Execution Log

Append-only. One section per checkpoint, written as the checkpoint closes.
Earlier entries are never rewritten; corrections are recorded as new
decisions with an explicit `DEC-DB9-*` ID.

## Decision register

| ID | Decision | Rationale |
|---|---|---|
| DEC-DB9-001 | **DB9 canonical scope = measured performance and query-plan validation**; DB10 = backup/retention/operational durability plus the fresh-setup/upgrade/recovery acceptance audit. | The DB9/DB10 numbering discrepancy (DEC-DB7-002, carried unresolved through DB8) is resolved here, not carried a third time. `DB_ROADMAP.md` §2 titled DB9 "Seed & Fixture Design" and DB10 "Database Acceptance Audit"; `DB6_DB7_DB10_HANDOFF.md` §3/§4 assign DB9 = measured performance, DB10 = backup/retention. The governing DB9 prompt is the deciding authority and matches the handoff. The two definitions also **reconcile rather than conflict**: the roadmap's DB9 exit gate ("deterministic seed produces identical baseline data across machines") is satisfied by DB9-CP1's seeded, reproducible benchmark dataset generator, and the roadmap's DB10 acceptance-audit scope is a superset of the handoff's backup/retention scope. No historical report is renamed; `DB_ROADMAP.md` gains a reconciliation note only. |
| DEC-DB9-002 | **CC-01 is closed as `PASS` by an additive DB9-CP0 correction, not absorbed into DB9 as performance work.** | `DB8_DB9_HANDOFF.md` §2 flagged CC-01 (design session autosave CAS) as the one deferred row not covered by shape-sharing. Preflight confirmed the live repository exists (`DrizzleDesignSessionRepository.saveDocument`, G-DB7-19) — so this was a category-**D** genuine untested concurrency gap, and §51.3 makes an unresolved D a hard blocker. Rather than block, DB9-CP0 wrote the missing correctness test first (`design-races.integration.spec.ts`), converting D → PASS before any measurement began. Converting concurrency correctness into a performance claim is exactly what the governing prompt forbids. |
| DEC-DB9-003 | **CC-15b is a subcase of CC-15, not an independent matrix row.** | `DB8_RACE_COVERAGE_MATRIX.md` has 24 rows, CC-01..CC-24, with no CC-15b row. "CC-15b" is the *test name* of the exact-fit boundary case inside `inventory-races.integration.spec.ts` (`CC-15b: a hold that fits exactly the remaining stock succeeds; the next unit does not`), which the CP2 narrative and the handoff table both wrote as "CC-15/15b". Roll-up naming only — no P0 race is untested. `DB8_COMPLETION_REPORT.md` §4's PASS list, which names CC-15 alone, was already correct. |
| DEC-DB9-004 | **DB8 closed at 8 commits, not 9.** | `DB8_COMPLETION_REPORT.md`'s header claimed 9 and its §8 listed 7 with a note that the closure commit would follow. Git is authoritative: `3775ea7..f7ef9ec` inclusive is exactly 8 commits, all present, all with the expected subjects, linear parents, tree clean, `[ahead 76]` (not pushed). Report omission/miscount only — the artifacts all exist, so an addendum was added and DB9 continued. |
| DEC-DB9-005 | Benchmarks run as **`*.bench.ts` under a separate Jest project**, never in `pnpm test`. | Benchmarks take minutes and must not be a correctness gate's tail latency. Keeping them out of the default `testMatch` means `pnpm test` stays the fast correctness signal while `pnpm bench:db9` stays the measurement entry point — and, critically, benchmarks still compile the **real Nest modules and real repositories** (§13: no synthetic query disconnected from repository code). |

---

## DB9-CP0 — DB8 handoff reconciliation and performance scope lock

**Starting HEAD:** `f7ef9ec` (`docs(database): complete DB8 and DB9 handoff`)
**Branch:** `production`, tree clean, `[ahead 76]` — not pushed.

### Scope

Preflight only. No measurement, no tuning, no schema change. The single
executable change in this checkpoint is the CC-01 correctness test, written
because leaving it open would have blocked DB9 closure under §51.3.

### Preflight results (governing prompt §19)

| # | Check | Result |
|---|---|---|
| 1 | Branch / HEAD / tree | `production`, `f7ef9ec`, clean |
| 2 | Actual DB8 closure commits | 8 commits `3775ea7..f7ef9ec`, subjects and parents verified against `git log --format="%h %p %s"` |
| 3 | 9-vs-8 commit count | Reconciled — DEC-DB9-004, report addendum added |
| 4 | CC-15b | Reconciled — DEC-DB9-003, subcase of CC-15, test exists and passes |
| 5 | 13 deferred races classified A/B/C/D | Done — see §"Deferred race classification" below |
| 6 | CC-01 ownership | Category **D**, resolved to `PASS` — DEC-DB9-002 |
| 7 | DB9/DB10 roadmap numbering | Locked — DEC-DB9-001 |
| 8 | DB7 task-state docs | `DB7_COMPLETION_REPORT.md` closure hash `1d6d546` matches `git log`; the DB8 preflight already ruled the tracker widget stale UI metadata. No repository doc asserts DB7 incomplete. Non-blocking, nothing to correct. |
| 9 | Full static/test baseline | `pnpm test` — exit 0, all turbo tasks pass |
| 10–11 | 31 migrations on a disposable DB, checksum/fingerprint/catalog gates | Deferred to CP1, where the benchmark harness provisions databases anyway; re-run in full at CP7 |
| 12 | Persistent dev DB read-only | `embroidery-dev-postgres-1` is up and healthy but is never a test/benchmark target — every context provisions its own disposable database |
| 13 | No partial DB9 work | Confirmed — no `DB9_*` file existed except `DB8_DB9_HANDOFF.md` |
| 14 | No DB10 work | Confirmed — no DB10 implementation files |

### Deferred race classification (§5.3)

Category **A** = correctness already proven by the *exact same* code path and
arbiter; **B** = no live caller; **C** = needs measured contention work in
DB9; **D** = genuine untested correctness gap (blocks closure).

| CC | Class | Basis |
|---|---|---|
| CC-01 | ~~D~~ → **PASS** | Live `saveDocument` CAS, no shared arbiter. Test written in this checkpoint (DEC-DB9-002). |
| CC-02 | C | `DrizzleDesignCaseRepository.setCurrentVersion` — a `FOR UPDATE` on a *different* table than any proven row. Similar shape, not the same code path. |
| CC-03 | C | `uq_design_versions__case__sent_for_review` is a different index from CC-07's `uq_orders__request`. |
| CC-04 | C | `DrizzleAgreementRepository.setCurrentVersion` — different table, same shape family as CC-02. |
| CC-05 | C | `PolicyConfigurationRepository.publishVersion` — different table. |
| CC-06 | C | `DrizzleQuotationRepository.accept` — `FOR UPDATE` + in-tx re-read of `current_version_id`; distinct from CC-07's arbiter-only gate. |
| CC-08 | C | `uq_production_jobs__order_approval_snapshot` — different index from CC-07's. |
| CC-10 | C | `DrizzlePaymentObligationRepository.satisfy` — different lock anchor. |
| CC-11 | C | `dispatch` vs `satisfy` — cross-repository read-under-lock. |
| CC-12 | C | `shipping_details` `FOR UPDATE` combined with an S24 trigger rejection. |
| CC-13 | **B** | `DrizzleSecureAccessGrantRepository.resolveActive` exists, but no application-layer consumer calls it — nothing races. Owner: the feature that builds signed-link consumption. |
| CC-18 | **A** | `reserve` and `adjust` both take the lock through the *same* `stock-anchor.ts` `SELECT … FOR UPDATE` on `sku_stocks` that CC-15/CC-16 already proved under real contention — exact shared code path, not similar prose. |
| CC-21 | C | `DrizzleNotificationIntentRepository.claimBatch` — a different table and index from CC-19's outbox claim. |

**Outcome: 1 A, 1 B, 10 C, 0 D.** No category-D gap survives preflight, so
§51.3 does not fire. The ten C rows become DB9-CP3 contention scope
(`PERF-C01..C10`) — measured under real multi-connection load *with*
correctness assertions, never marked PASS on throughput alone (§32).

### CC-01 correctness closure

| Item | Value |
|---|---|
| Files | `apps/api/src/modules/design/tests/integration/design-races.integration.spec.ts` (new, 178 lines); `design-fixture.ts` (parameter widened to `{ readonly disposable: DisposableDatabase }`, DEC-DB8-006 pattern) |
| Connections | 2 independently pooled Nest actors against one disposable database |
| Barrier | `alice` updates and holds the row lock → observer polls `pg_stat_activity` for a backend with `wait_event_type = 'Lock'` → releases `alice` only once `bob` is *observably* blocked. Condition-driven, not a sleep. |
| Expected | one save commits, the other matches zero rows and raises `STALE_WRITE` |
| Actual | as expected; `kind = INVARIANT_VIOLATION`, `code = STALE_WRITE`, `retryable = false` |
| Invariant | `autosave_revision` lands on exactly 1 (never 2, never a lost update) and the surviving `design_document` is the winner's |
| Repeats | CC-01b runs the unbarriered variant 10 iterations — 10/10 identical, zero flaky |
| Regression | DB7's `design-session.integration.spec.ts` re-run against the widened fixture — 12/12 pass across both suites |

One assertion was corrected during the run: the first draft expected
`kind = 'GUARD_VIOLATION'`; `guardViolationError` actually classifies as
`INVARIANT_VIOLATION`. The race outcome itself (`STALE_WRITE`, revision 1)
was correct on the first execution — only the taxonomy label was wrong in
the test, and it was fixed in the test, never in the production mapper.

### Documents produced

- `DB9_PERFORMANCE_SCOPE_MATRIX.md` — the scope lock (created this checkpoint)
- `DB8_RACE_COVERAGE_MATRIX.md` — CC-01 relabelled `PASS`
- `DB8_DB9_HANDOFF.md` — §2 corrected, A/B/C/D classification added
- `DB8_COMPLETION_REPORT.md` — §10 addendum (commit count, CC-15b, CC-01)
- `DB_ROADMAP.md` — DB9/DB10 reconciliation note

### Result

**PASS.** No hard blocker. Next checkpoint: **DB9-CP1** — benchmark harness,
dataset tiers and measurement protocol.

---

## DB9-CP1 — Benchmark harness, dataset tiers and measurement protocol

**Starting HEAD:** `623eb78`

### Scope

Build the tooling, prove the tooling, quote no numbers yet.

### Files

| File | Role |
|---|---|
| `bench-timing.ts` | distribution collection — median/p95/min/max plus a separately-kept cold sample |
| `bench-plan.ts` | `EXPLAIN (ANALYZE, BUFFERS, WAL, FORMAT JSON)` → normalised summary with seq-scan/spill/estimate-error flags |
| `bench-environment.ts` | machine and PostgreSQL settings on the record (§14) |
| `bench-uuid.ts` | deterministic, time-ordered `bench_uuid(seed, n)` |
| `bench-dataset-tiers.ts` | S/M/L definitions |
| `bench-dataset*.ts` | set-based SQL generation of catalog, pipeline and queue volume |
| `bench-recorder.ts` | markdown result tables, printed rather than retyped |
| `bench-context.ts` | shared provisioning (added during CP2's file split) |
| `jest.bench.config.mjs` | separate runner (DEC-DB9-005) |

### Measurement protocol (§24)

| Setting | Value | Why |
|---|---|---|
| Warmup | 0–3 samples, discarded | keeps plan-cache and pool-growth cost out of the percentiles |
| Measured samples | 6–60 per row, by cost | enough for a median and p95; p99 is never quoted at these counts |
| Concurrency levels | 1, 2, 4, 8 (queues); 2, 4 (races) | bounded by a 20-core laptop, not by ambition |
| Isolation | one disposable database per suite | the persistent dev database is never a target |
| Write plans | captured inside a rolled-back transaction | `EXPLAIN ANALYZE` genuinely performs the write |
| Reset | queue subsets restored between concurrency levels | each level starts from the same claimable set |
| Failure criterion | any correctness assertion fails ⇒ the row is void | a timing without a result check is not evidence |

### Environment (§14)

```
CPU:             12th Gen Intel(R) Core(TM) i7-12700K (20 logical cores)
RAM:             31.7 GB
Platform:        win32 10.0.26100
Node:            v22.14.0
PostgreSQL:      PostgreSQL 16.14 (Docker, alpine)
shared_buffers:  16384 x 8kB (128 MB)
work_mem:        4096 x kB (4 MB)
eff_cache_size:  524288 x 8kB (4 GB)
max_connections: 100
Storage:         container-backed local volume (Docker Desktop)
Claim:           local, reproducible benchmark evidence — NOT a production SLA
```

### Dataset tiers, actual generated counts

| Table | S | M | L |
|---|---|---|---|
| `products` | 11 | 201 | 1,001 |
| `skus` / `sku_stocks` | 21 / 20 | 801 / 800 | 6,001 / 6,000 |
| `customers` | 21 | 2,001 | 10,001 |
| `custom_requests` | 21 | 3,001 | 20,001 |
| `orders` | 10 | 1,500 | 10,000 |
| `order_items` | 20 | 4,500 | 40,000 |
| `design_versions` | 21 | 6,001 | 40,001 |
| `payment_obligations` | 20 | 3,000 | 20,000 |
| `payment_provider_events` | 40 | 8,000 | 60,000 |
| `audit_events` | 200 | 60,000 | 400,000 |
| `outbox_events` | 100 | 20,000 | 150,000 |
| `notification_intents` / attempts | 60 / 120 | 12,000 / 30,000 | 80,000 / 200,000 |
| `inventory_ledger_entries` | 100 | 20,000 | 150,000 |

Generation: ~0.4 s (S), ~4 s (M), ~36 s (L). Every count is verified by
reading it back, never assumed.

### Harness self-proof (5 tests, tier S)

Declared row counts match; the orders → requests → approvals join resolves
with zero orphans; the skew is real (a claimable minority, not everything or
nothing); `EXPLAIN` returns non-zero planning time, execution time and
buffers; `measure` returns an ordered distribution with the cold sample kept
apart; and `bench_uuid` regenerates the same id, matching the row actually
stored.

### Result

**PASS.** Next: **DB9-CP2**.

---

## DB9-CP2 — Read and query-path performance

**Starting HEAD:** `0b3a427` · **Tier:** M

### Timings (median / p95 ms, 25–60 samples each)

| PERF | Repository method | median | p95 | plan | index |
|---|---|---|---|---|---|
| PERF-R02 | `ProductRepository.findBySlug` | 1.12 | 1.57 | Seq Scan | — (201 rows) |
| PERF-R01 | Q-01 listing shape | 0.64 | 0.71 | Limit → Sort → Seq Scan | — |
| PERF-R02b | `ProductRepository.loadStructure` | 7.74 | — | — | 6 child scans, constant |
| PERF-R03 | `SkuStockRepository.availability` | 5.16 | 7.02 | Index Scan | `uq_sku_stocks__sku` |
| PERF-R07 | `RedirectRuleRepository.resolve` | 1.02 | 2.61 | Index Scan | `uq_redirect_rules__source_path` |
| PERF-R05 | `ContentPageRepository.findByTypeAndSlug` | 1.25 | 1.90 | Index Scan | `uq_content_pages__page_type_slug` |
| PERF-R04 | `GalleryEntryRepository.findBySlug` | 1.02 | 1.29 | Index Scan | `uq_gallery_entries__slug` |
| PERF-R15 | `OrderRepository.findByCode` | 1.16 | 1.47 | Index Scan | `uq_orders__code` |
| PERF-R15b | `OrderRepository.loadItems` | 1.20 | 1.61 | Index Scan | `uq_order_items__order_position` |
| PERF-R34 | `OrderRepository.listTransitions` | 1.21 | 1.58 | Index Scan | `ix_order_transitions__order_id` |
| PERF-R09 | `CustomRequestRepository.findById` | 1.12 | 1.35 | Index Scan | `pk_custom_requests` |
| PERF-R10 | `DesignCaseRepository.listVersions` | 1.32 | 1.53 | Index Scan | `uq_design_versions__case_version` |
| PERF-R11 | `DesignCaseRepository.findVersionInReview` | 1.23 | 1.64 | Index Scan | `uq_design_versions__case__sent_for_review` |
| PERF-R12 | `QuotationRepository.listVersions` | 1.48 | 4.22 | Sort → Bitmap Heap/Index Scan | `uq_quotation_versions__quotation_version` |
| PERF-R29 | `AuditEventRepository.listByTarget` | 1.51 | 1.69 | Index Scan | `ix_audit_events__target__occurred__id` |
| PERF-R17 | Q-17 live-obligation shape | 0.61 | 0.82 | Limit → Seq Scan | — |
| PERF-R20 | Q-20 low-stock shape | 0.55 | 0.68 | Seq Scan | — (est. ratio 6.74) |
| PERF-R21 | Q-21 keyset page walk | 1.77 | 2.56 | Limit → Index Scan | `uq_custom_requests__code` |

### Findings

- **Every P0 and operational read resolves through its intended index.** No
  critical path fell back to a scan for want of one.
- **No N+1** (§27): a four-variant product's structure load issues a constant
  six child-table scans across five child tables, verified by
  `pg_stat_all_tables` deltas with the reader's statistics explicitly flushed
  — without that flush the counter reads zero and would have "proved" the
  absence of an N+1 by measuring nothing at all.
- **Keyset pagination is correct at depth** (§26): 1,000+ distinct rows across
  40 pages, zero duplicates, zero skips, staying on the unique-code index.
- **Four sequential scans flagged, none condemned** (§28): `products` (201
  rows) and `sku_stocks` (800) are too small for an index to win, which is
  correct and uninformative at the locked business scale, so the question was
  carried to CP6 at tier L rather than answered here.

### Defect found in the harness itself

`measure` swallowed thrown assertions into an error tally, so PERF-R17's
correctness check was failing while the row still reported cleanly. Fixed:
failures rethrow by default and `tolerateErrors` must be opted into. A
correctness check that cannot fail the run is not a correctness check.

Two dataset skews were corrected in the same pass — content page `page-7` is
a `LOCAL` page, not `FAQ`, and Q-17 had no `PENDING DEPOSIT` rows because
obligation kind and status used correlated moduli. Both made a query
untestable rather than wrong.

### Result

**PASS.** Next: **DB9-CP3**.

---

## DB9-CP3 — Worker queues, locks and contention

**Starting HEAD:** `912718e` · **Tier:** M

### Queue claim, median ms by worker count

| PERF | Primitive | 1 | 2 | 4 | 8 |
|---|---|---|---|---|---|
| PERF-Q01 | `OutboxEventStore.claimBatch` (25 rows each) | 8.2 | 9.9 | 14.7 | 22.6 |
| PERF-Q02 | `IdempotencyStore.claim` (same key) | 3.5 | 4.7 | 7.0 | 9.6 |
| PERF-Q03 | `NotificationIntentRepository.claimBatch` | 4.9 | 6.8 | 9.8 | — |

`PERF-Q01b` measures the claim's own transaction duration — the window in
which another worker can block — at **6.8–7.1 ms median** for a 25-row batch.
Local evidence only; no production lock-time claim is made (§33).

Correctness travels with every throughput number: zero concurrent
double-claims at every level for the outbox, exactly one owner per key for
idempotency at every level, and at-least-once (which is all G-DB7-58 ever
promised) for notification intents.

**One finding worth recording.** The first PERF-Q01 draft asserted that a row
could never be claimed twice *for all time*, and failed. That is not the
guarantee: an unacknowledged claim becomes claimable again once its retry
time passes, which is the at-least-once retry semantics the outbox is built
on. CC-19's guarantee — and the one now asserted — is that *concurrent*
workers never claim the same row. The assertion was wrong, not the
implementation.

### Category-C races (§32) — outcome asserted, not just throughput

| PERF | CC | Race | Documented outcome, verified | median ms |
|---|---|---|---|---|
| PERF-C01 | CC-02 | design-case pointer ×2 | both commit, serialized on `FOR UPDATE`, pointer never torn | 11.3–12.0 |
| PERF-C02 | CC-03 | `sendForReview` ×2 | at most one active review per case; the partial unique index arbitrates | 5.1–5.7 |
| PERF-C03 | CC-06 | `accept` ×2 | at most one acceptance per version | 6.1–6.2 |
| PERF-C04 | CC-10 | `satisfy` ×2 | settled exactly once, by the named attempt | 8.4–10.8 |
| PERF-C05 | CC-08 | `createJob` ×2 | exactly one job per (order, approval) | 8.6–12.5 |
| PERF-C06 | CC-12 | `saveShippingDetails` ×2 | exactly one detail row, never a mixed value | 9.5–10.4 |
| PERF-C07 | CC-04 | agreement `publishVersion` ×2 | pointer always one of the agreement's own versions | 17.4–17.6 |
| PERF-C08 | CC-05 | policy `publishVersion` ×2 | gapless version sequence, exactly one current pointer | 14.6–15.0 |
| PERF-C09 | CC-11 | dispatch vs `satisfy` | no dispatched order ever carries a live obligation | 8.4–8.8 |
| PERF-Q03 | CC-21 | notification claim ×N | at-least-once, as designed | 4.9–9.8 |

**CC-04 was mis-specified in the matrix.** Its documented race was two
concurrent `setCurrentVersion` calls, but an agreement's pointer move *is*
`publishVersion` — a DRAFT cannot be made current directly, and G-DB7-01 is
right to refuse it. The race measured is the real one; the matrix row is
corrected.

Two dataset skews were corrected because they made a race untestable:
obligation status and attempt status shared a modulus, so no live obligation
had a succeeded attempt to settle; and the design-case series index runs one
ahead of the design-version series.

### Result

**PASS.** All ten category-C rows measured under real contention, each with
its own correctness assertion. Next: **DB9-CP4**.

---

## DB9-CP4 — Writes, triggers and amplification

**Starting HEAD:** `ebc019a` · **Tier:** M

### Write cost

| PERF | Path | median ms | plan |
|---|---|---|---|
| PERF-W05 | `AuditEventRepository.append` into 60k rows | 4.51–4.52 | ModifyTable, WAL > 0 |
| PERF-W06 | `OutboxEventStore.append` | 3.26–3.38 | ModifyTable, WAL > 0 |

Write plans are captured inside a transaction the harness rolls back, because
`EXPLAIN ANALYZE` on a write genuinely performs it and would otherwise
mutate the dataset every later measurement depends on.

### S24 trigger cost (§35 — never disabled)

| PERF | Case | median ms |
|---|---|---|
| PERF-T01 | allowed mutable update on a protected table | 2.92–2.99 |
| PERF-T01b | control: same-shape update, unprotected table | 3.00–3.05 |
| PERF-T02 | rejected immutable update | 1.61–1.80 |

The protected and control updates are indistinguishable at this scale, and a
rejected write is *cheaper* because it aborts before doing any work. The
rejection carries `23000` → `IMMUTABLE_EVIDENCE` through the real mapper: the
statement is wrapped in `withMappedErrors` exactly as a repository is,
because the executor does not map driver errors on its own (DEC-DB8-005).

This is reported as a **comparison between two tables**, not as an isolated
trigger overhead. Producing the latter would require disabling the trigger,
which §35 forbids and which would measure a database that does not exist.

### Index write amplification (PERF-A01)

| Table | indexes | total size | index share |
|---|---|---|---|
| `audit_events` | 5 | 23.9 MB | **62%** |
| `payment_provider_events` | 5 | 2.3 MB | 54% |
| `notification_delivery_attempts` | 2 | 5.3 MB | 44% |
| `inventory_ledger_entries` | 2 | 4.2 MB | 37% |
| `order_transitions` | 3 | 1.1 MB | 29% |
| `outbox_events` | 3 | 4.1 MB | 27% |

`audit_events` is the amplification hotspot: more than half its footprint is
index, and all five are written on every append. **No index was retired** —
each still backs a query shape CP2 measured, and trading a correctness or
lookup index for write throughput is not a trade DB9 makes unilaterally.
Recorded for DB10 monitoring instead.

### Result

**PASS.** Next: **DB9-CP5**.

---

## DB9-CP5 — Pool, timeout and mixed workload

**Starting HEAD:** `c2af37b` · **Tier:** M

### Pool sweep — 24 concurrent reads

| pool max | median ms | ops/s |
|---|---|---|
| 2 | 17.7–18.1 | ~1,350 |
| 5 | 8.4–8.9 | ~2,800 |
| 10 | 6.9–7.1 | ~3,400 |
| 20 | 6.6 | ~3,600 |

The curve flattens after 10 — **which is where `DATABASE_POOL_MAX` already
defaults**. That is evidence for leaving it alone, not for moving it: 10 → 20
buys about 5% for double the backend footprint against a `max_connections` of
100 shared with every other process.

### Timeout behaviour (PERF-P04)

`statement_timeout = 150 ms` against a 2 s statement fires at **152.7 ms** in
both runs, maps to a typed persistence error, leaks no connection string or
password into the serialised error, and — the part that matters operationally
— **returns its connection**: `waiting` is 0 afterwards and the pool serves
the next read immediately. A pool that leaked one connection per timeout is
how a slow query becomes an outage.

### Mixed workload (PERF-P05)

Three separately pooled profiles against one database (reader 10, writer 5,
worker 5): storefront reads run at 1.26–1.42 ms isolated and 1.40–1.59 ms
with audit writes and outbox claims running flat out beside them —
**~1.1–1.2× degradation**, with both competing profiles making real progress.
Degradation is expected; the assertion rules out starvation.

### Recommendations (§40 — ranges, hardware-dependent)

| Setting | Current | Local evidence | Recommendation |
|---|---|---|---|
| API pool max | 10 | curve flattens at 10 | **keep 10**; 8–16 is the sensible band |
| Worker pool max | 10 | 25-row claim ~7 ms; 8 workers still scale | 4–8 per worker process, sized against `max_connections` |
| Claim batch | 25 | 6.8 ms lock window at 25 | keep 25; a larger batch lengthens the lock window roughly linearly |
| `statement_timeout` | 30 s | cancels cleanly at 150 ms | keep 30 s; the mechanism is proven, the value is a policy choice |
| acquire timeout | 10 s | never reached in the sweep | keep 10 s |

### Result

**PASS.** Next: **DB9-CP6**.

---

## DB9-CP6 — Evidence-backed tuning decisions

**Starting HEAD:** `d7ab4b6` · **Tier:** L

The four sequential scans CP2 flagged, re-measured where the question is
meaningful.

| Candidate | Tier L evidence | Decision |
|---|---|---|
| Index for Q-02 product slug | at 1,001 products the plan **flips to `uq_products__slug`** (0.59–0.61 ms) | **REJECTED** — the existing index already earns its keep; there was never anything to add |
| Index for Q-20 low-stock | still a scan at 6,000 rows, estimate ratio **6.67**, 5,743 rows filtered, 1.04–1.06 ms for the whole table | **REJECTED** — the predicate compares two columns of the same row, which no ordinary B-tree can satisfy. Extended statistics would fix the *estimate*, not the plan, and adding a statistics object to a 6,000-row table is tuning for its own sake. Recorded for DB10. |
| Index for Q-17 live obligations | still a scan at 20,000 rows, but the `LIMIT` stops after filtering **49** rows because live obligations are dense; 0.62–0.66 ms | **REJECTED** — the scan never walks the table |
| Pagination change | keyset walk flat with depth: 3,000 distinct rows over 60 pages, zero duplicates, index scan throughout | **REJECTED** — nothing to fix, and offset pagination is explicitly not substituted (§26) |

**Accepted tuning changes: zero. Migrations: zero.** Every candidate was
rejected on measured evidence rather than waved through, and no correctness
index was dropped to save write cost (§42). The DB6 physical baseline is
therefore untouched, exactly as §11 requires when no tuning is warranted.

### Regression gates (§45)

- 31/31 migration checksums — PASS
- `pnpm db:check:manifest` — 78 tables, 833 columns, 164 FK edges, 211 indexes; all checks passed
- Forced full-workspace run (`turbo run test --force`) — 8/8 tasks, **367 api tests**

### Result

**PASS.** Next: **DB9-CP7**.

---

## DB9-CP7 — Global verification, closure and DB10 handoff

**Starting HEAD:** `3ce5b88`

### Two independent closure rehearsals (§46)

Both full benchmark runs provision fresh disposable databases for all nine
suites:

| | Run 1 | Run 2 |
|---|---|---|
| Suites / tests | 9 / 43 | 9 / 43 |
| Dataset counts (S, M and L) | identical | identical |
| Plan shapes and index choices | identical | identical |
| Actual/estimated row counts | identical | identical |

Metric variance across the two runs, as a sample: PERF-R02 1.088 / 1.175 ms,
PERF-R29 1.591 / 1.491 ms, PERF-Q01-c8 23.2 / 22.6 ms, PERF-P01-p10 7.10 /
6.94 ms, PERF-P04 152.675 / 152.709 ms. Contention rows vary more (PERF-C05
8.6 / 12.5 ms), which is what lock contention does — byte-identical timings
are explicitly not required (§46).

### Correctness regression

- Full workspace, forced, no cache: **8/8 tasks** — database 152, persistence
  88, api 367, worker 6, contracts 9, api-client 13, storefront 2, admin 2.
- Migration checksums 31/31; the manifest check passes on all 78 tables.

### Persistent development database

Never a benchmark or test target. `pg_database` swept for `embroidery_db%`
after the final run: **empty**. No leaked disposable database, no mutation of
`embroidery-dev-postgres-1`.

### Result

**PASS.** DB9 complete. DB10 not started.
