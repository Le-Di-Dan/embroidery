# DB5 — Admin Dashboard Access Paths (Q-22 decomposition)

**Date:** 2026-07-18 · **Git HEAD:** `456e101`
**Rule:** Q-22 is a **composition of independent queries**, never a single
query, a single index, or a materialized view.

## 1. Position

Q-22 in [`DB0_QUERY_CATALOG.md`](./DB0_QUERY_CATALOG.md) is one row
covering twelve buckets across seven bounded contexts. DB4 already ruled
that CON-170..176 dashboards are **query compositions only**
([`DB4_TABLE_CATALOG.md`](./DB4_TABLE_CATALOG.md) §3, ADR-DB1-009 rule 14).

Three things this document rules out explicitly:

- **No "one giant dashboard index."** The buckets read seven different
  tables; no index can span them.
- **No materialized view implementation.** DB5 may not implement read
  models, and a stale dashboard bucket at this scale would be worse than a
  fresh one — the counts are small enough to compute directly.
- **No denormalized counter table.** A persisted count would become a second
  source of truth for state that the authoritative tables already hold
  (DB4 §3: no derived read model is persisted).

Each bucket is a `TOP_N` list plus a count over the **same** index, so the
count and the list never disagree.

## 2. Bucket decomposition

| # | Bucket | Table | Predicate | Sort | Limit | Index | Cons |
|---|---|---|---|---|---|---|---|
| 1 | New | TBL-037 | `status='NEW'` | `created_at DESC, id DESC` | TOP_N | IDX-073 | S |
| 2 | Needs clarification | TBL-037 | `status='NEEDS_CLARIFICATION'` | same | TOP_N | IDX-073 | S |
| 3 | Awaiting quote | TBL-037 | `status IN ('UNDER_REVIEW')` | same | TOP_N | IDX-073 | S |
| 4 | Digitizing | TBL-037 | `status='DIGITIZING'` | same | TOP_N | IDX-073 | S |
| 5 | Awaiting customer | TBL-028 | `status='SENT_FOR_REVIEW'` | `sent_at DESC` | TOP_N | **IDX-024** | S |
| 6 | Awaiting deposit | TBL-043 + TBL-054 | `orders.status='AWAITING_DEPOSIT'` + deposit `PENDING` | `created_at, id` | TOP_N | IDX-074 + IDX-075 | S |
| 7 | In production | TBL-059 | `status IN ('PLANNED','STARTED')` | `created_at, id` | TOP_N | IDX-082 | S |
| 8 | Awaiting final payment | TBL-043 + TBL-054 | `orders.status='AWAITING_FINAL_PAYMENT'` + remaining `PENDING` | `created_at, id` | TOP_N | IDX-074 + IDX-075 | S |
| 9 | Low stock | TBL-018 | `low_stock_threshold IS NOT NULL AND quantity_on_hand <= low_stock_threshold` | `id` | TOP_N | **none — seq scan** | S |
| 10 | Failed / unmatched payments | TBL-055; TBL-056 | `status IN ('FAILED','REQUIRES_REVIEW')`; `payment_attempt_id IS NULL` | `created_at DESC, id DESC` | TOP_N | IDX-076; IDX-081 | S |
| 11 | Expiring quotations | TBL-051 | `status='SENT' AND valid_until < horizon` | `valid_until, id` | TOP_N | IDX-084 | E |
| 12 | Alerts / terminal failures | TBL-073; TBL-075 | `status='DEAD_LETTER'`; `is_dead_letter` | `id`; `finished_at DESC` | TOP_N | **none**; IDX-131 | E |

## 3. Notes per bucket group

### Buckets 1–4 — request states (one index, four queries)

All four are served by **IDX-073** `(status, created_at DESC, id DESC)`.
Its leading `(status)` prefix gives each bucket a selective range and its
sort keys match the display order exactly, so no bucket needs a sort node
and **the dashboard requires no index of its own**.

