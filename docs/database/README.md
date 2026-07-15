# Database Phase — Overview

**Phase:** Database Architecture & Persistence Foundation
**Current checkpoint:** DB3 — Lifecycle & Invariant Specification — **COMPLETED** (`DB3 PASS WITH DEFERRED PARAMETERS`, 2026-07-15)
**DB0:** COMPLETED (`563d986`) · **DB1:** COMPLETED (`a0e29b4` + correction `f90f78c`) · **DB2:** COMPLETED (`0563866`)
**DB3 audited Git HEAD:** `0563866e0c1a53472a07e892e6cc1ecabe086b5a` (branch `production`)
**Next allowed checkpoint:** DB4 — Logical Relational Schema (only now that DB3 has passed)
**Status of this document set:** discovery (DB0) + persistence ADRs (DB1) + conceptual domain model (DB2) + lifecycle/invariant specifications (DB3). **No schema, no migration, no ORM install, no table/column/FK/index has been designed or created.** That rule holds until DB6 for physical artifacts; DB4–DB5 remain documentation-only.

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
| [`DB1_CORRECTION_REPORT.md`](./DB1_CORRECTION_REPORT.md) | DB1-C1 evidence/policy correction record. |
| [`DB2_CONCEPT_INVENTORY.md`](./DB2_CONCEPT_INVENTORY.md) | 75 canonical concepts: type, owner, classification, retention. |
| [`DB2_BOUNDED_CONTEXT_MAP.md`](./DB2_BOUNDED_CONTEXT_MAP.md) | 15 contexts, responsibilities, integration styles, diagram. |
| [`DB2_AGGREGATE_CATALOG.md`](./DB2_AGGREGATE_CATALOG.md) | 23 aggregates: roots, children, invariants, boundaries. |
| [`DB2_ENTITY_VALUE_OBJECT_CATALOG.md`](./DB2_ENTITY_VALUE_OBJECT_CATALOG.md) | Entity vs VO classification + ID categories. |
| [`DB2_RELATIONSHIP_MODEL.md`](./DB2_RELATIONSHIP_MODEL.md) | Cardinalities, composition/reference/snapshot, domain diagrams. |
| [`DB2_OWNERSHIP_MATRIX.md`](./DB2_OWNERSHIP_MATRIX.md) | One owner per concept; read/mutate/reference rights. |
| [`DB2_SNAPSHOT_AND_HISTORY_MODEL.md`](./DB2_SNAPSHOT_AND_HISTORY_MODEL.md) | Versioned/snapshot/append-only/mutable classes + correction rules. |
| [`DB2_CROSS_CONTEXT_WORKFLOWS.md`](./DB2_CROSS_CONTEXT_WORKFLOWS.md) | W1–W7 orchestration, idempotency/audit points, DB3 guards. |
| [`DB2_TRANSACTION_BOUNDARY_CANDIDATES.md`](./DB2_TRANSACTION_BOUNDARY_CANDIDATES.md) | Use-case transaction candidates + DB8 hotspots. |
| [`DB2_DATA_CLASSIFICATION_MAP.md`](./DB2_DATA_CLASSIFICATION_MAP.md) | Per-concept classification, access, retention, redaction. |
| [`DB2_PACKAGE_MODULE_MAPPING.md`](./DB2_PACKAGE_MODULE_MAPPING.md) | Context → module/package mapping (incl. new `content` module note). |
| [`DB2_DESIGN_TEMPLATE_DECISION.md`](./DB2_DESIGN_TEMPLATE_DECISION.md) | GAP-08 resolution. |
| [`DB2_TERMS_VERSION_DECISION.md`](./DB2_TERMS_VERSION_DECISION.md) | GAP-09 (DB2 portion) resolution. |
| [`DB2_ANALYTICS_STORAGE_DECISION.md`](./DB2_ANALYTICS_STORAGE_DECISION.md) | GAP-11 resolution. |
| [`DB2_COMPLETENESS_MATRIX.md`](./DB2_COMPLETENESS_MATRIX.md) | Full DB0 trace: concepts/REQ/DOM/LC/INV/Q coverage. |
| [`DB2_IMPLEMENTATION_HANDOFF.md`](./DB2_IMPLEMENTATION_HANDOFF.md) | DB3/DB4 handoff + deferred-parameter register additions. |
| [`DB2_COMPLETION_REPORT.md`](./DB2_COMPLETION_REPORT.md) | DB2 evidence, validation, verdict. |

