# APP12-B03-C1 — Expiry Race Atomicity Correction

Checkpoint: `APP12-B03-C1`
Parent: `APP12-B03 — Ready-Made Shipping Fee, Total and FULL Obligation Lifecycle`
Phase: `APP12 — Hardening, UAT and Production Readiness`
Date: 2026-09-02

---

## A. Verdict

```text
APP12-B03-C1     = COMPLETE
PARENT_APP12-B03 = COMPLETE_AFTER_C1

ROOT_CAUSE          = TEST_HARNESS_DEFECT
RUNTIME_CHANGED     = false
NEW_HTTP_OPERATIONS = 0
NEW_MIGRATIONS      = 0
CORRECTION_USED     = 1 / 1
NEXT_CHECKPOINT     = APP12-B04
PUSHED              = false
```

The forbidden state the Product Owner rejected was never reachable through the
delivered runtime. It was **manufactured by the B03 race test**, which
substituted a hand-written `UPDATE inventory_reservations` for the expiry
business transaction. The correction replaced that stand-in with the real
`ExpireReadyMadeReservationsUseCase`, run in its own OS process against the same
disposable PostgreSQL, and re-proved every ordering the authority names.

No production file was edited.

---

## B. Root-cause classification

```text
ROOT_CAUSE = TEST_HARNESS_DEFECT
```

The mechanical answers §3 asks for, against
`apps/api/test/integration/ready-made-shipping-fee-concurrency.integration.spec.ts`
§41 as it stood at `d1ef6090`:

| Question | Answer at `d1ef6090` |
|---|---|
| Does the race invoke real `ExpireReadyMadeReservationsUseCase`? | **No** |
| Does it invoke the real `expireOne` transaction? | **No** |
| Does it only call reservation terminalisation? | **Yes** — and not even that: a raw `UPDATE`, not `expireReservationIfDue` |
| Does it wait for the entire expiry transaction to commit? | It waited for its own `UPDATE`, which is not the transaction |
| Are final assertions executed only after BOTH racers settle? | Yes — but on a world only the stand-in could produce |

The stand-in, verbatim from the deleted block:

```sql
with due as (
  select id from inventory_reservations
  where order_id = $1 and status = 'RESERVED' and expires_at <= now()
  for update
)
update inventory_reservations r set status = 'EXPIRED', terminalized_at = now()
from due where r.id = due.id
```

It performs **one** of the three writes the expiry transaction performs. It
writes no inventory ledger entry, cancels no live `FULL`, and — the defect —
never transitions the order. An order left at `AWAITING_SHIPPING_FEE` beside an
`EXPIRED` reservation is therefore not an outcome the test *observed*; it is the
only outcome the test *could* produce on that branch. The suite then asserted it
as legitimate at line 239:

```ts
expect(order.status).toBe('AWAITING_SHIPPING_FEE');
```

`RUNTIME_ATOMICITY_DEFECT` is ruled out by §E below, which walks the delivered
transaction, and by §G/§H/§I, which now reach the same three orderings through
the real use case and never once produce the rejected world.

---

## C. Original invalid evidence

`APP12-B03-COMPLETION-REPORT.md` §R recorded:

```text
Expiry wins: 409 refused + EXPIRED reservation + 0 obligations + AWAITING_SHIPPING_FEE
```

The same report's §P describes the real runtime correctly — reservation
`EXPIRED`, order `CANCELLED`, obligations 0. The two sections contradicted each
other because they describe **two different code paths**: §P describes
`ExpireReadyMadeReservationsUseCase`, §R describes the test's `UPDATE`. §P was
right about the product; §R was right about the test.

A correction notice is now in the parent report immediately above §41's evidence
(§R below).

---

## D. Real expiry business path

