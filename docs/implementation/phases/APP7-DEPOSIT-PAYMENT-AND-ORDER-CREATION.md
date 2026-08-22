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

**Ruled by `APP7-G01`:** the Product Owner locked
`PO-APP7-001 = MANUAL_BANK_TRANSFER_WITH_DYNAMIC_QR_AND_OPTIONAL_EVIDENCE`.
There is no provider dependency in APP7, so this row's original "payment
provider and signature/webhook strategy approved" precondition **does not
apply**. Authority: [`../audits/APP7_G01_DEPOSIT_PAYMENT_AUTHORITY.md`](../audits/APP7_G01_DEPOSIT_PAYMENT_AUTHORITY.md).

## 3. Design policy

Design classification depends on selected provider UX. Complete one APP7 package for customer checkout/status and Admin reconciliation/order confirmation after provider behavior is known. No provider-specific assumptions before ADR.

**Reconciled by `APP7-R00`:** under the manual MVP the customer UX is known
without a provider — transfer instructions, pending, verified, failed, expired —
so `APP7-D01` is schedulable after `APP7-G01` records the ruling. It carries no
provider-specific checkout. `APP7_DESIGN_GATE = DESIGN_REQUIRED_BEFORE_UI_ONLY`
(0 `APP7` / `APP_07` rows exist in `FIGMA_DESIGN_INDEX.md`).

**Ruled by `APP7-G01`:** `APP7-D01` covers the complete manual bank-transfer
journey — instructions, merchant bank facts, exact VND amount, transfer
reference, dynamic QR with download, the **prominent** evidence reminder, the
optional evidence upload and its states, pending verification, verified deposit
and order confirmation; plus the Admin payment view with evidence preview and
manual verification. No provider-specific checkout UX.

Design, when required, is delivered as one complete phase package and is not split into coding checkpoints.

## 4. In scope

Original phase scope, preserved:

- Deposit obligation creation.
- Checkout/session initiation.
- Provider callback/webhook verification.
- Payment attempt/status/reconciliation.
- Duplicate and out-of-order callback handling.
- Exactly-once quotation-to-order conversion.
- Admin payment/order visibility.
- Customer deposit status/confirmation.

### 4.1 Scope as ruled by `APP7-G01`

In scope:

- Order conversion from `design.approved`, with both obligations (INV-04).
- Deposit obligation creation inside the order transaction.
- `BANK_TRANSFER` payment attempt initiation with a server-derived reference.
- Server-generated dynamic bank-transfer QR, viewable and downloadable.
- **Optional** customer transfer-evidence upload (image), append-only.
- Admin evidence preview through authorized private delivery.
- Admin manual server-side verification, review and reconciliation evidence.
- Duplicate/concurrent verification and duplicate upload safety.
- Admin payment/order visibility; customer deposit status and confirmation.

Replaced, and **not** built in APP7 — deferred with `IMP-O007`:

- Provider checkout/session initiation.
- Provider callback/webhook verification and ingestion.
- Out-of-order provider callback handling.

## 5. Out of scope

- Remaining payment.
- Refund/cancellation beyond approved deposit policy.
- Inventory/production execution.
- Success based only on browser redirect.
- Any payment state change caused by QR generation, QR download, a customer
  asserting payment, or an evidence upload — only Admin verification moves
  payment truth (`APP7-G01` §7.6).

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

## 7. Authoritative checkpoint roadmap (post-`APP7-G01`)

Established by [`../audits/APP7_PHASE_ENTRY_AUDIT.md`](../audits/APP7_PHASE_ENTRY_AUDIT.md)
and revised by [`../audits/APP7_G01_DEPOSIT_PAYMENT_AUTHORITY.md`](../audits/APP7_G01_DEPOSIT_PAYMENT_AUTHORITY.md) §15.
This table, not §6, is what APP7 executes.

