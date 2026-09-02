# APP12-B04-C1 — Machine-Readable Ready-Made Termination Reason

```text
CORRECTION   = APP12-B04-C1
PARENT       = APP12-B04
STATUS       = COMPLETE
DATE         = 2026-09-02
CORRECTION_USED = 1 / 1   (no C2)
NEXT         = APP12-B05
PUSHED       = false
```

---

## A. Verdict

`APP12-B04-C1` is **COMPLETE**.

The secure Ready-Made order projection now distinguishes a lapsed reservation
from an ordinary cancellation, from a **committed domain fact** and never from
prose. No new operation, no new order state, no migration, and no change to any
accepted B04 behaviour.

```text
NEW_HTTP_OPERATIONS = 0
MIGRATIONS          = 38   (DB schema delta 0)
OPENAPI             = 125 paths / 138 operations / 277 schemas   (unchanged)
PUBLIC_OPERATIONS   = 49                                          (unchanged)
RELEASE_MATRIX      = 28 DENY / 18 ALLOW / 3 SCOPE_GATED          (unchanged)
```

The one contract change is additive: an optional `terminationReason` on
`ReadyMadeOrderAccessResponse`, published as an enum with a single member.

---

## B. Root cause / contract gap

`APP12-B04` published the customer order projection with the order's own status
and nothing else about *why* a terminal order ended, and routed the gap to
`APP12-S03 / APP12-B05` as `FU-APP12-B04-01`.

The routing was wrong, and the Product Owner is right to reject it. `APP12-D01`
§I lists `CANCELLED` and `EXPIRED` as two of the eight page variants. `APP12-S03`
is a Storefront checkpoint: handed a contract that carries only `CANCELLED`, its
only ways to reach `EXPIRED` would have been to match on `orders.cancelled_reason`
prose, or to infer from an absent `paymentDeadline` — a heuristic and a
coincidence respectively. Both are backend logic in a frontend, and both would
have broken silently the first time an operator rephrased a sentence.

B04 owns this projection, so the gap belongs here.

The B04 report's own reasoning for deferring was that
"`orders.cancelled_reason` is free text, so §13's *if the existing cancellation
reason authority provides it* is not satisfied." That was true of the **reason
column** and false of the **domain**: the authority was never the prose, it was
the reservation.

---

## C. Existing machine-readable authority

No new persisted fact was needed. `ExpireReadyMadeReservationsUseCase` already
writes both halves in **one transaction**:

```text
reservation  RESERVED -> EXPIRED     expireReservationIfDue
order        -> CANCELLED            transitionReadyMade, only if the above expired
```

The use case's own step 3 depends on step 2 — "an order is never cancelled for
an expiry that did not happen" — so a Ready-Made order that is `CANCELLED` while
its stock hold is `EXPIRED` is a committed fact rather than a correlation.

`INVENTORY_RESERVATION_STATES` is `RESERVED | CONSUMED | RELEASED | EXPIRED`, and
`EXPIRED` has exactly one writer: the sweep. Nothing else in the system produces
it for a Ready-Made order.

### The predicate

`readOrderStockEndedByExpiry` answers:

```text
true  ⇔  the order holds at least one reservation
         ∧ every reservation it holds is EXPIRED
```

and `terminationReasonOf` combines it with the order's own status:

```text
CANCELLED ∧ stockEndedByExpiry  ->  RESERVATION_EXPIRED
everything else                 ->  undefined
```

No column was added. §4's instruction not to duplicate the fact is honoured
literally: the classification is a **read**, not a stored value that could drift
from the rows it describes.

---

## D. Public contract decision

```text
terminationReason?: 'RESERVATION_EXPIRED'
```

Optional and **omitted** when it does not apply, rather than sent as `null` —
the rule the rest of this projection already follows for `feeAmount`, `payment`
and `paymentDeadline`, and for the same reason: an absent key and a null key are
different answers on the wire.

