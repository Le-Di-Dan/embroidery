# APP12-B05 — Admin FULL Verification and Ready-Made Fulfilment

```text
CHECKPOINT      = APP12-B05
PHASE           = APP12 — Hardening, UAT and Production Readiness
STATUS          = COMPLETE
DATE            = 2026-09-02
CORRECTION_USED = 0 / 1
NEXT            = APP12-S01
PUSHED          = false
```

---

## A. Verdict

`APP12-B05` is **COMPLETE**.

Ready-Made backend commerce is closed end to end. An Admin verifying a real bank
transfer now settles the `FULL` obligation, commits the reserved stock
permanently and moves the order to `READY_FOR_DELIVERY` — in **one** transaction
— and the delivered APP9 dispatch and completion commands carry it to
`DELIVERED` and `COMPLETED` unchanged.

```text
NEW_HTTP_OPERATIONS = 0
MIGRATIONS          = 38   (DB schema delta 0)
OPENAPI             = 125 paths / 138 operations / 277 schemas   (unchanged)
PUBLIC_OPERATIONS   = 49                                          (unchanged)
RELEASE_MATRIX      = 28 DENY / 18 ALLOW / 3 SCOPE_GATED          (unchanged)
FIGMA / UI          = unchanged
```

---

## B. Preflight

Six findings, all mechanical, none inferred from an enum name.

### B1 — `toOrder` refuses a Ready-Made row (the structural blocker)

`packages/persistence/src/order/order-row.mapper.ts:34` throws
`ORDER_ORIGIN_NOT_CUSTOM` when the three custom-chain columns are `NULL`, which
`APP12-DB01` made possible. Four delivered `OrderRepository` seams map through
it, so for a `READY_MADE` order **all** of these threw:

| seam | consumer |
|---|---|
| `findById` | `PaymentDecisionChainResolver`, `RouteAttemptToReview`, `ReviewPaymentAttemptUseCase` |
| `loadForUpdate` | `DispatchOrderUseCase`, `CompleteOrderUseCase` |
| `transition` | `VerifyPaymentAttemptUseCase`, `CompleteOrderUseCase` |
| `dispatch` | `DispatchOrderUseCase` |

`adminPaymentAttempt_verify`, `adminOrder_dispatch` and `adminOrder_complete`
were therefore **structurally unreachable** for half the shop — the same class of
defect `APP12-B03` found in the shipping commands, and it could not have been
discovered by widening the kind table alone.

### B2 — `lockShippingFeeBaseline` carries the same defect

Its second statement is an inner join through
`orders.accepted_quotation_version_id` to `quotation_versions`. That column is
`NULL` on a Ready-Made order, so the join matched nothing and dispatch answered
`ORDER_NOT_FOUND` for an order that plainly exists. Confirmed at runtime before
the fix, not by reading.

### B3 — `GRD-016` hard-codes `REMAINING`

`assertRemainingSatisfied` read `findLiveForOrder(id, 'REMAINING')`.
`ck_payment_obligations__kind_by_origin` forbids a `REMAINING` obligation on a
Ready-Made order, so every **paid** Ready-Made order would have been refused
`ORDER_REMAINING_PAYMENT_MISSING`.

### B4 — the delivered verification lock order is wrong for Ready-Made

```text
delivered verification   payment_attempts -> payment_obligations (satisfy)
                                          -> orders (transition)
expiry sweep             orders -> inventory_reservations -> sku_stocks
                                -> payment_obligations (cancel)
APP12-B03 fee command    orders -> shipping_details -> inventory_reservations
                                -> payment_obligations
```

A `FULL` verification that kept the delivered order would hold
`payment_obligations` and ask for `orders`, against a sweep holding `orders` and
asking for `payment_obligations` — a cycle, and `40P01` under load rather than
the clean arbitration `BR-026` needs. See §F.

### B5 — the canonical consume authority

