# DB10 — Backup Architecture

**Created:** DB10-CP1. Companion runbooks: `DB10_BACKUP_RUNBOOK.md`,
`DB10_RESTORE_RUNBOOK.md`, `DB10_PITR_RUNBOOK.md`.

**Scope honesty (§18).** What follows is a layered *strategy* with one layer
fully implemented and rehearsed locally, one layer rehearsed as a mechanism
only, and two layers that are deliberately unbuilt because the decisions they
depend on are open. Nothing here claims that a local Docker rehearsal is a
production implementation.

## 1. The four layers

| Layer | Purpose | Status in this repository |
|---|---|---|
| **L1 — Logical backup** (`pg_dump` custom format) | Portable, version-checkable, selective-restore-capable snapshot of one database | **Implemented and rehearsed** — `tools/db-backup.mjs`, `tools/db-restore.mjs`, DB10-CP2 |
| **L2 — Physical base backup + WAL archive (PITR)** | Recovery to an arbitrary point in time, not just to the last dump | **Mechanism rehearsed** in a dedicated disposable container (DB10-CP3). Not configured on any long-lived instance; the archive destination is an open infrastructure decision |
| **L3 — Off-site / second-region copy** | Survives loss of the primary site | **Not built.** Object storage is an open decision (`CLAUDE.md` §8). No local substitute proves anything about a second site |
| **L4 — Configuration and secret backup** | Restoring a *system*, not just a database | **Deliberately excluded.** `.env` is git-ignored and never enters a backup artifact; configuration is reconstructed from `.env.example` plus a secret store that does not exist yet |

**L1 without L2 gives an RPO equal to the backup interval** — everything
since the last dump is lost. That arithmetic is why L2 exists as a rehearsed
mechanism rather than a note, even though no instance is configured for it.

## 2. Why logical backup is the primary layer here

ADR-DB1-011/DEC-11 selected logical `pg_dump`. DB10 confirms the choice
against what this schema actually is, rather than re-litigating it:

- The database is **one** database with two schemas (`public`, `drizzle`) and
  no cross-database dependency, so a logical dump is complete by itself.
- The dump is **version-portable**: it restores onto a different minor
  version, and onto a machine whose data directory layout differs. A physical
  base backup is not portable that way, which matters for a project whose
  stated requirement (`DB0_PORTABILITY_RECOVERY_REQUIREMENTS.md`) is that a
  developer can move machines.
- Custom format supports **selective restore** (`--schema-only`,
  `--data-only`, `--table`), which physical backup cannot do at all.
- At the scale this project targets (20–100 products), a full logical dump is
  seconds of work. The trade-off logical backup normally loses — dump time on
  a large database — does not apply yet, and DB10 says so rather than
  pretending the choice is unconditional. `audit_events` is the table that
  will eventually change that calculus.

## 3. Environment recommendations

These differ, and collapsing them into one policy is how a development
convenience ends up in production.

| | Development | Staging | Production |
|---|---|---|---|
| L1 logical backup | On demand, before a risky migration (DP-02) | Scheduled, low frequency | Scheduled — frequency is **DP-BAK-01, deferred** |
| L2 PITR | Not needed; the dev DB is reproducible from migrations + seed | Optional | **Required** once an RPO exists that is shorter than the backup interval |
| L3 off-site | Not applicable | Recommended | **Required** — DP-BAK-07 |
| Encryption at rest | Not applicable (no real data) | Required if real data is ever copied down | **Required — DP-BAK-05, production-blocking** |
| Restore rehearsal | Every DB10 run (`pnpm test`) | Per release | Periodic — cadence is **DP-BAK-08, deferred** |
| Retention of artifacts | Delete freely | Short | ≥ the longest protected data class — **DP-BAK-02, derived, deferred** |

**The development database is never a backup target.** It holds nothing that
is not reproducible from `packages/database/migrations` plus a seed, and
`DP-01` says exactly that. Backing it up would create a file with the risks
of a real backup and none of the value.

## 4. Tooling

### `tools/db-backup.mjs`

```
node tools/db-backup.mjs --database <name> --out <dir> [--label <slug>]
                         [--container <name>] [--retention-class <text>]
                         [--url <fingerprint-url>]
```

Produces `<backupId>.dump` and `<backupId>.manifest.json`.

Three design decisions are load-bearing:

1. **Client tools run inside the pinned container** (DEC-DB10-006), over the
   local unix socket. The tool never receives, stores or passes a password,
   and the client is the same 16.14 build as the server, which removes
   version skew as a restore-failure mode.