One enum member, because exactly one machine-readable cause exists. §6 forbids
inventing a broad taxonomy, and there is no runtime path today that cancels a
Ready-Made order for any other *recorded* reason — a second member would be a
name with nothing behind it. A future structured cancellation command adds its
value alongside the persisted fact that justifies it.

The field is documented so its absence cannot be misread: *"**Absent** means the
order was not classified as an expiry — which is not the same as 'not
cancelled', and `status` is what says that."*

`§7` is honoured: `orders.status` gains no `EXPIRED` member, `ORDER_STATES` is
untouched, and there is no second lifecycle. `APP12-S03` selects the D01
`EXPIRED` presentation from `status = CANCELLED` **and**
`terminationReason = RESERVATION_EXPIRED`.

---

## E. Reservation lookup / cardinality

`uq_inventory_reservations__order_stock__reserved` is a **partial** unique index
— it constrains `RESERVED` rows only. So although `APP12-B02` writes exactly one
reservation per Ready-Made order and nothing re-reserves, a second *terminal*
row is not forbidden by the schema. Cardinality is therefore **not** provable as
exactly one, and §9's second branch applies.

A "latest row wins" rule was rejected: it is a guess, and a guess about why a
customer's order ended is the failure this correction exists to remove. The
universal form needs no cardinality assumption and fails **closed**:

| Reservations the order holds | Answer |
|---|---|
| one `EXPIRED` | `true` — the sweep ran |
| `RELEASED` + `EXPIRED` | `false` — the hold also ended another way |
| one `CONSUMED` | `false` — the stock shipped, it did not lapse |
| one `RESERVED` | `false` — the hold is still live |
| none | `false` — there is nothing to have expired |

Counted in the database (`count(*) filter (where status = 'EXPIRED')`), not
materialised and filtered in JavaScript: the answer is two integers, so no
reservation id ever enters the memory of a read that must not publish one — §12
holds structurally rather than by omission in a mapper.

### Where the read lives

`SkuStockRepository.orderStockEndedByExpiry` — Inventory's contract, because
what `EXPIRED` means is Inventory's to say. Whether that makes a *customer*
order "expired" is Ordering's decision, taken by `terminationReasonOf` against
the order's own status.

Per §8 the accepted deadline read is untouched: `findActiveOrderReservation`
still means "the live `RESERVED` row", and the termination read is a separate,
smallest query. It is issued **only for a terminal order**, so a live order
costs exactly what it did before this correction. Neither read takes `FOR
UPDATE`.

---

## F. Expired projection evidence

`test/integration/ready-made-order-termination.integration.spec.ts`, on a
disposable database, driven by the **real** sweep — not a hand-written `UPDATE`.
`ExpireReadyMadeReservationsUseCase` runs where it lives: in the built worker
`dist`, in its own OS process, through the `worker-expiry-process` harness
`APP12-B03-C1` delivered.

That choice is the same one B03-C1 forced: a fixture that writes
`reservation EXPIRED` itself proves the fixture, and the entire claim here is
that the two rows the sweep writes **together** are what the classification
reads.

Two cases, both PASS:

```text
lapse before the fee      AWAITING_SHIPPING_FEE -> real pass -> CANCELLED
lapse of the payment win. AWAITING_PAYMENT      -> real pass -> CANCELLED

after each pass, from committed rows:
  orders.status                = CANCELLED
  inventory_reservations.status = EXPIRED

publicReadyMadeOrder_current, through a real ORDER_ACCESS grant:
  status            = CANCELLED
  terminationReason = RESERVATION_EXPIRED
  paymentDeadline   absent
  payment           absent
  body contains no reservation id
```

The second case also asserts `BR-026`'s money half: the live `FULL` was
`CANCELLED` by the same pass, and the projection publishes no payable total.

---

## G. Generic cancellation evidence

No Ready-Made operator-cancellation command exists yet — `APP12-B05` owns
fulfilment and no checkpoint has published a cancel route — so §11's second
branch applies: the smallest repository-supported fixture that preserves the
invariants.

The stock hold ends by **release**, which is the shape any non-expiry
cancellation has, with the `released_reason` its
`ck_inventory_reservations__released_reason_required` CHECK demands:

