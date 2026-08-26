# APP9 — Phase Entry Audit (`APP9-R00`)

- Checkpoint: `APP9-R00` — phase entry audit, authority reconciliation and canonical roadmap
- Date: 2026-08-26
- Branch: `production` · Entry HEAD: `d2ab019` (`docs(app8): close inventory reservation and production operations phase (APP8-X01)`)
- Working tree at entry: clean · `NOT_PUSHED = true` (16 local commits ahead of `origin/production` at entry)
- Status: **audit only** — no runtime, schema, OpenAPI, generated-client, worker or Figma change

---

## 1. Verdict

```text
APP9 = A COMPOSITION PHASE, NOT A GREENFIELD ONE
```

The single most consequential finding of this audit is that **the entire APP9
persistence layer already ships, is integration-tested, and is completely
uncomposed** — exactly the shape `APP8-R00` found one phase earlier, but wider.

`packages/persistence/src/order/drizzle-order-shipping.repository.ts` already
implements `saveShippingDetails`, `dispatch` (freeze + snapshot + `DELIVERED`,
atomic), `acknowledgeShippingFee`, `openCancellationRequest`,
`resolveCancellationRequest` and `loadShippingDetail`.
`packages/persistence/src/payment/payment-evidence.repository.ts` already
implements `openRefund`, `approveRefund`, `executeRefund`, `findRefund` and
`refundableAmount`. `packages/persistence/src/order/order-transitions.ts`
already carries the complete LC-14 legality table including
`PRODUCTION_COMPLETED → AWAITING_FINAL_PAYMENT → READY_FOR_DELIVERY →
DELIVERED → COMPLETED`. Migration `0030_add_integrity_triggers.sql` already
installs `trg_shipping_details__reject_mutation`,
`trg_shipping_snapshots__reject_mutation`,
`trg_shipping_fee_acknowledgements__reject_mutation` and
`trg_refunds__reject_mutation`.

Not one of those methods has a non-test caller. `APP9_HTTP_OPERATIONS_AT_ENTRY
= 0`. `APP9_RUNTIME_WRITES_AT_ENTRY = 0`. `APP9_FIGMA_ROWS_AT_ENTRY = 0`.

```text
APP9_SCHEMA_DISPOSITION       = NO_MIGRATION_REQUIRED
APP9_REQUIRED_SCHEMA_GAPS     = none
APP9_REQUIRED_REPOSITORY_GAPS = none for the commerce-completion path
```

The second consequential finding is that **the provisional APP9 document's
payment architecture is wrong**. It says "provider flow", "provider reuse" and
"callback/reconciliation webhook". `IMP-D052` / `PO-APP7-001` locked
`PAYMENT_MVP = MANUAL_BANK_TRANSFER`: no provider, no webhook, no automatic
bank reconciliation. Every provisional checkpoint resting on a provider is
`REDEFINE` or `REMOVE`, not `KEEP`.

---

## 2. Entry baseline (measured, read-only)

### 2.1 OpenAPI

Measured from the committed artifact
`packages/contracts/openapi/openapi.generated.json`:

```text
PATHS   = 92
OPS     = 99
SCHEMAS = 206
```

Matches the accepted `APP8-X01` closure figure exactly. No drift.

### 2.2 Database

```text
MIGRATIONS = 37   (0001 .. 0037_add_app7_transfer_evidence_association)
TABLES     = 79
```

Unchanged since APP7. APP8 added zero. APP9 is predicted to add zero (§8).

### 2.3 Worker

Six job directories on one runtime, five registered outbox handlers, one
PostgreSQL outbox (`IMP-D029`, no broker):

```text
apps/worker/src/jobs/asset-inspection
apps/worker/src/jobs/asset-normalization
apps/worker/src/jobs/notification-delivery
apps/worker/src/jobs/order-conversion         design.approved  -> Order + both obligations
apps/worker/src/jobs/inventory-reservation    payment.verified -> official reservation
apps/worker/src/jobs/app5-intake-cleanup
```

### 2.4 Figma

`docs/design/FIGMA_DESIGN_INDEX.md` §4 ends at **4.14 `APP8-D01`**. §3 write
targets enumerate `APP_01`…`APP_08`. There is **no `APP_09` page and no APP9
row of any kind**.

```text
APP9_FIGMA_ROWS_AT_ENTRY = 0
APP9_PAGE_TARGET         = a new APP_09 page in FIG-FILE-PRODUCT (BQwqV8GdfUIELvsQDB1UQE)
REUSABLE_APP7_PATTERNS   = the secure customer payment surface (bank instructions block,
                           exact-amount emphasis, QR card, copy-value affordance,
                           optional transfer-evidence lane, attempt state cards)
REUSABLE_APP8_PATTERNS   = the Admin guarded-transition action group with a mandatory
                           reason, the refusal/error card vocabulary, the read-only
                           frozen-facts panel
D01_NEEDED               = YES
```

### 2.5 Application surfaces

```text
Admin      : /orders, /orders/{orderId}   (APP7-A01 payment workspace, incl. verify action)
             /san-xuat, /san-xuat/{jobId}, /kho/skus/{skuId}, /products, /requests, ...
Storefront : /truy-cap/thanh-toan          (APP7-S01 secure deposit)
             /truy-cap, /truy-cap/bao-gia, /truy-cap/duyet-thiet-ke, /yeu-cau/..., ...
```

---

## 3. Binding APP8 handoff (preserved, not reopened)

```text
production_job.status = COMPLETED
order.status          = PRODUCTION_COMPLETED     (TR-LC14-04)
APP9_EXECUTION        = NONE
```

`PO-APP8-005` (as corrected by `APP8-G01-C1`, `IMP-D056`) is authority: APP8's
successful handoff ends there; `TR-LC14-05`, remaining-payment collection,
shipping, delivery, refund and final settlement are APP9's, and APP7's
unsatisfied `REMAINING` obligation is preserved. **APP8-owned production-job
cancellation stays APP8's** and is not commercial cancellation. This audit
changes nothing in APP8.

---

## 4. Remaining-payment authority (§6 and §8 of the directive)

### 4.1 The seven required determinations

```text
REMAINING_OBLIGATION_EXISTS        = YES
REMAINING_CREATED_WHEN             = at order creation, in the APP7-W01 order-conversion
                                     transaction, alongside DEPOSIT (INV-04 / TR-LC15-01)
REMAINING_AMOUNT_SOURCE            = quotation_versions.remaining_amount of the ACCEPTED
                                     version, copied verbatim — never recomputed, never
                                     derived from the deposit by subtraction
REMAINING_PAYMENT_UI_REUSE         = HIGH — the same REQUEST_ACCESS grant already reaches it
REMAINING_TRANSFER_EVIDENCE_REUSE  = HIGH — the evidence lane is attempt-scoped, not
                                     deposit-scoped, at the persistence layer
REMAINING_ADMIN_VERIFICATION_REUSE = HIGH at the repository layer,
                                     BLOCKED at the application layer (§4.3)
REMAINING_EVENT_MODEL              = the existing SE-007 `payment.verified` outbox event,
                                     carrying the real obligationKind — no new event type
```

