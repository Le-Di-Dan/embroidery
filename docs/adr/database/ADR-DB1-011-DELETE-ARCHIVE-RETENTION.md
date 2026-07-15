# ADR-DB1-011 — Delete, Archive and Retention Framework

- Status: Accepted with Deferred Parameters
- Date: 2026-07-15
- Git HEAD: `563d9863c5d9591095038a28887e217058d816e4`
- Decision IDs: DEC-10 (delete/archive — fully accepted), DEC-13 (retention
  framework accepted; durations deferred)
- Requirement IDs: REQ-RETEN-001, REQ-RETEN-002, REQ-SESS-001, REQ-SESS-005,
  REQ-ASSET-006, REQ-AUDIT-003, REQ-IDEM-002, REQ-OPS-003
- Invariant IDs: INV-12, INV-14, INV-24
- Gap IDs: —

## Context

Retention periods are open business decisions (O-008 session expiry, O-012
retention/privacy), but DB2–DB4 need to know **which deletion semantics each
data category uses** and DB1 must lock the framework so cleanup is designed
in, not bolted on.

## Decision Drivers

- Privacy: temporary sessions and PII must be deletable/anonymizable
  (`10 §12`, `09 §10`).
- Commerce/audit: approved designs, quotations, payments, ledger, audit are
  historical record — never casually deletable (INV-12/14).
- Small team: one uniform framework, worker-executed, auditable.

## Options Considered

- Global soft-delete flag on every table — cargo cult; wrong for immutable
  history (implies deletability) and for truly temporary data (leaves PII).
- Per-table ad hoc decisions — unreviewable drift.
- **Category framework + retention classes** (chosen).

## Decision

### Deletion semantics by data category (locked — DEC-10 Accepted)

| Category | Semantics |
| --- | --- |
| Catalog / product / gallery / content | **Archive state** (`archived_at` + publication status). Hard delete allowed only for rows never published/referenced. |
| Temporary design session (+ autosave snapshots) | **Hard delete** (or anonymize-then-delete) by scheduled cleanup after TTL (LC-07). Never a customer-visible library. |
| Customer PII (contact fields) | **Anonymization**, not row deletion, once rows are referenced by commercial history; field-level scrub with tombstone marker. Standalone unreferenced customers may be hard-deleted. |
| Submitted requests | Retained; terminal states (REJECTED/CANCELLED) are **states, not deletions**; PII inside follows the PII rule after its retention class expires. |
| Design versions | **Immutable retained history** (REQ-DVER-005) — no delete; VOID/SUPERSEDED are states. |
| Approval snapshots | **Immutable retained** — never deleted while their commercial record exists (ADR-DB1-010). |
| Quotations / orders | **Immutable versions + retained headers** — no hard delete; cancellation is a state. |
| Payments / refunds | **Immutable retained** (financial record). |
| Inventory ledger | **Append-only retained**; corrections are new entries. |
| Audit events | **Append-only retained** under the `audit` retention class (period open, O-012); deletion only via retention expiry job, never ad hoc. |
| Outbox / idempotency records | **TTL-based hard delete** after their operational retention class expires (processed/expired rows only). |
| Assets & derivatives | **Coordinated two-phase**: DB metadata row gets a deletion decision (tombstone with reason/timestamp) → worker deletes the binary in object storage → tombstone retained. DB metadata is never deleted before the binary. |
| Backup artifacts | Deleted only by the backup retention policy (ADR-DB1-014); deletion is logged. |

**Global rule:** approved-design, payment, ledger, and audit data can never
be deleted "administratively"; only a retention-class expiry (with legal-hold
check) or a superseding legal requirement may remove them, always via the
audited cleanup pipeline.

### Retention framework (locked — DEC-13 framework Accepted)

1. **Named retention classes** (stable identifiers; durations are
   parameters):
   - `transient` — design sessions, autosave, expired verification
     challenges, expired idempotency records, processed outbox rows.
   - `operational` — notification/delivery logs, inspection results,
     non-financial operational records.
   - `commercial-record` — requests, quotations, orders, payments,
     approval snapshots, design versions, ledger.
   - `audit` — audit events.
   - `backup` — backup artifacts (ADR-DB1-014).
2. **Policy owner:** retention durations are **business configuration** —
   versioned, auditable configuration values (BACKEND_CONVENTIONS §16/§20),
   never hard-coded in queries or jobs. The business locks the numbers
   (O-008/O-012) and the Decision Log records them; DB3 binds classes to
   lifecycles.
3. **Retention start event** is defined per class binding (e.g. session
   `last_activity_at`, request terminal-state timestamp, payment completion)
   — bound at DB3/DB4, stored as explicit timestamps (ADR-DB1-006 `_at`).
4. **Delete vs anonymize** is part of the class binding per category table
   above.
5. **Legal/business hold:** a hold flag concept (entity-level) blocks any
   cleanup for held records; modeling at DB2/DB4.
6. **Cleanup ownership:** scheduled worker jobs (LC-07 cleanup, Q-25
   pattern); every cleanup run writes an audit/operational record of what
   was removed or anonymized (counts + criteria).
7. **Default-safe behavior:** if a class's duration is not configured,
   **nothing is deleted** — except `transient` data, whose jobs simply do
   not run until a TTL is configured (documented as a privacy to-do, not a
   silent default number).
8. **Asset/DB coordination:** binary deletion follows metadata decision
   (two-phase above); backup retention must be ≥ the class it protects
   (checked at DB10).

## Consequences

## Positive Consequences

- DB2/DB4 model every table with a known deletion semantic; no global
  `deleted_at` cargo cult.
- Privacy work becomes configuration + jobs, not schema surgery.

## Negative Consequences

- Durations remain open — cleanup for non-transient classes cannot activate
  until the business locks numbers (tracked, below).

## Risks and Mitigations

- **Risk:** durations never get locked; transient PII accumulates.
  **Mitigation:** deferred-parameter register (DB1 handoff) assigns O-008/
  O-012 to DB3 with an acceptance condition; DB10 audits configured values.

## Rejected Alternatives

- Universal soft delete; per-table improvisation; hard-coding "reasonable"
  day counts in DB1 (explicitly out of scope — business decision).

## Deferred Details

- **Deferred parameters:** exact durations per class (O-008, O-012),
  per-lifecycle start events, hold-flag modeling.
- **Owner:** DB3 (class bindings + start events; business locks durations,
  recorded in Decision Log), DB9 (cleanup job fixtures), DB10 (audit).
- **Why DB2 is safe:** DB2 needs categories/classes (locked above), not
  numbers. Acceptance to close: every class has a configured duration or an
  explicit business waiver; cleanup jobs audited.

## Implementation Checkpoint

DB4 (columns/tombstones), DB6 (config plumbing), DB9 (jobs).

## Verification Checkpoint

DB7 (constraints), DB8 (cleanup idempotency), DB10 (retention audit).

## Reversal / Migration Cost

Low: classes are configuration + documentation; changing a category's
semantic later is a scoped migration.

## References

- `docs/09-SECURITY-AND-ABUSE-PREVENTION.md` §10; `docs/10-NON-FUNCTIONAL-REQUIREMENTS.md` §12
- `docs/12-DECISION-LOG.md` O-008, O-012
- ADR-DB1-010, ADR-DB1-014; `DB0_REQUIREMENT_MATRIX.md` §25
