# APP12-B03 — Ready-Made Shipping Fee, Total and FULL Obligation Lifecycle

Checkpoint: `APP12-B03`
Phase: `APP12 — Hardening, UAT and Production Readiness`
Date: 2026-09-02

---

## A. Verdict

```text
APP12-B03 = COMPLETE_AFTER_C1

CORRECTION_USED  = 1 / 1   (APP12-B03-C1, test harness only)
NEW_HTTP_OPERATIONS = 0
NEXT_CHECKPOINT  = APP12-B04
PUSHED           = false
```

B03 owns the point at which a Ready-Made order becomes payable. The first
accepted shipping fee freezes the exact payable total, creates the one `FULL`
obligation for it, restarts the reservation's window and moves the order to
`AWAITING_PAYMENT` — in one transaction. A later fee correction supersedes that
obligation and deliberately does **not** restart the window.

Both delivered Admin shipping operations were extended behaviourally. No route,
no operation and no schema was added, and the `CUSTOM` path was not edited at
all.

---

## B. B02 baseline / report reconciliation

`APP12-B02`'s report recorded its schema delta as `263 -> 265` while its own
totals table said `265`, and the accepted `APP12-B01-C1` baseline says `261`.
Reconciled mechanically from the committed artifacts, without reopening B02
runtime:

| Commit | Checkpoint | paths | operations | schemas |
|---|---|---|---|---|
| `47c59044` | `APP12-B01-C1` (accepted baseline) | 120 | 133 | **261** |
| `972b3261` | `APP12-B02` | 121 | 134 | **265** |

The accepted-baseline delta is therefore `261 -> 265`, and **no independent
pre-B02 drift exists** — `47c59044` measures exactly the 261 the accepted
baseline states, so the `263` was a prose error rather than evidence of an
unowned change. B02 introduced four schemas, not two:

```text
+ CreateReadyMadeOrderBody
+ ReadyMadeOrderDelivery
+ ReadyMadeOrderCreatedResponse
+ ReadyMadeOrderSubtotalResponse
```

No schema was removed. The note is recorded in
`APP12-B02-COMPLETION-REPORT.md` §S, and `121 / 134 / 265` is B03's frozen
entry baseline. **No B02 runtime, contract or generated artifact changed** as a
result.

---

## C. B02 follow-up routing

Routed to locked checkpoints exactly as the Product Owner directed. No new
checkpoint was invented and no ownerless owner remains:

| Follow-up | Subject | Owner |
|---|---|---|
| `FU-APP12-B02-01` | stale canonical table-count test | `APP12-H02` |
| `FU-APP12-B02-02` | stale APP9 order/payment/production assertions | `APP12-H01` |
| `FU-APP12-B02-03` | custom integration harness missing release flag | `APP12-H02` |
| `FU-APP12-B02-04` | leaked historical disposable DBs | `APP12-H02` |
| `FU-APP12-B02-05` | forensic-only append-only history not replayed | `INFORMATIONAL_CLOSED` |

`FU-APP12-B02-04` was observed but not acted on: the PostgreSQL instance still
carries 13 historical `embroidery_db7_*` / `app5` / `app6` databases. None is
B03's and none was cleaned here (§50).

---

## D. Preflight

Read before implementation: `CLAUDE.md`; `docs/implementation/README.md`,
`01-DELIVERY-GOVERNANCE.md`, `02-PHASE-AND-CHECKPOINT-MODEL.md`,
`04-BACKEND-API-DELIVERY-STANDARD.md`, `06-OPENAPI-AND-CLIENT-CONTRACT.md`,
`08-DATABASE-CHANGE-CONTROL.md`, `VALIDATION_GOVERNANCE.md`; the APP12 phase
plan; and the `APP12-P01`, `APP12-DB01`, `APP12-B01`, `APP12-B02` reports.

Source inspected and what it settled:

