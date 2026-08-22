# APP7 — Deposit Payment and Order Creation

## 1. Outcome

Collect and verify the deposit obligation safely, reconcile provider outcomes, and convert the accepted quotation into exactly one order.

## 2. Dependencies

APP6 approved design and accepted quotation complete. Payment provider and signature/webhook strategy approved.

**Reconciled by `APP7-R00`:** `IMP-O007` is still open — no provider is locked.
The phase proceeds under `APP7_PAYMENT_PROVIDER_DISPOSITION = MANUAL_VERIFICATION_MVP`,
which needs no provider and no signature/webhook strategy. The provider-dependent
slices (checkout session initiation, webhook verification, provider event
ingestion) are **deferred with `IMP-O007`** and are additive when a provider is
locked. `PO-APP7-001` records the choice for the Product Owner.

## 3. Design policy

Design classification depends on selected provider UX. Complete one APP7 package for customer checkout/status and Admin reconciliation/order confirmation after provider behavior is known. No provider-specific assumptions before ADR.

**Reconciled by `APP7-R00`:** under the manual MVP the customer UX is known
without a provider — transfer instructions, pending, verified, failed, expired —
so `APP7-D01` is schedulable after `APP7-G01` records the ruling. It carries no
provider-specific checkout. `APP7_DESIGN_GATE = DESIGN_REQUIRED_BEFORE_UI_ONLY`
(0 `APP7` / `APP_07` rows exist in `FIGMA_DESIGN_INDEX.md`).

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

## 6. Original candidate engineering checkpoints (planning history)

**Superseded by §7 after `APP7-R00`.** Preserved verbatim as planning history.
Every row below is reconciled with exactly one action in
[`../audits/APP7_PHASE_ENTRY_AUDIT.md`](../audits/APP7_PHASE_ENTRY_AUDIT.md) §17.
**Do not execute from this list.**

These were planning slices. Execute and review one at a time. Any backend slice remains subject to the maximum of five tightly related HTTP endpoints.

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

## 7. Authoritative checkpoint roadmap (post-`APP7-R00`)

Established by [`../audits/APP7_PHASE_ENTRY_AUDIT.md`](../audits/APP7_PHASE_ENTRY_AUDIT.md).
This table, not §6, is what APP7 executes.

| Order | Checkpoint | Purpose | Depends on | Main area | Predicted HTTP ops | Acceptance focus |
|---:|---|---|---|---|---:|---|
| 1 | `APP7-R00` | Phase-entry audit and roadmap reconciliation | APP6-X01 | docs | 0 | the audit document |
| 2 | `APP7-G01` | Payment-method, conversion, idempotency, concurrency and SKU authority | `R00` | docs | 0 | every APP7 rule cites accepted authority; PO-APP7-001 recorded |
| 3 | `APP7-B01` | Admin SKU authoring (inherited APP2 gap) | `G01` | backend / catalog | 2 | a published variant resolves to exactly one ACTIVE SKU; duplicate codes refused |
| 4 | `APP7-W01` | Order conversion: `design.approved` consumer → order + items + both obligations + `order.created` | `B01`, `G01` | worker + order/payment | 0 | exactly one order per request under CC-11; Catalog **and** COP branches |
| 5 | `APP7-B02` | Admin order read (queue + detail) | `W01` | backend | 2 | frozen snapshot facts only; no live Catalog re-read |
| 6 | `APP7-B03` | Customer secure deposit read + attempt initiation | `W01` | backend | 2 | GRD-002 grant + GRD-003 step-up; `payment.initiate` idempotent; exact amount and VND |
| 7 | `APP7-B04` | Admin deposit verification, review and reconciliation evidence | `B03` | backend | 3 | GRD-011 server-side; CC-10 single application wins; obligation `SATISFIED` → order `DEPOSIT_PAID` |
| 8 | `APP7-D01` | Complete design package (Admin order/payment, customer deposit) | `G01` | design | 0 | registry rows `APPROVED_FOR_IMPLEMENTATION`; no provider-specific checkout |
| 9 | `APP7-A01` | Admin order + payment screen | `D01`, `B02`, `B04` | frontend | 0 | exact registry node ids; no provider secret or raw payload rendered |
| 10 | `APP7-S01` | Customer secure deposit instructions, status and order confirmation | `D01`, `B03` | frontend | 0 | truthful states; retry opens a new attempt; never claims production started |
| 11 | `APP7-E01` | Focused cross-layer acceptance | 3–10 | tests | 0 | audit §19 target list |
| 12 | `APP7-X01` | Phase closure; hand order and deposit truth to APP8 | `E01` | docs | 0 | follow-ups dispositioned; `DepositEligibilityPort` proven for APP8 |

