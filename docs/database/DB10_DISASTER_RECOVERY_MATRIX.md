# DB10 — Disaster Recovery Matrix

**Created:** DB10-CP5. Rehearsals: `db10-cp5-recovery.integration.spec.ts`
and the checksum-gate rehearsal recorded in `DB10_EXECUTION_LOG.md` (CP5).
Runbook detail: `DB10_DISASTER_RECOVERY_RUNBOOK.md`.

Each row names how the failure is detected, who owns the response, what it is
recovered from, and which deferred parameter bounds the outcome. "Rehearsed"
means DB10 ran it against a disposable database, not merely wrote it down.

| # | Scenario | Detection | Owner | Recover from | Procedure | Validation | RPO/RTO dependency | Rehearsed? |
|---|---|---|---|---|---|---|---|---|
| DR-01 | **Database unavailable** (crash, OOM, host down) | health check fails; `pg_isready` red; app connection errors | infrastructure / on-call (DP-OPS-09) | restart, or failover to a replica if one exists | restart the instance; if the volume is intact no data recovery is needed | app reconnects; fingerprint + manifest gates | RTO (DP-RTO-01) | partial — restart is infrastructure, not DB10 |
| DR-02 | **Bad migration** (a forward migration corrupts or mis-shapes data) | `pnpm db:check:manifest` / fingerprint gate mismatch; failed deploy | backend + DBA | PITR to just before the migration, **or** forward-fix migration | see PITR runbook; forward-only policy means no down-migration | fingerprint gate on the recovered instance | RPO (DP-RPO-01) | **yes** — PITR (CP3) + checksum gate (CP5) |
| DR-03 | **Accidental deletion** (a wrong bulk delete or a retention run with a bad cutoff) | row-count monitoring; audit trail; user report | backend + DBA | PITR to just before the delete | PITR runbook | recovered rows present; append-only chains intact | RPO | **yes** — PITR (CP3) |
| DR-04 | **Corrupted backup artifact** | restore refuses on hash mismatch (exit 4) | operations | an earlier, intact backup | restore from the previous good artifact; investigate the corrupt one | `db-restore.mjs` hash gate; row-count parity | restore-rehearsal cadence (DP-BAK-08) | **yes** — corruption fixture (CP2) |
| DR-05 | **Lost volume** (disk failure, deleted PVC) | instance will not start; volume absent | infrastructure | the most recent logical backup (+ WAL if PITR configured) | provision a new volume; restore; re-point | fingerprint gate + row counts on the recovered instance | RPO, RTO | **yes** — lost-volume rehearsal (CP5) |
| DR-06 | **Credential compromise** | anomalous access; secret found in a log or repo | security + infrastructure | rotate, do not restore data | rotate the DB and object-storage credentials; inspect access logs; the runbook covers credentials differing per machine (SC-06) | new credentials work; old ones rejected | — | documented (CP5) — no real secret provisioned |
| DR-07 | **Partial rollout** (some replicas on a new schema, some on old) | mixed migration-journal counts across replicas; branch-switch mismatch (PR-09) | backend | roll all replicas to one schema version | halt rollout; converge every replica to the same migration count before resuming | every replica reports the same journal count and fingerprint | RTO | documented (CP5) |
| DR-08 | **Storage exhaustion** (disk full; WAL cannot archive) | disk-usage alert (DP-OPS-06); `archive_command` failing | infrastructure | free space; the database blocks writes rather than corrupting | expand the volume or prune; PostgreSQL refuses new writes until WAL can be written, so no corruption — only downtime | writes resume; archive backlog clears | RTO | not rehearsed — flagged, owner infrastructure |
| DR-09 | **WAL archive failure** (destination unreachable, PITR configured) | `archive_command` non-zero; growing `pg_wal` | infrastructure | fix the destination before `pg_wal` fills | restore the archive destination; PostgreSQL retries archiving automatically | archive backlog drains; `pg_wal` size falls | RPO | mechanism proven (CP3); production destination deferred (DP-WAL-02) |

## Cross-cutting notes

- **The two recoveries DB10 owns and rehearsed** are DR-02/03 (PITR) and DR-05
  (lost volume / logical restore). DR-01, DR-07, DR-08 are infrastructure
  operations DB10 documents but does not implement, because no deployment
  topology exists yet.
- **Object-storage binaries are a separate recovery.** Every scenario above
  recovers the *database*. `assets` rows restore as references; the bytes are
  the object store's recovery problem (owner: infrastructure; product
  undecided). A "successful" DB recovery can still point at missing objects —
  the DR runbook says so explicitly.
- **No RPO or RTO is asserted.** Every row that depends on one names the
  deferred parameter (DP-RPO-01 / DP-RTO-01) rather than inventing a number.
