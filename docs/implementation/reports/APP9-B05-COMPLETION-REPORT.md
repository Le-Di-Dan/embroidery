# APP9-B05 — Completion Report

## 1. Verdict

```text
APP9-B05 = COMPLETE
APP9_B05_HTTP_OPERATIONS = 2
TR_LC14_07 = DELIVERED
SHIPPING_FREEZE = DELIVERED
SHIPPING_SNAPSHOT = DELIVERED
TR_LC14_08 = DELIVERED
LIVE_CARRIER_TRACKING = NOT_IMPLEMENTED
MIGRATIONS_ADDED = 0
SCHEMA_CHANGES = 0
WORKER_CHANGES = 0
NEXT_CHECKPOINT = APP9-D01
NOT_PUSHED = true
```

## 2. B04-C1 housekeeping commit

The accepted B04-C1 tree was still uncommitted, as its report stated. The
working tree was inspected and reconciled against
`APP9-B04-C1-COMPLETION-REPORT.md` §25 before anything was committed:

```text
tree at entry            39 paths, all already staged, 0 untracked
report §25 explicit      28 (11 new + 11 modified + 6 generated/doc)
report §25 "untouched"   11 (Admin controller, both Admin schemas,
                             admin-shipping.errors.ts, shipping-fee-amount.ts,
                             read-shipping-detail.query.ts,
                             payment-recalculation.repository.ts, the payment
                             obligation contract + its two siblings,
                             APP9-B04-COMPLETION-REPORT.md)
                         ----
                         39  ✓ exact match
```

The deleted `shipping-fee-acknowledgement.resolver.ts` does not appear because
it was never committed. One commit was created; no accepted behaviour was
altered and no B04 test was re-run for housekeeping.

```text
e7bcef5  feat(app9): deliver admin shipping detail and customer fee
         acknowledgement (APP9-B04 + C1)
```

## 3. Branch, entry HEAD, push state

```text
branch        production
B05 entry HEAD  e7bcef5   (the B04 housekeeping commit; tree clean)
pushed        no — nothing was pushed at any point
committed     no — the B05 tree is left uncommitted for review
```

## 4. The exact two operations

| # | Method | Path | Operation id | Transition |
|---|---|---|---|---|
| 1 | `POST` | `/api/admin/orders/{orderId}/dispatch` | `adminOrder_dispatch` | `TR-LC14-07` |
| 2 | `POST` | `/api/admin/orders/{orderId}/completion` | `adminOrder_complete` | `TR-LC14-08` |

No third operation. No freeze, snapshot, handoff, tracking, carrier-status or
delivery-confirmation endpoint exists, and the contract suite asserts that
absence across the **whole** document, not only under `admin/orders`.

## 5. Routes and operation ids

`AdminOrderDeliveryController` carries a `CONTROLLER_DOMAIN_KEYS` entry mapping
it to `adminOrder`, so the family now reads `_list`, `_detail`, `_transition`,
`_dispatch`, `_complete`. Without the entry the split module would have minted
`adminOrderDelivery_dispatch` — a composition decision naming a public
identifier. The three accepted `adminOrder` ids are unreissued, and the contract
suite asserts each one by name.

### Why verbs rather than widening `POST …/transitions`

`APP9-B01` owns `POST /api/admin/orders/{orderId}/transitions` with a one-member
`to` enum, and its own header says a later LC-14 move should "join this
operation". That reading was rejected here, for two reasons that are contract
facts rather than preferences:

1. Widening the enum delivers these two moves as **zero** new operations. §3
   requires exactly two, and a generated client would expose one method whose
   behaviour depends on a string.
2. The accepted `AdminOrderTransitionResultResponse` publishes
   `remainingObligationId`/`remainingObligationStatus` — the proof B01's guard
   read a real obligation row. That receipt means nothing for a dispatch, and
   reusing it would either publish two irrelevant fields or change an accepted
   schema.

The shape used instead is the delivered one for guarded Admin commands that are
not generic state moves: `POST …/{attemptId}/verify`, `…/{attemptId}/review`,
`…/versions/{versionId}/send`.

### Neither command takes a request body