Evidence for creation:
`apps/worker/src/jobs/order-conversion/application/convert-approved-design.usecase.ts`
creates **both** obligations in one transaction, the second with
`kind: 'REMAINING'`, `amount: version.remainingAmount`. Its own comment states
"APP7 never makes the remaining one payable — that is `TR-LC14-05`, APP9's".

### 4.2 The canonical lifecycle from `PRODUCTION_COMPLETED`

From `docs/database/DB3_LIFECYCLE_SPECIFICATIONS.md` LC-14, which is authority
over the provisional plan's prose:

| Transition | From → To | Actor | Guard | Side effect |
|---|---|---|---|---|
| `TR-LC14-05` | `PRODUCTION_COMPLETED` → `AWAITING_FINAL_PAYMENT` | **admin** | remaining obligation exists | `SE-010` final payment request; **remaining becomes payable** |
| `TR-LC14-06` | `AWAITING_FINAL_PAYMENT` → `READY_FOR_DELIVERY` | **system** (final payment verified) | remaining `SATISFIED` (**GRD-016**) | `SE-007`; shipping finalization window opens |
| `TR-LC14-07` | `READY_FOR_DELIVERY` → `DELIVERED` | **admin** | **GRD-017** shipping frozen at dispatch (freeze occurs in this tx) | `SE-011` |
| `TR-LC14-08` | `DELIVERED` → `COMPLETED` | **admin** | **GRD-018** delivered first | analytics emission |

The provisional §7 journey is therefore **correct in shape and wrong in
vocabulary**. There is no "ready for handoff" state and no "fulfilled" state.
The canonical names are the ones above. The corrected journey:

```text
PRODUCTION_COMPLETED
  -> (admin, TR-LC14-05)  AWAITING_FINAL_PAYMENT      remaining becomes payable
  -> (customer pays, admin verifies, TR-LC14-06)      READY_FOR_DELIVERY
  -> (admin, TR-LC14-07)  DELIVERED                   shipping frozen + snapshotted, atomically
  -> (admin, TR-LC14-08)  COMPLETED
```

`DEPOSIT != REMAINING` is preserved physically: `CST-039` allows exactly one
live obligation per `(order, kind)`, and the two rows are independent from
creation.

Answering the directive's fourteen questions directly:

1. **Yes** — `PRODUCTION_COMPLETED → AWAITING_FINAL_PAYMENT` is canonical
   (`TR-LC14-05`, and legal in `order-transitions.ts`).
2. **Admin.** Not the system, not the worker.
3. **Admin-triggered and synchronous.** It is not driven by production
   completion: `TR-LC14-04` and `TR-LC14-05` are two separate transitions with
   two separate actors, and `APP8-B04`'s completion deliberately stops at the
   first.
4. **Yes** — the `REMAINING` obligation exists in `PENDING` from order creation.
   `TR-LC14-05` does not create it; it makes it *payable*.
5. `payment_obligations.amount` of the live `REMAINING` row, itself frozen from
   `quotation_versions.remaining_amount` of the ACCEPTED version.
6. **Yes, but only through a recorded recalculation.** A shipping-fee change
   after the order exists supersedes the remaining obligation (`SUPERSEDED` +
   a new row via `superseded_by_obligation_id`, action `OBLIGATION_RECALC`),
   and a fee *increase* additionally requires a `shipping_fee_acknowledgements`
   row carrying a grant and a step-up challenge
   (`DB3_SHIPPING_FEE_AND_FREEZE_SPEC.md` §1.2). The payable figure is always
   the live obligation, never a re-read live fee.
7. Order `AWAITING_FINAL_PAYMENT` plus a live (`PENDING`) obligation. There is
   no separate "payable" flag.
8. Structurally all five customer deposit operations
   (`publicOrderDeposit_current` / `_qr` / `_initiate`,
   `publicOrderDepositEvidence_upload` / `_status`) — the walk is
   grant → request → order → obligation and the grant scope is the same.
   **But every one of them is DEPOSIT-hardcoded in its application layer**
   (§4.3), so reuse means generalisation, not re-pointing.
9. `adminPaymentAttempt_verify` and `adminPaymentAttempt_review` — same caveat.
10. Atomically, in the verification transaction: attempt `SUCCEEDED`,
    obligation `SATISFIED` by that exact attempt, a reconciliation appended,
    the order moved, and `payment.verified` emitted exactly once. This is
    precisely the shape `verify-payment-attempt.use-case.ts` already ships for
    `DEPOSIT` (§4.4).
11. `READY_FOR_DELIVERY`.
12. `payment.verified` (SE-007) on the outbox, plus the `order_transitions` row
    the repository's `transition()` appends in the same transaction.
13. `payment.callback`-class idempotency does not apply (no provider). The
    verification is replay-safe by committed truth: APP7 returns
    `replayed: true` and writes nothing a second time.
14. Same rule — a redelivered verification returns the committed truth; a
    redelivered outbox event is deduplicated by the consumer's effect key.

### 4.3 `REUSE` is real at the repository layer and blocked at the application layer

`PaymentObligationRepository.findLiveForOrder(orderId, kind)` is already
kind-parameterised. Above it, nothing is:

```text
application/customer/deposit-target.resolver.ts        const DEPOSIT = 'DEPOSIT';
                                                       findLiveForOrder(order.id, DEPOSIT)
application/admin/payment-decision-chain.resolver.ts    if (locked.obligation.kind !== DEPOSIT_OBLIGATION_KIND) refuse
application/admin/verify-payment-attempt.use-case.ts    refuses non-deposit with DEPOSIT_NOT_PAYABLE;
                                                       moves AWAITING_DEPOSIT -> DEPOSIT_PAID
application/admin/payment-decision.recorder.ts          emits obligationKind: 'DEPOSIT' as a literal
application/customer/customer-deposit.view.ts           "no REMAINING obligation detail of any kind.
                                                        The type has nowhere to put one"
```

That last comment is deliberate APP7 design, not an oversight. It means the
customer view type **cannot** be re-pointed at `REMAINING` — a sibling
projection is required.

### 4.4 The `TR-LC14-06` implementation shape is already precedented

