# DB6 Final Physical Inventory (S26)

Live-catalog-derived on two independent fresh disposable installs and four upgrade-prefix
disposable installs (all six identical — see `DB6_MIGRATION_MATRIX_REPORT.md` §3 for the
fingerprint proof). No hand-accumulated figure in this document.

> **Superseded in part by APP2-DB01** (migration `0032`, application era). Two
> figures below moved and are no longer the live baseline: **CHECK constraints
> 189 → 190** (`ck_asset_derivatives__watermark_by_kind`, CST-126) and the
> schema **fingerprint → `82864268c990990e4597c74cfc69b7b5a91b1bc5a2adbde098ab9ad43aed58cf`**
> (31 → 32 migrations). Tables (78), columns (833), FKs (160), PKs (78),
> UNIQUEs (50), indexes and triggers are unchanged. The executable baseline is
> `packages/database/tools/db-live-constraints-check.mjs` and
> `packages/database/tools/canonical-fingerprint.txt`; this document keeps its
> DB6-era figures as the historical record.

> **Amended by APP2-B02-G01** (migration `0033`, application era). The migration
> count moves **32 → 33** and nothing else does: `0033` provisions the four
> fixed APP2 catalog categories as **data only**, so tables (78), columns (833),
> CHECKs (190), FKs (160), PKs (78), UNIQUEs (50), indexes, triggers and the
> fingerprint `82864268c990990e4597c74cfc69b7b5a91b1bc5a2adbde098ab9ad43aed58cf`
> are all unchanged — verified by running
> `packages/database/tools/db-schema-fingerprint.mjs` against a fresh
> 33-migration database and comparing it with `canonical-fingerprint.txt`. The
> fingerprint hashes the normalized catalog, never row contents, so a data
> migration cannot move it.

## 1. Tables (78/78)

- 78 unique `TBL-*` IDs, 78 unique physical tables, one owner group each (19 groups,
  `DB6_SCHEMA_IMPLEMENTATION_MANIFEST.md` §3), one schema export each
  (`packages/database/src/schema/index.ts`), one PK each — verified live via
  `tools/db-live-tables-check.mjs` (zero tables without a PK, zero duplicate table names).
- No business table exists outside the canonical manifest (`db-manifest-check.mjs`'s
  schema/manifest cross-reference: 78 files on disk = 78 exported = 78 manifest-referenced).

## 2. Columns (833)

- 833 physical columns, reconciled against the register's
  `logicalIds + expansions + convention = physical` formula for all 78 tables
  (`tools/db-metric-check.mjs`'s column-metrics check; `tools/db-live-tables-check.mjs`
  confirms the live count).
- Convention-column ownership (`idColumn`/`sequenceColumn`, `createdAt`, `updatedAt`
  presence vs. mutability class) verified for all 78 implemented tables — zero stale
  planned column, zero undocumented physical column
  (`db-manifest-check.mjs` §12).

## 3. Relationships (164 logical / 160 physical)

- 164 logical edges (92 `REL-*` rows → 153 derived + 11 added under
  DEV-DB6-010/012/013/014), unchanged since G19.
- 160 physical FK targets / 160 live FKs — DEV-DB6-017's corrected ceiling, independently
  re-derived twice now (S24-P0 and again here): zero missing FK, zero extra FK, zero
  duplicate edge, zero unresolved deferred-FK ledger row (`tools/db-deferred-owner-check.mjs`
  — 7 edges, all resolved), zero unowned physical FK. No reversion to the stale 162.
- Every logical no-FK edge (REL-103 `audit_events`, REL-104 `outbox_events`, plus the two
  DEV-DB6-016 `notification_intents` edges) has one canonical classification and owner —
  see `DB6_PHYSICAL_ISOLATION_AUDIT.md`.

## 4. Constraints (78 PK / 160 FK / 50 UQ / 189 CHECK)

Live-verified via `tools/db-live-constraints-check.mjs`, filtered to the `public` schema
(unfiltered `pg_constraint` scans silently inflate counts with `pg_catalog` system-table
constraints — a mistake caught once already during G19 and guarded against here
permanently). No partial-unique index is double-counted as a UNIQUE table constraint; no
trigger-owned rule (S24's `fn_reject_mutation_conditional`) is counted as a CHECK.

## 5. Indexes (211/211)

```
PK backing               78
UNIQUE backing            50
partial unique             13
partial performance        33
non-partial performance    37
------------------------------
total                     211
physical partial (total)   46  (13 unique + 33 performance)
```

This is the DB6-S25-corrected split (46/33/37, not the stale pre-S25 45/32/38 estimate —
see `DB6_S25_INDEX_BACKLOG_REPORT.md` §D). Verified live via
`tools/db-live-indexes-check.mjs`: zero pending launch index, zero duplicate definition,
zero volatile predicate (`now()`/`current_*` scan against every partial predicate), zero
non-conforming index name (every non-constraint-backed index carries the approved `ix_`
prefix).

## 6. Triggers (1 function / 30 triggers)

Verified live via `tools/db-live-triggers-check.mjs` against the exact canonical
table→`TG_ARGV` register from `DB6_S24_TRIGGER_REPORT.md` §C: zero missing trigger, zero
extra trigger, zero wrong-table trigger, zero argument drift since S24 shipped migration
`0030`. `fn_reject_mutation_conditional` remains `SECURITY INVOKER`.

## 7. JSONB (9/9)

Verified live via `tools/db-live-jsonb-check.mjs`: exactly 9 physical JSONB columns, zero
GIN/GiST/BRIN index over any of them (no canonical boundary calls for one).

## 8. Money (23 amount columns / 15 tables)

Verified live via `tools/db-live-money-check.mjs` — a checker that did not exist before this
slice (`DB6_MONEY_SCALE_AUDIT.md` §8 flagged this as "future tooling work, not implemented"):
every `%amount%`-named column is `numeric(14,2)`, never float/real/double; every table
carrying one or more amount columns carries at least as many `ck_*_currency_scale` CHECK
constraints, none containing a volatile expression.

## 9. Mutability classes

Every table has exactly one class (mutable / mixed-column-scoped / immutable /
frozen-after-state / append-only), cross-checked against its S24 trigger (or documented
absence of one for plain-mutable tables). `refunds` remains the one mixed
("state mutable + amounts immutable") class, correctly carrying `updated_at` — see
`DB6_PHYSICAL_ISOLATION_AUDIT.md` §4. No table has a contradictory classification between
the manifest label and its live trigger (or lack thereof).

## 10. Summary

```
tables:                          78 / 78
physical columns:               833
logical relationships:          164
physical FK targets:            160
physical FKs:                   160 / 160
PK:                              78
UQ:                              50
CHECK:                          189
physical indexes:               211 / 211
physical partial indexes:        46
partial unique:                  13
partial performance:             33
non-partial performance:         37
JSONB:                            9 / 9
trigger functions:                1
triggers:                        30
migrations:                      31
latest:                        0031
```

All figures live-derived on `embroidery_s26_fresh_a`/`embroidery_s26_fresh_b` (independent
fresh installs) and cross-confirmed identical on four upgrade-prefix databases (G10, G15,
G19, S24) — see `DB6_MIGRATION_MATRIX_REPORT.md`. Persistent dev DB untouched throughout
(confirmed still at migration id 29 before and after this slice).