```text
SkuStockRepository.lockActiveOrderReservation(orderId)   APP12-B03 seam, order-only
SkuStockRepository.consumeReservation(id, actor)         APP8-B02 CC-21 writer
  -> applyConsume (reservation-terminalization.ts:277)
       inventory_reservations  RESERVED -> CONSUMED, terminalized_at
       sku_stocks              quantity_on_hand -= reservation.quantity
       inventory_ledger_entries  one CONSUMED row, on_hand_delta = -quantity
```

`applyConsume` is the **only** path that reduces on-hand. Exactly-once comes from
`lockReservedReservationById`, which refuses any row that is not `RESERVED`.

### B6 — the kind is the origin discriminator

`ck_payment_obligations__kind_by_origin` makes the kinds mutually exclusive by
origin, so the kind read off the locked `payment_obligations` row already tells
the server which commerce shape it is holding. No surface accepts an origin and
no client can select a kind.

---

## C. Existing operation reuse

```text
NEW_HTTP_OPERATIONS = 0
```

| operation | change |
|---|---|
| `adminPaymentAttempt_verify` | reused; `FULL` added to the kind tables it already reads |
| `adminOrder_dispatch` | reused; origin-neutral order seam + kind-by-origin `GRD-016` |
| `adminOrder_complete` | reused; origin-neutral order seam |

No `/verify-full`, `/mark-paid`, `/ready-made-dispatch`, `/ready-made-complete`
or `/consume-stock` exists. Two operation **descriptions** were corrected to
state the third kind and the Ready-Made dispatch prerequisites truthfully; that
is the whole OpenAPI delta.

---

## D. FULL verification-kind extension

`apps/api/src/modules/payment/domain/verification/verified-payment-transition.ts`
— one row, exactly as that file predicted a third kind would arrive:

```text
DEPOSIT     AWAITING_DEPOSIT        -> DEPOSIT_PAID          TR-LC14-02
REMAINING   AWAITING_FINAL_PAYMENT  -> READY_FOR_DELIVERY    TR-LC14-06
FULL        AWAITING_PAYMENT        -> READY_FOR_DELIVERY    APP12-B05
```

and one row in `REFERENCE_BUILDER` (`fullTransferReference`, the `…FL` memo
`APP12-B04` minted). `VERIFIABLE_OBLIGATION_KINDS` grows to three.

`FULL` and `REMAINING` deliberately share a **target** — the two commerce shapes
converge on one fulfilment lifecycle, which is why dispatch and completion need
no Ready-Made twin — and never a **source**: `AWAITING_PAYMENT` is reachable
only on the Ready-Made side and `AWAITING_FINAL_PAYMENT` only on the custom one,
so neither kind's transition can be applied to the other's order. The source
guard refuses it before anything is written.

No separate Ready-Made verifier, no origin parameter, no `if (kind === 'FULL')`
anywhere in the use case.

---

## E. Verification eligibility

All enforced inside the transaction, from committed rows:

| requirement | arbiter |
|---|---|
| kind is verifiable | `verifiedPaymentTransitionFor` lookup (no row ⇒ refuse) |
| attempt is a bank transfer | delivered `BANK_TRANSFER_METHOD` check |
| attempt is open | `classifyAttemptForVerification` |
| obligation is the **current live** one | `obligation.status === 'PENDING'` |
| order is `AWAITING_PAYMENT` | `orderStatus !== transition.source` guard |
| reservation is `RESERVED` | `lockActiveOrderReservation` under the `orders` lock |
| amount and memo match exactly | delivered `judgeObservedTransfer` |

**Supersession needs no new guard.** `APP12-B03`'s fee correction moves the
predecessor to `SUPERSEDED`, which is not `PENDING`, so the delivered obligation
guard already refuses it — and `uq_payment_obligations__order_kind__live` is what
makes "the `PENDING` one" and "the live one" the same row.

Refused, each proved: superseded `FULL`, cancelled `FULL`, satisfied `FULL`
(replay), cancelled order, expired reservation, an order past
`AWAITING_PAYMENT`.

---

## F. Atomic payment/order/inventory transaction

One `runInTransaction`, no `try`/`catch` inside it, no compensation path:

