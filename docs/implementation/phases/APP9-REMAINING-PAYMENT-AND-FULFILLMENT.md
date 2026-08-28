# APP9 — Remaining Payment, Fulfillment and Completion

> **Status of this document.** Rewritten by `APP9-R00` from repository authority.
> The provisional version of this file was planning input; where the audit
> disproved it, the assumption has been removed rather than carried forward.
> Evidence: [`audits/APP9_PHASE_ENTRY_AUDIT.md`](../audits/APP9_PHASE_ENTRY_AUDIT.md),
> [`reports/APP9-R00-COMPLETION-REPORT.md`](../reports/APP9-R00-COMPLETION-REPORT.md).
>
> **Authority lock.** `APP9-G01` closed `PO-APP9-001` as **OPTION A — DEFER** and
> froze the implementation authority for every later checkpoint:
> [`audits/APP9_G01_COMMERCE_COMPLETION_AUTHORITY.md`](../audits/APP9_G01_COMMERCE_COMPLETION_AUTHORITY.md),
> [`reports/APP9-G01-COMPLETION-REPORT.md`](../reports/APP9-G01-COMPLETION-REPORT.md),
> register `IMP-D057`. Where this document and the authority package disagree,
> the authority package governs.

## 1. Audited outcome

Collect the `REMAINING` payment obligation APP7 created and left unsatisfied,
prepare and freeze the order's shipping information at dispatch, and carry the
order through `DELIVERED` to `COMPLETED` — composing persistence, guards and
lifecycle machinery the DB era already delivered.

APP9 is a **composition phase, not a greenfield one**. The complete APP9
persistence layer already ships, is integration-tested, and has **zero
non-test callers**:

```text
APP9_HTTP_OPERATIONS_AT_ENTRY = 0
APP9_RUNTIME_WRITES_AT_ENTRY  = 0
APP9_FIGMA_ROWS_AT_ENTRY      = 0
APP9_SCHEMA_DISPOSITION       = NO_MIGRATION_REQUIRED
```

Three provisional assumptions were disproved and are not carried forward:

1. **There is no payment provider, callback or webhook.** `IMP-D052` /
   `PO-APP7-001` lock `PAYMENT_MVP = MANUAL_BANK_TRANSFER`. Every checkpoint
   resting on "provider reuse" or "callback/reconciliation" is redefined or
   removed.
2. **Fulfillment contracts and schema are already delivered** (migration
   `0023`, freeze triggers in `0030`). No fulfillment contract checkpoint and
   no migration are created.
3. **There is no "ready for handoff" or "fulfilled" state.** LC-14's canonical
   names are `AWAITING_FINAL_PAYMENT`, `READY_FOR_DELIVERY`, `DELIVERED`,
   `COMPLETED`.

## 2. Dependencies

APP8 closed at `APP8-X01` with the order at `PRODUCTION_COMPLETED` and its
production job `COMPLETED`. `PO-APP9-001` (§6) is **closed** by `APP9-G01` as
**OPTION A — DEFER**; no APP9 checkpoint has an open Product Owner dependency.

## 3. APP8 handoff (binding, not reopened)

```text
production_job.status = COMPLETED
order.status          = PRODUCTION_COMPLETED     (TR-LC14-04)
APP9_EXECUTION        = NONE
```

`PO-APP8-005` as corrected by `APP8-G01-C1` (`IMP-D056`) is authority. APP8-owned
**production-job** cancellation stays APP8's and is distinct from commercial
order cancellation. APP9 changes no APP8 behaviour.

## 4. Payment authority summary

```text
REMAINING_OBLIGATION_EXISTS        = YES — created with DEPOSIT in the APP7-W01
                                     order-conversion transaction (INV-04 / TR-LC15-01)
REMAINING_AMOUNT_SOURCE            = quotation_versions.remaining_amount of the ACCEPTED
                                     version, copied verbatim
REMAINING_BECOMES_PAYABLE          = TR-LC14-05, an Admin transition — not a worker,
                                     not an event, not a consequence of TR-LC14-04
REMAINING_EVENT_MODEL              = the existing SE-007 `payment.verified` outbox event
                                     carrying the real obligationKind
REMAINING_PAYMENT_UI_REUSE         = HIGH — the same REQUEST_ACCESS grant already reaches it
REMAINING_TRANSFER_EVIDENCE_REUSE  = HIGH — the evidence lane is attempt-scoped
REMAINING_ADMIN_VERIFICATION_REUSE = HIGH at the repository layer; the application layer
                                     is DEPOSIT-hardcoded in five places and must be
                                     generalised
```

The canonical lifecycle, from `DB3_LIFECYCLE_SPECIFICATIONS.md` LC-14:

