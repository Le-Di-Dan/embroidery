# DB10 — Backup, Restore, Retention & Operational Durability — Completion Report

## A. Verdict

```
DB6                  COMPLETE
DB7                  COMPLETE
DB8                  COMPLETE
DB9                  COMPLETE
DB10                 COMPLETE
OVERALL PERSISTENCE  COMPLETE
```

**Branch:** `production`. Tree clean. **Not pushed.** DB6 physical baseline
unchanged — zero migrations added, fingerprint `4ca56a59…1672f`.

Everything below is local, reproducible evidence from one machine
(i7-12700K, 31.7 GB, PostgreSQL 16.14 in Docker). **No production SLA, RPO or
RTO is claimed.**

## B. DB9 preflight reconciliation (CP0)

| Item | Finding |
|---|---|
| DB9 closure commit | HEAD `07a06ef` **is** the closure commit; the report described an 8th commit without naming it. Addendum, continue (§3). |
| DB9 commit count | **8** (`623eb78..07a06ef`), verified from Git. |
| Amended commit `623eb78` | Reconciled additively (DEC-DB10-002): current hash/subject correct, single-parent chain, **no committed artifact references a superseded hash**. Governance rule restated as absolute in `DB6_MIGRATION_GOVERNANCE.md` (DEV-GOV-001). No history rewritten. |
| DB9 scope-matrix tally | Corrected by addendum (DEC-DB10-003): **63** unique rows, **33** deferred — `PERF-R33` was double-counted. No status changed. |
| 33 deferred DB9 rows | Classified A–F: **1** DB10 scope (`PERF-T04`, done in CP4), **30** application-feature handoffs (not claimed solved), **2** future production perf, **0** blockers. |

## C. Parameter registry (CP0)

`DB10_DURABILITY_PARAMETER_REGISTRY.md` — 47 parameters: 13 locked, 7
provisional, **27 deferred with a named owner**. 31 need a production
decision; **1 is production-blocking** (DP-BAK-05 backup encryption at rest).
`DB10_DATA_DURABILITY_MATRIX.md` classifies **78/78** tables (durability,
retention, PII, S24 DELETE policy), reconciling the S24 exemption's live
catalog against the retention policy — the exemption is deliberately broader,
so the retention job uses a code-level allowlist, not the trigger, as its
boundary.

## D. Backup architecture (CP1)

Four-layer strategy (`DB10_BACKUP_ARCHITECTURE.md`): logical backup
**implemented and rehearsed**; PITR **mechanism rehearsed**; off-site copy and
config/secret backup **deliberately unbuilt** with owners. Tooling —
`tools/db-backup.mjs`, `tools/db-restore.mjs` — runs `pg_dump`/`pg_restore`
inside the pinned container over its local socket (DEC-DB10-006): **no
credential is ever handled**, and client/server cannot skew. Every artifact
ships a manifest with the schema fingerprint, applied-migration count, exact
per-table row counts, a sha256, and an explicit `encryption: none` /
`sanitization: none` declaration. Seven failure fixtures pass with distinct
exit codes and no false-success artifact.

## E. Logical restore evidence (CP2)

A representative disposable database was backed up and restored into **two
independent empty databases**. Each restored database:

- reproduces the canonical DB6 fingerprint and passes all seven catalog
  checkers;
- matches exact per-table row counts **and** order-independent content
  checksums on seven critical tables;
- still enforces CHECK constraints and S24 immutability (SQLSTATE 23000);
- serves rows through the real `OrderRepository`;
- still commits order → outbox atomically, and rolls both back together.

A corrupted artifact is refused before anything is created (exit 4);
restore-over-existing is refused; schema-only selective restore passes the
fingerprint gate.

## F. PITR evidence / status (CP3)

Required for production, feasible locally → **rehearsed**. On a dedicated
disposable container (never the dev instance), base backup + archived WAL
recovered to a chosen instant: the pre-target transaction survived, the
post-target one did not, and the instance promoted cleanly out of recovery.
**Run three times independently** (CP3 ×2, CP7 ×1), identical result. The
production WAL archive destination and the RPO/window remain deferred with
named owners.

