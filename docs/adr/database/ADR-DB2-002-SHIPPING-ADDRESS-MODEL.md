# ADR-DB2-002 — Shipping Address Model

- Status: Accepted with Deferred Parameters
- Date: 2026-07-15
- Git HEAD: `f90f78c0cb6891f46874723ae50c3b73de405675`
- Decision IDs: DEC-24
- Requirement IDs: REQ-SHIP-001..004, REQ-RETEN-002
- Invariant IDs: INV-12 (commercial snapshot family), INV-14
- Gap IDs: GAP-05

## Context

Shipping is deliberately minimal (D-017/BR-017): Admin enters fee, recipient
details, carrier name and an internal tracking code; marks delivered; no
shipping API, no customer tracking. GAP-05: the address model (single vs
history, per-order vs per-customer) was unspecified. DB2 must fix the
conceptual shape so Order modeling (DB4) is stable.

## Decision Drivers

- Locked MVP scope: admin-entered, manual, one shipment per order flow.
- Historical order data must not change when contact/address changes later.
- Address is PII → retention/anonymization applies (`10 §12`).
- Customer has no account portal — no natural home for an address book.

## Options Considered

### Option A — Per-order immutable shipping snapshot only

Frozen at entry; any fix creates a replacement record.

### Option B — Customer address book + per-order snapshot

Reusable addresses on the Customer + frozen copy per order.

### Option C — Order-owned mutable shipping record until dispatch, then immutable snapshot

Admin edits freely while preparing; freezing happens at the dispatch/delivery
boundary.

## Decision

**Option C.** Shipping Detail (CON-078) is an **Order-owned child entity**,
mutable by Admin during preparation, becoming an **immutable snapshot at
dispatch** (the delivery-start transition). **No customer address book in
MVP.**

## Detailed Rules

1. **Ownership:** Shipping Detail lives inside the Order aggregate (AGG-15);
   no separate Shipping context/aggregate (manual flow, no independent
   lifecycle beyond order transitions).
2. **Composition:** Recipient VO (CON-079 — may differ from the customer),
   Address VO (CON-080), shipping fee (Money), carrier name, internal
   tracking code. All admin-entered (`07 §11`).
3. **No address book in MVP** — nothing prevents adding a customer address
   book later as a separate Customer-context concept feeding defaults; order
   snapshots would be unaffected.
4. **Customer edits:** customers do not edit shipping data directly in MVP
   (admin-operated flow per `07 §11`); change requests arrive out-of-band and
   Admin applies them — allowed **until dispatch**.
5. **Freeze boundary:** at the dispatch transition (delivery start, LC-19)
   the shipping detail becomes immutable. Post-dispatch corrections are
   compensating transition events/notes (DB3 pattern), never edits.
6. **Fee snapshots:** the *quoted* shipping fee is part of the Quotation
   Version pricing (BR-004 input, frozen there); the *final* fee is frozen in
   the shipping snapshot at dispatch. Both snapshots exist by design; DB3
   defines reconciliation wording when they differ.
7. **Carrier/tracking:** internal metadata only (strings + timestamps); no
   carrier entity, no API surface, no customer-facing tracking (D-017).
8. **Retention:** address/recipient PII follows the commercial-record class
   with field-level anonymization after the retention window (ADR-DB1-011);
   the Ordering module owns the binding.
9. **No-shipping/pickup readiness:** Shipping Detail is optional on an Order
   (1–0..1); a fulfillment-method note covers pickup scenarios without a new
   concept. Formal fulfillment-method states → DB3 only if business asks.
10. **Boundary guard:** delivery cannot start without verified remaining
    payment (REQ-ORD-005) — the freeze point therefore sits behind that
    DB3-formalized gate.

## Consequences

## Positive Consequences

- Matches the real manual workflow (admin fixes typos freely pre-dispatch)
  while guaranteeing frozen delivery evidence afterwards.
- Zero speculative modeling (no address book/carrier entities nobody asked
  for).

## Negative Consequences

- Repeat customers re-enter addresses (acceptable at <100 orders/month;
  address book is an additive future feature).

## Risks and Mitigations

- **Risk:** post-dispatch address mistakes need correction.
  **Mitigation:** compensating event/note pattern (audited), defined at DB3.

## Rejected Alternatives

- **Option A:** immutable-from-entry fights the manual reality (typos during
  preparation) and forces churn of replacement records with no evidence gain
  before dispatch.
- **Option B:** address book adds a PII store + lifecycle for a portal that
  does not exist in MVP scope; explicitly deferred, not precluded.

## Deferred Details

- Post-dispatch correction pattern, fee-mismatch wording, pickup-method
  states → DB3. Address field composition → DB4. Anonymization window →
  retention parameters (DB3/business).

## Implementation Checkpoint

DB4 (shapes), DB6 (immutability trigger for the frozen form per ADR-DB1-010).

## Verification Checkpoint

DB7 (post-dispatch immutability), DB10 (PII anonymization audit).

## Reversal / Migration Cost

Low: adding an address book later is additive; the per-order snapshot remains
the historical truth either way.

## References

- `docs/01-PRODUCT-REQUIREMENTS.md` §10; `docs/07-ADMIN-OPERATIONS.md` §11;
  `docs/04-BUSINESS-RULES.md` BR-017; `docs/12-DECISION-LOG.md` D-017
- ADR-DB1-010, ADR-DB1-011; `DB0_CONFLICTS_AND_GAPS.md` GAP-05
