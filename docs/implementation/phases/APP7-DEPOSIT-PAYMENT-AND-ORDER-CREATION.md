# APP7 — Deposit Payment and Order Creation

## 1. Outcome

Collect and verify the deposit obligation safely, reconcile provider outcomes, and convert the accepted quotation into exactly one order.

## 2. Dependencies

APP6 approved design and accepted quotation complete. Payment provider and signature/webhook strategy approved.

## 3. Design policy

Design classification depends on selected provider UX. Complete one APP7 package for customer checkout/status and Admin reconciliation/order confirmation after provider behavior is known. No provider-specific assumptions before ADR.

Design, when required, is delivered as one complete phase package and is not split into coding checkpoints.

## 4. In scope

- Deposit obligation creation.
- Checkout/session initiation.
- Provider callback/webhook verification.
- Payment attempt/status/reconciliation.
- Duplicate and out-of-order callback handling.
- Exactly-once quotation-to-order conversion.
- Admin payment/order visibility.
- Customer deposit status/confirmation.

## 5. Out of scope

- Remaining payment.
- Refund/cancellation beyond approved deposit policy.
- Inventory/production execution.
- Success based only on browser redirect.

## 6. Candidate engineering checkpoints

These are planning slices. Execute and review one at a time. Any backend slice remains subject to the maximum of five tightly related HTTP endpoints.

- **APP7-C01 — Deposit checkout contract:** Define create/get deposit obligation, initiate checkout, and customer status operations.
- **APP7-B01 — Deposit obligation and checkout:** Implement exact amount/currency/reference, eligibility, idempotency and provider port.
- **APP7-S01 — Deposit checkout/status UI:** Implement initiation, pending, verified, failed, expired and retry-safe states.
- **APP7-C02 — Payment callback contract:** Define the provider webhook as an isolated security-sensitive endpoint.
- **APP7-B02 — Webhook application:** Implement signature verification, raw payload handling, duplicate/out-of-order safety, safe logging and tests.
- **APP7-W01 — Payment reconciliation:** Implement bounded reconciliation job/manual trigger path with attempt evidence.
- **APP7-C03 — Admin payment operations contract:** Define payment list/detail/reconcile/status operations within five endpoints.
- **APP7-B03 — Admin payment queries/actions:** Implement authorized operational visibility without exposing secrets.
- **APP7-A01 — Admin payment/reconciliation view:** Implement payment state, provider reference, safe retry/reconcile and audit visibility.
- **APP7-B04 — Order conversion:** Implement one atomic/idempotent accepted-quotation-to-order conversion use case and outbox consequences.
- **APP7-C04 — Order read contract:** Define Admin/customer order confirmation/detail operations required immediately after conversion.
- **APP7-A02 — Admin order confirmation/detail:** Implement initial order visibility.
- **APP7-S02 — Customer order confirmation:** Implement verified deposit/order confirmation without claiming production started.
- **APP7-E01 — Deposit-to-order E2E:** Accepted quote → deposit checkout → verified callback/retry → exactly one payment application and exactly one order → safe duplicate callback.
- **APP7-X01 — Phase closure:** Hand order and deposit truth to APP8.

## 7. Critical end-to-end journey

A customer pays the exact deposit, a verified provider callback is processed safely even when duplicated/out of order, and the accepted quotation creates exactly one order. Browser redirect alone cannot mark payment successful.

## 8. Exit gate

- Signature, idempotency and reconciliation tests pass.
- Deposit and remaining obligations remain distinct.
- One order maximum per accepted quotation.
- Sensitive provider data is redacted.
- E2E passes.

## 9. Handoff

APP8 may reserve inventory and create production jobs only for eligible orders with verified deposit and approved design.
