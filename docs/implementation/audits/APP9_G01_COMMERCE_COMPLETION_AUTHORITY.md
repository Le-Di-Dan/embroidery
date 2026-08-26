# APP9-G01 — Commerce Completion Authority

- Checkpoint: `APP9-G01`
- Mode: `AUTHORITY / DOCUMENTATION_ONLY`
- Branch/HEAD at entry: `production` @ `1b372a4`
- Date: 2026-08-26
- Product Owner ruling: `PO-APP9-001 = OPTION A — DEFER` — **BINDING**

This package turns the accepted `APP9-R00` audit plus the Product Owner's one
ruling into values later APP9 checkpoints may not invent. It changes
documentation only. No runtime source, test, schema, migration, generated
artifact, OpenAPI document, generated client or Figma node was touched.

It **supersedes nothing** in
[`APP9_PHASE_ENTRY_AUDIT.md`](./APP9_PHASE_ENTRY_AUDIT.md); it closes the one
decision that audit routed here (`PO-APP9-001`) and freezes the readings the
audit deliberately left for a ruling. The audit and
[`APP9-R00-COMPLETION-REPORT.md`](../reports/APP9-R00-COMPLETION-REPORT.md)
remain intact as historical evidence.

```text
CONTRADICTION_WITH_STRONGER_AUTHORITY = NONE FOUND
NEW_ADR_REQUIRED                      = NO
APP9_MIGRATIONS                       = 0
```

No ADR is created. The ruling **removes** scope rather than selecting a new
architecture, mechanism or datastore; every remaining lock resolves inside an
already-accepted architecture (`ADR-DB2-002`, `ADR-DB3-002`, `ADR-DB3-004`,
`IMP-D052`, `IMP-D056`).

---

## 1. `PO-APP9-001` — cancellation/refund disposition

```text
PO-APP9-001 = OPTION A — DEFER
```

Consequences, binding on every later APP9 checkpoint:

```text
COMMERCIAL_CANCELLATION_REFUND_IN_APP9 = DEFERRED
CON_144_POLICY_VALUES_IN_APP9          = NOT_DEFINED
APP9_B06                               = NOT_CREATED
APP9_B07                               = NOT_CREATED
APP9_A02_CANCELLATION_REFUND           = NOT_CREATED
ACTIVE_APP9_CHECKPOINTS                = 13
```

Options **B** (partial lock) and **C** (full saga) are withdrawn from active
APP9 planning. They are recorded here only as the history of a closed decision
and must not be reintroduced as roadmap alternatives.

### 1.1 Why deferral is safe

| Reason | Evidence |
|---|---|
| The mechanics already exist and are untouched by deferral | `order_cancellation_requests`, `refunds`, `payment_reconciliations` and their repository methods (including `refundableAmount()` for `GRD-021`) all ship with zero non-test callers |
| The missing part is **money policy**, not code | `ADR-DB3-002` defers the per-stage default refund dispositions to policy configuration values (`CON-144`) with owner **business** |
| Inventing that policy is forbidden | `CLAUDE.md` §5 — no hard-coded business values; §8 — do not invent answers for unresolved items |
| The commerce-completion exit gate does not depend on it | The `PRODUCTION_COMPLETED → COMPLETED` path (§3) touches no cancellation or refund row |

### 1.2 What APP9 must not implement

```text
commercial order cancellation endpoints
order_cancellation_requests application flows
refund approval
refund execution
refund Admin UI
refund customer UI
CON-144 configuration values
refund percentages or monetary defaults of any kind
provider-based or automatic refund execution
```

Existing persistence remains **untouched**: not deleted, not redesigned, not
migrated.

### 1.3 Forward routing — nonblocking

```text
IMP-O008        = DEFERRED / NONBLOCKING   owner stays the phase that first locks CON-144
FU-APP8-B04-02  = CARRIED_FORWARD / NONBLOCKING
```

Neither blocks any APP9 checkpoint. `FU-APP8-B04-02` needs no new APP8 work:
the order stays where it is by design, `ON_HOLD` is already legal and delivered,
and a replacement production job for the same approval snapshot is impossible
(`uq_production_jobs__order_approval_snapshot` is a plain unique), so
re-planning is the delivered `ADR-DB3-003` approval-revision path.

The Product Owner has ruled once. This question is closed and must not be
re-asked inside APP9.

---

## 2. APP8 handoff — locked without modification

```text
production_job.status = COMPLETED
order.status          = PRODUCTION_COMPLETED     (TR-LC14-04)
APP9_EXECUTION        = NONE
```

APP9 begins from `PRODUCTION_COMPLETED`. It reopens **nothing** in APP8:
production transitions, production artifact generation, production-job
cancellation and APP8 inventory behaviour are all `IMP-D056` authority.

