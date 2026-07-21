# DB10 — Operational Durability Parameter Registry

**Created:** DB10-CP0. **Rule (§16):** DB10 does not invent business values.
Every parameter below is either **locked** (a value already committed in the
repository, with a source), **provisional** (a measured or mechanism-derived
recommendation DB10 can defend but that no business owner has approved), or
**DEFERRED — requires business/operations decision**.

A `DEFERRED` row is not a gap DB10 failed to close. It is a decision that
belongs to a business or operations owner who does not exist yet in this
repository, recorded so that it cannot be silently assumed later. The
underlying **mechanism** for most deferred rows *is* built and rehearsed by
DB10 — what is deferred is the number, not the capability.

Legend for **Production decision required**: `yes` = a human must choose a
value before production; `no` = the repository's value is sufficient.

## 1. Recovery objectives

| ID | Parameter | Business meaning | Current value | Status | Owner | Source | Validation method | Prod decision required |
|---|---|---|---|---|---|---|---|---|
| DP-RPO-01 | **RPO** — maximum tolerable data loss | How much committed work the business accepts losing in a disaster | *none set* | **DEFERRED — requires business decision** | business/operations | `DB0_PORTABILITY_RECOVERY_REQUIREMENTS.md` DP-02/DP-04 records the requirement, never a number; `10-NON-FUNCTIONAL-REQUIREMENTS.md` §9 does not fix one | Once set: WAL archive interval + backup frequency must be ≤ RPO; DB10-CP3 proves the PITR mechanism that makes any finite RPO achievable | **yes** |
| DP-RTO-01 | **RTO** — maximum tolerable downtime | How long the business accepts the database being unavailable | *none set* | **DEFERRED — requires business decision** | business/operations | as above | Once set: compare against DB10-CP2's measured restore wall-clock, scaled to the real dataset | **yes** |
| DP-RPO-02 | RPO achievable by logical backup alone | Data loss floor if only `pg_dump` exists | = backup interval (whole interval lost) | **locked (property, not a policy)** | DB10 | arithmetic property of periodic logical backup | DB10-CP2 rehearsed logical restore; a logical backup cannot recover past its own timestamp | no |
| DP-RPO-03 | RPO achievable with WAL archiving | Data loss floor with continuous archiving | seconds-to-minutes, bounded by `archive_timeout` | **provisional** | operations | DB10-CP3 rehearsal | CP3 recovered to a chosen target LSN with the post-target transaction absent | **yes** (the `archive_timeout` value) |

## 2. Backup schedule and retention

| ID | Parameter | Business meaning | Current value | Status | Owner | Source | Validation method | Prod decision required |
|---|---|---|---|---|---|---|---|---|
| DP-BAK-01 | Backup frequency | How often a full logical backup is taken | *none set* | **DEFERRED — requires operations decision** (bounded below by DP-RPO-01) | operations | no scheduler exists in the repository; `apps/worker` is still a bootstrap shell | must satisfy `interval ≤ RPO` | **yes** |
| DP-BAK-02 | Backup retention period | How long backup artifacts are kept | *none set* | **DEFERRED — requires business decision** | business/operations + legal | `DB4_DELETE_ARCHIVE_RETENTION_MAPPING.md` "Backup implication": retention must be **≥ the longest protected data class** (ADR-DB1-014) | cannot be fixed before DP-RET-\* are fixed — it is derived from them, never chosen independently | **yes** |
| DP-BAK-03 | Backup format | Artifact format | `pg_dump --format=custom` | **locked** | DB10 | ADR-DB1-011/DEC-11 selects logical `pg_dump`; custom format is what makes selective and parallel restore possible | DB10-CP2 backed up and restored in this format | no |
| DP-BAK-04 | Compression | Artifact compression level | `pg_dump` default for custom format (zlib) | **locked** | DB10 | tool default, deliberately not overridden without measurement | artifact size and hash recorded in every manifest | no |
| DP-BAK-05 | Backup **encryption at rest** | Protection of the artifact itself | *not implemented* | **DEFERRED — requires operations decision** | operations/security | `DB2_DATA_CLASSIFICATION_MAP.md` §backup-sensitivity marks customer, design, payment and credential concepts **high**; ADR-DB1-014 requires encrypted, access-controlled backups | DB10 refuses to hard-code a key (§13). The decision is *which* KMS/envelope scheme, not *whether* — a backup of this schema is high-sensitivity by classification | **yes — blocks production backup** |
| DP-BAK-06 | Backup storage destination | Where artifacts live | local filesystem only (rehearsal) | **DEFERRED — requires infrastructure decision** | infrastructure | object storage product is an open decision (`CLAUDE.md` §8) | DB10 rehearses to a local scratch path; off-site copy is an infrastructure handoff | **yes** |
| DP-BAK-07 | Off-site / second-region copy | Survives loss of the primary site | *not implemented* | **DEFERRED — requires infrastructure decision** | infrastructure | RB-04 expects "off-site" | no local substitute exists that would prove anything about a second site | **yes** |
| DP-BAK-08 | Restore verification frequency | How often a restore is actually rehearsed | *none set* | **DEFERRED — requires operations decision** | operations | DP-04 requires periodic restore tests | DB10 provides the executable rehearsal (`db10-restore.spec.ts`); the *cadence* is an operations policy | **yes** |