```text
inventory_reservations.status = RELEASED, released_reason set
orders.status                 = CANCELLED, cancelled_reason set

publicReadyMadeOrder_current:
  status            = CANCELLED
  terminationReason absent   (the key is not present at all)
```

Asserted twice — once for the value and once for the key's absence — so a future
change that started emitting `null` would fail.

The same shape now also replaces the hand-written expiry that `APP12-B04` had
left in `ready-made-order-access.integration.spec.ts`. That test kept its §25 and
§36 claims and lost its fabricated `reservation EXPIRED`; the expiry path moved
wholly to the suite where the real sweep drives it.

---

## H. Free-text non-authority proof

Both directions, both PASS:

**Case A — misleading prose cannot create the classification.** An order whose
stock was `RELEASED`, with `cancelled_reason` set to the sweep's own sentence
word for word (*"Reservation window expired before payment was completed."*).
The prose contains `expired`; `terminationReason` is **absent**.

**Case B — absent prose cannot prevent it.** An order the real sweep expired,
whose `cancelled_reason` is then rewritten to `"Hết thời hạn giữ hàng."` — text
that shares no word with the classification. The reservation row is untouched;
`terminationReason` is `RESERVATION_EXPIRED`.

Case A is the assertion that fails the moment anyone reintroduces a substring
match. Structurally, `orders.cancelled_reason` is not even reachable from this
path: `DrizzleReadyMadeOrderAccessRepository` selects an explicit column list
that does not include it, and neither the query nor the domain function holds a
reference to it.

---

## I. ORDER_ACCESS security regression

Unchanged. No new operation, no locator, no change to grant resolution, the
scope gate, expiry, revocation or supersession.

- `ready-made-order-termination` §13: two orders, one expired and one live; each
  token opens exactly its own, and the expiry of one is invisible through the
  other.
- `ready-made-order-access`: 16/16 PASS, including the two-order cross-access
  cases and the unknown / malformed / revoked / expired-grant refusals.

---

## J. FULL payment regression

Unchanged, and asserted not to have become payment authority.

For an expired order the termination suite calls all three payment operations
with a live grant and gets the delivered `404` from each — the classification is
published beside them and changes none of them.

`ready-made-full-payment` (fee correction, superseded-attempt isolation,
step-up, satisfied refusal, cross-order) and `ready-made-full-payment-races`
both PASS unchanged.

---

## K. OpenAPI / client delta

```text
paths       125 -> 125
operations  138 -> 138
schemas     277 -> 277
```

Additive within one existing component: `ReadyMadeOrderAccessResponse` gains an
optional `terminationReason` with `enum: ["RESERVATION_EXPIRED"]`. No operation
renamed, none added, none removed.

Regenerated canonically (`pnpm openapi:generate`, `pnpm openapi:check`), and the
client with `pnpm generate` — tree hash `cb08e525…`, `pnpm check:generated` up
to date, `pnpm typecheck` clean. No hand edits.

The client publishes a named type, `ReadyMadeOrderAccessResponseTerminationReason`,
which is exactly what `APP12-S03` needs to select a variant without a string
literal of its own.

---

## L. Release-gate freeze

```text
public operations = 49
STATIC_DENY       = 28
STATIC_ALLOW      = 18
SCOPE_GATED       = 3
```

Unchanged and re-asserted: `release-gate.contract` 15/15 PASS. No operation was
added, so nothing needed classifying.

---

## M. DB / Figma / UI freeze

```text
migrations        = 38   (no 0039)
DB schema delta   = 0
Figma             unchanged
Storefront routes unchanged (0)
Admin routes      unchanged (0)
```

The correction adds a **read**, not a column. §18's `BLOCKED_DB_GAP` branch was
not reached: the reservation authority was sufficient.

---

## N. Disposable DB hygiene

```text
commercial_validation      = DISPOSABLE
disposable_db_removed      = true
shared_dev_B04C1_residue   = 0
G03_data_created           = false
```