Production-job cancellation (APP8-owned, `APP8-B04`) stays permanently distinct
from commercial order cancellation (deferred, §1).

---

## 3. Lifecycle lock — `TR-LC14-05..08`

```text
PRODUCTION_COMPLETED
  -> TR-LC14-05
     actor:        ADMIN
     target:       AWAITING_FINAL_PAYMENT
     requirement:  a live REMAINING obligation exists
     effect:       REMAINING becomes payable

AWAITING_FINAL_PAYMENT
  -> TR-LC14-06
     actor semantics:          SYSTEM consequence of successful final-payment verification
     implementation ownership: synchronous, inside the Admin verification transaction
     target:       READY_FOR_DELIVERY
     guard:        remaining obligation SATISFIED / GRD-016

READY_FOR_DELIVERY
  -> TR-LC14-07
     actor:        ADMIN
     target:       DELIVERED
     guard:        GRD-017
     effect:       shipping_details freeze + shipping_snapshots creation, atomically

DELIVERED
  -> TR-LC14-08
     actor:        ADMIN
     target:       COMPLETED
     guard:        GRD-018
```

`TR-LC14-06` adds **no worker and no new event type**; it follows the delivered
`TR-LC14-02` precedent, which is what makes DB3 `CC-14` (dispatch-versus-payment)
structurally unreachable.

`READY_FOR_DELIVERY → COMPLETED` is never collapsed into one transition.

### 3.1 Prohibited vocabulary

These names are **not canonical** and must not return in any APP9 document,
identifier, contract, copy string or Figma frame:

```text
ready for handoff
fulfilled
fulfillment-completed
shipment-completed
```

Repository LC-14 vocabulary only.

---

## 4. Remaining-payment authority

```text
PAYMENT_MVP = MANUAL_BANK_TRANSFER          (IMP-D052 / PO-APP7-001)
```

APP9 must not introduce:

```text
payment provider          payment callback        payment webhook
automatic bank reconciliation                     automatic provider refund
provider checkout
```

The `REMAINING` obligation authority, as delivered by `APP7-W01`:

```text
EXISTS_FROM_ORDER_CREATION = true
CREATED_ALONGSIDE_DEPOSIT  = true
INITIAL_STATE              = PENDING
AMOUNT_SOURCE              = accepted quotation version remaining_amount, copied verbatim
PAYABLE_AT                 = TR-LC14-05
```

```text
DEPOSIT != REMAINING        permanent; physically guaranteed by CST-039
                            (one live obligation per (order, kind))
```

The two obligations are never combined, never summed into one payable figure and
never satisfied by one act of verification.

A shipping-fee change before freeze triggers the **existing canonical**
obligation recalculation / supersede behaviour (`SUPERSEDED` + a new row, and a
fee *increase* additionally requires a `shipping_fee_acknowledgements` row
carrying a grant and a step-up challenge). APP9 invents no alternative amount
model.

---

## 5. Checkpoint authority boundaries

### 5.1 `APP9-B01` — `TR-LC14-05`

```text
OWNS              TR-LC14-05, PRODUCTION_COMPLETED -> AWAITING_FINAL_PAYMENT
PRIMARY_AUTHORITY order lifecycle
HTTP_BUDGET       1 operation
```

Must **not** also implement: customer remaining-payment read, QR generation,
payment attempt initiation, Admin final-payment verification, shipping detail
management, dispatch, completion. The checkpoint exists so lifecycle entry is
independently reviewable.

### 5.2 `APP9-B02` — customer `REMAINING` capability

```text
OWNS        read the payable REMAINING obligation
            produce manual-bank-transfer QR / instructions
            initiate a payment attempt
HTTP_BUDGET 3 operations
```

- Reuse APP7 infrastructure **where repository authority allows**. Do not simply
  re-point a deposit-specific response type that was intentionally closed to
  `DEPOSIT`; a sibling final-payment projection / route is allowed and expected.
- Reuse the existing `REQUEST_ACCESS` grant. **No new grant scope.**
- Transfer evidence stays the existing attempt-scoped lane
  (`payment_transfer_evidence`, `IMP-D055`). Evidence infrastructure is **not**
  duplicated merely because the obligation kind is `REMAINING`.

### 5.3 `APP9-B03` — Admin verification + `TR-LC14-06`

```text
OWNS        Admin final-payment verification + TR-LC14-06
TRANSITION  AWAITING_FINAL_PAYMENT -> READY_FOR_DELIVERY, synchronous, one transaction
```

The transaction must preserve the delivered APP7 verification semantics:

