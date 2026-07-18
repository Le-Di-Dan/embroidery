# ADR-DB5-004 — Index Governance, Naming and Redundancy Control

- Status: Accepted
- Date: 2026-07-18
- Git HEAD: `456e101` (DB4 baseline)
- Decision IDs: DEC-DB5-04
- Depends on: [ADR-DB1-006](./ADR-DB1-006-NAMING-CONVENTIONS.md) (naming),
  [ADR-DB1-003](./ADR-DB1-003-MIGRATION-STRATEGY.md) (migrations),
  [ADR-DB1-002](./ADR-DB1-002-ORM-QUERY-LAYER.md) (query layer)

## Context

DB5 produces ~138 logical indexes across 78 tables. Without governance an
index catalog decays in a predictable way: indexes get added for
hypothetical queries, nobody removes them because nobody knows what they
serve, and write-heavy tables accumulate cost that no read ever recovers.
The failure is silent — over-indexing never produces an error, only a
gradually slower write path and a larger backup.

This ADR locks the rules that keep the catalog honest.

## Decision Drivers

- Every index is a **write tax**: it is maintained on every INSERT, on
  every UPDATE that touches its keys, and it must be vacuumed and backed up.
- At locked scale most tables are small enough that a sequential scan is
  genuinely the right plan. An index that "can't hurt" *can* hurt.
- Redundancy is easy to create accidentally: a unique constraint already
  creates an index, and a composite index already serves its leading
  prefix. Both facts are routinely forgotten.
- A 1–3 developer team cannot afford index archaeology. Every index must
  carry its own justification and its own removal criteria.

## Decision

### R1 — Naming is deterministic and self-describing

Extending ADR-DB1-006's `pk_/fk_/uq_/ck_/tg_` family:

| Kind | Pattern |
|---|---|
| Primary key | `pk_<table>` |
| Unique (constraint-owned) | `uq_<table>__<col>[_<col>…]` |
| Partial unique | `uq_<table>__<cols>__<predicate_tag>` |
| Performance (plain) | `ix_<table>__<cols>` |
| Performance (partial) | `ix_<table>__<cols>__<predicate_tag>` |
| Expression | `ix_<table>__<expr_tag>` |
| Non-B-tree | `ix_<table>__<cols>__<method>` |

Rules:

- Double underscore separates the table from the column list; single
  underscore separates columns.
- `<predicate_tag>` is a short human word for the partial predicate
  (`active`, `pending`, `sent_for_review`, `unmatched`, `dead_letter`) —
  never an encoded expression.
- Names are lowercase snake_case and must stay within PostgreSQL's
  **63-byte** identifier limit. Names that would overflow are shortened by
  abbreviating the *predicate tag* first, then the column list, never the
  table name — the table must always be readable in an error message or a
  `pg_stat_user_indexes` row.
- Names are **explicit** in the migration, never tool-generated
  (ADR-DB1-006), because generated names are unstable across tools and
  turn a constraint-violation error message into a puzzle.

The full `IDX-*` → physical name map is
[`DB5_INDEX_NAMING_AND_HANDOFF.md`](../../database/DB5_INDEX_NAMING_AND_HANDOFF.md).

### R2 — Every index carries mandatory metadata

No index enters the catalog without all of:

1. Stable `IDX-*` id.
2. Owning bounded context (the module accountable for it).
3. `TBL-*` and ordered key `COL-*` list.
4. Category: **integrity-backed** or **performance**.
5. Serving query IDs (`Q-*`/`QX-*`) — or, for integrity indexes, the
   `CST-*` it implements.
6. Selectivity rationale and expected row count at locked scale.
7. Write cost / amplification note.
8. Redundancy check against every other index on the same table.
9. DB7/DB8 validation reference.
10. **Removal criteria.**

An index proposed without serving query IDs is rejected by definition —
that is the operational meaning of "no speculative indexes".

### R3 — Integrity and performance indexes are governed differently

- **Integrity-backed** indexes are consequences of `CST-*` locked at DB4.
  DB5 **may not** re-litigate their necessity, drop them, or weaken them to
  non-unique. They are removable only by changing the constraint, which
  requires a superseding ADR.