## 3. WAL and point-in-time recovery

| ID | Parameter | Business meaning | Current value | Status | Owner | Source | Validation method | Prod decision required |
|---|---|---|---|---|---|---|---|---|
| DP-WAL-01 | `archive_mode` | Whether WAL is archived at all | `off` on the dev instance | **provisional — `on` recommended for production** | infrastructure | dev compose has no archiving; DB10-CP3 rehearsed with `archive_mode=on` in a dedicated disposable container | CP3 rehearsal | **yes** |
| DP-WAL-02 | `archive_command` / archive destination | Where WAL segments go | file copy to a container-local directory (rehearsal only) | **DEFERRED — requires infrastructure decision** | infrastructure | same open object-storage decision as DP-BAK-06 | CP3 proved the mechanism with a local `cp`; a production destination is not substitutable locally | **yes** |
| DP-WAL-03 | WAL retention window | How far back PITR can reach | *none set* | **DEFERRED — requires business decision** (derived from DP-RPO-01 and the base-backup interval) | operations | — | the PITR window can never exceed the oldest base backup plus its continuous WAL | **yes** |
| DP-WAL-04 | `archive_timeout` | Forces a segment switch so a quiet database still archives | not set (rehearsal used explicit switches) | **DEFERRED — requires operations decision** | operations | — | bounds worst-case RPO on a low-traffic instance | **yes** |
| DP-WAL-05 | `wal_level` | WAL detail required for archiving | `replica` (PostgreSQL 16 default) | **locked** | DB10 | server default; sufficient for PITR | CP3 rehearsal used the default | no |

## 4. Retention periods by table class

Every duration below is `[cfg]` in `DB4_DELETE_ARCHIVE_RETENTION_MAPPING.md`
— a policy-configuration value (CON-144) with a business owner, deferred
since DB1/DB3 (O-008/O-012). **DB10 does not choose any of them.** What DB10
owns is the deletion *mechanism* and its safety, not the cutoff.