Nothing is left for a caller to say: the order is named by the path, the
address/fee/carrier/tracking notes are already in `shipping_details` from
`APP9-B04`'s `PUT`, the dispatch instant is the server's, and the operator is
bound by the guard. `AdminQuotationSendController` is the delivered precedent
for a parameterless Admin command, down to the guard set. The contract suite
asserts `requestBody` is absent on both operations — a body would only be a
place to smuggle in an operator-supplied timestamp or a carrier prerequisite.

## 6. Admin authorization

```text
@Controller('admin/orders')
@UseGuards(AuthenticatedAdminGuard)        controller level — APP1, unchanged
  @Post(':orderId/dispatch')   @UseGuards(StaffOriginGuard)
  @Post(':orderId/completion') @UseGuards(StaffOriginGuard)
```

`StaffJsonBodyGuard` is deliberately absent: it exists to refuse a cross-site
HTML form post by requiring `application/json`, and a request with no body has
no JSON body to guard. `StaffOriginGuard` is what refuses a foreign origin.
This is the exact guard set `AdminQuotationSendController` uses for its own
bodyless command.

The operator identity is never a parameter. `requireOrderLifecycleAdminId`
reads the actor the guard bound, before the transaction opens, and fails loudly
on a non-ADMIN actor rather than shaping a wiring fault into a client refusal.

Neither command is reachable through `REQUEST_ACCESS`, the Storefront or any
customer action: `AdminOrderDeliveryModule` holds no grant authority, no secure
link resolver and no public controller.

## 7. Exact GRD-017 prerequisites

Recorded from the canonical guard catalog, the freeze spec and the delivered
schema — not from intuition.

| Fact | Required? | Authority |
|---|---|---|
| shipping detail exists | **yes** | GRD-017 "shipping detail complete"; delivered `dispatch` |
| `status = EDITABLE` | **yes** | LC-19 `EDITABLE → FROZEN`; a `FROZEN` detail means an order already dispatched |
| `fee_amount` present | **yes** | `shipping_snapshots.fee_amount` is `NOT NULL`; a freeze with no fee records an amount nobody agreed to |
| `recipient_name` / `recipient_phone` / `address_line` / `province` | yes, structurally | `NOT NULL` columns on `shipping_details` — a stored detail always has them |
| `country_code` | yes, structurally | `NOT NULL` with `DEFAULT 'VN'` |
| `currency_code = VND` | yes, structurally | `ck_shipping_details__currency_vnd` |
| `ward` / `district` | **no** | nullable in both tables ("per source") |
| **`carrier_name`** | **NO** | static internal fact; no authority makes it a dispatch prerequisite |
| **`tracking_code`** | **NO** | same — requiring it would be a carrier integration smuggled in as a guard |
| order state | `READY_FOR_DELIVERY` exactly | LC-14 `TR-LC14-07` |
| remaining payment | live `REMAINING` = `SATISFIED` | GRD-016 — see §8 |

Case 1 dispatches an order whose detail carries a carrier and a tracking code and
proves both are **copied** into the snapshot; nothing in the suite makes either
one a reason a dispatch succeeds or fails.

## 8. GRD-016 composition — which authority is actually used

**Both**, and the explicit check is not reassurance.

The source-state guard is primary: `READY_FOR_DELIVERY` is reachable only
through `TR-LC14-06`, which `APP9-B03` gates on `REMAINING = SATISFIED`. No
shortcut exists — `AWAITING_FINAL_PAYMENT → DELIVERED` and
`PRODUCTION_COMPLETED → DELIVERED` are not in LC-14's `ALLOWED` map and are not
reachable through either route.

An explicit `REMAINING = SATISFIED` check is performed as well, inside the
dispatch transaction, because three canonical documents put it there:

```text
DB3_SHIPPING_FEE_AND_FREEZE_SPEC.md §2
  "Freeze point: trong dispatch tx (TR-LC14-07): validate GRD-016
   (final payment) + shipping detail đầy đủ"
DB3_TRANSITION_GUARD_CATALOG.md GRD-016
  subject = obligation · scope = TR-LC14-06/07 · enforcement = tx
DB3_CONCURRENCY_SPECIFICATION.md CC-14
  "LOCK + GRD-016 in dispatch tx | dispatch fails until SATISFIED committed"
```

