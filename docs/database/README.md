# Database Phase — Overview

**Phase:** Database Architecture & Persistence Foundation
**Current checkpoint:** DB1 — Persistence Architecture & ADR Lockdown — **COMPLETED** (`DB1 PASS WITH DEFERRED PARAMETERS`, 2026-07-15)
**DB0:** COMPLETED (`DB0 PASS WITH OPEN DECISIONS`, committed `563d986`)
**DB1 audited Git HEAD:** `563d9863c5d9591095038a28887e217058d816e4` (branch `production`)
**DB1-C1 correction (2026-07-15):** applied after `a0e29b4` — PostgreSQL patch governance (16.x baseline 16.14 at correction date), ORM evidence refresh (exclusivity claim removed; Drizzle retained), collation scope correction. See [`DB1_CORRECTION_REPORT.md`](./DB1_CORRECTION_REPORT.md); verdict remains PASS WITH DEFERRED PARAMETERS.
**Next allowed checkpoint:** DB2 — Conceptual Domain Model (only now that DB1 has passed)
**Status of this document set:** discovery (DB0) + persistence ADRs (DB1) only. **No schema, no migration, no ORM install, no table has been designed or created.** That rule holds until DB6 for physical artifacts; DB2–DB5 remain documentation-only.

---

## 1. Purpose of the database phase

UI/UX delivery is intentionally paused. Before backend and frontend feature
work resumes, the persistence foundation is designed first, in a locked
sequence of checkpoints (DB0–DB10). The goal is a database that is:

- Traceable to locked product and business requirements.
- Safe for the platform's money, approval-snapshot, and inventory invariants.
- Reproducible across multiple developer machines through Git + Docker.
- Recoverable through documented backup/restore/migration runbooks.

## 2. Current status

DB0 is **discovery, audit, classification and documentation only**. It converts
the locked documents into a verifiable requirement-to-data map and a register
of open decisions. It does **not** begin DB1–DB10 work.

Existing persistence-relevant artifacts found during the DB0 audit:

- `infrastructure/compose/docker-compose.dev.yml` — a `postgres:16.6-alpine`
  service with a named volume `embroidery_postgres_data` (development only).
- `packages/domain-types`, `packages/design-document`, `packages/design-engine`
  — approved package boundaries that are **empty stubs** (no entities/schema).
- `infrastructure/backup`, `kubernetes`, `monitoring`, `scripts` — reserved
  README stubs only.

No ORM, migration tool, migration file, entity, SQL, database enum, index, or
seed exists at the DB0 audit point.

## 3. Source of truth

Per [`CLAUDE.md`](../../CLAUDE.md) the document precedence is:

1. `docs/00-PROJECT-CHARTER.md`
2. `docs/01-PRODUCT-REQUIREMENTS.md`
3. `docs/04-BUSINESS-RULES.md`
4. `docs/05-DESIGN-STUDIO-SPEC.md`
5. `docs/06-ORDER-AND-DESIGN-LIFECYCLE.md`
6. `docs/architecture/SYSTEM_ARCHITECTURE.md`
7. `docs/architecture/REPOSITORY_STRUCTURE.md`
8. `docs/development/FRONTEND_CONVENTIONS.md`
9. `docs/development/BACKEND_CONVENTIONS.md`
10. Relevant ADRs and task-specific documents

The **Git repository** is the source of truth for database documentation,
future schema definitions, migration history, seed definitions, recovery
runbooks, and checkpoint reports. Database volumes, secrets, runtime-generated
backups, and local machine state are **never** source of truth.

Design documents under `docs/design/` (`DESIGN_VISION`, `DESIGN_SYSTEM_FOUNDATION`,
`FIGMA_ARCHITECTURE`, `USER_FLOW_ARCHITECTURE`) govern UI/component architecture
only and are **not** authoritative for persistence or business rules.

## 4. No-implementation-beyond-checkpoint rule

Each checkpoint has a strict scope and exit gate defined in
[`DB_ROADMAP.md`](./DB_ROADMAP.md). Work belonging to a later checkpoint must
not be pulled forward. Consequential choices (ORM, migration framework, etc.)
require an ADR and must not be silently made inside an implementation task.

## 5. How to read this document set

| File | Contents |
| ---- | -------- |
| [`DB_ROADMAP.md`](./DB_ROADMAP.md) | Locked DB0–DB10 goals, deliverables, exit gates, multi-machine integration. |
| [`DB0_SOURCE_INVENTORY.md`](./DB0_SOURCE_INVENTORY.md) | Every audited source document, its status and governed domains. |
| [`DB0_REQUIREMENT_MATRIX.md`](./DB0_REQUIREMENT_MATRIX.md) | Requirement-to-data matrix with source, status, classification, checkpoint. |
| [`DB0_DOMAIN_COVERAGE.md`](./DB0_DOMAIN_COVERAGE.md) | 58 domain/operational areas, coverage and blocker status. |
| [`DB0_LIFECYCLE_INVENTORY.md`](./DB0_LIFECYCLE_INVENTORY.md) | Lifecycles to formalize at DB3. |
| [`DB0_INVARIANT_INVENTORY.md`](./DB0_INVARIANT_INVENTORY.md) | Invariants and their enforcement class. |
| [`DB0_QUERY_CATALOG.md`](./DB0_QUERY_CATALOG.md) | Query/use-case catalog influencing DB5. |
| [`DB0_PORTABILITY_RECOVERY_REQUIREMENTS.md`](./DB0_PORTABILITY_RECOVERY_REQUIREMENTS.md) | Multi-machine portability, versioning, backup/restore, recovery. |
| [`DB0_OPEN_DECISIONS.md`](./DB0_OPEN_DECISIONS.md) | Open-decision register with target checkpoints and blocker level. |
| [`DB0_CONFLICTS_AND_GAPS.md`](./DB0_CONFLICTS_AND_GAPS.md) | Conflicts, gaps, and proposed decision questions. |
| [`DB0_COMPLETION_REPORT.md`](./DB0_COMPLETION_REPORT.md) | Evidence, counts, validation, verdict. |
| [`DB1_DECISION_MATRIX.md`](./DB1_DECISION_MATRIX.md) | All 19 B1 decisions: ADR, status, rationale, deferred parameters. |
| [`DB1_IMPLEMENTATION_HANDOFF.md`](./DB1_IMPLEMENTATION_HANDOFF.md) | What DB2–DB10 must obey/implement/test; deferred-parameter register. |
| [`DB1_COMPLETION_REPORT.md`](./DB1_COMPLETION_REPORT.md) | DB1 evidence, validation, verdict. |

