# APP12-B02 — Ready-Made Order Creation and Initial Reservation

Checkpoint: `APP12-B02`
Phase: `APP12 — Hardening, UAT and Production Readiness`
Date: 2026-09-02

---

## A. Verdict

```text
APP12-B02 = COMPLETE

CORRECTION_USED  = 0 / 1
NEXT_CHECKPOINT  = APP12-B03
```

One public command was delivered — `publicReadyMadeOrder_create` — which creates
a `READY_MADE` order at `AWAITING_SHIPPING_FEE`, freezes one SKU line, captures
the delivery facts, and reserves the stock with a 24-hour window, all in one
transaction. The initial expiry window is enforced by a new worker sweep
delivered here (§M).

The Product Owner's `APP12-B02` clean-database directive was executed in full:
the shared development database was rebuilt clean, the contaminated one was
decommissioned after a forensic dump, and the commercial live validation was
rerun on disposable databases (§AD).

---

## B. Preflight

Read before implementation: `CLAUDE.md`; `docs/implementation/README.md`,
`01-DELIVERY-GOVERNANCE.md`, `02-PHASE-AND-CHECKPOINT-MODEL.md`,
`04-BACKEND-API-DELIVERY-STANDARD.md`, `06-OPENAPI-AND-CLIENT-CONTRACT.md`,
`08-DATABASE-CHANGE-CONTROL.md`, `VALIDATION_GOVERNANCE.md`,
`SCOPED_COMMAND_INDEX.md`; the `APP12` phase plan; `docs/04-BUSINESS-RULES.md`
`BR-021`..`BR-032`; and the `APP12-P01`, `APP12-DB01`, `APP12-B01`,
`APP12-B01-C1` and pre-implementation-audit-C1 reports.

The nine mandated questions, answered mechanically from source:

| Question | Answer |
|---|---|
| How is a verified contact represented? | `contact_verification_challenges`, purpose ∈ {`SUBMISSION`, `STEP_UP`}, status ∈ {`ISSUED`,`VERIFIED`,`FAILED`,`EXPIRED`,`CANCELLED`}, with `expires_at` and `verified_at`. |
| How is it converted to `customer_id`? | `verifiedContactEvidenceOf` → `ResolveOrCreateVerifiedCustomer.resolve` (`APP4-B02`, `ADR-DB2-001` r5). The one path; no second algorithm exists. |
| What idempotency primitive exists? | `IdempotencyStore` (`claim`/`complete`/`release`) over TBL-074, arbitrated by `uq_idempotency_records__namespace_scope_key`. The claim runs **inside the caller's transaction**. |
| What order snapshot columns exist? | `order_items`: `product_name`, `variant_label`, `size_label`, `quantity`, `unit_price_amount`, `line_total_amount`, `currency_code`, plus the mutually-exclusive `sku_id`/`customer_owned_product_id` subject and the now-nullable `approval_snapshot_id`. |
| What public-safe order reference exists? | `orders.code` — `ORD-` + ten `G01-D12` characters, `uq_orders__code`, explicitly never an authorization input (CST-026). |
| How does APP8 reserve under stock lock? | `InventoryReservations.createReservation` → `ReservationEligibilityGuard` → `StockAnchor.requireLocked` (`SELECT … FOR UPDATE` on `sku_stocks`) → `assertSufficient` → insert + ledger. |
| How is reservation expiry persisted? | `inventory_reservations.expires_at`, nullable (`ADR-DB1-018` r3 — absent means no expiry), with the partial index `ix_inventory_reservations__expires_id__reserved` over exactly the sweepable rows. |
| Does reservation creation write ledger? | Yes — `G-DB7-29`, one `RESERVED` entry with `on_hand_delta = 0`. |
| What runtime handles `expires_at`? | **None existed.** `expires_at` had no consumer before this checkpoint. See §M. |

Two findings changed the design:

1. `ReservationEligibilityGuard` gated every reservation on a **SATISFIED
   `DEPOSIT` obligation**. A Ready-Made order has no deposit and never will
   (`BR-029`), and its reservation is created *before* any obligation exists
   (`BR-024`) — so the gate was not merely strict for this branch, it was
   permanently false. It is now origin-aware.
2. `toOrder` (`order-row.mapper.ts`) **refuses** a `READY_MADE` row, by
   `APP12-DB01`'s explicit decision. `OrderRepository` is the custom aggregate;
   Ready-Made needed its own contract rather than a widened `Order`.

---

## C. Operation contract

```text
POST /api/public/ready-made-orders        publicReadyMadeOrder_create      201
```

**One** operation, not three. Order creation and its stock reservation are a
single atomic business command (`BR-023`, `BR-024`), so there is deliberately no
`reserve-stock`, no `validate-stock` and no `quote-order` route: each would
publish a decision that is only true until the next transaction, and a client
acting on one would be acting on a promise the server never made. Asserted from
source — the single route decorator takes no path argument at all, which is what
makes a sub-route unsayable on this controller.

No guard is declared. A guard could only re-read the challenge earlier and
outside the transaction that must act on it. Unlike
`PublicCustomRequestController` there is also no session credential and no
Origin check: Ready-Made checkout submits no Design Session and presents no
ambient cookie, so there is nothing for a cross-site page to ride on — the same
reasoning `APP5-B01` records for its own COP branch.

---

## D. Verified-contact authority

Mandatory. `VerifiedChallengeIdentityResolver` re-reads the challenge **inside
the creation transaction** and requires: the challenge exists, `purpose =
SUBMISSION`, `status = VERIFIED`, `verified_at` set, and `now < expires_at`. It
then resolves the customer through APP4's own
`verifiedContactEvidenceOf` → `ResolveOrCreateVerifiedCustomer` pair.

`SUBMISSION` is reused rather than a third purpose added: `VERIFICATION_PURPOSES`
is a closed two-member set and widening it is a migration, which §6 forbids. A
Ready-Made checkout is a customer submitting something.