`TR-LC14-02` is likewise specified as "system (deposit verified event)", and
APP7 implemented it **synchronously inside the Admin verification
transaction** — the order moves `AWAITING_DEPOSIT → DEPOSIT_PAID` in the same
tx that satisfies the obligation, and `payment.verified` is emitted for
downstream consumers rather than to drive the order move.

APP9 therefore implements `TR-LC14-06` the same way:
`AWAITING_FINAL_PAYMENT → READY_FOR_DELIVERY` inside the verification
transaction, under the order row lock. This is what makes **`GRD-016` /
DB3 CC-14 (dispatch-versus-payment) structurally unreachable** without
inventing a second mechanism, and it means **APP9 needs no new worker handler
for the order move**.

---

## 5. `payment.verified` routing audit — a concrete disposition

### 5.1 Measured facts

```text
producer  apps/api/.../payment-decision.recorder.ts
          PAYMENT_VERIFIED_EVENT_TYPE = 'payment.verified'
          writes exactly { paymentAttemptId, paymentObligationId, obligationKind, orderId }
          obligationKind is the hardcoded literal 'DEPOSIT'

consumer  apps/worker/.../inventory-reservation.handler.ts
          readonly eventType = PAYMENT_VERIFIED_EVENT_TYPE
          the ONLY registrant for that event type

registry  apps/worker/src/runtime/registry/job-handler.registry.ts:25
          throws at startup if two handlers register the same eventType

payload   apps/worker/.../domain/payment-verified.payload.ts:72
          if (record['obligationKind'] !== 'DEPOSIT')
              return { valid: false, errorClass: 'JOB_PAYLOAD_INVALID' }

class     apps/worker/src/runtime/registry/job-handler.ts:67
          "Must be JOB_PAYLOAD_INVALID or JOB_SCHEMA_UNSUPPORTED; both terminal."
```

Claiming is **by event type**, so there is no filter that could route a
`REMAINING` row anywhere else.

### 5.2 Disposition

```text
DISPOSITION = D — a verified REMAINING obligation would DEAD-LETTER today
```

Not A (safely ignored), not B (routed elsewhere), and — importantly —
**not C**. The literal `'DEPOSIT'` comparison is what makes C impossible: a
remaining verification can never silently reserve stock a second time.
`APP8-W01`'s own file comment says so explicitly and names the fix as APP9's:
*"Extending this consumer is APP9's to do deliberately, not this handler's to
guess at."*

Concretely, once APP9's verification emits the true kind, each verified
remaining payment leaves one permanent `DEAD_LETTER` row in
`background_job_attempts` and one `payment.verified` outbox row that never
dispatches — visible to an operator, harmless to inventory, and wrong.

### 5.3 Constraint this places on the roadmap

Because the registry rejects a second handler for one event type, APP9 has
exactly two legal shapes:

- **(chosen)** extend `parsePaymentVerifiedPayload` to accept both kinds and
  have the handler no-op for `REMAINING`; or
- suppress `payment.verified` for `REMAINING`, which would make remaining
  verification invisible to every future consumer and contradict `SE-007` on
  `TR-LC14-06`.

The first is chosen. It confirms `FU-APP8-W01-01` exactly as APP8 routed it and
gives APP9 **one** worker checkpoint, worth **zero** HTTP operations and **zero**
new handlers.

---

## 6. Fulfillment audit

### 6.1 State

```text
FULFILLMENT_SCHEMA_STATE     = DELIVERED
FULFILLMENT_REPOSITORY_STATE = DELIVERED
FULFILLMENT_RUNTIME_STATE    = ABSENT
FULFILLMENT_HTTP_STATE       = ABSENT
FULFILLMENT_UI_STATE         = ABSENT
```

Schema: `shipping_details` (TBL-047, LC-19 `EDITABLE`/`FROZEN`),
`shipping_snapshots` (TBL-048, one dispatch freeze per order),
`shipping_fee_acknowledgements` (TBL-049). Immutability is a **database
mechanism**, not a documented gap: migration `0030` installs the
reject-mutation triggers for all three plus `refunds`, closing the `CST-094` /
`CST-100` gaps the schema headers still describe as open (`NF-APP9-R00-02`).

Repository: `DrizzleOrderShippingRepository`, served through the single
`OrderRepository` contract, with `@requiresTransaction` on every writer and
`DISPATCHABLE_FROM = 'READY_FOR_DELIVERY'` carrying the `GRD-016` half.

Runtime, HTTP and UI: no non-test caller anywhere in `apps/`. The only callers
are `apps/api/src/modules/order/tests/integration/order.integration.spec.ts`.

Searched semantic terms with no matching entity anywhere in schema or code:
`fulfillment` (as a table or state machine), `handoff`, `dispatch` (as a state),
`pickup` (as a state), `recipient` address book, `address_snapshot` separate
from `shipping_snapshots`, `delivery_completion`, customer-owned-product return.
**No migration is proposed.** An API that has not been composed is not a schema
gap.

### 6.2 Freeze authority

```text
FREEZE_TRIGGER                the dispatch transaction (TR-LC14-07). Not a separate
                              "freeze" command, not a scheduled job, not a UI action of
                              its own.
FREEZE_SOURCE_OF_TRUTH        shipping_details, the admin-editable order-owned record
                              (ADR-DB2-002). There is no address book in the MVP and the
                              recipient may differ from the customer.
FROZEN_FIELDS                 recipient_name, recipient_phone, address_line, ward,
                              district, province, country_code, fee_amount, currency_code,
                              carrier_name, tracking_code
                              -> copied byte-for-byte into shipping_snapshots with
                              dispatched_at; shipping_details moves EDITABLE -> FROZEN with
                              frozen_at set (CHECK-enforced).
IMMUTABILITY_RULE             GRD-024: after freeze every UPDATE/DELETE is rejected by
                              trg_shipping_details__reject_mutation and
                              trg_shipping_snapshots__reject_mutation. Corrections are
                              compensating order_transitions POST_FREEZE_CORRECTION events
                              with a reason — never an edit.
WHO_CAN_CHANGE_BEFORE_FREEZE  Admin only. A customer change request is a sensitive action
                              (ADR-DB3-004) the Admin applies; no customer write path
                              exists at any layer.
RELATION_TO_REMAINING_PAYMENT GRD-016 gates dispatch through the lifecycle: freeze can only
                              happen from READY_FOR_DELIVERY, which is only reachable once
                              REMAINING is SATISFIED. A fee change before freeze supersedes
                              the remaining obligation and, on an increase, needs a customer
                              acknowledgement row.
RELATION_TO_HANDOFF           freeze and DELIVERED are one atomic transaction. There is no
                              "ready for handoff" state; READY_FOR_DELIVERY is it.
RELATION_TO_ORDER_COMPLETION  COMPLETED is a separate admin transition (TR-LC14-08,
                              GRD-018) after DELIVERED. Terminal.
```

