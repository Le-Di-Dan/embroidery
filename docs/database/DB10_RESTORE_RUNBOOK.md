# DB10 — Restore Runbook (RB-05)

Architecture and exit codes: `DB10_BACKUP_ARCHITECTURE.md`.
Rehearsed end to end in `db10-cp2-logical-restore.integration.spec.ts`.

## Procedure

```sh
pnpm db:restore --manifest <path> --target <new-db> --create
```

1. The tool verifies the artifact's sha256 against the manifest **first**. A
   mismatch exits 4 with nothing created.
2. `--create` makes a new empty database. The tool refuses to restore over an
   existing one (exit 1) — never restore on top of a live database.
3. `pg_restore` runs; on success the tool asserts per-table row-count parity
   and migration-journal parity against the manifest, and exits non-zero if
   either differs. A restore is not "done" because `pg_restore` returned 0.
4. Run the schema gates against the restored database:
   ```sh
   node packages/database/tools/db-fingerprint-gate.mjs postgres://…/<new-db>
   pnpm db:check:manifest   # against the restored URL
   ```
5. Point the application at the restored database; `ANALYZE` before trusting
   any query plan on it.

## Selective restore

- `--schema-only` — rebuild an empty schema (rehearsed; passes the fingerprint
  gate).
- `--data-only` — **not** a promised recovery path: 160 FK edges and the S24
  append-only triggers reject the out-of-order writes a data-only load into a
  populated database would attempt. Use a full restore into a fresh database.

## If a restore fails part-way

The tool drops the database it created (unless `--keep-failed` was passed for
diagnosis), so a half-restored database never survives to be mistaken for a
good one. The artifact is untouched; investigate and re-run.
