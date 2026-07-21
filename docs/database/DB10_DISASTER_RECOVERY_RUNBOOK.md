# DB10 — Disaster Recovery Runbook

Scenario table with detection/owner/validation: `DB10_DISASTER_RECOVERY_MATRIX.md`.
Related: `DB10_RESTORE_RUNBOOK.md`, `DB10_PITR_RUNBOOK.md`,
`DB10_CROSS_MACHINE_SETUP.md`.

## First response (any incident)

1. **Stop the bleeding.** If writes are corrupting data, take the application
   offline or into read-only before recovering.
2. **Identify the target time / good artifact** before doing anything
   destructive.
3. **Recover into a new database**, never over the damaged one, so the
   evidence survives for diagnosis.

## DR-02 / DR-03 — Bad migration or accidental deletion

Recover to the instant before the damage.

1. Follow `DB10_PITR_RUNBOOK.md` with `recovery_target_time` set to just before
   the migration or delete, and `recovery_target_action = 'pause'`.
2. Inspect the paused instance; confirm the damage is absent.
3. Promote, run the fingerprint + manifest gates, re-point the application.
4. If PITR is not configured (no WAL archive on the instance), the floor is the
   last logical backup — you lose everything since it (RPO = backup interval).

## DR-04 — Corrupted backup artifact

The restore tool refuses a corrupted artifact (exit 4) before touching the
server. Fall back to the previous good backup; quarantine and investigate the
corrupt one. This is why restore rehearsals have a cadence (DP-BAK-08).

## DR-05 — Lost volume

1. Provision a new volume / instance (same minor version, 16.14).
2. `pnpm db:restore --manifest <latest> --target <db> --create`.
3. If PITR is configured, roll forward from the restore point using the WAL
   archive to minimise loss.
4. Run the RB-10 verification checklist.

## DR-06 — Credential compromise

Do **not** restore data; rotate credentials.

1. Rotate the database role password and the object-storage credentials.
2. Invalidate any exposed connection strings; confirm the old ones are
   rejected.
3. Inspect access logs for the exposure window.
4. Credentials differ per machine (SC-06) — a recovery elsewhere configures its
   own; nothing in the repo or a backup assumes a shared secret.

## DR-07 — Partial rollout

1. Halt the rollout.
2. Converge every replica to one migration count (`pnpm db:status` on each).
3. Confirm identical fingerprints before resuming traffic.

## DR-08 / DR-09 — Storage exhaustion / WAL archive failure

PostgreSQL blocks writes rather than corrupting when it cannot write WAL, so
these are downtime incidents, not data-loss incidents.

1. Free or expand storage; restore the WAL archive destination.
2. PostgreSQL retries archiving automatically; confirm the backlog drains and
   `pg_wal` size falls.

## What no recovery here covers

Object-storage binaries. Every procedure above recovers the **database**;
`assets` rows come back as references. Recovering the object store to a
consistent point is a separate, infrastructure-owned step, and the storage
product is still undecided (`CLAUDE.md` §8). A database that restores cleanly
can still point at objects that are gone — check asset resolution as part of
RB-10 when object storage is in scope.
