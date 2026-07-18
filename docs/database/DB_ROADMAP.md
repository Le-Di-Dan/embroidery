# Database Roadmap — DB0 to DB10

**Status:** Locked sequence (order not to be changed without a documented blocker)
**Audit date:** 2026-07-15
**Audited Git HEAD:** `223e4db`
**Scope note:** This roadmap is planning documentation. It does not create schema.

---

## 1. Principles

- Checkpoints run in order. No checkpoint pulls work forward from a later one.
- Each checkpoint has a single coherent goal, concrete deliverables, and an
  explicit exit gate that must be met before the next begins.
- Consequential technology choices are locked only by ADR (see
  [`DB0_OPEN_DECISIONS.md`](./DB0_OPEN_DECISIONS.md)).
- Multi-machine portability, schema versioning, and recovery are first-class
  concerns integrated across the roadmap, not an afterthought.

## 2. Checkpoint definitions

### DB0 — Database Discovery & Requirement-to-Data Matrix

- **Goal:** Audit locked documents; produce a verifiable requirement-to-data
  map, domain coverage, lifecycle/invariant/query inventories, portability &
  recovery requirements, open-decision register, and conflict/gap analysis.
- **Deliverables:** All files under `docs/database/` listed in the README.
- **Multi-machine:** Discover and record portability/versioning/backup/recovery
  requirements; do not implement them.
- **Exit gate:** Section 9 of the DB0 task; see
  [`DB0_COMPLETION_REPORT.md`](./DB0_COMPLETION_REPORT.md). No schema/migration
  created.

> **Status update (2026-07-15, HEAD `563d986`):** **DB0 — COMPLETED**
> (`DB0 PASS WITH OPEN DECISIONS`, committed `563d986`). **DB1 — COMPLETED**
> (`DB1 PASS WITH DEFERRED PARAMETERS`): all 19 B1 decisions resolved by the
> 18 ADRs under [`../adr/database/`](../adr/database/) — see
> [`DB1_DECISION_MATRIX.md`](./DB1_DECISION_MATRIX.md),
> [`DB1_IMPLEMENTATION_HANDOFF.md`](./DB1_IMPLEMENTATION_HANDOFF.md),
> [`DB1_COMPLETION_REPORT.md`](./DB1_COMPLETION_REPORT.md). Deferred detail
> ownership is registered in the handoff §9 (business durations → DB3;
> tooling wiring → DB6; runbooks → DB10). Next checkpoint: **DB2**.
> The DB0–DB10 order below remains locked and unchanged.
>
> **DB1-C1 correction (2026-07-15):** evidence/policy correction applied
> after `a0e29b4` (PostgreSQL patch governance — 16.x baseline 16.14; ORM
> evidence refresh; collation scoping). Verdict unchanged. See
> [`DB1_CORRECTION_REPORT.md`](./DB1_CORRECTION_REPORT.md).
>
> **DB2 status (2026-07-15, HEAD `f90f78c`): COMPLETED** —
> `DB2 PASS WITH DEFERRED PARAMETERS`. 15 bounded contexts, 23 aggregates,
> 75 canonical concepts, one owner each; B2 decisions resolved
> (ADR-DB2-001/002/003); DB2-owned gaps resolved (GAP-05/06/08/09-DB2/11).
> Deliverables: `DB2_*` documents + [`DB2_COMPLETION_REPORT.md`](./DB2_COMPLETION_REPORT.md);
> DB3/DB4 handoff in [`DB2_IMPLEMENTATION_HANDOFF.md`](./DB2_IMPLEMENTATION_HANDOFF.md).
> Next checkpoint: **DB3**. Locked DB0–DB10 order unchanged.
>
> **DB3 status (2026-07-15, HEAD `0563866`): COMPLETED** —
> `DB3 PASS WITH DEFERRED PARAMETERS`. Final state names locked (GAP-01);
> B3 decisions resolved (ADR-DB3-001..004: acceptance→digitizing ordering,
> cancellation stage matrix S1–S9, hold-and-supersede revision, grant/step-up
> policy); 35/35 invariants mapped; GRD-001..030, SE-001..020, CC-01..28,
> D7/D8 test handoffs. Deliverables: `DB3_*` documents +
> [`DB3_COMPLETION_REPORT.md`](./DB3_COMPLETION_REPORT.md). Deferred = config
> values only (TTL/retention/retry/provider mappings), owners registered.
> Next checkpoint: **DB4**. Locked DB0–DB10 order unchanged.
>
> **DB4 status (2026-07-15, HEAD `a79f523`): COMPLETED** —
> `DB4 PASS WITH DEFERRED PHYSICAL MECHANISMS`. Logical relational schema:
> 78 tables across 15 contexts (catalog + column dictionary + keys/
> constraints + relationship/FK model + 7 context schema docs); DB4-owned
> decisions locked (ADR-DB4-001 money numeric(14,2)+currency, ADR-DB4-002
> hybrid transition history, ADR-DB4-003 asset associations, ADR-DB4-004
> JSONB closed set); GAP-10 resolved (stitch count = admin-entered
> quotation input). 75 concepts / 23 aggregates / 29 lifecycles / 35
> invariants / 30 guards / 33+11 queries / 28 races mapped with 0
> unresolved rows. Deferred = trigger/partial-unique/exclusion DDL + lock
> spikes (DB6), index design (DB5), config values (business/CON-144).
> Deliverables: `DB4_*` documents + [`DB4_COMPLETION_REPORT.md`](./DB4_COMPLETION_REPORT.md).
> Next checkpoint: **DB5**. Locked DB0–DB10 order unchanged.