## G. Retention & anonymization (CP4)

`tools/db-retention.mjs` — bounded, keyset-progressing, child-before-parent
deletion under the S24 exemption, restricted to a nine-family allowlist;
commercial records are refused outright. `tools/db-anonymize.mjs` — PII scrub
preserving the row, its id, commercial links and the frozen approval snapshot,
idempotent, surviving a backup/restore round-trip. **S24 exemption security
proven:** a DELETE without the GUC is rejected, an UPDATE with it is still
rejected (DELETE-only), `refunds` is never exempted, and no application source
sets the GUC. A 5 000-row sweep ran in 5 batches / ~1.3 s (local evidence).
**Every retention duration remains a deferred business value.**

## H. Disaster recovery (CP5)

`DB10_DISASTER_RECOVERY_MATRIX.md` — 9 scenarios. Rehearsed: fresh setup
(empty→migrated reaches the baseline), lost volume (backup → destroy → recover
→ verify), and the checksum gate catching a byte-level edit to a frozen
migration (exit 1). Documented with owners: restart, partial rollout, storage
exhaustion, credential rotation. Object-storage binary recovery is flagged in
every runbook as a separate, infrastructure-owned step.

## I. Monitoring & runbooks (CP6)

`DB10_OPERATIONAL_MONITORING_MATRIX.md` — 16 signals with concrete queries and
role owners; checksum-drift and fingerprint-drift are already enforced gates.
Six runbooks (RB-01..RB-10) with no plaintext secrets.
`DB10_ACCEPTANCE_AUDIT.md` — **every critical roadmap gate PASSES**; no
critical gate deferred, none failed.

## J. Regression and rehearsals (CP7)

- Migration checksums **31/31**; `db:check:manifest` clean (78 tables);
  fingerprint checked **read-only** on the persistent dev database (which is at
  migration 31 — see §P) and matches `4ca56a59…1672f`.
- Two independent logical-restore rehearsals (CP2) and one independent
  lost-volume rehearsal (CP5); three independent PITR rehearsals.
- Full-workspace `pnpm test`: see §K.
- Persistent dev DB untouched throughout; every disposable database, PITR
  container and backup scratch file cleaned.

## K. Metrics

```
Checkpoints                 CP0–CP7 (8) + closure-correction audit
Commits (DB10)               8 implementation (6ac5600..daf9286) + closure-correction commits (§P)
New tools                    5  (backup, restore, retention, anonymize, pitr) + backup-runtime
New durability suites        5  (cp2 restore, cp4 retention, cp4 anonymization, cp5 recovery, cp8 role-security)
Durability tests            31  (13 + 9 + 5 + 2 + 2) + 8 backup-runtime unit tests = 39 DB10 tests
Independent restore runs     2  (CP2) + 1 lost-volume (CP5)
Independent PITR runs        3
Tables classified           78 / 78
Parameters registered       47  (13 locked, 7 provisional, 27 deferred)
Migrations added             0
Physical baseline            unchanged (fingerprint 4ca56a59…1672f)
```

## L. Deferred work (owners named, none blocking closure)

- **Business/legal:** RPO, RTO, backup frequency & retention, all retention
  durations, anonymization deadlines, maintenance window, on-call ownership.
- **Operations/security:** backup encryption at rest (production-blocking),
  restore-rehearsal cadence, alert thresholds.
- **Infrastructure:** object storage / backup destination, WAL archive
  destination, off-site copy, autovacuum/bloat characterisation over time,
  external monitoring integration, deployment topology & `max_connections`
  budget.
- **Application feature work:** 30 DB9 class-B query gaps, the legal-hold
  mechanism, the worker loop / scheduler. **None claimed solved.**

## M. Commits

DB10-CP0 → closure, oldest first, on `production`, parents linear, never
pushed:

```
6ac5600  docs(database): lock DB10 durability scope
2d7e588  feat(database): add verified backup and restore tooling
f9f3427  test(database): rehearse logical restore end to end
be187d7  feat(database): rehearse point-in-time recovery
a3bd403  feat(database): add retention and anonymization controls
5652f07  test(database): rehearse disaster recovery and cross-machine setup
8adc1a7  docs(database): add monitoring matrix and acceptance audit
```