```text
lock the attempt; read its obligation and order; derive expected facts
replay?  -> return committed truth, write nothing
guards   -> attempt open, obligation PENDING, order at the kind's source state
judge observed against expected
  mismatch -> REQUIRES_REVIEW + reconciliation + audit   (no stock touched)
  match    -> settlement effect   FULL only: consume the reservation
           -> attempt   SUCCEEDED
           -> obligation SATISFIED by this exact attempt
           -> order      AWAITING_PAYMENT -> READY_FOR_DELIVERY
           -> reconciliation + audit + payment.verified
commit
```

**Lock order**, now recorded in `DB8_LOCK_ORDER_MATRIX.md` §1 and §2:

```text
1. payment_attempts        FOR UPDATE   lockAttemptForVerification
2. orders                  FOR UPDATE   loadLifecycleForUpdate   (settlement)
3. inventory_reservations  FOR UPDATE   lockActiveOrderReservation
4. sku_stocks              FOR UPDATE   inside consumeReservation
5. payment_obligations     FOR UPDATE   satisfy
6. orders                  (already held) transitionLifecycle
```

The settlement runs **before** `settleAttempt`/`satisfy`, and that is a lock-order
decision rather than a stylistic one (§B4). Taking `orders` first puts the `FULL`
path on the same direction as both other Ready-Made writers, so all three
serialise on one row per order and add **no** edge to the matrix. Ordering it
first costs nothing in atomicity: everything it writes belongs to the caller's
transaction, so a later refusal rolls the commitment back — there is no committed
state in which stock is consumed and the payment is not verified, and none in
which the payment is satisfied and the order did not move.

`DEPOSIT` and `REMAINING` take the `NONE` row and reach step 2–4 not at all, so
their transaction is byte-for-byte the delivered one.

---

## G. APP8 reservation consumption authority

```text
canonical_consume_authority = SkuStockRepository.consumeReservation
                              (APP8-B02, applyConsume)
```

`CommitReadyMadeStockService`
(`apps/api/src/modules/order/application/ready-made/`) is the whole adapter: it
takes the `orders` lock, asserts origin and expected state, locks the order's one
active reservation and calls the delivered writer.

There is **no** `UPDATE inventory_reservations SET status = 'CONSUMED'`, no
on-hand subtraction and no ledger insert anywhere in `APP12-B05`. The only
inventory arithmetic in the repository is still APP8's.

Module boundary: Payment declares `VERIFIED_PAYMENT_SETTLEMENT_PORT` and holds a
one-method interface; Ordering supplies the implementation, the way
`DEPOSIT_ELIGIBILITY_PORT` already works. The port returns a **verdict**
(`COMMITTED | ORDER_MOVED | NO_ACTIVE_RESERVATION`) rather than throwing, so
Ordering never imports Payment's error family and Payment keeps sole authority
over which refusal an operator reads.

---

## H. Exactly-once stock commitment

Two row arbiters, no in-memory guard and no new idempotency key:

- `lockReservedReservationById` refuses any reservation that is not `RESERVED`,
  so a second consume of the same row is impossible;
- the `orders` row lock the settlement takes first means a concurrent
  verification of the same order queues and then finds the order already moved;
- a **replayed** verification never reaches the settlement at all — the delivered
  `isSameVerificationApplication` answers from committed state before any guard.

Proved: after `verify → verify → worker pass → dispatch → complete`, exactly one
`CONSUMED` ledger row, one reservation, one reconciliation, one attempt and no
quantity drift.

---

## I. Verification vs expiry race

Real racers: the **built worker** running `ExpireReadyMadeReservationsUseCase` in
its own OS process (`apps/worker/dist`, the `APP12-B03-C1` harness) against the
real `adminPaymentAttempt_verify` over HTTP. Two processes, two pools, one
disposable database, no mutex.

Four concurrent attempts (two with no stagger, two with the sweep held back
30/60 ms). Observed distribution in the recorded run: `[200, 409, 200, 200]` —
both orderings occur.

