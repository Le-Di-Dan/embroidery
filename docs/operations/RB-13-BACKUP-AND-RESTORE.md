# RB-13 — Backup and restore

What this repository actually owns, what it does not, and what has to be
resolved before R01.

Authority: `tools/db-backup.mjs`, `tools/db-restore.mjs`,
`tools/db-pitr-rehearsal.mjs`, `tools/backup-runtime.mjs`,
`docs/database/DB10_BACKUP_RUNBOOK.md`, `DB10_RESTORE_RUNBOOK.md`,
`DB10_PITR_RUNBOOK.md`, `DB10_RETENTION_RUNBOOK.md`,
`DB10_BACKUP_ARCHITECTURE.md`, `DB10_DISASTER_RECOVERY_MATRIX.md`,
`DB10_DISASTER_RECOVERY_RUNBOOK.md`, `docs/adr/database/ADR-DB1-014-BACKUP-AND-RESTORE.md`.

## 1. What is repository-owned, and rehearsed

A logical backup and restore pair, with a manifest, rehearsed against disposable
databases:

```sh
pnpm db:backup  --database <db> --out <dir> [--label <slug>] [--url postgres://…]
pnpm db:restore --manifest <path> --target <new-db> --create
pnpm db:pitr:rehearse
pnpm db:retention
```

The **manifest is the point of the tool.** A dump file alone cannot tell you
which schema version it holds, whether it is complete, or whether it is safe to
hand to anyone, so a restore from a bare dump is always partly a guess. The
manifest records the schema fingerprint, the applied-migration count, exact
per-table row counts, the artifact sha256, and — stated rather than assumed —
that the artifact is **neither encrypted nor sanitised**.

Restore safety, delivered rather than promised:

- the artifact's sha256 is verified against the manifest **before** anything is
  restored; a mismatch exits 4 with nothing created;
- `--create` makes a **new** database, and the tool **refuses to restore over an
  existing one** — "restore over the top of it" is exactly how a recovery turns
  into a second incident;
- after `pg_restore` returns, the tool asserts per-table row-count parity **and**
  migration-journal parity against the manifest, and exits non-zero if either
  differs. A restore is not "done" because `pg_restore` returned 0;
- a restore that fails part-way drops the database it created (unless
  `--keep-failed` was passed for diagnosis), so a half-restored database never
  survives to be mistaken for a good one.

No credential is handled anywhere: the dump runs over the container's local unix
socket.

## 2. The production gap — read this before planning a go-live

**These tools reach PostgreSQL through `docker exec` against a named container**
(`--container`, default `embroidery-dev-postgres-1`, overridable with
`DB_BACKUP_CONTAINER`). That is the development and disposable-staging topology.

Production PostgreSQL topology is **ADR-reserved and unresolved**
(`FU-APP12-H02-05`): the applications reach the database through `DATABASE_URL`,
which is address-agnostic, but *these tools* are container-agnostic only within
Docker. Whether production is a managed service, a StatefulSet, or something
else decides how a backup is taken, and this repository has deliberately not
chosen.

Three things are also **deferred and production-blocking**, recorded here rather
than papered over:

```text
DP-BAK-05  encryption at rest      the manifest records `encryption: none`
DP-BAK-07  off-site copy           no automated off-machine copy exists
DP-BAK-01  scheduled cadence       no schedule exists; backups are on demand
DP-RPO-01 / DP-RTO-01              no RPO and no RTO are asserted anywhere
```

**The pre-R01 acceptance requirement**, stated exactly, and not satisfied by
anything in this repository:

```text
BACKUP_RESTORE_AUTHORITY = REQUIRED_BEFORE_R01

  1. production PostgreSQL topology resolved by ADR (FU-APP12-H02-05)
  2. a backup mechanism valid for THAT topology, named and owned
  3. encryption at rest for every artifact                 (DP-BAK-05)
  4. an off-site copy, automated                           (DP-BAK-07)
  5. a schedule, with a stated cadence                     (DP-BAK-01)
  6. a stated RPO and RTO                                  (DP-RPO-01, DP-RTO-01)
  7. a restore rehearsed against a production-shaped database, by the operator
  8. object-storage recovery named and owned — see section 6
```

No vendor-specific production step is invented here. When the topology is
chosen, that ADR owns steps 1 and 2 and this runbook is extended, not replaced.

## 3. Taking a backup

### Trigger

- **Before any risky migration or bulk operation.** This is the one that matters
  in practice, and it is [RB-02](RB-02-MIGRATION.md)'s first precondition.
- On the scheduled cadence, once one exists.

### Preconditions

The server is reachable (the tool exits 3 if not) and the destination is
writable (exit 1). The database name must be safe (exit 2).

### Actions

```sh
pnpm db:backup --database <db> --out <dir> --label pre-<release> --url postgres://…
```

