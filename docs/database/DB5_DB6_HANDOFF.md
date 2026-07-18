# DB5 → DB6 Handoff (Index Implementation)

**Date:** 2026-07-18 · **Git HEAD:** `456e101`
**Rule:** DB6 implements. DB5 designed no SQL, no Drizzle, no migration, no
physical index. Nothing here re-opens a DB0–DB4 decision.

## 1. What DB6 receives

| Artifact | Contents |
|---|---|
| [`DB5_INDEX_CATALOG.md`](./DB5_INDEX_CATALOG.md) | 134 indexes: keys, order, predicates, uniqueness, status |
| [`DB5_INDEX_NAMING_AND_HANDOFF.md`](./DB5_INDEX_NAMING_AND_HANDOFF.md) | normative physical names (all ≤63 bytes) |
| [`DB5_CONSTRAINT_INDEX_MAP.md`](./DB5_CONSTRAINT_INDEX_MAP.md) | which indexes belong to constraints |
| [`DB5_ACCESS_PATH_MATRIX.md`](./DB5_ACCESS_PATH_MATRIX.md) | per-query entry table, joins, predicates |
| [`DB5_LOCKING_ACCESS_PATHS.md`](./DB5_LOCKING_ACCESS_PATHS.md) | lock anchors, order, spike list |
| [`DB5_EXPLAIN_VALIDATION_PLAN.md`](./DB5_EXPLAIN_VALIDATION_PLAN.md) | 43 + 7 validation scenarios |

## 2. Implementation order

Aligned to the DB4 G1–G19 migration groups. **Constraint-backed first** —
they are integrity, not optimization, and several are concurrency arbiters
that must exist before any code depends on them.

### Phase 1 — Constraint-backed (with the tables, G1–G19)

All 63 required integrity indexes (IDX-001..055, 057..064) are created **as
part of their constraints**, in the group that creates the table. DB6 must
**not** create a separate index with a constraint index's name.

Highest-consequence, verify explicitly:

| IDX | Constraint | Why it cannot slip |
|---|---|---|
| **IDX-024** | CST-022 | INV-16 single active review; **also** the CC-03 arbiter |
| **IDX-032** | CST-030 | INV-19 request→order; the CC-11 arbiter |
| **IDX-042** | CST-039 | INV-04 obligation independence |
| **IDX-043** | CST-040 | INV-07 duplicate-callback arbiter |
| **IDX-058** | CST-048 | INV-19/24 double-execution arbiter |
| IDX-007, IDX-003, IDX-021 | CST-008/004/019 | security token lookups |
| IDX-016 | CST-014 | the inventory lock anchor |

**IDX-056** (CST-046 exclusion) is **conditional — do not build at launch**.
It needs an extension; the publish-transaction guard remains the primary
defense. Building it requires an extension request (ADR-DB5-002 R7).

### Phase 2 — P0 performance indexes (launch, required)

IDX-088 (outbox claim), IDX-099 (derivative resolve), IDX-103/104 (saga
resume), IDX-105/106/107 (grants), IDX-108 (effective agreement), IDX-111
(rate window), IDX-113/114 (availability under lock), IDX-075 (obligations
by order), IDX-079/080/081 (reconciliation), IDX-134 (contacts by customer).

These back security, correctness and concurrency paths. **IDX-088's
`NULLS FIRST` and IDX-110's `IS NOT NULL` are load-bearing, not cosmetic** —
getting either wrong produces a silent performance or correctness failure,
not an error.

### Phase 3 — P1 performance indexes (launch, required)

IDX-065..071, 073, 074, 076, 077, 082, 084, 085, 086, 087, 090, 091, 092,
093, 094, 095, 096, 109, 110, 112, 115, 121, 126, 133.

### Phase 4 — `recommended` (launch, removable on evidence)

IDX-067, 078, 097, 098, 116..120, 122..125, 127, 129..132, 135..138.
Ship them, then let ADR-DB5-004 R7 remove any that go unused.

### Phase 5 — conditional / future

IDX-056 (needs extension); any `vi-x-icu` collated index; `pg_trgm`; BRIN;
INCLUDE columns. **None at launch.**

## 3. Raw-SQL requirements

The ORM may not express these. Where it cannot, use **documented raw SQL**
(ADR-DB1-002 permits this; ADR-DB5-004 R11 requires it be recorded).

