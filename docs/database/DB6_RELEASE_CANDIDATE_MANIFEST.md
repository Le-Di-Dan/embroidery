# DB6 Release Candidate Manifest

## Release candidate ID

```
db6-rc-69b66d8-m0031-4ca56a59
```

Deterministic, composed from: source commit (`69b66d8`) + latest migration (`m0031`) +
schema fingerprint prefix (`4ca56a59`). Does not conflict with any existing repository
versioning scheme — this repository has none yet for database releases specifically.

## Source

- Branch: `production`
- HEAD commit: `69b66d8` (`chore: enforce LF line endings on checkout`)
- Ancestor DB6 commits: `2d184e1` (S26), `08effd0` (S25), `c0aa466`/`3ffade2`/`8774d29` (S24),
  `d81d8a8` (G19, closes G01–G19)
- Working tree: clean at time of manifest generation, not pushed.

## Migration state

- Migration count: 31 (`0000`–`0031`; idx 17 is a permanent intentional gap)
- Latest migration: `0031_add_remaining_launch_indexes.sql`
- Journal: `packages/database/migrations/meta/_journal.json`, 31 entries
- Checksum manifest: `packages/database/tools/migration-checksums.json` (SHA-256 per file,
  verified via `node tools/db-migration-checksum-check.mjs`)

## Schema fingerprint

```
4ca56a5967730d257edb34e72d6c40373156704cab7c87e3a684803c8321672f
```

Full hash stored at `packages/database/tools/canonical-fingerprint.txt`. Verify with:
`node packages/database/tools/db-fingerprint-gate.mjs <disposable-db-url>`.

## Physical metrics

```
tables:                          78 / 78
columns:                        833
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
trigger functions:                 1
triggers:                         30
```

## Required runtime versions

See `DB6_REPRODUCIBILITY_RUNBOOK.md` §1 (Node `>=22.0.0`, pnpm `11.5.2`, Docker 27.x,
PostgreSQL `16.14-alpine`).

## Validation commands (canonical, no invented paths)

```
pnpm --filter @embroidery/database exec tsc --noEmit
pnpm --filter @embroidery/database exec eslint .
node tools/check-file-size.mjs
node tools/db-manifest-check.mjs
node tools/db-metric-check.mjs            (invoked by db-manifest-check.mjs)
node tools/db-deferred-owner-check.mjs    (invoked by db-manifest-check.mjs)
npx drizzle-kit check                     (from packages/database)
node packages/database/tools/db-live-tables-check.mjs <url>
node packages/database/tools/db-live-constraints-check.mjs <url>
node packages/database/tools/db-live-indexes-check.mjs <url>
node packages/database/tools/db-live-jsonb-check.mjs <url>
node packages/database/tools/db-live-money-check.mjs <url>
node packages/database/tools/db-live-triggers-check.mjs <url>
node packages/database/tools/db-fingerprint-gate.mjs <url>
node packages/database/tools/db-migration-checksum-check.mjs
```

## Checker paths (all committed, no stale references)

Repo-root static checkers: `tools/db-manifest-check.mjs`, `tools/db-metric-check.mjs`,
`tools/db-deferred-owner-check.mjs`, `tools/check-file-size.mjs`.

Package-scoped live checkers (`packages/database/tools/`): `live-db.mjs` (shared helper),
`db-live-tables-check.mjs`, `db-live-constraints-check.mjs`, `db-live-indexes-check.mjs`,
`db-live-jsonb-check.mjs`, `db-live-money-check.mjs`, `db-live-triggers-check.mjs`,
`db-schema-fingerprint.mjs`, `db-fingerprint-gate.mjs`, `db-migration-checksum-check.mjs`,
plus their fixed-value inputs `canonical-fingerprint.txt` and `migration-checksums.json`.

## Known deferred work (explicitly not complete)

```
DB6-S28                                       — not started
DB7 integration/negative repository validation — not started
DB8 concurrency validation                     — not started
DB9 measured performance validation            — not started
DB10 backup/restore/retention recovery         — not started
Application/service/controller implementation  — not started
Production deployment                          — not started
```

Physical schema verification passing does **not** imply any of the above are complete.

## Operational handoffs

- Backup/recovery procedure required before production rollout — owner: DB10 (not started).
  See `DB6_MIGRATION_OPERATIONS_RUNBOOK.md` §1.4.
- Deployment ordering / app-compatibility matrix — owner: first application-shipping slice
  (DB7 or later). See `DB6_MIGRATION_OPERATIONS_RUNBOOK.md` §2.
- Measured lock duration under real data volume — owner: DB9 (not started).

## Artifact integrity

Every path referenced above exists and is committed as of `69b66d8`. No local absolute
path, no embedded credential, no generated database dump is committed. No duplicate source
of truth: metrics are stated once here and cross-linked elsewhere, not re-derived by hand in
multiple documents.