2. **The manifest is the deliverable, not the dump.** A bare dump file cannot
   tell an operator which schema version it holds, whether it is intact, or
   what it is safe to do with. See §5.
3. **A failed dump leaves nothing behind.** The artifact is streamed to disk
   and deleted on any non-zero exit, because a truncated file with a
   plausible name is worse than no file at all.

`--no-owner --no-privileges` are always applied: an artifact that only
restores under the role that created it is not portable, and portability is
the whole reason this layer was chosen.

### `tools/db-restore.mjs`

```
node tools/db-restore.mjs --manifest <path> --target <database>
                          [--create] [--schema-only|--data-only]
                          [--verify-only] [--keep-failed]
```

- The artifact hash is verified **before** anything is created or restored,
  so a corrupted or substituted dump fails at a known point (exit 4) with no
  side effects at all.
- `--create` refuses to touch a database that already exists. This tool never
  drops a pre-existing database; "restore over the top of it" is how a
  recovery becomes a second incident.
- A restore that fails part-way **drops the database it created**, unless
  `--keep-failed` is passed for diagnosis. A half-restored database that
  looks real is the trap this avoids.
- On success it asserts per-table row-count parity against the manifest and
  migration-journal parity, and fails if either differs. A restore is not
  "successful" because `pg_restore` exited zero.

### Exit codes

| Code | Meaning |
|---|---|
| 0 | success |
| 1 | operation failed (dump/restore error, parity mismatch, unwritable destination) |
| 2 | usage error (unknown option, missing value, unsafe identifier) |
| 3 | server or database unavailable |
| 4 | artifact corrupt or unreadable — nothing was restored |

## 5. Manifest contents (§20)

```json
{
  "backupId":        "20260721T140701Z-embroidery-cp1smoke",
  "createdAt":       "ISO-8601",
  "sourceDatabase":  "embroidery",
  "sourceContainer": "embroidery-dev-postgres-1",
  "postgresVersion": "16.14",
  "schemaFingerprint": "4ca56a59…1672f | null",
  "appliedMigrations": 31,
  "format":          "pg_dump/custom",
  "compression":     "pg_dump custom default (zlib)",
  "artifact":        "<backupId>.dump",
  "artifactBytes":   299561,
  "artifactSha256":  "…",
  "durationMs":      1234,
  "tableCount":      78,
  "totalRows":       0,
  "rowCounts":       { "orders": 0, "…": 0 },
  "encryption":      "none",
  "sanitization":    "none",
  "retentionClassification": "unclassified — DP-BAK-02 deferred",
  "restoreCommand":  "node tools/db-restore.mjs --manifest … --target … --create"
}
```

No field holds a credential; the connection string never enters the manifest,
only the container and database names.

**`encryption` and `sanitization` are always written, always explicitly.**
An artifact of this schema contains customer contact points, design
documents, payment evidence and admin credential hashes — every one of them
classified high-sensitivity in `DB2_DATA_CLASSIFICATION_MAP.md`. The manifest
declares its own exposure so that an unencrypted artifact cannot be mistaken
for a safe one. This is the mechanism behind DP-BAK-05 being the single
production-blocking parameter in the registry.

## 6. What is excluded from the artifact, and why

| Excluded | Reason |
|---|---|
| `.env` and any secret | Git-ignored, never read by the tools, never referenced by the manifest |
| Object-storage binaries | A different system. `assets` rows restore as *references*; the bytes are the object store's recovery problem, and pretending otherwise would make a database restore look like a full recovery when it is not |
| Roles and grants | `--no-owner --no-privileges`; the target's own role model applies |
| Server configuration | `postgresql.conf` is infrastructure, reconstructed from compose, not from a dump |

## 7. Known gaps

| Gap | Owner | Blocking? |
|---|---|---|
| No encryption at rest (DP-BAK-05) | operations/security | **Yes, for production** |
| No off-site copy (DP-BAK-07) | infrastructure | Yes, for production |
| No scheduler — nothing calls the backup tool automatically | operations; `apps/worker` is still a bootstrap shell | Yes, for production |
| No object-storage recovery story | infrastructure; product undecided | Yes, for any real recovery |
| Backup frequency, retention and RPO/RTO unset | business/operations | Yes, for production |

None of these is a defect in what DB10 built. Each is a decision that has no
owner in this repository yet, recorded in
`DB10_DURABILITY_PARAMETER_REGISTRY.md` with the role that must make it.