**The rule moved rather than being copied.** `APP5-B01` had implemented it as
`SubmissionIdentityResolver` inside Ordering. `APP12-B02` makes Ready-Made the
second public write that must answer the same question, and a challenge good
enough to place an order but not to submit a request — or the reverse — would be
a security question with two answers. The rule now lives in the Customer module
and `SubmissionIdentityResolver` delegates to it, keeping only its own refusal
type. Same treatment `IMP-D054` gave `reservation-requirements.ts`.

Five causes — unknown id, wrong purpose, not `VERIFIED`, never answered, expired
— return one `undefined`, so no caller can publish a distinction it was never
given. Proved: four negative cases all answer `VERIFIED_CONTACT_REQUIRED` and
the refusal body contains no contact, customer id or challenge id.

No account, no password, no login, no OTP system, no verification table was
created.

---

## E. Request trust boundary

The body carries four fields and `.strict()` rejects everything else:

```text
challengeId   skuId   quantity   delivery{recipientName, recipientPhone,
                                          addressLine, ward?, district?, province}
```

Asserted absent from the schema, by name: `productId`, `productName`,
`variantLabel`, `sizeLabel`, `unitPrice`, `lineTotal`, `currency`,
`shippingFee`, `finalTotal`, `availableQuantity`, `status`, `origin`,
`reservationExpiresAt`, `customerId`, `idempotencyKey`. Live proof: bodies
carrying `unitPrice`, `merchandiseSubtotal` or `customerId` are `400`, and
nothing is written.

`skuId` rather than `productId` + `productVariantId`: the SKU is the buyable
subject (`BR-021`) and determines the other two; accepting three client ids
would let them disagree.

**Quantity** — `z.number().int().positive().max(100_000)`. Zero, negative,
fractional and string are all `400`. The ceiling is the value the delivered
custom-request contract already uses for a customer-stated quantity, so one
quantity means one thing on both public writes; it is deliberately not a low
"reasonable purchase" figure no locked authority states. The real ceiling is
available stock, decided under the anchor lock.

**Delivery** — mirrors `shipping_details`. `countryCode`, `currencyCode`,
`feeAmount`, `carrierName`, `trackingCode`, `status` and `frozenAt` are absent:
the country has a column default, the currency is CHECK-pinned to VND, and the
rest belong to `APP12-B03` and the fulfilment path. A customer cannot state
their own shipping fee (`BR-027`).

---

## F. SKU / Product eligibility

`PURCHASABLE_SKU_PORT` → `DrizzlePurchasableSkuAdapter`, read **inside the
creation transaction**, keyed by SKU id. One statement, three joins, and exactly
the eligibility predicates `drizzle-public-product-variant.repository.ts`
applies, from the same constants:

```text
skus.is_active            = SKU_ORDER_ELIGIBLE_IS_ACTIVE
product_variants.is_active= true                     (TBL-013)
products.status           = PUBLIC_PRODUCT_VISIBLE_STATE
categories.status         = APP2_CATEGORY_STATUS
categories.archived_at    is null
```

`products.archived_at` is not tested separately because an archived product
holds the `ARCHIVED` status, which the `PUBLISHED` predicate already excludes.

Every failure collapses to one `SKU_NOT_AVAILABLE`, so an anonymous caller
cannot enumerate unpublished Catalog rows by probing SKU ids. Proved for
inactive SKU, inactive variant, draft product, archived product, draft category,
unknown SKU — and for a product **unpublished after the client read it**.

Why a separate port from `PublicProductVariantRepository`: that one is
slug-keyed, returns every active variant and is read outside any transaction
because nothing it feeds writes. Order creation asks a different question, about
one SKU, where a decision is made. It joins no inventory table and writes
nothing — no `ensureStockRow`, no insert, no update — so reading a SKU during
checkout never provisions a stock anchor.

---

## G. Price re-resolution

`resolvePublicSkuUnitPrice` is **reused**, not reimplemented — the same `BR-021`
function `APP12-B01` publishes the advisory price through, so the figure a
customer was shown and the figure they are charged cannot be computed two ways.
`ready-made-line-money.ts` contains no `COALESCE`, no `??` fallback of its own,
and is asserted from source to call that function.

The currency travels with whichever amount won, read from that amount's own row
(CST-068). A zero override is a real price and wins — proved live and in tests
(`priceOverrideAmount = 0` → subtotal `0.00`).

**Consistency model.** The Catalog rows are read without `FOR UPDATE`. Locking
them would not make the price safer: a Catalog edit committing a microsecond
after the read is indistinguishable from one committing a microsecond before the
request arrived, and no lock closes that. What the transaction guarantees — and
what `BR-021` states — is that the frozen price *was* the published price at an
instant inside the committing transaction, read after the customer's intent and
before the row was written. Taking `FOR UPDATE` on `products` from an anonymous
public checkout would additionally queue every Admin Catalog write behind a
stock decision, buying a denial-of-service surface for no correctness. The
decision that genuinely needs serialising is **stock**, and it is serialised, on
the `sku_stocks` anchor (§K).

Proved: the client reads `100000` from `publicProductVariant_list`, an operator
reprices to `250000`, the order is placed with the old observation, and the line
freezes `250000.00` × 2 = `500000.00`.

**Money is never a float.** `merchandise-amount.ts` carries amounts as `bigint`
hundredths and can *parse, multiply by an integer count, and format* — and
nothing else. It cannot add, subtract, take a percentage or round, so no future
edit can fold a shipping fee into a merchandise subtotal (`BR-027`). Its exported
surface is asserted to be exactly those five functions. Separate from
`quotation/domain/pricing/vnd-amount.ts` on the reasoning
`shipping-fee-amount.ts` and `observed-amount.ts` already record.

---

## H. Snapshot freeze

One `order_items` row, position 1, subject `sku_id`,
`customer_owned_product_id = NULL`, `approval_snapshot_id = NULL`. Frozen:
`product_name`, `variant_label`, `size_label`, `quantity`,
`unit_price_amount`, `line_total_amount`, `currency_code`.

An absent optional attribute is snapshotted **as absent** — never `'N/A'`, never
an empty string. Proved with a variant carrying `NULL` on both attribute
columns: both snapshot columns are `NULL`.

