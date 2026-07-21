# DB9 — Query Plan Catalog

**Compiled:** DB9-CP7, transcribed from the benchmark harness's own output
across two independent closure runs (`DB9_EXECUTION_LOG.md` CP7).

Plans come from `EXPLAIN (ANALYZE, BUFFERS, WAL, FORMAT JSON)` against the
generated dataset. Summaries are stored rather than raw JSON node trees: a
megabyte of plan dump in Git is not evidence anyone checks, and the fields
below are the ones a review actually reads. Any plan can be regenerated
byte-for-byte with `pnpm bench:db9` — the dataset is seeded and
deterministic.

**All timings are local, reproducible benchmark evidence. None is a
production SLA.** Environment: i7-12700K (20 threads), 31.7 GB RAM,
PostgreSQL 16.14 in Docker, `shared_buffers` 128 MB, `work_mem` 4 MB.

## Legend

- **est ratio** — planner's estimated rows ÷ actual rows. Far from 1 means
  the planner is guessing; recorded, never auto-acted on.
- **hit/read** — shared buffer hits / disk reads. Warm unless stated.
- **filtered** — rows removed by filter after the scan.

## 1. Storefront reads (tier M — 201 products, 800 SKUs)

| Query | Repository | Plan | Index | act/est | est ratio | hit/read | filtered | median / p95 ms | Decision |
|---|---|---|---|---|---|---|---|---|---|
| PERF-R02 Q-02 | `ProductRepository.findBySlug` | Seq Scan | — | 1/1 | 1.00 | 4/0 | 200 | 1.12 / 1.57 | **PASS** — see PERF-R02-L |
| PERF-R01 Q-01 | listing shape | Limit → Sort → Seq Scan | — | 24/24 | 1.00 | 12/0 | 40 | 0.64 / 0.71 | **PASS** — top-N heapsort, no spill |
| PERF-R03 Q-03 | `SkuStockRepository.availability` | Index Scan | `uq_sku_stocks__sku` | 1/1 | 1.00 | 3/0 | 0 | 5.16 / 7.02 | **PASS** — includes the `FOR UPDATE` lock |
| PERF-R07 Q-07 | `RedirectRuleRepository.resolve` | Index Scan | `uq_redirect_rules__source_path` | 1/1 | 1.00 | 3/0 | 0 | 1.02 / 2.61 | **PASS** |
| PERF-R05 Q-05 | `ContentPageRepository.findByTypeAndSlug` | Index Scan | `uq_content_pages__page_type_slug` | 1/1 | 1.00 | 2/0 | 0 | 1.25 / 1.90 | **PASS** |
| PERF-R04 Q-04 | `GalleryEntryRepository.findBySlug` | Index Scan | `uq_gallery_entries__slug` | 1/1 | 1.00 | 3/0 | 0 | 1.02 / 1.29 | **PASS** |

## 2. Commerce and history reads (tier M)

