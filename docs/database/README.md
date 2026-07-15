# Database Phase — Overview

**Phase:** Database Architecture & Persistence Foundation
**Current checkpoint:** DB0 — Database Discovery & Requirement-to-Data Matrix
**Audit date:** 2026-07-15
**Audited Git HEAD:** `223e4db45b325fc982390a58180c7d8638676f7d` (branch `production`)
**Status of this document set:** DB0 discovery only. **No schema, no migration, no ORM, no table has been designed or created.**

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
