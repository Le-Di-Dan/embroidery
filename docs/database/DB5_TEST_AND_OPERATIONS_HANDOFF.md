# DB5 → DB7 / DB8 / DB9 / DB10 Handoff

**Date:** 2026-07-18 · **Git HEAD:** `456e101`
Test IDs `D7-*`/`D8-*` are from
[`DB3_TEST_HANDOFF.md`](./DB3_TEST_HANDOFF.md) and
[`DB4_TEST_HANDOFF.md`](./DB4_TEST_HANDOFF.md); DB5 adds index/access-path
assertions to them rather than inventing a parallel numbering.

---

## 1. DB7 — Integrity, constraint and index existence

### 1.1 Index existence and shape

For each of the 134 catalog entries assert: the index **exists**, carries the
**catalog name**, has the **exact key list in order**, the **declared
uniqueness**, and — for the ~45 partials — the **exact predicate**.

A partial index whose predicate drifted from the catalog is the most
dangerous silent defect in this design: it still exists, still has the right
name, and simply stops being used.

### 1.2 Constraint-backed indexes (highest priority)

| Test | Constraint | Index | Assert |
|---|---|---|---|
| **D7-04** | CST-022 | **IDX-024** | partial unique on `(design_case_id) WHERE status='SENT_FOR_REVIEW'`; a second such version is rejected |
| **D7-08** | CST-048 | **IDX-058** | unique `(operation_namespace, scope_key)` |
| **D7-09** | CST-040 | **IDX-043** | unique `(provider_key, provider_event_ref)` |
| D7-12 | CST-004/008/019 | IDX-003/007/021 | unique hash lookups; **no plaintext secret column exists** |
| D7-13 | CST-002/003/005..010/014/020/026/029/030/035/039 | corresponding | uniqueness families |
| D7-05 | CST-061 | — | non-negative stock is the final arbiter |
| D7-07 | CST-080 | — | snapshot-reference NOT NULLs |
| D7-11 | CST-098/099 | — | append-only; outbox column-scoped exception |
| D7-01 | CST-060 | — | status values match DB3 §1 exactly |

### 1.3 Predicate-vocabulary test (new at DB5)

Assert that **every partial index predicate references only exact DB3 state
values**. An invented or misspelled state (`'SENT_REVIEW'`, `'ACTIVE '`) in a
predicate produces an index that silently matches nothing.

### 1.4 Negative tests

- **No index exists outside the catalog** — `pg_indexes` reconciles 1:1.
- **No GIN/JSONB index exists** on any of the 9 JSONB columns.
- **No index exists on** `sku_stocks` beyond PK + IDX-016, or on
  `outbox_events` beyond PK + IDX-088 + IDX-090.
- **Exactly 9 JSONB columns exist** (ADR-DB4-004 closed set).

---

## 2. DB8 — Locking, concurrency and races

All 28 CC scenarios have a lock anchor and an index in
[`DB5_LOCKING_ACCESS_PATHS.md`](./DB5_LOCKING_ACCESS_PATHS.md) §10.
Highest-priority races, each with its access-path assertion:

| Test | CC | Assert (behavior) | Assert (access path) |
|---|---|---|---|
| **D8-05** | CC-20 | last unit → one reserve wins, other `INSUFFICIENT_STOCK` | anchor lock via IDX-016; availability via IDX-113/114 **inside** the lock |
| **D8-09** | CC-03 | second send-for-review → `REVIEW_ALREADY_ACTIVE` | IDX-024 raises it; **no lock taken** |
| **D8-12** | CC-11 | duplicate order creation → replay | IDX-032 arbitrates |
| **D8-01** | CC-07 | duplicate callback → replay; event still appended | IDX-058 + IDX-043 |
| **D8-17** | CC-25 | multi-worker claim → disjoint batches, no blocking | IDX-088 + `SKIP LOCKED`; **claimed rows exit the claimable set in-transaction** |
| **D8-14** | CC-15 | edit after freeze → `IMMUTABLE_RECORD` | IDX-035 lock in dispatch tx |
| **D8-15** | CC-14 | dispatch before final payment fails | order lock + IDX-075 read (CST-110 is a TX read, not an FK) |
| **D8-18** | CC-27 | merge serialized; **no deadlock** | deterministic two-row order; enumeration via IDX-107/134/117/118/119 |
| D8-20 | CC-16 | revoke wins over in-flight action | IDX-007 resolves **even revoked** grants |
| D8-24 | CC-22/23 | expiry sweep vs reserve → committed-first wins | IDX-110 sweep takes the **same** row lock |
| D8-25 | CC-07/GRD-030 | fingerprint mismatch → conflict | IDX-058 probe, then compare |
| D8-04 | CC-10 | single SATISFIED transition | obligation lock via IDX-075/042 |
| D8-10/11 | CC-05/06/28 | accept/expire/version races | IDX-084, IDX-037 header lock |
| D8-13 | CC-12 | start after hold fails | order-row lock |
| D8-19 | CC-13 | saga resumable, converges | **IDX-103** replay is gap-free |
| D8-16 | CC-26 | duplicate notifications collapse | IDX-057 |
| D8-23 | CC-19 | duplicate derivative pipeline prevented | IDX-020 |
| D8-21 | CC-17 | one challenge, one verified link | IDX-006 + IDX-004 |