| ID | Class | Tables (families) | Current value | Status | Owner | Validation method |
|---|---|---|---|---|---|---|
| DP-RET-01 | `trans` — transient | `design_sessions` (+assets), `contact_verification_challenges` (+attempts), `outbox_events`, `idempotency_records` | *none set* | **DEFERRED — business (O-008)** | business/operations | mechanism rehearsed in DB10-CP4 with a caller-supplied cutoff |
| DP-RET-02 | `oper` — operational | `admin_sessions`, `notification_intents` (+attempts), `background_job_attempts`, `asset_inspections`, terminal `inventory_soft_holds`, `secure_access_grants` | *none set* | **DEFERRED — business** | operations | as above |
| DP-RET-03 | `audit` — audit class | `audit_events` | *none set* | **DEFERRED — business/legal (O-012)** | business + legal | as above; deletion is only ever via the retention job, never ad hoc |
| DP-RET-04 | `comm` — commercial record | orders, quotations, payments, production, design cases/versions, ledger, snapshots | **retain — no deletion** | **locked** | business rules | `DB4_DELETE_ARCHIVE_RETENTION_MAPPING.md`; ADR-DB1-011 makes payment evidence never administratively deletable. DB10-CP4 asserts the retention job cannot reach these tables |
| DP-RET-05 | `archive` class | catalog, gallery, content pages, redirects, design templates | **archive flag, not deletion** | **locked** | business rules | archival is a status change; no retention DELETE applies |
| DP-RET-06 | Anonymization deadline — customer PII | `customers`, `customer_contact_points`, `business_profiles` | *none set* | **DEFERRED — business/legal** | business + legal | window starts at last commercial activity; DB10-CP4 rehearses the scrub mechanism, not the deadline |
| DP-RET-07 | Anonymization deadline — shipping PII | `shipping_details` address/recipient fields | *none set* | **DEFERRED — business/legal** | business + legal | as above; frozen `shipping_snapshots` are break-glass only and are **not** scrubbed by the ordinary path |
| DP-RET-08 | Payment-evidence hold | `payment_provider_events`, reconciliations | ≥ dispute window `[cfg]` | **DEFERRED — business/legal** | business + legal + payment provider | the provider's dispute window is an external input DB10 cannot read |
| DP-RET-09 | Legal/business hold flag | any record under hold | mechanism direction only (`policy_configurations` key `retention.hold`) | **DEFERRED — not implemented** | application feature work | `DB4_DELETE_ARCHIVE_RETENTION_MAPPING.md` states holds are an App-level block with **no schema column added speculatively**. DB10 records the dependency: a retention job must consult holds before deleting once holds are activated |

## 5. Runtime and pool settings

Carried from DB9-CP5 measurement (`DB9_DB10_HANDOFF.md` §3). These are
**locked** as repository defaults and **provisional** as production values,
because DB9 measured one process on one machine.

| ID | Parameter | Current value | Status | Owner | Validation method | Prod decision required |
|---|---|---|---|---|---|---|
| DP-RUN-01 | `DATABASE_POOL_MAX` | 10 | **locked** (repo) / provisional band 8–16 | backend | DB9-CP5 sweep: 17.7 / 8.4 / 6.9 / 6.6 ms at pool 2/5/10/20 | **yes** — must fit the deployed `max_connections` budget across replicas |
| DP-RUN-02 | `DATABASE_STATEMENT_TIMEOUT_MS` | 30 000 | **locked** (repo) | backend | DB9-CP5 proved the mechanism (fires, maps, releases the connection); the value is policy | **yes** |
| DP-RUN-03 | `DATABASE_CONNECTION_TIMEOUT_MS` (acquire) | 10 000 | **locked** (repo) | backend | never reached in DB9's sweep (PERF-P03) | **yes** |
| DP-RUN-04 | `DATABASE_LOCK_TIMEOUT_MS` | 5 000 | **locked** (repo) | backend | DB8 lock-order matrix; DB9-CP3 lock waits 5–18 ms | no |
| DP-RUN-05 | `max_connections` | 100 (local instance) | **provisional** | infrastructure | API pool × replicas + worker pool × replicas + maintenance headroom must fit | **yes** |
| DP-RUN-06 | Claim batch size | 25 | **locked** | backend | DB9-CP3: 6.8 ms lock-hold at 25, lengthening roughly linearly | no |
| DP-RET-BATCH | Retention delete batch size | 500 (DB10 default) | **provisional** | DB10 | DB10-CP4 measured batch latency, WAL and lock behaviour; a larger batch trades lock-hold time for fewer round trips | no |

## 6. Maintenance and monitoring