It is also load-bearing rather than duplicated. `APP9-B04`'s fee recalculation
supersedes a `SATISFIED` balance with a new `PENDING` successor **without moving
the order**, so an order can legitimately sit in `READY_FOR_DELIVERY` owing
money. The delivered repository comment claims the lifecycle expresses GRD-016;
against B04 that is no longer true, and case 3c proves the refusal.

The read is `PaymentObligationRepository.findLiveForOrder(orderId, 'REMAINING')`
— the single AGG-16 authority, kind-aware, filtered to the two states
`uq_payment_obligations__order_kind__live` arbitrates. `DEPOSIT` cannot stand in
for it, and a superseded or cancelled row is invisible to it. Nothing is
created, recalculated or satisfied.

## 9. Dispatch transaction composition

One `runInTransaction`, four steps, in this lock order:

```text
1. orders              FOR UPDATE   loadForUpdate — the decision's own lock,
                                    source state asserted against it
2. shipping_details    FOR UPDATE   lockShippingFeeBaseline — GRD-017's subject
3. payment_obligations              findLiveForOrder — GRD-016, kind-aware
4. shipping_details / shipping_snapshots / orders / order_transitions
                                    OrderRepository.dispatch(...) —
                                    freeze + snapshot + move, atomically
```

The delivered `dispatch(...)` already owns the freeze, the snapshot and the
lifecycle move in one transaction, so **no SQL was duplicated**, nothing reaches
past the repository to `shipping_snapshots`, and there is no freeze-in-one-
transaction-transition-in-another split. No SERIALIZABLE isolation, no advisory
lock, no new idempotency store.

`orders → shipping_details → payment_obligations` **extends** B04's accepted
`shipping_details → payment_obligations` order rather than inverting it, and
`DB8_LOCK_ORDER_MATRIX.md` §1 keeps the order row first. No cycle with B04
exists: its Admin write reads `orders` unlocked and never takes that lock, and
the obligation read here takes none.

Taking the shipping detail's lock at step 2 is what makes GRD-016 sound rather
than racy (`CC-15`). A concurrent B04 fee increase contends on exactly that row:
it either committed first — and its new `PENDING` obligation is what step 3
reads, so the dispatch refuses — or it blocks until this transaction commits and
then meets a `FROZEN` detail. There is no interleaving in which a dispatch
freezes an address a recalculation is still changing.

A refusal at any step leaves no freeze, no snapshot and no lifecycle row; cases
2, 3, 3b and 3c each assert all three absences from committed persistence.

## 10. Freeze behaviour

```text
shipping_details.status     EDITABLE -> FROZEN
shipping_details.frozen_at  = the canonical dispatch instant
shipping_details.updated_at = the same instant
orders.status               = DELIVERED
orders.delivered_at         = the same instant
```

The instant is taken **once** in the use case and passed through, so `frozen_at`,
`shipping_snapshots.dispatched_at` and `orders.delivered_at` cannot disagree
about when the order was dispatched.

Immutability triggers are preserved and untouched:
`trg_shipping_details__reject_mutation` is `frozen_when status = FROZEN`, so the
`EDITABLE → FROZEN` update passes and every later mutation is rejected. Nothing
thaws, deletes-and-recreates, or adds a post-freeze edit path. B04's `PUT`
already refuses `SHIPPING_FROZEN` and remains the only pre-freeze writer.

The receipt reads the frozen row back **inside the transaction** rather than
reporting what the code believes it wrote, and refuses rather than defaulting if
`frozen_at` were somehow absent.

## 11. Snapshot fields and source

Written by the delivered `dispatch(...)` from the row it just locked in
`shipping_details` — never from a customer profile, contact point or address
book, none of which this module can reach. Exactly the delivered schema's
columns, no field added:

```text
order_id · shipping_detail_id
recipient_name · recipient_phone · address_line
ward · district · province · country_code
fee_amount · currency_code
carrier_name · tracking_code
dispatched_at
```

