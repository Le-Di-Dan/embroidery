# DB1 — Implementation Handoff

**Date:** 2026-07-15 · **Git HEAD:** `563d9863c5d9591095038a28887e217058d816e4`
**Purpose:** Transfer the locked DB1 decisions to their consuming checkpoints.
This file implements nothing and contains no DB2 work. ADR links:
[`../adr/database/`](../adr/database/); statuses in
[`DB1_DECISION_MATRIX.md`](./DB1_DECISION_MATRIX.md).

---

## 1. Decisions DB2 (conceptual model) must obey

- Aggregates are placed within the module set of `SYSTEM_ARCHITECTURE §8`;
  every concept gets exactly one owning module (ADR-DB1-005 rule 1,
  ADR-DB1-009 rules 1–8).
- Immutability data classes vocabulary (immutable snapshot / append-only /
  mutable header + immutable versions / mutable) is assigned per concept
  (ADR-DB1-010).
- Deletion semantics per data category and retention classes are assigned
  per concept, incl. legal-hold placement (ADR-DB1-011).
- ID category (business UUIDv7 / append-only bigint / human code) per
  concept (ADR-DB1-007).
- Design document = opaque versioned payload owned by
  `packages/design-document`; DB2 must not model document internals
  (ADR-DB1-012).
- Idempotency record and outbox are cross-cutting concepts with a designated
  owning module (ADR-DB1-005 rule 5, ADR-DB1-017).
- Soft hold and official reservation are distinct concepts; creation gate =
  approval + verified deposit (ADR-DB1-018).
- B2/NB decisions DB2 must keep open (do not resolve): DEC-21 customer
  identity model, DEC-24 shipping address model, DEC-25 notification
  persistence depth; model provider-agnostically for DEC-27/28/29/30.

## 2. Decisions DB3 (lifecycles/invariants) must obey

- Status representation is text+CHECK; DB3 finalizes **names** (GAP-01) but
  not representation (ADR-DB1-008).
- Transition legality enforcement = application/transactional guards (+
  triggers per ADR-DB1-010), never CHECK constraints on transitions.
- Per-table immutability class mapping + correction patterns
  (supersede/void/correction record) are DB3 deliverables (ADR-DB1-010).
- Retention class bindings + start events per lifecycle; **durations** are
  the business parameters DB3 must get locked and recorded in the Decision
  Log (O-008, O-012) (ADR-DB1-011).
- Reservation lifecycle: explicit `expires_at`, idempotent
  release/consume/expire, no negative stock, audited overrides;
  insufficient-stock behavior is DB3's to define (ADR-DB1-018).
- Idempotency TTL classes bound per operation namespace (ADR-DB1-017).
- Explicit-transaction list and isolation/locking requirements per use case
  (ADR-DB1-009 rule 11).
- B3 decisions remain open for DB3: DEC-16 (approval vs quotation ordering,
  GAP-03), DEC-22 (cancellation/refund), DEC-23 (production revision),
  DEC-26 (secure-link expiry).

## 3. Decisions DB4 (logical schema) must obey

- Naming conventions incl. constraint/index/trigger patterns (ADR-DB1-006).
- Single `public` schema; table→module ownership map is a DB4 deliverable
  (ADR-DB1-005).
- Money: `numeric` only; precision/scale + currency design at DB4
  (ADR-DB1-006, REQ-INT-001); timestamps `timestamptz` UTC `_at`.
- ID column types per category (ADR-DB1-007); status columns text+CHECK
  (ADR-DB1-008).
- Immutable/append-only tables enumerated with their trigger plan and
  column-scoped exceptions (ADR-DB1-010).
- Design-version rows: `jsonb` payload + `document_schema_version` +
  `document_hash`/`preview_hash` (`sha256:<hex>`) (ADR-DB1-012).
- Idempotency record shape (namespace, scope key, fingerprint, state,
  result, expiry) (ADR-DB1-017); reservation `expires_at` columns
  (ADR-DB1-018); soft-delete/archive/tombstone columns per category
  (ADR-DB1-011).

## 4. Decisions DB6 (physical schema & migration foundation) must implement

- Install Drizzle ORM + drizzle-kit (exact versions pinned) + **spike
  report**: `.for('update')`/`skipLocked` SQL output, migration history
  table behavior/naming config, multi-file schema aggregation (ADR-DB1-002).
- Migration foundation: single ordered SQL history under the API app;
  commands for generate/migrate/verify/reset/seed; immutability + naming
  rules (ADR-DB1-003, ADR-DB1-006).
- Schema-verification command per ADR-DB1-004 (files ↔ applied hashes; four
  outcome rules) + dev-startup check + ops metadata surface (git commit +
  latest migration).
- Keep PostgreSQL pin; verify/record initdb settings (UTF8/C/UTC); startup
  config validation (ADR-DB1-001).
- UUIDv7 library + ID module + branded types wiring (ADR-DB1-007).
- Reject-mutation triggers for tables DB4 marks immutable/append-only
  (`--custom` migrations) (ADR-DB1-010).
- Transaction port (isolation options, savepoints) + module boundary lint
  rules (ADR-DB1-009).
- Backup manifest data availability (applied-migration list, versions)
  (ADR-DB1-014).
- Optional hardening decision point: privilege-separation roles
  (ADR-DB1-010 deferred item).