No snapshot material is invented: the address already lives on the order's own
shipping record, not on the customer profile, so the "never read mutable profile
data after the freeze point" rule is satisfied structurally rather than by
convention.

### 6.3 Carrier-tracking boundary — preserved

`shipping_details.carrier_name` and `.tracking_code` exist and are frozen into
the snapshot. `docs/03-USER-JOURNEYS.md` J8 step 2 says the Admin "records
shipping provider and optional tracking code **internally**", and step 5 says
"No external shipping tracking integration is required".

```text
CARRIER_TRACKING = STATIC_ADMIN_FIELDS_ONLY
NO carrier API, NO polling, NO webhook, NO parcel-event state machine,
NO delivery map, NO customer-facing tracking surface.
```

---

## 7. Cancellation / refund audit

### 7.1 Classification

```text
CANCELLATION_REFUND = PARTIALLY_GOVERNED_REQUIRES_PO_LOCK
```

**What is governed** — and governed unusually well:

- `ADR-DB3-002` locks the **S1–S9 stage matrix**: who may cancel at each stage,
  which stages need manual review, deposit / remaining / inventory / production
  effects, and the terminal result. **S9 (after dispatch) locks *no*
  cancellation** — which is exactly the freeze boundary.
- `DB3_CANCELLATION_COMPENSATION_SPEC.md` locks the saga: the six-step
  compensation order, the per-stage execution table, the idempotency namespaces
  (`order.cancel` / `request.cancel`), failure and retry semantics, and the
  callback-race rules.
- Its operation taxonomy explicitly separates **Cancel Order** from
  **Cancel/Pause Production Job**, confirming that `APP8-B04` and APP9 do not
  overlap.
- Persistence is complete: `order_cancellation_requests` (with the
  one-pending-per-order partial unique `CST-032`), `refunds` (LC-20
  `PENDING_REVIEW → APPROVED → EXECUTED`, `EXECUTED` requiring a transfer
  reference via `CST-073`), `payment_reconciliations`, plus repository methods
  for all of it including `refundableAmount()` for `GRD-021`.
- Refunds are explicitly **records, not provider automation**
  (`REFUND_METHODS = ['BANK_TRANSFER', 'OTHER']`). Consistent with `IMP-D052`;
  no automated provider refund may be invented.

**What is not governed:** `ADR-DB3-002` §Deferred Details states the per-stage
default refund dispositions are **policy configuration values (CON-144)**, with
owner "business" and acceptance "values configured before the payment feature
ships". `docs/implementation/14-IMPLEMENTATION-DECISION-REGISTER.md` carries the
same item:

```text
| IMP-O008 | Cancellation/refund policy parameters | APP9 | Before cancellation/refund checkpoints |
```

That is a genuine Product Owner decision (`PO-APP9-001`, §10), and it is the
**only** thing standing between the repository and an implementable
cancellation/refund slice.

### 7.2 `FU-APP8-B04-02` — the cancelled-job recovery path

APP8 routed here: *"a cancelled job leaves the order mid-lifecycle with nothing
scheduled."* Measured disposition:

- A cancelled production job **does not move the order**. `APP8-B04` is explicit
  about that, and it is correct: production cancellation is an *input to* a later
  commercial decision, not a commercial decision.
- The order therefore sits in `IN_PRODUCTION` (or `DEPOSIT_PAID` if the job was
  only `PLANNED`) with no job.
- **A replacement job for the same approval cannot be created.**
  `production_jobs` carries `unique('uq_production_jobs__order_approval_snapshot')`
  — a plain unique, not partial on live statuses. Re-planning is reachable only
  through the `ADR-DB3-003` reopen/revision path: `ON_HOLD` → new approval →
  repoint `orders.current_approval_snapshot_id` (an audited `POINTER_MOVE`) → a
  job against the *new* snapshot.
- The remaining recovery routes are `TR-LC14-09` `→ ON_HOLD` (already legal from
  every live state, already delivered) and `TR-LC14-11` `→ CANCELLING` under
  `GRD-020` at stage S6.

```text
FU-APP8-B04-02 DISPOSITION
  ORDER_STATES_NEEDING_RECOVERY = DEPOSIT_PAID (planned job cancelled),
                                  IN_PRODUCTION (started job cancelled)
  APP9 OWNS                     = the commercial cancellation branch only (S6),
                                  and only if PO-APP9-001 is locked
  REPLAN / RESTART              = NOT APP9's — it is the ADR-DB3-003 approval-revision
                                  path, already delivered, and blocked from a second job
                                  by uq_production_jobs__order_approval_snapshot
  ON_HOLD                       = already legal and already reachable; no new work
  CUSTOMER ACTION               = NOT ALLOWED at S6 without manual review
                                  (ADR-DB3-002: "Customer request -> manual review")
  IF PO-APP9-001 IS DEFERRED    = FU-APP8-B04-02 stays open and routes forward with
                                  IMP-O008; it is NOT retrofitted into APP8-B04
```

### 7.3 Race coverage carried in

`DB8_RACE_COVERAGE_MATRIX.md` **renumbers** the DB3 concurrency ids — the same
trap `APP8-R00` hit with CC-21. The mapping that matters here:

| DB3 id | DB8 id | Subject | P | Status |
|---|---|---|---|---|
| CC-14 | **CC-11** | final payment before dispatch (`GRD-016`) | P1 | **DEFERRED TO DB9** |
| CC-15 | **CC-12** | shipping frozen at dispatch (`GRD-017`) | P1 | **DEFERRED TO DB9** |