| Transition | From → To | Actor | Guard |
|---|---|---|---|
| `TR-LC14-05` | `PRODUCTION_COMPLETED` → `AWAITING_FINAL_PAYMENT` | **admin** | remaining obligation exists |
| `TR-LC14-06` | `AWAITING_FINAL_PAYMENT` → `READY_FOR_DELIVERY` | **system** (final payment verified) | remaining `SATISFIED` (**GRD-016**) |
| `TR-LC14-07` | `READY_FOR_DELIVERY` → `DELIVERED` | **admin** | **GRD-017** shipping frozen at dispatch |
| `TR-LC14-08` | `DELIVERED` → `COMPLETED` | **admin** | **GRD-018** delivered first |

Locked by `APP9-G01` (§3–§4 of the authority package), binding on every later
checkpoint:

```text
TR-LC14-05  actor ADMIN     PRODUCTION_COMPLETED   -> AWAITING_FINAL_PAYMENT
TR-LC14-06  actor SYSTEM    AWAITING_FINAL_PAYMENT -> READY_FOR_DELIVERY
            implementation ownership = synchronous, inside the Admin verification transaction
TR-LC14-07  actor ADMIN     READY_FOR_DELIVERY     -> DELIVERED   (freeze + snapshot, atomic)
TR-LC14-08  actor ADMIN     DELIVERED              -> COMPLETED

PAYMENT_MVP                       = MANUAL_BANK_TRANSFER   (IMP-D052 / PO-APP7-001)
DEPOSIT != REMAINING              = permanent               (CST-039)
LIVE_CARRIER_TRACKING             = OUT_OF_SCOPE
APP9_NOTIFICATION_INTENTS         = OUT_OF_SCOPE            (APP10 owns communication)
APP9_MIGRATIONS                   = 0
```

No provider, callback, webhook or automatic bank reconciliation is introduced,
and `READY_FOR_DELIVERY -> COMPLETED` is never collapsed into one transition.
The non-canonical names `ready for handoff`, `fulfilled`,
`fulfillment-completed` and `shipment-completed` must not return.

`TR-LC14-06` is implemented **synchronously inside the Admin verification
transaction**, following the delivered `TR-LC14-02` precedent. That is what
makes `GRD-016` (DB3 CC-14, dispatch-versus-payment) structurally unreachable,
and it is why APP9 adds **no new worker handler**.

**`payment.verified` routing defect (`FU-APP8-W01-01`), carried in from APP8:**
the sole registrant for that event type is `InventoryReservationHandler`, whose
payload parser rejects any `obligationKind` other than the literal `'DEPOSIT'`
with the terminal `JOB_PAYLOAD_INVALID`, and the worker registry throws at
startup if a second handler claims the same event type. A verified `REMAINING`
obligation would therefore **dead-letter** — never reserve stock a second time,
but never dispatch either. `APP9-W01` extended that one consumer to accept both
kinds and no-op for `REMAINING`.

**`FU-APP8-W01-01` = CLOSED** (`APP9-W01`). The parser now accepts the closed set
`{DEPOSIT, REMAINING}`; `reservation-trigger.policy.ts` decides that only
`DEPOSIT` reserves; and the live-runtime integration suite proves a REMAINING
event reaching `SUCCEEDED` with a `DISPATCHED` outbox row and zero inventory
writes, on the first delivery and on a redelivery. Still exactly one registered
handler for `payment.verified`, and no new event type.

## 5. Fulfillment authority summary

```text
FULFILLMENT_SCHEMA_STATE     = DELIVERED     shipping_details, shipping_snapshots,
                                             shipping_fee_acknowledgements
FULFILLMENT_REPOSITORY_STATE = DELIVERED     saveShippingDetails, dispatch,
                                             acknowledgeShippingFee, loadShippingDetail
FULFILLMENT_RUNTIME_STATE    = ABSENT
FULFILLMENT_HTTP_STATE       = ABSENT
FULFILLMENT_UI_STATE         = ABSENT

FREEZE_TRIGGER               the dispatch transaction (TR-LC14-07) — not a separate command
FREEZE_SOURCE_OF_TRUTH       shipping_details (ADR-DB2-002; no address book, recipient may
                             differ from the customer)
FROZEN_FIELDS                recipient_name, recipient_phone, address_line, ward, district,
                             province, country_code, fee_amount, currency_code,
                             carrier_name, tracking_code -> shipping_snapshots + dispatched_at
IMMUTABILITY_RULE            GRD-024, enforced by database triggers delivered in migration
                             0030; post-freeze corrections are compensating
                             order_transitions POST_FREEZE_CORRECTION events with a reason
WHO_CAN_CHANGE_BEFORE_FREEZE Admin only; a customer change request is a sensitive action
                             the Admin applies (ADR-DB3-004)
```

The fee lifecycle is authority too: a shipping-fee change before freeze
supersedes the remaining obligation (`SUPERSEDED` + a new row), and a fee
**increase** additionally requires a `shipping_fee_acknowledgements` row
carrying a grant and a step-up challenge.

## 6. Cancellation / refund disposition — DEFERRED

```text
PO-APP9-001                    = OPTION A — DEFER          (Product Owner, binding)
COMMERCIAL_CANCELLATION_REFUND = DEFERRED_FROM_APP9
CON_144_POLICY_VALUES_IN_APP9  = NOT_DEFINED
```