- **Performance** indexes are hypotheses about access patterns. They must
  earn their place and can be removed on evidence (R7).

### R4 — Speculative indexes are prohibited

An index may not be created because it "seems useful", because a column is
a foreign key, because a column is a status, or because a future feature
might need it. The concrete prohibitions:

- **No mechanical FK indexing.** Each FK is reviewed individually in
  [`DB5_FK_INDEX_REVIEW.md`](../../database/DB5_FK_INDEX_REVIEW.md). An FK
  index is justified by a child-lookup query, a join path, or a
  `RESTRICT` parent-delete check — not by the FK's existence. All deletes
  here are `restrict` with archive semantics (ADR-DB1-011), so the
  parent-delete argument is weak in this schema and is not accepted on its
  own.
- **No blanket JSONB GIN.** See
  [`DB5_JSONB_INDEX_REVIEW.md`](../../database/DB5_JSONB_INDEX_REVIEW.md);
  default is no index.
- **No index for a query that does not exist in the catalog.**
- **No covering index built on guesswork.** `INCLUDE` columns are added
  only after `EXPLAIN (ANALYZE, BUFFERS)` shows heap fetches dominating a
  measured hot query (R6).

### R5 — Redundancy review is mandatory and mechanical

Before an index is added, it is checked against every existing index on the
same table for:

- **Leading-prefix containment** — if index A is `(a, b, c)`, then `(a)`
  and `(a, b)` are redundant. A narrower index is justified only by
  measured evidence (e.g. a much smaller partial index that a hot query
  uses constantly), and the evidence is recorded.
- **Constraint-owned coverage** — a unique constraint already provides a
  B-tree. A separate performance index on the same leading columns is a
  duplicate. This is the single most common redundancy in this catalog and
  is checked for every performance index that touches a unique's columns.
- **Partial vs full overlap** — a partial index and a full index on the
  same keys coexist only when both access patterns are real: the partial
  for the hot filtered path, the full for the unfiltered lookup. Where a
  partial unique exists for integrity (e.g. CST-018 on
  `(asset_id, kind) WHERE status <> 'FAILED'`), it is **not** treated as a
  reliable access path for a differently-predicated query, because the
  planner cannot infer predicate implication across a text CHECK. Such
  cases get their own plain index, and the reasoning is recorded.
- **Direction compatibility** — a B-tree is scannable backwards, so
  `(a ASC, b ASC)` also serves `ORDER BY a DESC, b DESC`. A separate
  descending index is redundant. A *mixed* direction (`a ASC, b DESC`) is
  not, and needs its own index.

Findings are recorded in
[`DB5_INDEX_COST_REDUNDANCY_REPORT.md`](../../database/DB5_INDEX_COST_REDUNDANCY_REPORT.md).

### R6 — Write-amplification budget

Per-table soft budgets, by write profile:

| Profile | Tables | Budget |
|---|---|---|
| Append-heavy / hot-write | `outbox_events`, `idempotency_records`, `audit_events`, `inventory_ledger_entries`, `payment_provider_events`, `notification_delivery_attempts`, `contact_verification_attempts`, `design_sessions` | **≤3 indexes** incl. PK |
| Normal transactional | orders, requests, quotations, payments, production | ≤5 incl. PK |
| Read-mostly reference | catalog, gallery, content, agreements, policy | ≤6 incl. PK |

Exceeding a budget requires an explicit justification entry in the cost
report. `design_sessions` is in the hot-write tier because autosave updates
it continuously (CC-01) — indexing it broadly would tax every keystroke-level
save.

`INCLUDE` columns count toward width and are added only on measured
evidence (R4).

### R7 — Removal criteria and usage monitoring

Every performance index declares a removal criterion at creation. The
default criterion, unless the catalog states otherwise:

> Remove if `pg_stat_user_indexes.idx_scan` remains ~0 across a
> representative production period **and** no P0/P1 query in
> [`DB5_QUERY_SHAPE_CATALOG.md`](../../database/DB5_QUERY_SHAPE_CATALOG.md)
> names it.

