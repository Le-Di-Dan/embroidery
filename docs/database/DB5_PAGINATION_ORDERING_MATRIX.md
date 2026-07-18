# DB5 — Pagination & Ordering Matrix

**Date:** 2026-07-18 · **Git HEAD:** `456e101`
**Normative:** [ADR-DB5-001](../adr/database/ADR-DB5-001-PAGINATION-STRATEGY.md).
This is the per-query expansion of that ADR's R5 classification.

## 1. Legend

- **Class:** `OFFSET` · `KEYSET` · `TOP_N` · `IMMUTABLE_CURSOR` · `BATCH_SCAN`.
- **Tie-break:** the unique key that makes the sort a **total** order.
- **Cursor:** fields encoded in the opaque cursor token (`KEYSET` /
  `IMMUTABLE_CURSOR` only).
- **Concurrent-write behavior:** what happens if rows are inserted while a
  user pages.
- **Aligned?** does the serving index key order match the sort exactly, so
  no sort node is needed.

## 2. Listing queries

| Q | Class | Sort keys | Dir | Tie-break | Cursor | Nulls | Archive/status predicate | Index | Aligned? | Concurrent writes | Page size |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Q-01 products | OFFSET | `display_order` | ASC | `id` | — | n/a (NOT NULL) | `status='PUBLISHED'` in index | IDX-065 | yes | boundary may shift by one; accepted (≤100 rows, editorial order) | `[cfg]` |
| Q-04 gallery | OFFSET | `display_order` | ASC | `id` | — | n/a | `status='PUBLISHED'` in index | IDX-066 | yes | as Q-01 | `[cfg]` |
| Q-10 design versions | OFFSET | `version` | DESC | `id` DESC | — | n/a | none (all versions shown) | IDX-023 backward | yes | new version appears at page 1; harmless | `[cfg]` |
| Q-12 quotation versions | OFFSET | `version` | DESC | `id` DESC | — | n/a | none | IDX-039 backward | yes | as Q-10 | `[cfg]` |
| Q-21 requests by status | OFFSET | `created_at` | DESC | `id` DESC | — | n/a | `status = ?` as leading key | IDX-073 | yes | boundary shift possible; **most likely future KEYSET candidate** (ADR R8) | `[cfg]` |
| Q-23 failed payments | OFFSET | `created_at` | DESC | `id` DESC | — | n/a | `status IN (...)` in index | IDX-076 | yes | tiny set | `[cfg]` |
| **Q-16 reconciliation** | **KEYSET** | `received_at` | DESC | `id` DESC | `(received_at, id)` | n/a | none | IDX-079 | yes | **exact** — callbacks arriving mid-review cannot repeat or skip evidence rows | `[cfg]` |

Q-16 is the only admin listing using `KEYSET`, and the reason is specific:
`payment_provider_events` is append-heavy **and** written concurrently by
provider callbacks while an admin reviews. Offset paging would repeat or
skip financial evidence during exactly the workflow where completeness
matters most.

## 3. Fixed top-N (no paging)

| Q | Sort | Tie-break | Index | Why TOP_N |
|---|---|---|---|---|
| Q-17 pending deposit | `created_at` ASC | `id` | IDX-074 + IDX-075 | worklist, oldest-first; typically one page |
| Q-18 pending final payment | `created_at` ASC | `id` | IDX-074 + IDX-075 | same |
| Q-19 production queue | `created_at` ASC | `id` | IDX-082 | same |
| Q-20 low stock | `id` | `id` | none (seq scan) | whole set fits one page |
| Q-24 expiring quotations | `valid_until` ASC | `id` | IDX-084 | short horizon window |
| Q-22 dashboard (12 buckets) | per bucket | `id` | per bucket | counts + short lists |
| QX-07 effective agreement | `effective_from` DESC | `id` DESC | IDX-108 | returns exactly 1 |
| QX-08 merge review | `created_at` ASC | `id` | none (seq scan) | handful of rows |

**Worklists sort ascending; admin listings sort descending.** Q-17/18/19 are
processed oldest-first, Q-21/23 are browsed newest-first. Each serving index
matches its own query's direction (ADR-DB5-001 R3) — this is why IDX-074 is
ascending while IDX-073 is descending, and the difference is deliberate.

## 4. Immutable history cursors

| Q | Table | Sort | Tie-break | Cursor | Index | Why exact |
|---|---|---|---|---|---|---|
| Q-29 audit | TBL-072 | `occurred_at` DESC | `id` DESC | `(occurred_at, id)` | IDX-095/096/097/098 | append-only, unbounded; rows never change |
| QX-01 request transitions | TBL-042 | `id` ASC | `id` | `id` | IDX-100 | `bigint` identity = insert order, total on its own |
| QX-01 order transitions | TBL-045 | `id` ASC | `id` | `id` | IDX-101 | same |
| QX-01 job transitions | TBL-063 | `id` ASC | `id` | `id` | IDX-102 | same |
| **QX-02 saga resume** | TBL-045 | `id` ASC | `id` | `id` | IDX-103 | **replay must be gap-free and deterministic** |
| Ledger replay | TBL-019 | `id` ASC | `id` | `id` | IDX-115 | **rebuild source of truth for stock balances** |