| winner | settled world |
|---|---|
| verification | order `READY_FOR_DELIVERY`, `FULL` `SATISFIED`, reservation `CONSUMED`, one `CONSUMED` ledger row, on-hand 9 |
| expiry | order `CANCELLED`, `FULL` `CANCELLED`, reservation `EXPIRED`, **zero** `CONSUMED` ledger rows, on-hand 10, verification `409` |

Plus the two deterministic directions:

- **verify then sweep** — the reservation is made *due* after a committed
  verification (the sharpest form of the question: a sweep keying on the
  timestamp alone would cancel a paid order) and the pass changes nothing;
- **sweep then verify** — verification is `409`, the order stays `CANCELLED`,
  the reservation stays `EXPIRED`, no stock is consumed, no resurrection.

The forbidden combinations are asserted as a **census over the settled
database**, so an interleaving that did not occur in a run still cannot hide a
state that would be invalid if it did:

```text
SATISFIED + order CANCELLED                     0
SATISFIED + reservation EXPIRED                 0
READY_FOR_DELIVERY + reservation EXPIRED        0
CONSUMED + order not past payment               0
CONSUMED + obligation not SATISFIED             0
READY_FOR_DELIVERY + no SATISFIED FULL          0
```

There is deliberately **no** "both orderings occurred" assertion: a distribution
is not a guarantee, and a gate that fails when a scheduler favours one side is a
gate nobody trusts. Both orderings are proved deterministically instead.

---

## J. Verification vs fee-correction race

Four concurrent pairs of real HTTP writers. Observed:
`["verify", "fee", "fee", "fee"]` — both orderings occur.

| winner | settled world |
|---|---|
| verification | one obligation, `SATISFIED`; order `READY_FOR_DELIVERY`; reservation `CONSUMED`; the fee edit refused `409` |
| fee correction | `SUPERSEDED` + `PENDING`; order `AWAITING_PAYMENT`; reservation `RESERVED`; the verification refused `409`; zero `CONSUMED` ledger rows |

`expect(verified).not.toBe(feeSaved)` on every pair — never both. A census proves
no order anywhere carries two live `PENDING` `FULL` obligations.

---

## K. Superseded / expired attempt refusal

**Superseded** (§42): fee corrected `30000 → 45000`, then attempt A verified →
`409 PAYMENT_OBLIGATION_NOT_PAYABLE`. Obligations `[SUPERSEDED, PENDING]`, order
`AWAITING_PAYMENT`, reservation `RESERVED`, stock `10/1/9` untouched. A new
attempt on the successor (`295000.00`, **same** memo — it names the order) then
verifies normally, which is what proves the refusal was about *which* obligation
rather than about Ready-Made verification.

**Expired** (§43): reservation expired by the real sweep → order `CANCELLED`,
`FULL` `CANCELLED`. Verifying the old attempt → `409`. Nothing revives, stock
back at `10/0/10`, and `ORDER_ACCESS` reports
`status = CANCELLED, terminationReason = RESERVATION_EXPIRED`.

No compensation or refund policy is invented for money sent against a superseded
obligation — that belongs to later operational authority.

---

## L. B04 customer projection after verification

`ORDER_ACCESS` is **not** revoked by payment; the customer still has to be able
to watch their order ship.

```text
publicReadyMadeOrder_current   status = READY_FOR_DELIVERY
                               terminationReason absent
publicOrderFullPayment_read    fullPaymentStatus = SATISFIED, payable = false
publicOrderFullPayment_qr      409
publicOrderFullPayment_initiate 409
```

And it follows the order to the end: `DELIVERED`, then `COMPLETED`, both with no
`terminationReason`.

**§46** — a consumed reservation is never misclassified as an expiry. The
termination reason is a committed domain fact (`APP12-B04-C1`), so it is present
for a true lapse and absent for a sale.

---

## M. Dispatch authority

`adminOrder_dispatch`, reused. `READY_FOR_DELIVERY → DELIVERED`, `TR-LC14-07`,
the delivered freeze + snapshot + move in one transaction.

