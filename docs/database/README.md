# Database Phase — Overview

**Phase:** Database Architecture & Persistence Foundation
**Current checkpoint:** DB5 — Query, Access Path & Index Design — **COMPLETED** (`DB5 PASS WITH DEFERRED MEASURED TUNING`, 2026-07-18)
**DB0:** COMPLETED (`563d986`) · **DB1:** COMPLETED (`a0e29b4` + correction `f90f78c`) · **DB2:** COMPLETED (`0563866`) · **DB3:** COMPLETED (`a79f523`) · **DB4:** COMPLETED (`456e101`)
**DB5 audited Git HEAD:** `456e1014fd1543a7efcf3ebe1860e62f2d0e1111` (branch `production`)
**Next allowed checkpoint:** DB6 — Physical Schema & Migration Foundation (only now that DB5 has passed)
**Status of this document set:** discovery (DB0) + persistence ADRs (DB1) + conceptual domain model (DB2) + lifecycle/invariant specifications (DB3) + logical relational schema (DB4) + query/access-path/index architecture (DB5 — logical index definitions as documentation). **No migration, no ORM install, no physical table/constraint/index/trigger has been created.** That rule holds until DB6; DB5 remained documentation-only.

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

### DB4 document set

| File | Contents |
| ---- | -------- |
| [`DB4_TABLE_CATALOG.md`](./DB4_TABLE_CATALOG.md) | 78 logical tables (TBL-001..078): owner, row meaning, category, PK, mutability, retention. |
| [`DB4_COLUMN_DICTIONARY.md`](./DB4_COLUMN_DICTIONARY.md) | Per-table columns (COL-*): type family, nullability, mutability, sensitivity, references. |
| [`DB4_KEYS_AND_CONSTRAINTS.md`](./DB4_KEYS_AND_CONSTRAINTS.md) | CST-*: PK/unique/partial-unique/check/immutability/append-only/TX-only rules. |
| [`DB4_RELATIONSHIP_AND_FK_MODEL.md`](./DB4_RELATIONSHIP_AND_FK_MODEL.md) | REL-*: cardinality, FK direction, on-delete, cross-context legality. |
| `DB4_SCHEMA_*.md` (×7) | Context schema docs: identity/customer, catalog/inventory/asset, design/ordering, quotation/payment, production/shipping, content/gallery/agreement, notification/audit/platform. |
| [`DB4_STATE_AND_TRANSITION_STORAGE.md`](./DB4_STATE_AND_TRANSITION_STORAGE.md) | 29 lifecycles → authoritative state columns + history tiers. |
| [`DB4_SNAPSHOT_AND_VERSIONING_MODEL.md`](./DB4_SNAPSHOT_AND_VERSIONING_MODEL.md) | Header/version and immutable-snapshot patterns. |
| [`DB4_MONEY_QUANTITY_MEASUREMENT_MODEL.md`](./DB4_MONEY_QUANTITY_MEASUREMENT_MODEL.md) | Money/percent/quantity/dimensions; **GAP-10 stitch count closed**. |
| [`DB4_JSONB_PAYLOAD_MAP.md`](./DB4_JSONB_PAYLOAD_MAP.md) | Closed allowed JSONB set (9 columns) per ADR-DB4-004. |
| [`DB4_DELETE_ARCHIVE_RETENTION_MAPPING.md`](./DB4_DELETE_ARCHIVE_RETENTION_MAPPING.md) | Per-table delete category + retention class (durations deferred). |
| [`DB4_LOGICAL_RELATIONAL_DIAGRAMS.md`](./DB4_LOGICAL_RELATIONAL_DIAGRAMS.md) | 7 Mermaid ER diagrams. |
| [`DB4_INVARIANT_SCHEMA_TRACEABILITY.md`](./DB4_INVARIANT_SCHEMA_TRACEABILITY.md) | 35/35 invariants → structures/constraints/tests. |
| [`DB4_GUARD_SCHEMA_TRACEABILITY.md`](./DB4_GUARD_SCHEMA_TRACEABILITY.md) | 30/30 guards → supplying tables/columns + locks. |
| [`DB4_DB5_HANDOFF.md`](./DB4_DB5_HANDOFF.md) | Q-01..33 + 11 operational access paths (no index design). |
| [`DB4_DB6_HANDOFF.md`](./DB4_DB6_HANDOFF.md) | Dependency-ordered groups G1–G19, constraint order, raw-SQL/trigger/spike list. |
| [`DB4_TEST_HANDOFF.md`](./DB4_TEST_HANDOFF.md) | D7/D8 tests mapped to DB4 structures. |
| [`DB4_COMPLETENESS_MATRIX.md`](./DB4_COMPLETENESS_MATRIX.md) | 75 concepts / 23 aggregates / 29 lifecycles / 35 INV / 30 GRD / queries / races — 0 unresolved. |
| [`DB4_COMPLETION_REPORT.md`](./DB4_COMPLETION_REPORT.md) | Evidence, validation, verdict. |