| Order | Checkpoint | Purpose | Depends on | Main area | Predicted HTTP ops | Acceptance focus |
|---:|---|---|---|---|---:|---|
| 1 | `APP7-R00` | Phase-entry audit and roadmap reconciliation | APP6-X01 | docs | 0 | the audit document |
| 2 | `APP7-G01` | Payment authority; `PO-APP7-001` locked | `R00` | docs | 0 | every APP7 rule cites accepted authority |
| 3 | `APP7-B01` | Admin SKU authoring (inherited APP2 gap) | `G01` | backend / catalog | 2 | a published variant resolves to exactly one ACTIVE SKU; duplicate codes refused |
| 4 | `APP7-W01` | Order conversion: `design.approved` consumer → order + items + both obligations + `order.created` | `B01`, `G01` | worker + order/payment | 0 | exactly one order per request under CC-11; Catalog **and** COP branches; AGG-15 suites green |
| 5 | `APP7-B02` | Admin order read (queue + detail) | `W01` | backend | 2 | frozen snapshot facts only; no live Catalog re-read |
| 6 | `APP7-B03` | Customer deposit read, `BANK_TRANSFER` attempt initiation, QR delivery | `W01` | backend | 3 | GRD-002 + GRD-003; exact amount, VND and reference; QR readable by a banking app; no payment state change |
| 7 | `APP7-DB01` | `payment_transfer_evidence` association (CTX-PAY) | `G01` | database | 0 | forward-only; both FKs `restrict`; no other table touched |
| 8 | `APP7-B05` | Customer transfer-evidence upload + own-evidence read | `DB01`, `B03` | backend | 2 | server-side binding; content-signature media check; 5-per-attempt bound; append-only; no payment state change |
| 9 | `APP7-B04` | Admin deposit verification, review and reconciliation evidence | `B03` | backend | 3 | GRD-011 server-side; CC-10 single application wins; obligation `SATISFIED` → order `DEPOSIT_PAID` |
| 10 | `APP7-B06` | Admin evidence delivery (authorized private stream) | `B05`, `B04` | backend | 1 | association-first; zero-write; no object key or URL disclosed; non-`ACCEPTED` refused |
| 11 | `APP7-D01` | Complete design package (Admin order/payment, customer deposit + QR + evidence) | `G01` | design | 0 | registry rows `APPROVED_FOR_IMPLEMENTATION`; prominent evidence reminder; no provider-specific checkout |
| 12 | `APP7-A01` | Admin order + payment screen with evidence preview | `D01`, `B02`, `B04`, `B06` | frontend | 0 | verification possible without evidence; no secret, key or raw payload rendered |
| 13 | `APP7-S01` | Customer deposit instructions, QR, evidence upload, confirmation | `D01`, `B03`, `B05` | frontend | 0 | truthful states; retry opens a new attempt; the three facts never collapsed |
| 14 | `APP7-E01` | Focused cross-layer acceptance | 3–13 | tests | 0 | `APP7-R00` §19 + `APP7-G01` §16 targets |
| 15 | `APP7-X01` | Phase closure; hand order and deposit truth to APP8 | `E01` | docs | 0 | follow-ups dispositioned; `DepositEligibilityPort` proven for APP8 |

Predicted HTTP surface: **13 operations** (72 → ~85 paths). Backend slices are
2 / 3 / 2 / 3 / 1 — all within 1–3 normal, none near the hard maximum of 5.

### 7.1 Dispositions carried into every APP7 checkpoint

```text
PO-APP7-001 = MANUAL_BANK_TRANSFER_WITH_DYNAMIC_QR_AND_OPTIONAL_EVIDENCE

APP7_PAYMENT_PROVIDER_DISPOSITION = MANUAL_VERIFICATION_MVP
IMP-O007                          = OPEN — DEFERRED_PROVIDER_INTEGRATION
APP7_SCHEMA_DISPOSITION           = MIGRATION_REQUIRED (evidence association only)
APP7_DESIGN_GATE                  = DESIGN_REQUIRED_BEFORE_UI_ONLY
APP7_ORDER_AGGREGATE_ENTRY_STATUS = STALE_TEST_EXPECTATIONS
APP7_INVENTORY_DISPOSITION        = DEFERRED_TO_APP8

QR_GENERATION  = SERVER_OWNED_DYNAMIC_TRANSFER_QR
QR_DOWNLOAD    = REQUIRED
QR_PERSISTENCE = NONE — deterministic regeneration

PAYMENT_REFERENCE = ORD<10-char order-code body><DC|RM>, ^[A-Z0-9]{15}$

TRANSFER_EVIDENCE_REQUIRED  = false
TRANSFER_EVIDENCE_SUPPORTED = true
TRANSFER_EVIDENCE_AUTHORITY = SUPPORTING_RECONCILIATION_ONLY
TRANSFER_EVIDENCE_STORAGE   = delivered asset intake, fourth lane, + one CTX-PAY
                              association table

PAYMENT_VERIFICATION = ADMIN_MANUAL_SERVER_SIDE
```