Proved as history, not a join: after creation the Product is renamed and
repriced to `999000`, the Variant relabelled, and the SKU override set to `1` —
and the line still reads `B02 Tee` / `Black` / `M` / `200000.00` /
`400000.00`, with `orders.total_amount` unchanged.

---

## I. Shipping details / pending-fee semantics

The delivered `OrderRepository.saveShippingDetails` writes the row inside the
same transaction — one writer for that table, not a second copy of its rules.

`feeAmount` is **omitted**, not zero. `BR-027` forbids a fabricated
shipping-inclusive figure, and a `0` fee would read as *"shipping is free"*
rather than *"shipping has not been priced"*. Live and test proof:
`shipping_details.fee_amount IS NULL`, `status = 'EDITABLE'`.

`orders.total_amount` holds the **merchandise subtotal** and is the only money
this path writes. It is not a payable total: no obligation exists, and
`APP12-B03` freezes subtotal + fee + payable total when the operator sets the
fee. The response names it `merchandiseSubtotal` and publishes no
`shippingFee`, `finalTotal`, `payableAmount` or `totalAmount` field.

No carrier integration, no automatic calculation, no flat rate.

---

## J. Reservation transaction

One transaction over four bounded contexts, in this order:

```text
1  resolve the customer          nothing may be written for an unverified caller
2  claim the idempotency key     before any consequence, so a replay writes none
3  re-read the SKU               eligibility and price, in this transaction
4  compute the subtotal          exact bigint hundredths, no client value
5  insert order + frozen line    the reservation's FK needs the order to exist
6  save the shipping detail
7  reserve under the anchor lock expires_at = order.created_at + 24h
8  complete the idempotency record
```

Step 5 before step 7 is forced by `fk_inventory_reservations__order_id`, and is
safe precisely because they share a transaction: an order whose reservation
fails never commits. **No `AWAITING_SHIPPING_FEE` order can exist without its
reservation** — proved directly by a query asserting zero orders with no
reservation after the oversell race.

Lock order is `orders` (insert) → `sku_stocks` (anchor), the direction
`DB8_LOCK_ORDER_MATRIX.md` already records. Nothing reverses it.

---

## K. Stock lock and availability

The delivered `SkuStockRepository.createReservation` is called — there is no
second reservation path and this module composes none (asserted from source: the
use case names no `inventoryReservations` or `skuStocks` table). It takes the
`sku_stocks` row lock (`GRD-014`), re-reads availability under it, and refuses if
short. No availability figure read anywhere else influences the decision; the
`APP12-B01` public number is never consulted.

**Origin-aware eligibility.** `ReservationEligibilityGuard` now reads
`ORDER_ORIGIN_PORT` first:

```text
origin absent      → RESERVATION_ORDER_NOT_FOUND   (distinct from a deposit refusal)
origin READY_MADE  → eligible; the order's existence in this transaction is the
                     precondition (BR-024/BR-029 — no deposit exists or ever will)
origin CUSTOM      → unchanged: DEPOSIT obligation must be SATISFIED
```

The port publishes one immutable column and nothing else, so Inventory reads no
Ordering table (`BACKEND_CONVENTIONS` §10) and the guard cannot start deciding
questions that belong to the order's writer. The custom path is byte-identical.

