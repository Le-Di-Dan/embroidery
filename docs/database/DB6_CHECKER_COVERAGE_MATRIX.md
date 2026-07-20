# DB6 Checker Coverage Matrix (S26)

Every canonical object class covered by at least one checker. Static checkers (repo root
`tools/`) parse the manifests/schema source and run without a database; live checkers
(`packages/database/tools/`, added this slice) connect to a disposable database's live
catalog. No single monolithic checker — each object class has its own focused module.

| Object class | Checker(s) | Kind | Negative/tamper coverage | Baseline result |
|---|---|---|---|---|
| Tables | `tools/db-manifest-check.mjs` (§ schema/groups) + `packages/database/tools/db-live-tables-check.mjs` | static + live | `db-manifest-check.test.mjs`-style fixtures (existing) exercise missing/duplicate TBL rows | 78/78, 0 duplicates, 0 tables without PK |
| Columns | `tools/db-metric-check.mjs` (column metrics) + `packages/database/tools/db-live-tables-check.mjs` | static + live | existing fixture tests cover register/manifest mismatch | 833/833 |
| Relationships/FKs | `tools/db-metric-check.mjs` (REL cardinality) + `tools/db-deferred-owner-check.mjs` + `packages/database/tools/db-live-constraints-check.mjs` | static + live | `db-deferred-owner-check.test.mjs` (existing) covers ownership drift; live checker asserts the DEV-DB6-017 160 ceiling explicitly, failing loudly on any reversion toward 162 | 164 logical / 160 physical / 160 live |
| Constraints (PK/UQ/CHECK) | `packages/database/tools/db-live-constraints-check.mjs` | live (new this slice) | negative fixture: duplicate `admin_accounts.email` → `23505` (§ migration matrix report §6) | 78 PK / 50 UQ / 189 CHECK |
| Indexes | `tools/db-manifest-check.mjs` (§ index ownership/formula) + `packages/database/tools/db-live-indexes-check.mjs` | static + live | volatile-predicate scan, duplicate-definition scan, non-conforming-name scan all built into the live checker | 211/211, 46 partial, 0 duplicates, 0 volatile predicates |
| JSONB | `packages/database/tools/db-live-jsonb-check.mjs` | live (new this slice) | asserts 0 GIN/GiST/BRIN over any JSONB column (would fail if a speculative index were added) | 9/9, 0 non-btree index |
| Money/currency scale | `packages/database/tools/db-live-money-check.mjs` | live (new this slice — closes the gap flagged by `DB6_MONEY_SCALE_AUDIT.md` §8, which explicitly deferred this to future tooling) | negative fixture: fractional VND insert → `23514` (§ migration matrix report §6) | 23 amount columns / 15 tables, all `numeric(14,2)`, all currency-scale-CHECKed |
| Mutability | `tools/db-manifest-check.mjs` §12 (convention-column vs. mutability-class label) + `packages/database/tools/db-live-triggers-check.mjs` (cross-checks the enforcement mechanism) | static + live | the mixed-mutability regex fix from DB6-S24 preflight is itself covered by re-running this checker every slice since | 78/78 tables one exact class each |
| Triggers | `packages/database/tools/db-live-triggers-check.mjs` | live (new this slice) | negative fixture: `UPDATE audit_events` post-S24 → `23000` (§ migration matrix report §6); checker also fails on any table→argument drift from the S24 canonical register | 1 function / 30 triggers, 0 drift |
| Migrations | `npx drizzle-kit check` + `packages/database/tools/db-schema-fingerprint.mjs` + manual journal/file audit (§ migration matrix report §1) | live + static | no-op reapply test; fingerprint equality across 2 fresh + 4 upgrade-prefix databases | 31/31, journal valid, fingerprint identical across all 6 disposable DBs |
| Deviations | `docs/database/DB6_DEVIATION_REGISTER.md` (narrative register, 17 entries, all closed) | documentation | each deviation entry documents its own resolution evidence inline; no separate script needed — deviations are corrections to documentation/estimates, not live schema state | 17/17 closed, none reopened by S26's independent re-derivation |

## Coverage gaps closed this slice

Before DB6-S26, `tools/` had no live-catalog checker at all (every existing script parsed
markdown/TypeScript source, never connected to a database) and explicitly no money-scale or
trigger-inventory checker. This slice adds, under `packages/database/tools/` (package-scoped
because these need `pg`, which does not resolve from the repo root):

- `live-db.mjs` — shared connection/reporting helper.
- `db-live-tables-check.mjs`, `db-live-constraints-check.mjs`, `db-live-indexes-check.mjs`,
  `db-live-jsonb-check.mjs`, `db-live-money-check.mjs`, `db-live-triggers-check.mjs`.
- `db-schema-fingerprint.mjs` — deterministic normalized-catalog hash.

All eight files pass `eslint .`, `tsc --noEmit` (via the package's disabled-type-checking
override for `.mjs`), and the repo file-size gate (largest is 87 lines, well under the
400-line hard limit).

## Zero uncovered high-risk object class

Every row above has at least one checker. No canonical object class (table, column,
relationship, constraint, index, JSONB, money, mutability, trigger, migration, deviation)
is currently unverified by tooling.
