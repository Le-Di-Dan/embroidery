# ADR-DB3-001 — Design Approval vs Quotation Acceptance Ordering

- Status: Accepted
- Date: 2026-07-15
- Git HEAD: `0563866e0c1a53472a07e892e6cc1ecabe086b5a`
- Decision IDs: DEC-16
- Requirement IDs: REQ-QUOT-006, REQ-REQ-002, REQ-ORD-004/005, REQ-PAY-001/002
- Invariant IDs: INV-04, INV-05, INV-06, INV-19
- Gap IDs: GAP-03

## Context

`03 J4` has the customer reviewing the quotation early (before digitizing);
`03 J5` starts digitizing after "Admin confirms request is accepted for
digitizing"; `06 §1` core lifecycle runs Quoted → Digitizing → Design Review
→ Approved → Deposit; BR-005 locks deposit strictly after approval, at 40%
of the **accepted total**. What was ambiguous (GAP-03): does quotation
*acceptance* gate digitizing, and how do acceptance and approval interlock
when revisions change price. DB2 deliberately modeled Acceptance Evidence
independent of Approval Snapshot so any ordering could be locked here.

## Decision Drivers

- Digitizing is unpaid manual labor — the admin needs a price commitment
  before investing it (J5's "accepted for digitizing" step).
- BR-005: the 40/60 split derives from an **accepted** total, and deposit
  comes only after approval — so acceptance must exist before deposit math.
- Approval and acceptance are different consents (design vs money) with
  different evidence records; conflating them weakens both.
- Revisions can change price after acceptance (J10, `06 §10`).

## Options Considered

- **Option A — acceptance before digitizing:** quote → accept → digitize →
  review → approve → order+deposit.
- **Option B — quote sent early, accepted only at/after approval:** admin
  digitizes at risk without a price commitment.
- **Option C — two-step consent:** preliminary acknowledgement before
  digitizing + final acceptance at approval — two consent records, two
  secure-flow ceremonies, for a one-person shop.

## Decision

**Option A.** The locked end-to-end commercial ordering is:

```text
Request review → Quotation sent → Customer ACCEPTS quotation (secure flow)
→ Digitizing → Design review loop → Customer APPROVES exact design version
→ Order created (AWAITING_DEPOSIT) + both payment obligations created
→ Deposit verified → Official reservation → Production
```

## Detailed Rules

1. **Acceptance gates digitizing.** Request enters `DIGITIZING` only from
   `QUOTE_ACCEPTED` (guard GRD-005). No admin override to digitize without an
   accepted quotation — spending digitizing labor without commitment is
   exactly the failure mode this ordering exists to prevent; the admin's
   at-risk option is to send a cheaper "estimate" quotation and get it
   accepted.
2. **Approval gates deposit** (BR-005, unchanged): the deposit obligation
   becomes payable only when an Approval Snapshot exists.
3. **Accepted total for 40/60:** the **currently accepted quotation version**
   at the moment of order creation. The split percentages come from policy
   configuration (D-013/014 values).
4. **Price changes after acceptance:** any revision producing a new quotation
   version **requires re-acceptance**; the newly accepted version supersedes
   the prior accepted version as the commercial basis (prior versions remain
   immutable history, INV-02). An approval given while re-acceptance is
   pending does **not** create an order until acceptance exists (guard
   GRD-006).
5. **Same secure flow, separate consents:** acceptance and approval are both
   grant-scoped secure-flow actions (BR-008 analog for money), each with its
   own evidence record (Acceptance Evidence CON-096; Approval Snapshot
   CON-056) and each requiring re-verification per ADR-DB3-004. Approval
   never implies acceptance, and vice versa.
6. **Can a customer approve a design without an accepted quote?** The action
   is accepted at the design level (review decision recorded) but the
   **order-creation guard blocks** until the current quotation version is
   accepted. In the normal flow this cannot occur (digitizing required
   acceptance); it occurs only after a price-changing revision (rule 4).
7. **Order creation boundary:** order is created **upon approval** when
   guards hold (approval snapshot exists + current quotation version
   accepted): one Ordering-context transaction creating Order
   (`AWAITING_DEPOSIT`) + Order Items (frozen from accepted version +
   approval refs) + **both** obligations (deposit + remaining, independent,
   INV-04), triggered by the approval event — idempotent per request/
   approval (INV-19).
8. **Obligation creation:** both at order creation. Deposit payable
   immediately; remaining payable when production completes (LC-15 guards).
9. **Inventory:** soft hold optionally placed at quotation acceptance
   (admin-triggered or config-automatic; TTL from policy config, ADR-DB1-018)
   — never at submission. Official reservation only after deposit verified
   (INV-05, unchanged).
10. **Audit evidence:** acceptance (actor=customer via grant, version ref,
    timestamp), approval (snapshot), order creation, obligation creation —
    all audited (INV-14).

## Consequences

## Positive Consequences

- No unpaid digitizing without commercial commitment; matches J4/J5 reading.
- Order creation has one unambiguous, guard-checkable boundary; deposit math
  always has an accepted total to bind to.

## Negative Consequences

- Post-approval price changes need a re-acceptance round-trip before the
  order resumes — accepted (protects both parties; rare path).

## Risks and Mitigations

- **Risk:** accept-old-version vs revise races.
  **Mitigation:** acceptance binds to an exact version ID; accepting a
  superseded version fails (GRD-006, DB8 race test CC-05).

## Rejected Alternatives

- **Option B:** unpaid digitizing risk; deposit math ambiguous until late.
- **Option C:** two consent ceremonies + two evidence types for marginal
  benefit at this scale; can be layered later without remodeling (extra
  acknowledgement record would be additive).

## Deferred Details

- Split percentages + soft-hold TTL = policy configuration values (CON-144).
- Quotation validity/expiry durations = config.

## Implementation Checkpoint

DB4 (state/guard shapes), backend ordering/quotation checkpoints.

## Verification Checkpoint

DB7 (state transitions), DB8 (acceptance/approval/order-creation races).

## Reversal / Migration Cost

Low-medium: moving to Option C later adds a record type; moving to Option B
is a guard relaxation. Evidence records stay valid either way.

## References

- `docs/03-USER-JOURNEYS.md` J4/J5/J6; `docs/04-BUSINESS-RULES.md` BR-005;
  `docs/06-ORDER-AND-DESIGN-LIFECYCLE.md` §1/§5/§8
- ADR-DB2-001 (grants), ADR-DB3-004 (re-verification); `DB0_CONFLICTS_AND_GAPS.md` GAP-03
