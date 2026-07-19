# DB6 — Index & Constraint Metric Reconciliation (DB6-C5 §B3/B4/B5)

**Date:** 2026-07-19 · **Slice:** DB6-C5
**Method:** every number below is read directly from `pg_class`/`pg_index`/
`pg_constraint` on a disposable database at the stated migration boundary —
none is hand-added. Three disposable snapshots were built for this
reconciliation: through `0023` (G15 state), through `0025` (G16 state, before
C5), and through `0026` (G16+C5, current). All three were dropped after use;
the persistent dev database (still at 65 tables / 23 migrations) was never
touched.

## 1. Root cause of the blocked report's arithmetic

The blocked DB6-G16 report mixed at least three different metrics under the
single label "launch indexes" without saying which:

1. **Total physical index objects** (`pg_class.relkind='i'`) — includes the
   78 PK-backing indexes that carry no `IDX-*` ID (per
   `DB6_INDEX_IMPLEMENTATION_MANIFEST.md` §2.4).
2. **`IDX-*` catalog entries satisfied** — excludes PK-backing indexes,
   since PK carries no `IDX-*` ID at all.
3. **Newly-added physical indexes for one group** — conflated with (2)'s
   per-group delta despite counting a different set (e.g. counting only the
   *performance*-tier IDX rows added, and separately miscounting the
   constraint-backed unique as also-a-partial).

`DB6_INDEX_IMPLEMENTATION_MANIFEST.md` §2.5 already defines metric (1) as the
canonical "**total physical indexes at launch: 211**" formula
(`78 PK + 50 UNIQUE + 13 partial-unique + 70 performance`). This
reconciliation uses that formula's *implemented* analogue throughout — no
denominator was changed.

## 2. Live catalog reconciliation

| Metric | G15 (`0023`) | G16 (`0025`) | G16+C5 (`0026`, current) |
|---|---|---|---|
| Tables | 65 | 70 | 70 |
| PK constraints (`pg_constraint contype='p'`) | 65 | 70 | 70 |
| FK constraints (`contype='f'`) | 133 | 146 | 146 |
| UNIQUE constraints (`contype='u'`) | 45 | 46 | 46 |
| CHECK constraints (`contype='c'`) | 134 | 156 | **177** |
| Total physical indexes (`pg_class relkind='i'`) | 153 | 166 | 166 |
| Physical partial indexes (`indpred is not null`) | 29 | 33 | 33 |
| — of which partial-unique | 12 | 13 | 13 |
| — of which partial-performance | 17 | 20 | 20 |
| Non-partial performance indexes | 14 | 17 | 17 |

**Read `information_schema.table_constraints` never for CHECK counts** — it
folds Postgres's per-column `NOT NULL` constraints into the same `CHECK`
bucket (721 rows for the current schema, vs. 177 real named `CHECK`
constraints in `pg_constraint`). This conflation is the direct cause of
blocker B5's "8 vs 16" contradiction: one figure in the blocked report came
from `pg_constraint` (or a manual count of `check(...)` calls), the other
from `information_schema`, or from miscounting mid-edit. The corrected,
checker-enforceable rule: **CHECK count = `pg_constraint` rows with
`contype='c'`, full stop.**

## 3. G16's own true delta (corrected)

| Object | Delta | Detail |
|---|---|---|
| Tables | +5 | TBL-054..058 |
| Physical columns | +67 | matches `column-metrics.ts`, unchanged by this audit |
| PK constraints | +5 | one per new table |
| FK constraints | +13 | REL-081/082/083×2/084/085×2/086/087×2/088×3 |
| UNIQUE constraints | **+1** | `uq_payment_provider_events__provider_key__provider_event_ref` (CST-040, IDX-043) |
| CHECK constraints | **+22** (not +16, not +8) | 5 payment_obligations + 5 payment_attempts + 4 payment_provider_events + 3 payment_reconciliations + 5 refunds |
| Total physical indexes | **+13** (not +8) | +5 PK-backing + 1 UNIQUE-backing (IDX-043) + 7 explicit (IDX-042 partial-unique, IDX-075/076/077/079/080/081 performance) |
| — of which partial | +4 | IDX-042 (partial-unique) + IDX-076/080/081 (partial-performance) |

