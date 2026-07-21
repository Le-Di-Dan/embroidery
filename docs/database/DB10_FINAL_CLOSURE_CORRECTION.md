# DB10 — Final Closure Correction

**Compiled:** narrow closure audit after the DB10 implementation was accepted
(`DB10 IMPLEMENTATION PASS`). This document resolves the four blockers raised
against final closure. CP0–CP7 were **not** redone; only the focused audit
below was performed. No amend, squash, rewrite or push.

## Blocker A — exact DB10 Git lineage

The completion report §K said "Commits (DB10): 10". **Git says 8.** Corrected.

| # | Hash | Subject | Parent | Owns |
|---|---|---|---|---|
| 1 | `6ac5600` | docs(database): lock DB10 durability scope | `07a06ef` | CP0 |
| 2 | `2d7e588` | feat(database): add verified backup and restore tooling | `6ac5600` | CP1 |
| 3 | `f9f3427` | test(database): rehearse logical restore end to end | `2d7e588` | CP2 |
| 4 | `be187d7` | feat(database): rehearse point-in-time recovery | `f9f3427` | CP3 |
| 5 | `a3bd403` | feat(database): add retention and anonymization controls | `be187d7` | CP4 |
| 6 | `5652f07` | test(database): rehearse disaster recovery and cross-machine setup | `a3bd403` | CP5 |
| 7 | `8adc1a7` | docs(database): add monitoring matrix and acceptance audit | `5652f07` | CP6 |
| 8 | `daf9286` | docs(database): complete DB10 and close persistence | `8adc1a7` | CP7 |

```
DB10 implementation commits   8  (07a06ef → daf9286, linear, single-parent)
```

This correction adds two additive commits on top of the 8 implementation
commits:

```
4e26c74  test(database): harden retention bypass security
bff2eb5  docs(database): reconcile DB10 final closure evidence
```

giving **10 DB10 commits total** (8 implementation + 2 correction), linear and
single-parent from `07a06ef`. The literal final HEAD is the tip of
`production` after this document's own commit and is reported in the final
response (a document cannot contain the hash of the commit that introduces it).
No hash is invented. Tree clean, never pushed. `DB10_COMPLETION_REPORT.md` and
`DB10_PERSISTENCE_FINAL_CLOSURE.md` are committed (in `daf9286`, with additive
correction addenda in `bff2eb5`).

## Blocker B — persistent dev database, clarified (no mutation)

The report paired "persistent dev DB untouched" with "fingerprint match on
the dev database". These are **consistent**, but the second phrase was
imprecise about which database and its migration state.

**Finding from Git and the live journal:** the persistent `embroidery`
database is at **migration 31** (all 31 applied; `drizzle.__drizzle_migrations`
max id 31, applied 2026-07-19/20; 30 triggers, `fn_reject_mutation_conditional`
present). It reached 31 during DB6/DB7 work **the day before** DB10 began. DB10
**only read** from it. The earlier "migration 29" note (DB6-S24 era) was stale
by the time DB10 ran; nothing in DB10 migrated it.

### Database / container inventory (DB10)

| Name | Purpose | Migration count | Access | Fingerprint checked | Disposed |
|---|---|---|---|---|---|
| `embroidery` (in `embroidery-dev-postgres-1`) | persistent dev DB | **31** | **read-only** (pg_dump backup, fingerprint gate, `--dry-run` retention, refused retention family) | yes — read-only, matches `4ca56a59…` | no (persistent) |
| `embroidery_db7_*` (disposable) | CP2/CP4/CP5/CP8 sources & actors | 31 | mutating | some (CP2/CP5) | yes |
| `embroidery_db10_restore_a` / `_b` | CP2 restore targets | 31 | mutating | yes | yes |
| `embroidery_db10_cp5_lost_*` | CP5 lost-volume target | 31 | mutating | yes | yes |
| `embroidery_db10_anon_*` | CP4 anonymization restore | 31 | mutating | yes | yes |
| `embroidery_db10_verify` | post-commit restore smoke | 31 | mutating | yes (via restore) | yes |
| `embroidery-pitr-<pid>` (separate container) | CP3/CP7 PITR primary+recovery | base + WAL | mutating | schema checked | yes |