### DB1 — Persistence ADR

- **Goal:** Lock consequential persistence decisions via ADR(s): ORM, migration
  framework, PostgreSQL version, UUID/ID strategy, naming conventions, enum
  strategy, schema organization, money representation, immutability enforcement
  approach, **and** the migration/versioning/backup strategy for multi-machine
  development.
- **Deliverables:** One or more ADRs under `docs/adr/`; updates to the open
  decision register marking resolved items.
- **Multi-machine:** Lock migration history location, forward-only vs rollback
  policy, immutable-shared-migration policy, backup format/tooling direction,
  and Docker volume/versioning strategy.
- **Exit gate:** Every DB1-blocking open decision (see
  [`DB0_OPEN_DECISIONS.md`](./DB0_OPEN_DECISIONS.md)) is resolved by an approved
  ADR. No schema created yet.

### DB2 — Conceptual Domain Model

- **Goal:** Define aggregates, entities, relationships, and ownership per
  bounded context; no physical types.
- **Deliverables:** Conceptual model document + aggregate ownership map.
- **Exit gate:** Every candidate concept in the requirement matrix is placed in
  exactly one owning aggregate/module; cross-aggregate references identified.

### DB3 — Lifecycle & Invariant Specification

- **Goal:** Formalize state machines and invariants from
  [`DB0_LIFECYCLE_INVENTORY.md`](./DB0_LIFECYCLE_INVENTORY.md) and
  [`DB0_INVARIANT_INVENTORY.md`](./DB0_INVARIANT_INVENTORY.md).
- **Deliverables:** State-transition specs; invariant enforcement plan
  (DB-level vs transactional vs application-level).
- **Exit gate:** Every lifecycle has complete states, transitions, guards, side
  effects, and audit requirements; every invariant has an assigned enforcement
  mechanism.

### DB4 — Logical Relational Schema

- **Goal:** Tables, columns, keys, relationships, nullability, uniqueness,
  reference-integrity — logical, not migration files.
- **Deliverables:** Logical schema document.
- **Exit gate:** Every aggregate and invariant maps to concrete relational
  structures; immutability/append-only/snapshot semantics represented.

### DB5 — Query & Index Design

- **Goal:** Design access paths and indexes from
  [`DB0_QUERY_CATALOG.md`](./DB0_QUERY_CATALOG.md).
- **Deliverables:** Query/index design document.
- **Exit gate:** Every cataloged query has a supporting access path; consistency
  and security scope documented.

