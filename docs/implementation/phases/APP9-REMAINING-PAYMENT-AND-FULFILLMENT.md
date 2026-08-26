# APP9 — Remaining Payment, Fulfillment and Completion

> **Status of this document.** Rewritten by `APP9-R00` from repository authority.
> The provisional version of this file was planning input; where the audit
> disproved it, the assumption has been removed rather than carried forward.
> Evidence: [`audits/APP9_PHASE_ENTRY_AUDIT.md`](../audits/APP9_PHASE_ENTRY_AUDIT.md),
> [`reports/APP9-R00-COMPLETION-REPORT.md`](../reports/APP9-R00-COMPLETION-REPORT.md).

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
production job `COMPLETED`. `PO-APP9-001` (§6) must be answered by `APP9-G01`
before any cancellation or refund checkpoint; it blocks nothing on the
commerce-completion path.

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
but never dispatch either. `APP9-W01` extends that one consumer to accept both
kinds and no-op for `REMAINING`.

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

## 6. Cancellation / refund disposition

```text
CANCELLATION_REFUND = PARTIALLY_GOVERNED_REQUIRES_PO_LOCK
```

`ADR-DB3-002` locks the S1–S9 stage matrix and `DB3_CANCELLATION_COMPENSATION_SPEC.md`
locks the six-step saga; `order_cancellation_requests`, `refunds`,
`payment_reconciliations` and their repository methods (including
`refundableAmount()` for `GRD-021`) all ship. Refunds are **records, not
provider automation** — no automated provider refund may be invented.

The one gap is the per-stage default refund dispositions, deferred by
`ADR-DB3-002` to policy configuration values (CON-144) with owner "business",
and carried in the register as:

```text
| IMP-O008 | Cancellation/refund policy parameters | APP9 | Before cancellation/refund checkpoints |
```

```text
PO-APP9-001  Does APP9 execute the commercial cancellation/refund branch, and
             what are the CON-144 per-stage default refund dispositions?
  A. DEFER (recommended)  commerce-completion path only; IMP-O008 and
                          FU-APP8-B04-02 route forward. 13 checkpoints, 8-9 ops.
  B. PARTIAL LOCK         + APP9-B06 (cancellation review), APP9-B07 (refund
                          record lifecycle), one further Admin checkpoint.
                          16 checkpoints, ~14 ops.
  C. FULL SAGA            rejected — LC-21 spans five bounded contexts and cannot
                          be sliced within the APP9 checkpoint-size rules.
```

`FU-APP8-B04-02` (a cancelled job leaving the order mid-lifecycle) resolves as
follows: the order stays where it is by design; `ON_HOLD` is already legal and
already delivered; a **replacement production job for the same approval snapshot
is impossible** because `uq_production_jobs__order_approval_snapshot` is a plain
unique, so re-planning is the `ADR-DB3-003` approval-revision path, not APP9's;
and the commercial cancellation branch (stage S6) is APP9's only under option B.
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
- Commercial cancellation and refund records **only under `PO-APP9-001` = B**.

## 8. Out of scope

- Any payment provider, callback, webhook or automatic bank reconciliation
  (`IMP-D052`).
- Any migration or schema change (`NO_MIGRATION_REQUIRED`).
- Live carrier tracking: no carrier API, polling, shipment timeline, courier
  webhook, parcel-event machine or delivery-map UI. `carrier_name` and
  `tracking_code` are static Admin-entered fields recorded **internally** (J8).
- Any customer-facing tracking surface.
- Combining `DEPOSIT` and `REMAINING` into one obligation.
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

Under `PO-APP9-001 = A` (recommended). Option B appends `B06`, `B07` and one
further Admin checkpoint after `B05`, before `D01`.

| # | Checkpoint | Purpose | Dependency | Main change area | HTTP ops | Migration? | Worker? | Design/UI? | Focused test scope |
|--:|---|---|---|---|--:|---|---|---|---|
| 1 | `APP9-R00` | Phase entry audit, authority reconciliation, canonical roadmap | APP8 closed | docs | 0 | no | no | no | static evidence only |
| 2 | `APP9-G01` | Authority lock: `PO-APP9-001`, the `TR-LC14-05..08` actor/guard map, the manual-transfer, no-notification and no-carrier-tracking boundaries | R00 | docs + decision register | 0 | no | no | no | none (documentation) |
| 3 | `APP9-B01` | `TR-LC14-05` — Admin moves `PRODUCTION_COMPLETED → AWAITING_FINAL_PAYMENT` and makes `REMAINING` payable | G01 | `order` module | 1 | no | no | no | the transition guard, LC-14 legality, replay-safety |
| 4 | `APP9-B02` | Customer remaining-payment surface: read, QR, attempt initiation | B01 | `payment` module (customer) | 3 | no | no | no | grant→request→order→`REMAINING` walk, exact amount, reference derivation |
| 5 | `APP9-B03` | Admin remaining verification and `TR-LC14-06` in one transaction; emit the true `obligationKind` | B02 | `payment` module (admin) | 0–1 | no | no | no | the `GRD-016` chain under the order lock; DEPOSIT behaviour unchanged |
| 6 | `APP9-W01` | Extend the `payment.verified` consumer so `REMAINING` is consumed and no-ops (`FU-APP8-W01-01`) | B03 | `apps/worker` inventory-reservation | 0 | no | **yes** (1 extended, 0 added) | no | payload parser both kinds; no second reservation; effect key unchanged |
| 7 | `APP9-B04` | Shipping detail write and read while `EDITABLE`, including the fee-change acknowledgement path | B01 | `order` module | 2 | no | no | no | `SHIPPING_FROZEN` refusal; obligation recalculation on a fee change |
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
- Cancellation and refund are either fully governed and delivered (option B) or
  explicitly deferred with `IMP-O008` and `FU-APP8-B04-02` routed forward
  (option A).
- `APP9-E01` passes.

## 14. Handoff

APP10 improves customer operations and communication — including the
notification intent and attempt operations this phase deliberately does not
build — without changing the completed commerce lifecycle.

## 15. Roadmap status

Exactly one unfinished row carries **NEXT**. This table is updated after every
APP9 checkpoint, and it is the only APP9 status table.

```text
R00   COMPLETE   (COMPLETE_WITH_PO_DECISIONS_REQUIRED — PO-APP9-001 open;
                  entry baseline 92 paths / 99 operations / 206 schemas,
                  37 migrations / 79 tables, 0 APP9 Figma rows;
                  14/14 provisional candidates dispositioned into a 13-checkpoint
                  canonical roadmap; APP9_SCHEMA_DISPOSITION = NO_MIGRATION_REQUIRED)
G01   NEXT       (authority lock; must record PO-APP9-001 and the TR-LC14-05..08
                  actor/guard map; no runtime change)
B01   INCOMPLETE
B02   INCOMPLETE
B03   INCOMPLETE
W01   INCOMPLETE
B04   INCOMPLETE
B05   INCOMPLETE
D01   INCOMPLETE
A01   INCOMPLETE
S01   INCOMPLETE
E01   INCOMPLETE
X01   INCOMPLETE
```
