# DB10 — Cross-Machine Setup & Recovery (RB-01/02/03/07/08/09/10)

Rehearsed by `db10-cp5-recovery.integration.spec.ts` (fresh setup + lost
volume). Requirements: `DB0_PORTABILITY_RECOVERY_REQUIREMENTS.md`.
Local development detail: `docs/development/LOCAL_DEVELOPMENT.md`.

The governing principle (DB0 §1): **Git is the source of truth.** A database
volume is never authoritative — everything a new machine needs is in the
repository plus, optionally, a data backup.

## RB-01/RB-02 — New machine, fresh database

```sh
git clone <repo> && cd embroidery
cp .env.example .env                 # PORT overrides go here (e.g. POSTGRES_PORT)
pnpm install
pnpm docker:dev:up postgres          # pinned postgres:16.14-alpine, named volume
pnpm db:migrate                      # empty → all 31 migrations, in order
node packages/database/tools/db-fingerprint-gate.mjs "$DATABASE_URL"
pnpm db:check:manifest
```

**Rehearsed:** an empty database migrated from zero reaches the canonical
baseline — 78 tables, all catalog checkers, the canonical fingerprint. This is
the new-machine bootstrap proven in miniature.

## RB-03 — Upgrade an existing database

```sh
git pull
pnpm db:status                       # shows pending migrations / drift; exit 0 only when clean
pnpm db:migrate                      # applies only the new migrations
pnpm db:check:manifest
```

Migrations are forward-only (ADR / SV-08). There is no down-migration; a bad
migration is recovered by PITR or a forward-fix (see the DR matrix DR-02).

## RB-07/RB-08 — Lost volume / corrupted local volume

```sh
# If the volume is gone, recreate it and either migrate fresh or restore data:
pnpm db:reset                        # destroys and recreates the local volume (destructive, local-only)
pnpm db:migrate                      # fresh schema
# …or, to recover data, restore the latest backup instead of migrating:
pnpm db:restore --manifest <path> --target <db> --create
```

**Rehearsed:** a populated database was backed up, **destroyed**, and recovered
from the artifact into a new database that passes the fingerprint gate — the
lost-volume path end to end.

## RB-08 (branch divergence) / RB-09 (full reset)

Switching to a branch with a different migration state is detected by
`pnpm db:status` / the checksum gate rather than silently corrupting
(PR-09/PR-10). A full deterministic reset is `pnpm db:reset` then
`pnpm db:migrate`.

## RB-06 — Failed / bad migration

A post-hoc edit to a frozen migration (`0000`–`0031`) is invisible to
`pnpm db:migrate` and to `drizzle-kit check`, but the checksum gate catches
it. **Rehearsed:** on a copy of the migrations tree, a one-line edit to
`0000_create_identity_tables.sql` changed its sha256 and the gate failed with
exit 1, naming the file and both hashes. Never edit a frozen migration; add a
new forward migration instead.

## RB-10 — Verification checklist (post-recovery)

```
[ ] pnpm db:status                      → clean
[ ] db-fingerprint-gate                 → canonical fingerprint
[ ] pnpm db:check:manifest              → all checks passed
[ ] pnpm db:migrate:checksums (gate)    → all 31 match the frozen manifest
[ ] application starts and connects
[ ] (if data restored) row counts match the backup manifest
[ ] (if object storage in scope) asset binaries resolve — a DB restore alone
    does not recover them
```

## Credentials differing per machine (SC-06)

Credentials are provisioned per machine and never committed (`.env` is
git-ignored). A recovery on a machine with different credentials configures
them in `.env`; nothing in the schema or the backup artifact assumes a
specific credential — the tools connect over the container's local socket and
never embed one.
