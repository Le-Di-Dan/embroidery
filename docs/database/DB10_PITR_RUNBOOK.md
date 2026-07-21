# DB10 — Point-in-Time Recovery Runbook

**Created:** DB10-CP3. Rehearsed by `tools/db-pitr-rehearsal.mjs`
(`pnpm db:pitr:rehearse`).

## 1. Status and scope

PITR is proven as a **mechanism** and is **not configured on any long-lived
instance**. The dev compose stack does not archive WAL, and it should not —
the dev database is reproducible from migrations plus a seed and has nothing
to recover to a point in time.

What CP3 established: on a disposable `postgres:16.14-alpine`, a base backup
plus archived WAL recovers to a chosen instant, keeping every transaction
committed before the target and discarding every one after it. The rehearsal
runs twice, independently, with the same result.

What CP3 did **not** establish, and no runbook should claim it did:

- a production `archive_command` destination (DP-WAL-02 — object storage is
  undecided);
- an RPO or a PITR window (DP-RPO-01 / DP-WAL-03 — business decisions);
- behaviour under real write volume or over a long-lived instance.

## 2. The rehearsal, step by step

`tools/db-pitr-rehearsal.mjs` performs exactly the sequence a real recovery
follows, so reading it is reading the procedure:

1. **Start a primary with archiving on.** `wal_level=replica`,
   `archive_mode=on`, `archive_command` copying each finished segment into a
   local archive directory. On a real host the archive is off-machine; here
   it is a directory under the postgres home.
2. **Take a base backup** with `pg_basebackup -X stream`. This is the floor
   PITR can recover *from*; you can never recover to a point before your
   oldest base backup.
3. **Record the recovery target.** In the rehearsal this is a
   `clock_timestamp()` captured between two transactions; in an incident it is
   the moment just before the damage (a wrong migration, a bad bulk update).
4. **Archive the current segment** (`pg_switch_wal()` + `checkpoint`) so
   everything up to the target is durably in the archive.
5. **Recover a fresh instance** from the base backup with a `recovery.signal`
   file and three settings: `restore_command` (how to fetch archived
   segments), `recovery_target_time`, and `recovery_target_action = 'promote'`.
6. **Verify.** The recovered instance contains the pre-target transaction and
   not the post-target one, and `pg_is_in_recovery()` is false after promotion.

## 3. Production procedure (when PITR is configured)

This is the shape a real recovery takes; the bracketed values are the
deferred parameters that must be set first.

```
# 0. STOP writes to the damaged database if it is still up.

# 1. Provision a clean PostgreSQL 16.14 instance (same minor version).

# 2. Restore the most recent base backup taken BEFORE the target time
#    from [DP-BAK-06 backup destination].

# 3. Configure recovery:
#      restore_command      = fetch a segment from [DP-WAL-02 archive]
#      recovery_target_time = the instant just before the damage
#      recovery_target_action = 'pause'   # inspect before promoting
#    Create recovery.signal in the data directory.

# 4. Start the instance. It replays WAL to the target and pauses.

# 5. Inspect: confirm the damage is absent and expected data is present.
#    If the target was wrong, adjust recovery_target_time and repeat from 2.

# 6. Promote:  SELECT pg_wal_replay_resume();  (or set action = 'promote')

# 7. Run the DB6 fingerprint gate and manifest check against the recovered
#    instance before directing traffic to it.

# 8. Re-point the application; rotate any credential that may have been
#    exposed during the incident.
```

## 4. Constraints carried forward

- **`recovery_target_time` cannot precede the oldest base backup.** The PITR
  window is `[oldest retained base backup, now]`, bounded further by WAL
  retention (DP-WAL-03).
- **A recovered instance is a fork.** Once promoted it diverges from the
  original timeline; do not archive its WAL back into the same destination
  without a new timeline, or you will corrupt the archive.
- **`ANALYZE` after recovery.** Planner statistics are not part of WAL replay
  in a way you should trust for a freshly recovered instance; the same rule
  DB9 applied to restores applies here.
- **The application uses Drizzle with forward-only migrations.** A PITR that
  lands between two migrations recovers a schema at that migration count; the
  migration journal (`drizzle.__drizzle_migrations`) reflects exactly what had
  been applied at the target time, which is the correct behaviour, not a bug
  to "fix" by re-running migrations.

## 5. Drizzle / migration note

DB10-CP3 did not exercise a migration straddling the recovery target, and
does not generalise about pending-batch transaction semantics under recovery
beyond what PostgreSQL guarantees: a transaction is atomic across a PITR
boundary — it is either fully replayed (committed before the target) or fully
absent (committed after, or in flight at, the target). The rehearsal's A/B
probe is exactly that guarantee at the row level.