| Question | Mechanical answer |
|---|---|
| Shipping operations | `adminOrderShipping_read` / `_save`, one controller, `PUT` upserts the whole detail. |
| Current shipping lock order | `shipping_details` `FOR UPDATE` → `payment_obligations` (`lockShippingFeeBaseline`, then `recalculate`'s own lock). |
| Current obligation supersession | `PaymentRecalculationRepository.recalculate` — the **only** writer producing `SUPERSEDED` and setting `superseded_by_obligation_id`. Carries the predecessor's `source_quotation_version_id` forward. |
| Current monetary helpers | `shipping-fee-amount.ts` (custom delta arithmetic) and `merchandise-amount.ts` (B02, multiply-only, **no addition by design**). |
| Current order total writer | None after creation. `orders.total_amount` is written by `createFromAcceptedQuotation` and `createReadyMade` only. |
| Current reservation expiry mutation | None. `expires_at` was written at creation and read by the sweep; nothing moved it. |
| Payment cancellation authority | `PaymentObligationRepository.cancel` — `PENDING → CANCELLED`, never the supersession pointer. |
| Worker composition seam | `ExpireReadyMadeReservationsUseCase.expireOne`, which B02 documented as the place B03 adds the obligation half. |

Two findings changed the design:

1. **`lockShippingFeeBaseline` cannot see a Ready-Made order.** It resolves the
   baseline through an `INNER JOIN` on `orders.accepted_quotation_version_id`,
   which `BR-031` leaves `NULL`, so the whole order reads as absent. A
   Ready-Made fee has no quoted baseline to compare against in the first place.
2. **`adminOrderShipping_read` was already broken for Ready-Made.** It proved
   existence with `orders.findById`, which maps onto the *custom* aggregate;
   `toOrder` refuses a Ready-Made row by design, so the read answered
   `ORDER_ORIGIN_NOT_CUSTOM`. §29 required this to work, so it now asks
   `OrderOriginPort` the one question it needs.

---

## E. Existing Admin operation reuse decision

```text
read_operation = adminOrderShipping_read   (extended behaviourally)
save_operation = adminOrderShipping_save   (extended behaviourally)
new_operations = 0
```

No `shipping-fee`, `confirm`, `recalculate` or `FULL`-create endpoint was added.
The fee is a *consequence* of saving the detail, composed into the same
transaction — the same reason `APP9-B04` refused to publish a fee route.

The receipt schema `AdminShippingFeeOutcomeResponse` gained two nullable fields
and two existing fields became nullable (§W). That is a schema **shape** change
inside an existing operation, not a contract addition: paths, operations and the
schema *count* are all unchanged.

---

## F. Origin routing / CUSTOM preservation

A new `AdminShippingFeeRouter` sits above both authorities:

```text
orders.origin = CUSTOM      → SaveShippingDetailUseCase       (APP9-B04, unedited)
orders.origin = READY_MADE  → SetReadyMadeShippingFeeUseCase  (APP12-B03)
```

The origin comes from `OrderOriginPort` — server truth, made stable by
`tg_orders__origin_immutable`. The client sends no origin, chooses no payment
kind and selects no recalculation policy, and could not: none of those appear in
`SaveShippingDetailBody`. Routing is by **origin**, never by guessed status,
because the two lifecycles overlap and a status guess would fail silently in
exactly the case that costs most.

`save-shipping-detail.use-case.ts` has **zero diff**. The two rules were kept in
separate files rather than merged: a custom fee change moves the live remaining
balance *by the difference* and needs the customer's recorded acknowledgement for
an increase, while a Ready-Made fee *recomposes* the whole payable total and
needs no acknowledgement at all. Folding them together would have produced a
method whose every step is an `if`, on top of a file already at 341 lines.

---

## G. Ready-Made first shipping-fee set

Eligibility, all decided under locks inside one transaction:

```text
orders.origin      = READY_MADE          (router; re-proved by loadReadyMadeForUpdate)
orders.status      = AWAITING_SHIPPING_FEE
shipping_details   exists and is EDITABLE
reservation        RESERVED, still held at transaction decision time
```

Wrong origin, wrong state, frozen shipping, a terminal reservation and a
cancelled order are each refused with nothing written. An expired order is never
revived, and no second reservation is ever created.

---

## H. Frozen subtotal authority

```text
subtotal = sum(order_items.line_total_amount)
```

Summed **in the database** (`::numeric(14,2)`), so no JS `Number` touches it.
`ReadyMadePayableTotalResolver` holds no Catalog port at all, so "do not reread a
mutable price" is a structural fact rather than a convention: `products`,
`skus.price_override_amount` and `product_variants` are unreachable from it.

`orders.total_amount` is deliberately **not** the source even though it holds the
subtotal before the first confirmation — it stops holding it afterwards (§14), so
composing a correction from it would build a total out of a previous total and
compound every fee change.

Proved in `§36`: with the Catalog repriced to `999000.00` under a committed
order, the payable total is `280000.00`, not `1029000.00`.

---

## I. Exact payable-total authority

```text
payable_total = frozen merchandise subtotal + exact shipping fee
```

`payable-total.ts` carries `bigint` hundredths of a VND and can parse, add,
format and range-check — nothing else. No deposit, no remaining percentage, no
quotation, no discount, no tax, no promotion, and **no float anywhere**.

It is a separate module from `merchandise-amount.ts` on purpose: that module
states that having no addition is what keeps order *creation* from producing a
shipping-inclusive total (`BR-027`), and adding the operator there to reuse it
would delete that guarantee for one caller. It is separate from
`shipping-fee-amount.ts` for the opposite reason — `successorAmount` computes
`live + delta`, which is the custom rule, and Ready-Made has no previous balance
to move.

A negative fee is unrepresentable rather than range-checked: the decimal pattern
admits no sign, so `BR-027`'s `fee >= 0` cannot be reordered around.

```text
NULL fee = pending / not priced       (an absence)
0    fee = explicit free shipping     (a decision)
```

Never auto-converted, and proved distinct in both directions.

---

## J. First FULL obligation

```text
kind                        = FULL
status                      = PENDING
source_quotation_version_id = NULL
amount                      = exact payable total
currency                    = VND
```

`ck_payment_obligations__source_by_kind` is what makes the `NULL` correct rather
than merely permitted. `CreateObligationInput.sourceQuotationVersionId` was
widened from `string` to `string | null` — widened rather than made optional, so
a caller on the custom branch cannot omit provenance by accident.

Exactly one live `FULL`, arbitrated by
`uq_payment_obligations__order_kind__live`. No `DEPOSIT`, no `REMAINING`, no
payment attempt, no QR and no evidence.

---

## K. Order transition

```text
AWAITING_SHIPPING_FEE → AWAITING_PAYMENT
```

Through the delivered `transitionReadyMade` / `applyOrderTransition` writer. No
`PAID`, `FEE_CONFIRMED` or `PAYMENT_READY` state was added, and
`ORDER_TRANSITIONS` is unchanged.

`orders.total_amount` is written to the exact payable total in the same
transaction as the obligation, so the order total and the live `FULL` amount are
never observable as two different figures. No migration, no new column.

---

## L. Reservation payment-window reset

```text
order created         expires_at = created_at + 24h    (APP12-B02)
FIRST fee confirmed   expires_at = now()      + 24h    (APP12-B03)
fee corrected         expires_at UNCHANGED
same fee replayed     expires_at UNCHANGED
```

**The payment window resets on the first fee confirmation only.** The reset
belongs there because that is the moment the customer first has a payable
figure; measuring their window from an instant before the price existed would
charge them for the operator's response time. A correction is the operator
amending their own figure, and letting it restart the clock would make the
deadline indefinitely extendable by an operator — an abuse surface, and a way to
hold stock off sale forever without anyone paying.

`READY_MADE_PAYMENT_WINDOW_MS` is a **second constant** from
`READY_MADE_INITIAL_RESERVATION_WINDOW_MS`, as B02 required. They are equal
today by coincidence of policy, not by a shared rule.

The instant is `now()` computed **in the `UPDATE` statement** — database time,
never a client or application clock (§16). The sweep compares `expires_at`
against `now()`, so a deadline written from a drifted process clock would be
enforced against a clock that never agreed with it.

The **same reservation row** is reused throughout: nothing is released,
re-reserved or duplicated, and reservation identity and ledger history survive
the repricing. `rescheduleReservationExpiry` writes **no ledger entry**, which is
correct rather than an omission — `G-DB7-29` requires one for every change to
committed quantity, and a deadline move changes none.

CUSTOM reservations have no `expires_at` (`PO-APP8-002`) and are unreachable by
any of this.

---

## M. Fee correction / FULL supersession

```text
predecessor FULL  PENDING 280000.00 → SUPERSEDED 280000.00 (amount untouched)
successor   FULL  PENDING 295000.00
predecessor.superseded_by_obligation_id = successor.id
orders.total_amount → 295000.00
order stays AWAITING_PAYMENT
reservation.expires_at UNCHANGED
```

Through the delivered `recalculate`, the only writer that produces `SUPERSEDED`.
The predecessor's amount is never edited in place. `cancel` was deliberately not
used: it produces `CANCELLED` and never writes the pointer, so a withdrawal and
a replacement are not interchangeable.

Every accepted fee **recomposes** from the frozen subtotal, so successive
corrections do not compound — proved with three fees in a row landing at
`260000.00` rather than at a twice-moved figure.

One `payment_reconciliations` row per correction, `action = OBLIGATION_RECALC`
(COL-TBL057-03, APP9's own vocabulary). No new event kind was invented and no
acknowledgement row is written. The **first** confirmation appends no
reconciliation: it recalculates nothing, and its evidence is the obligation row
plus the `order_transitions` entry.

---

## N. Replay semantics

A retry carrying the already-stored fee:

```text
FULL count            unchanged
supersession          none
reconciliation row    none
reservation expiry    unchanged
order state           unchanged
```

Asserted by comparing whole committed rows before and after, not just the
response. The live obligation is still reported so the operator sees what
stands. Non-fee edits on the same replay still apply, through the shared
delivered write.

---

## O. SATISFIED refusal

A fee **change** against a live `SATISFIED` `FULL` is refused
(`SHIPPING_FEE_CHANGE_NOT_AVAILABLE`, 409) with zero mutation to the shipping
fee, `orders.total_amount`, any `FULL` row, the reservation expiry or the order
lifecycle — asserted as whole-row equality on all three tables.

The unchanged-fee replay is decided **before** the obligation's status is
consulted, which is what lets a non-fee edit through on a settled order (§22)
while a real fee change on that same order is refused.

`SATISFIED` is terminal in LC-15 and `TR-LC15-04` is `PENDING -> SUPERSEDED`
alone, so there is no backward transition and no implicit refund.

The `SATISFIED` state was constructed through **fixture authority only** —
`APP12-B05` owns FULL verification and B03 must not implement it. The fixture
writes a genuine `SUCCEEDED` `payment_attempts` row and satisfies the obligation
by it, because `ck_payment_obligations__satisfied_evidence_required` and
`G-DB7-33` demand that evidence; faking the status alone would be testing
behaviour against a state the schema forbids.

---

## P. Expiry worker FULL cancellation

`ExpireReadyMadeReservationsUseCase` gained the money half of `BR-026`:

```text
READY_MADE + AWAITING_PAYMENT + reservation due + live FULL PENDING
  → reservation EXPIRED
  → FULL        CANCELLED
  → order       CANCELLED

READY_MADE + AWAITING_SHIPPING_FEE + reservation due
  → reservation EXPIRED
  → order       CANCELLED
  → payment obligations: 0 exist, and none is required   (§25)
```

Through the delivered `cancel` writer, which moves `PENDING` alone — so a
`SATISFIED` `FULL` is untouched by construction rather than by a branch. The
obligation is cancelled **before** the lifecycle move that makes it unpayable,
inside the same per-candidate transaction.

The first-window path still requires no obligation. Demanding one would break
every checkout abandoned before it was ever priced, which is the ordinary case.

---

## Q. Transaction / lock order

```text
1. orders                  loadReadyMadeForUpdate       FOR UPDATE
2. shipping_details        lockShippingDetail           FOR UPDATE
3. inventory_reservations  lockActiveOrderReservation   FOR UPDATE (all rows, id order)
4. payment_obligations     findLive, then recalculate's own FOR UPDATE
```

`orders` first is the delivered `DB8_LOCK_ORDER_MATRIX.md` direction and is what
arbitrates this transaction against the expiry sweep, which opens with the same
lock. `shipping_details` second is the row the custom path locks *first*, so even
a routing mistake serialises rather than interleaving. The reservation lookup
locks **every** row the order holds in `id` order, so a rival sweep and a fee
confirmation contend on the same rows instead of passing each other.

No SERIALIZABLE isolation and no advisory lock was introduced. One
`runInTransaction` wraps everything, so a refusal at any step leaves no shipping
update, no obligation and no reconciliation.

---

## R. Concurrency evidence

Real PostgreSQL, genuinely concurrent HTTP requests on independent pooled
connections. What is asserted is the **final committed world**, not which caller
won.

**§33 — two first fee writes.** One coherent `AWAITING_PAYMENT` order; exactly
one live `FULL`; `subtotal + stored fee == live FULL amount == orders.total_amount`;
and **exactly one** `order_transitions` row into `AWAITING_PAYMENT`, which is the
direct proof of a single window reset since the two commit together. Any
predecessor is `SUPERSEDED` with its pointer set — never left `PENDING`.

**§34 — two corrections.** One serialised supersession chain: every retired row
points at a successor, no two point at the same one (a chain, not a fork), one
live `FULL`, fee/total/obligation in agreement, and the window unchanged.

> **SUPERSEDED BY `APP12-B03-C1` — the §41 evidence below is rejected.**
>
> The Product Owner rejected the "expiry wins" world this section recorded:
>
> ```text
> 409 refused + EXPIRED reservation + 0 obligations + AWAITING_SHIPPING_FEE
> ```
>
> A Ready-Made order may not stay active once its reservation has terminally
> expired — `READY_MADE_ACTIVE_ORDER_WITH_EXPIRED_RESERVATION = FORBIDDEN`.
>
> The state was never reachable through the delivered runtime. It was
> **manufactured by this suite**: §41 drove the sweep as a hand-written
> `UPDATE inventory_reservations set status = 'EXPIRED'`, which is one sub-step
> of the expiry transaction rather than the transaction, and the step it omitted
> is the one that cancels the order. §P of this report describes the real path
> correctly; §41's stand-in never ran it.
>
> Root cause: `TEST_HARNESS_DEFECT`. **No production runtime changed in
> `APP12-B03-C1`** — no use case, no repository, no writer, no transaction, no
> contract, no migration. The correction replaced the stand-in with the real
> `ExpireReadyMadeReservationsUseCase`, run in its own OS process against the
> same disposable database, and re-proved the two legal worlds plus the
> stale-candidate and expiry-first orderings.
>
> The corrected evidence is `docs/implementation/reports/APP12-B03-C1-COMPLETION-REPORT.md`
> and `apps/api/test/integration/ready-made-expiry-race.integration.spec.ts`.
> The §33 and §34 races below are unaffected and stand as recorded.

**§41 — fee write vs expiry**, run three times. Only the two coherent §23 states
occur:

```text
Admin wins:  AWAITING_PAYMENT + RESERVED + one PENDING FULL matching the total
Expiry wins: 409 refused + EXPIRED reservation + 0 obligations + AWAITING_SHIPPING_FEE
```

Both forbidden worlds are asserted false directly:
`CANCELLED + live PENDING FULL` and `AWAITING_PAYMENT + EXPIRED reservation`.

---

## S. Error contract

Four codes added to the existing `adminShipping` vocabulary, all 409, all safe
for an authenticated operator (no customer contact, no grant, no challenge, no
token, no amount):

| Code | Meaning |
|---|---|
| `ORDER_SHIPPING_FEE_NOT_SETTABLE` | The order's lifecycle position permits no fee — `CANCELLED` above all. |
| `ORDER_RESERVATION_NOT_HELD` | The stock behind the order is no longer committed. |
| `ORDER_FULL_PAYMENT_MISSING` | `AWAITING_PAYMENT` with no live `FULL` — a data fault to escalate, never repaired. |
| `ORDER_SUBTOTAL_NOT_AVAILABLE` | The frozen lines yield no priceable subtotal. The Catalog is **not** consulted as a fallback. |

Reused unchanged: `ORDER_NOT_FOUND`, `SHIPPING_DETAIL_NOT_FOUND`,
`SHIPPING_FROZEN`, `SHIPPING_FEE_NOT_APPLICABLE` and
`SHIPPING_FEE_CHANGE_NOT_AVAILABLE`. The last is shared with the custom
`SATISFIED` refusal — same code, same 409 — and its message was made
origin-neutral. The machine-readable half of the contract is identical for
CUSTOM.

`RESPONSE_OF` remains an exhaustive `Record`, so a future failure without a
status will not compile.

---

## T. Payment-attempt / B04 / B05 boundary

```text
payment_attempts created by first fee set = 0
payment_attempts created by correction    = 0
FULL verification    = not_started   (APP12-B05)
ORDER_ACCESS         = not_started   (APP12-B04)
public order read    = not_started
QR / merchant config / evidence = not_started
```

`adminPaymentAttempt_verify` is untouched and gained no `FULL` support. Asserted
positively: after a priced order, the status is still `AWAITING_PAYMENT` and no
attempt exists — B03 does not enable `AWAITING_PAYMENT → READY_FOR_DELIVERY`.

---

## U. CUSTOM regression (focused)

`admin-shipping-detail.integration.spec.ts` and
`customer-shipping-fee-acknowledgement.integration.spec.ts` — **11/11 pass**,
covering the quoted-fee baseline on first write, the acknowledgement requirement
on increase, an unchanged fee touching no money record, a decrease needing none,
mismatched and stale acknowledgements, the `REMAINING` supersession chain, the
`SATISFIED REMAINING` refusal and the frozen-shipping refusal.

No broad APP9 regression was run (§46).

---

## V. B02 regression (focused)

`ready-made-order-creation`, `-authority` and `-concurrency` — **56/56 pass**: a
new order starts `AWAITING_SHIPPING_FEE` with a `NULL` fee and 0 payment
obligations, holds an initial `+24h` reservation, and the first-window expiry
still cancels it with no payment row.

---

## W. OpenAPI / generated-client delta

```text
paths        121 -> 121
operations   134 -> 134
schemas      265 -> 265
public ops    45 ->  45
```

One existing schema changed shape. `AdminShippingFeeOutcomeResponse` gained
`fullObligationId` and `payableTotalAmount` (both nullable, ready-made only), and
`previousFeeAmount` / `acknowledged` became nullable — `null` on a ready-made
first confirmation means "no fee had been priced", which is a different fact from
`0.00`, and `null` on `acknowledged` says "not applicable" where `false` would
say "looked for and not found".

The ready-made and custom obligation fields are deliberately **not** collapsed
into one `obligationId`: they are different kinds under different rules, and one
field would let a consumer read "the obligation" without knowing whether it is a
balance moved by a difference or a total recomposed from a subtotal.

`previousFeeAmount` and `acknowledged` carry explicit `type` metadata. Without
it, the `string | null` / `boolean | null` unions published as `type: object` and
the generated client lost the scalar — a regression this change introduced and
repaired. The neighbouring APP9 fields already carry that `object` shape and were
**not** touched (§50); one accidental retype of `AdminShippingDetailResponse.feeAmount`
was reverted.

Generated client: `pnpm --filter @embroidery/api-client generate` → one file
(`embroidery-api.schemas.ts`), +20/−4 lines, that schema only. No operation
delta, no hand edits.

---

## X. Release-gate baseline

```text
public operations = 45   (unchanged)
DENY              = 31   (unchanged)
ALLOW             = 14   (unchanged)
```

`release-gate.contract.spec.ts` — 12/12 pass. Admin shipping operations are not
part of the public matrix, and Wave-2 isolation is unchanged. No public
operation was added, so no matrix entry was needed.

---

## Y. Disposable live evidence

Every commercial write ran through the **real HTTP surface** — the production
`AppModule`, the production `AuthenticatedAdminGuard`, `StaffOriginGuard` and
`StaffJsonBodyGuard`, and the production `publicReadyMadeOrder_create` for every
order under test — against **disposable** PostgreSQL databases
(`app12_b03_fee`, `app12_b03_race`), never the shared development database.

That is the live Admin HTTP evidence for this checkpoint. It was **not** run
against the dev gateway on purpose: doing so would write retain-forever
commercial rows into shared dev, which `SHARED_DEV_DB_COMMERCIAL_WRITE_POLICY`
(`VALIDATION_GOVERNANCE.md` §3A.5) forbids and which `APP12-B01-C1` exists to
prevent recurring.

Worker evidence ran the real `ExpireReadyMadeReservationsUseCase` from the real
`WorkerModule` against its own disposable database.

Guards proved live, not assumed: an unauthenticated read is `401`.

---

## Z. Database hygiene

```text
commercial_validation             = DISPOSABLE
disposable_db_removed_after_run   = true
shared_dev_B03_test_orders        = 0
shared_dev_B03_payment_obligations= 0
G03_data_created                  = false
```

Measured after the final run:

```text
pg_database: no app12_b03_* database remains

shared dev `embroidery`:
  orders 0 | orders(READY_MADE) 0 | payment_obligations 0 | FULL 0
  shipping_details 0 | inventory_reservations 0 | skus 0 | sku_stocks 0
```

No retention bypass was used; the harness drops each database in `close()`. The
13 pre-existing `embroidery_db7_*` / `app5` / `app6` leftovers are
`FU-APP12-B02-04` (→ `APP12-H02`) and were left alone (§50).

---

## AA. Files changed

**New (10)**

```text
apps/api/src/modules/order/domain/ready-made/payable-total.ts
apps/api/src/modules/order/domain/ready-made/payable-total.spec.ts
apps/api/src/modules/order/domain/ready-made/payment-window.policy.ts
apps/api/src/modules/order/application/ready-made/set-ready-made-shipping-fee.use-case.ts
apps/api/src/modules/order/application/ready-made/payable-total.resolver.ts
apps/api/src/modules/order/application/admin/admin-shipping-fee.router.ts
apps/api/test/support/ready-made-shipping-fixture.ts
apps/api/test/integration/ready-made-shipping-fee.integration.spec.ts
apps/api/test/integration/ready-made-shipping-fee-concurrency.integration.spec.ts
packages/persistence/src/inventory/reservation-window.ts
```

**Modified — persistence (9)**

```text
packages/persistence/src/order/ready-made-order.repository.ts        + frozenMerchandiseSubtotal, setPayableTotal
packages/persistence/src/order/drizzle-ready-made-order.repository.ts
packages/persistence/src/order/order.repository.ts                   + lockShippingDetail
packages/persistence/src/order/drizzle-order-shipping.repository.ts
packages/persistence/src/order/drizzle-order.repository.ts           delegation only
packages/persistence/src/payment/payment-obligation.repository.ts    sourceQuotationVersionId: string | null
packages/persistence/src/inventory/sku-stock.repository.ts           + lockActiveOrderReservation, rescheduleReservationExpiry
packages/persistence/src/inventory/inventory-reservations.ts
packages/persistence/src/inventory/drizzle-sku-stock.repository.ts   delegation only
```

**Modified — API (6)** the shipping module, controller, read query, error
vocabulary, response DTO and its contract spec.

**Modified — worker (3)** the expiry use case, its module and its integration
suite.

**Modified — generated (2)** `openapi.generated.json`,
`embroidery-api.schemas.ts`.

**Modified — docs (3)** this phase plan, the master roadmap and the B02 report
(§B reconciliation only).

`save-shipping-detail.use-case.ts` — the CUSTOM authority — has **zero diff**.
`reservation-terminalization.ts` ends with zero diff.

---

## AB. File-size evidence

`node tools/check-file-size.mjs --paths <28 touched .ts files>` →
**PASS**, 0 over the hard limit, 5 above the review threshold.

Two hard-limit breaches appeared mid-implementation and were split **by
responsibility**, not by line range:

```text
set-ready-made-shipping-fee.use-case.ts  406 → 378
  the payable-total composition became ReadyMadePayableTotalResolver — the one
  answer to "what does this customer owe", asked by both the first confirmation
  and every correction. Two copies would be two places to start reading a live
  price.

inventory-reservations.ts                425 → 395
  the window lookup and the deadline move became reservation-window.ts. Its
  sibling reservation-terminalization.ts holds functions that *end* a
  reservation, each with a ledger entry and an on-hand rule; neither of these
  ends anything, and a non-terminal write among the terminal ones is the one
  place a future edit could add an EXPIRED by copying its neighbour.
```

Above review threshold (all pre-existing shapes, none newly over):
`set-ready-made-shipping-fee.use-case.ts` 378, `inventory-reservations.ts` 395,
`drizzle-order-shipping.repository.ts` 394, `order.repository.ts` 340,
`reservation-expiry.integration.spec.ts` 527 (test threshold 500, hard 600).

---

## AC. Validation

| Command | Result |
|---|---|
| `git diff --check` | clean |
| `tsc --noEmit` — `@embroidery/persistence` | pass |
| `tsc --noEmit` — `@embroidery/api` | pass |
| `tsc --noEmit` — `@embroidery/worker` | pass |
| `ready-made-shipping-fee.integration.spec.ts` (disposable PG) | 21/21 |
| `ready-made-shipping-fee-concurrency.integration.spec.ts` (disposable PG) | 10/10 |
| `reservation-expiry.integration.spec.ts` (disposable PG, real worker) | 14/14 |
| `payable-total.spec.ts` | 22/22 |
| APP9 CUSTOM shipping regressions | 11/11 |
| B02 Ready-Made regressions | 56/56 |
| `release-gate.contract.spec.ts` | 12/12 |
| `node tools/check-category-source-of-truth.mjs` | pass — 2424 files |
| `node tools/check-file-size.mjs --paths …` | pass |
| `eslint` — 28 changed files | clean |
| `prettier --check` — 28 changed files | clean |
| `openapi:generate` | 121 / 134 / 265 |
| `api-client generate` | 1 file, schema-only delta |

Not run, and deliberately (§49): full monorepo, UI suites, Playwright, UAT,
performance, Figma.

**One pre-existing failure is not B03's and was not absorbed.**
`admin-order-shipping.contract.spec.ts` has an APP9-era assertion that no path
beneath the shipping surface matches `/freeze|dispatch|tracking|carrier|complete/`,
which `APP9-B05`'s `/api/admin/orders/{orderId}/dispatch` has falsified since it
shipped. Proved pre-existing by stashing all B03 work and running against clean
`HEAD` (`972b3261`): the same four suites failed with four failing tests —
`admin-order.contract.spec.ts`, `admin-order-lifecycle.contract.spec.ts`,
`admin-custom-request-asset.contract.spec.ts` and this one. B03 fixed only its
**own** assertion in that file (the fee-outcome schema shape) and left the stale
route enumerations to `FU-APP12-B02-02` → `APP12-H01`, per §50.

`node tools/db-manifest-check.mjs` aborts with `EISDIR` on this machine, so
schema stability was proved directly instead: `git status --porcelain --
packages/database/` is **empty** and `ls migrations/*.sql` is **38**.

---

## AD. Baseline freeze

```text
OpenAPI paths        121   (unchanged)
OpenAPI operations   134   (unchanged)
OpenAPI schemas      265   (unchanged)
public operations     45   (unchanged)
release matrix        31 DENY / 14 ALLOW  (unchanged)
migrations            38   (unchanged)
DB schema             unchanged — 0 diff under packages/database/
Figma                 unchanged
Storefront UI         unchanged
Admin UI              unchanged
```

`APP12-B03 = BLOCKED_DB_GAP` was not reached. `APP12-DB01` had already sized
`orders.total_amount`, made `shipping_details.fee_amount` nullable, written
`ck_payment_obligations__source_by_kind` for the `FULL` kind and left
`inventory_reservations.expires_at` mutable — so no physical blocker existed and
no migration `0039` was written.

---

## AE. Follow-ups

**Closed by B03**

```text
Ready-Made exact shipping fee authority
Ready-Made exact payable total
FULL obligation creation and supersession
payment-window reservation reset (first confirmation only)
expiry cancellation of a PENDING FULL
```

**New**

```text
FU-APP12-B03-01  AdminShippingFeeOutcomeResponse still publishes
                 previousFeeAmount / remainingAmount / remainingObligationId /
                 supersededObligationId as `type: object` for the APP9 fields,
                 because `string | null` without explicit metadata loses the
                 scalar. B03 fixed the two it changed and left the rest.
                 → APP12-H02
```

**Open, unchanged**

```text
APP12-B04  ORDER_ACCESS + customer FULL payment composition
APP12-B05  Admin FULL verification + fulfillment
APP12-A01  Admin category management UI
APP12-G03  representative UAT data
```

---

## AF. Roadmap

```text
APP12-B03 COMPLETE_AFTER_C1
APP12-B04 NEXT
```

`ROADMAP_STATUS = LOCKED`, `ROADMAP_LOCK = LOCKED`, `CHECKPOINTS = 38`.
Exactly one `NEXT`. `APP12-B04` is not started.