The "8 physical indexes" figure in the blocked report undercounted by
omitting the 5 new PK-backing indexes and the 1 new UNIQUE-backing index
(IDX-043) — both real physical objects per §2.4/§2.3 of the index manifest,
just objects that carry no explicit `CREATE INDEX` statement. It correctly
counted the 8 *explicit-plus-partial-unique* items
(IDX-002-class partial-unique IDX-042 + 6 performance rows), but reported
that subtotal as if it were the group's total physical-index delta.

## 4. C5's own delta

| Object | Delta |
|---|---|
| Tables / columns / FKs / PK / UNIQUE | **0** |
| CHECK constraints | **+21** (one `_currency_scale` CHECK per affected money column, §`DB6_MONEY_SCALE_AUDIT.md`) |
| Indexes (any kind) | **0** |

Confirmed directly: `total_indexes` and `partial_indexes` are identical
between the G16 (`0025`) and G16+C5 (`0026`) snapshots (166 / 33 both). C5
never touches an index.

## 5. Corrected launch-index metric

```text
implemented launch indexes (G16+C5)
  = PK-backing(70) + UNIQUE-backing(46) + partial-unique(13) + performance(37)
  = 166
target (full launch, all 19 groups + S25 tiers)
  = 78 + 50 + 13 + 70
  = 211
remaining to build
  = 211 - 166 = 45   (33 performance-tier required/recommended not yet shipped
                        for G1–G16's own backlog, per manifest §6/§7's pending
                        table, + all of G17–G19's own performance tier, +
                        the 5 PK/backing objects for G17–G19's 8 remaining
                        tables scale proportionally as those groups land)
```

**Corrected value: 166 / 211 implemented launch indexes** (not 133, not
135). `133` (the blocked report's own accepted-as-canonical pre-G16 baseline)
and `127` do not correspond to any metric measurable in the live catalog at
either boundary — most likely both were themselves instances of the same
metric-conflation described in §1, compounding across multiple prior group
reports rather than a single G16-introduced error. This reconciliation
resets the baseline to the live-catalog-derived value going forward; no
further group should hand-add to it.

## 6. Corrected partial-index metric — Outcome A (report arithmetic error)

The canonical **denominator remains 45** (13 unique + 32 performance,
verbatim from `DB6_INDEX_IMPLEMENTATION_MANIFEST.md` §4: *"all 45 partials
(13 unique + 32 performance)"*) — this is the full-launch target across all
19 groups, not a per-group or current-implemented count. No deviation ID is
needed; no denominator changed.

**Current implemented: 33 / 45** (13/13 unique-partial — complete; 20/32
performance-partial). The blocked report's "47", "+2", "4 new" figures do
not reconcile with any live-catalog quantity at any boundary checked; they
are corrected by this document, not carried forward.

## 7. G16's 13 partial-unique indexes — confirmed no double count

Every partial-unique index in this schema was checked against
`pg_constraint` via `LEFT JOIN ... ON con.conindid = i.indexrelid`: **all 13
return no matching constraint row** (`condef` empty). Partial-unique indexes
are never represented in `pg_constraint` — Postgres has no partial-unique
*constraint* type (`DB6_INDEX_IMPLEMENTATION_MANIFEST.md` §2, confirmed
live). The checker rule going forward: **a partial-unique index must never
also appear in the `contype='u'` count** — verified true for all 13,
including the newly-added `uq_payment_obligations__order_kind__live`
(IDX-042).

## 8. Checker rules (going forward)

1. CHECK count = `pg_constraint.contype='c'` only, never
   `information_schema.table_constraints`.
2. A partial-unique index (`pg_index.indisunique AND indpred IS NOT NULL`)
   must have zero matching `pg_constraint` row — enforced by the same query
   pattern as §7.
3. "Total physical indexes" always includes PK-backing indexes; a per-group
   delta report must state the PK-backing count explicitly rather than
   implying it's zero by omission.
4. `partial indexes / 45` and `launch indexes / 211` are two independent
   denominators — never sum or difference one against the other.