## 5. Decisions DB7 (constraint tests) must test

- Fresh-install + upgrade-from-prior-version migration runs (INV-28/29).
- Every immutable/append-only table rejects UPDATE/DELETE at DB level
  (generic iteration test) (ADR-DB1-010).
- Status CHECK sets ≡ TS constant sets via introspection (ADR-DB1-008).
- Naming-pattern introspection assertions (ADR-DB1-006).
- Partial unique index behavior (single active review version, INV-16).
- Money/`numeric` and FK integrity constraints (INV-11/25).
- Canonicalization golden-hash vectors reproduce across machines/CI
  (ADR-DB1-012, INV-32).
- Test harness per ADR-DB1-016 (template DB per worker, name guard).

## 6. Decisions DB8 (transaction/concurrency tests) must test

- Payment callback idempotency: duplicate, concurrent, out-of-order,
  fingerprint-conflict cases (ADR-DB1-017, INV-07/19).
- Inventory: concurrent reserve/release/consume/expire races; negative-stock
  defense; idempotent re-application (ADR-DB1-018, INV-18).
- Approval snapshot transactional creation; approved-version mutation races
  (ADR-DB1-010, INV-01/16/17).
- Quotation version creation transactionality (INV-02).
- Outbox claim/dispatch under parallel relays (`FOR UPDATE SKIP LOCKED`
  pattern) (ADR-DB1-002/009, INV-23).
- Row locking + isolation levels behave as relied upon (closes the
  ADR-DB1-002 locking spike loop).

## 7. Decisions DB9 (seed & fixtures) must implement

- Three seed tiers with environment guards; idempotent upsert; deterministic
  IDs + explicit ordering; no secrets; reset command separation
  (ADR-DB1-015).
- Cross-machine identical-baseline evidence (PR-06).
- Cleanup-job fixtures for retention/idempotency/reservation sweeps
  (ADR-DB1-011/017/018).

## 8. Decisions DB10 (acceptance audit) must audit

- Runbooks RB-01..RB-10 consistent with: forward-only policy + failed-
  migration 9-step framework (ADR-DB1-003), volume/branch procedures
  (ADR-DB1-013), backup/restore contract incl. manifest gating + verified
  restore + DB-before-assets order (ADR-DB1-014).
- Backup schedule, off-site target (needs O-007 topology), restore-test
  cadence, backup-retention ≥ protected classes.
- Retention durations configured (or explicit business waiver) + audited
  cleanup (ADR-DB1-011).
- PostgreSQL version currency + parity; break-glass immutability procedure;
  privilege-hardening disposition (ADR-DB1-001/010).
- Git↔schema traceability end-to-end (ADR-DB1-004).

## 9. Remaining deferred parameters (register)

| # | Parameter | From ADR | Owner | Acceptance condition |
| - | --------- | -------- | ----- | -------------------- |
| 1 | Retention durations per class (O-008, O-012) | ADR-DB1-011 | DB3 + business (Decision Log) | every class configured or explicitly waived; cleanup audited |
| 2 | Delete-vs-anonymize bindings + legal-hold modeling | ADR-DB1-011 | DB2/DB4 | every table has a bound semantic |
| 3 | Reservation TTLs + insufficient-stock behavior | ADR-DB1-018 | DB3 + business | configured, audited; DB8 race tests pass |
| 4 | Idempotency TTL classes per namespace; result shapes; stuck-IN_PROGRESS timeout | ADR-DB1-017 | DB3/DB4 | namespace→class map complete before each operation ships |
| 5 | Design-document JSON schema, validation, JCS implementation, doc-migration mechanics | ADR-DB1-012 | DB2/DB4 + package checkpoint | JCS+SHA-256 with RFC test vectors; DB7 golden hashes |
| 6 | Per-table immutability class map + column-scoped exceptions | ADR-DB1-010 | DB3/DB4 | every table classed; triggers + DB7 tests |
| 7 | Privilege-separation role model (hardening) | ADR-DB1-010 | DB6/DB10 | explicit adopt-or-defer decision recorded |
| 8 | Money precision/scale + currency design | ADR-DB1-006 | DB4 | numeric-only respected |
| 9 | Human-readable code formats | ADR-DB1-007 | DB3/DB4 | formats configured, non-authz |
| 10 | Backup cadence, off-site target (O-007), restore-test cadence | ADR-DB1-014 | DB10 + operations | production go-live blocker if unset |
| 11 | Exact tooling paths/commands (migrations dir, scripts, driver, UUIDv7 lib) | ADR-DB1-002/003/013 | DB6 | spike report + working commands |
| 12 | Test runner/framework (O-001 remainder) | ADR-DB1-016 | testing-stack ADR (outside DB scope) | chosen before DB7 harness build |

None of these blocks DB2: they are parameters/details inside locked
architecture, each with an owner and acceptance condition.

## 10. Still-open B2/B3/NB decisions (untouched by DB1, confirmed compatible)

DEC-16, DEC-21, DEC-22, DEC-23, DEC-24, DEC-25, DEC-26 (B2/B3) and
DEC-27..DEC-30 (NB) remain open at their DB0-assigned checkpoints. DB1
decisions keep all of them supportable (provider-agnostic modeling, abstract
ports, generic payment/verification records).