```text
apps/worker/src/jobs/ready-made-reservation-expiry/
  application/expire-reservations.usecase.ts     ExpireReadyMadeReservationsUseCase
  infrastructure/persistence/sql-due-reservation.repository.ts   listDue (unlocked scan)

@embroidery/persistence
  READY_MADE_ORDER_REPOSITORY.loadReadyMadeForUpdate     orders FOR UPDATE
  SKU_STOCK_REPOSITORY.expireReservationIfDue            → lockDueReservation + applyExpiry
  PAYMENT_OBLIGATION_REPOSITORY.findLiveForOrder / cancel
  READY_MADE_ORDER_REPOSITORY.transitionReadyMade        → CANCELLED
```

`apps/api` may not import `apps/worker` (`REPOSITORY_STRUCTURE.md`; the boundary
`APP8-E01` and `APP9-E01` each recorded when their journeys were split in two).
So the sweep is raced from **where it lives**: its own OS process, booted over
`apps/worker/dist` by `apps/worker/test/support/expiry-pass-child.mjs`, pointed
at the suite's disposable database. That is the shape the deployed system already
has — an API process and a worker process on one PostgreSQL — and it is the same
pattern `worker-smoke.integration.spec.ts` established for running built worker
code from a spec.

Composition inside the child is byte-for-byte the composition
`reservation-expiry.integration.spec.ts` uses: the whole `WorkerModule`, with
`WORKER_PROCESS` and `WORKER_STARTUP_GATE` overridden and `init()` never called,
so no poll loop and no 60-second sweep schedule can run. The only expiry that
happens is the one the parent asks for.

Forbidden substitutes, all absent from the corrected suite:

```text
direct UPDATE inventory_reservations        removed with the old §41 block
only expireReservationIfDue()               never called by the test
only reservation terminalisation            never called by the test
manual order cancellation in test           never written
fixture helper copying worker logic         none — the child calls run()
```

---

## E. Transaction / lock analysis

`expireOne`, one candidate, one transaction
(`expire-reservations.usecase.ts:151`):

```text
BEGIN
  loadReadyMadeForUpdate(orderId)        orders FOR UPDATE          ← first
    ├ undefined or not expirable  → return false, nothing written
  expireReservationIfDue(reservationId, now)
    ├ lockDueReservation                 reservation FOR UPDATE
    │   re-reads status, expires_at and re-decides due-ness
    ├ undefined → return false, nothing written
    └ applyExpiry                        RESERVED → EXPIRED + ledger
  findLiveForOrder(order, 'FULL'); cancel when PENDING
  transitionReadyMade(order → CANCELLED, reason)
COMMIT
```

Three properties the authority (§10, §11) requires, each already present:

1. **The order lock is taken first**, which is the delivered
   `orders → inventory_reservations → sku_stocks` direction
   (`DB8_LOCK_ORDER_MATRIX.md`) and the same direction
   `SetReadyMadeShippingFeeUseCase` opens with. That single shared lock is the
   whole arbitration between the two paths; neither introduces SERIALIZABLE
   isolation or an advisory lock.
2. **Due-ness is re-decided under the lock, not trusted from the scan.**
   `lockDueReservation` (`reservation-terminalization.ts:211`) takes the row
   lock and then re-reads `status` and `expires_at`, returning `undefined` when
   the reservation is no longer `RESERVED` or its window now lies in the future.
3. **The order cancellation depends on the reservation write.** `expireOne`
   returns early when `expireReservationIfDue` yields `undefined`, so an order
   is never cancelled for an expiry that did not happen — and, in the other
   direction, the expiry and the cancellation are in the same transaction, so
   the reservation can never terminalise without the order closing with it.
   Rollback takes both.

The Admin side refuses symmetrically under the same lock:
`confirmFirstFee` → `requireHeldReservation` → `lockActiveOrderReservation`,
which returns only a `RESERVED` row and otherwise raises
`ORDER_RESERVATION_NOT_HELD`; and `correctFee` refuses any status that is not
`AWAITING_PAYMENT` with `ORDER_SHIPPING_FEE_NOT_SETTABLE`. Both are 409.

