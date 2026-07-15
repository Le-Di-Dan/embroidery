# ADR-DB3-002 — Cancellation & Refund Policy (Data-Model Baseline)

- Status: Accepted with Deferred Parameters
- Date: 2026-07-15
- Git HEAD: `0563866e0c1a53472a07e892e6cc1ecabe086b5a`
- Decision IDs: DEC-22 (O-009)
- Requirement IDs: REQ-PAY-009, REQ-INV-004, REQ-REQ-003, REQ-ORD-001/003
- Invariant IDs: INV-14, INV-18, INV-19
- Gap IDs: GAP-04

## Context

`06 §11` mandates minimum cancellation support (before deposit / after
deposit / during production; admin reason; customer-visible reason; payment
reconciliation; inventory release) while leaving policy detail open (O-009).
DB2 modeled cancellation as an event-orchestrated saga. DB3 must lock an
**internal business baseline** precise enough for the data model, guards and
compensation — refund *amounts* stay configurable/manual where the business
has not fixed numbers. No external legal regime is invoked; this is the
internal baseline for the data model.

## Decision Drivers

- One-admin shop: manual review is cheap, automation of edge cases is not.
- Deposit exists only after approval (BR-005) — early stages have no money.
- Refund execution is manual (bank transfer reality; provider open O-006) —
  the system records decisions and evidence, it does not move money.
- Compensation must be idempotent and auditable (INV-14/19).

## Options Considered

- Fully automated stage-based refund percentages — over-automation with no
  business-locked numbers to automate.
- Everything manual, no policy — leaves guards/compensation undesignable.
- **Stage matrix with locked mechanics + default dispositions, amounts
  admin-decided within policy config** (chosen).

## Decision

Cancellation is an **orchestrated compensation flow** (never a bare status
write). The stage matrix below is locked; monetary **defaults** are policy
configuration (CON-144), and every refund decision is a recorded,
reason-bearing admin action.

### Stage matrix (locked)

| # | Stage | Cancel allowed / initiator | Deposit effect | Remaining effect | Inventory | Production | Terminal result |
|---|---|---|---|---|---|---|---|
| S1 | Before quotation sent | Customer (secure flow) or Admin | n/a (none) | n/a | none | n/a | Request `CANCELLED` |
| S2 | Quotation sent, not accepted | Customer or Admin | n/a | n/a | none | n/a | Request `CANCELLED`; quotation version `VOID` |
| S3 | After acceptance, before approval (digitizing may be underway) | Customer or Admin | n/a (no deposit yet) | n/a | release soft hold | n/a | Request `CANCELLED`; digitizing labor loss = accepted business risk (admin may apply BR-007 abuse handling) |
| S4 | After approval, before deposit paid | Customer or Admin | obligations `CANCELLED` (nothing paid) | cancelled | release soft hold | planned job (if any) cancelled | Order `CANCELLED`, Request `CANCELLED` |
| S5 | After deposit verified, before production start | Customer via **manual review**; Admin | **refund default: refundable minus digitizing-fee line** of the accepted quotation (default from config; final amount = admin decision with reason) | cancelled | release official reservation | planned job cancelled | Order `CANCELLED` + Refund Record |
| S6 | During production | Customer request → **manual review**; Admin | **default non-refundable** (materials/labor committed); admin may override with reason | cancelled | admin decides release vs consume (reasoned ledger entry) | job `CANCELLED` | Order `CANCELLED` + Refund Record if any |
| S7 | Production completed, before final payment | Manual review only | default non-refundable | cancelled (goods exist; admin may negotiate) | consume (goods made) | completed job stands | Order `CANCELLED` |
| S8 | Final payment verified, before dispatch | **Admin-only exceptional** | default non-refundable | **default refundable** (not dispatched) — admin decision + Refund Record | consume or release per admin reasoned decision | n/a | Order `CANCELLED` |
| S9 | After dispatch/delivery | **No cancellation.** Returns/complaints are handled manually per the published return-policy content page; system supports Refund Records + audit for whatever the admin decides | — | — | — | — | Order stays `DELIVERED`/`COMPLETED`; refunds recorded if granted |

### Mechanics (locked, all stages)

1. **Initiation:** customer cancellations run through the secure flow
   (grant + re-verification for stages ≥ S5); admin cancellations through
   admin console. **Reason is mandatory** for every cancellation; a
   customer-visible reason is recorded where appropriate (`06 §11`).
2. **Manual review:** stages marked manual-review create a cancellation
   request the admin resolves (approve/deny with reason) before compensation
   runs.
3. **Compensation order (locked):** (1) halt/park production, (2) inventory
   release/consume with reasoned ledger entries, (3) payment reconciliation
   (obligations cancelled; attempts reconciled), (4) Refund Record created
   for any money returned (`PENDING_REVIEW → APPROVED → EXECUTED` — execution
   is the manual transfer, recorded), (5) terminal state writes (order/
   request/quotation/job), (6) notifications, (7) audit throughout. Each step
   idempotent; the orchestration is resumable (order holds `CANCELLING`
   during the saga).
4. **Refunds are records, not provider automation:** amount, method,
   provider/bank reference, approver, reason — reconciled against attempts
   (REQ-PAY-008/009). Partial refunds supported by amount.
5. **Idempotency:** one cancellation execution per order/request
   (namespace `order.cancel` / `request.cancel`); repeated triggers replay.
6. **No negative stock, ever,** including during compensation (INV-18).

## Consequences

## Positive Consequences

- Every guard/compensation/test scenario is now specifiable; refund evidence
  is first-class data.
- Defaults protect the shop (labor/materials) while keeping admin discretion
  audited rather than ad hoc.

## Negative Consequences

- Manual-review stages add operator steps — correct trade-off for one admin
  and <100 orders/month.

## Risks and Mitigations

- **Risk:** compensation interrupted mid-saga.
  **Mitigation:** `CANCELLING` state + idempotent steps + DB8 retry test.
- **Risk:** disputes over defaults. **Mitigation:** defaults are config
  (business can tune); every deviation is a reasoned, audited decision.

## Rejected Alternatives

Percentage-automated refunds (no locked numbers exist to automate);
cancellation as a plain status write (loses compensation/idempotency);
customer self-service cancellation post-deposit without review (money
movement needs the admin in the loop).

## Deferred Details

- Default refund dispositions/amount rules per stage = **policy
  configuration values** (CON-144) — business signs off values; Decision Log
  records them (owner: business + config checkpoint; acceptance: values
  configured before payment feature ships).
- Return/complaint handling post-delivery = content policy + manual ops (out
  of DB scope beyond Refund Records).

## Implementation Checkpoint

DB4 (cancellation/refund record shapes), backend ordering/payment CPs.

## Verification Checkpoint

DB7 (terminal-state + reason constraints), DB8 (cancel-vs-production,
cancel-vs-callback races; compensation retry).

## Reversal / Migration Cost

Low: matrix rows are policy config + guard wiring; records stay valid.

## References

- `docs/06-ORDER-AND-DESIGN-LIFECYCLE.md` §11; `docs/03-USER-JOURNEYS.md` J10;
  `docs/07-ADMIN-OPERATIONS.md` §8; `docs/12-DECISION-LOG.md` O-009
- ADR-DB3-001, ADR-DB3-003; `DB3_CANCELLATION_COMPENSATION_SPEC.md`
