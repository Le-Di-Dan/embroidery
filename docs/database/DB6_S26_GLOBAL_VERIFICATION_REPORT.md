# DB6-S26 Group Report — Canonical Global Verification & Release-Candidate Reconciliation

## A. Preflight

- Canonical S26 scope: no `ROADMAP.md` exists in this repository, and no DB6 document
  defines an S26 scope narrower or different from "global verification" — every mention of
  S26 across the manifests is a placeholder ("S26–S28 remain open"). Per the execution
  prompt's own contingency clause, the prompt's expected direction (global deterministic
  verification, migration-chain integrity, fresh/upgrade/no-op/drift/parity reconciliation,
  release-candidate evidence) is applied as-is — no canonical conflict found, no scope
  forced.
- Branch `production`. Commit chain verified present and unaltered: `8774d29`, `3ffade2`,
  `c0aa466` (S24), `08effd0` (S25). Tree clean at HEAD before this slice, no amend/rewrite,
  not pushed.
- Migrations `0000`–`0031` byte-identical; journal has 31 entries. No S26 migration was
  created (this slice is verification-only — see §D "Schema changes: none").
- `drizzle-kit check` clean. `pnpm --filter @embroidery/database exec tsc --noEmit` clean.
  `npx eslint .` clean (including the 8 new live-checker files under
  `packages/database/tools/`). `node tools/check-file-size.mjs` passes.
- `node tools/db-manifest-check.mjs` → all checks passed. `node tools/db-metric-check.mjs`
  and `node tools/db-deferred-owner-check.mjs` → exit 0.
- Live disposable baseline (fresh install, before any S26-specific check) matched the
  expected canonical figures exactly on first read — no drift found requiring correction:
  78 tables, 833 columns, 160 FK, 78 PK, 50 UQ, 189 CHECK, 211 indexes, 46 partial (13
  unique + 33 performance), 37 non-partial performance, 9 JSONB, 1 trigger function, 30
  triggers.
- Relationship baseline: 164 logical / 160 physical targets / 160 implemented — confirmed,
  no reversion to 162.
- Zero unresolved index backlog (`DB6_INDEX_IMPLEMENTATION_MANIFEST.md` §7: 133/133 `IDX-*`
  satisfied). Zero unresolved deferred-FK ledger rows (7/7 resolved). No S27/S28 file or
  object found in the repository. Persistent dev DB confirmed read-only throughout
  (migration id 29 before and after).

## B. Global inventory

Full detail in `DB6_FINAL_PHYSICAL_INVENTORY.md`. Summary: all ten object classes (tables,
columns, relationships, constraints, indexes, JSONB, money, mutability, triggers,
migrations) independently re-derived from the live catalog and matched the canonical
baseline exactly — no correction to a live schema object was needed anywhere in this slice.

Two **documentation-completeness** items were found and fixed in place (no schema change,
consistent with the "not allowed to block on prose" preflight policy carried since S24):

1. `tools/db-manifest-check.mjs`'s retired/conditional/rejected IDX scan note changed from
   "108 source files clean" (pre-S25) to "109" — an informational count of scanned files
   that tracks the schema directory's own growth, not a defect; re-confirmed stable at 109
   across this slice's re-runs.
2. No new deviation was required — DEV-DB6-017 (160 ceiling) and the DB6-S25 partial-index
   split correction (46/33/37) were both independently re-derived from first principles in
   this slice (not merely re-read) and both reproduced identically, closing the loop a
   second time.

## C. Migration matrix

Full detail in `DB6_MIGRATION_MATRIX_REPORT.md`. Two independent fresh installs
(`embroidery_s26_fresh_a`, `embroidery_s26_fresh_b`) and four upgrade-prefix installs (G10 →
`0014`, G15 → `0023`, G19 → `0029`, S24 → `0030`, each seeded with one `admin_accounts` +
one `customers` row before completing the chain to `0031`) all produced byte-identical
final metrics, byte-identical seed survival, and byte-identical deterministic fingerprints.
No table rebuild anywhere (every migration in this project is additive DDL). No-op reapply
and `drizzle-kit check` both clean after the full matrix.

## D. Deterministic fingerprint

