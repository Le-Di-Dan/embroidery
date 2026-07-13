# 06 — Order and Design Lifecycle

**Status:** Approved product baseline  
**Version:** 0.1.0

## 1. Core lifecycle

```text
Temporary Design Session
→ Submitted Request
→ Admin Review
→ Quoted
→ Digitizing
→ Design Review
→ Revision Loop
→ Approved
→ Deposit Pending
→ Deposit Paid
→ Production
→ Final Payment Pending
→ Final Payment Paid
→ Delivery
→ Completed
```

## 2. Design session states

Suggested conceptual states:

- `ACTIVE`
- `EXPIRED`
- `SUBMITTED`
- `ABANDONED`
- `DELETED`

## 3. Request states

Suggested conceptual states:

- `NEW`
- `NEEDS_CLARIFICATION`
- `UNDER_REVIEW`
- `REJECTED`
- `QUOTED`
- `DIGITIZING`
- `DESIGN_REVIEW`
- `APPROVED`
- `CANCELLED`

Final names will be decided in technical design.

## 4. Design version states

Suggested conceptual states:

- `DRAFT`
- `SENT_FOR_REVIEW`
- `REVISION_REQUESTED`
- `APPROVED`
- `SUPERSEDED`
- `VOID`

Rules:

- Only one version should be actively awaiting customer review at a time.
- An approved version cannot return to draft.
- A new version may supersede an older unapproved version.
- Approval references an exact version identifier and integrity hash.

## 5. Quotation states

Suggested conceptual states:

- `DRAFT`
- `SENT`
- `ACCEPTED`
- `EXPIRED`
- `REVISED`
- `REJECTED`
- `CANCELLED`

A revised quotation creates a new version rather than overwriting historical values.

## 6. Payment states

Suggested conceptual states:

- `PENDING`
- `PROCESSING`
- `SUCCEEDED`
- `FAILED`
- `EXPIRED`
- `REFUNDED`
- `PARTIALLY_REFUNDED`
- `REQUIRES_REVIEW`

Deposit and final payment are separate payment obligations.

## 7. Order states

Suggested conceptual states:

- `AWAITING_DEPOSIT`
- `DEPOSIT_PAID`
- `IN_PRODUCTION`
- `PRODUCTION_COMPLETED`
- `AWAITING_FINAL_PAYMENT`
- `READY_FOR_DELIVERY`
- `DELIVERED`
- `COMPLETED`
- `CANCELLED`

## 8. State integrity rules

- State transition must be validated server-side.
- Invalid backward transition is rejected.
- Sensitive transition records actor, timestamp and reason.
- Payment success must be verified server-side.
- Production cannot start without:
  - Approved design.
  - Successful 40% deposit.
  - Inventory reservation where applicable.
- Delivery cannot start without successful remaining payment.
- Completion cannot occur before delivery.

## 9. Approval snapshot

Approval snapshot must include:

- Approved version ID.
- Design document hash.
- Preview hash.
- Product and variant.
- Product side.
- Embroidery area.
- Physical dimensions.
- Thread colors.
- Quantity.
- Approval timestamp.
- Customer identity reference.
- Terms version accepted.

## 10. Revision after approval

If customer requests a change after approval:

1. Existing approval remains valid historically.
2. New version is created.
3. Order may be paused.
4. New quotation may be required.
5. Customer must approve new version.
6. Production must reference latest valid approval.

## 11. Cancellation

Cancellation policy details remain a business decision to refine.

System must at minimum support:

- Cancellation before deposit.
- Cancellation after deposit.
- Cancellation during production.
- Admin reason.
- Customer-visible reason where appropriate.
- Payment reconciliation.
- Inventory release.