Case 1 compares every one of the twelve copied values against the authoritative
pre-freeze detail, plus `shipping_detail_id` against the detail's own id.
`uq_shipping_snapshots__order` guarantees one per order.

## 12. TR-LC14-07 evidence

One `order_transitions` row per dispatch:

```text
from_status    READY_FOR_DELIVERY
to_status      DELIVERED
event_kind     SHIPPING_FREEZE          (canonical, ORDER_TRANSITION_EVENT_KINDS)
actor_kind     ADMIN                    ← corrected by this checkpoint
admin_id       the bound operator
correlation_id the request id
```

**The one persistence change B05 makes.** The delivered `dispatch(...)` hard-coded
`actor_kind = SYSTEM` with `system_job_key = 'order.dispatch'`, which contradicts
LC-14 (`TR-LC14-07` actor = **admin**) and §18. `dispatch(...)` now takes an
optional `RequestActor`; the Admin command passes its bound operator, and the
parameter is optional only so the pre-existing fixture and benchmark callers —
which use the freeze writer to *manufacture* a `FROZEN` detail rather than to
perform an operator's dispatch — keep recording what they honestly are. The
`actorColumns` mapping moved to its own file (`order-transition-actor.ts`) so
both writers to that table share one spelling of "who did this" without either
repository importing the other. No new audit architecture; `FU-APP9-B01-02`
remains nonblocking.

## 13. Dispatch replay and concurrency

**Deterministic refusal**, not committed-truth replay.

`TR-LC14-07` is legal from one state. After the first command commits, the order
is `DELIVERED`, so a retry fails the source-state assertion against the locked
`orders` row and writes nothing. Two concurrent commands serialise on that row;
the second reads `DELIVERED` and refuses. `uq_shipping_snapshots__order` is the
physical backstop behind the application guard.

Case 4 proves it from persistence: after a replay the snapshot count is 1 with
the **same id**, the `TR-LC14-07` row count is 1, and `frozen_at` is byte-identical
to before the replay. Response: `409 ORDER_INVALID_TRANSITION`.

## 14. TR-LC14-08 behaviour

```text
DELIVERED -> COMPLETED · actor ADMIN · guard GRD-018
lock:  1. orders FOR UPDATE (loadForUpdate)
       2. orders + order_transitions (transition)
```

Writes to `orders` and `order_transitions` and to nothing else. It does not
freeze shipping again (the detail is already `FROZEN` and its trigger would
reject the attempt anyway), creates no second snapshot, and touches no payment
obligation, attempt, reconciliation, shipping row, inventory record, carrier or
notification intent. It is a separate command from dispatch — case 5 dispatches
first and then completes, and asserts the shipping row and the snapshot are
**equal objects** before and after.

GRD-018 is asserted as the source state under the row's own lock rather than as
LC-14 legality: legality is necessary but says nothing about an order still in
`READY_FOR_DELIVERY`, so it would refuse for the right reason by accident.
`COMPLETED` is terminal, so an early completion has no way back.

## 15. Completion replay

Deterministic refusal, same shape. Case 7 asserts the transition list is
**deeply equal** to the list captured after the first completion, the order is
still `COMPLETED`, and the snapshot count is still 1. Response:
`409 ORDER_INVALID_TRANSITION`. No idempotency store was added.

## 16. No tracking, payment, notification or cancellation change

```text
carrier API / courier webhook / polling            none — no HTTP client,
shipment timeline / parcel-event machine           no scheduler, no carrier
delivery map / customer tracking endpoint          config in the module
tracking-status lifecycle / tracking worker
```

`carrier_name` and `tracking_code` appear only as the static internal columns
they already were: copied into the snapshot, never required, never published on
a B05 receipt, and never a refusal reason. The contract suite scans the whole
document for `carrier|tracking|courier|shipment|parcel|handoff|freeze|snapshot|
fulfil` paths and asserts none exists.

```text
REMAINING amount/status · payment attempts · reconciliation · payment.verified
APP9-B03 verification · APP9-B04 acknowledgement / recalculation
```

All unchanged. The obligation is **read** once and nothing more; the module
provides two use cases and neither calls any obligation writer.