Both halves are required. A zero-scan index that backs a rare-but-critical
P0 path (disaster recovery, reconciliation, merge) is **kept** — rarity is
not the same as uselessness. Integrity indexes are exempt entirely (R3).

**DB10** owns periodic review: unused-index report, bloat check, and
`pg_stat_user_indexes`/`pg_statio_user_indexes` inspection.

### R8 — Statistics before indexes

When a query is slow, the first check is whether statistics are current
(`ANALYZE` after seeding/bulk load), not whether an index is missing. DB6
runs `ANALYZE` after seeding so that DB9's `EXPLAIN` validation reflects
real distributions. Adding an index to compensate for stale statistics is a
misdiagnosis that leaves permanent write cost behind.

### R9 — Production index builds are concurrent; development builds are not

- **Development / test / fresh install:** plain build inside the migration.
  Fastest, simplest, and the table is empty or tiny.
- **Production, on a populated table:** `CREATE INDEX CONCURRENTLY`, because
  a plain build takes a lock that blocks writes for the duration.
  `CONCURRENTLY` **cannot run inside a transaction block**, which conflicts
  with the transactional-DDL migration model (ADR-DB1-003). Locked
  resolution: such an index ships as its own **non-transactional migration
  step**, marked as such, and its failure mode (an `INVALID` index left
  behind, requiring drop and retry) is written into the DB10 runbook.
- At launch the database is empty, so **every DB6 launch index is a plain
  build**. R9 governs indexes added *after* launch.

### R10 — Collation drift and REINDEX

Per [ADR-DB5-002](./ADR-DB5-002-TEXT-SEARCH-COLLATION-INDEXING.md) R9, DB5
introduces no locale-aware collation, so no index currently carries
collation-version dependence. If a `vi-x-icu` index is ever created, the
DB10 REINDEX-on-drift step activates **in the same change**. Adding such an
index without activating the runbook step is a defect.

### R11 — Change control

- Adding, removing or altering an index is a migration (ADR-DB1-003) and
  updates [`DB5_INDEX_CATALOG.md`](../../database/DB5_INDEX_CATALOG.md) in
  the same change. A catalog that drifts from the database is worse than no
  catalog.
- Changing an **integrity** index requires a superseding ADR (R3).
- Removing a **performance** index requires the R7 evidence recorded in the
  change.
- New queries not in the catalog must be added to the query catalog first;
  the index follows the query, never the reverse.

## Consequences

**Positive**

- The catalog stays auditable: every index answers "what query, whose,
  when does it go away".
- Write-heavy tables are protected by explicit budgets rather than by
  hoping nobody adds an index.
- Redundancy checks are mechanical (R5), so they survive being done by a
  tired reviewer.

**Negative / accepted**

- Adding an index carries documentation overhead. That is the intended
  friction; it is what prevents the speculative-index failure mode.
- R9's non-transactional migration step is an exception to the otherwise
  uniform migration model. Accepted: the alternative is blocking writes on
  a live table.

## Deferred

| Item | Owner | Acceptance condition |
|---|---|---|
| Representative review period for R7 | DB10 | defined in the operations runbook |
| Bloat thresholds triggering REINDEX | DB10 | measured baseline exists |
| Whether the ORM emits explicit index names | DB6 | verified; raw SQL if not |

## References

- [ADR-DB1-006](./ADR-DB1-006-NAMING-CONVENTIONS.md), [ADR-DB1-003](./ADR-DB1-003-MIGRATION-STRATEGY.md)
- [`DB5_INDEX_CATALOG.md`](../../database/DB5_INDEX_CATALOG.md)
- [`DB5_INDEX_COST_REDUNDANCY_REPORT.md`](../../database/DB5_INDEX_COST_REDUNDANCY_REPORT.md)
- PostgreSQL 16 `CREATE INDEX CONCURRENTLY` — https://www.postgresql.org/docs/16/sql-createindex.html#SQL-CREATEINDEX-CONCURRENTLY (checked 2026-07-18)
- PostgreSQL 16 index maintenance / statistics views — https://www.postgresql.org/docs/16/monitoring-stats.html (checked 2026-07-18)