**Order creation is not gated on the deposit.** `TR-LC14-01` creates the order at
`AWAITING_DEPOSIT` on the approval event, with both payment obligations in the
same transaction; the verified deposit is `TR-LC14-02`. This reverses the §6
candidate ordering and is enforced physically by
`payment_obligations.order_id NOT NULL`.

**`APP7-R00` said `NO_MIGRATION_REQUIRED`.** That remains true for the payment
and order flow it audited. It is revised **only** for the evidence association,
which `ADR-DB4-003` requires to be a context-owned table and which no delivered
table can hold (`APP7-G01` §9).

## 8. Checkpoint status

| Checkpoint | Status | Note |
|---|---|---|
| `APP7-R00` | `COMPLETE` | Phase-entry audit and roadmap reconciliation |
| `APP7-G01` | `COMPLETE` | Payment authority; `PO-APP7-001` locked; roadmap revised 12 → 15 |
| `APP7-B01` | `COMPLETE — CORRECTED — REVIEW_READY` | Admin SKU authoring — 2 ops (`adminSku_create`, `adminSku_update`). A variant can now reach exactly one order-eligible (`is_active`) SKU; the owning `product_variants` row is the concurrency arbiter; no schema or migration change. Report [`reports/APP7-B01-COMPLETION-REPORT.md`](../reports/APP7-B01-COMPLETION-REPORT.md) |
| `APP7-B01-C1` | `SUPERSEDED_BY_FINAL_AUTHORITY_REPAIR` | Removed the SKU-code alphabet B01 invented, but kept `min(1)`/`max(64)` as "payload bounds" — superseded by `APP7-B01-FD1`. Report [`reports/APP7-B01-C1-CORRECTION-REPORT.md`](../reports/APP7-B01-C1-CORRECTION-REPORT.md) |
| `APP7-B01-FD1` | `COMPLETE` | Final authority repair. `skus.code` is `text NOT NULL` with `uq_skus__code` and **no CHECK** (`0007_create_catalog_tables.sql:59,66`, unaltered by any later migration), compared bytewise under `C` (ADR-DB5-002 R1/R2): no alphabet, no length, no nonblank rule, no normalization. The request schema is now `z.string()` and `SKU_CODE_MAX_LENGTH` is deleted — a field rule rejecting an authority-valid database value is a contract constraint whatever the comment calls it, and transport abuse belongs to the delivered body-size controls. Published `code` is `{"type":"string"}` with no `pattern`/`format`/`enum`/`minLength`/`maxLength`. OpenAPI delta = 4 deleted lines; surface unchanged at 74/81/170. `APP7-B01-C2` = `MUST_NOT_BE_CREATED`. Report [`reports/APP7-B01-FD1-FINAL-REPORT.md`](../reports/APP7-B01-FD1-FINAL-REPORT.md) |
| `APP7-W01` | `COMPLETE — CORRECTED (C1)` | `design.approved` (SE-005) order-conversion consumer — the fourth handler on the delivered Outbox/worker runtime, 0 HTTP operations. One atomic transaction creates the order at `AWAITING_DEPOSIT`, its frozen items, **both** obligations (INV-04) and the canonical `order.created`; GRD-009 is re-read from persisted rows, the exact `ACCEPTED` version supplies the money unrecomputed, a Catalog line resolves exactly one `is_active` SKU (0 or several refuse) and a COP line names the frozen customer-owned product. `order.create` claims `(request, approval snapshot)`; `uq_orders__request` is the final arbiter, proved under a real two-pool CC-11 race. Closes `FU-APP6-B03-ORDER-AGGREGATE-SUITE-RED-01` (stale `product_sides.code` / `embroidery_areas.code`, all three AGG-15 suites green) and `FU-APP6-B01-CODE-GENERATOR-PROMOTION-01` (IMP-D053). No schema, migration, OpenAPI or client change. Report [`reports/APP7-W01-COMPLETION-REPORT.md`](../reports/APP7-W01-COMPLETION-REPORT.md) |
| `APP7-W01-C1` | `COMPLETE` | **Correction — `W01_DUPLICATED_ORDER_PERSISTENCE_AUTHORITY` = REMOVED.** PO review found that W01 had re-implemented canonical DB7 authority inside the worker — a second GRD-009 (`WorkerOrderChainGuard`), a second `orders`/`order_items` writer, a second `payment_obligations` writer and a second `order.created` append — because the worker may not import `apps/api`. The boundary was real, the conclusion was not: a runtime boundary is a reason to **share** authority, not copy it, and two implementations of the chain check could disagree about which customer's approval pairs with which customer's price while every foreign key stayed satisfied (INV-19). The delivered DB7 implementations moved **unchanged** to `@embroidery/persistence` (`src/order/`, `src/payment/`) with `OrderPersistenceModule` / `PaymentPersistenceModule`; `apps/api` and `apps/worker` now import the same modules and resolve the same classes and the same Symbol tokens, with zero app-to-app edges and zero new workspace dependencies. Thin re-exports at the three delivered contract paths keep ~10 consumers (3 AGG-15 suites, 2 payment suites, 3 DB9 benchmarks, the DB10 durability suite, the Inventory eligibility guard) importing exactly what they did before. `WorkerOrderChainGuard` is **deleted**, not wrapped or renamed; the worker's remaining seam is reads-only and renamed `ConversionAuthorityRepository` accordingly, having also shed `findOrderByRequest`, the snapshot's `customerId` and the chain-only refusal code. A focused structural suite (`canonical-order-authority.spec.ts`, 7 assertions) pins single-token identity and forbids recurrence — verified to bite against a probe file, not merely to pass. Atomicity, `order.created`-exactly-once, money, CC-11, Catalog/COP, rollback, the code generator and the AGG-15 fixture are all unchanged and re-proved: worker 64, DB7 Order suites 36, payment persistence 29. `FU-APP7-W01-ORDER-CHAIN-GUARD-DUPLICATION-01` = `CLOSED_BY_APP7_W01_C1`; `APP7-W01-C2` = `MUST_NOT_BE_CREATED`. No schema, migration, OpenAPI or client change. Report [`reports/APP7-W01-C1-CORRECTION-REPORT.md`](../reports/APP7-W01-C1-CORRECTION-REPORT.md) |
| `APP7-B02` | `INCOMPLETE` | **Next** — Admin order read; depends on `W01` |
| `APP7-B03` | `INCOMPLETE` | Customer deposit read, attempt initiation, QR delivery; depends on `W01` |
| `APP7-DB01` | `INCOMPLETE` | `payment_transfer_evidence` association migration; depends on `G01` |
| `APP7-B05` | `INCOMPLETE` | Customer transfer-evidence upload and own-evidence read; depends on `DB01`, `B03` |
| `APP7-B04` | `INCOMPLETE` | Admin deposit verification and reconciliation evidence; depends on `B03` |
| `APP7-B06` | `INCOMPLETE` | Admin evidence delivery; depends on `B05`, `B04` |
| `APP7-D01` | `INCOMPLETE` | Complete design package; depends on `G01` |
| `APP7-A01` | `INCOMPLETE` | Admin order + payment screen with evidence preview; depends on `D01`, `B02`, `B04`, `B06` |
| `APP7-S01` | `INCOMPLETE` | Customer deposit, QR, evidence and confirmation screen; depends on `D01`, `B03`, `B05` |
| `APP7-E01` | `INCOMPLETE` | Focused cross-layer acceptance; depends on all runtime and UI slices |
| `APP7-X01` | `INCOMPLETE` | Phase closure and APP8 handoff; depends on `E01` |