The Product Owner has ruled. Commercial order cancellation and refund are **not**
in APP9's active scope, and the question is closed: it is not re-asked inside
APP9, and options B (partial lock) and C (full saga) are withdrawn from active
planning. `APP9-B06`, `APP9-B07` and a cancellation/refund Admin checkpoint are
`NOT_CREATED`. Full authority:
[`audits/APP9_G01_COMMERCE_COMPLETION_AUTHORITY.md`](../audits/APP9_G01_COMMERCE_COMPLETION_AUTHORITY.md)
§1, register `IMP-D057`.

Why the deferral is safe: `ADR-DB3-002` locks the S1–S9 stage matrix and
`DB3_CANCELLATION_COMPENSATION_SPEC.md` locks the six-step saga;
`order_cancellation_requests`, `refunds`, `payment_reconciliations` and their
repository methods (including `refundableAmount()` for `GRD-021`) all ship, with
zero non-test callers. Refunds are **records, not provider automation** — no
automated provider refund may be invented. The one genuine gap is the per-stage
default refund dispositions, which `ADR-DB3-002` defers to policy configuration
values (CON-144) with owner **business** — money policy APP9 is forbidden to
invent, and on which the commerce-completion exit gate does not depend.

APP9 must not implement: commercial order cancellation endpoints,
`order_cancellation_requests` application flows, refund approval, refund
execution, refund Admin UI, refund customer UI, CON-144 configuration values, or
any refund percentage or monetary default. The existing persistence is left
untouched — not deleted, not redesigned, not migrated.

Routed forward as **nonblocking**:

```text
IMP-O008        DEFERRED / NONBLOCKING   Cancellation/refund policy parameters (CON-144)
FU-APP8-B04-02  CARRIED_FORWARD / NONBLOCKING
```

`FU-APP8-B04-02` (a cancelled job leaving the order mid-lifecycle) needs no new
APP8 work: the order stays where it is by design; `ON_HOLD` is already legal and
already delivered; a **replacement production job for the same approval snapshot
is impossible** because `uq_production_jobs__order_approval_snapshot` is a plain
unique, so re-planning is the `ADR-DB3-003` approval-revision path, not APP9's.
Nothing is retrofitted into `APP8-B04`.

## 7. In scope

- `TR-LC14-05` — Admin makes the `REMAINING` obligation payable.
- The customer remaining-payment surface: exact amount, bank instructions,
  dynamic QR, optional transfer evidence — a **sibling** of the deposit lane.
- Admin remaining-payment verification and `TR-LC14-06`, in one transaction.
- Extending the single `payment.verified` consumer so a `REMAINING`
  verification no-ops instead of dead-lettering.
- Shipping detail preparation while `EDITABLE`, including the fee-change
  acknowledgement path.
- `TR-LC14-07` dispatch (freeze + snapshot + `DELIVERED`, atomic) and
  `TR-LC14-08` completion.
- One complete APP9 Figma design package.
- The Admin order fulfillment workspace (extending `/orders/{orderId}`) and one
  new Storefront route.

## 8. Out of scope

- Any payment provider, callback, webhook or automatic bank reconciliation
  (`IMP-D052`).
- Any migration or schema change (`NO_MIGRATION_REQUIRED`).
- Live carrier tracking: no carrier API, polling, shipment timeline, courier
  webhook, parcel-event machine or delivery-map UI. `carrier_name` and
  `tracking_code` are static Admin-entered fields recorded **internally** (J8).
- Any customer-facing tracking surface.
- Combining `DEPOSIT` and `REMAINING` into one obligation.
- Commercial order cancellation and refund in every form — endpoints,
  `order_cancellation_requests` flows, refund approval/execution, refund UI,
  CON-144 configuration values (`PO-APP9-001 = OPTION A — DEFER`, §6).
- Inventing refund policy values, percentages or automated refund execution.
- Customer notification intents for `SE-010` / `SE-011` — APP9 emits outbox
  events only, following APP7 and APP8 precedent; APP10 owns communication.
- APP8 production semantics, production-job cancellation, and production
  artifact generation.
- A separate Admin fulfillment queue, and a separate customer completion route.

## 9. Design policy

`APP9_FIGMA_ROWS_AT_ENTRY = 0`; there is no `APP_09` page. One complete APP9
design package is delivered as a single checkpoint (`APP9-D01`) on a new
`APP_09` page in `FIG-FILE-PRODUCT`, entering `REVIEW_REQUIRED` with no
self-approval, and is **not** split across coding checkpoints.

```text
DESIGN_GATE = DESIGN_REQUIRED_BEFORE_UI
```

`APP9-A01` and `APP9-S01` are blocked until the package is
`APPROVED_FOR_IMPLEMENTATION`. Reusable patterns: APP7's secure customer payment
surface (bank instructions, exact-amount emphasis, QR card, copy affordance,
evidence lane, attempt state cards) and APP8's Admin guarded-transition action
group with a mandatory reason.