**Enumeration-completeness assertion for D8-18 (new at DB5):** after a merge,
assert that **expired and revoked** grants of the loser were also handled,
and that **non-primary** contacts were moved. This is the test that catches
the partial-index-as-full-path error class; using IDX-008 or IDX-005 instead
of IDX-107/IDX-134 would pass a naive test and fail this one.

**Snapshot-immutability assertion:** after a merge, historical snapshots
(`approval_snapshots` contact copies, order/quotation display copies) are
**unchanged**.

---

## 3. DB9 — Representative data

Seed data must exercise every partial index. **An unseeded state is an
unexercised index**, and the EXPLAIN plan will look deceptively good because
the table is empty.

### 3.1 Distribution requirements

| Area | Requirement | Proves |
|---|---|---|
| Catalog | DRAFT + PUBLISHED + ARCHIVED products/gallery/content; one skewed category (D-B) | IDX-065/066/067 partials and selectivity |
| Requests | all LC-11 states incl. **`QUOTE_ACCEPTED`** | IDX-073 buckets, dashboard |
| Orders | all LC-14 states incl. **`ON_HOLD`** and **`CANCELLING`** | IDX-074, IDX-104 |
| Design | a case with a `SENT_FOR_REVIEW` version + superseded ones | **IDX-024** |
| Quotation | SENT versions with past and future `valid_until` | IDX-084 |
| Payment | **unmatched provider events**, superseded obligation chain, `REQUIRES_REVIEW` attempts, attempts with NULL `provider_ref` | IDX-081/075/076/078 |
| Inventory | terminal holds/reservations; reservations with **NULL `expires_at`**; a SKU with exactly one unit | IDX-113/114/110; CC-20 |
| Assets | a `FAILED` derivative alongside a `READY` one | **the IDX-020 / IDX-099 distinction (E30)** |
| Outbox | 5,000 DISPATCHED + 50 PENDING + 5 DEAD_LETTER; **mixed NULL / past / future `next_attempt_at`** | **IDX-088 `NULLS FIRST` and cost independence** |
| Idempotency | stuck `IN_PROGRESS` records; expired records | IDX-093/094 |
| Audit | 50,000 events across ≥5 target kinds, several correlation ids | IDX-095..098 |
| Queues | rows **already past expiry** in every sweep state | all sweep partials |
| Security | **a second customer** with its own request and grant; expired and revoked grants; deactivated and non-primary contacts | IDOR tests, merge enumeration |
| Text | full Vietnamese diacritics in names, addresses, notes | `C` collation behavior; that no index depends on locale |

Dataset refs D-A..D-G are defined in
[`DB5_EXPLAIN_VALIDATION_PLAN.md`](./DB5_EXPLAIN_VALIDATION_PLAN.md) §2.

### 3.1.1 Q-01 pagination assertions (added 2026-08-02)

ADR-DB5-001 R10 reclassified Q-01 as `KEYSET`, so the listing now has cursor
assertions an offset listing did not need:

