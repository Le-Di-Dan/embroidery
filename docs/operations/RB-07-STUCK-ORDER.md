# RB-07 — Stuck order

A Ready-Made order that is not moving.

Authority: `packages/persistence/src/order/order-transitions.ts` (LC-14,
GRD-019), `apps/api/src/modules/order/domain/ready-made/payment-window.policy.ts`
(BR-025 / BR-026), `docs/04-BUSINESS-RULES.md`.

## The lifecycle, and who is supposed to act at each step

```text
AWAITING_SHIPPING_FEE  --( operator sets the shipping fee )-->  AWAITING_PAYMENT
AWAITING_PAYMENT       --( operator verifies the transfer )-->  READY_FOR_DELIVERY
READY_FOR_DELIVERY     --( operator dispatches           )-->  DELIVERED
DELIVERED              --( operator completes            )-->  COMPLETED

  any live state --> ON_HOLD --> back to the state it came from
  pre-payment    --> CANCELLING --> CANCELLED
```

There is no `PAID` state, no production state and no `AWAITING_FINAL_PAYMENT`: a
Ready-Made order is paid once, in full, and nothing is manufactured for it.

**Most "stuck" orders are waiting for a person, not for the system.** Three of
the four transitions above are operator actions. Establish which side is waiting
before you diagnose anything technical.

## Trigger