**No runtime change was required or made.**

---

## F. Stale-candidate re-check

```text
due_rechecked_under_lock      = true
admin_reset_prevents_expiry   = PASS
```

The scenario is built so "stale" is proved rather than assumed:

```text
blocker order   READY_MADE  AWAITING_SHIPPING_FEE  reservation due  (now − 900s)
target  order   READY_MADE  AWAITING_SHIPPING_FEE  reservation due  (now − 300s)

harness holds `select id from orders where id = <blocker> for update`
  → sweep pass starts, listDue returns BOTH (ORDER BY expires_at, id)
  → pass blocks on the blocker's orders row
  → harness waits on pg_stat_activity.wait_event_type = 'Lock'   (measured, not slept)
  → due-candidate census here = 2                                 (the scan's own predicate)
  → real Admin PUT prices the TARGET → 200, window reset to +24h, committed
  → harness releases the blocker lock
  → pass finishes: examined 2, expired 1, skipped 1
```

The blocker is a **third** order, not one of the racers, so nothing about the
Admin write and the target candidate is serialised: the pass had already listed
the target as due before the Admin transaction committed, and re-decided it
afterwards.

Settled target:

```text
order       AWAITING_PAYMENT
reservation RESERVED, expires_at ≈ now + 24h
obligations exactly one PENDING FULL, amount == orders.total_amount
```

Settled blocker: `CANCELLED` + `EXPIRED` + 0 obligations — the candidate that
stayed due was still expired, so the skip is a decision rather than a pass that
did nothing.

---

## G. Corrected first-window race

`apps/api/test/integration/ready-made-expiry-race.integration.spec.ts`, four
attempts, each on its own real order:

```text
fixture      READY_MADE, AWAITING_SHIPPING_FEE, shipping detail EDITABLE,
             reservation RESERVED and due, 0 payment obligations

racers       real Admin PUT /api/admin/orders/{id}/shipping-detail   (HTTP, API process)
             real ExpireReadyMadeReservationsUseCase.run()           (worker process)
```

Both actors are live at once and settle before any assertion; the only arbiter
is the `orders` row lock. On two of the four attempts the two start in the same
tick; on the other two the **sweep** is held back by 30 ms and 60 ms, because
without that it wins every time — its pass opens with one unlocked index scan
while the HTTP write must first route, authenticate and validate a body. A
stagger of milliseconds is not serialisation: the loser's transaction is open
and contending either way, and it is the only way to reach both orderings from
this side of the boundary. The suite asserts that **both** orderings are in fact
reached (`toContain('200')` and `toContain('409')`), so a regression that made
one unreachable fails rather than passes quietly.

Accepted worlds, asserted per attempt:

```text
ADMIN WIN    order AWAITING_PAYMENT
             reservation RESERVED
             exactly one PENDING FULL, amount == orders.total_amount

EXPIRY WIN   HTTP 409
             order CANCELLED
             reservation EXPIRED
             payment obligations = 0
```

Rejected worlds — asserted as a **census over the whole settled database**,
after every case in the suite, rather than per case:

```text
AWAITING_SHIPPING_FEE + EXPIRED   → 0
AWAITING_PAYMENT      + EXPIRED   → 0     (both covered by one active-order census)
CANCELLED             + PENDING   → 0
CANCELLED             + RESERVED  → 0
```

Four consecutive full runs of the suite: 13/13 each time.

---

## H. Expiry-wins proof

Two independent proofs.

**Deterministic (§8, expiry first).** The pass is run to completion on a due
order, then the Admin write arrives:

```text
sweep pass    → reservation EXPIRED, order CANCELLED, obligations 0
Admin PUT     → 409 ORDER_SHIPPING_FEE_NOT_SETTABLE
after         → order CANCELLED, reservation EXPIRED, obligations 0
```

