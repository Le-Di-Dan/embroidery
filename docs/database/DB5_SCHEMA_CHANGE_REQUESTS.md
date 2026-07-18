# DB5 — Schema Change Requests

**Date:** 2026-07-18 · **Git HEAD:** `456e101`
**Rule:** DB5 **must not** modify the DB4 logical schema. Any change the
query/index design would need is raised here as an `SCR-DB5-*` and left
unimplemented. **DB5 PASS requires 0 blocking requests.**

## 1. Result

| Metric | Value |
|---|---|
| Blocking requests | **0** |
| Non-blocking requests | **0** |
| Observations recorded (no change requested) | 4 |

**No schema change request is raised.** Every one of the 44 catalogued
queries and 30 additional access paths maps onto DB4 tables, columns and
relationships exactly as locked, and every one is served either by an index
or by a documented no-index rationale.

## 2. Why the result is empty

This is a stronger outcome than "nothing came up", and the reasons are
structural rather than lucky:

1. **DB0 catalogued the queries before DB4 designed the schema.** The 33
   Q-IDs existed as a DB4 input, so the tables were shaped against known
   access patterns rather than discovered afterwards.
2. **DB4 extracted every invariant-bearing fact out of JSONB into typed
   columns** (ADR-DB4-004). The usual source of DB5-stage schema requests —
   "we need to filter on something buried in a payload" — was eliminated at
   DB4. This is why the JSONB review came back 9/9 no-index with no
   promotion request.
3. **DB4's header current-pointers** (`design_cases.current_version_id`,
   `quotations.current_version_id`, `orders.current_approval_snapshot_id`,
   `agreements.current_version_id`) removed the need for "latest row"
   aggregate scans, which are the other common trigger for a DB5 schema
   request.
4. **Status columns are text + CHECK with exact DB3 state sets**, so every
   partial index predicate the design needed could be written against a
   column that already existed with the right values.

## 3. Observations (recorded, no change requested)

Four points where the design encountered friction and resolved it **without**
a schema change. They are recorded so a future reader does not mistake the
absence of a request for absence of analysis.

### OBS-01 — `asset_derivatives` partial-unique predicate shape

**Encountered:** CST-018's predicate is `status <> 'FAILED'`. Q-30 filters
`status = 'READY'`, and the planner cannot derive the implication across a
text CHECK, so the partial unique is not usable as Q-30's access path.

**Resolved without change:** IDX-099 `(asset_id)`, a plain index. Cost is one
small index on a moderate-write table.

**Change considered and rejected:** narrowing CST-018's predicate to
`status IN ('PENDING','PROCESSING','READY')` would make it matchable — but it
would **weaken a locked integrity constraint** to serve a query, which is
exactly what DB5 is forbidden to do. The index is the correct answer.

**Falsifier:** EXPLAIN scenario E30. If the planner *does* match IDX-020,
IDX-099 should be dropped.

### OBS-02 — Q-20 low-stock predicate is column-vs-column

**Encountered:** `quantity_on_hand <= low_stock_threshold` compares two
columns of the same row; no plain B-tree is selective for it.

**Resolved without change:** no index (IDX-R01) — `sku_stocks` holds ≤ dozens
of rows and a sequential scan is the correct plan.

**Change considered and rejected:** a stored `is_low_stock` boolean, or a
generated column, would be indexable — but it would introduce a **persisted
derived value**, which DB4 §3 and the derived-state catalog explicitly
prohibit. It would also have to be maintained inside the most lock-contended
transaction in the system. Not worth it for a few dozen rows.

**Revisit:** if `sku_stocks` exceeds ~10,000 rows.

### OBS-03 — `audit_events` has no parent FK (polymorphic target)

**Encountered:** REL-103 is polymorphic by justified DB4 exception, so there
is no FK and no "fetch via the owner" fallback. Every audit lookup form needs
its own index, which is why the table exceeds its index budget.

**Resolved without change:** IDX-095 `(target_kind, target_id, occurred_at
DESC, id DESC)` plus three secondary forms, with the budget exception
recorded and first-removal candidates named.

**Change considered and rejected:** replacing the polymorphic target with
per-context audit tables was already considered and rejected at DB4. DB5 has
no new evidence and will not reopen it.

### OBS-04 — `CST-046` exclusion constraint would require an extension

**Encountered:** the "one effective agreement version" exclusion would need a
range expression plus a `btree_gist`-style composition, implying a
non-baseline extension (ADR-DB1-001).

**Resolved without change:** IDX-056 stays **conditional**; the publish
transaction remains the primary defense (as DB4 already locked), and QX-07's
read path is IDX-108.

**No schema change involved** — this is an index-adoption decision, and it
does not weaken CST-046, which remains enforced in the publish transaction.

## 4. Things DB5 explicitly did not do

Recorded because each was available and would have been a scope violation:

- **Did not** add a column, table, or relationship.
- **Did not** rename anything for query convenience.
- **Did not** weaken any `CST-*` uniqueness or partial predicate to make an
  index matchable (OBS-01).
- **Did not** introduce a persisted derived value or counter (OBS-02).
- **Did not** create a materialized view or read-model table for Q-22.
- **Did not** reopen ORM, migration strategy, aggregate ownership, lifecycle
  policy, money model, transition-history storage, asset association or JSONB
  boundaries.
- **Did not** promote any JSONB path to a column (all 9 reviewed; none
  needed).

## 5. Request template

If a future checkpoint needs one:

```text
SCR-DB5-NNN
Query IDs:            Q-* / QX-*
Problem:              what the query needs that DB4 does not provide
Current DB4 mapping:  TBL-* / COL-* / REL-* as locked today
Why an index is insufficient:  (required — most requests fail here)
Proposed logical change:       table/column/relationship
Ownership impact:     which context owns it (DB2 ownership matrix)
Invariant impact:     INV-* / GRD-* / CST-* affected
Migration impact:     backfill, immutability, historical rows
Alternatives:         index, read projection, application change
Recommendation:       adopt / defer / reject
Status:               blocking / non-blocking
```

The "why an index is insufficient" line is the gate: in this schema most
apparent schema needs turn out to be index or query-shape questions, and all
four observations above resolved that way.

## 6. Exit gate

**0 blocking schema change requests → the DB5 exit-gate condition is met.**