This report and `DB10_PERSISTENCE_FINAL_CLOSURE.md` land in one further
commit, closing DB10 at that HEAD.

## N. Deviations recorded rather than hidden

- **The retention tool hung on its first real sweep.** `set local` prints a
  `SET` command tag, so parsing the whole psql output as a number gave `NaN`,
  and `NaN < batch` is false — the loop never terminated. Fixed to read the
  last output line with an integer guard. Found by the tool's own test timing
  out, not by review.
- **The backup tool first produced a dump with no manifest and exited 0.** A
  race between a manual `sink.end()` and `pipe`'s auto-end left the completion
  promise unsettled. Replaced with `stream/promises.pipeline`. The worst
  failure mode for a backup tool — a plausible artifact and silent success —
  caught in CP1 smoke.
- **The CP2 restore left a half-restored database on a structural-corruption
  fixture.** `pg_restore` correctly failed, but the created target survived.
  Fixed: a restore that fails after creating its target drops it
  (`--keep-failed` to opt out).
- **A `DB6_S24_TRIGGER_REPORT.md` prose label was off by one** (APPEND_ONLY
  "16 tables" listing 17). Recorded in `DB10_DATA_DURABILITY_MATRIX.md`; the
  trigger count (30) and every physical number were always correct.
- **No autovacuum/bloat measurement is claimed.** Disposable databases live
  for seconds; DB10 marks this not-established rather than guessing.

## O. Final verdict

```
DB6                  COMPLETE
DB7                  COMPLETE
DB8                  COMPLETE
DB9                  COMPLETE
DB10                 COMPLETE
OVERALL PERSISTENCE  COMPLETE
```

Application features, production deployment, external monitoring, and the
business-approved RPO/RTO remain outside the persistence workstream, with
owners named above. The DB6 physical baseline is untouched.

---

## P. Final-closure correction addendum

A narrow closure audit (`DB10_FINAL_CLOSURE_CORRECTION.md`) corrected four
items after implementation was accepted. Nothing in CP0–CP7 was redone.

- **Commit count:** §K/§M's "10" was wrong — DB10 has **8** implementation
  commits (`6ac5600..daf9286`, linear). This correction adds two further
  additive commits; the exact final HEAD is stated in the correction doc §12.
- **Persistent dev DB:** clarified — the persistent `embroidery` database is at
  **migration 31** (migrated during DB6/DB7 on 2026-07-19/20, the day before
  DB10), and DB10 **only read** from it. "Fingerprint match on the dev
  database" was a read-only check on that migration-31 database. No mutation.
- **Bounded verdict (Model A):** engineering is complete; **production go-live
  is BLOCKED by named external decisions** (see §O replacement below).
- **Retention exemption security (real finding):** the S24 exemption has no
  role guard and the dev app role is a superuser, so the application identity
  *could* bypass. Resolved by **least-privilege role separation** — proven
  twice on real tables (`db10-cp8`): a non-superuser app role without DELETE
  cannot bypass even with the GUC set; only a dedicated retention role can. No
  schema change (grants/roles are not in the fingerprint). The residual
  "app must not be superuser / must lack DELETE on append-only tables" is a
  named production control (DP-SEC-01).
- **Test totals:** durability integration **31** (was 29 pre-CP8) + 8
  backup-runtime unit = **39** DB10 tests.

### O′. Corrected final verdict

```
DB6                            COMPLETE
DB7                            COMPLETE
DB8                            COMPLETE
DB9                            COMPLETE
DB10 ENGINEERING               COMPLETE
OVERALL PERSISTENCE FOUNDATION COMPLETE
PRODUCTION DURABILITY GO-LIVE  BLOCKED BY NAMED EXTERNAL DECISIONS
```

The DB6 physical baseline and its fingerprint `4ca56a59…1672f` remain
unchanged; zero migrations were added by DB9 or DB10.