## 10. Canonical checkpoint roadmap

**Frozen by `APP9-G01` under `PO-APP9-001 = OPTION A — DEFER`.** Thirteen
checkpoints, no alternative. `B06`, `B07`, `A02`, `S02`, `C01`, `C02` and `C03`
are not added, and each row's authority boundary is locked in
[`APP9_G01_COMMERCE_COMPLETION_AUTHORITY.md`](../audits/APP9_G01_COMMERCE_COMPLETION_AUTHORITY.md)
§5.

| # | Checkpoint | Purpose | Dependency | Main change area | HTTP ops | Migration? | Worker? | Design/UI? | Focused test scope |
|--:|---|---|---|---|--:|---|---|---|---|
| 1 | `APP9-R00` | Phase entry audit, authority reconciliation, canonical roadmap | APP8 closed | docs | 0 | no | no | no | static evidence only |
| 2 | `APP9-G01` | Authority lock: `PO-APP9-001`, the `TR-LC14-05..08` actor/guard map, the manual-transfer, no-notification and no-carrier-tracking boundaries | R00 | docs + decision register | 0 | no | no | no | none (documentation) |
| 3 | `APP9-B01` | `TR-LC14-05` — Admin moves `PRODUCTION_COMPLETED → AWAITING_FINAL_PAYMENT` and makes `REMAINING` payable | G01 | `order` module | 1 | no | no | no | the transition guard, LC-14 legality, replay-safety |
| 4 | `APP9-B02` | Customer remaining-payment surface: read, QR, attempt initiation | B01 | `payment` module (customer) | 3 | no | no | no | grant→request→order→`REMAINING` walk, exact amount, reference derivation |
| 5 | `APP9-B03` | Admin remaining verification and `TR-LC14-06` in one transaction; emit the true `obligationKind` | B02 | `payment` module (admin) | 0–1 | no | no | no | the `GRD-016` chain under the order lock; DEPOSIT behaviour unchanged |
| 6 | `APP9-W01` | Extend the `payment.verified` consumer so `REMAINING` is consumed and no-ops (`FU-APP8-W01-01`) | B03 | `apps/worker` inventory-reservation | 0 | no | **yes** (1 extended, 0 added) | no | payload parser both kinds; no second reservation; effect key unchanged |
| 7 | `APP9-B04` | Shipping detail write and read while `EDITABLE`, plus the customer-owned fee-increase acknowledgement it requires | B01 | `order` module | 3 | no | no | no | `SHIPPING_FROZEN` refusal; obligation recalculation on a fee change; an increase blocked without a matching customer acknowledgement |
| 8 | `APP9-B05` | `TR-LC14-07` dispatch (freeze + snapshot + `DELIVERED`) and `TR-LC14-08` completion | B03, B04 | `order` module | 2 | no | no | no | `GRD-016`/`017`/`018`; post-freeze mutation rejected by the trigger |
| 9 | `APP9-D01` | One complete APP9 Figma design package on a new `APP_09` page | B05 | `docs/design` + Figma | 0 | no | no | **yes** | `node tools/check-figma-design-index.mjs` |
| 10 | `APP9-A01` | Admin order fulfillment workspace — extend `/orders/{orderId}`, plus the fulfillment status filter on `/orders` | D01 approved | `apps/admin` | 0 | no | no | **yes** | action visibility per `order.status`; each refusal |
| 11 | `APP9-S01` | Customer remaining-payment surface with the exact amount, QR, optional evidence and completion status | D01 approved | `apps/storefront` | 0 | no | no | **yes** | each payment state; no carrier or tracking rendered |
| 12 | `APP9-E01` | Focused cross-boundary acceptance of the commerce-completion lifecycle | A01, S01 | scoped api / worker / admin commands | 0 | no | no | no | 3 journeys, 10–13 cases |
| 13 | `APP9-X01` | Phase closure, measured baselines, follow-up classification | E01 | docs | 0 | no | no | no | static evidence only |

Every backend slice carries exactly one primary authority and 1–3 operations;
none reaches the hard maximum of five.

## 11. Critical end-to-end journey

Corrected to the canonical LC-14 vocabulary:

```text
PRODUCTION_COMPLETED
  -> (admin, TR-LC14-05)   AWAITING_FINAL_PAYMENT     remaining becomes payable
  -> (customer pays; admin verifies; TR-LC14-06)      READY_FOR_DELIVERY
  -> (admin, TR-LC14-07)   DELIVERED                  shipping frozen + snapshotted, atomically
  -> (admin, TR-LC14-08)   COMPLETED
```

Invariants the journey must prove:

- Fulfillment cannot complete while the remaining payment is unverified —
  `GRD-016` is expressed through the lifecycle: `DISPATCHABLE_FROM =
  READY_FOR_DELIVERY`, reachable only once `REMAINING` is `SATISFIED`.
- `DEPOSIT != REMAINING` — physically guaranteed by `CST-039`, one live
  obligation per `(order, kind)`.