Update this table after every APP7 checkpoint. Exactly one row carries **Next**.

## 9. Critical end-to-end journey

A customer pays the exact deposit, a verified provider callback is processed safely even when duplicated/out of order, and the accepted quotation creates exactly one order. Browser redirect alone cannot mark payment successful.

**Ruled by `APP7-G01`:** an approved design creates exactly one order at
`AWAITING_DEPOSIT`; the customer transfers the exact deposit using a
server-generated QR and reference, optionally sends a screenshot, and an Admin
verifies the received funds server-side. Nothing the customer does — scanning,
downloading, asserting payment or uploading evidence — marks the payment
successful.

## 10. Exit gate

- Idempotency and reconciliation tests pass.
  *(`APP7-G01`: there is no provider signature to test in APP7; the signature
  half of GRD-011 is deferred with `IMP-O007`.)*
- Deposit and remaining obligations remain distinct.
- One order maximum per accepted quotation.
- Sensitive data is redacted; no object key, bucket name, storage URL, secure
  token or merchant credential appears in any response, log or screen. *(No
  provider secret exists in APP7.)*
- The exact deposit amount, VND and the transfer reference are preserved from
  the accepted quotation version to the QR and to the Admin expected-amount.
- Evidence is optional throughout: a correct payment with no evidence verifies
  normally, and no evidence upload ever changes payment state.
- E2E passes.

## 11. Handoff

APP8 may reserve inventory and create production jobs only for eligible orders with verified deposit and approved design.