> **DB5 status (2026-07-18, HEAD `456e101`): COMPLETED** —
> `DB5 PASS WITH DEFERRED MEASURED TUNING`. 74 access paths covered (33
> catalogued + 11 operational + 30 retained); **134 logical indexes**
> (`IDX-001`..`IDX-138`: 64 integrity-backed, 70 performance) plus 15 recorded
> rejections; 0 duplicate indexes; 0 JSONB indexes; **0 extensions required**;
> 28/28 concurrency scenarios given a lock anchor and index; **0 blocking
> schema change requests** and the DB4 logical schema unmodified. B5 decisions
> resolved by ADR-DB5-001..004 (pagination, text/collation, worker claim,
> index governance). Deliverables: `DB5_*` documents +
> [`DB5_COMPLETION_REPORT.md`](./DB5_COMPLETION_REPORT.md); implementation
> handoff in [`DB5_DB6_HANDOFF.md`](./DB5_DB6_HANDOFF.md), verification in
> [`DB5_TEST_AND_OPERATIONS_HANDOFF.md`](./DB5_TEST_AND_OPERATIONS_HANDOFF.md).
> Deferred (all with owner + acceptance condition): row-lock emission syntax
> and partial-predicate verification (DB6 spikes), configuration values (DB6),
> measured INCLUDE columns and unused-index removal (DB9/DB10), latency
> budgets and autovacuum tuning (DB10). Next checkpoint: **DB6**. Locked
> DB0–DB10 order unchanged.

### DB6 — Physical Schema & Migration Foundation

- **Goal:** First real migrations and a reproducible Docker database setup.
- **Deliverables:** Migration foundation (framework chosen in DB1), initial
  migration(s), migration history table, Docker init workflow, `.env.example`
  database entries verified.
- **Multi-machine:** Fresh-install runs all migrations in order; migration
  history maps to Git state; immutable-shared-migration policy enforced.
- **Exit gate:** A clean clone + Docker + migrate produces the expected schema
  version deterministically.

### DB7 — Database Constraint Tests

- **Goal:** Verify constraints and migrations.
- **Deliverables:** Constraint/migration tests (testing stack per ADR).
- **Multi-machine:** Migration up-from-empty and upgrade-from-prior-version are
  tested.
- **Exit gate:** Constraint and migration tests pass in CI-equivalent runs.

### DB8 — Transaction & Concurrency Tests

- **Goal:** Verify transactional and recovery-sensitive behavior.
- **Deliverables:** Concurrency/transaction tests: payment idempotency,
  inventory reservation, approval immutability, quotation versioning, outbox.
- **Exit gate:** Race, duplicate-callback, and out-of-order scenarios proven
  safe.

### DB9 — Seed & Fixture Design

- **Goal:** Deterministic, reproducible seed/fixture workflow.
- **Deliverables:** Seed definitions + fixture strategy; test vs dev separation.
- **Multi-machine:** Seeds are reproducible on any machine from Git state.
- **Exit gate:** Deterministic seed produces identical baseline data across
  machines.

### DB10 — Database Acceptance Audit

- **Goal:** Final audit of fresh setup, upgrade, backup/restore and new-machine
  recovery.
- **Deliverables:** Acceptance audit report; completed recovery runbooks (see
  [`DB0_PORTABILITY_RECOVERY_REQUIREMENTS.md`](./DB0_PORTABILITY_RECOVERY_REQUIREMENTS.md)).
- **Multi-machine:** New-machine bootstrap, fresh DB, upgrade, backup, restore,
  failed-migration recovery, and full reset are all audited end-to-end.
- **Exit gate:** All acceptance runbooks pass with executable evidence.

## 3. Multi-machine integration summary

| Concern | Discovered | Locked | Implemented | Audited |
| ------- | ---------- | ------ | ----------- | ------- |
| Portability/recovery requirements | DB0 | — | — | — |
| Migration/versioning/backup strategy | DB0 | **DB1** | DB6 | DB10 |
| Reproducible Docker DB setup | DB0 | DB1 | **DB6** | DB10 |
| Migration/constraint verification | — | — | DB6 | **DB7** |
| Concurrency & recovery-sensitive tx tests | — | — | — | **DB8** |
| Deterministic seed/fixture | DB0 | DB1 | — | **DB9** |
| Fresh setup / upgrade / backup+restore / new-machine recovery | DB0 | DB1 | DB6 | **DB10** |

## 4. Cross-references

- Open decisions and their target checkpoints: [`DB0_OPEN_DECISIONS.md`](./DB0_OPEN_DECISIONS.md)
- Conflicts/gaps and resolution owners: [`DB0_CONFLICTS_AND_GAPS.md`](./DB0_CONFLICTS_AND_GAPS.md)
