# ADR-DB4-004 — JSONB Boundaries

- Status: Accepted
- Date: 2026-07-15
- Git HEAD: `a79f5235fd35f76076148cfc53a3eb18f538730b`
- Decision IDs: — (DB4-owned modeling decision)
- Requirement IDs: REQ-SESS-003, REQ-INT-006, REQ-OUTBOX-001, REQ-IDEM-001,
  REQ-PAY-007, REQ-AUDIT-002, REQ-NOTIF-002
- Invariant IDs: INV-07, INV-10, INV-11, INV-23, INV-32
- Gap IDs: —

## Context

DB1 allows JSONB only where justified (design document payload per
ADR-DB1-012); DB3 added redacted provider payloads, outbox payloads,
idempotency results, audit metadata and notification parameters. DB4 must
enumerate the closed allowed set and prohibit everything else so core
business data stays relational.

## Decision

**JSONB is allowed only in the columns enumerated in
[`DB4_JSONB_PAYLOAD_MAP.md`](../../database/DB4_JSONB_PAYLOAD_MAP.md).**
The allowed set (locked):

| # | Column | Purpose |
|---|---|---|
| 1 | `design_sessions.design_document` | working design document |
| 2 | `design_versions.design_document` | frozen design document (hashed) |
| 3 | `design_template_versions.design_document` | template document |
| 4 | `outbox_events.payload` | immutable event payload |
| 5 | `idempotency_records.result` | minimal replayable outcome |
| 6 | `payment_provider_events.redacted_payload` | provider evidence (redacted) |
| 7 | `audit_events.summary` | before/after reference summary |
| 8 | `notification_intents.params` | redacted typed parameters |
| 9 | `policy_configuration_versions.value` | versioned policy/config payload |

### Rules (locked)

1. **Schema + version key:** every JSONB column pairs with an explicit
   schema-version column (`document_schema_version` for design documents
   per ADR-DB1-012; `payload_schema_version` for outbox;
   `value_schema_version` for config) or a documented fixed internal shape
   owned by one module (5–8). No self-describing anonymous blobs.
2. **Validation ownership:** the owning module (or `packages/design-document`
   for 1–3) validates on write; PostgreSQL never interprets or migrates
   payload internals. DB6 records the validation strategy (app-level; DB
   CHECK on JSONB internals is not used).
3. **Canonicalization/hash:** columns 1–3 follow RFC 8785 JCS + SHA-256
   (ADR-DB1-012); hashes stored in sibling `*_hash` columns. Fingerprints
   for idempotency reuse the same canonical-JSON facility.
4. **Redaction:** 6 and 8 are redacted **by construction** (no OTP, tokens,
   secure-link URLs, full PAN/provider secrets — ADR-DB2-003, DB3
   notification rule 3); DB7 asserts no secret-shaped fields.
5. **Query restrictions:** no business query filters or joins on JSONB
   internals; JSONB columns are opaque payloads read whole. Any future need
   to query a field promotes it to a relational column by migration (owner:
   the module; recorded in the payload map).
6. **Size direction:** application-enforced payload budgets (design document
   per `05` editor limits; outbox/audit/params small by construction);
   exact limits = config (deferred values, CON-144 family).
7. **Prohibited (non-exhaustive, from task §8.4):** product/variant/SKU
   fields, money, statuses, order items, obligations, inventory quantities,
   shipping address snapshot fields, quotation line items, relationships,
   and any field a constraint or guard reads — all relational. Approval
   snapshots, quotation versions, order items, shipping snapshots and
   production specifications contain **no JSONB**: their evidence is scalar
   columns + references to hashed documents.
8. **Migration responsibility:** payload-format migrations are code in the
   owning module/package (upgrade-on-read for design documents; versioned
   consumers for outbox/config); never SQL migrations rewriting stored
   payloads (ADR-DB1-012 rule 6).

## Consequences

### Positive

- Every invariant-bearing fact is relational and constraint-checkable; the
  nine allowed columns each have one owner, one schema, one validation
  point.

### Negative

- Editors of new features must promote queryable fields early — accepted
  discipline cost.

## Rejected Alternatives

Free per-feature JSONB (dumping ground); JSONB order items/pricing
(defeats INV-11/12 constraints); relational explosion of design documents
(the document is an opaque versioned artifact by design).

## Deferred Details

Size-limit values and per-payload budgets = configuration (CON-144).
JSONB validation tooling choice → DB6.

## Implementation / Verification Checkpoints

DB6 (columns + app validation wiring) · DB7 (no-secret assertions;
no-BLOB/no-stray-JSONB schema scan).

## Reversal / Migration Cost

Low — promoting a JSONB field to a column is additive.

## References

- ADR-DB1-012, ADR-DB2-003, `DB3_SIDE_EFFECT_OUTBOX_CATALOG.md` (redaction),
  `DB3_IDEMPOTENCY_SPECIFICATION.md` (result minimization)