No notification intent, email, SMS, delivery notification or completion
notification. APP10 owns customer communication (`APP9-G01` §8).
`FU-APP9-B01-01` is not solved here.

No cancellation, refund or `CON-144` change. `PO-APP9-001 = OPTION A — DEFER`
stands.

## 17. No migration, schema or worker change

```text
MIGRATIONS_ADDED = 0     no file added under packages/database/migrations
SCHEMA_CHANGES   = 0     no table, column, constraint, index or trigger touched
WORKER_CHANGES   = 0     apps/worker untouched
```

`shipping_snapshots` and `shipping_details` already existed with every column
this checkpoint uses.

## 18. OpenAPI before / after

```text
after accepted APP9-B04-C1   98 paths · 106 operations · 220 schemas   (verified)
after APP9-B05              100 paths · 108 operations · 222 schemas
                            ----------------------------------------
delta                        +2 paths ·  +2 operations ·  +2 schemas
```

`+2 operations` is exactly what §19 predicted. The schema delta was **measured,
not predicted**: `AdminOrderDispatchResponse` and `AdminOrderCompletionResponse`.
No request-body schema was added, because neither command takes a body.

```text
pnpm --filter @embroidery/api run openapi:generate   paths 100 · ops 108 · schemas 222
pnpm --filter @embroidery/api run openapi:check      artifact is up to date
```

No file was hand-edited.

## 19. Generated client

Regenerated by the normal Orval path and verified:

```text
pnpm --filter @embroidery/api-client run generate
  2 file(s): embroidery-api.schemas.ts, embroidery-api.ts
  bytes=364921 lines=8336
  tree hash a066848cb08ecef67e89decb428a52b2b8db9ccd78a9ca3ecb350272fd20ca84
pnpm --filter @embroidery/api-client run check:generated
  generated client is up to date (same tree hash)
```

Published as `adminOrderDispatch` / `adminOrderComplete` with their result
types. No manual edit. No handwritten TanStack Query hook was added — no
frontend consumes these yet (`APP9-A01` is a later checkpoint).

## 20. The 599-line harness — disposition

**Not touched.** `shipping-detail-context.ts` is still exactly 599 lines and
still byte-identical to the accepted B04-C1 file; `final-payment-context.ts` is
still exactly 400. Neither was split, trimmed or grown.

B05 has its own harness, `order-delivery-context.ts` (527 lines), because its
needs are genuinely different: a walk to `READY_FOR_DELIVERY` with the balance
satisfied, a complete shipping detail written pre-freeze, and readers for
`shipping_snapshots`, `orders.delivered_at`/`completed_at` and the transition
actor columns. Adding those to either accepted harness would have grown a file
that may not grow, or forced an accepted suite to be re-run for a change it did
not ask for.

The one delivered call site inside the 599-line file —
`orders.dispatch(orderId, new Date(), newId())` — still compiles unchanged,
which is precisely why the new actor parameter is optional rather than required.

## 21. Focused tests and counts

```text
1 focused contract group     admin-order-delivery.contract.spec.ts     9 tests
1 focused integration group  admin-order-delivery.integration.spec.ts 10 tests
```

| Case | Proof |
|---|---|
| 1 | dispatch success — `DELIVERED`, `FROZEN`, `frozen_at` set, **one** snapshot equal field-for-field to the pre-freeze detail (carrier and tracking included), **one** `SHIPPING_FREEZE` row with `actor_kind = ADMIN` and the bound `admin_id` |
| 2 | dispatch from `AWAITING_FINAL_PAYMENT` → 409 `ORDER_INVALID_TRANSITION`; order unchanged, detail still `EDITABLE`, no snapshot, transition count unchanged |
| 3 | GRD-017, no shipping detail → 409 `ORDER_SHIPPING_NOT_READY`; zero freeze/snapshot/lifecycle write |
| 3b | GRD-017, detail with every `NOT NULL` fact and **no fee** → 409; still `EDITABLE`, `frozen_at` null, no snapshot |
| 3c | GRD-016, balance unsatisfied → 409 `ORDER_REMAINING_PAYMENT_UNSATISFIED`; nothing written |
| 4 | dispatch replay → 409; snapshot count 1 with the same id, one `TR-LC14-07` row, `frozen_at` unchanged |
| 5 | completion success — `COMPLETED`, `completed_at` set, one `TR-LC14-08` ADMIN row; shipping row and snapshot **deep-equal** to before |
| 6 | completion from `READY_FOR_DELIVERY` → 409; `completed_at` null, no transition, no snapshot |
| 7 | completion replay → 409; transition list deep-equal to before, snapshot count still 1 |
| + | both commands refused `401` by the real `AuthenticatedAdminGuard` with no session, with nothing written |