Two origin-neutrality repairs, no behaviour change for custom orders:

1. `loadForUpdate` → `loadLifecycleForUpdate` — the *identical* statement and
   lock, mapped onto the shape both origins have;
2. `lockShippingFeeBaseline` → `lockShippingDetail` — the two open with the
   identical `shipping_details` `FOR UPDATE`, so serialisation against a
   concurrent fee recalculation is unchanged; the baseline's extra quotation join
   was never read here (`GRD-017` asks whether the *detail* carries a fee, not
   what a quotation once said) and was the cause of the `ORDER_NOT_FOUND`;
3. `GRD-016` now reads `settlementObligationKindFor(order.origin)` — one closed
   `Record`, `CUSTOM → REMAINING`, `READY_MADE → FULL`. Still a kind-aware live
   read, so the `APP12-B03` supersession hazard is refused for both origins.

The refusal codes stay the delivered ones: a Ready-Made operator reads them in
the same situation, and a parallel family would be two spellings of one refusal.

No production job, quotation, design approval, deposit or second reservation is
required, and asserted absent.

---

## N. Shipping freeze

The delivered APP9 freeze, reused whole — no Ready-Made flag beside it and no
migration. After dispatch: `shipping_details.status = FROZEN`, `frozen_at` set,
and an ordinary Admin shipping edit is refused `409`.

---

## O. Completion authority

`adminOrder_complete`, reused. `DELIVERED → COMPLETED`, `TR-LC14-08`, the
origin-neutral load and transition. No Ready-Made-specific endpoint.

---

## P. Negative fulfilment matrix

```text
dispatch  from AWAITING_PAYMENT      -> 409 ORDER_INVALID_TRANSITION
dispatch  from READY_FOR_DELIVERY    -> 200 DELIVERED, shipping FROZEN
dispatch  again from DELIVERED       -> 409 ORDER_INVALID_TRANSITION, no second snapshot
complete  from READY_FOR_DELIVERY    -> 409 ORDER_INVALID_TRANSITION
complete  from DELIVERED             -> 200 COMPLETED
complete  again from COMPLETED       -> 409 ORDER_INVALID_TRANSITION
```

No backward transition, no duplicate transition row, no new idempotency
mechanism — the source-state assertion under the order's own lock is the arbiter,
as `APP9-B05` established.

---

## Q. CUSTOM payment regressions

`DEPOSIT` and `REMAINING` are unchanged **by construction**, not only by test:
both take the `NONE` row of the settlement table, so neither this checkpoint's
service nor the port it calls can be entered for them, and the payment module
still cannot write an on-hand balance.

```text
admin-payment-verification.integration        PASS
admin-final-payment-verification.integration  PASS
admin-payment-races.integration               PASS
customer-deposit-*, customer-final-payment    PASS
transfer-evidence*                            PASS
```

`admin-payment-review.integration` has **2 failures that pre-exist at HEAD**,
proved by a stashed baseline run — see §AA.

---

## R. CUSTOM fulfilment regressions

```text
admin-order-delivery.integration   PASS   (custom dispatch + completion)
order.integration                  PASS
final-payment-entry.integration    PASS
```

`admin-shipping-detail.integration` has **2 failures that pre-exist at HEAD**,
identical before and after — see §AA.

---

## S. Operation / OpenAPI / client delta

```text
NEW_HTTP_OPERATIONS = 0
paths      125 -> 125
operations 138 -> 138
schemas    277 -> 277
public      49 ->  49
```

`openapi.generated.json`: 3 lines changed — two operation descriptions.
`embroidery-api.ts`: 4 lines — the same text as JSDoc.
`check:openapi` and `check:generated` both report up to date.

No new response field, no widened enum, no new schema component. The customer
contract needed no change at all: `READY_FOR_DELIVERY`, `SATISFIED`, `DELIVERED`
and `COMPLETED` were already publishable.

---

## T. Release-gate freeze

```text
public operations  49        unchanged
STATIC_DENY        28        unchanged
STATIC_ALLOW       18        unchanged
SCOPE_GATED         3        unchanged
```