Neither is proven under contention. Both are `DEC-DB8-007` deferrals ("same
shape already proven at P0"), not gaps in the mechanism. The
`TR-LC14-06`-in-the-verification-transaction shape (§4.4) is what keeps CC-11
structurally unreachable; CC-12 is arbitrated by `FOR UPDATE` on
`shipping_details` plus the delivered trigger. Recorded as a nonblocking
finding, not a checkpoint.

---

## 8. Schema and repository matrix

| Capability | Table(s) | Repository | Disposition |
|---|---|---|---|
| Order lifecycle `PRODUCTION_COMPLETED → COMPLETED` | `orders`, `order_transitions` | `OrderRepository.loadForUpdate` / `transition` (+ `isLegalOrderTransition`) | **REUSE** |
| Remaining obligation | `payment_obligations` (kind `REMAINING`) | `findLiveForOrder(orderId, kind)`, `satisfy`, `cancel` | **REUSE** |
| Remaining attempts | `payment_attempts` | `openAttempt`, `lockAttemptForVerification` | **REUSE** |
| Transfer evidence | `payment_transfer_evidence` | APP7 evidence lane (attempt-scoped) | **REUSE** |
| Manual verification and reconciliation | `payment_reconciliations` | `appendReconciliation` | **REUSE** |
| Obligation recalculation on fee change | `payment_obligations.superseded_by_obligation_id` | `createForOrder` + `cancel` | **COMPOSE** |
| Fee acknowledgement | `shipping_fee_acknowledgements` | `acknowledgeShippingFee` | **COMPOSE** |
| Shipping detail (pre-freeze) | `shipping_details` | `saveShippingDetails`, `loadShippingDetail` | **COMPOSE** |
| Dispatch freeze + snapshot + `DELIVERED` | `shipping_snapshots` | `dispatch` | **COMPOSE** |
| Order completion | `orders.completed_at` | `transition` | **COMPOSE** |
| Cancellation review record | `order_cancellation_requests` | `openCancellationRequest`, `resolveCancellationRequest` | **COMPOSE** (gated on `PO-APP9-001`) |
| Refund record lifecycle | `refunds` | `openRefund`, `approveRefund`, `executeRefund`, `refundableAmount` | **COMPOSE** (gated on `PO-APP9-001`) |
| Audit | `audit_events` | delivered | **REUSE** |
| Outbox | `outbox_events` | delivered | **REUSE** |
| Provider callbacks | `payment_provider_events` | delivered but **unused** | **OUT_OF_SCOPE** — no provider exists (`IMP-D052`) |

```text
APP9_REQUIRED_SCHEMA_GAPS     = none
APP9_REQUIRED_REPOSITORY_GAPS = none for the commerce-completion path
APP9_SCHEMA_DISPOSITION       = NO_MIGRATION_REQUIRED
```

---

## 9. Worker / outbox matrix

| Event | Producer | Consumer | Current owner | APP9 action required |
|---|---|---|---|---|
| `payment.verified` | **YES** — `payment-decision.recorder.ts`, `obligationKind` hardcoded `'DEPOSIT'` | **YES** — `InventoryReservationHandler`, sole registrant | APP7 / APP8 | **REQUIRED** — producer must emit the true kind; consumer must accept and no-op `REMAINING` (`FU-APP8-W01-01`) |
| `payment.failed` | yes (SE-007 pair) | none | APP7 | none |
| `order.created` | yes (`createFromAcceptedQuotation`) | none | APP7 | none |
| `design.approved` | yes | `OrderConversionHandler` | APP6 / APP7 | none |
| `production.started` / `production.completed` | **no producer** — `APP8-B04` writes `production_job_transitions` rows, not outbox events | n/a | APP8 | **none** |
| `fulfillment.*` | none | none | — | **none** — no canonical event is named; do not invent one |
| `order.cancel` / `refund.*` | none | none | — | deferred with `PO-APP9-001` |
| `notification.*` | `NotificationDeliveryHandler` consumes intents | — | APP4 | **none** (§9.1) |

### 9.1 SE-010 / SE-011 notifications — a deliberate boundary

`notification_intents.template_key` is free text, so nothing structurally
prevents APP9 from emitting one. But **no domain flow does today**: the only
producer of notification intents is APP4's `request-notification.use-case.ts`
(verification codes and secure links). APP7 did not emit `SE-006` "payment
instructions"; APP8 emitted nothing. Emitting `SE-010` / `SE-011` in APP9 would
be a new cross-cutting behaviour with no precedent and no approved template.

```text
APP9 NOTIFICATION DISPOSITION = OUTBOX EVENTS ONLY, NO NOTIFICATION INTENT
```

`APP10-CUSTOMER-OPERATIONS-AND-COMMUNICATION.md` §4 owns "notification intent /
attempt operational search / retry" and customer communication. Recorded as a
nonblocking cross-phase finding (`NF-APP9-R00-04`), consistent with APP7 and
APP8 precedent rather than a new invention.

### 9.2 Does `production.completed` drive APP9 entry?

**No.** There is no `production.completed` outbox producer, and `TR-LC14-04` and
`TR-LC14-05` are two transitions with two different actors. APP9's entry is an
**Admin command**, exactly as `TR-LC14-05` specifies.

```text
PREDICTED_APP9_WORKER_HANDLERS = 0 added, 1 extended
```

---

## 10. Genuine Product Owner decisions

Exactly **one**.

```text
PO-APP9-001

QUESTION
  Does APP9 execute the commercial order cancellation / refund branch, and if so,
  what are the CON-144 default refund dispositions per ADR-DB3-002 stage (S5
  "refundable minus the digitizing-fee line", S6/S7 "default non-refundable",
  S8 "remaining default refundable")?

WHY_REPOSITORY_CANNOT_SETTLE_IT
  ADR-DB3-002 locks the stage matrix, the mechanics, the compensation order and the
  idempotency namespaces, and the persistence, constraints and triggers all ship. It
  then explicitly defers the monetary defaults to "policy configuration values
  (CON-144)" with owner "business" and acceptance "values configured before the
  payment feature ships". IMP-O008 carries the same item with owner APP9 and the
  condition "Before cancellation/refund checkpoints". No repository source contains a
  number, a percentage or a configuration row. Choosing one would be inventing
  business policy.

OPTIONS
  A. DEFER — APP9 delivers the commerce-completion path only (remaining payment ->
     fulfillment freeze -> delivery -> completion). IMP-O008 and FU-APP8-B04-02 stay
     open and route to a later phase. Roadmap = 13 checkpoints, 8-9 HTTP operations.
  B. PARTIAL LOCK — the Product Owner locks the S5-S8 defaults now; APP9 adds a
     bounded cancellation/refund tail (APP9-B06 cancellation review, APP9-B07 refund
     record lifecycle, APP9-A02 Admin cancellation/refund actions).
     Roadmap = 16 checkpoints, ~14 HTTP operations.
  C. FULL SAGA — APP9 implements LC-21 S1-S9 end to end, including the request
     branch, quotation voiding and grant disposition.

RECOMMENDATION
  A, with B as a follow-on phase or a Product-Owner-approved extension.
  Rationale: the accepted APP9 outcome is "remaining obligation, fulfillment freeze,
  completion / cancellation / refund **according to locked policy**" — the policy is
  not fully locked, and the provisional document itself says "cancellation/refund only
  where product policy is approved". The commerce-completion path is the R4 MVP's
  actual exit criterion and is fully governed today; shipping it first de-risks the
  phase and keeps every checkpoint small. C is rejected outright: LC-21 spans five
  bounded contexts and would violate the APP9 checkpoint-size rules no matter how it
  is sliced.

BLOCKING_CHECKPOINTS
  APP9-G01 (must record the ruling), and — under option B only — APP9-B06, APP9-B07
  and the second Admin checkpoint.
  Nothing on the commerce-completion path is blocked. APP9-B01 can begin immediately
  after G01 under either option.
```

Deliberately **not** escalated, because repository authority settles them:

| Candidate question | Settled by |
|---|---|
| Is there a payment provider or webhook for remaining payment? | No. `IMP-D052` / `PO-APP7-001`, `PAYMENT_MVP = MANUAL_BANK_TRANSFER`. |
| Who moves `PRODUCTION_COMPLETED → AWAITING_FINAL_PAYMENT`? | Admin. `TR-LC14-05`. |
| Synchronous or worker-driven `TR-LC14-06`? | Synchronous in the verification tx — the delivered `TR-LC14-02` precedent, and what makes DB3 CC-14 unreachable. |
| Is store pickup a separate lifecycle? | No. `DB3_SHIPPING_FEE_AND_FREEZE_SPEC.md` §2: "pickup/no-shipping: detail optional, fulfillment-method note, no separate state machine". |
| Is there a "ready for handoff" state? | No. `READY_FOR_DELIVERY` is it. LC-14 has eleven states and no twelfth. |
| Does the customer see carrier or tracking? | No. `03-USER-JOURNEYS.md` J8 step 2 — recorded "internally". |
| Does APP9 emit customer notifications? | No — §9.1, following APP7/APP8 precedent; APP10 owns communication. |
| A new grant scope for final payment? | No. `GRANT_SCOPE_KINDS = ['REQUEST_ACCESS']`; the same grant already reaches the order. |
| A migration anywhere in APP9? | No. §8. |

---

## 11. Candidate checkpoint evaluation — all fourteen

| Candidate | Repository truth | Disposition | Canonical replacement | Rationale |
|---|---|---|---|---|
| `APP9-C01` Remaining payment contract | Both obligations already exist from order creation; `PaymentObligationRepository` is already kind-parameterised; `APP0-B01` makes OpenAPI a build product of the controllers, so no contract-only deliverable exists | **REMOVE** | folded into `APP9-B01` / `APP9-B02` | A contract checkpoint that ships no operation ships nothing. The repository generalisation is done; the application layer is not, and that is code. |
| `APP9-B01` Remaining payment backend | Conflates three distinct authorities: `TR-LC14-05` (order lifecycle), the customer payment surface (payment module), and `TR-LC14-06` + verification (payment module + order lifecycle) | **SPLIT** | `APP9-B01` + `APP9-B02` + `APP9-B03` | Exactly one primary authority per backend checkpoint. "Exact remaining amount, eligibility, idempotency and provider reuse" is four authorities and one non-existent provider. |
| `APP9-S01` Remaining payment UI | `/truy-cap/thanh-toan` exists; `CustomerDepositView` deliberately has "nowhere to put" a remaining obligation; the same `REQUEST_ACCESS` grant reaches it | **KEEP** (`NEW_ROUTE_REQUIRED`) | `APP9-S01` | The route is a sibling, not an extension — APP7's view type is closed by design and its copy, states and QR reference are deposit-specific. |
| `APP9-B02` Remaining payment callback / reconciliation | **No provider exists.** `payment_provider_events` ships and is unused; `IMP-D052` locks manual bank transfer | **REDEFINE** | `APP9-W01` — the `payment.verified` `REMAINING` routing fix (`FU-APP8-W01-01`) | The legitimate residue of "reconciliation mapping" is the dead-letter defect, which is real, measured and worker-side. No webhook is invented. |
| `APP9-C02` Fulfillment contract | `shipping_details` / `shipping_snapshots` / `shipping_fee_acknowledgements` shipped in DB-era migration `0023`; freeze triggers in `0030`; repository complete | **REMOVE** | none | Fulfillment contracts and schema are already delivered from the DB phases, so a redundant contract checkpoint is exactly what must not be created. |
| `APP9-B03` Fulfillment backend | Mixes pre-freeze editable writes and reads with the dispatch-freeze transition and completion — different guards (`GRD-024` versus `GRD-016`/`017`/`018`) and different reversibility | **SPLIT** | `APP9-B04` (shipping detail write/read) + `APP9-B05` (dispatch freeze + completion) | An editable write is reversible; a freeze is terminal and trigger-enforced. Reviewing them in one slice hides the boundary that matters most in the phase. |
| `APP9-A01` Admin fulfillment queue | `/orders` already lists orders with a status filter; the fulfillment worklist is "orders in `AWAITING_FINAL_PAYMENT` / `READY_FOR_DELIVERY`" — a filter over an existing queue, not a new dataset | **REMOVE** | queue behaviour folded into the renamed `APP9-A01` | A second Admin queue over the same table with different `status[]` values duplicates a surface without creating an operational capability. |
| `APP9-A02` Admin fulfillment / order detail | `/orders/{orderId}` exists and already hosts the APP7 payment verification action (`payment-decision-command.ts`) | **REDEFINE → `APP9-A01`** | `APP9-A01` — Admin order fulfillment workspace, extending `/orders/{orderId}` | `EXTEND_EXISTING_ROUTE`. Every APP9 Admin action (`TR-LC14-05`, verify remaining, shipping detail, dispatch, complete) is an action *on one order*, and one order already has a detail screen with a guarded-action pattern. |
| `APP9-S02` Customer completion status | J7/J8 name no customer completion surface; `orderStatus` is already carried on the customer payment view; carrier and tracking are internal | **MERGE into `APP9-S01`** | `APP9-S01` | The customer's post-payment state is one field on a screen they already have. A second route to render one enum would be a screen built to match a plan rather than a need. |
| `APP9-C03` Cancellation / refund contract | `ADR-DB3-002` + `DB3_CANCELLATION_COMPENSATION_SPEC.md` lock the matrix and the saga; only the CON-144 monetary defaults are deferred (`IMP-O008`) | **REDEFINE** | `APP9-G01` — authority lock carrying `PO-APP9-001` | The correct replacement for a contract checkpoint whose policy is missing is a bounded authority/policy gate. The gap is one set of configuration values, not a contract. |
| `APP9-B04` Cancellation / refund backend | Persistence, triggers and `refundableAmount()` for `GRD-021` all ship; the six saga steps span five bounded contexts | **DEFER** (conditional `SPLIT`) | under `PO-APP9-001` option B only: `APP9-B06` (cancellation review) + `APP9-B07` (refund record lifecycle) | Illegal to implement until `PO-APP9-001` is answered. If activated it must be two checkpoints — a review record and a money record are different authorities. |
| `APP9-E01` Commerce completion E2E | `APP8-E01`'s three-command pattern (api / worker / admin) applies unchanged; `apps/api` cannot import `apps/worker` | **KEEP** | `APP9-E01` | Bounded to the cross-boundary commerce lifecycle. Accepted lower-checkpoint evidence is reused, not rerun. |
| `APP9-X01` Phase closure | — | **KEEP** | `APP9-X01` | Closure-only: measured baselines, follow-up classification, roadmap reconciliation. No feature work, no debt cleanup. |
| *(added by this audit)* | `APP9_FIGMA_ROWS_AT_ENTRY = 0`, no `APP_09` page exists | **ADD** | `APP9-D01` | The provisional §3 already requires one complete design package; the registry proves none exists. `DESIGN_GATE = DESIGN_REQUIRED_BEFORE_UI`. |

---

## 12. Customer and Admin UI dispositions

```text
APP9-S01 Remaining payment           NEW_ROUTE_REQUIRED     (a Storefront sibling of /truy-cap/thanh-toan)
APP9-S02 Customer completion status  NOT_REQUIRED           (merged into S01 — one status field)
APP9-A01 Admin fulfillment queue     NOT_REQUIRED           (a status filter on the existing /orders)
APP9-A02 Admin fulfillment detail    EXTEND_EXISTING_ROUTE  (/orders/{orderId}, renamed APP9-A01)
```

The minimal customer surface, per J7 step 5 and the freeze/tracking boundaries:
production-complete and awaiting-final-payment status, the exact remaining
amount, bank instructions and a dynamic QR, the optional transfer-evidence lane,
and the delivered/completed state — **with no carrier, no tracking code and no
shipment timeline**.

```text
PREDICTED_APP9_ADMIN_SCREENS    = 0 new routes, 1 extended route
PREDICTED_APP9_CUSTOMER_SCREENS = 1 new route
```

---

## 13. Canonical APP9 roadmap

Presented under `PO-APP9-001 = A` (recommended). Option B appends `B06`, `B07`
and a second Admin checkpoint after `B05`, before `D01`.

| # | Checkpoint | Purpose | Dependency | Main change area | HTTP ops | Migration? | Worker? | Design/UI? | Focused test scope |
|--:|---|---|---|---|--:|---|---|---|---|
| 1 | `APP9-R00` | Phase entry audit, authority reconciliation, canonical roadmap | APP8 closed | docs | 0 | no | no | no | static evidence only |
| 2 | `APP9-G01` | Authority lock: `PO-APP9-001`, the `TR-LC14-05..08` actor/guard map, the manual-transfer boundary, the no-notification and no-carrier-tracking boundaries | R00 | docs + decision register | 0 | no | no | no | none (documentation) |
| 3 | `APP9-B01` | `TR-LC14-05` — Admin moves `PRODUCTION_COMPLETED → AWAITING_FINAL_PAYMENT` and makes `REMAINING` payable | G01 | `order` module | 1 | no | no | no | the transition guard, LC-14 legality, replay-safety |
| 4 | `APP9-B02` | Customer remaining-payment surface: read, QR, attempt initiation — a sibling of the deposit lane, not a re-point | B01 | `payment` module (customer) | 3 | no | no | no | the grant→request→order→`REMAINING` walk, exact amount, reference derivation |
| 5 | `APP9-B03` | Admin remaining verification and `TR-LC14-06`: generalise the kind assertion, move `AWAITING_FINAL_PAYMENT → READY_FOR_DELIVERY` in the verification tx, emit the true `obligationKind` | B02 | `payment` module (admin) | 0–1 | no | no | no | the `GRD-016` chain under the order lock; DEPOSIT behaviour unchanged |
| 6 | `APP9-W01` | Extend the `payment.verified` consumer so a `REMAINING` verification is consumed and no-ops instead of dead-lettering (`FU-APP8-W01-01`) | B03 | `apps/worker` inventory-reservation | 0 | no | **yes** (1 extended, 0 added) | no | payload parser for both kinds; no second reservation; effect key unchanged |
| 7 | `APP9-B04` | Shipping detail write and read while `EDITABLE` (Admin only), including the fee-change acknowledgement path | B01 | `order` module | 2 | no | no | no | `SHIPPING_FROZEN` refusal; obligation recalculation on a fee change |
| 8 | `APP9-B05` | `TR-LC14-07` dispatch (freeze + snapshot + `DELIVERED`, atomic) and `TR-LC14-08` completion | B03, B04 | `order` module | 2 | no | no | no | `GRD-016` / `017` / `018`; post-freeze mutation rejected by the trigger |
| 9 | `APP9-D01` | One complete APP9 Figma design package on a new `APP_09` page; registry rows enter `REVIEW_REQUIRED` | B05 | `docs/design` + Figma | 0 | no | no | **yes** | `node tools/check-figma-design-index.mjs` |
| 10 | `APP9-A01` | Admin order fulfillment workspace — extend `/orders/{orderId}` with the `TR-LC14-05`, shipping-detail, dispatch and complete actions, plus the fulfillment status filter on `/orders` | D01 approved | `apps/admin` | 0 | no | no | **yes** | component tests for action visibility per `order.status` and each refusal |
| 11 | `APP9-S01` | Customer remaining-payment surface with the exact amount, QR, optional evidence and the order-completion status | D01 approved | `apps/storefront` | 0 | no | no | **yes** | component tests for each payment state; no carrier or tracking rendered |
| 12 | `APP9-E01` | Focused cross-boundary acceptance of the commerce-completion lifecycle | A01, S01 | scoped `apps/api` + `apps/worker` + `apps/admin` commands | 0 | no | no | no | 3 journeys, 10–13 cases (§14) |
| 13 | `APP9-X01` | Phase closure, measured baselines, follow-up classification | E01 | docs | 0 | no | no | no | static evidence only |

```text
TOTAL_NEW_HTTP_OPERATIONS = 8-9
```

Every backend slice is 1–3 operations; none reaches the hard maximum of five.
Each has exactly one primary authority: `B01` order lifecycle, `B02` customer
payment, `B03` payment verification, `B04` shipping preparation, `B05` the
freeze and terminal boundary. `D01` precedes both UI checkpoints. `E01` is
focused. `X01` is closure-only.

---

## 14. Predicted phase delta

```text
PREDICTED_APP9_HTTP_OPERATIONS  = 8-9   (92 -> 100/101 paths, 99 -> 107/108 operations)
PREDICTED_APP9_MIGRATIONS       = 0     (37 migrations / 79 tables unchanged)
PREDICTED_APP9_WORKER_HANDLERS  = 0 added, 1 extended
PREDICTED_APP9_FIGMA_ROWS       = one complete APP9-D01 package on a new APP_09 page,
                                  approximately 30-40 rows (APP7-D01 = 39, APP8-D01 = 41)
PREDICTED_APP9_ADMIN_SCREENS    = 0 new routes, 1 extended (/orders/{orderId} + /orders filter)
PREDICTED_APP9_CUSTOMER_SCREENS = 1 new route
PREDICTED_APP9_E01_JOURNEYS     = 3
PREDICTED_APP9_E01_CASE_BUDGET  = 10-13
```

The three E01 journeys, and nothing else:

1. **Remaining payment** — `PRODUCTION_COMPLETED` → `TR-LC14-05` → the customer
   reads the exact remaining amount and initiates → the Admin verifies →
   `READY_FOR_DELIVERY`, with `payment.verified` consumed and no second
   reservation created.
2. **Fulfillment freeze and completion** — shipping detail edited while
   `EDITABLE` → dispatch freezes and snapshots atomically → a post-freeze edit
   is rejected by the trigger → `DELIVERED` → `COMPLETED`.
3. **The negative guard** — dispatch is refused while `REMAINING` is unsatisfied
   (`GRD-016`), and completion is refused before `DELIVERED` (`GRD-018`).

Under option B, a fourth journey and 3–4 further cases would cover the S8
cancellation and one refund record reaching `EXECUTED`.

Every accepted lower-checkpoint proof is reused, not rerun. E01 samples the
cross-boundary commerce lifecycle; it does not retest each checkpoint's
internals.

---

## 15. Nonblocking findings

```text
NF-APP9-R00-01  DB8 CC-11 (final payment before dispatch, DB3 CC-14) and CC-12
                (shipping frozen at dispatch, DB3 CC-15) are both DEFERRED TO DB9 at
                P1. The mechanisms ship; the contention proofs do not. Note the id
                renumbering: DB8's own CC-14/CC-15 are different scenarios entirely.

NF-APP9-R00-02  The schema headers for shipping_details, shipping_snapshots,
                shipping_fee_acknowledgements and refunds still say CST-094 / CST-100
                is "not yet a database mechanism ... S24 owns the trigger". Migration
                0030 delivered all four triggers. The comments are stale, not the code.

NF-APP9-R00-03  payment_provider_events, its four indexes and its uniqueness constraint
                ship and have no producer. Correct under IMP-D052; recorded so a future
                reader does not mistake the table for evidence that a provider exists.

NF-APP9-R00-04  No domain flow emits a notification intent. SE-006 / SE-007 / SE-010 /
                SE-011 are specified but unimplemented as customer communication across
                APP7, APP8 and (by this roadmap) APP9. APP10 owns it. See §9.1.

NF-APP9-R00-05  uq_production_jobs__order_approval_snapshot is a plain unique, so a
                cancelled job cannot be replaced for the same approval snapshot.
                Re-planning is reachable only through the ADR-DB3-003 approval-revision
                path. Material to FU-APP8-B04-02; see §7.2.

NF-APP9-R00-06  shipping_details.fulfillment_note is the only carrier of the
                pickup-versus-delivery distinction (ADR-DB2-002 and DB3 shipping spec
                §2: no separate state machine). If store pickup ever needs to be
                queryable, that is a schema decision for a later phase, not an APP9 gap.
```

---

## 16. Validation

```text
VALIDATION_RUN
  git status --short                              clean working tree at entry
  git log -1 --format='%H %s'                     entry HEAD d2ab019
  git log origin/production..HEAD --oneline       16 local commits, NOT_PUSHED = true
  node -e "<count openapi.generated.json>"        92 paths / 99 operations / 206 schemas
  node -e "<filter order/payment/production ops>" the 15 APP7 + APP8 commerce operations
  ls packages/database/migrations                 37 migrations, last 0037
  grep / sed over packages/database/src/schema/** orders, shipping_details,
                                                  shipping_snapshots,
                                                  shipping_fee_acknowledgements,
                                                  order_cancellation_requests,
                                                  payment_obligations, refunds,
                                                  payment_reconciliations,
                                                  payment_provider_events,
                                                  secure_access_grants,
                                                  notification_intents, production_jobs
  grep over packages/database/migrations/0030     four reject-mutation triggers present
  grep / sed over packages/persistence/src/**     OrderRepository,
                                                  DrizzleOrderShippingRepository,
                                                  order-transitions.ts,
                                                  payment-evidence.repository.ts,
                                                  payment-obligation.repository.ts
  grep over apps/api/src/modules/payment/**       the five DEPOSIT-hardcoded application sites
  grep over apps/worker/src/**                    payment.verified producer and consumer, the
                                                  registry's duplicate-eventType throw,
                                                  JOB_PAYLOAD_INVALID terminality
  find over apps/admin and apps/storefront        21 Admin routes, 11 Storefront routes
  grep over docs/database/** and docs/adr/**      LC-14 matrix, GRD-016/017/018/020/021/024,
                                                  ADR-DB3-002 stage matrix, CON-144,
                                                  DB8 race coverage matrix
  grep over docs/design/FIGMA_DESIGN_INDEX.md     0 APP9 rows, no APP_09 write target
  grep over docs/implementation/14-...REGISTER.md IMP-O008 owner APP9, IMP-D052, IMP-D056

VALIDATION_NOT_RUN
  pnpm test / Jest (any package)      the whole API, worker, admin and storefront suites
  API integration suite               requires a live PostgreSQL
  worker acceptance suite             requires the disposable PG harness
  APP8-E01                            accepted evidence for unchanged code
  DB7 / DB8 race suites               accepted evidence for unchanged code
  Playwright / browser E2E
  Docker / docker compose
  turbo build, next build, nest build
  OpenAPI generation, API-client generation
  drizzle migration execution
  tools/check-figma-design-index.mjs  no design or frontend UI change in this checkpoint
  Prettier / ESLint / SonarQube       see WHY

WHY
  R00 changed Markdown only: no runtime source, no test, no schema, no migration, no
  generated artifact, no Figma node and no tooling file. VALIDATION_GOVERNANCE.md §3
  selects validations by change impact, and no executable subject changed. Running a
  functional suite here would test unchanged implementation and produce evidence about
  someone else's accepted checkpoint. The three global controls are likewise not
  justified by a Markdown-only diff and are never run as a repository-wide aggregate
  on reflex.
```

---

## 17. Stop

```text
APP9-R00 = COMPLETE_WITH_PO_DECISIONS_REQUIRED
PO_DECISIONS = PO-APP9-001 (cancellation/refund scope + CON-144 defaults, IMP-O008)
CANONICAL_APP9_ROADMAP = LOCKED_FOR_PO_REVIEW
NEXT_CHECKPOINT = APP9-G01
NOT_PUSHED = true
```

`PO-APP9-001` does not block `APP9-G01` — G01 is the checkpoint that records the
ruling. It blocks only the conditional cancellation/refund tail, and nothing on
the commerce-completion path.