| Query | Repository | Plan | Index | act/est | est ratio | hit/read | filtered | median / p95 ms | Decision |
|---|---|---|---|---|---|---|---|---|---|
| PERF-R15 Q-15 | `OrderRepository.findByCode` | Index Scan | `uq_orders__code` | 1/1 | 1.00 | 3/0 | 0 | 1.16 / 1.47 | **PASS** |
| PERF-R15b Q-15 | `OrderRepository.loadItems` | Index Scan | `uq_order_items__order_position` | 3/3 | 1.00 | 3/0 | 0 | 1.20 / 1.61 | **PASS** — one query, not one per line |
| PERF-R34 QX-01 | `OrderRepository.listTransitions` | Index Scan | `ix_order_transitions__order_id` | 3/3 | 1.00 | 3/0 | 0 | 1.21 / 1.58 | **PASS** |
| PERF-R09 Q-09 | `CustomRequestRepository.findById` | Index Scan | `pk_custom_requests` | 1/1 | 1.00 | 3/0 | 0 | 1.12 / 1.35 | **PASS** |
| PERF-R10 Q-10 | `DesignCaseRepository.listVersions` | Index Scan | `uq_design_versions__case_version` | 2/2 | 1.00 | 4/0 | 0 | 1.32 / 1.53 | **PASS** |
| PERF-R11 Q-11 | `DesignCaseRepository.findVersionInReview` | Index Scan | `uq_design_versions__case__sent_for_review` | 0/1 | — | 1/0 | 0 | 1.23 / 1.64 | **PASS** — the partial index resolves an empty result in one page |
| PERF-R12 Q-12 | `QuotationRepository.listVersions` | Sort → Bitmap Heap → Bitmap Index Scan | `uq_quotation_versions__quotation_version` | 2/2 | 1.00 | 10/0 | 0 | 1.48 / 4.22 | **PASS** — quicksort in memory, no spill |
| PERF-R29 Q-29 | `AuditEventRepository.listByTarget` | Index Scan | `ix_audit_events__target__occurred__id` | 40/40 | 1.00 | 43/0 | 0 | 1.51 / 1.69 | **PASS** — 40 rows out of 60,000 |
| PERF-R21 Q-21 | keyset page walk | Limit → Index Scan | `uq_custom_requests__code` | 50/50 | 1.00 | 124/0 | 23 | 1.77 / 2.56 | **PASS** — zero duplicates over 40 deep pages |

## 3. Admin scan shapes (tier M, no repository method yet)

| Query | Plan | act/est | est ratio | filtered | median / p95 ms | Decision |
|---|---|---|---|---|---|---|
| PERF-R17 Q-17 live obligations | Limit → Seq Scan | 50/50 | 1.00 | 49 | 0.61 / 0.82 | **PASS** — see PERF-R17-L |
| PERF-R20 Q-20 low stock | Seq Scan | 34/229 | 6.74 | 766 | 0.55 / 0.68 | **PASS with a recorded estimate error** — see PERF-R20-L |

## 4. The same shapes at tier L — where the tuning decision was actually made

| Query | Scale | Plan | Index | act/est | est ratio | filtered | median ms | Decision |
|---|---|---|---|---|---|---|---|---|
| PERF-R02-L | 1,001 products | **Index Scan** | `uq_products__slug` | 1/1 | 1.00 | 0 | 0.60 | **TUNING REJECTED** — the plan flips to the existing unique index on its own; nothing to add |
| PERF-R20-L | 6,000 stock rows | Seq Scan | — | 257/1,714 | 6.67 | 5,743 | 1.05 | **TUNING REJECTED** — a two-column same-row comparison no B-tree can satisfy; 1 ms for the whole table |
| PERF-R17-L | 20,000 obligations | Limit → Seq Scan | — | 50/50 | 1.00 | 49 | 0.64 | **TUNING REJECTED** — the `LIMIT` stops after 49 filtered rows; the scan never walks the table |
| PERF-R21-L | 20,000 requests, 60 pages | Limit → Index Scan | `uq_custom_requests__code` | 50/50 | 1.00 | 23 | 1.88 | **PASS** — flat with depth, 3,000 distinct rows, zero duplicates |

## 5. Write plans (tier M, captured inside a rolled-back transaction)

| Query | Repository | Plan | WAL | median ms | Decision |
|---|---|---|---|---|---|
| PERF-W05 | `AuditEventRepository.append` | ModifyTable → Result | > 0, recorded | 4.51 | **PASS** — 5 indexes maintained per append |
| PERF-W06 | `OutboxEventStore.append` | ModifyTable → Result | > 0, recorded | 3.26 | **PASS** — 3 indexes maintained per append |

## 6. What is deliberately not in this catalog

- **`pg_stat_statements` aggregates.** The extension is not installed in the
  standard image, so N+1 detection uses `pg_stat_all_tables` scan deltas
  instead — which names the looping table rather than just counting
  statements.
- **True cold-cache numbers.** OS and PostgreSQL caches were not controlled
  (§17), so the harness reports a "cold-ish" first sample separately and
  never claims a cold-cache measurement it did not take.
- **Raw JSON plan artifacts.** Regenerable on demand from a deterministic
  dataset; storing them would add weight without adding evidence.
