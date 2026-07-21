# DB10 — Operational Monitoring Matrix

**Created:** DB10-CP6. Thresholds that depend on a deferred parameter are
marked **deferred**, not invented (§41). Each row gives a concrete signal an
operator or an external monitor can evaluate, the owner, the runbook it
triggers, and how the signal itself was tested.

Ownership everywhere is a **role**, not a person — no operations team exists
yet (DP-OPS-09).

## 1. Backup & recovery health

| ID | Signal | Query / source | Threshold | Owner | Runbook | Test method |
|---|---|---|---|---|---|---|
| MON-01 | Backup age | newest `*.manifest.json` `createdAt` in the backup store | **deferred** — ≤ DP-BAK-01 interval | operations | `DB10_BACKUP_RUNBOOK.md` | manifest carries `createdAt` (CP1/CP2) |
| MON-02 | Restore-rehearsal age | last successful `db-restore.mjs` run timestamp | **deferred** — ≤ DP-BAK-08 | operations | `DB10_RESTORE_RUNBOOK.md` | CP2 rehearsal proves the run emits a verifiable result |
| MON-03 | WAL archive health (if PITR configured) | `select last_archived_time, last_failed_time from pg_stat_archiver` | `last_failed_time > last_archived_time` → alert | infrastructure | `DB10_PITR_RUNBOOK.md` | CP3 rehearsal exercised archiving |
| MON-04 | Backup encryption declared | manifest `encryption` field | must be ≠ `none` in production (DP-BAK-05) | security | `DB10_BACKUP_RUNBOOK.md` | manifest always records it (CP1) |

## 2. Availability & connections

| ID | Signal | Query / source | Threshold | Owner | Runbook | Test method |
|---|---|---|---|---|---|---|
| MON-05 | Database availability | `pg_isready` / health endpoint | any failure → page | infrastructure | DR-01 | `DatabaseHealthService` exists (DB7) |
| MON-06 | Pool saturation | `select waiting from` the API pool stats / `pg_stat_activity` count vs `DATABASE_POOL_MAX` | **deferred** — depends on deployed pool (DP-OPS-04) | backend | — | DB9-CP5 measured the curve |
| MON-07 | Connection headroom | `select count(*) from pg_stat_activity` vs `max_connections` | **deferred** — DP-RUN-05 | infrastructure | — | DB9 recorded the 100-connection constraint |
| MON-08 | Long-running transactions | `select max(now()-xact_start) from pg_stat_activity where state<>'idle'` | **deferred** — < `idle_in_transaction_session_timeout` (DP-OPS-10) | backend | — | query is standard catalog |

## 3. Contention & integrity

| ID | Signal | Query / source | Threshold | Owner | Runbook | Test method |
|---|---|---|---|---|---|---|
| MON-09 | Deadlock rate | `select deadlocks from pg_stat_database where datname=current_database()` (delta) | **deferred** — DP-OPS-07 | backend | — | DB8 proved deadlocks map to a retryable error |
| MON-10 | **Migration checksum drift** | `node packages/database/tools/db-migration-checksum-check.mjs` | **any** mismatch → block deploy | backend | `DB10_CROSS_MACHINE_SETUP.md` RB-06 | **rehearsed CP5** — catches a byte edit, exit 1 |
| MON-11 | **Fingerprint drift** | `node packages/database/tools/db-fingerprint-gate.mjs <url>` | **any** mismatch → block | backend | RB-10 | run every checkpoint; matches `4ca56a59…` |
| MON-12 | Retention backlog | per family, `select count(*)` past the intended cutoff (dry-run) | **deferred** — depends on the period | operations | `DB10_RETENTION_RUNBOOK.md` | `--dry-run` proven CP4 |

## 4. Storage & maintenance

| ID | Signal | Query / source | Threshold | Owner | Runbook | Test method |
|---|---|---|---|---|---|---|
| MON-13 | Disk usage | host / volume metric | **deferred** — DP-OPS-06 (depends on volume size) | infrastructure | DR-08 | — |
| MON-14 | Table bloat | `pg_stat_user_tables` dead-tuple ratio | **deferred** | infrastructure | — | not measured (see below) |
| MON-15 | Autovacuum / analyze recency | `select relname, last_autovacuum, last_autoanalyze from pg_stat_user_tables` | **deferred** — DP-OPS-08 | infrastructure | — | **not established** — disposable DBs live for seconds |
| MON-16 | High-write table growth | row count + `pg_total_relation_size` for the CP4/DB9 high-write set | **deferred** | infrastructure | — | DB9 identified the set and index share |

## Honest gaps

- **Autovacuum, bloat and dead-tuple behaviour over time (MON-14/15)** were
  **not** measured by DB9 or DB10. Disposable benchmark databases live for
  seconds; nothing here characterises a long-lived instance. Owner:
  infrastructure, once a persistent instance exists.
- **Most thresholds are deferred.** The *signals* are all concrete and, where
  possible, already exercised by a gate or a rehearsal. The *numbers* wait on
  business/operations decisions (the DP-OPS-\* and DP-BAK-\* rows in the
  parameter registry) and a deployed topology.
- **No external monitoring integration exists.** Wiring these signals to an
  alerting system is infrastructure work; the monitoring product is undecided.