Every terminal-order fixture ran on a disposable database dropped by
`CleanupStack`. The shared dev database reports 0 Ready-Made orders, 0 `FULL`
obligations, 0 payment attempts and 0 `ORDER_ACCESS` grants; no `app12_b04c1*`
database survives.

---

## O. Follow-up closure

```text
FU-APP12-B04-01 = CLOSED_BY_APP12_B04_C1
```

Unchanged and still open:

```text
FU-APP12-B04-02 -> APP12-H01   the reused evidence route still reads /deposit/
FU-APP12-B04-03 -> APP12-H01   eight contract bounds already red at HEAD
```

`APP12-S03` consumes `terminationReason` to select the `APP12-D01` §I `EXPIRED`
variant. It parses nothing.

---

## P. Files changed

**New**
`apps/api/src/modules/order/domain/ready-made/order-termination-reason.ts`,
`apps/api/test/integration/ready-made-order-termination.integration.spec.ts`

**Modified — persistence**
`inventory/reservation-window.ts` (`readOrderStockEndedByExpiry`),
`inventory/sku-stock.repository.ts` (port method),
`inventory/drizzle-sku-stock.repository.ts` (facade read)

**Modified — API**
`order/application/ready-made/read-ready-made-order.query.ts`,
`order/application/ready-made/ready-made-order.view.ts`,
`order/presentation/schemas/public-ready-made-order-access.response.ts`,
`order/presentation/public-ready-made-order-access.controller.ts`

**Modified — tests**
`test/integration/ready-made-order-access.integration.spec.ts` (the hand-written
expiry replaced by a release-shaped cancellation)

**Modified — artifacts / docs**
`packages/contracts/openapi/openapi.generated.json`,
`packages/api-client/src/generated/*`,
`docs/implementation/reports/APP12-B04-COMPLETION-REPORT.md` (correction
notice), this report, and the phase and roadmap status entries.

---

## Q. File-size evidence

Scoped gate over all 87 touched source and test files: **0 over the hard limit**,
10 above the review threshold (all under 400/600). The two files this correction
grew most are `sku-stock.repository.ts` (324, documentation) and the new
termination suite (well under the 600-line test limit).

`readOrderStockEndedByExpiry` was placed in `reservation-window.ts` and surfaced
through the facade rather than through `InventoryReservations`, which stands at
395 lines — the same reason `findActiveOrderReservation` lives there.

---

## R. Validation

```text
git diff --check                              clean
apps/api             pnpm typecheck           PASS
packages/persistence pnpm typecheck / build   PASS
packages/api-client  pnpm typecheck           PASS
packages/api-client  pnpm generate            PASS (tree hash cb08e525…)
packages/api-client  pnpm check:generated     PASS
apps/api             pnpm openapi:generate    125 / 138 / 277
apps/api             pnpm openapi:check       up to date

ready-made-order-termination (real sweep)     6 / 6 PASS
ready-made-order-access                       16 / 16 PASS
ready-made-full-payment                       PASS
ready-made-order-creation                     16 / 16 PASS
all test/integration/ready-made-* suites      PASS
release-gate.contract                         15 / 15 PASS
full-payment domain (incl. the §34 negative)  21 / 21 PASS

scoped file-size gate (87 files)              PASS (0 over limit)
eslint, changed files                         PASS
prettier --check, changed files               PASS
```

Not run, per §21: the full monorepo suite, UI/UAT, Figma and performance gates.

---

## S. Parent report correction notice

Added to `APP12-B04-COMPLETION-REPORT.md` §AA without erasing any historical
evidence — the original follow-up text is retained and marked closed.

---

## T. Roadmap

```text
APP12-B04 = COMPLETE_AFTER_C1
APP12-B05 = NEXT
CORRECTION_USED = 1 / 1 — no C2
```

Boundaries held: no FULL verification, no `READY_FOR_DELIVERY` transition, no
dispatch or completion, no Admin fulfilment, no Storefront or Admin UI, no new
public operation, no migration, no shared-dev commercial data, and nothing
pushed.