### 7.1 Dispositions carried into every APP7 checkpoint

```text
APP7_SCHEMA_DISPOSITION           = NO_MIGRATION_REQUIRED
APP7_DESIGN_GATE                  = DESIGN_REQUIRED_BEFORE_UI_ONLY
APP7_ORDER_AGGREGATE_ENTRY_STATUS = STALE_TEST_EXPECTATIONS
APP7_PAYMENT_PROVIDER_DISPOSITION = MANUAL_VERIFICATION_MVP  (IMP-O007 stays open)
APP7_INVENTORY_DISPOSITION        = DEFERRED_TO_APP8
TRUE_PO_DECISIONS                 = PO-APP7-001 (deposit collection method)
```

**Order creation is not gated on the deposit.** `TR-LC14-01` creates the order at
`AWAITING_DEPOSIT` on the approval event, with both payment obligations in the
same transaction; the verified deposit is `TR-LC14-02`. This reverses the §6
candidate ordering and is enforced physically by
`payment_obligations.order_id NOT NULL`.

## 8. Checkpoint status

| Checkpoint | Status | Note |
|---|---|---|
| `APP7-R00` | `COMPLETE` | Phase-entry audit and roadmap reconciliation |
| `APP7-G01` | `INCOMPLETE` | **Next** — payment-method ruling (PO-APP7-001), order-conversion trigger, idempotency namespace bindings, concurrency arbiters, SKU resolution rule, secure-access reuse. Docs only |
| `APP7-B01` | `INCOMPLETE` | Admin SKU authoring; depends on `G01`. Unblocks the Catalog order-item branch |
| `APP7-W01` | `INCOMPLETE` | `design.approved` order-conversion consumer; depends on `B01`, `G01` |
| `APP7-B02` | `INCOMPLETE` | Admin order read; depends on `W01` |
| `APP7-B03` | `INCOMPLETE` | Customer secure deposit read and attempt initiation; depends on `W01` |
| `APP7-B04` | `INCOMPLETE` | Admin deposit verification and evidence; depends on `B03` |
| `APP7-D01` | `INCOMPLETE` | Complete design package; depends on `G01` |
| `APP7-A01` | `INCOMPLETE` | Admin order + payment screen; depends on `D01`, `B02`, `B04` |
| `APP7-S01` | `INCOMPLETE` | Customer deposit and confirmation screen; depends on `D01`, `B03` |
| `APP7-E01` | `INCOMPLETE` | Focused cross-layer acceptance; depends on all runtime and UI slices |
| `APP7-X01` | `INCOMPLETE` | Phase closure and APP8 handoff; depends on `E01` |

Update this table after every APP7 checkpoint. Exactly one row carries **Next**.

## 9. Critical end-to-end journey

A customer pays the exact deposit, a verified provider callback is processed safely even when duplicated/out of order, and the accepted quotation creates exactly one order. Browser redirect alone cannot mark payment successful.

## 10. Exit gate

- Signature, idempotency and reconciliation tests pass.
- Deposit and remaining obligations remain distinct.
- One order maximum per accepted quotation.
- Sensitive provider data is redacted.
- E2E passes.

## 11. Handoff

APP8 may reserve inventory and create production jobs only for eligible orders with verified deposit and approved design.