| Feature | Indexes | Note |
|---|---|---|
| **Partial predicates** | ~45 | predicate text must match the query **exactly**, or the index is not used — the single most likely implementation defect |
| **`NULLS FIRST`** | IDX-088 | non-default on an ASC key |
| **Explicit DESC keys** | IDX-073, 076, 079, 081, 095, 096, 098, 108 | must match query direction |
| **Multi-column DESC** | as above | both keys same direction; never mixed |
| **Exclusion constraint** | IDX-056 | conditional only |
| Expression indexes | **none** | — |
| Collation clauses | **none** | `C` default throughout |

## 4. Extension requests

**None.** The entire launch index set runs on core PostgreSQL 16 B-tree.
This keeps the image, backup/restore and upgrade runbook free of extension
coupling (ADR-DB5-002 R7).

If IDX-056 is ever adopted, it needs an extension request with proof the
extension exists in the pinned image plus a stated fallback.

## 5. INCLUDE columns

**None declared.** No `INCLUDE` is justified without measurement
(ADR-DB5-004 R4). Candidates for DB9/DB10 **only if** `EXPLAIN (ANALYZE,
BUFFERS)` shows heap fetches dominating: IDX-073 (+`code`), IDX-065
(+`name`, `base_price_amount`).

## 6. Statistics

- Run **`ANALYZE`** after seeding and after any bulk load. DB9's EXPLAIN
  validation is meaningless against stale statistics.
- When a query is slow, **check statistics before adding an index**
  (ADR-DB5-004 R8). Adding an index to compensate for stale stats leaves
  permanent write cost behind.
- No custom statistics targets or extended statistics objects are requested.

## 7. Lock and claim spikes

Carried from [`DB3_CONCURRENCY_SPECIFICATION.md`](./DB3_CONCURRENCY_SPECIFICATION.md)
and [`DB5_LOCKING_ACCESS_PATHS.md`](./DB5_LOCKING_ACCESS_PATHS.md) §11.

| # | Spike | Scope | Fallback |
|---|---|---|---|
| 1 | **`FOR UPDATE SKIP LOCKED`** | CC-25 outbox claim — highest risk | raw-SQL adapter; ultimately single-worker relay (ADR-DB5-003 R7) |
| 2 | `FOR UPDATE` | CC-20..24 inventory, CC-12..15 order, CC-28 quotation | raw-SQL adapter |
| 3 | Deterministic two-row lock order | CC-27 merge — the only real deadlock risk | explicit ordered locking in application code |
| 4 | **Partial-index predicate matching** | all ~45 partials | verify with EXPLAIN that each partial is actually used |
| 5 | Explicit index naming | all | raw SQL if the builder cannot emit names |

Spike 4 is not a database-capability question but a **verification** step,
and it is the one most likely to reveal a real defect: a partial index that
is silently unused looks exactly like a partial index that works.

## 8. Fresh install vs upgrade

- **Fresh install (the launch case):** the database is empty, so every index
  is a **plain in-migration build**. ADR-DB5-004 R9's `CONCURRENTLY` rule
  does not apply.
- **Post-launch on a populated table:** `CREATE INDEX CONCURRENTLY`, shipped
  as its **own non-transactional migration step** (it cannot run inside a
  transaction block, which conflicts with the transactional-DDL model of
  ADR-DB1-003). Its failure mode — an `INVALID` index left behind requiring
  drop and retry — goes into the DB10 runbook.
- **Forward-fix only:** index changes are new migrations, never edits to
  applied ones (ADR-DB1-003).

## 9. What DB6 must not do

- Do **not** add an index outside this catalog. New query → catalog entry
  first (ADR-DB5-004 R11).
- Do **not** accept tool-generated index names.
- Do **not** create a separate index duplicating a constraint's index.
- Do **not** create any GIN/JSONB index (all 9 payloads reviewed: no index).
- Do **not** weaken a partial-unique predicate to make it matchable — see
  OBS-01 in [`DB5_SCHEMA_CHANGE_REQUESTS.md`](./DB5_SCHEMA_CHANGE_REQUESTS.md).
- Do **not** build IDX-056 or any collated/trigram index at launch.
- Do **not** add an index to `sku_stocks` (2 indexes) or `outbox_events`
  (3) — both are deliberate minimums on the hottest paths.

## 10. Definition of done for DB6 index work

1. All 63 required constraint-backed indexes exist with the catalog names.
2. All Phase 2–3 performance indexes exist with correct keys, directions,
   null ordering and predicates.
3. Phase 4 shipped; Phase 5 absent.
4. Every partial index verified **in use** by EXPLAIN (spike 4).
5. `ANALYZE` run after seeding.
6. Lock/claim spikes 1–3 resolved, with raw-SQL adapters documented where
   the builder falls short.
7. No index exists that this catalog does not define.
8. `pg_indexes` reconciles 1:1 with the catalog.
