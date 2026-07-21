# DB10 — Backup Runbook (RB-04)

Architecture and exit codes: `DB10_BACKUP_ARCHITECTURE.md`.

## When

- Before any risky migration or bulk operation (DP-02).
- On the scheduled cadence once one exists (DP-BAK-01 — **deferred**).

## Procedure

```sh
pnpm db:backup --database <db> --out <dir> [--label <slug>] \
               [--url postgres://…]   # --url adds the schema fingerprint
```

1. Confirm the server is reachable (the tool exits 3 if not).
2. Run the command. It streams `pg_dump --format=custom` from inside the
   pinned container and writes `<backupId>.dump` + `<backupId>.manifest.json`.
3. Read the manifest. Confirm `tableCount`, `appliedMigrations`, and — if
   `--url` was passed — `schemaFingerprint` match the expected baseline.
4. **Move the artifact off-machine** (DP-BAK-07 — **deferred**; no automated
   off-site copy exists).
5. **Encrypt at rest** (DP-BAK-05 — **deferred and production-blocking**; the
   manifest records `encryption: none` until this is done).

## Do not

- Back up the development database — it holds nothing that is not reproducible
  from migrations + seed (DP-01).
- Commit an artifact. `.backups/`, `*.dump`, `*.manifest.json` are git-ignored.
- Assume a backup is good until it has been restored (RB-05).

## Failure handling

A failed dump leaves **no** artifact (the partial file is removed). Re-run
after fixing the cause the tool reports: unreachable server (3), unwritable
destination (1), unsafe database name (2).