- Post-freeze shipping mutation is rejected by a database trigger.
- No carrier-tracking scope appears anywhere.

## 12. Predicted phase delta

```text
PREDICTED_APP9_HTTP_OPERATIONS  = 8-9   (92 -> 100/101 paths, 99 -> 107/108 operations)
PREDICTED_APP9_MIGRATIONS       = 0     (37 migrations / 79 tables unchanged)
PREDICTED_APP9_WORKER_HANDLERS  = 0 added, 1 extended
PREDICTED_APP9_FIGMA_ROWS       = one APP9-D01 package on a new APP_09 page, ~30-40 rows
PREDICTED_APP9_ADMIN_SCREENS    = 0 new routes, 1 extended
PREDICTED_APP9_CUSTOMER_SCREENS = 1 new route
PREDICTED_APP9_E01_JOURNEYS     = 3
PREDICTED_APP9_E01_CASE_BUDGET  = 10-13
```

## 13. Exit gate

- `DEPOSIT` and `REMAINING` remain independent obligations.
- Dispatch and completion are impossible while the remaining payment is
  unverified.
- Shipping is frozen and snapshotted atomically at dispatch, and post-freeze
  mutation is rejected.
- A verified `REMAINING` obligation no longer dead-letters (`FU-APP8-W01-01`
  closed).
- No provider, webhook, migration or carrier-tracking scope appears.
- Cancellation and refund are explicitly deferred (`PO-APP9-001 = OPTION A`),
  with `IMP-O008` and `FU-APP8-B04-02` routed forward as nonblocking and no
  CON-144 value invented.
- `APP9-E01` passes.

## 14. Handoff

APP10 improves customer operations and communication — including the
notification intent and attempt operations this phase deliberately does not
build — without changing the completed commerce lifecycle.

## 15. Roadmap status

Exactly one unfinished row carries **NEXT**. This table is updated after every
APP9 checkpoint, and it is the only APP9 status table.