**Missing stock anchor — §17.** `StockAnchor.requireLocked` raises
`RECORD_NOT_FOUND`, which this command reports as `INSUFFICIENT_STOCK`. No
anchor is provisioned: the anchor is operator-owned inventory data
(`APP8-B01`'s Admin provisioner is the only creator), and the public read
already treats a missing anchor as zero available (`APP12-B01`). Creating one
here would make an anonymous checkout write the inventory tables and would let a
SKU nobody has stocked be sold. Proved: refusal is `INSUFFICIENT_STOCK`,
`sku_stocks` count stays 0, nothing else is written.

Ledger: one `RESERVED` entry, `quantity = 2/3`, `on_hand_delta = 0`,
`actor_kind = SYSTEM`, `system_job_key = order.readyMade.create`. On-hand is
untouched — a reservation commits stock, it does not issue it.

---

## L. Initial 24h expiry

```text
READY_MADE_INITIAL_RESERVATION_WINDOW_MS = 86_400_000
reservation.expires_at = orders.created_at + 24h
```

Measured from the **order's own committed `created_at`**, returned by the writer,
never from an application clock read earlier and never rounded to a boundary.
`createReservation` gained an optional `expiresAt`; **absent still means no
expiry**, which is the delivered `PO-APP8-002` semantics for every custom
reservation and the reason the column is nullable at all. The window is the
caller's policy — the writer stores the instant it is handed and computes none.

Proved: `extract(epoch from (expires_at − orders.created_at)) * 1000` is in
`(86_399_999, 86_400_000]`. The bound is one millisecond rather than exact
because `now()` carries microseconds and a JS `Date` does not, so the window is
measured from the millisecond-truncated instant the driver returned — truncation
is toward the past, so the deadline is never later than 24h. The published
`reservationExpiresAt` is asserted equal to the persisted instant, not a second
value.

CUSTOM reservations remain no-expiry: proved by a fixture seeding a
`RESERVED` reservation with `expires_at IS NULL` that the sweep leaves alone,
and by the full `APP8-W01` suite (`writes a no-expiry reservation`).

---

## M. Expiry runtime ownership

```text
INITIAL_EXPIRY_RUNTIME = DELIVERED_BY_B02
```

No runtime consumed `expires_at` before this checkpoint. The
pre-implementation-audit C1 report §H assigns it: *"A sweeper is required;
`expires_at` and its partial index make it cheap. Owned by `APP12-DB01` (state
authority) and `APP12-B02` (write path), with the sweeper in the existing
worker."* That sweeper is delivered here.

`apps/worker/src/jobs/ready-made-reservation-expiry/` — a second, small
scheduled loop beside the outbox runtime, exactly as `IntakeCleanupModule` is.
It registers **no handler**, so the poll loop's claim filter is unchanged.

```text
reservation expires
→ reservation  RESERVED → EXPIRED, ledger RESERVATION_EXPIRED, stock returns
→ order        AWAITING_SHIPPING_FEE | AWAITING_PAYMENT → CANCELLED, with a reason
```

One transaction **per reservation**, not per pass: a batch-wide transaction
would hold `orders` and `sku_stocks` locks the public checkout path needs, and
one failure would roll back fifty legitimate releases.

It binds no writer of its own. It acts through
`SkuStockRepository.expireReservationIfDue` and
`ReadyMadeOrderRepository.transitionReadyMade` — the delivered writers — because
a worker-local copy of a terminal inventory write or an order transition is
exactly the duplication `PO-APP8-006` and `APP7-W01-C1` corrected. The only
thing it owns is the candidate query, which nothing else asks.

The order move is `STATE_CHANGE`, the default: `ORDER_TRANSITION_EVENT_KINDS` is
a closed set of six and none names an expiry. The cause lives in the reason
column, which `ck_orders__cancelled_reason_required` makes mandatory. A seventh
kind would be a schema change and §6 has none.

It cancels no payment obligation because at B02 there are none; `APP12-B03`
creates the `FULL` obligation, and the live-obligation half of `BR-026` is added
there without changing either write above.

**Live proof** (running worker, dev stack):

```text
[ReservationExpiryRuntimeService] Ready-Made reservation expiry started; one pass every 60000ms.
[ExpireReadyMadeReservationsUseCase] Ready-Made reservation expiry: examined 1, expired 1.

reservation = EXPIRED
order       = CANCELLED, "Reservation window expired before payment was completed."
ledger      = RESERVED (order.readyMade.create) then
              RESERVATION_EXPIRED (inventory.readyMade.reservationExpiry)
on_hand     = 5, unchanged — availability returned, goods never left
```

---

## N. Idempotency

```text
namespace  readyMadeOrder.create
scope key  the verified SUBMISSION challenge id
finger     sha256 over (skuId, quantity, the six delivery fields)
TTL        86_400_000 ms — DB3's medium ("submission") class, CON-144 deferred
```

No client-minted key is accepted and none exists in the contract. The challenge
is server-issued, already mandatory for this command, naturally one-to-one with
an order (challenges are terminal after `VERIFIED` and hard-TTL-deleted), and
rate-limited by `GRD-026` — the `ADR-DB1-017`/`G01-D01` argument, point for
point. It is emphatically **not** SKU + customer: that pair is stable across
time and would make a customer's second, deliberate purchase collide with their
first. Proved: a second verified challenge on the *same* customer and SKU
creates a second order (2 orders, 5 units reserved).

The fingerprint deliberately excludes every server-derived value — price,
currency, total, order code, reservation expiry, customer id — so an honest
retry arriving moments after a Catalog edit is a **replay**, not a conflict.
That is the recorded reasoning `submission-fingerprint.ts` applies to the design
document hash. The delivery facts *are* included, because a retry that quietly
changed the address is not the same order (proved: address change → `409`).

The encoding is length-prefixed and joined in fixed order, with `-:` for an
absent optional, so `"ab"+"c"` and `"a"+"bc"` cannot collide (proved) and an
omitted ward differs from an empty one (proved).

**Two namespaces over one challenge** is correct rather than a loophole: the
same verified human may submit a custom request *and* place a Ready-Made order,
each exactly once per verification, and neither claim can be replayed as the
other — `uq_idempotency_records__namespace_scope_key` keys on the pair.

**Transaction boundary (§23).** `IdempotencyStore.claim` and `complete` both run
inside the business transaction, so a record can never be `COMPLETED` for work
that rolled back, and a refusal rolls its claim back with the work it guarded —
proved: after every refusal, `idempotency_records` for that scope key is 0, so a
genuine retry is never blocked.

---

## O. Concurrency evidence

Real races: each pair is issued without awaiting the first, against the real
application and one real PostgreSQL, over separate pooled connections. No mocked
mutex, no injected barrier, no serialisation helper.

**Oversell (§30).** available = 4, two *different* challenges each request 4 —
so idempotency cannot be what resolves it; only the anchor lock can.

```text
exactly one 201                              ✔
exactly one 422 INSUFFICIENT_STOCK           ✔
committed orders = 1, reservations = 1       ✔
reserved total = 4 ≤ available 4             ✔
on_hand = 4 (unchanged)                      ✔
orders with no reservation = 0               ✔
```

**Split that both fit.** available = 10, concurrent 4 + 6 → both `201`, two
reservations, total exactly 10.

**Same key, raced (§31).** Same challenge, same fingerprint, two connections.
One `201`; the other is `201`-with-identical-data or `409` — either canonical
outcome is accepted because which one appears depends on how PostgreSQL resolves
a speculative insert against an uncommitted conflicting row, and pinning it
would make the suite a test of PostgreSQL. Asserted: exactly **one** order, one
line, one shipping detail, one reservation, one `order.created` event, and no
`duplicate key` / `uq_` / `23505` text anywhere in either response.

**Price change (§32)** and **stock change (§33)** are §G and §K above.

---

## P. Error contract

| Code | Status | Meaning |
|---|---|---|
| `VERIFIED_CONTACT_REQUIRED` | 422 | GRD-001 — no live verified challenge backs this call |
| `SKU_NOT_AVAILABLE` | 422 | `BR-022` — not sellable now, for any of six reasons |
| `INSUFFICIENT_STOCK` | 422 | `BR-022` — sellable, but not this many units |
| `IDEMPOTENCY_CONFLICT` | 409 | GRD-030 — same key, different request |
| `DUPLICATE_OPERATION` | 409 | GRD-012 — another attempt in flight; retryable |

`INSUFFICIENT_STOCK` is `422` and not `409`: it is not a conflict between two
versions of one thing, it is this request asking for more than exists, and the
remedy is to order fewer units.

No message names a customer, contact, challenge, order, reservation, stock
anchor, another order, a SQL state or a constraint. `SKU_NOT_AVAILABLE` and
`INSUFFICIENT_STOCK` publish **no number** — telling an anonymous caller how many
units stand behind a SKU turns a checkout endpoint into an inventory read.
Proved: the refusal for a request of 9 against 2 available contains neither the
stock anchor id nor the figure `2`.

Zero stock is an ordinary business refusal, not a fault. Every refusal rolls the
transaction back, so "no partial side effect" is a property of the transaction
rather than a promise — asserted after every negative case by counting orders,
reservations, shipping details, ledger entries and idempotency records.

---

## Q. CUSTOM regression

| Suite | Result |
|---|---|
| `custom-request-submission` ×3 (API, real HTTP) | **45 passed** |
| `inventory-persistence` + `admin-sku-stock` ×5 | **73 passed** |
| `@embroidery/worker` — full suite, 60 files | **1040 passed** |
| `@embroidery/persistence` — 10 of 11 files | **121 passed** (§Z) |

The worker suite includes `APP8-W01` (`payment.verified` → official
reservation), `APP8-E01` J2 and `APP9-E01` J2B. Specifically re-proved:
`writes a no-expiry reservation and does not touch on-hand`, the aggregated
one-reservation-per-SKU rule, the COP no-op, redelivery convergence, and the
insufficient-stock refusal. `DEPOSIT`/`REMAINING` behaviour is unchanged.

**One pre-existing defect was repaired to make this regression runnable.**
`apps/worker/.../inventory-reservation-fixture.ts` inserted an order without
`origin`, which `APP12-DB01` made `NOT NULL` with no default. DB01 updated every
API fixture and missed this worker one, so the entire `APP8-W01` CUSTOM
reservation regression had been failing since migration 0038. The fixture now
states `'CUSTOM'` — a one-column test-fixture repair, no lifecycle change.

---

## R. Audit/outbox behavior

The delivered `order.created` outbox event is reused — the same `eventType` and
`aggregateKind = 'ORDER'` the custom path appends (SE-006, `G-DB7-54`). One
order-creation announcement, not two vocabularies. No new event bus, no new
recorder.

Payload: `{ orderId, code, origin: 'READY_MADE' }` — canonical references only,
stating the origin truthfully and carrying no `customRequestId`, because there
is none and none is invented. Appended inside the same transaction, so the event
can never describe an order the database rolled back. Proved: exactly one event
per created order; exactly one after the same-key race.

No audit event is written by this command: the identity resolution writes one
only when it *creates* a customer, which is `APP4-B02`'s behaviour and unchanged.

---

## S. OpenAPI delta

```text
paths        120 -> 121     (+1: /api/public/ready-made-orders)
operations   133 -> 134     (+1: publicReadyMadeOrder_create)
public ops    44 ->  45
schemas      261 -> 265     (+4 — see the reconciliation below)
```

`pnpm --filter @embroidery/api openapi:generate` then `openapi:check` — artifact
up to date, no hand edits.

### Schema-count reconciliation (corrected at `APP12-B03` §2)

This section originally recorded the schema delta as `263 -> 265`. That start
figure was wrong, and the correction is recorded here rather than in a new
checkpoint because it is a **prose error in this report**, not a defect in what
B02 built: no runtime, contract or generated artifact changes as a result.

Measured mechanically from the committed artifacts:

| Commit | Checkpoint | paths | operations | schemas |
|---|---|---|---|---|
| `47c59044` | `APP12-B01-C1` (accepted baseline) | 120 | 133 | **261** |
| `972b3261` | `APP12-B02` | 121 | 134 | **265** |

So the accepted-baseline delta is `261 -> 265`, and no independent pre-B02
drift exists: `47c59044` measures exactly the 261 the accepted `APP12-B01-C1`
baseline states. B02 introduced **four** schemas, not two — the two named above
plus the two the report's parenthetical omitted:

```text
+ CreateReadyMadeOrderBody
+ ReadyMadeOrderDelivery
+ ReadyMadeOrderCreatedResponse
+ ReadyMadeOrderSubtotalResponse
```

No schema was removed, and the one added path and operation are unchanged from
what this section already recorded. `APP12-B03`'s frozen baseline therefore
starts at `121 / 134 / 265`.

---

## T. Generated-client delta

`pnpm --filter @embroidery/api-client generate` → 2 files regenerated;
`check:generated` reports up to date at tree hash
`277d260244d1c104d3c13fc29f3a9e895b107480b4bcbba9de6b59f30a0bf87d`;
`typecheck` clean. No hand edits. No frontend consumes it yet — `APP12-S02` owns
the checkout UI and is not started.

---

## U. Release-gate delta

```text
public operations   44 -> 45
DENY                31 -> 31      (unchanged — no Wave-2 operation touched)
ALLOW               13 -> 14      (+ publicReadyMadeOrder_create)
```

Classified **ALLOW**: Ready-Made direct commerce *is* Wave 1, so withholding the
operation that creates the order would withhold the wave. It names no custom
capability — no request, no quotation, no design, no session, no deposit — and
its subject is a SKU, which only Wave 1 sells.

`release-gate.contract.spec.ts` — **12 passed**, including a new case asserting
by name that the guard admits `publicReadyMadeOrder_create` while
`CUSTOM_EMBROIDERY_RELEASE_ENABLED=false`, so a regression that reclassified it
fails loudly rather than only as a count. The union of both sets is still
asserted to equal exactly the published public operations, so an operation added
later cannot slip through unclassified.

---

## V. Live HTTP evidence

**The evidence below was obtained on a disposable database.** The earlier run
against the shared development database is withdrawn (§AD) and is not evidence
for this checkpoint.

Mechanism: `createApiIntegrationContext` boots the **real `AppModule`** — real
controllers, real global prefix, real validation pipe, real exception filter,
real repositories, real outbox — against a database `createDisposableDatabase`
provisions and migrates 1→38. Requests go over real HTTP/1.1 to the booted
Nest server on an ephemeral loopback port. Nothing is mocked.

```text
POST /api/public/ready-made-orders  quantity 3, base price 150 000
  201 READY_MADE_ORDER_CREATED
  { orderCode: ORD-…, status: AWAITING_SHIPPING_FEE,
    merchandiseSubtotal: { amount: "450000.00", currency: "VND" },
    reservationExpiresAt: <created_at + 24h> }

same body again        → 201, byte-identical data, still one order
same key, quantity 3→2 → 409 IDEMPOTENCY_CONFLICT, still one order
```

Committed rows asserted by query: 1 `READY_MADE` order at
`AWAITING_SHIPPING_FEE` with all three custom-chain columns `NULL`; 1 frozen SKU
line with `approval_snapshot_id NULL`; 1 `shipping_details` `EDITABLE` with
`fee_amount NULL`; 1 `RESERVED` reservation at exactly the 24-hour window; 1
`RESERVED` ledger entry with `on_hand_delta 0`; 1 `order.created` event stating
`READY_MADE`; **0** payment obligations, **0** payment attempts, **0**
production jobs, **0** custom requests, **0** quotations, **0** approval
snapshots, **0** secure-access grants.

Response body asserted to contain no customer id, SKU id, stock anchor id,
challenge id, product id or contact value.

Worker runtime evidence is `reservation-expiry.integration.spec.ts`, which boots
the real `WorkerModule` against its own disposable database (§M).

---

## W. Live-fixture provenance/cleanup

```text
commercial_live_validation_database = DISPOSABLE
disposable_db_removed_after_run     = true
row_level_cleanup_required          = none
```

Nothing has to be cleaned, because nothing outlives the database. Each suite's
database is named `embroidery_db7_<label>_<pid>`, is dropped in `afterAll`
through a `CleanupStack` that pushes `drop database` **first** so it runs
**last**, and is dropped from the failure path too (`catch → cleanup.run()`), and
again by `createDisposableDatabase`'s own `catch` if setup fails half-way.
`assertDisposableName` structurally refuses to point the context at the
persistent database.

Proved empirically — the database list before and after the full validation run:

```text
databases before = 13
databases after  = 13
leaked by this run = (none)
```

`APP12-B01-C1`'s seed → evidence → remove → prove-removal discipline is
superseded for this class of data by §3A.5 (§AC): for retain-forever commercial
records, row-level cleanup is the wrong abstraction and database-level
disposability is the right one.

---

## X. Files changed

**Promoted (moved, not copied)**

```text
apps/worker/.../order-conversion/domain/order-code.ts
  -> packages/domain-types/src/codes/order-code.ts        + index export
```

`apps/api` became the second writer to mint an `ORD-` code under the same
`uq_orders__code` arbiter. Two copies of one format sharing one uniqueness
constraint is how two writers start drawing from different alphabets, so the
file moved. `IMP-D054`'s rule. Format unchanged.

**`packages/persistence`** — new: `ready-made-order.repository.ts`,
`drizzle-ready-made-order.repository.ts`, `order-origin.port.ts`,
`drizzle-order-origin.adapter.ts`, `order-transition-write.ts`. Modified:
`order-persistence.module.ts`, `drizzle-order.repository.ts`, `index.ts`,
`inventory-persistence.module.ts`, `reservation-eligibility.guard.ts`,
`inventory-reservations.ts`, `reservation-terminalization.ts`,
`sku-stock.repository.ts`, `drizzle-sku-stock.repository.ts`.

`order-transition-write.ts` is a split, not a second implementation: the move
gained a second caller that maps the result differently, so the write lives once
and returns the **row**, and each repository maps it onto its own aggregate.
`isLegalOrderTransition` never was origin-aware and does not need to be —
`ck_orders__origin_status_allowed` is the physical arbiter.

**`apps/api`** — new: `modules/order/domain/ready-made/` (5 files),
`modules/order/application/ready-made/create-ready-made-order.use-case.ts`,
`modules/order/presentation/public-ready-made-order.{controller,contract.spec}.ts`
and its two schemas, `modules/order/ready-made-order.module.ts`,
`modules/customer/application/verified-challenge-identity.resolver.ts`,
`modules/catalog/{catalog-purchasable-sku.module.ts, domain/repositories/purchasable-sku.port.ts, infrastructure/persistence/drizzle-purchasable-sku.adapter.ts}`.
Modified: `bootstrap/app.module.ts`, `modules/customer/customer.module.ts`,
`modules/order/application/submission-identity.resolver.ts`,
`platform/release-gate/{wave2-operation-authority.ts, release-gate.contract.spec.ts}`.

**`apps/worker`** — new: `jobs/ready-made-reservation-expiry/` (6 files incl.
its integration suite). Modified: `bootstrap/worker.module.ts`,
`jobs/order-conversion/{application/convert-approved-design.usecase.ts, domain/shared-code-generator.spec.ts}`,
`jobs/inventory-reservation/tests/inventory-reservation-fixture.ts`.

**Tests** — `apps/api/test/support/ready-made-order-fixture.ts` and three
integration suites (`-creation`, `-authority`, `-concurrency`).

**Contracts** — `packages/contracts/openapi/openapi.generated.json`,
`packages/api-client/src/generated/*` (generated, not hand-edited).

**Docs** — `docs/implementation/VALIDATION_GOVERNANCE.md` §3A.5.

46 paths in `git status`.

---

## Y. File-size evidence

`node tools/check-file-size.mjs --paths …` over every file this checkpoint owns:

```text
Scoped file-size check passed (56 file(s), 4 above the review threshold).
```

**Zero** hard-limit violations. The four review-threshold entries:

| File | Lines | |
|---|---|---|
| `inventory-reservations.ts` | 367 | grew here; the due-check was moved to `reservation-terminalization.ts` beside the other terminal decisions |
| `reservation-terminalization.ts` | 322 | received that move |
| `drizzle-order-shipping.repository.ts` | 374 | pre-existing, untouched |
| `order.repository.ts` | 315 | pre-existing |

Two files were split during delivery rather than allowed to grow: the use case
shed its money resolution (`ready-made-line-money.ts`), its result codec
(`ready-made-order-result.codec.ts`) and its error classification (moved to
`ready-made-order.errors.ts`), ending at **271** lines.

---

## Z. Validation

| Command | Result |
|---|---|
| `git diff --check` | clean |
| `pnpm --filter @embroidery/persistence typecheck` | pass |
| `pnpm --filter @embroidery/domain-types typecheck` | pass |
| `pnpm --filter @embroidery/api exec tsc --noEmit` | pass |
| `pnpm --filter @embroidery/worker typecheck` | pass |
| `pnpm --filter @embroidery/api-client typecheck` | pass |
| API `--testPathPatterns="ready-made"` | **7 suites, 158 tests** pass |
| API `--testPathPatterns="release-gate"` | **12 tests** pass |
| API `custom-request-submission` ×3 | **45 tests** pass |
| API `inventory-persistence`/`admin-sku-stock` ×5 | **73 tests** pass |
| Worker full suite | **60 suites, 1040 tests** pass |
| `pnpm --filter @embroidery/persistence test` | 10/11 suites, **121 tests** pass (1 pre-existing failure, below) |
| `pnpm --filter @embroidery/api openapi:generate` + `openapi:check` | up to date |
| `pnpm --filter @embroidery/api-client generate` + `check:generated` | up to date |
| `node tools/check-category-source-of-truth.mjs` | pass — 2418 files |
| `node tools/check-file-size.mjs --paths …` | pass — 0 hard violations |
| `npx prettier --check` (changed files) | pass |
| `npx eslint` (changed dirs, api + worker + 2 packages) | pass |

Not run, and why: full monorepo aggregates (prohibited by
`VALIDATION_GOVERNANCE` §1), UI/E2E/Figma/performance (no UI, no design change),
storefront and admin suites (untouched).

---

## AA. Baseline freeze

```text
migrations        38          unchanged — migration delta 0
DB schema         unchanged   no DDL of any kind
Figma             unchanged
Storefront UI     unchanged
Admin UI          unchanged
```

`APP12-DB01` was explicitly built to make B02 representable without another
structural migration, and it was: `orders.origin`, the nullable custom chain,
the nullable `order_items.approval_snapshot_id` with
`tg_order_items__origin_subject`, the nullable
`inventory_reservations.expires_at` and its partial index all already existed.
Nothing was blocked and no migration 0039 was created.

---

## AB. Follow-ups

| Id | Item | Owner |
|---|---|---|
| `FU-APP12-B02-01` | `packages/persistence/src/runtime/database-runtime.integration.spec.ts` asserts a canonical table count of **78**; the committed 38-migration chain creates **79**. Proved pre-existing: identical failure at `HEAD` with this checkpoint's work stashed, and `git status packages/database` is empty. | a database-hygiene checkpoint |
| `FU-APP12-B02-02` | 13 pre-existing failures across 9 API suites under `--testPathPatterns="order\|payment\|production"` — stale path/operation lists (APP9 added dispatch, completion, shipping-detail and fee-acknowledgement routes) and one renamed business code (`DEPOSIT_NOT_PAYABLE` → `PAYMENT_OBLIGATION_NOT_PAYABLE`). Proved pre-existing: the *same 13* fail at `HEAD` with this work stashed (1145 tests there vs 1303 here — the difference is exactly this checkpoint's 158 new tests). | APP9/APP12-H01 |
| `FU-APP12-B02-03` | The APP5/APP6/APP7 public-custom integration suites require `CUSTOM_EMBROIDERY_RELEASE_ENABLED=true` and no harness sets it, so they fail with `404` under the default. Introduced by `APP12-G02`; not absorbed here. | `APP12-G02` follow-up |
| `FU-APP12-B02-04` | 11 leaked `embroidery_db7_db10_cp2_source_*` databases from earlier DB10 runs, predating this checkpoint. Observed while auditing the server; not removed, because they are not this checkpoint's data. | a database-hygiene checkpoint |
| `FU-APP12-B02-05` | The dev database's append-only history (`audit_events` 209, `outbox_events` 90, `background_job_attempts` 75) was **not** replayed into the rebuilt database, per the directive §8. It survives only in the forensic dump. | recorded, no action |

`FU-APP12-C03-01` and unrelated `H01` debt were not absorbed.

---

## AC. Dev database hygiene

```text
shared_dev_recovery                 = CLEAN_RESTORE (fresh canonical rebuild +
                                      whitelisted legitimate replay)
shared_dev_B02_test_orders          = 0
shared_dev_B02_test_order_items     = 0
shared_dev_B02_test_reservations    = 0
shared_dev_B02_test_idempotency     = 0
B02_fixture_ids_present             = 0

commercial_live_validation_database = DISPOSABLE
disposable_db_removed_after_run     = true
G03_data_created                    = false
immutability_bypassed               = false
retention_bypassed                  = false
```

**Disposable environment mechanism.** `createDisposableDatabase(label)` from
`@embroidery/database/testing` — a `embroidery_db7_<label>_<pid>` database on
the pinned `postgres:16.14-alpine` dev server, migrated 1→38 by
`runMigrations`, dropped `WITH (FORCE)` on setup failure and by an idempotent
`drop()`. `createApiIntegrationContext` boots the real `AppModule` against it,
calls `assertDisposableName` to refuse the persistent database, and pushes
`drop database` first onto a `CleanupStack` so it runs last, including from the
failure path. The worker suite composes the real `WorkerModule` against its own
such database. This is the repository's existing harness, extended — not a
second one.

---

## AD. Shared-dev recovery — what was done

**What went wrong.** Live evidence for an order-creating command was run against
the shared development database. It created `orders` and `order_items` rows,
which are a **retain-forever** family: `order_items` carries the S24 delete
policy `reject` with no operator exemption (migration `0030`), and
`tools/db-retention.mjs` refuses commercial records outright. Those protections
are correct; the mistake was the environment, not the schema.

**Preflight — provenance audit.** Every non-empty table classified before
anything was touched (47 tables, 1287 rows):

| Class | Content |
|---|---|
| **A** canonical / reconstructable | `admin_accounts` 1, `admin_credentials`, `agreements` 2, `agreement_versions` 2, `policy_configurations` 7 (+ versions 7), the 4 migration-seeded categories, the drizzle journal |
| **B** legitimate human-authored | 30 products, 1 category (`ao-thun`), 2 variants, 3 customers, 5 contacts, 10 custom requests, 17 gallery entries (+21 assets), 193 design sessions, 125 templates (+125 versions), 47 assets (+66 derivatives, +45 inspections), 7 design cases, 6 design versions, 1 approval snapshot, 1 quotation (+4 versions, +4 line items), 4 grants, 1 challenge, 1 merge case (+7 events), 27 idempotency records |
| **C** APP12-B02 test-created | 1 order, 1 order item, 1 customer, 1 contact, 1 category, 1 product, 1 variant, 1 SKU (+ the reservation, ledger, anchor, shipping detail, transitions, outbox row and idempotency record already removed by provenance) |
| **D** append-only history | `audit_events` 209, `outbox_events` 90, `background_job_attempts` 75 |

Decisive finding: **non-B02 orders = 0.** The only commercial records in the
entire shared database were the test's. So §7 applied — legitimate,
non-reconstructable data existed and had to survive — and the legitimate set
could be replayed without carrying a single commercial row.

**Recovery, in order.**

1. **Forensic dump** — `node tools/db-backup.mjs --database embroidery`, 1287
   rows / 79 tables, `sha256 6f487fce1239d47c…`, manifest written to
   `infrastructure/backup/app12-b02-forensic/`. Marked forensic-only, never an
   active environment.
2. **Contaminated DB moved aside** — `ALTER DATABASE embroidery RENAME TO
   embroidery_b02_forensic`, after stopping the app containers. Nothing deleted.
3. **Fresh canonical database** — a new empty `embroidery`, then `pnpm
   docker:dev:up` so the repository's own `db-migrate` service applied migrations
   1→38 and `staff-bootstrap` created the admin account. Result: **38 migrations,
   80 tables, 0 orders, 0 order_items.** Renaming rather than editing
   configuration means `.env` was never written and no credential was handled.
4. **Whitelisted legitimate replay** — an explicit per-table extract, in one
   transaction. Excluded, each for a stated reason: `orders`/`order_items` (pure
   residue, retain-forever); `admin_*`, `agreements`, `policy_*` (canonical,
   already seeded); catalog and customer core (replayed **row-filtered by
   recorded fixture id**, never by shape or by age);
   `audit_events`/`outbox_events`/`background_job_attempts` (append-only history,
   §8 — kept only in the forensic dump); every payment, inventory, shipping and
   production family (commercial, and empty at source).
   `approval_snapshot_agreement_acceptances` was remapped by
   `(agreement_type, version)` because agreement ids are minted per migration run
   and the source ids do not exist in the new database.
   Four genuine current-pointer FK cycles — `custom_requests → quotations`,
   `custom_requests → design_cases → design_versions`, `quotations →
   quotation_versions` — were loaded with the pointer `NULL` and repointed at the
   end of the same transaction from values captured before nulling. **No trigger
   was disabled, no constraint dropped or deferred**; the S24 triggers fire on
   `UPDATE`/`DELETE` only, so an INSERT-ordered load meets every one as written.
5. **Verification** — all mandated counters `0`; legitimate counts match the
   audit exactly (30 products, 5 categories, 3 customers, 10 requests, 17 gallery
   entries, 193 sessions, 125 templates, 47 assets, 27 idempotency records…);
   API boots; `/api/health`, `/api/public/categories` (5, the B02 one gone),
   `/api/public/products`, `/api/public/gallery-entries` and
   `/api/public/sitemap-entries` all `200`.
6. **Decommissioned** — `DROP DATABASE embroidery_b02_forensic`. The test order
   and its frozen line disappear with the database, which is the only route that
   removes a retain-forever record without weakening a retention rule.
7. **Revalidated** — the full B02 commercial evidence rerun on disposable
   databases (§V, §W), with 13 databases before and 13 after, and the shared
   database re-verified at all-zero afterwards.

**Governance.** `VALIDATION_GOVERNANCE.md` §3A.5
`SHARED_DEV_DB_COMMERCIAL_WRITE_POLICY` now records the rule: a checkpoint may
not use the shared development database for live validation that creates an
immutable or retain-forever commercial record; such validation runs on a
disposable database, always; row-level cleanup is the wrong abstraction for that
class and database-level disposability is the right one; and the authorised
persistent commercial dataset remains `APP12-G03`'s alone.

---

## AE. Acceptance criteria

All 62 of §51 hold, plus the 13 added by the directive §15. Selected evidence:

| # | Criterion | Evidence |
|---|---|---|
| 3 | exactly one public command | §C; contract spec asserts one route decorator, no path argument |
| 4–5 | verified customer mandatory; no client UUID trusted | §D; `customerId` is a `400` |
| 9–11 | B01 price not trusted; `resolvePublicSkuUnitPrice` reused; frozen | §G |
| 12–16 | anchor lock; B01 availability not trusted; oversell race | §K, §O |
| 17–27 | origin, status, null chain, one SKU line, frozen facts | §H, §V |
| 29–30 | no fabricated fee or payable total | §I |
| 31–33 | 0 obligations, 0 attempts, 0 production/custom artifacts | §V |
| 34–37 | atomic reservation, `RESERVED`, quantity, +24h | §J, §L |
| 38–39 | CUSTOM no-expiry unchanged; missing anchor per APP8 | §L, §K |
| 40 | no orphan order | §J |
| 41–44 | idempotency durable, replay, conflict, raced | §N, §O |
| 45–47 | no unsafe ids; no ORDER_ACCESS; no B03 work | §V, §I |
| 48–49 | Wave-1 ALLOW; 31 DENY unchanged | §U |
| 50–54 | 38 migrations; schema, Figma, UI unchanged | §AA |
| 55 | expiry runtime ownership resolved | §M — `DELIVERED_BY_B02` |
| 56–57 | no persistent fixture; G03 not created | §W, §AC, §AD |
| §15.1–13 | directive's clean-database criteria | §AC, §AD |

---

## AF. Roadmap

```text
APP12-B02 COMPLETE
APP12-B03 NEXT
```

`APP12-B03` was not started. Nothing was pushed.
