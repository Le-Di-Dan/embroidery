# DB0 — Multi-Machine Portability & Recovery Requirements

**Audit date:** 2026-07-15 · **Audited Git HEAD:** `223e4db`
**Purpose:** Capture requirements so a developer can change machines, resume work, and recover data — without depending on state that lives only on the old machine. DB0 records requirements; it does **not** build scripts or runbooks.

---

## 1. Governing principle

Git is the source of truth for database documentation, schema definitions
(future), migration history (future), seed definitions (future), recovery
runbooks (future), and checkpoint reports. Database volumes, secrets,
runtime-generated backups, and local machine state are **never** source of
truth (DB0 task §2; `SYSTEM_ARCHITECTURE §9`).

Target capability chain a new machine must support:

1. Clone repository.
2. Checkout the correct commit/branch.
3. Start dependencies with Docker.
4. Determine the schema version the database needs.
5. Migrate from empty **or** upgrade from an older version.
6. Optionally restore data from backup.
7. Continue development without machine-local-only data or config.

## 2. Development portability

| ID | Requirement | Source | Owner CP | Expected acceptance (DB10 unless noted) |
| -- | ----------- | ------ | -------- | --------------------------------------- |
| PR-01 | Repository clone yields everything needed to reconstruct the schema (no hidden local schema). | REQ-OPS-005, `SYSTEM_ARCHITECTURE §9` | DB1 | Fresh clone + documented steps reaches current schema version. |
| PR-02 | Environment file creation is deterministic: `cp .env.example .env`; all vars documented; no secret required to be invented silently. | REQ-OPS-009, `LOCAL_DEVELOPMENT §3`, `.env.example` | DB1/DB6 | New machine boots stack from `.env.example` defaults. |
| PR-03 | Docker startup brings up PostgreSQL reproducibly (`postgres:16.6-alpine`, healthcheck, named volume). | REQ-OPS-004, `docker-compose.dev.yml` | DB6 | `pnpm docker:dev:up postgres` yields a healthy DB. |
| PR-04 | Database initialization from empty runs all migrations in order. | REQ-OPS-007, INV-28 | DB6 | Fresh DB → full migrate → expected version. |
| PR-05 | Migration execution is a documented, single command path. | REQ-OPS-001 | DB6 | Documented migrate command; framework per DEC-02. |
| PR-06 | Seed execution is deterministic and reproducible across machines; dev vs test data separated. | REQ-OPS-011 | DB9 | Same seed → identical baseline on any machine. |
| PR-07 | Verification step confirms schema version + seed correctness after setup. | REQ-OPS-010, `13 §4` | DB10 | Verification checklist passes. |
| PR-08 | Local environment reset is supported (`pnpm docker:clean:volumes` destroys local DB deliberately). | `LOCAL_DEVELOPMENT §11` | DB6 | Reset returns to clean state; documented as destructive. |
| PR-09 | Switching branches with different migration states is safe and detectable. | DB0 Task H, REQ-OPS-008 | DB6/DB10 | Branch switch detects schema mismatch; guidance to migrate/reset. |
| PR-10 | Accidental reuse of an incompatible database volume is prevented or detected. | DB0 Task H, INV-35 | DB6/DB10 | Volume/version mismatch is surfaced, not silently corrupting. |

## 3. Schema versioning

| ID | Requirement | Source | Owner CP | Expected acceptance |
| -- | ----------- | ------ | -------- | ------------------- |
| SV-01 | Migration history is stored in Git (versioned migration files). | REQ-OPS-005/006, `10 §10` | DB1/DB6 | Migrations committed; reviewable. |
| SV-02 | The database has a migration-history table recording applied migrations. | INV-30, `10 §10` | DB6 | History table present and queried by tooling. |
| SV-03 | Git state maps to schema state (traceability commit ↔ schema version). | INV-30 | DB6 | A commit determines the expected applied-migration set. |
| SV-04 | Upgrade workflow: existing DB advances from a supported prior version. | INV-29 | DB7 | Upgrade path tested from prior version. |
| SV-05 | Fresh-install workflow: empty DB reaches current version via ordered migrations. | INV-28 | DB7 | Fresh-install tested. |
| SV-06 | Shared/merged migrations are immutable; changes create new migrations. | INV-26/27, `BACKEND_CONVENTIONS §9` | DB1 (policy), DB6 | Policy locked in ADR; enforced by review/tooling. |
| SV-07 | Failed-migration policy is defined (halt, diagnose, forward-fix vs rollback). | DB0 Task H, DEC-18 | DB1 | Policy documented in ADR. |
| SV-08 | Rollback-versus-forward-fix policy is decided (forward-only is a candidate). | DEC-18 | DB1 | ADR states the policy. |
| SV-09 | Branch divergence and migration conflicts have a resolution procedure. | DB0 Task H | DB1/DB6 | Documented conflict-resolution steps. |

## 4. Data portability

| ID | Requirement | Source | Owner CP | Expected acceptance |
| -- | ----------- | ------ | -------- | ------------------- |
| DP-01 | Define when local data may be discarded (dev/test data is disposable). | DB0 Task H, `LOCAL_DEVELOPMENT §11` | DB1 | Policy: dev DB is reproducible from migrations + seed. |
| DP-02 | Define when local data should be backed up before an action. | DB0 Task H, `10 §9` | DB1 | Guidance for pre-migration/pre-reset backups. |
| DP-03 | Backup format candidates identified (e.g. `pg_dump` logical vs physical). | REQ-OPS-002, DEC-11 | DB1 | ADR selects format/tool. |
| DP-04 | Restore validation is required (test restore, not assumed). | `09 §11`, `10 §9`, INV-33 | DB10 | Periodic restore test passes. |
| DP-05 | Backup compatibility with schema version is known before restore. | INV-34, DEC-12 | DB1/DB10 | Restore records target schema version. |
| DP-06 | Schema recovery is separated from business-data recovery. | DB0 Task H, INV-34 | DB1/DB10 | Distinct runbooks: rebuild schema vs restore data. |