`release-gate` suites: 21 passed. B05 publishes no public operation, so Wave-2
isolation is untouched. The three Admin operations it reuses are not public and
are not gate subjects.

---

## U. Disposable live end-to-end journey

`apps/api/test/integration/ready-made-commerce-journey.integration.spec.ts`, one
pass on a disposable database with the real worker:

```text
publicReadyMadeOrder_create      AWAITING_SHIPPING_FEE, reservation RESERVED, 10/2/8
                                 0 obligations
adminOrderShipping_save          AWAITING_PAYMENT, FULL PENDING 530000.00, payable
publicOrderFullPayment_qr        200 image/png
publicOrderFullPayment_initiate  attempt 530000.00, memo ^ORD[0-9A-Z]{10}FL$
adminPaymentAttempt_verify       SUCCEEDED / SATISFIED / READY_FOR_DELIVERY
                                 reservation CONSUMED, stock 8/0/8,
                                 one CONSUMED ledger row, on_hand_delta -2
                                 ORDER_ACCESS: READY_FOR_DELIVERY, non-payable
real worker sweep                nothing changes
adminOrder_dispatch              DELIVERED, shipping FROZEN
                                 ORDER_ACCESS: DELIVERED
adminOrder_complete              COMPLETED
                                 ORDER_ACCESS: COMPLETED
final census                     0 production jobs, 0 DEPOSIT, 0 REMAINING,
                                 1 reservation, 1 attempt, 1 reconciliation,
                                 1 obligation, 0 payment_provider_events
```

No real bank transfer, and none is possible: the Admin verification **is** the
manual-transfer authority, no provider is contacted and `IMP-O007` stays open.
There is not a single SQL write anywhere in that file.

---

## V. Database hygiene

```text
commercial_validation          = DISPOSABLE
disposable_db_removed          = true
shared_dev_B05_commercial_residue = 0
G03_data_created               = false
```

Verified against the running dev database after the whole run:

```text
0 ready_made_orders, 0 full_obligations, 0 reservations, 0 ledger_entries
```

and `pg_database` carries no `app12_b05%` database — the harness drops each one
in `close()`. No retention bypass, no G03 dataset.

---

## W. Files changed

**New (11)**

```text
packages/persistence/src/order/order-lifecycle.ts
packages/persistence/src/order/order-row.mapper.spec.ts
apps/api/src/modules/payment/domain/verification/verified-payment-settlement.ts
apps/api/src/modules/payment/domain/verification/verified-payment-settlement.spec.ts
apps/api/src/modules/payment/application/admin/apply-verified-settlement.service.ts
apps/api/src/modules/order/application/ready-made/commit-ready-made-stock.service.ts
apps/api/src/modules/order/domain/lifecycle/settlement-obligation-kind.ts
apps/api/src/modules/order/domain/lifecycle/settlement-obligation-kind.spec.ts
apps/api/test/support/ready-made-fulfillment-fixture.ts
apps/api/test/integration/ready-made-full-verification.integration.spec.ts
apps/api/test/integration/ready-made-fulfillment.integration.spec.ts
apps/api/test/integration/ready-made-verification-race.integration.spec.ts
apps/api/test/integration/ready-made-commerce-journey.integration.spec.ts
```

**Modified — persistence (5)**

```text
packages/persistence/src/order/order.repository.ts          + 3 lifecycle methods, dispatch return
packages/persistence/src/order/order-row.mapper.ts          + toOrderLifecycle
packages/persistence/src/order/drizzle-order.repository.ts  + 3 implementations
packages/persistence/src/order/drizzle-order-shipping.repository.ts  dispatch mapping
packages/persistence/src/index.ts                           + OrderLifecycle export
```

**Modified — API (8)**

