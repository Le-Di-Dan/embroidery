# Persistence Workstream — Final Closure (DB0–DB10)

**Compiled:** DB10-CP7. Branch `production`, not pushed. This document states
what the DB0–DB10 workstream completed and, just as precisely, what remains
outside it and who owns it.

## 1. Status

```
DB0  Requirements & portability            COMPLETE
DB1  Persistence ADRs                       COMPLETE
DB2  Domain / classification model          COMPLETE
DB3  Lifecycle & invariant specs            COMPLETE
DB4  Physical schema design                 COMPLETE
DB5  Access paths & indexing                COMPLETE
DB6  Schema implementation (78 tables)      COMPLETE
DB7  Repositories & transactions            COMPLETE
DB8  Concurrency & race correctness         COMPLETE
DB9  Measured performance & query plans     COMPLETE
DB10 Backup, retention, durability audit    COMPLETE

OVERALL PERSISTENCE                          COMPLETE
```

## 2. The locked physical baseline (unchanged since DB6)

```
Tables 78 · Columns 833 · FKs 160 · PK 78 · UQ 50 · CHECK 189
Indexes 211 (46 partial) · JSONB 9 · Trigger fns 1 · Triggers 30
Migrations 31 (0000–0031, frozen)
Fingerprint 4ca56a5967730d257edb34e72d6c40373156704cab7c87e3a684803c8321672f
```

DB9 and DB10 added **zero** migrations and changed **nothing** physical. The
fingerprint has held from DB6 closure through DB10 closure.

## 3. What the workstream delivered

- A reproducible, migrated PostgreSQL schema with catalog, constraint,
  fingerprint and checksum gates.
- Repositories and an ambient-transaction runtime with a typed error taxonomy.
- Proven concurrency correctness for every P0 race under real multi-connection
  contention.
- Measured, plan-level performance evidence for the critical read/write/queue
  paths, with rejected tuning candidates documented.
- Verified backup and restore, rehearsed PITR, a safe retention sweep and PII
  anonymization, disaster-recovery and cross-machine runbooks, a monitoring
  matrix, and a full acceptance audit — all backed by executable rehearsals.

## 4. What remains outside persistence (with owners)

These are **not** persistence gaps; they are the next workstreams.

| Area | Owner | Notes |
|---|---|---|
| Use-case / application-service layer | application feature work | repositories exist; the request→response path above them is unbuilt |
| Worker loop & scheduler | worker application | `apps/worker` is a bootstrap shell; claim primitives are proven, nothing calls them in production |
| Queue / broker choice | open ADR (`CLAUDE.md` §8) | — |
| Object storage product & binary recovery | infrastructure | `assets` rows restore as references; bytes are a separate system |
| Business RPO / RTO / retention durations / holds | business & legal | every duration is a deferred `[cfg]` value |
| Backup encryption, off-site copy, schedule | operations / security / infrastructure | DP-BAK-05 is production-blocking |
| Deployment topology & `max_connections` budget | infrastructure | DB9 measured one process; N replicas untested |
| Autovacuum / bloat over time | infrastructure | not measurable on disposable databases |
| External monitoring integration | infrastructure | product undecided |
| 30 DB9 class-B query gaps | application feature work | query shapes recorded; repository methods not invented |

## 5. Governance note

The persistence workstream carries **one** recorded process deviation
(DEV-GOV-001): commit `623eb78` was amended once, seconds after creation, to
repair a shell-mangled subject line — identical tree, before any dependent
work, disclosed at the time and reconciled additively at DB10-CP0. The
no-amend / no-squash / no-rewrite / no-push rule is otherwise absolute across
DB0–DB10, and no committed artifact references any superseded hash.

## 6. Verification at closure

- 31/31 migration checksums; manifest clean (78 tables); dev fingerprint match.
- Full-workspace test suite green (DB6/DB7/DB8/DB9/DB10 suites inside it).
- Persistent dev database untouched; zero leaked disposable databases; branch
  unpushed.

**Persistence is complete. Nothing here claims the application or a production
deployment is complete.**

---

## 7. Final-closure correction (addendum)

Resolved in `DB10_FINAL_CLOSURE_CORRECTION.md`:

- **Bounded verdict.** Engineering implementation is COMPLETE and the
  persistence *foundation* is COMPLETE; **production durability go-live is
  BLOCKED by named external decisions** (backup encryption, RPO/RTO, schedule,
  destinations, on-call, and the application role privilege model DP-SEC-01).
- **Persistent dev DB.** At **migration 31**, read-only throughout DB10; the
  fingerprint was checked read-only on it. No mutation.
- **Retention bypass boundary (DP-SEC-01).** Proven by role separation: a
  non-superuser application role lacking DELETE on append-only tables cannot
  bypass the S24 exemption even by setting the GUC; only a dedicated
  non-superuser retention role can delete, under the exemption, on
  retention-exempt tables, for DELETE only. **The application must not connect
  as a superuser.** No schema change; fingerprint unchanged.

Corrected task board:

```
DB6                            COMPLETE
DB7                            COMPLETE
DB8                            COMPLETE
DB9                            COMPLETE
DB10 ENGINEERING               COMPLETE
OVERALL PERSISTENCE FOUNDATION COMPLETE
PRODUCTION DURABILITY GO-LIVE  BLOCKED BY NAMED EXTERNAL DECISIONS
```