| Assert | Why |
|---|---|
| Order is `(display_order ASC, id ASC)` | a keyset cursor is only correct over a total order (R2) |
| A continuation eliminates rows **at the scan**, not after it | otherwise it is offset paging wearing a cursor |
| A cursor issued under one `categorySlug` is rejected under another | replaying it across filters would skip or repeat rows |
| Duplicated `display_order` values are traversed exactly once | the tie-breaker is what makes that true; seed at least one duplicate pair |
| The per-card thumbnail subquery runs at most once per returned row | the no-N+1 property of the delivered projection |

The measured baseline for all five is
[`DB5_Q01_ACCESS_PATH_EVIDENCE.md`](./DB5_Q01_ACCESS_PATH_EVIDENCE.md), captured
by `pnpm explain:q01`. Document consistency is gated separately by
`pnpm check:pagination-authority`.

### 3.2 After seeding

Run **`ANALYZE`**, then capture the 43 EXPLAIN scenarios + 7 locking
scenarios and store them as regression artifacts.

---

## 4. DB10 — Operations, audit and recovery

### 4.1 Index presence and usage

- Reconcile `pg_indexes` against the catalog 1:1. An index present in the
  database but absent from the catalog is a **governance violation**, not a
  tuning outcome.
- Periodic `pg_stat_user_indexes` review under ADR-DB5-004 R7:
  remove only if `idx_scan` ≈ 0 **and** no P0/P1 query names it. A
  zero-scan index backing a rare-but-critical path (reconciliation, merge,
  recovery) is **kept** — rarity is not uselessness.
- **First removal candidates:** IDX-078, IDX-097, IDX-098.
- Integrity indexes are exempt from removal review.

### 4.2 Collation drift and REINDEX

- DB5 introduces **no locale-aware collation**, so the drift exposure from
  ADR-DB1-001 is currently **inactive**.
- The REINDEX-on-drift runbook step stays written but dormant. It
  **activates in the same change** as the first `vi-x-icu` index
  (ADR-DB5-002 R9, ADR-DB5-004 R10). Adding such an index without
  activating it is a defect.
- Verify `initdb` encoding/collation/ctype/provider and the `C` baseline on
  every environment; record it in backup manifests (ADR-DB1-014).

### 4.3 Bloat and vacuum

Priority tables (highest churn + deletion):

| Table | Driver |
|---|---|
| TBL-073 outbox_events | insert + status churn + TTL delete |
| TBL-074 idempotency_records | insert + TTL delete |
| TBL-025 design_sessions | frequent updates + TTL delete |
| TBL-070 notification_intents | churn + retention |
| TBL-018 sku_stocks | tiny but very frequently updated — **keep the index count at 2 to preserve HOT-update behavior** |

Own autovacuum tuning and bloat thresholds for these; append-only tables are
low risk until retention runs.

### 4.4 Backup, restore and upgrade

- **No extension dependency** anywhere in the index set — restore and major
  upgrade stay simple.
- After a major-version upgrade, re-run the EXPLAIN regression artifacts:
  planner behavior can shift between majors and this is the cheapest
  detection.
- Post-restore, verify index presence and run `ANALYZE` before trusting any
  plan.
- If `CREATE INDEX CONCURRENTLY` is ever used post-launch (ADR-DB5-004 R9),
  the runbook must cover the `INVALID`-index failure mode: detect, drop,
  retry.

### 4.5 Ongoing governance

- New query → catalog entry **before** the index (ADR-DB5-004 R11).
- Index change = migration + catalog update in the **same** change.
- Integrity index change = superseding ADR.
- Any new index on a `[SEC]` or `[PII]` column is a security review item
  ([`DB5_SECURITY_SCOPE_REVIEW.md`](./DB5_SECURITY_SCOPE_REVIEW.md) §11).
- Re-check the activation thresholds in
  [`DB5_INDEX_COST_REDUNDANCY_REPORT.md`](./DB5_INDEX_COST_REDUNDANCY_REPORT.md) §6
  annually.

---

## 5. Coverage summary

| Checkpoint | Items handed off |
|---|---|
| DB7 | 134 index existence/shape assertions; 51 constraint families; predicate-vocabulary test; 4 negative-test classes |
| DB8 | 28 CC scenarios with lock anchor + index; 2 new enumeration/immutability assertions |
| DB9 | 7 dataset scenarios (D-A..D-G); 15 distribution requirements; 50 plans to capture |
| DB10 | usage review, collation dormancy, bloat priorities, backup/upgrade regression, governance |