```text
.../payment/domain/verification/verified-payment-transition.ts   + FULL row
.../payment/application/admin/payment-decision-chain.resolver.ts + FL memo, neutral read
.../payment/application/admin/verify-payment-attempt.use-case.ts + settlement call
.../payment/application/admin/route-attempt-to-review.service.ts   neutral read
.../payment/application/admin/review-payment-attempt.use-case.ts   neutral read
.../payment/presentation/admin-payment-attempt.controller.ts       description
.../payment/admin-payment-verification.module.ts                   port binding
.../order/application/admin/dispatch-order.use-case.ts             neutral seams, GRD-016
.../order/application/admin/complete-order.use-case.ts             neutral seams
.../order/presentation/admin-order-delivery.controller.ts          description
```

**Modified — contracts, specs and documentation (6)**

```text
packages/contracts/openapi/openapi.generated.json           3 lines (descriptions)
packages/api-client/src/generated/embroidery-api.ts         4 lines (JSDoc)
apps/api/src/modules/payment/domain/verification/verified-payment-transition.spec.ts
apps/api/src/modules/payment/domain/full-payment/full-payment-reference.spec.ts
docs/database/DB8_LOCK_ORDER_MATRIX.md
docs/implementation/SCOPED_COMMAND_INDEX.md
docs/implementation/10-MASTER-APPLICATION-ROADMAP.md
docs/implementation/phases/APP12-HARDENING-UAT-PRODUCTION-READINESS.md
```

---

## X. File-size evidence

`node tools/check-file-size.mjs --paths <29 touched source and test files>`

```text
Scoped file-size check passed (29 file(s), 4 above the review threshold).

REVIEW  verify-payment-attempt.use-case.ts                 360   (hard 400)
REVIEW  drizzle-order-shipping.repository.ts               399   (hard 400)
REVIEW  drizzle-order.repository.ts                        303   (hard 400)
REVIEW  order.repository.ts                                381   (hard 400)
```

No hard-limit violation; the largest test file is 398 against a 600 hard limit.

The verification use case grew by **one line of logic**, not a switch: the
kind→effect decision and its verdict translation live in
`apply-verified-settlement.service.ts` (77 lines), and the inventory work in
`commit-ready-made-stock.service.ts` (119 lines). All three existing kind tables
stay lookups.

`drizzle-order-shipping.repository.ts` at 399 is pre-existing debt (394 before
this checkpoint) now one line from the cap — logged as a follow-up, §AA.

---

## Y. Validation

Every command run, and its result:

```text
git diff --check                                                    PASS
pnpm --filter @embroidery/persistence exec tsc --noEmit             PASS
pnpm --filter @embroidery/persistence build                         PASS
pnpm --filter @embroidery/api exec tsc --noEmit                     PASS
pnpm --filter @embroidery/worker exec tsc --noEmit                  PASS
pnpm --filter @embroidery/worker build                              PASS
pnpm --filter @embroidery/api-client exec tsc --noEmit              PASS

pnpm --filter @embroidery/api openapi:generate                      125/138/277
pnpm --filter @embroidery/api openapi:check                         up to date
pnpm --filter @embroidery/api-client generate                       2 files
pnpm --filter @embroidery/api-client check:generated                up to date

CMD-TEST-APP12-B05-DOMAIN                                           40 + 6 PASS
CMD-TEST-APP12-B05-VERIFICATION                                     17 PASS
CMD-TEST-APP12-B05-RACES                                            9 PASS

jest --testPathPatterns="ready-made|customer-deposit|customer-final-payment
                        |transfer-evidence|secure-link"             421 PASS (28 suites)
jest --testPathPatterns="admin-payment-verification
                        |admin-final-payment-verification
                        |admin-payment-races"                       PASS
jest --testPathPatterns="admin-payment-review"                      2 pre-existing FAIL
jest --testPathPatterns="admin-order-delivery|final-payment-entry
                        |order[.]integration"                       PASS
jest --testPathPatterns="admin-shipping-detail"                     2 pre-existing FAIL
jest --testPathPatterns="release-gate"                              21 PASS
pnpm --filter @embroidery/persistence exec jest                     1 pre-existing FAIL

node tools/check-category-source-of-truth.mjs                        2455 files, PASS
node tools/check-file-size.mjs --paths <29 files>                    PASS
pnpm exec prettier --check <30 changed files>                        PASS
pnpm --filter @embroidery/persistence lint                           PASS
pnpm --filter @embroidery/worker lint                                PASS
pnpm --filter @embroidery/api lint                                   4 pre-existing errors
```

