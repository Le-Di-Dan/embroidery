# 06 — Order and Design Lifecycle

**Status:** Approved product baseline  
**Version:** 0.1.0

## 1. Core lifecycle

The lifecycle below is the **custom embroidery** lifecycle (order origin
`CUSTOM`). The Ready-Made lifecycle (origin `READY_MADE`) is §12.

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

`DEPOSIT` and `REMAINING` are custom-origin obligation kinds. A `READY_MADE`
order carries exactly one obligation of kind `FULL` (§12.3).

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

The first five are reachable only by a `CUSTOM` order. A `READY_MADE` order uses
`AWAITING_SHIPPING_FEE` and `AWAITING_PAYMENT` instead, then shares
`READY_FOR_DELIVERY`, `DELIVERED`, `COMPLETED` and the exception set (`ON_HOLD`,
`CANCELLING`, `CANCELLED`) verbatim. See §12.2. No `PAID` order state exists in
either branch.

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

Origin-scoped additions (`APP12-P01`):

- Every order has exactly one origin, `CUSTOM` or `READY_MADE`, and transition
  authority is origin-scoped.
- The production preconditions above apply to `CUSTOM` only; a `READY_MADE`
  order never enters production.
- For `READY_MADE`, delivery cannot start without a `SATISFIED` `FULL`
  obligation, which is the sole authoritative source of payment truth.

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

For `READY_MADE`, expiry of either pre-payment reservation window
(`BR-025`/`BR-026`) cancels the order with an expiry reason, releases the
reservation, cancels any live `FULL` obligation, and permanently refuses later
`FULL` verification.

## 12. Ready-Made order lifecycle

Added by `APP12-P01` (`D-043`, `IMP-D058`) for order origin `READY_MADE`.

### 12.1. Order origin

```text
ORDER_ORIGIN = CUSTOM | READY_MADE      (exactly one branch)
```

`CUSTOM` requires the existing custom request, accepted quotation version,
approval snapshot and the §1 lifecycle. `READY_MADE` has no custom request, no
quotation and no approval snapshot, and requires a SKU order item. Placeholder
or fabricated custom records are never created to make a Ready-Made order
representable, and no custom invariant is weakened to allow one. Physical
constraints are owned by the APP12 database-change checkpoint.

### 12.2. Ready-Made core lifecycle

```text
AWAITING_SHIPPING_FEE
→ AWAITING_PAYMENT
→ READY_FOR_DELIVERY
→ DELIVERED
→ COMPLETED
```

Exception states `ON_HOLD`, `CANCELLING` and `CANCELLED` remain applicable.

`AWAITING_DEPOSIT`, `DEPOSIT_PAID`, `IN_PRODUCTION`, `PRODUCTION_COMPLETED` and
`AWAITING_FINAL_PAYMENT` are never used, and no production job is created.

### 12.3. Transitions

| From | To | Actor | Condition |
|---|---|---|---|
| — | `AWAITING_SHIPPING_FEE` | SYSTEM | Durable order creation for a verified customer identity; stock reserved with a 24h expiry |
| `AWAITING_SHIPPING_FEE` | `AWAITING_PAYMENT` | ADMIN | Exact shipping fee set; server freezes subtotal, fee and payable total; the first current `FULL` obligation is created; reservation expiry reset to fee-confirmation + 24h |
| `AWAITING_PAYMENT` | `AWAITING_PAYMENT` | ADMIN | Fee correction while `FULL` is `PENDING`: the obligation is superseded and a successor created; the order does not move |
| `AWAITING_PAYMENT` | `READY_FOR_DELIVERY` | ADMIN | `FULL` obligation verified and `SATISFIED`; the reservation is no longer expiry-eligible |
| `READY_FOR_DELIVERY` | `DELIVERED` | ADMIN | Dispatch, reusing the existing fulfilment authority |
| `DELIVERED` | `COMPLETED` | ADMIN | Existing completion authority |
| `AWAITING_SHIPPING_FEE` / `AWAITING_PAYMENT` | `CANCELLED` | SYSTEM | Reservation window expired (`BR-025`, `BR-026`) |

After `FULL` is `SATISFIED`, an ordinary shipping-fee edit is refused; a
commercial correction requires the explicit cancellation/refund authority.

### 12.4. Reservation

```text
reservation created at durable Ready-Made order creation
READY_MADE_INITIAL_RESERVATION_WINDOW = 24 hours
READY_MADE_PAYMENT_RESERVATION_WINDOW = 24 hours
```

Never reserved on Product Detail, never on temporary SKU selection, never after
payment. On dispatch and fulfilment the existing inventory-consumption and
ledger authority is reused where it remains truthful. `CUSTOM` reservations stay
no-expiry under `PO-APP8-002`; the expiry policy above is origin-specific and
extends rather than contradicts that decision.

### 12.5. Customer visibility

The customer observes the whole lifecycle only through the order-scoped secure
surface `ORDER_ACCESS` (`BR-032`). There is no customer account and no
cross-order access.