`packages/database/tools/db-schema-fingerprint.mjs` normalizes columns, constraint
definitions, index definitions, function definitions, and trigger definitions (excluding
OIDs, timestamps, and other unstable identifiers) into canonical JSON and SHA-256 hashes it.
All six disposable databases in §C produced:

```
4ca56a5967730d257edb34e72d6c40373156704cab7c87e3a684803c8321672f
```

No hand-written hash input — the fingerprint script queries `pg_catalog`/
`information_schema` directly.

## E. Checker coverage

Full detail in `DB6_CHECKER_COVERAGE_MATRIX.md`. Every canonical object class has at least
one checker; none is covered by a single monolithic script. This slice closed two
previously-open coverage gaps flagged by earlier audits but never built:
`db-live-money-check.mjs` (closes the gap `DB6_MONEY_SCALE_AUDIT.md` §8 explicitly deferred)
and `db-live-triggers-check.mjs` (the first checker that verifies S24's trigger inventory
against the live catalog rather than only reading its own group report). Negative/tamper
fixtures exist for the three checker families where a live mutation-rejection SQLSTATE is
the natural evidence (constraints, money, triggers) — see §F.

## F. Security/data safety

- Secret/PII scan (`packages/database/src/schema/**`, `packages/database/migrations/**`):
  zero real secret-shaped columns. Every `password`/`otp`/`token`/`api_key`/`pan`/`cvv`
  match is either a comment documenting the *absence* of such a column, or a `*_hash`
  column (`token_hash`, `code_hash`) — the approved one-way-reference pattern. No plaintext
  secret persists anywhere in this schema.
- Data-destructive DDL scan: grepped `packages/database/migrations/*.sql` for
  `DROP TABLE|DROP COLUMN|TRUNCATE|DELETE FROM|UPDATE .* SET` outside `CREATE`/`ALTER ...
  ADD` — zero matches. Every migration from `0000` through `0031` is purely additive.
- Trigger error-message scan: every rejection raised by `fn_reject_mutation_conditional`
  contains only `TG_OP` and `TG_TABLE_NAME` — no row content, no JSONB, no PII (verified
  once at S24, re-confirmed unchanged this slice since migration `0030` was not touched).
- Persistent dev DB: read-only for the entire slice (two `SELECT max(id) FROM
  drizzle.__drizzle_migrations` checks, start and end, both `29`). No upgrade, reset, seed,
  repair, or negative fixture ever targeted it.

## G. Metrics

```
tables:                          78 / 78
physical columns:               833
logical relationships:          164
physical FK targets:            160
physical FKs:                   160 / 160

PK:                               78
UQ:                               50
CHECK:                          189

physical indexes:               211 / 211
physical partial indexes:        46
partial unique:                  13
partial performance:             33
non-partial performance:         37

JSONB:                             9 / 9

trigger functions:                1
triggers:                        30

migrations:                      31
latest:                        0031

fingerprints compared:            6  (2 fresh + 4 upgrade-prefix) — all identical
negative fixtures:                3  (fractional VND, unique violation, trigger reject) — all PASS
checker families:                11  (tables, columns, relationships, constraints, indexes,
                                       JSONB, money, mutability, triggers, migrations, deviations)
unresolved mismatches:             0
```

## H. Task board

```
DB6-G01..G19 = COMPLETE
DB6-S24      = COMPLETE
DB6-S25      = COMPLETE
DB6-S26      = COMPLETE
DB6-S27..S28 = OPEN
OVERALL DB6  = IN PROGRESS
```

## I. Commits

One commit (verification-only; the two documentation-completeness items in §B were
resolved inline, no correction checkpoint needed):

`chore(database): complete DB6 global verification` — adds the 4 required reports, 8 new
live-catalog checker scripts under `packages/database/tools/`, and the small ESLint config
addition needed to lint them. No table/column/FK/constraint/index/trigger change; no
migration added.

Branch `production`, tree clean before commit, not pushed, not amended.

## J. Verdict

```text
DB6-S26      PASS
OVERALL DB6  IN PROGRESS
```

Per standing instruction: stop after S26. Do not start S27 without a new explicit prompt.
Do not mark DB6 complete — S27–S28 remain open.