- lock the correct attempt / obligation / order;
- bind the exact `REMAINING` obligation;
- mark the attempt successful;
- mark the obligation `SATISFIED`;
- append reconciliation;
- move the order to `READY_FOR_DELIVERY`;
- append the lifecycle transition;
- emit `payment.verified` carrying the **real** `obligationKind`;
- remain replay-safe, with no duplicate writes on redelivery.

`DEPOSIT` verification behaviour must remain unchanged. No worker moves the
order. No new event type is added.

### 5.4 `APP9-W01` — `payment.verified` `REMAINING` consumption

`FU-APP8-W01-01` is a **real defect**, confirmed by R00. Current failure mode:

```text
payment.verified + obligationKind = REMAINING
  -> InventoryReservationHandler payload parser rejects any non-DEPOSIT kind
  -> JOB_PAYLOAD_INVALID
  -> terminal DEAD_LETTER
```

The registry permits exactly one handler per event type. `APP9-W01` must
therefore:

- extend the existing **sole** `payment.verified` consumer;
- accept both `DEPOSIT` and `REMAINING`;
- preserve all existing `DEPOSIT` reservation behaviour;
- for `REMAINING`, consume successfully and perform **no inventory reservation**;
- add **zero** new handlers and keep one event owner;
- preserve effect-key / idempotency behaviour;
- close `FU-APP8-W01-01`.

Not fixed in G01 — the implementation authority is frozen here only.

### 5.5 `APP9-B04` — editable shipping preparation only

```text
OWNS              shipping detail read/write before freeze
HTTP_BUDGET       2 operations
PRIMARY_AUTHORITY shipping detail persistence
```

May compose existing shipping detail persistence, shipping-fee acknowledgement
and remaining-obligation recalculation/supersede behaviour **only** where
canonical repository authority requires it.

Must **not** perform: dispatch, freeze, `READY_FOR_DELIVERY → DELIVERED`, or
`DELIVERED → COMPLETED`. Editable shipping and irreversible freeze are different
authorities and stay separately reviewable.

### 5.6 `APP9-B05` — dispatch, delivery, completion

```text
OWNS        TR-LC14-07, TR-LC14-08
HTTP_BUDGET 2 operations
PRESERVES   GRD-016, GRD-017, GRD-018, GRD-024
```

Dispatch is one authoritative transaction: verify the order is dispatchable →
freeze shipping → create the snapshot → move the order to `DELIVERED`.
Completion remains a separate guarded action.

---

## 6. Fulfillment persistence and freeze authority

```text
shipping_details               DELIVERED (migration 0023)
shipping_snapshots             DELIVERED
shipping_fee_acknowledgements  DELIVERED
freeze triggers                DELIVERED (migration 0030)

APP9_MIGRATIONS = 0
```

No migration is created merely because runtime composition is absent. No new
generic `fulfillment` table or state machine is created.

```text
CANONICAL_FREEZE_POINT = the TR-LC14-07 dispatch transaction
```

Freeze is **not** a separate lifecycle command.

```text
BEFORE FREEZE   SOURCE_OF_TRUTH = shipping_details      (ADR-DB2-002)
                STATE           = EDITABLE
                WHO             = Admin only; a customer change request is a
                                  sensitive action the Admin applies (ADR-DB3-004)

AT DISPATCH     shipping_details -> FROZEN
                shipping_snapshots created
                order            -> DELIVERED
                ... atomically, per delivered repository authority
```

Frozen fields remain those already defined by repository/schema authority:

```text
recipient_name  recipient_phone  address_line  ward  district  province
country_code    fee_amount       currency_code carrier_name    tracking_code
```

No customer-profile read is invented after freeze. Frozen shipping data is never
mutated as an ordinary correction — post-freeze corrections are compensating
`order_transitions` `POST_FREEZE_CORRECTION` records with a reason, and the
`GRD-024` database immutability triggers remain authority.

---

## 7. Carrier-tracking boundary

```text
LIVE_CARRIER_TRACKING = OUT_OF_SCOPE
```

`carrier_name` and `tracking_code` are allowed **only** as static internal facts
where persistence and journeys already support them (J8). They do not authorize
a tracking product.

APP9 must not introduce carrier integrations, carrier APIs, courier webhooks,
polling, shipment timelines, parcel event streams, live tracking maps, customer
tracking pages or tracking-status state machines.

Binding on: `B04`, `B05`, `D01`, `A01`, `S01`, `E01`.

---

## 8. Customer communication boundary

```text
APP9_NOTIFICATION_INTENTS         = OUT_OF_SCOPE
APP10_OWNS_CUSTOMER_COMMUNICATION = true
```

APP9 may emit the domain/outbox events the lifecycle requires. It must not add
customer email or SMS templates, notification-intent orchestration, notification
retry APIs, communication-center behaviour or operational notification search.

Existing communication behaviour from earlier phases is neither removed nor
altered.

---

## 9. Design authority