Every "what happened" assertion reads **committed persistence** — the order row,
the shipping detail, `shipping_snapshots`, `order_transitions` — not the response
body (§24). No B05 HTTP command is used to build the precondition for a
different B05 behaviour; `FROZEN` is only ever reached by the command under
test, and every other state is produced by a canonical repository writer
(`createFromAcceptedQuotation`, `transition`, `createForOrder`, the real
`openAttempt → settleAttempt → satisfy` chain, `saveShippingDetails`).

`FROZEN`-mutation rejection is deliberately **not** re-proved; `APP9-B04` owns
that case (§23).

## 22. Validation order actually followed

```text
1  inspect      authority docs, guard catalog, freeze spec, CC-14/15,
                delivered dispatch(), transition(), B01/B04 use cases
2  implement    persistence actor seam + 2 use cases + controller + module
3  prettier     15 changed source/test files          2 rewritten, 13 unchanged
4  eslint       apps/api changed scope                clean
                packages/persistence changed scope    clean
   tsc          packages/persistence  --noEmit        clean
                apps/api              --noEmit        clean (after one fix)
5  fix          two static issues, see §23
6  openapi      generate → check                      clean
   client       generate → check:generated            clean
7  tests        contract (9) → integration (10)       all pass
8  docs         SCOPED_COMMAND_INDEX, roadmap, this report
```

Persistence was rebuilt (`pnpm --filter @embroidery/persistence run build`)
before the `apps/api` checks, so no stale `persistence/dist` could hide a real
type error at the package boundary.

## 23. Reruns and their exact intervening changes

Two reruns, each naming the source change that justified it:

| Rerun | Intervening change |
|---|---|
| `apps/api` `tsc --noEmit` | `order-delivery-context.ts` — six `row['…']` reads under `noUncheckedIndexedAccess` returned `string \| null \| undefined` against `string \| null` fields; `?? null` added to each |
| B05 contract spec | `admin-order-delivery.contract.spec.ts` — the expected sorted property list had `frozenAt` before `fromStatus`; `'m' < 'z'`, so the array literal was reordered to match `Array.prototype.sort` |

Both were failure-driven. The integration suite passed on its **first** run and
was not re-run. No combined final-confidence rerun was performed, and nothing was
re-run after the Markdown edits in §24's docs step.

## 24. Validations deliberately not run

Per §25, and because nothing in this change touches them:

```text
full pnpm test · full Jest · all API integration tests
all order/payment/shipping tests · B01/B02/B03 suites
W01 worker tests (apps/worker untouched) · APP7/APP8 E01
DB race suites · Playwright · Docker compose stack · full build
Admin/Storefront tests · Figma index check · manual QR scan
```

Repository-wide ESLint was **not** run: `FU-APP9-B04-C1-01` records that it
reproduces only inherited APP6 findings, and §26 forbids fixing that file here.
The changed-scope ESLint runs above are clean, which is the applicable evidence.
E01 has not begun.

## 25. Changed files and sizes

**New (7)**

```text
 25  packages/persistence/src/order/order-transition-actor.ts
 70  apps/api/src/modules/order/admin-order-delivery.module.ts
146  apps/api/src/modules/order/domain/lifecycle/order-delivery.errors.ts
239  apps/api/src/modules/order/application/admin/dispatch-order.use-case.ts
144  apps/api/src/modules/order/application/admin/complete-order.use-case.ts
225  apps/api/src/modules/order/presentation/admin-order-delivery.controller.ts
138  apps/api/src/modules/order/presentation/schemas/admin-order-delivery.response.ts
```