## 5. Secrets and configuration

| ID | Requirement | Source | Owner CP | Expected acceptance |
| -- | ----------- | ------ | -------- | ------------------- |
| SC-01 | `.env` is git-ignored; real secrets never committed. | `LOCAL_DEVELOPMENT §3`, `BACKEND_CONVENTIONS §16` | DB1 | Repo has no secrets; enforced. |
| SC-02 | `.env.example` documents every variable, including DB credentials. | `.env.example`, REQ-OPS-009 | DB6 | New machine configures from example. |
| SC-03 | Stable Docker service names (`postgres`, `api`, …) and stable ports where practical. | `docker-compose.dev.yml`, `LOCAL_DEVELOPMENT §7` | DB6 | Service names stable across machines. |
| SC-04 | Machine-specific overrides are supported (e.g. `POSTGRES_PORT=5433` on port conflict). | `LOCAL_DEVELOPMENT §3` | DB6 | Overrides work without code changes. |
| SC-05 | Object-storage and database credentials differ per machine/environment and are provisioned separately. | `.env.example`, `SYSTEM_ARCHITECTURE §13` | DB1 | Credentials externalized; not in repo. |
| SC-06 | Recovery when credentials differ between machines is documented (no assumption of identical secrets). | DB0 Task H | DB10 | Runbook covers credential differences. |
| SC-07 | Config validated at startup; production fails fast on missing mandatory config. | REQ-OPS-010, `BACKEND_CONVENTIONS §16` | DB6 | Startup validation present. |

## 6. Recovery documentation (runbooks required by DB10)

These runbooks must **exist by DB10**. DB0 only identifies them, their owner
checkpoint, and expected acceptance. **`infrastructure/backup/README.md` is
currently a reserved stub → this is a tracked gap (GAP-07).**

| ID | Runbook | Owner CP | Expected acceptance |
| -- | ------- | -------- | ------------------- |
| RB-01 | New machine bootstrap | DB10 | A fresh machine reaches a working dev stack from the runbook alone. |
| RB-02 | Fresh database setup | DB6/DB10 | Empty DB → migrated → seeded → verified. |
| RB-03 | Existing database migration (upgrade) | DB7/DB10 | Prior-version DB upgrades cleanly. |
| RB-04 | Backup creation | DB10 | Backup produced in the chosen format, encrypted/access-controlled, off-site. |
| RB-05 | Restore | DB10 | Restore from backup validated against a known schema version. |
| RB-06 | Failed-migration recovery | DB10 | Documented recovery from a partially-applied migration. |
| RB-07 | Corrupted local volume recovery | DB10 | Recreate volume; migrate; optionally restore data. |
| RB-08 | Branch switching (different migration states) | DB10 | Safe switch with schema reconciliation. |
| RB-09 | Full environment reset | DB6/DB10 | Deterministic clean rebuild. |
| RB-10 | Verification checklist | DB10 | Post-recovery checklist confirming schema + data + app health. |

## 7. Decisions to lock at DB1 (portability/recovery subset)

The following portability/recovery decisions must be locked by the **DB1
Persistence ADR** (see [`DB0_OPEN_DECISIONS.md`](./DB0_OPEN_DECISIONS.md)):

- Migration framework (DEC-02) and forward-only vs rollback policy (DEC-18).
- Backup tool/format (DEC-11) and restore compatibility strategy (DEC-12).
- Local Docker volume strategy + branch-divergence handling (DEC-17).
- Cross-machine data transfer policy (DEC-17 / DP-01..DP-06).
- Seed strategy (DEC-19) and test database strategy (DEC-20).
- PostgreSQL version pin reconciliation (DEC-03) so all machines run the same
  engine version.

## 8. Acceptance gates injected into DB6–DB10

| Checkpoint | Portability/recovery acceptance gate |
| ---------- | ------------------------------------ |
| DB6 | Reproducible Docker DB; fresh-install migration; migration history table; startup config validation (PR-03..PR-05, SV-02, SC-03/04/07). |
| DB7 | Fresh-install + upgrade migrations tested; constraint tests (SV-04/05, INV-28/29). |
| DB8 | Concurrency & recovery-sensitive transactions (payment idempotency, outbox, reservation) proven safe (INV-07/19/23). |
| DB9 | Deterministic seed reproducible across machines (PR-06). |
| DB10 | New-machine bootstrap, backup/restore, failed-migration & volume recovery, verification checklist all audited (RB-01..RB-10, DP-04..DP-06). |

## 9. Cross-references

- Requirement rows flagged `X`: [`DB0_REQUIREMENT_MATRIX.md`](./DB0_REQUIREMENT_MATRIX.md) §29.
- Migration/portability invariants INV-26..INV-35: [`DB0_INVARIANT_INVENTORY.md`](./DB0_INVARIANT_INVENTORY.md) §3.
- Open decisions: [`DB0_OPEN_DECISIONS.md`](./DB0_OPEN_DECISIONS.md).
- Backup stub gap: [`DB0_CONFLICTS_AND_GAPS.md`](./DB0_CONFLICTS_AND_GAPS.md) GAP-07.