DB2 ADRs (in `docs/adr/database/`):
[ADR-DB2-001 Customer Identity](../adr/database/ADR-DB2-001-CUSTOMER-IDENTITY-MODEL.md) ·
[ADR-DB2-002 Shipping Address](../adr/database/ADR-DB2-002-SHIPPING-ADDRESS-MODEL.md) ·
[ADR-DB2-003 Notification Persistence](../adr/database/ADR-DB2-003-NOTIFICATION-PERSISTENCE.md)

### DB3 document set

| File | Contents |
| ---- | -------- |
| [`DB3_LIFECYCLE_SPECIFICATIONS.md`](./DB3_LIFECYCLE_SPECIFICATIONS.md) | Master: final states, TR-* transition matrices, guards/effects per lifecycle. |
| [`DB3_STATE_DIAGRAMS.md`](./DB3_STATE_DIAGRAMS.md) | 19 Mermaid state diagrams. |
| [`DB3_CORE_WORKFLOW_ORCHESTRATION.md`](./DB3_CORE_WORKFLOW_ORCHESTRATION.md) | Phases 1–7 end-to-end orchestration. |
| [`DB3_INVARIANT_ENFORCEMENT_PLAN.md`](./DB3_INVARIANT_ENFORCEMENT_PLAN.md) | 35/35 invariants → DB/TX/APP/EXT/PROC layers. |
| [`DB3_TRANSITION_GUARD_CATALOG.md`](./DB3_TRANSITION_GUARD_CATALOG.md) | GRD-001..030. |
| [`DB3_SIDE_EFFECT_OUTBOX_CATALOG.md`](./DB3_SIDE_EFFECT_OUTBOX_CATALOG.md) | SE-001..020 (in-tx vs after-commit). |
| [`DB3_IDEMPOTENCY_SPECIFICATION.md`](./DB3_IDEMPOTENCY_SPECIFICATION.md) | Namespaces, keys, fingerprints, TTL classes. |
| [`DB3_CONCURRENCY_SPECIFICATION.md`](./DB3_CONCURRENCY_SPECIFICATION.md) | CC-01..28 races + strategies. |
| [`DB3_CANCELLATION_COMPENSATION_SPEC.md`](./DB3_CANCELLATION_COMPENSATION_SPEC.md) | Saga per stage S1–S9. |
| [`DB3_SHIPPING_FEE_AND_FREEZE_SPEC.md`](./DB3_SHIPPING_FEE_AND_FREEZE_SPEC.md) | Fee lifecycle + dispatch freeze. |
| [`DB3_AGREEMENT_ACCEPTANCE_SPEC.md`](./DB3_AGREEMENT_ACCEPTANCE_SPEC.md) | GRD-008 terms guard + evidence. |
| [`DB3_CUSTOMER_VERIFICATION_MERGE_SPEC.md`](./DB3_CUSTOMER_VERIFICATION_MERGE_SPEC.md) | Challenges, link rules, admin merge. |
| [`DB3_NOTIFICATION_LIFECYCLE_SPEC.md`](./DB3_NOTIFICATION_LIFECYCLE_SPEC.md) | Intent/attempt machines. |
| [`DB3_DERIVED_STATE_CATALOG.md`](./DB3_DERIVED_STATE_CATALOG.md) | Authoritative vs projection. |
| [`DB3_AUDIT_SPECIFICATION.md`](./DB3_AUDIT_SPECIFICATION.md) | Audit actions, reasons, redaction. |
| [`DB3_DB4_HANDOFF.md`](./DB3_DB4_HANDOFF.md) | Final state sets + constraint candidates. |
| [`DB3_TEST_HANDOFF.md`](./DB3_TEST_HANDOFF.md) | D7-01..15, D8-01..25. |
| [`DB3_COMPLETENESS_MATRIX.md`](./DB3_COMPLETENESS_MATRIX.md) | Full coverage; 0 unresolved. |
| [`DB3_COMPLETION_REPORT.md`](./DB3_COMPLETION_REPORT.md) | Evidence, validation, verdict. |

DB3 ADRs:
[ADR-DB3-001 Approval/Quotation Ordering](../adr/database/ADR-DB3-001-APPROVAL-QUOTATION-ORDERING.md) ·
[ADR-DB3-002 Cancellation/Refund](../adr/database/ADR-DB3-002-CANCELLATION-REFUND-POLICY.md) ·
[ADR-DB3-003 Post-Approval Revision](../adr/database/ADR-DB3-003-POST-APPROVAL-PRODUCTION-REVISION.md) ·
[ADR-DB3-004 Secure Grant & Re-verification](../adr/database/ADR-DB3-004-SECURE-GRANT-AND-REVERIFICATION.md)

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
