# ADR-DB1-014 — Backup and Restore Architecture

- Status: Accepted (amended by DB1-C1 correction, 2026-07-15 — manifest now
  records exact PG version + locale/collation; restore-target pre-check and
  separate major-upgrade runbook made explicit; see
  [`DB1_CORRECTION_REPORT.md`](../../database/DB1_CORRECTION_REPORT.md))
- Date: 2026-07-15
- Git HEAD: `563d9863c5d9591095038a28887e217058d816e4`
- Decision IDs: DEC-11, DEC-12
- Requirement IDs: REQ-OPS-002, REQ-OPS-003, REQ-ASSET-007
- Invariant IDs: INV-33, INV-34
- Gap IDs: GAP-07

## Context

Backups are mandated (`10 §9`, `09 §11`, `13 §4`: automated, off-site,
restore-tested) but `infrastructure/backup` is a reserved stub (GAP-07).
Production is self-hosted on store-controlled hardware (D-020) — complete
server loss is an explicit scenario. Scale: <100 orders/month → the database
is small (well under 1 GB for years).

## Decision Drivers

- Recovery from total server loss with verifiable integrity.
- Restore compatibility must be decidable *before* restoring (INV-34) —
  backups must carry their schema/migration/PG-version context.
- Small team/self-hosted: boring, scriptable, testable tooling beats
  infrastructure-heavy PITR at this scale.
- Schema recovery (Git) and business-data recovery (backup) are distinct
  (DP-06).

## Options Considered

| Option | Fit |
| --- | --- |
| **Logical `pg_dump` custom format (`-Fc`)** | **Chosen baseline** — version-tolerant, compressed, selective restore via `pg_restore`, trivially scriptable and testable |
| `pg_dump` plain SQL | human-readable but bigger, slower selective restore; not chosen as primary (may be emitted additionally ad hoc) |
| Physical base backup + WAL archiving (PITR) | superior RPO, but continuous archiving infra is over-scale now; named as the designated upgrade path |
| Volume-level snapshot | filesystem-dependent, crash-consistent at best, opaque to schema versioning; rejected as primary |
| Managed/cloud snapshots | no managed DB exists (self-hosted); future option only |

## Decision

### Backup strategy by stage (locked)

- **Local development portability:** ad hoc `pg_dump -Fc` before risky
  operations (ADR-DB1-013); unmanaged, disposable.
- **Self-hosted production baseline:** scheduled (at least daily —
  cadence/RPO confirmation is an operations parameter at DB10) `pg_dump
  -Fc` of the application database + **manifest** (below), checksummed,
  then copied **off the primary server** (off-site/secondary location,
  encrypted or access-controlled per `09 §11`). Concrete off-site target
  belongs to the self-host topology decision (O-007) — the requirement that
  one exists is locked here.
- **Escalation trigger:** if RPO requirements ever tighten below daily-dump
  tolerance, adopt base backup + WAL archiving via a superseding ADR.
- **Object storage (assets) is backed up separately** (REQ-ASSET-007);
  mechanism depends on the storage product (DEC-27, open). This ADR locks
  the *coordination* rules only (below).

### Backup artifact contract (locked)

Every managed backup = dump file + manifest (JSON) + checksum:

