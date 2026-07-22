# APP9 — Remaining Payment, Fulfillment and Completion

## 1. Outcome

Collect the remaining payment obligation, freeze fulfillment information, complete handoff/delivery behavior, and close or cancel/refund orders only according to approved policy.

## 2. Dependencies

APP8 eligible produced order. Cancellation/refund policy and fulfillment method parameters must be locked before corresponding checkpoints.

## 3. Design policy

Produce or supplement one APP9 design package for customer remaining-payment/order completion and Admin fulfillment operations. No carrier-tracking UI is introduced.

Design, when required, is delivered as one complete phase package and is not split into coding checkpoints.

## 4. In scope

- Remaining payment obligation and provider flow using APP7 foundation.
- Fulfillment/shipping information and freeze/snapshot behavior.
- Admin ready-for-handoff/fulfilled/completed transitions.
- Customer remaining-payment and completion status.
- Cancellation/refund only where product policy is approved.
- Notifications and audit.

## 5. Out of scope

- Live carrier tracking.
- Broad returns management not approved by scope.
- Combining deposit and remaining payment into one obligation.
- Unapproved refund policy invention.

## 6. Candidate engineering checkpoints

These are planning slices. Execute and review one at a time. Any backend slice remains subject to the maximum of five tightly related HTTP endpoints.

- **APP9-C01 — Remaining payment contract:** Define obligation/status/initiate checkout operations using APP7 patterns.
- **APP9-B01 — Remaining payment backend:** Implement exact remaining amount, eligibility, idempotency and provider reuse.
- **APP9-S01 — Remaining payment UI:** Implement pending/verified/failed/retry states and order context.
- **APP9-B02 — Remaining payment callback/reconciliation:** Extend verified webhook/reconciliation mapping without duplicating deposit logic.
- **APP9-C02 — Fulfillment contract:** Define fulfillment detail/update/freeze and allowed handoff/completion actions.
- **APP9-B03 — Fulfillment backend:** Implement address/history snapshot, freeze rules, lifecycle guards, audit and notifications.
- **APP9-A01 — Admin fulfillment queue:** Implement ready-for-fulfillment filters and operational states.
- **APP9-A02 — Admin fulfillment/order detail:** Implement frozen information, payment proof/status and guarded actions.
- **APP9-S02 — Customer completion status:** Implement customer-safe fulfilled/completed state without carrier tracking.
- **APP9-C03 — Cancellation/refund contract:** Only after policy lock, define a bounded set of request/approve/status operations.
- **APP9-B04 — Cancellation/refund backend:** Only after policy lock, implement eligibility, separate financial records, idempotency and audit.
- **APP9-E01 — Commerce completion E2E:** Produced order → remaining payment verified → fulfillment data frozen → allowed handoff/completion; delivery blocked when remaining payment is unverified.
- **APP9-X01 — Phase closure:** Close R4 Commerce MVP and hand customer/communication improvements to APP10.

## 7. Critical end-to-end journey

A produced order requires verified remaining payment before fulfillment completion. Fulfillment information is snapshotted/frozen at the approved point, and the order reaches completion through allowed transitions. Cancellation/refund paths run only when explicitly approved.

## 8. Exit gate

- Deposit and remaining payment remain independent.
- Fulfillment cannot complete before verified remaining payment.
- No carrier-tracking scope appears.
- Refund/cancellation is either fully governed or explicitly deferred.
- E2E passes.

## 9. Handoff

APP10 improves customer operations and communication without changing the completed commerce lifecycle.