### DB1 ADR index (`docs/adr/database/`)

| ADR | Decides |
| --- | ------- |
| [ADR-DB1-001](../adr/database/ADR-DB1-001-POSTGRESQL-VERSION.md) | PostgreSQL 16 pin, parity, UTF8/C/UTC baseline (DEC-03) |
| [ADR-DB1-002](../adr/database/ADR-DB1-002-ORM-QUERY-LAYER.md) | Drizzle ORM + raw-SQL policy (DEC-01) |
| [ADR-DB1-003](../adr/database/ADR-DB1-003-MIGRATION-STRATEGY.md) | drizzle-kit, immutable shared migrations, forward-fix (DEC-02, DEC-18) |
| [ADR-DB1-004](../adr/database/ADR-DB1-004-SCHEMA-VERSIONING-AND-GIT-TRACEABILITY.md) | Git ↔ schema traceability, drift detection |
| [ADR-DB1-005](../adr/database/ADR-DB1-005-DATABASE-SCHEMA-ORGANIZATION.md) | Single `public` schema + ownership map (DEC-08) |
| [ADR-DB1-006](../adr/database/ADR-DB1-006-NAMING-CONVENTIONS.md) | Naming + money/timestamp baseline (DEC-07) |
| [ADR-DB1-007](../adr/database/ADR-DB1-007-ID-STRATEGY.md) | UUIDv7 / bigint identity / codes (DEC-04) |
| [ADR-DB1-008](../adr/database/ADR-DB1-008-STATUS-REPRESENTATION.md) | text + CHECK statuses (DEC-05) |
| [ADR-DB1-009](../adr/database/ADR-DB1-009-PERSISTENCE-AND-TRANSACTION-BOUNDARIES.md) | Module persistence ownership, use-case transactions |
| [ADR-DB1-010](../adr/database/ADR-DB1-010-IMMUTABILITY-ENFORCEMENT.md) | Immutability defense-in-depth (DEC-09) |
| [ADR-DB1-011](../adr/database/ADR-DB1-011-DELETE-ARCHIVE-RETENTION.md) | Delete/archive categories + retention classes (DEC-10, DEC-13) |
| [ADR-DB1-012](../adr/database/ADR-DB1-012-DESIGN-DOCUMENT-CANONICALIZATION.md) | RFC 8785 JCS + SHA-256 hashing, ownership (DEC-06) |
| [ADR-DB1-013](../adr/database/ADR-DB1-013-MULTI-MACHINE-AND-DOCKER-VOLUMES.md) | Volumes, branch divergence, machine switch (DEC-17) |
| [ADR-DB1-014](../adr/database/ADR-DB1-014-BACKUP-AND-RESTORE.md) | pg_dump -Fc + manifest, restore compatibility (DEC-11, DEC-12) |
| [ADR-DB1-015](../adr/database/ADR-DB1-015-SEED-STRATEGY.md) | Seed tiers/direction (DEC-19) |
| [ADR-DB1-016](../adr/database/ADR-DB1-016-TEST-DATABASE-STRATEGY.md) | Real-PG test database strategy (DEC-20) |
| [ADR-DB1-017](../adr/database/ADR-DB1-017-IDEMPOTENCY-POLICY.md) | Idempotency record model (DEC-15) |
| [ADR-DB1-018](../adr/database/ADR-DB1-018-INVENTORY-RESERVATION-EXPIRY.md) | Reservation expiry direction (DEC-14) |

## 6. Identifier conventions

Stable IDs are used so later checkpoints can reference findings without relying
on line numbers (which change):

- Requirements: `REQ-<DOMAIN>-<nnn>` (e.g. `REQ-PAY-003`).
- Domain coverage rows: `DOM-01` … `DOM-58`.
- Lifecycles: `LC-01` …
- Invariants: `INV-01` …
- Queries/use cases: `Q-01` …
- Open decisions: `DEC-01` … (cross-linked to Decision Log `O-xxx` where relevant).
- Conflicts/gaps: `GAP-01` …

Sources are cited by **file path + heading**, never by line number.

## 7. Commit / versioning requirement

All DB0 output is committed to Git as versioned documentation. The audited Git
HEAD and date are recorded in every deliverable so a future machine can map
this discovery to the exact repository state it describes.

## 8. Multi-machine portability principle

Development happens across several machines. Any developer must be able to
clone the repo, checkout a commit, start Docker, determine the required schema
version, migrate from empty or upgrade from an older version, optionally restore
from backup, and continue — without depending on data or configuration that
exists only on another machine. DB0 records these requirements; DB1 locks the
strategy; DB6–DB10 implement and audit it. See
[`DB0_PORTABILITY_RECOVERY_REQUIREMENTS.md`](./DB0_PORTABILITY_RECOVERY_REQUIREMENTS.md).