**Resolution: wording defect.** Corrected to name the persistent dev DB
precisely (migration 31, read-only, fingerprint checked read-only). **No
persistent-DB mutation occurred**, so closure is not blocked on this.

## Blocker C — engineering completion vs production go-live

`DB_ROADMAP.md` §DB10 exit gate is *"All acceptance runbooks pass with
executable evidence."* It does **not** require encryption keys, RPO, RTO,
retention durations or storage destinations — those are external
business/operations/infrastructure decisions. **Model A applies.**

`DB10_ACCEPTANCE_AUDIT.md` is updated to separate **engineering acceptance
gates** (all PASS) from **production go-live gates** (blocked by named external
decisions). Bounded verdict:

```
DB10 ENGINEERING IMPLEMENTATION       COMPLETE
OVERALL PERSISTENCE FOUNDATION        COMPLETE
PRODUCTION DURABILITY GO-LIVE         BLOCKED BY NAMED EXTERNAL DECISIONS
```

Production go-live remains blocked by (owners named in the parameter registry):
backup encryption at rest (DP-BAK-05), business RPO/RTO (DP-RPO-01/DP-RTO-01),
backup frequency & retention (DP-BAK-01/02), production backup/WAL destinations
(DP-BAK-06/07, DP-WAL-02), alert/on-call ownership (DP-OPS-\*), **and the
application role privilege model (DP-SEC-01, added by Blocker D below).**

## Blocker D — retention exemption security (REAL FINDING, corrected)

**Finding:** "No application source sets the GUC" is not a database boundary.
The S24 exemption checks *only* `current_setting('app.bypass_retention_trigger')`
with no role guard, and the dev application role `embroidery` is a
**superuser**. So the application database identity, as currently configured,
**can** convert a normal connection into a retention bypass. A code-level
allowlist in the tool is not a database security boundary.

**Resolution — least-privilege role separation (dedicated retention role).**
Proven on real migrated tables, twice on independent disposable databases
(`db10-cp8-retention-role-security.integration.spec.ts`), connecting as
synthesized roles over the local socket:

| # | Identity | Action | Result |
|---|---|---|---|
| 1 | non-superuser **app role** (SELECT/INSERT, no DELETE) | DELETE `audit_events`, no GUC | refused **42501** |
| 2–3 | app role | **SET the exemption GUC**, then DELETE `audit_events` | GUC set is allowed; DELETE still refused **42501** — rows survive |
| 4 | app role | DELETE `order_items` with GUC | refused **42501** |
| 5 | app role | `SET ROLE` retention role | refused — "permission denied to set role" |
| 6 | **retention role** (SELECT/UPDATE/DELETE) | DELETE `audit_events`, no GUC | refused **23000** (trigger) |
| 7 | retention role | DELETE `audit_events` **with GUC** | **succeeds** — the one identity permitted |
| 8 | retention role | DELETE `order_items` (reject policy) with GUC | refused **23000** — exemption is table-scoped |
| 9 | retention role | UPDATE `audit_events` with GUC | refused **23000** — exemption is DELETE-only |
| 10 | **superuser** `embroidery` | DELETE `audit_events` with GUC | **succeeds** — a superuser is unconstrainable |

**Security property delivered:** *the ordinary (non-superuser) application
identity cannot convert a normal SQL connection into a retention bypass* — even
setting the GUC, it lacks the DELETE privilege. Only a dedicated retention role
can delete, and only under the exemption, only on retention-exempt tables, only
for DELETE.

**Why no schema change:** grants and roles are **not** part of the schema
fingerprint (which is built from `pg_class`/`pg_constraint`/`pg_index`/
`pg_proc`/`pg_trigger`/`information_schema.columns`). The boundary is enforced
by GRANT/REVOKE and role separation, so the DB6 baseline and its fingerprint
`4ca56a59…` are **untouched** — no forward migration was required. The S24
trigger is correct as written; it is not expected to constrain a superuser.

**Residual, promoted to a named production control (DP-SEC-01):** row 10 shows
a superuser bypasses any table protection. Therefore the application **must
connect as a non-superuser, least-privilege role** that (a) lacks DELETE on
append-only tables and (b) is not a member of the retention role; the retention
job connects as the dedicated retention role. The current single-superuser dev
role does **not** meet this — it is a **production go-live blocker**, not an
engineering-schema defect. `DB10_RETENTION_RUNBOOK.md` and the parameter
registry record the required GRANT/REVOKE posture.