**New tests (2)**

```text
217  apps/api/src/modules/order/presentation/admin-order-delivery.contract.spec.ts   (test)
273  apps/api/src/modules/order/tests/integration/admin-order-delivery.integration.spec.ts (test)
527  apps/api/src/modules/order/tests/integration/order-delivery-context.ts          (test)
```

**Modified (6)**

```text
331  packages/persistence/src/order/drizzle-order.repository.ts        (actorColumns extracted; actor forwarded)
374  packages/persistence/src/order/drizzle-order-shipping.repository.ts (dispatch takes an actor)
315  packages/persistence/src/order/order.repository.ts                (dispatch contract + doc)
     apps/api/src/bootstrap/app.module.ts                              (module registration)
     apps/api/src/openapi/operation-id.ts                              (domain-key entry)
```

**Generated / documentation**

```text
packages/contracts/openapi/openapi.generated.json
packages/api-client/src/generated/embroidery-api.ts
packages/api-client/src/generated/embroidery-api.schemas.ts
docs/implementation/SCOPED_COMMAND_INDEX.md
docs/implementation/phases/APP9-REMAINING-PAYMENT-AND-FULFILLMENT.md
docs/implementation/reports/APP9-B05-COMPLETION-REPORT.md
```

Every runtime/application source file ≤ 400 lines; every test file ≤ 600. The
largest source file is `drizzle-order-shipping.repository.ts` at 374 (it gained
15 lines: the actor parameter, its default and the documentation for both).

Two scoped commands were registered: `CMD-TEST-APP9-B05-CONTRACT` and
`CMD-TEST-APP9-B05-INTEGRATION`.

## 26. Nonblocking findings

**FU-APP9-B05-01 — the delivered `dispatch(...)` doc comment overstated GRD-016.**
`drizzle-order-shipping.repository.ts` says "G-DB7-37 / GRD-016 is expressed
through the lifecycle: an order only reaches READY_FOR_DELIVERY once its
remaining obligation is satisfied." Since `APP9-B04` that is no longer
sufficient — a fee increase supersedes a satisfied balance without moving the
order. B05 does not weaken the repository's own source-state check and adds the
obligation check in the composing use case rather than editing an accepted
repository guard; the stale comment is worth correcting when that file is next
opened. Nonblocking: the behaviour is correct as delivered.

**FU-APP9-B05-02 — `Order` does not expose `completed_at`.** `toOrder` maps
`delivered_at` but not `completed_at`, so the completion receipt reports the
state rather than the timestamp. The column is written correctly (case 5 reads
it back with SQL). Adding it to the mapper is a persistence change no B05
requirement justifies.

**FU-APP9-B05-03 — `dispatch(...)`'s actor is optional.** Optional so the three
pre-existing fixture/benchmark call sites keep compiling, one of which is inside
the 599-line harness that may not grow. When that harness is next split by
responsibility, the parameter should become required so LC-14's admin actor
cannot be omitted by accident.

Existing follow-ups untouched, as §28 requires: `FU-APP9-G01-01`,
`FU-APP9-B01-01`, `FU-APP9-B01-02`, `FU-APP9-B02-01`, `FU-APP9-B03-01`,
`FU-APP9-B03-02`, `FU-APP9-W01-01`, `FU-APP9-B04-01`…`-04`,
`FU-APP9-B04-C1-01`, `IMP-O008`, `FU-APP8-B04-02`. `FU-APP8-W01-01` remains
CLOSED.

## 27. Roadmap

```text
R00   COMPLETE
G01   COMPLETE
B01   COMPLETE
B02   COMPLETE
B03   COMPLETE
W01   COMPLETE
B04   COMPLETE
B05   COMPLETE
D01   NEXT
A01   INCOMPLETE
S01   INCOMPLETE
E01   INCOMPLETE
X01   INCOMPLETE
```

Exactly one `NEXT`. D01 was not begun.

## 28. Stop

```text
NEXT_CHECKPOINT = APP9-D01
NOT_PUSHED = true
```