The refusal code is the lifecycle one, not the reservation one, and that is the
correction's own signature: under the old stand-in the order was still
`AWAITING_SHIPPING_FEE`, so the write reached `confirmFirstFee` and failed at
`ORDER_RESERVATION_NOT_HELD`. With the real path the order is already
`CANCELLED`, so it is refused a step earlier. Admin revives nothing.

**Concurrent.** Every 409 attempt in §G lands on `CANCELLED + EXPIRED + 0
obligations`. The old suite's `AWAITING_SHIPPING_FEE` branch is not merely
unasserted — the census makes it a failure.

---

## I. Admin-wins proof

Two independent proofs.

**Deterministic**: the stale-candidate case (§F). The Admin write provably
commits first — the pass is still blocked on another candidate's row lock when
the 200 returns — and the settled world is `AWAITING_PAYMENT` + `RESERVED` +
one live `PENDING FULL` with a future `expires_at`.

**Concurrent**: the 200 attempts in §G, asserting the same three facts plus
`live FULL amount == orders.total_amount`.

---

## J. Payment-window expiry regression

Driven through the real Admin write first, so the `FULL` being cancelled is one
`APP12-B03` actually created:

```text
create → PUT fee 30000 → AWAITING_PAYMENT + one PENDING FULL
make reservation due
real sweep pass →
    reservation EXPIRED
    FULL         CANCELLED
    order        CANCELLED
second pass     → expired 0; FULL still CANCELLED; order still CANCELLED
```

All three terminal changes commit in one transaction (§E). The second sweep is
idempotent.

The worker's own suite
(`apps/worker/src/jobs/ready-made-reservation-expiry/tests/reservation-expiry.integration.spec.ts`)
is unchanged and still green at 14/14, including first-window expiry with **no**
obligation at all, the `SATISFIED` `FULL` left untouched, and the four
never-touch cases.

---

## K. CUSTOM / B02 regressions

| Suite | Result |
|---|---|
| `admin-shipping-detail.integration.spec.ts` (APP9 CUSTOM) | pass |
| `customer-shipping-fee-acknowledgement.integration.spec.ts` (APP9 CUSTOM) | pass |
| `ready-made-shipping-fee.integration.spec.ts` (B03 focused) | pass |
| `ready-made-shipping-fee-concurrency.integration.spec.ts` (§33/§34, edited) | pass |
| `ready-made-order-creation.integration.spec.ts` (B02) | pass |
| `ready-made-order-concurrency.integration.spec.ts` (B02) | pass |
| `ready-made-order-authority.integration.spec.ts` (B02) | pass |
| `reservation-expiry.integration.spec.ts` (B02/B03 worker) | pass |
| `release-gate.contract.spec.ts` | pass |

`save-shipping-detail.use-case.ts` and every other CUSTOM file have zero diff in
this correction, as they did in B03.

**One pre-existing failure, not introduced here.**
`admin-order-shipping.contract.spec.ts` › "adds no freeze, dispatch or
carrier-tracking operation" fails at HEAD `d1ef6090` with this correction
**stashed** — verified directly. It is a stale `APP9-B04` assertion that
`APP9-B05`'s dispatch/completion paths invalidated: three paths now match
`/freeze|dispatch|tracking|carrier|complete/i`. It is the class B03 already
routed as `FU-APP12-B02-02` → `APP12-H01`, and it is recorded there rather than
repaired here, which would be out of a narrow correction's scope.

```text
FU-APP12-B03-C1-01  admin-order-shipping.contract.spec.ts asserts an APP9-B04
                    era path census that APP9-B05 invalidated. Pre-existing at
                    d1ef6090; unrelated to the expiry race.
                    → APP12-H01
```

---

## L. Runtime changes, if any

```text
NONE
```

No file under any `src/` tree was edited. Specifically unchanged:

```text
apps/worker/src/jobs/ready-made-reservation-expiry/**        (use case, policy, repository, runtime, module)
packages/persistence/src/inventory/**                        (terminalization, window, reservations)
apps/api/src/modules/order/**                                (router, fee use case, resolver, errors, controller)
```

The invariant `READY_MADE_ACTIVE_ORDER_WITH_EXPIRED_RESERVATION = FORBIDDEN` was
already enforced by the single transaction in §E. C1 makes it **provable**; it
did not make it true.

---

## M. Test-harness changes

| File | Change |
|---|---|
| `apps/worker/test/support/expiry-pass-child.mjs` | **new**, 90 lines. Boots `WorkerModule` over the built worker `dist` in its own process, reports `READY`, then runs one real `ExpireReadyMadeReservationsUseCase.run()` per `GO` line and answers `PASS <json>`. Warm before the first race, so neither actor pays a Nest boot. |
| `apps/api/test/support/worker-expiry-process.ts` | **new**, 173 lines. Spawns that child against the suite's disposable database, guards that the worker is built, exposes `runPass()`/`close()`, and `waitForBlockedSession()` — which reads `pg_stat_activity.wait_event_type = 'Lock'` so the stale-candidate case measures the block instead of sleeping through it. |
| `apps/api/test/integration/ready-made-expiry-race.integration.spec.ts` | **new**, 394 lines, 13 cases. Expiry-first, stale-candidate, the concurrent first-window race, the payment window, and the three-part forbidden-state census. |
| `apps/api/test/integration/ready-made-shipping-fee-concurrency.integration.spec.ts` | §41's block (61 lines) removed and replaced by a comment recording what it asserted, why it was wrong and where the race now lives. §33 and §34 untouched. |
| `docs/implementation/SCOPED_COMMAND_INDEX.md` | `CMD-TEST-APP12-B03-C1-EXPIRY-RACE` added. The worker build is **inside** the command, not a precondition to remember. |

---

## N. Baseline freeze

```text
OpenAPI            121 paths / 134 operations / 265 schemas   (unchanged)
public operations  45                                          (unchanged)
release gate       31 DENY / 14 ALLOW                          (unchanged, 12/12 pass)
generated client   unchanged — zero diff
migrations         38                                          (unchanged, no 0039)
DB schema          unchanged
```

Measured from the committed artifact
(`packages/contracts/openapi/openapi.generated.json`) and from
`packages/database/migrations/*.sql`. `git status` shows no change under
`packages/contracts`, `packages/database` or any `src/` tree.

---

## O. Disposable DB hygiene

```text
commercial_validation      = DISPOSABLE
disposable_db_removed      = true
shared_dev_B03C1_orders    = 0
shared_dev_B03C1_payment_obligations = 0
shared_dev_residue         = 0
G03_data_created           = false
```

Every commercial write in this correction ran on
`embroidery_db7_app12_b03_c1_expiry_<pid>`, created and dropped by the canonical
harness. The child process receives **only** that disposable URL; the persistent
development database is never opened by it.

Shared development database, after the run:

```text
orders                 0
orders (READY_MADE)    0
payment_obligations    0
inventory_reservations 0
```

No `app12_b03_c1` database survives the run. Eleven historical
`embroidery_db7_db10_cp2_source_*` databases remain from earlier phases — that
is `FU-APP12-B02-04`, owned by `APP12-H02`, observed and not acted on here.

---

## P. Files changed

```text
new     apps/worker/test/support/expiry-pass-child.mjs                             90
new     apps/api/test/support/worker-expiry-process.ts                            173
new     apps/api/test/integration/ready-made-expiry-race.integration.spec.ts      394
edit    apps/api/test/integration/ready-made-shipping-fee-concurrency.integration.spec.ts  248 → 200
edit    docs/implementation/SCOPED_COMMAND_INDEX.md                          +1 entry
edit    docs/implementation/reports/APP12-B03-COMPLETION-REPORT.md           correction notice + verdict
new     docs/implementation/reports/APP12-B03-C1-COMPLETION-REPORT.md        this file

production source files changed: 0
```