```text
APP9_FIGMA_ROWS_AT_ENTRY = 0
APP9_D01_REQUIRED        = true
DESIGN_GATE              = DESIGN_REQUIRED_BEFORE_UI
```

One complete APP9 design package is delivered in `APP9-D01` on a new `APP_09`
page in `FIG-FILE-PRODUCT`, before any frontend implementation. Rows enter
`REVIEW_REQUIRED`; Claude must not self-approve Product Owner design acceptance.

Covered surfaces — and only these:

**Admin**, extending the existing order workspace (`/orders`,
`/orders/{orderId}`): relevant fulfillment/status filtering; the `TR-LC14-05`
action; final-payment status and verification context; editable shipping
information; the dispatch action; the completion action; frozen shipping facts;
refusal and error states.

**Storefront**, one new customer final-payment route/capability:
production-complete / awaiting-final-payment context; the exact `REMAINING`
amount; bank-transfer instructions; QR; the optional evidence lane; payment
state; delivered/completed order status.

Not designed: a separate customer tracking page, live carrier tracking,
cancellation/refund UI, a notification center, or a new fulfillment queue route
— the last unless later implementation evidence proves the existing `/orders`
surface cannot support the accepted design.

---

## 10. Frontend authority

### 10.1 `APP9-A01` — Admin fulfillment workspace

```text
NEW_ADMIN_ROUTES = 0
STRATEGY         = extend /orders and /orders/{orderId}
```

No duplicate fulfillment queue over the same orders dataset: the existing order
list with the appropriate statuses/filters, and the existing order detail as the
coherent operational workspace. A01 composes the already-delivered `B01`/`B03`/
`B04`/`B05` HTTP capabilities and must not add backend operations merely to
simplify frontend implementation.

### 10.2 `APP9-S01` — customer final-payment / completion surface

```text
NEW_STOREFRONT_ROUTES = 1
APP9_S02              = DOES_NOT_EXIST     (completion status merged into S01)
```

Renders: the exact payable `REMAINING` amount; manual bank-transfer
instructions; QR; payment attempt state; optional transfer evidence; safe order
lifecycle status through completion.

Never renders: carrier name, tracking code, shipment timeline, live delivery
status, or cancellation/refund controls.

---

## 11. `APP9-E01` scope

Focused cross-boundary acceptance, **not** a full regression.

```text
JOURNEYS = 3
CASES    = 10-13
```

1. **Remaining payment** — `PRODUCTION_COMPLETED` → `TR-LC14-05` → customer reads
   the exact `REMAINING` → initiates payment → Admin verifies → `REMAINING`
   `SATISFIED` → order `READY_FOR_DELIVERY` → `payment.verified` is consumed →
   **no second inventory reservation occurs**.
2. **Fulfillment freeze and completion** — shipping detail editable → dispatch →
   shipping frozen + snapshot → order `DELIVERED` → a post-freeze ordinary
   mutation is rejected → completion → order `COMPLETED`.
3. **Negative lifecycle guards** — at minimum: dispatch refused before the
   remaining payment is satisfied; completion refused before `DELIVERED`.

Lower-checkpoint unit/integration cases are **not** retested; accepted checkpoint
evidence is reused for unchanged internals. No broad repository regression by
reflex.

---

## 12. `APP9-X01` scope

Closure only. It must not contain feature implementation, debt cleanup,
migration work, unrelated test expansion or cancellation/refund re-entry. It
measures the final OpenAPI, DB, worker and Figma baselines, classifies
follow-ups, verifies the exit criteria and closes the phase.

---

## 13. Frozen roadmap

```text
R00 -> G01 -> B01 -> B02 -> B03 -> W01 -> B04 -> B05 -> D01 -> A01 -> S01 -> E01 -> X01
```

Thirteen checkpoints. `B06`, `B07`, `A02`, `S02`, `C01`, `C02` and `C03` are
**not** added.

The canonical status table lives in
[`phases/APP9-REMAINING-PAYMENT-AND-FULFILLMENT.md`](../phases/APP9-REMAINING-PAYMENT-AND-FULFILLMENT.md)
§15 and is the only APP9 status table.

---

## 14. Exit gate

- `DEPOSIT` and `REMAINING` remain independent obligations.
- Dispatch and completion are impossible while the remaining payment is
  unverified.
- Shipping is frozen and snapshotted atomically at dispatch, and post-freeze
  mutation is rejected.
- A verified `REMAINING` obligation no longer dead-letters
  (`FU-APP8-W01-01` closed).
- No provider, webhook, migration, carrier-tracking or notification-intent scope
  appears.
- Cancellation and refund are explicitly deferred, with `IMP-O008` and
  `FU-APP8-B04-02` routed forward as nonblocking.
- `APP9-E01` passes.