- A customer reports an order that is not progressing.
- The order queue shows an order older than you expect in one state.
- `EmbroideryFulfilmentSystemErrors` fired
  ([RB-15 section 6](RB-15-ALERT-RESPONSE.md#6-runbook-h07-fulfilment)).

## Preconditions

- You have the order code (`ORD-XXXXXXXXXX`) or the order id.
- An Admin session.

## Safe observations

```sh
curl -sS --cookie <admin session> https://<admin-host>/api/admin/orders/<orderId>
curl -sS --cookie <admin session> https://<admin-host>/api/admin/orders/<orderId>/payments
curl -sS --cookie <admin session> https://<admin-host>/api/admin/orders/<orderId>/shipping-detail
```

or the same at `https://<admin-host>/orders/<orderId>`.

Read-only, and the one query that answers "what is this order actually waiting
for":

```sql
SELECT o.code, o.status, o.origin, o.created_at,
       ob.kind, ob.status AS obligation_status, ob.amount, ob.superseded_by,
       r.status AS reservation_status, r.expires_at
  FROM orders o
  LEFT JOIN payment_obligations ob ON ob.order_id = o.id
  LEFT JOIN inventory_reservations r ON r.order_id = o.id
 WHERE o.code = 'ORD-XXXXXXXXXX';
```

## Actions — by state

### `AWAITING_SHIPPING_FEE`

**Waiting for: an operator.** The order exists, stock is held, and no payment is
possible until someone sets the shipping fee.

The reservation window is `created_at + 24h` (BR-025). If nobody sets the fee
inside it, the expiry sweep releases the stock and the customer's hold is gone.
This is designed behaviour, not a fault: stock cannot be held indefinitely for an
order nobody has priced.

Act: Admin order screen, `Xác nhận phí và mở thanh toán`
(`PUT /api/admin/orders/{orderId}/shipping-detail`). Confirming it freezes the
goods amount, the fee and the total, creates the `FULL` obligation, **resets the
reservation window to `now() + 24h`**, and sends the customer their payment
link.

If the fee was already set and the order is still here, look for a `500` on that
route — [RB-15 section 6](RB-15-ALERT-RESPONSE.md#6-runbook-h07-fulfilment).

A **correction** to an already-confirmed fee supersedes the obligation and leaves
the window unchanged; a **replay** of the same fee changes nothing. Neither
extends the customer's deadline, deliberately.

### `AWAITING_PAYMENT`

**Waiting for: the customer, then an operator.** The obligation exists and the
customer has been sent the link.

Check, in this order:

1. **Is there an attempt at all?** No attempt means the customer has not started
   the transfer. Check that they received the link:
   [RB-08](RB-08-STUCK-JOB-AND-OUTBOX.md) — an undelivered `ORDER_ACCESS`
   notification leaves a customer with an order they cannot open.
2. **Is the attempt `REQUIRES_REVIEW`?** Then it is waiting for **you**:
   [RB-06 Case B](RB-06-PAYMENT-RECONCILIATION.md).
3. **Is the attempt `PENDING`?** The customer has opened the payment screen and
   the money has not been reconciled. Check the bank statement:
   [RB-06](RB-06-PAYMENT-RECONCILIATION.md).
4. **Has the reservation expired?** `expires_at` in the past with the status
   still `RESERVED` means the sweep has not run —
   [RB-15 section 7](RB-15-ALERT-RESPONSE.md#7-runbook-h07-reservation-sweep).

The important case: **the customer paid after the window lapsed.** Verification
and expiry race, and verification is allowed to win — a real payment for a real
order is not thrown away because a sweep pass ran first. Verify it normally
through [RB-06](RB-06-PAYMENT-RECONCILIATION.md) and read the outcome; if it
refuses because the reservation is gone, the stock is genuinely no longer held
and that is a business conversation, not a state to force.

### `READY_FOR_DELIVERY`

**Waiting for: an operator to dispatch.** Payment is settled, the reservation is
`CONSUMED`, and stock is committed.

Act: `Xác nhận đã giao` (`POST /api/admin/orders/{orderId}/dispatch`).

Dispatch freezes the shipping snapshot exactly once. A second dispatch answers
`409 ORDER_INVALID_TRANSITION` and changes nothing — that is a replay guard, not
a fault. If you are unsure whether the first one landed, **re-read the order**;
recovery here is by refetch, never by forcing state.

### `DELIVERED`

**Waiting for: an operator to complete.**

Act: `Xác nhận hoàn tất` (`POST /api/admin/orders/{orderId}/completion`).
`COMPLETED` is terminal. Same replay guard: a second call is `409` and mutates
nothing.

### `ON_HOLD`

Someone put it here. It returns to the state it came from. Find out why before
resuming.

### `CANCELLING` / `CANCELLED`

Terminal or heading there. `CANCELLED` is not reversible. A customer who wants
the item after cancellation places a new order.

## Expected state

An order that is *not* stuck shows one of:

- a state whose next actor is the customer, inside a live deadline; or
- a state whose next actor is an operator, and the operator now knows it.

## Abort condition

- The order's state is not in `READY_MADE_ORDER_STATES`
  (`AWAITING_SHIPPING_FEE`, `AWAITING_PAYMENT`, `READY_FOR_DELIVERY`,
  `DELIVERED`, `COMPLETED`, `ON_HOLD`, `CANCELLING`, `CANCELLED`) while
  `origin = 'READY_MADE'`. The database's own
  `ck_orders__origin_status_allowed` should make that impossible; if you see it,
  stop and escalate.
- Two satisfied obligations, or a satisfied obligation with no consumed
  reservation.
- An Admin action returns `500` rather than a `409` or a `422`.

## Escalation condition

- A legal transition is refused by every path and no `409` code explains why.
- The order is `READY_FOR_DELIVERY` with the obligation not `SATISFIED`, or
  `DELIVERED` with no frozen shipping snapshot. Those combinations are supposed
  to be unreachable.
- You are being asked to move an order to a state
  `packages/persistence/src/order/order-transitions.ts` does not allow. It does
  not become allowed by writing it in SQL; the transition guard exists precisely
  because the column check does not constrain the *move*.

## Verification

Re-read the order and confirm it advanced:

```sh
curl -sS --cookie <admin session> https://<admin-host>/api/admin/orders/<orderId>
```

and on the dashboard, *Are dispatch and completion transitions failing?* — the
transition should appear with `outcome="success"`. A `refused` there is the
replay guard working; a `system_error` is a fault.

## Recovery / rollback

Order state does not roll back. `DELIVERED` and `COMPLETED` are one-way, the
shipping snapshot is frozen once, and `CANCELLED` is terminal. Every replay of a
fulfilment command is refused with `409` and mutates nothing, so the recovery
from "I am not sure whether that worked" is always the same: **re-read the
order.**

## Forbidden actions

- `UPDATE orders SET status = …`. The transition map is the authority, and the
  guards that go with it check payment satisfaction and shipping freeze in the
  same transaction. SQL bypasses all of it.
- Deleting or editing a shipping snapshot, an order item, or an order.
- Extending a reservation deadline by hand to give a customer more time. The
  window is domain policy (BR-025/BR-026); the correct answer to a lapsed hold is
  a new order.
- Dispatching an order whose obligation is not `SATISFIED`, by any means.
- Treating a `409 ORDER_INVALID_TRANSITION` as a failure to retry around. It is
  the replay guard confirming the work is already done.