Not run, and deliberately: the full monorepo suite, UI/UAT, performance, Figma —
none is justified by this change (`VALIDATION_GOVERNANCE.md` §3).

### Pre-existing failures, each proved by a stashed baseline at HEAD

| suite / gate | count | cause |
|---|---|---|
| `admin-payment-review.integration` | 2 | APP7-era expectations `APP9-B03` invalidated: `DEPOSIT_NOT_PAYABLE` was renamed `PAYMENT_OBLIGATION_NOT_PAYABLE`, and "REMAINING is not verifiable" stopped being true when `APP9-B03` made it verifiable |
| `admin-shipping-detail.integration` | 2 | the customer shipping-fee acknowledgement route is `STATIC_DENY` in Wave 1 (`APP12-G02`) |
| `database-runtime.integration` | 1 | canonical table count constant says 78, schema has 79 since `APP12-DB01` |
| `pnpm --filter @embroidery/api lint` | 4 | `approve-design-version.use-case.ts` ×3, `jest.app10-e01.config.mjs` ×1 |

All four were verified identical before and after this checkpoint. None is
touched by `APP12-B05` and none is absorbed (§50).

---

## Z. Baseline freeze

```text
OpenAPI paths        125 -> 125
OpenAPI operations   138 -> 138
OpenAPI schemas      277 -> 277
public operations     49 ->  49
release matrix       28 DENY / 18 ALLOW / 3 SCOPE_GATED   unchanged
migrations            38                                  unchanged
DB schema             unchanged (0 DDL, no migration 0039)
Figma                 unchanged
Storefront routes     unchanged
Admin routes          unchanged
```

`BLOCKED_DB_GAP` was not reached: APP8's canonical consumption represents
Ready-Made reservation consumption without any schema change, because
`inventory_reservations.status = 'CONSUMED'`, the `CONSUMED` ledger kind and
`sku_stocks.quantity_on_hand` all already exist and already mean this.

---

## AA. Follow-ups

**Closed by this checkpoint**

```text
Admin FULL verification                       CLOSED_BY_APP12_B05
Ready-Made inventory commitment after payment CLOSED_BY_APP12_B05
READY_FOR_DELIVERY transition                 CLOSED_BY_APP12_B05
Ready-Made dispatch backend                   CLOSED_BY_APP12_B05
Ready-Made completion backend                 CLOSED_BY_APP12_B05
```

**Opened**

| id | owner | note |
|---|---|---|
| `FU-APP12-B05-01` | `APP12-H01` | `admin-payment-review.integration` carries 2 APP9-B03-era stale expectations (`DEPOSIT_NOT_PAYABLE`, "REMAINING is not verifiable"). Correcting the *expectations*, not the code. |
| `FU-APP12-B05-02` | `APP12-H01` | `drizzle-order-shipping.repository.ts` is 399/400. Split by responsibility — the freeze/snapshot writer is a separate concern from the fee baseline — before the next change to it. |
| `FU-APP12-B05-03` | `APP12-H01` | `database-runtime.integration` asserts 78 tables; the schema has had 79 since `APP12-DB01`. |

**Not absorbed** (§50), each verified untouched: `FU-APP12-B04-02`,
`FU-APP12-B04-03`, `FU-APP12-C03-01`, `FU-APP12-B02-01..04`, `FU-APP12-B03-01`,
`FU-APP12-B03-C1-01`.

---

## AB. Roadmap

```text
APP12-B05 COMPLETE
APP12-S01 NEXT
```

`ROADMAP_STATUS = LOCKED`, `ROADMAP_LOCK = LOCKED`, `CHECKPOINTS = 38`,
`CORRECTION_USED = 0 / 1`. Exactly one `NEXT`. `APP12-S01` is not started.