- `pg_dump` custom format, internal compression enabled.
- Manifest records: UTC timestamp; **exact source PostgreSQL server version**
  (major.minor); `pg_dump` version; **database locale/collation configuration**
  (encoding, collation/ctype, provider — per the ADR-DB1-001 baseline as
  amended by DB1-C1); database name; applied-migration ID list + latest
  migration ID (ADR-DB1-004's schema-version definition); application Git
  commit of the running deployment; dump file SHA-256.
- Backup success = exit codes checked **and** manifest written **and**
  checksum verified after off-site copy; failures alert (observability
  hooks, `SYSTEM_ARCHITECTURE §14`).

### Restore compatibility (locked — DEC-12)

1. **Same-major restore:** a backup restores into a PostgreSQL server within
   the **supported same-major PostgreSQL 16 baseline** (the governed patch
   pin of ADR-DB1-001 as amended by DB1-C1). **The restore target is
   compatibility-checked before any restore starts:** target major version,
   locale/collation configuration, and the manifest's migration IDs are
   verified against the target environment first. `pg_dump` archives also
   restore forward into newer majors — but a **major-version restore/upgrade
   is a separate runbook** (DB10 family), never part of routine restore.
2. **Restore-then-forward-migrate is the supported path:** restore
   reproduces the database at its recorded migration state; if the target
   deployment is newer, run pending migrations afterward (forward-only,
   ADR-DB1-003). **Restoring a backup newer than the deployed code is
   prohibited** (roll the application forward instead).
3. **Schema recovery vs data recovery:** an empty rebuild always comes from
   Git migrations (+ system seed); backups are for **business data**. Never
   "restore just to get the schema".
4. **Incompatible-backup detection:** manifest checks (PG major, migration
   IDs present in the target's Git history, checksum) run before any
   restore; a backup whose migration IDs are unknown to the checked-out
   commit is incompatible.
5. **Restore order on full recovery:** restore PostgreSQL first, then object
   storage, then run an asset↔metadata consistency verification (dangling
   references reported); documented in RB-05.
6. **Verified restore** means: restore into a scratch database + migration
   verification passes + application-level smoke checks (row counts /
   critical-table presence) pass. Periodic restore tests are mandatory
   (`13 §4`); cadence set with operations at DB10.

### Retention

Backup artifacts follow the `backup` retention class (ADR-DB1-011);
deletion of backups is logged. Backup retention must cover the longest
data-retention class it protects.

## Consequences

## Positive Consequences

- Every backup is self-describing: compatibility is decidable from the
  manifest before touching the database (INV-34).
- The whole pipeline is testable in CI-like conditions (DB10 runbooks) with
  zero extra infrastructure.

## Negative Consequences

- Daily logical dumps mean up to ~24h RPO — acceptable at current scale and
  explicitly revisitable (escalation trigger above).
- `pg_restore` of a whole DB is slower than physical restore (irrelevant at
  this size).

## Risks and Mitigations

- **Risk:** backups silently rot (never restore-tested).
  **Mitigation:** DP-04 restore tests are a DB10 acceptance gate; alerting
  on backup failure is an observability requirement.
- **Risk:** off-site target undecided (O-007) delays real protection.
  **Mitigation:** flagged in the handoff as an operations blocker for
  production go-live — not for DB2–DB9 progress.

## Rejected Alternatives

- PITR/WAL archiving now (over-scale; designated upgrade path).
- Volume snapshots as primary (opaque, fs-dependent, no schema tagging).
- Plain-SQL dumps as primary (no selective restore, larger).

## Deferred Details

- Backup cadence/RPO confirmation, off-site destination (O-007), restore-test
  cadence → operations decision at DB10 (runbooks RB-04/RB-05).
- Scripts/scheduling implementation → DB6 foundation hooks + DB10 runbooks
  (script writing is out of DB1 scope).

## Implementation Checkpoint

DB6 (manifest data availability), DB10 (runbooks + scheduling audit).

## Verification Checkpoint

DB10 (RB-04/RB-05, verified-restore evidence).

## Reversal / Migration Cost

Low: `pg_dump` artifacts remain restorable regardless of any future strategy
upgrade; adding PITR later is additive.

## References

- pg_dump — https://www.postgresql.org/docs/16/app-pgdump.html
- pg_restore — https://www.postgresql.org/docs/16/app-pgrestore.html
- Backup/restore overview — https://www.postgresql.org/docs/16/backup.html
- `docs/10-NON-FUNCTIONAL-REQUIREMENTS.md` §9; `docs/09-SECURITY-AND-ABUSE-PREVENTION.md` §11;
  `docs/13-ACCEPTANCE-PRINCIPLES.md` §4; ADR-DB1-001, ADR-DB1-004, ADR-DB1-011
