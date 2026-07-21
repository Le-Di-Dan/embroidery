# backup

Backup and recovery tooling for the PostgreSQL database.

This directory was a reserved stub (`GAP-07` in
`docs/database/DB0_CONFLICTS_AND_GAPS.md`). **DB10 closes that gap** — with
an explicit boundary around what exists and what does not.

## What exists

The executable tooling lives in the repository's `tools/` directory, next to
the other database tools, because it is invoked the same way and shares the
same container conventions:

| Path | Purpose |
|---|---|
| `tools/db-backup.mjs` | logical backup (`pg_dump` custom format) + integrity manifest |
| `tools/db-restore.mjs` | verified restore, with hash and row-count parity checks |
| `tools/backup-runtime.mjs` | shared container/manifest runtime for both |

```sh
pnpm db:backup  --database embroidery --out ./.backups --label pre-migration
pnpm db:restore --manifest ./.backups/<id>.manifest.json --target embroidery_check --create
```

Both refuse to run against an unreachable server, reject unsafe database
names, and leave nothing behind when they fail. Exit codes are contractual —
see `docs/database/DB10_BACKUP_ARCHITECTURE.md` §4.

## Documentation

| Document | Contents |
|---|---|
| `docs/database/DB10_BACKUP_ARCHITECTURE.md` | the four-layer strategy, tooling design, manifest schema, exclusions |
| `docs/database/DB10_BACKUP_RUNBOOK.md` | RB-04 — taking a backup |
| `docs/database/DB10_RESTORE_RUNBOOK.md` | RB-05 — restoring one |
| `docs/database/DB10_PITR_RUNBOOK.md` | point-in-time recovery |
| `docs/database/DB10_DISASTER_RECOVERY_RUNBOOK.md` | RB-06/07/08/09 — failure scenarios |
| `docs/database/DB10_DURABILITY_PARAMETER_REGISTRY.md` | every RPO/RTO/retention value, and who owns the ones still unset |

## What does not exist

Stated here rather than left for someone to discover during an incident:

- **No scheduler.** Nothing runs a backup automatically. `apps/worker` is
  still a bootstrap shell and no queue/broker has been chosen.
- **No encryption at rest.** Every artifact records `"encryption": "none"` in
  its own manifest. A dump of this schema is high-sensitivity by
  classification; treat an unencrypted one accordingly.
- **No off-site or second-region copy**, and no object-storage integration —
  the storage product is an open decision.
- **No production credentials anywhere.** The tools connect over the
  container's local socket and never handle a password.
- **Object-storage binaries are not backed up here.** A database restore
  recovers asset *references*; the bytes are a separate system's problem.

Backup files are not committed. Keep them outside the working tree, or under
a git-ignored path such as `./.backups`.