DB4 ADRs:
[ADR-DB4-001 Money Representation](../adr/database/ADR-DB4-001-MONEY-REPRESENTATION.md) ·
[ADR-DB4-002 Transition-History Storage](../adr/database/ADR-DB4-002-TRANSITION-HISTORY-STORAGE.md) ·
[ADR-DB4-003 Asset Association Model](../adr/database/ADR-DB4-003-ASSET-ASSOCIATION-MODEL.md) ·
[ADR-DB4-004 JSONB Boundaries](../adr/database/ADR-DB4-004-JSONB-BOUNDARIES.md)

### DB5 document set

| File | Contents |
| ---- | -------- |
| [`DB5_QUERY_SHAPE_CATALOG.md`](./DB5_QUERY_SHAPE_CATALOG.md) | Q-01..Q-33, QX-01..QX-11 and 30 retained paths: actor, scope, joins, predicates, sort, pagination, locking, indexes. |
| [`DB5_ACCESS_PATH_MATRIX.md`](./DB5_ACCESS_PATH_MATRIX.md) | One row per query: entry table, join order, filter/sort `COL-*`, selectivity, index, fallback, EXPLAIN scenario. |
| [`DB5_INDEX_CATALOG.md`](./DB5_INDEX_CATALOG.md) | 134 logical indexes (`IDX-001`..`IDX-138`) + 15 recorded rejections; composite-order rules. |
| [`DB5_CONSTRAINT_INDEX_MAP.md`](./DB5_CONSTRAINT_INDEX_MAP.md) | Every `CST-*` with an index consequence; zero duplicates. |
| [`DB5_FK_INDEX_REVIEW.md`](./DB5_FK_INDEX_REVIEW.md) | All 105 `REL-*` reviewed individually; no mechanical FK indexing. |
| [`DB5_INDEXES_IDENTITY_CUSTOMER.md`](./DB5_INDEXES_IDENTITY_CUSTOMER.md) | Admin/session, contacts, challenges, grants, merge. |
| [`DB5_INDEXES_CATALOG_GALLERY_CONTENT.md`](./DB5_INDEXES_CATALOG_GALLERY_CONTENT.md) | Public listings, slug lookup, publication ordering, effective agreement. |
| [`DB5_INDEXES_INVENTORY_ASSET.md`](./DB5_INDEXES_INVENTORY_ASSET.md) | Stock lock anchor, holds/reservations, ledger, asset queues, signed access. |
| [`DB5_INDEXES_DESIGN_ORDERING.md`](./DB5_INDEXES_DESIGN_ORDERING.md) | Sessions, versions, single-active-review, requests, orders, saga, freeze. |
| [`DB5_INDEXES_QUOTATION_PAYMENT.md`](./DB5_INDEXES_QUOTATION_PAYMENT.md) | Quotation versions/expiry, obligations, attempts, provider events, refunds. |
| [`DB5_INDEXES_PRODUCTION_SHIPPING.md`](./DB5_INDEXES_PRODUCTION_SHIPPING.md) | Production queue, approval linkage, rework, dispatch freeze. |
| [`DB5_INDEXES_NOTIFICATION_AUDIT_PLATFORM.md`](./DB5_INDEXES_NOTIFICATION_AUDIT_PLATFORM.md) | Outbox claim, notification retry, audit, idempotency, dead-letter, config. |
| [`DB5_ARCHIVE_RETENTION_INDEXING.md`](./DB5_ARCHIVE_RETENTION_INDEXING.md) | Archive vs cleanup patterns; 11 indexed scans; no hard-coded durations. |
| [`DB5_JSONB_INDEX_REVIEW.md`](./DB5_JSONB_INDEX_REVIEW.md) | All 9 JSONB columns reviewed → no index; escalation ladder. |
| [`DB5_ADMIN_DASHBOARD_ACCESS_PATHS.md`](./DB5_ADMIN_DASHBOARD_ACCESS_PATHS.md) | Q-22 decomposed into 12 buckets adding zero indexes. |
| [`DB5_PAGINATION_ORDERING_MATRIX.md`](./DB5_PAGINATION_ORDERING_MATRIX.md) | Per-query pagination class, sort keys, tie-breakers, cursors, null order. |
| [`DB5_SECURITY_SCOPE_REVIEW.md`](./DB5_SECURITY_SCOPE_REVIEW.md) | Owner/grant predicates, token lookups, IDOR risk, PII search restrictions. |
| [`DB5_LOCKING_ACCESS_PATHS.md`](./DB5_LOCKING_ACCESS_PATHS.md) | CC-01..CC-28: lock anchors, lookup indexes, lock order, deadlock risk. |
| [`DB5_EXPLAIN_VALIDATION_PLAN.md`](./DB5_EXPLAIN_VALIDATION_PLAN.md) | 43 EXPLAIN + 7 locking scenarios; datasets D-A..D-G; failure criteria. |
| [`DB5_INDEX_COST_REDUNDANCY_REPORT.md`](./DB5_INDEX_COST_REDUNDANCY_REPORT.md) | Per-table census, write amplification, overlaps, budget exceptions, bloat. |
| [`DB5_INDEX_NAMING_AND_HANDOFF.md`](./DB5_INDEX_NAMING_AND_HANDOFF.md) | `IDX-*` → physical names, all within the 63-byte limit. |
| [`DB5_SCHEMA_CHANGE_REQUESTS.md`](./DB5_SCHEMA_CHANGE_REQUESTS.md) | Zero requests; four observations resolved without schema change. |
| [`DB5_DB6_HANDOFF.md`](./DB5_DB6_HANDOFF.md) | Implementation order, raw-SQL needs, spikes, definition of done. |
| [`DB5_TEST_AND_OPERATIONS_HANDOFF.md`](./DB5_TEST_AND_OPERATIONS_HANDOFF.md) | DB7/DB8/DB9/DB10 assertions, seed distribution, governance. |
| [`DB5_COMPLETENESS_MATRIX.md`](./DB5_COMPLETENESS_MATRIX.md) | Full coverage trace; 0 unresolved critical items; deferred register. |
| [`DB5_COMPLETION_REPORT.md`](./DB5_COMPLETION_REPORT.md) | Evidence, validation, verdict. |

DB5 ADRs:
[ADR-DB5-001 Pagination Strategy](../adr/database/ADR-DB5-001-PAGINATION-STRATEGY.md) ·
[ADR-DB5-002 Text Search, Collation & Indexing](../adr/database/ADR-DB5-002-TEXT-SEARCH-COLLATION-INDEXING.md) ·
[ADR-DB5-003 Worker Claim Indexing](../adr/database/ADR-DB5-003-WORKER-CLAIM-INDEXING.md) ·
[ADR-DB5-004 Index Governance](../adr/database/ADR-DB5-004-INDEX-GOVERNANCE.md)

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
