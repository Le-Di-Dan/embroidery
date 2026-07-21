# DB10 — Acceptance Audit

**Created:** DB10-CP6. Every gate ends `PASS`, `FAIL`, `N/A` (with reason) or
`DEFERRED` (with owner and the gate that would complete it). **A critical
roadmap gate cannot be deferred** (§43); the critical gates all PASS.

Roadmap exit gate (`DB_ROADMAP.md` §DB10): *"All acceptance runbooks pass with
executable evidence."* Portability gates: `DB0_PORTABILITY_RECOVERY_REQUIREMENTS.md`
§8 (DB10 row) and RB-01..RB-10.

## 1. Critical gates (roadmap exit — none deferrable)

| Gate | Verdict | Evidence |
|---|---|---|
| Backup architecture documented | **PASS** | `DB10_BACKUP_ARCHITECTURE.md` (CP1) |
| Logical backup created and verified | **PASS** | CP1 smoke + CP2; manifest with fingerprint, migration count, row counts, sha256 |
| Logical restore rehearsed | **PASS** | CP2 — two independent restores |
| Restored schema fingerprint verified | **PASS** | CP2 — `4ca56a59…1672f` on both targets |
| Restored representative data verified | **PASS** | CP2 — per-table row counts + content checksums on 7 critical tables |
| Restore validation is executable, not assumed (DP-04) | **PASS** | `db-restore.mjs` asserts row-count + journal parity; CP2/CP5 |
| Fresh setup rehearsed (RB-02/PR-04) | **PASS** | CP5 — empty→migrated reaches the baseline |
| New-machine bootstrap documented (RB-01) | **PASS** | `DB10_CROSS_MACHINE_SETUP.md` |
| Upgrade path documented (RB-03/SV-04) | **PASS** | cross-machine setup RB-03; forward-only migrations |
| Failed-migration recovery (RB-06) | **PASS** | CP5 checksum-gate rehearsal (exit 1 on a byte edit) |
| Lost / corrupted volume recovery (RB-07) | **PASS** | CP5 lost-volume rehearsal |
| Verification checklist (RB-10) | **PASS** | `DB10_CROSS_MACHINE_SETUP.md` RB-10 |
| Migration checksums intact (31/31) | **PASS** | checksum gate every checkpoint |
| Physical fingerprint unchanged | **PASS** | `4ca56a59…1672f` — baseline untouched, zero migrations added |
| S24 retention exemption is secure (§33) | **PASS** | CP4 — GUC required, UPDATE still blocked, allowlist boundary, no app-source GUC |
| Persistent dev DB untouched | **PASS** | every checkpoint; `pg_database` → `embroidery` only, fingerprint match |

## 2. Physical / regression gates

| Gate | Verdict | Evidence |
|---|---|---|
| DB6 catalog + fingerprint gates | **PASS** | CP0 and CP7 |
| DB7 integration suite | **PASS** | full `pnpm test` run (CP7) |
| DB8 critical race subset | **PASS** | CP7 |
| DB9 benchmark correctness subset | **PASS** | CP7 |
| DB10 backup/restore/retention suites | **PASS** | CP2/CP4/CP5 |
| File-size limits | **PASS** | no source >400, no test >600 |
| Static (format/lint/typecheck) | **PASS** | every checkpoint |

## 3. PITR

| Gate | Verdict | Evidence |
|---|---|---|
| PITR requirement classified | **PASS** | CP3 §27 — required for prod, feasible locally |
| PITR mechanism rehearsed (if feasible) | **PASS** | CP3 — A survives, B discarded, promoted cleanly, twice |
| Production WAL archive destination | **DEFERRED** | owner: infrastructure (DP-WAL-02); completes when object storage is chosen |
| RPO / PITR window value | **DEFERRED** | owner: business (DP-RPO-01 / DP-WAL-03) |

## 4. Retention & anonymization

| Gate | Verdict | Evidence |
|---|---|---|
| Retention mechanism (bounded, keyset, child-before-parent) | **PASS** | CP4 |
| Commercial records never deletable | **PASS** | CP4 — allowlist refuses them |
| Anonymization preserves evidence & is idempotent | **PASS** | CP4 |
| Anonymization survives backup/restore | **PASS** | CP4 |
| Retention performance measured | **PASS** | CP4 — 5000 rows / 5 batches / ~1.3 s (local, not an SLA) |
| Retention **periods** (durations) | **DEFERRED** | owner: business/legal (O-008/O-012, DP-RET-\*) |
| Legal/business hold mechanism | **DEFERRED** | owner: application feature (DP-RET-09) — no schema column added speculatively |

## 5. Operational parameters & monitoring

| Gate | Verdict | Evidence |
|---|---|---|
| Parameter registry complete | **PASS** | `DB10_DURABILITY_PARAMETER_REGISTRY.md` — 47 parameters, each locked/provisional/deferred with owner |
| Data-durability classification (78/78 tables) | **PASS** | `DB10_DATA_DURABILITY_MATRIX.md` |
| Monitoring signals defined | **PASS** | `DB10_OPERATIONAL_MONITORING_MATRIX.md` — 16 signals with queries |
| RPO / RTO values | **DEFERRED** | owner: business (DP-RPO-01 / DP-RTO-01) |
| Backup schedule / retention period | **DEFERRED** | owner: operations (DP-BAK-01/02) |
| Backup encryption at rest | **DEFERRED (production-blocking)** | owner: operations/security (DP-BAK-05) |
| Off-site / second-region copy | **DEFERRED** | owner: infrastructure (DP-BAK-07) |
| Alert thresholds | **DEFERRED** | owner: operations (DP-OPS-\*) |
| On-call ownership | **DEFERRED** | owner: business (DP-OPS-09) |

## 6. Explicitly out of DB10 scope

| Item | Verdict | Owner |
|---|---|---|
| Autovacuum / bloat over time | **N/A — not measurable on disposable DBs** | infrastructure (DP-OPS-08) |
| Object-storage binary recovery | **N/A — separate system** | infrastructure; product undecided |
| Backup scheduler / worker loop | **N/A — no scheduler exists** | operations; `apps/worker` is a bootstrap shell |
| External monitoring integration | **N/A — product undecided** | infrastructure |
| Application feature gaps (30 DB9 class-B rows) | **N/A — not durability** | application feature work |
| Production SLA / topology | **N/A — no deployment exists** | infrastructure |

## Verdict

**Every critical roadmap gate PASSES with executable evidence.** All
`DEFERRED` rows are business-, operations- or infrastructure-owned decisions
that have no owner in this repository yet, each recorded in the parameter
registry with the role that must make it. No critical gate is deferred, and no
gate FAILS.