## Secondary consistency corrections

- **Runbook count.** There are **6 physical runbook files**
  (`DB10_BACKUP_RUNBOOK.md`, `DB10_RESTORE_RUNBOOK.md`, `DB10_PITR_RUNBOOK.md`,
  `DB10_RETENTION_RUNBOOK.md`, `DB10_DISASTER_RECOVERY_RUNBOOK.md`,
  `DB10_CROSS_MACHINE_SETUP.md`) covering the **10 RB procedure IDs**
  (RB-01..RB-10). "Six runbooks (RB-01..RB-10)" meant six files, ten
  procedures.
- **Test totals.**

  ```
  durability integration tests   31  (cp2 13 · cp4 retention 9 · cp4 anon 5 · cp5 2 · cp8 2)
  backup-runtime unit tests       8
  total DB10 tests               39
  full-workspace suite           green (pnpm test exit 0; DB6/DB7/DB8/DB9/DB10 + tools)
  ```

  (The completion report §K's "29 durability tests" predated CP8; it is now 31,
  total 39.)
- **Artifact inventory** — §11 below verifies every committed path.
- **S24 prose.** `DB6_S24_TRIGGER_REPORT.md` labels the APPEND_ONLY group
  "16 tables" then lists 17; the live catalog has 17 APPEND_ONLY + 1
  COLUMN_SCOPED (`outbox_events`) = 18 `retention_exempt` triggers, and
  6+17+2+3+1+1 = **30** total. Additive note only; no physical evidence
  rewritten (already recorded in `DB10_DATA_DURABILITY_MATRIX.md` §10).

## Focused validation results

| Check | Result |
|---|---|
| typecheck / lint / format (changed files) | PASS |
| migration checksum gate | 31/31 match |
| fingerprint expected-value config | canonical `4ca56a59…1672f` unchanged; not edited |
| historical migration diff (`0000–0031`) | no change |
| secret scan (changed files) | no credentials; role tests use trust-socket, no passwords |
| retention-role/GUC security matrix | **2 independent disposable runs PASS** |
| restore smoke (schema-only, real schema) | PASS (used during the audit) |
| cleanup | 0 disposable DBs, 0 leaked roles (`db10_%`), 0 PITR containers, 0 scratch files |

PITR rehearsals were **not** repeated (no PITR code changed). No expensive
full rehearsal was repeated beyond the schema-only restore smoke used to
reproduce the security matrix on the real schema.

## Artifact inventory (committed)

All present under `docs/database/` unless noted:
`DB10_COMPLETION_REPORT.md`, `DB10_PERSISTENCE_FINAL_CLOSURE.md`,
`DB10_ACCEPTANCE_AUDIT.md`, `DB10_DURABILITY_PARAMETER_REGISTRY.md`,
`DB10_DATA_DURABILITY_MATRIX.md`, `DB10_BACKUP_ARCHITECTURE.md`,
`DB10_DISASTER_RECOVERY_MATRIX.md`, `DB10_OPERATIONAL_MONITORING_MATRIX.md`,
`DB10_EXECUTION_LOG.md`, this document, and 6 runbooks.
Tools: `tools/{backup-runtime,db-backup,db-restore,db-retention,db-anonymize,db-pitr-rehearsal}.mjs`
plus `tools/backup-runtime.test.mjs`.
Test suites: `apps/api/src/tests/durability/{durability-harness.ts,
db10-cp2-logical-restore,db10-cp4-retention,db10-cp4-anonymization,
db10-cp5-recovery,db10-cp8-retention-role-security}.integration.spec.ts`.

## Final task-board state

```
DB6                            COMPLETE
DB7                            COMPLETE
DB8                            COMPLETE
DB9                            COMPLETE
DB10 ENGINEERING               COMPLETE
OVERALL PERSISTENCE FOUNDATION COMPLETE
PRODUCTION DURABILITY GO-LIVE  BLOCKED BY NAMED EXTERNAL DECISIONS
```

Go-live blockers (all external, owners named): backup encryption at rest;
business RPO/RTO; backup frequency/retention; production backup/WAL
destinations; alert/on-call ownership; **application role privilege model
(DP-SEC-01) — the app must not connect as a superuser and must lack DELETE on
append-only tables.**