```text
R00   COMPLETE   (COMPLETE_WITH_PO_DECISIONS_REQUIRED — PO-APP9-001 raised;
                  entry baseline 92 paths / 99 operations / 206 schemas,
                  37 migrations / 79 tables, 0 APP9 Figma rows;
                  14/14 provisional candidates dispositioned into a 13-checkpoint
                  canonical roadmap; APP9_SCHEMA_DISPOSITION = NO_MIGRATION_REQUIRED)
G01   COMPLETE   (authority lock, documentation only — PO-APP9-001 = OPTION A —
                  DEFER recorded as binding (IMP-D057); TR-LC14-05..08 actor/guard
                  map, manual-bank-transfer, no-carrier-tracking and
                  no-notification-intent boundaries, freeze/snapshot authority and
                  the B01/B02/B03/W01/B04/B05/D01/A01/S01/E01/X01 boundaries frozen;
                  cancellation/refund DEFERRED with IMP-O008 and FU-APP8-B04-02
                  routed forward nonblocking; 13 active checkpoints; 0 runtime,
                  schema, OpenAPI, generated-client and Figma changes)
B01   COMPLETE   (TR-LC14-05 — POST /api/admin/orders/{orderId}/transitions,
                  adminOrder_transition, Admin-only; PRODUCTION_COMPLETED ->
                  AWAITING_FINAL_PAYMENT under one order row lock, guarded on a
                  live REMAINING obligation read kind-aware through
                  findLiveForOrder; the obligation is neither created,
                  recalculated nor satisfied and no payable flag exists; replay
                  is a deterministic ORDER_INVALID_TRANSITION with no second
                  transition row; side effects are the canonical order_transitions
                  row and nothing else; OpenAPI 92->93 paths, 99->100 operations,
                  206->208 schemas; 1 HTTP operation, 0 migrations, 0 worker
                  changes, 0 notification intents, 0 provider/webhook behaviour)
B02   COMPLETE   (customer REMAINING surface — POST /api/public/orders/final-payment,
                  /final-payment/qr and /final-payment/attempts;
                  publicOrderFinalPayment_current/_qr/_initiate; a sibling of the
                  deposit lane, with none of APP7's five customer payment
                  operations renamed or moved. The existing REQUEST_ACCESS grant
                  is reused and no grant scope is added; the walk is
                  grant -> request -> order -> live REMAINING through
                  findLiveForOrder, so DEPOSIT is never a fallback and a
                  SUPERSEDED or CANCELLED obligation is invisible. Payability is
                  derived, never stored: order AWAITING_FINAL_PAYMENT and
                  obligation PENDING gate the QR and the attempt, while the read
                  stays available afterwards and publishes `payable: false`. The
                  amount is the obligation's own frozen figure — no
                  total-minus-deposit anywhere — and the memo is the RM code
                  APP7-G01 §4 reserved, derived by a sibling of the DC builder
                  APP7 forbade a kind parameter on. The APP7 merchant
                  configuration, QR payload builder, encoder, step-up resolver
                  and payment.initiate idempotency namespace are reused
                  unchanged. Two shared helpers were narrowly generalised:
                  DepositTargetResolver -> PaymentTargetResolver (kind
                  parameter + order-only hop) and EvidenceAttemptAuthorizer
                  (attempt-scoped rather than DEPOSIT-scoped), so
                  EVIDENCE_REUSE = NARROWLY_GENERALISED with 0 new evidence
                  endpoints. OpenAPI 93->96 paths, 100->103 operations,
                  208->214 schemas; 3 HTTP operations, 0 migrations, 0 worker
                  changes, 0 Admin verification, 0 TR-LC14-06, 0 notification
                  intents, 0 provider/callback/webhook behaviour)
B03   COMPLETE   (Admin REMAINING verification and TR-LC14-06, delivered by
                  generalising the existing POST
                  /api/admin/payment-attempts/{attemptId}/verify —
                  adminPaymentAttempt_verify, 0 new HTTP operations and no
                  second verification route. The obligation kind is derived
                  from the locked obligation row, never accepted from the
                  request, and resolved through a closed two-row table
                  (DEPOSIT: AWAITING_DEPOSIT -> DEPOSIT_PAID;
                  REMAINING: AWAITING_FINAL_PAYMENT -> READY_FOR_DELIVERY) so a
                  third kind is refused rather than inheriting the deposit's
                  move. A source-state guard runs before any write — LC-14
                  legality is deliberately not the guard — and is re-proved by
                  transition()'s own FOR UPDATE, whose INVALID_TRANSITION is
                  classified rather than leaked. One transaction settles the
                  attempt SUCCEEDED, satisfies the obligation, appends the
                  reconciliation, moves the order and appends the outbox row;
                  GRD-016's causal order is structural because the obligation is
                  SATISFIED before the transition line runs. payment.verified
                  now carries the real obligationKind, closing R00's hard-coded
                  'DEPOSIT'. Replay still returns committed truth with no second
                  settlement, transition, reconciliation or event. The shared
                  chain resolver, decision recorder and error vocabulary were
                  narrowly generalised, so adminPaymentAttempt_review now
                  reaches a REMAINING attempt while still settling and moving
                  nothing. OpenAPI unchanged at 96 paths / 103 operations /
                  214 schemas — descriptions only, no operation, path or schema
                  added. 0 migrations, 0 worker changes, 0 new event types,
                  0 provider/callback/webhook, no shipping, dispatch, freeze or
                  completion. FU-APP8-W01-01 stays open by design: a correct
                  REMAINING event will now dead-letter until APP9-W01)
W01   COMPLETE   (the sole payment.verified consumer now accepts the closed kind
                  set {DEPOSIT, REMAINING}. DEPOSIT reserves exactly as APP8-W01
                  delivered — cases 1-9 of the live-runtime suite unchanged and
                  green. REMAINING is a successful no-op: SUCCEEDED attempt,
                  DISPATCHED outbox row, 0 reservations, 0 RESERVED ledger
                  entries, 0 inventory.reserve idempotency records, on-hand
                  untouched, and harmless on redelivery. Unknown kinds stay
                  terminal JOB_PAYLOAD_INVALID — no coercion onto either branch.
                  1 handler owns payment.verified, 0 handlers added, 0 HTTP
                  operations, 0 OpenAPI/client change, 0 migrations, 0 schema
                  change. FU-APP8-W01-01 = CLOSED)
B04   COMPLETE   (Admin editable shipping detail — GET/PUT
                  /api/admin/orders/{orderId}/shipping-detail,
                  adminOrderShipping_read / _save, Admin-only behind the APP1
                  guards. shipping_details is the single source of truth; no
                  customer profile, contact point or address book is read. The
                  read serves a FROZEN detail too and reports frozenAt; the
                  write is EDITABLE-only and refuses SHIPPING_FROZEN. The fee
                  baseline is the stored fee, or — before one is stored — the
                  ACCEPTED quotation version's frozen shipping_fee_amount, so a
                  first write cannot move money silently. Unchanged fee touches
                  no payment row at all. A change recalculates canonically:
                  successor = live REMAINING + (new fee - old fee), exact bigint
                  hundredths, never total - deposit. The predecessor is marked
                  SUPERSEDED with its amount untouched and
                  superseded_by_obligation_id set, exactly one successor becomes
                  live, and an OBLIGATION_RECALC reconciliation records it.
                  DEPOSIT is never touched. An increase requires a
                  shipping_fee_acknowledgements row whose grant and step-up
                  challenge are resolved server-side from the order's own chain
                  and validated live (scope, ACTIVE, unexpired, customer and
                  request match, fresh VERIFIED STEP_UP); no raw token, OTP,
                  hash or pepper is stored or published. A fee change against a
                  SATISFIED REMAINING is refused with zero writes — TR-LC15-04 is
                  PENDING -> SUPERSEDED alone and no backward LC-14 move is
                  invented; non-fee edits still succeed. No dispatch, freeze,
                  snapshot, completion, tracking, notification, provider, refund
                  or worker change. 0 migrations, 0 schema change.

                  APP9-B04-C1 = PASS. The fee-increase acknowledgement authority
                  was corrected: the Admin PUT no longer creates customer
                  evidence. A third operation was added — POST
                  /api/public/orders/shipping-fee-acknowledgements,
                  publicOrderShippingFee_acknowledge — and the customer records
                  their own decision through it, behind the existing
                  REQUEST_ACCESS grant with no new scope. The Admin increase now
                  requires a matching pre-existing acknowledgement (same order,
                  same previous fee as the locked baseline, same new fee, VND);
                  a mismatched, stale or foreign one cannot authorize. Admin
                  remains the sole shipping-detail editor: the customer command
                  holds no ORDER_REPOSITORY and carries no shipping field.
                  3 HTTP operations, +3 OpenAPI operations against the phase
                  entry baseline, 0 migrations, 0 schema change)
B05   COMPLETE   (dispatch freeze, delivery and order completion — POST
                  /api/admin/orders/{orderId}/dispatch and POST
                  /api/admin/orders/{orderId}/completion, adminOrder_dispatch /
                  adminOrder_complete, Admin-only behind the APP1 guards. Two
                  operations because they are two decisions: TR-LC14-07 records
                  that the parcel left, TR-LC14-08 that the order is closed, and
                  the order sits in DELIVERED between them. Neither takes a
                  request body — the operator, the dispatch instant and every
                  shipping fact are server-side, so none can be supplied.
                  Dispatch composes the delivered OrderRepository.dispatch: in
                  ONE transaction the shipping detail goes EDITABLE -> FROZEN
                  with frozen_at set, exactly one shipping_snapshots row is
                  written field-for-field from the authoritative pre-freeze
                  detail, and the order moves READY_FOR_DELIVERY -> DELIVERED
                  with one SHIPPING_FREEZE order_transitions row now carrying
                  actor_kind ADMIN and admin_id. Lock order orders FOR UPDATE ->
                  shipping_details FOR UPDATE -> payment_obligations, extending
                  APP9-B04's accepted order rather than inverting it. GRD-017 is
                  enforced as the schema's own answer — the detail must exist, be
                  EDITABLE and carry a fee, because shipping_snapshots.fee_amount
                  is NOT NULL; carrier_name and tracking_code are copied when
                  present and are NEVER required. GRD-016 is checked explicitly
                  in the dispatch transaction, as DB3_SHIPPING_FEE_AND_FREEZE_SPEC
                  §2, the guard catalog and CC-14 all require: the live REMAINING
                  obligation must be SATISFIED, because an APP9-B04 fee increase
                  can leave an order READY_FOR_DELIVERY owing money. Completion
                  is separate and writes to orders and order_transitions alone —
                  no second freeze, no second snapshot, no payment, shipping,
                  inventory, carrier or notification effect. Both replays are
                  deterministic refusals under the order-row lock, backed by
                  uq_shipping_snapshots__order. No carrier API, webhook, poll,
                  tracking lifecycle or customer tracking route. No cancellation
                  or refund change. 2 HTTP operations, +2 OpenAPI operations,
                  0 migrations, 0 schema change, 0 worker change)
D01   COMPLETE (one APP9 design package on the pre-existing, empty APP_09
                  page 766:2 — reused, not re-created. Root section 807:3,
                  14 sub-sections, 36 frames, 36 design-index rows all entered
                  REVIEW_REQUIRED with no approval evidence: 18 Admin, 12
                  Storefront, 6 shared specification frames. NEW_ADMIN_ROUTES=0
                  — only /orders and /orders/{orderId} extended, 0 sidenav
                  entries added; NEW_STOREFRONT_ROUTES=1 — one secure
                  final-payment/completion surface, APP9_S02 does not exist.
                  Ten delivered operation ids annotated and no others. Three
                  API limits drawn rather than hidden: no Admin read projects
                  the REMAINING obligation (FU-APP9-B03-02), the decision
                  response carries the balance under deposit-flavoured transport
                  names (FU-APP9-B03-01), and no customer projection returns a
                  server-authoritative proposed shipping fee — so
                  CUSTOMER_FEE_ACK_UI = BACKEND_READY / UI_DEFERRED, owner APP10.
                  No carrier, tracking, cancellation, refund, notification or
                  provider UI anywhere. 0 component masters, 0 instances, 0 new
                  variables or styles. Design/documentation only — 0 code, 0
                  migrations, 0 OpenAPI change)
A01   COMPLETE (Admin commerce-completion workspace. All 36 APP9 design-index
                  rows promoted REVIEW_REQUIRED -> APPROVED_FOR_IMPLEMENTATION
                  under FIG-APPROVAL-APP9-D01-PO-001. NEW_ADMIN_ROUTES=0 —
                  /orders gains the five fulfillment badge tones only, and
                  /orders/{orderId} gains a state-driven fulfillment rail beside
                  the existing APP7 deposit workbench. Five accepted operations
                  consumed and no backend added: adminOrder_transition,
                  adminOrderShipping_read/_save, adminOrder_dispatch,
                  adminOrder_complete. Three approved-but-unbacked figures were
                  deliberately NOT rendered — the PRODUCTION_COMPLETED and
                  open-dialog "total - deposit" balance, the acknowledged-fee
                  amount and the queue's deposit/remaining columns — because no
                  delivered read publishes them; the approved API-gap treatment
                  stands in their place. FU-APP9-B03-01 UI side closed (no
                  deposit-flavoured transport name reaches the screen);
                  FU-APP9-B03-02 kept as ACCEPTED_UI_DEGRADATION /
                  BACKEND_FOLLOWUP_REMAINS. 11 focused frontend cases, 0
                  migrations, 0 OpenAPI change, 0 generated-file edit.
                  APP9-A01-C1 = PASS: the curated api-client export surface,
                  which A01 had grown to 1231 lines, was split by domain into
                  eight barrels behind an unchanged root boundary — root
                  index.ts 46 lines, largest barrel 250, 414 exported names
                  before and after with none added or lost. Structural only:
                  0 Admin application source changed, 0 generated file, 0
                  OpenAPI change, 0 Figma change)
S01   COMPLETE (2026-08-27 — one Storefront route,
                  /truy-cap/thanh-toan-con-lai, carrying the whole customer
                  balance-and-completion surface: not-yet-payable, payable,
                  instructions + dynamic QR, optional transfer evidence, and
                  READY_FOR_DELIVERY / DELIVERED / COMPLETED progress.
                  NEW_STOREFRONT_ROUTES = 1, APP9-S02 does not exist.
                  publicOrderFinalPayment_current / _qr / _initiate only; the
                  APP7 evidence route reused with neutral copy and no new
                  endpoint. CUSTOMER_TRACKING_UI = NOT_IMPLEMENTED,
                  CUSTOMER_FEE_ACK_UI = BACKEND_READY / UI_DEFERRED.
                  10 focused frontend cases, 0 migrations, 0 OpenAPI change,
                  0 generated-file edit, 0 backend change)
E01   COMPLETE (2026-08-28 — cross-boundary acceptance only, 0 runtime or
                  business files changed. Two scoped serial commands, because
                  apps/api may not import apps/worker:
                  CMD-TEST-APP9-E01-API (4 journeys, 10 cases) and
                  CMD-TEST-APP9-E01-WORKER (journey 2B, 2 cases) — 12 cases,
                  all passed. Journeys 1-4 run on ONE order carried from
                  PRODUCTION_COMPLETED to COMPLETED: TR-LC14-05 opens final
                  payment without touching the live REMAINING row; the secure
                  link publishes that exact frozen amount and no other order's;
                  the QR decodes to it; the customer's attempt belongs to it;
                  Admin verification reaches SATISFIED + READY_FOR_DELIVERY and
                  emits exactly one payment.verified carrying
                  obligationKind = REMAINING; an unchanged-fee shipping save
                  recalculates nothing and mints no acknowledgement; dispatch
                  freezes, snapshots and reaches DELIVERED atomically;
                  completion reaches COMPLETED. Both replays are deterministic
                  409 ORDER_INVALID_TRANSITION with no duplicate row. The
                  worker half consumes the REMAINING event on an order that is
                  ALREADY reserved and leaves the reservation set, the ledger
                  and the shelf untouched. No real bank transfer, no Docker
                  browser stack, no OpenAPI or generated-file change,
                  0 migrations. CUSTOMER_FEE_ACK_UI stays
                  BACKEND_READY / UI_DEFERRED; the optional S01 static boundary
                  guard was NOT delivered, so FU-APP9-S01-04 stays open)
X01   COMPLETE (2026-08-28 — phase closure, documentation only. 0 runtime,
                  test, schema, migration, OpenAPI, generated-client and Figma
                  changes. Baselines verified read-only against the committed
                  repository and all matched: 100 paths / 108 operations /
                  222 schemas, 9 APP9-owned HTTP operations (99 -> 108),
                  37 migrations with 0 owned by APP9, 36 APP9 Figma rows all
                  APPROVED_FOR_IMPLEMENTATION under
                  FIG-APPROVAL-APP9-D01-PO-001, 0 new Admin routes and 1 new
                  Storefront route. E01 evidence reused, not re-executed.
                  31 follow-ups classified: 4 CLOSED, 18 NONBLOCKING_OPEN,
                  4 ACCEPTED_LIMITATION, 5 DEFERRED_TO_LATER_PHASE, 0 blocking.
                  APP9 = PASS_WITH_FOLLOW_UPS, PHASE = CLOSED.
                  Evidence: reports/APP9-X01-COMPLETION-REPORT.md,
                  reports/APP9-CLOSURE-MATRIX.md)
```

No row carries `NEXT`: every APP9 checkpoint is `COMPLETE` and the phase is
closed. `NEXT_PHASE = APP10 — Customer Operations and Communication`, which was
**not** begun.