`--url` adds the schema fingerprint to the manifest; supply it. It is a
credential-bearing argument, so pass it in a way that does not reach shell
history.

### Verification

Open the manifest and confirm `tableCount`, `appliedMigrations` and
`schemaFingerprint` match the expected baseline — 79 tables and 38 migrations at
the Wave-1 baseline. Then **move the artifact off-machine**, manually, because
nothing does it for you.

### Do not

- Back up the development database. It holds nothing that is not reproducible
  from migrations plus seed.
- Commit an artifact. `.backups/`, `*.dump` and `*.manifest.json` are
  git-ignored, and that is not a licence to add one elsewhere.
- **Assume a backup is good until it has been restored.** A dump nobody has
  restored is a hypothesis.

## 4. Restoring

### Trigger

- A migration failed part-way ([RB-02](RB-02-MIGRATION.md) escalation).
- Accidental deletion, or a bad forward migration (DR-02, DR-03).
- A lost volume (DR-05).

### Preconditions

1. A manifest and its artifact, matching.
2. A **new, empty** target database name. The tool will not restore over an
   existing one.
3. A decision, made by someone with the authority to make it, that data written
   after the backup will be lost. **Restoring is a data-loss decision.** It is
   not an operator's to take alone.

### Actions

```sh
pnpm db:restore --manifest <path> --target <new-db> --create
```

Then run the schema gates against the restored database:

```sh
node packages/database/tools/db-fingerprint-gate.mjs postgres://…/<new-db>
node tools/db-manifest-check.mjs                       # against the restored URL
node packages/database/tools/db-migration-checksum-check.mjs
```

Those are the invocations, not `pnpm` aliases. `db:check:manifest` and
`db:migrate:checksums` were root scripts once and are not any more — the root
`package.json` carries only repository-global orchestration, so a checkpoint or
tool command is run directly and discovered through
`docs/implementation/SCOPED_COMMAND_INDEX.md`
(`CMD-DB-MANIFEST-CHECK`). Some DB10 documents still print the old aliases; see
`FU-APP12-H07-01`.

Then point the application at it — a `DATABASE_URL` change, so
[RB-05](RB-05-SECRET-ROTATION.md) followed by a restart — and `ANALYZE` before
trusting any query plan on it.

### Selective restore

- `--schema-only` — rebuild an empty schema. Rehearsed; passes the fingerprint
  gate.
- `--data-only` — **not a promised recovery path.** 160 foreign-key edges and the
  append-only triggers reject the out-of-order writes a data-only load into a
  populated database would attempt. Use a full restore into a fresh database.

### Abort condition

- The hash gate fails (exit 4). The artifact is corrupt or substituted. Use an
  earlier, intact backup and investigate this one — do not force it.
- Row-count or migration-journal parity fails after `pg_restore` returned 0. The
  restore is **not** successful; the tool says so and exits non-zero.
- The fingerprint gate fails against the restored database.

### Escalation condition

- No intact artifact exists.
- The restore succeeds but the data is older than the business can accept. That
  is the RPO conversation nobody has had yet — see section 2.

## 5. Point-in-time recovery

`pnpm db:pitr:rehearse` and `DB10_PITR_RUNBOOK.md`. The **mechanism** is proven
against a disposable instance; the production WAL archive destination is
deferred (`DP-WAL-02`). Do not claim PITR is available in production until that
destination exists and a rehearsal has run against the production topology.

## 6. Object storage is a separate recovery, and it is not solved

Every procedure above recovers the **database**. `assets` rows restore as
*references*; the bytes are the object store's recovery problem, and the product
is undecided.

**A "successful" database recovery can therefore still point at missing
objects.** Restoring the database does not restore a single uploaded image or
piece of payment evidence. Object-storage recovery is an unresolved external
input and belongs on the go-live checklist as one —
[RB-14](RB-14-GO-LIVE-CHECKLIST.md).

## 7. The disaster-recovery matrix

`DB10_DISASTER_RECOVERY_MATRIX.md` is the authority: nine scenarios, each with
detection, owner, recovery source, procedure, validation and the deferred
parameter that bounds it. DR-02/03 (PITR) and DR-04/05 (corrupt artifact, lost
volume) are **rehearsed**. DR-01, DR-07 and DR-08 are documented infrastructure
operations this repository does not implement, because no production topology
exists yet. Read it before planning any recovery, and do not assume a row marked
"documented" is a row that has been proved.

## Forbidden actions

- Restoring over a live database.
- Treating an unrestored dump as a backup.
- Using `--data-only` into a populated database.
- Passing a `DATABASE_URL` in a way that lands in shell history or a log.
- Committing a dump, a manifest or a fingerprint containing production data.
- Claiming a production backup capability that section 2 says does not exist yet.
- Deleting a backup artifact that has never been restored, on the assumption a
  newer one is good.
