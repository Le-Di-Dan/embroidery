# DB2 — Implementation Handoff (DB3 / DB4)

**Date:** 2026-07-15 · **Git HEAD:** `f90f78c`
**Purpose:** transfer the conceptual model to DB3 (lifecycles/invariants) and
DB4 (logical schema). Contains no DB3/DB4 work itself.

## 1. Handoff to DB3 — Lifecycle & Invariant Specification

### Lifecycles to formalize (owners per completeness matrix §C)

All 23 LCs; final state names for LC-08/11/12/14/16 (GAP-01). Plus the DB2
additions: template publication states (AGG-12), agreement version states
(AGG-21), notification intent status (AGG-22), shipping freeze transition
(ADR-DB2-002 rule 5).

### Guards not yet decided (DB3 must decide; DB2 kept them open)

- GAP-03/DEC-16: quotation acceptance vs design approval ordering; what gates
  digitizing and order creation.
- GAP-04/O-009/DEC-22: cancellation/refund policy incl. deposit reuse on
  reopen (W7), saga compensation steps per stage.
- DEC-23: production rework/revision handling (new job vs amend).
- DEC-26/GAP-12: secure-link expiry/revocation; re-verification triggers.
- LC-05 precedence: computed availability vs manual out-of-stock override.
- Insufficient-stock behavior at official-reservation time (ADR-DB1-018).
- Review expiry; who may VOID a design version.
- Post-dispatch shipping correction pattern; fee-mismatch wording.
- Approval guard: which Agreement types must be accepted
  (`DB2_TERMS_VERSION_DECISION.md`).
- Customer merge mechanics + anonymization interplay with immutable contact
  snapshots (ADR-DB2-001 rules 8/10, snapshot model §6.5).

### B3 decisions confirmed still open (not resolved by DB2)

DEC-16, DEC-22, DEC-23, DEC-26 — model verified compatible with all options.

### Business parameters deferred (with DB1 register)

Retention durations (O-008/O-012), reservation/soft-hold TTLs, idempotency
TTL classes, notification operational retention, code formats — all bound to
CON-144 Business Policy Configuration; DB3 + business lock values (Decision
Log entry required).

### Aggregate-owned invariants & concurrency hotspots (DB8 targets)

Per completeness matrix §D and
[`DB2_TRANSACTION_BOUNDARY_CANDIDATES.md`](./DB2_TRANSACTION_BOUNDARY_CANDIDATES.md):
INV-16 single-active-review; INV-07 callback races; INV-18/05 reservation
races; INV-19 duplicate order/submission; outbox claim contention;
verified-contact link races.

### Cross-context orchestration points

W1–W7 in [`DB2_CROSS_CONTEXT_WORKFLOWS.md`](./DB2_CROSS_CONTEXT_WORKFLOWS.md);
cancellation is an event-orchestrated saga — DB3 defines compensation, not a
distributed transaction.

### Audit requirements

Every sensitive transition per `07 §12` mapped to owning aggregates
(INV-14); audit events reference actors (admin/customer/system) and never
replace domain history.

## 2. Handoff to DB4 — Logical Relational Schema

### Aggregate-to-relational mapping requirements

- One owner module per table (ownership matrix + package mapping = the
  ADR-DB1-005 ownership map input). Single `public` schema; naming per
  ADR-DB1-006.
- Aggregate boundaries above define transactional co-location; DB4 must not
  split an aggregate's invariant across module boundaries.

### Snapshot structures (immutable — trigger handoff per ADR-DB1-010)

Approval Snapshot; Quotation Version (+line items); Order Item; Shipping
Detail frozen form; Production Specification; Agreement Version; contact
snapshot VO embedding. Column-scoped mutable exception documented: outbox
dispatch status.

### Append-only structures

Inventory Ledger, Audit Event, Payment Callback/Reconciliation/Refund,
Order Transition Event, Review Decision, Moderation Note, Production Note,
Delivery Attempt, Verification Attempt, Job Attempt, Asset Inspection —
bigint identity per ADR-DB1-007.

### Reference relationships & candidate FK directions

Per [`DB2_RELATIONSHIP_MODEL.md`](./DB2_RELATIONSHIP_MODEL.md): all `ref`
rows are FK candidates (reference-only, no ownership transfer); all `snap`
rows are copied values, **not** FKs to live rows (except the ID reference
kept alongside for traceability, e.g. order→accepted quotation version).

### Candidate uniqueness needs (design at DB4/DB5)

- Single active review version per design case (partial unique — INV-16).
- One active verified link per contact point (ADR-DB2-001 rule 6).
- Idempotency (namespace, scope key) (ADR-DB1-017).
- Provider reference uniqueness for callback dedup (Q-16/28).
- Human codes (request/order/quotation) unique.
- Secure grant token uniqueness (hashed form — security design).
- One effective Agreement Version per agreement.
- One SKU Stock per SKU; reservation-per-order key.

### JSON document ownership

Design Document payloads (session working copy, version snapshot, template
content): opaque `jsonb` + `document_schema_version` + hash columns; type
owned by `packages/design-document` (ADR-DB1-012); no other JSONB "grab bag"
columns without DB4 justification.

### Non-negotiables restated for DB4

No binary in PostgreSQL (INV-10); no floating-point money (INV-11);
status = text + CHECK with TS constants (ADR-DB1-008); asset metadata boundary
(AST owns assets; consumers own associations); timestamps `timestamptz` UTC
(`_at`); IDs per ADR-DB1-007; retention/anonymization columns per
ADR-DB1-011 categories in the classification map.

## 3. Deferred-parameter register additions (extends DB1 handoff §9)

| # | Parameter | Source | Owner | Acceptance |
|---|---|---|---|---|
| 15 | Final state names incl. template/agreement/notification additions | GAP-01 + DB2 | DB3 | every lifecycle fully named + guarded |
| 16 | Customer merge mechanics + snapshot/anonymization privacy rule | ADR-DB2-001 | DB3 (+business privacy input) | documented merge + privacy rule; DB7 tests |
| 17 | Shipping post-dispatch correction + fee-mismatch wording | ADR-DB2-002 | DB3 | pattern documented; DB7 immutability test |
| 18 | Notification operational retention + template versioning mechanics | ADR-DB2-003 | DB3/DB4 + provider ADR | retention configured; no-secret assertion test |
| 19 | Agreement approval-guard (which types gate approval) | DB2 terms decision | DB3 | guard specified |
| 20 | Rich-text canonicalization for agreement content hash | DB2 terms decision | DB4/package | hash reproducible |
| 21 | Template publication workflow detail | DB2 template decision | DB3/admin CP | states + clone-independence test (DB7) |

## 4. Explicitly NOT in this handoff

No relational designs, no state-machine tables, no SQL, no index plans
(DB5), no lifecycle finalization — those are the receiving checkpoints' work.