| ID | Parameter | Current value | Status | Owner | Validation method | Prod decision required |
|---|---|---|---|---|---|---|
| DP-OPS-01 | Maintenance window | *none set* | **DEFERRED — requires business decision** | business/operations | needed for retention runs, `CREATE INDEX CONCURRENTLY` on `audit_events`, and restore rehearsals | **yes** |
| DP-OPS-02 | Backup-age alert threshold | *none set* | **DEFERRED — derived from DP-BAK-01** | operations | monitoring matrix defines the *signal*; the threshold follows the schedule | **yes** |
| DP-OPS-03 | Restore-rehearsal-age alert threshold | *none set* | **DEFERRED — derived from DP-BAK-08** | operations | as above | **yes** |
| DP-OPS-04 | Pool-saturation alert threshold | *none set* | **DEFERRED** | operations | DB9 measured the curve; the alert point depends on the deployed pool | **yes** |
| DP-OPS-05 | Long-transaction alert threshold | *none set* | **DEFERRED** | operations | must be below `idle_in_transaction_session_timeout` once that is set | **yes** |
| DP-OPS-06 | Disk-usage alert threshold | *none set* | **DEFERRED** | infrastructure | depends on provisioned volume size | **yes** |
| DP-OPS-07 | Deadlock-rate alert threshold | *none set* | **DEFERRED** | operations | DB8 proved deadlocks map to a retryable error; a *rate* is still worth alerting on | **yes** |
| DP-OPS-08 | Autovacuum settings | PostgreSQL 16 defaults | **locked (defaults) / unvalidated** | infrastructure | **DB9 explicitly did not measure autovacuum over time, and neither did DB10** — disposable databases live for minutes. This is honestly open | **yes** |
| DP-OPS-09 | On-call ownership / escalation | *none — no operations team exists* | **DEFERRED — requires business decision** | business | every alert in `DB10_OPERATIONAL_MONITORING_MATRIX.md` names a role, not a person | **yes** |
| DP-OPS-10 | `idle_in_transaction_session_timeout` | not set (server default: disabled) | **provisional — recommend setting** | backend/infrastructure | an unset value lets a stuck transaction hold locks indefinitely; DB8/DB9 both relied on client-side discipline instead | **yes** |

## 7. Summary

```
Parameters registered            47
  locked                         13
  provisional                     7
  DEFERRED (owner named)         27
Production decisions required    31
Production-blocking              1   (DP-BAK-05 backup encryption)
```

**DP-BAK-05 is marked production-blocking** and nothing else is: taking a
logical backup of this schema without encryption at rest would put
customer contact data, design documents, payment evidence and admin
credential hashes into a single unprotected file. DB10 implements the backup
tool with an explicit, recorded `encryption: none` field in every manifest
precisely so that this cannot be forgotten — the artifact declares its own
exposure rather than staying silent about it.

## 8. Application role privilege model (added at final closure, Blocker D)

| ID | Parameter | Business meaning | Current value | Status | Owner | Source | Validation method | Prod decision required |
|---|---|---|---|---|---|---|---|---|
| DP-SEC-01 | Application DB role privilege model | Whether the app identity can bypass append-only protection | dev app role is a **superuser** (`embroidery`) → can bypass | **DEFERRED — blocks go-live** | infrastructure/backend | `DB10_FINAL_CLOSURE_CORRECTION.md` Blocker D; `db10-cp8` | proven on disposables: a non-superuser role without DELETE on append-only tables cannot bypass even with the exemption GUC; only a dedicated retention role can | **yes — production-blocking** |
| DP-SEC-02 | Dedicated retention role | Separate operational identity for retention DELETE | not provisioned (single role in dev) | **DEFERRED** | infrastructure | as above | the retention job connects as this role; the app role is not a member and cannot `SET ROLE` to it | **yes** |

Required production posture (enforced by GRANT/REVOKE, not schema — the
fingerprint is unaffected):

```
REVOKE DELETE ON <append-only tables> FROM <application_role>;   -- app cannot delete
CREATE ROLE retention_operator NOLOGIN;                          -- or LOGIN for the job
GRANT  SELECT, DELETE ON <retention-eligible tables> TO retention_operator;
-- application_role is NOT granted membership in retention_operator
-- application_role is NOT a superuser
```