File-size gate: `node tools/check-file-size.mjs <the four code files>` — 0 files
above the review threshold (largest 394, test cap 600, review threshold 500).

---

## Q. Validation

Selected from `VALIDATION_GOVERNANCE.md` §3 for a test-harness-only change; no
repository-wide aggregate was run.

```text
pnpm --filter @embroidery/worker build                                              pass
pnpm --filter @embroidery/api exec jest --runInBand \
  test/integration/ready-made-expiry-race.integration.spec.ts                       13/13   (×4 runs)
pnpm --filter @embroidery/worker exec jest --runInBand \
  src/jobs/ready-made-reservation-expiry                                            14/14
pnpm --filter @embroidery/api exec jest --runInBand \
  test/integration/ready-made-shipping-fee.integration.spec.ts \
  test/integration/ready-made-shipping-fee-concurrency.integration.spec.ts \
  src/modules/order/tests/integration/admin-shipping-detail.integration.spec.ts \
  src/modules/order/tests/integration/customer-shipping-fee-acknowledgement.integration.spec.ts \
  src/modules/order/presentation/admin-order-shipping.contract.spec.ts              50/51 — the 1
                                                                                    failure is
                                                                                    pre-existing (§K)
pnpm --filter @embroidery/api exec jest --runInBand \
  test/integration/ready-made-order-{creation,concurrency,authority}.integration.spec.ts  56/56
pnpm --filter @embroidery/api exec jest release-gate.contract                       12/12
pnpm --filter @embroidery/api typecheck                                             pass
pnpm --filter @embroidery/worker typecheck                                          pass
pnpm --filter @embroidery/worker lint                                               pass
pnpm --filter @embroidery/api lint                                                  4 pre-existing
                                                                                    errors, none in
                                                                                    a file this
                                                                                    correction touches
pnpm exec prettier --check <the four files>                                         pass
node tools/check-file-size.mjs <the four code files>                                pass
```

The four pre-existing API lint errors are in
`jest.app10-e01.config.mjs` (`no-useless-escape`) and
`approve-design-version.use-case.ts` (three
`no-unnecessary-type-assertion`) — none touched here, all present at
`d1ef6090`.

---

## R. Parent-report correction notice

`docs/implementation/reports/APP12-B03-COMPLETION-REPORT.md` now carries, in §R
immediately above the §41 evidence, a block stating that:

- the recorded "expiry wins" world
  (`409 + EXPIRED + 0 obligations + AWAITING_SHIPPING_FEE`) was **rejected by the
  Product Owner**;
- it was manufactured by the test's `UPDATE` stand-in, not produced by the
  runtime, and §P of that same report describes the real path correctly;
- root cause is `TEST_HARNESS_DEFECT` and **no production runtime changed**;
- §33 and §34 are unaffected and stand as recorded;
- the corrected evidence lives in this report and in
  `ready-made-expiry-race.integration.spec.ts`.

Its §A verdict now reads `COMPLETE_AFTER_C1` with `CORRECTION_USED = 1 / 1`, and
its §AF roadmap reads `APP12-B03 COMPLETE_AFTER_C1`. No historical evidence was
deleted from that report.

---

## S. Roadmap

```text
APP12-B03    = COMPLETE_AFTER_C1
APP12-B03-C1 = COMPLETE
APP12-B04    = NEXT
```

`ROADMAP_STATUS = LOCKED`, `ROADMAP_LOCK = LOCKED`, `CHECKPOINTS = 38`.
Exactly one `NEXT`. `APP12-B04` is not started: no `ORDER_ACCESS`, no customer
`FULL` payment, QR or evidence, no Admin `FULL` verification, no API operation,
no migration 0039, no shared-dev commercial fixture, no `G03` data, no deploy,
no push.

`NO C2.`