The status values must be exact LC-11 members
([`DB3_DB4_HANDOFF.md`](./DB3_DB4_HANDOFF.md) §1). **`QUOTE_ACCEPTED` is a
real state** between `QUOTED` and `DIGITIZING` (ADR-DB3-001) — if operations
want an "accepted, not yet digitizing" bucket it is bucket 3b on the same
index, not a new one. Omitting `QUOTE_ACCEPTED` from the dashboard would make
accepted quotations invisible to the team.

### Bucket 5 — awaiting customer review

Served by **IDX-024**, the CST-022 partial unique. Because at most one
version per case can be `SENT_FOR_REVIEW` (INV-16), this bucket's row count
equals the number of cases awaiting review — the index *is* the bucket.

### Buckets 6 and 8 — the two payment obligations

These are **two separate buckets because Deposit and Remaining are two
independent obligations** (CST-039 / INV-04). Neither may be inferred from
the other, and neither may be inferred from the order status alone: the
order state and the obligation state are checked together.

Both use IDX-074 for the order side and IDX-075 for the obligation side.

### Bucket 9 — low stock has no index, on purpose

`sku_stocks` holds one row per SKU (CST-014) — ≤ dozens at locked scale. The
predicate compares **two columns of the same row**, which no plain B-tree
makes selective. A partial index with that predicate is legal but would be
re-evaluated on **every stock mutation**, taxing the most lock-contended
write path in the system (CC-20/23/24) to accelerate a scan of a few dozen
rows.

**Rejected as IDX-R01.** Revisit if `sku_stocks` exceeds ~10,000 rows.

### Bucket 10 — payment attention

Two sources: failed/review attempts (IDX-076) and **unmatched provider
events** (IDX-081, partial on `payment_attempt_id IS NULL`). The unmatched
side matters most operationally — an unmatched callback is money received
that the system has not applied — and its partial index stays tiny because
unmatched events are exceptions.

### Bucket 12 — alerts

Dead-letter outbox rows have **no index** (the claim index IDX-088 is
partial to `PENDING`, and IDX-090 to `DISPATCHED`). Accepted: dead letters
should be near-zero, and if they are not, that is an incident and a
sequential scan of a small table is not the problem. `background_job_attempts`
uses IDX-131.

## 4. Consistency and caching

- Buckets 1–10 are **strong** — they drive operator action, and a stale
  "awaiting deposit" count would cause real mistakes.
- Buckets 11–12 are **eventual-OK** — expiry horizons and alert counts
  tolerate seconds of lag.
- **Caching direction (not implemented at DB5):** if dashboard load ever
  matters, cache **counts** briefly at the application layer with an
  explicit TTL, and never cache the **lists** operators act on. No database
  mechanism is introduced. At current scale no caching is needed at all.

## 5. Current-scale rationale

Twelve buckets, each an indexed `TOP_N` over a table of at most a few
hundred rows, is roughly twelve index-range scans per dashboard load. At
<100 orders/month with a single-digit admin team, that is trivially cheap —
and it has properties a materialized view would not: always fresh, no
refresh job, no staleness window, no second source of truth, and no new
failure mode.

The dashboard therefore adds **zero indexes** to the catalog. Every bucket
reuses an index that already exists for its own P0/P1 query — which is the
strongest evidence that the per-context index design is correct.

## 6. Revisit criteria

Introduce dashboard-specific optimization only when **all** hold:

- measured dashboard load time is a real operator complaint,
- `EXPLAIN (ANALYZE, BUFFERS)` shows the bucket queries (not rendering or
  round-trips) dominating,
- and the tables have grown at least an order of magnitude.

Even then the first move is application-level count caching (§4), **not** a
materialized view — which would require an ADR, since it would introduce a
persisted derived projection that DB4 explicitly declined.

## 7. Validation handoff

- **DB6:** no new index; verify each bucket's plan uses the index named in §2.
- **DB9:** seed must populate every bucket — including at least one low-stock
  SKU, one unmatched provider event, one dead-letter row, and requests in
  every LC-11 state.
- **DB10:** dashboard queries are the natural canary for index regressions,
  since they exercise eight indexes in one page load.