The last two are why `IMMUTABLE_CURSOR` exists as a class rather than being
folded into `OFFSET`:

- **Ledger replay** rebuilds stock balances (DB4 §3). An offset-paged replay
  that skipped one row during concurrent appends would silently produce a
  **wrong balance** — a correctness failure with no error message.
- **Saga resume** (QX-02) reconstructs which compensation steps already ran.
  A skipped step would leave an order half-compensated (CC-13).

For `bigint` identity tables a single `id` key is already a total, monotonic
order, so no second sort key is needed (ADR-DB5-001 R2).

## 5. Worker batch scans

Progress is made by **mutating claimed rows out of the claimable
predicate** — never by an offset (ADR-DB5-003 R1/R6).

| Q | Table | Order | Nulls | Index | Class |
|---|---|---|---|---|---|
| **Q-27/QX-04** outbox | TBL-073 | `next_attempt_at, id` | **`NULLS FIRST`** | IDX-088 | CONTENDED_CLAIM |
| QX-03 notification | TBL-070 | `created_at, id` | n/a | IDX-091 | CONTENDED_CLAIM |
| Q-25 sessions | TBL-025 | `last_activity_at, id` | n/a | IDX-085 | SWEEP |
| Q-26 assets | TBL-022 | `created_at, id` | n/a | IDX-086 | SWEEP |
| Q-26 derivatives | TBL-024 | `created_at, id` | n/a | IDX-087 | SWEEP |
| QX-05 idempotency TTL | TBL-074 | `expires_at, id` | n/a | IDX-093 | SWEEP |
| QX-05 stuck records | TBL-074 | `claimed_at, id` | n/a | IDX-094 | SWEEP |
| QX-06 grants | TBL-008 | `expires_at, id` | n/a | IDX-105 | SWEEP |
| QX-10 holds | TBL-020 | `expires_at, id` | n/a | IDX-109 | SWEEP |
| QX-10 reservations | TBL-021 | `expires_at, id` | `IS NOT NULL` in predicate | IDX-110 | SWEEP |
| Q-06 sitemap | TBL-066/012/064 | `id` | n/a | IDX-067/065/066 | full enumeration |
| Asset tombstone | TBL-022 | `id` | n/a | IDX-133 | SWEEP |
| Challenge/session/outbox cleanup | various | time key, `id` | n/a | IDX-112/121/090 | SWEEP |

**IDX-088's `NULLS FIRST` is the one null-ordering decision that changes
behavior.** `next_attempt_at` is NULL for never-deferred events; the default
`NULLS LAST` on an ascending key would sort every fresh event to the far end
of the index — the opposite of FIFO, and a silent performance failure rather
than an error.

## 6. Queries with no pagination

Single-row or single-graph reads: Q-02, Q-03, Q-05, Q-07, Q-08, Q-09, Q-11,
Q-13, Q-14, Q-15, Q-28, Q-30, Q-31, Q-32, QX-09, QX-11, and all 30
additional retained access paths in
[`DB5_ACCESS_PATH_MATRIX.md`](./DB5_ACCESS_PATH_MATRIX.md) §3.

## 7. Cross-cutting rules (restated from ADR-DB5-001)

1. **Every sort ends in a unique tie-breaker.** No exceptions in this matrix.
2. **Mixed sort directions are never used** — they cannot be served by one
   B-tree scan direction.
3. **A descending sort needs no separate index** — B-trees scan backwards
   (Q-10, Q-12 use the ascending unique indexes IDX-023/039).
4. **Status/archive predicates define the paged set** and live in the index,
   not in post-fetch filtering — otherwise page sizes become ragged.
5. **Page sizes are bounded policy configuration**, never client-dictated;
   an unbounded page size on history queries is a DoS surface.
6. **No listing takes a lock to stabilize its page.** Transaction-adjacent
   read consistency comes from write-path locks
   ([`DB3_CONCURRENCY_SPECIFICATION.md`](./DB3_CONCURRENCY_SPECIFICATION.md)),
   not from pagination.

## 8. Roll-up

| Class | Count |
|---|---|
| `OFFSET` | 7 |
| `KEYSET` | 1 |
| `TOP_N` | 8 (+12 dashboard buckets) |
| `IMMUTABLE_CURSOR` | 6 |
| `BATCH_SCAN` | 13 |
| No pagination | 16 + 30 retained paths |

**Alignment: every paginated query's serving index matches its sort order
and direction**, so no catalogued listing requires a sort node. The two
exceptions are the deliberate no-index cases (Q-20, QX-08), where the sets
are small enough that sorting is free.

## 9. Deferred

| Item | Owner | Acceptance condition |
|---|---|---|
| Default/maximum page sizes | DB6 config seed | values in `policy_configurations`; no literal in code |
| Cursor token encoding | DB6 | opaque, versioned, encodes no authorization |
| Q-21 migration to `KEYSET` | DB10 | an ADR-DB5-001 R8 threshold observed |
