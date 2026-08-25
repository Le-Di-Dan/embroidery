# `APP8-W01` — Completion report

The `payment.verified` → official inventory reservation worker consumer
(`TR-LC17-04`).

## 1. Verdict

```text
APP8-W01 = COMPLETE
NEXT_CHECKPOINT = APP8-B03
NOT_PUSHED = true
```

One new asynchronous responsibility, delivered on the existing runtime: the
consumer `payment.verified` has been waiting for since `APP7-B04` shipped. No new
HTTP operation, no migration, no queue, no broker, no second idempotency
mechanism, no production behaviour.

## 2. Branch, entry HEAD, final commit

```text
BRANCH       = production
ENTRY_HEAD   = 51053cf8ae55a5e9473b76e12cf47c8335fe14c1   (APP8-B02)
FINAL_COMMIT = recorded by the external evidence step; this report is committed
               once, in that same commit, and no second commit is created to
               record its own hash
NOT_PUSHED   = true
```

## 3. The `payment.verified` contract consumed, exactly

The delivered APP7 event, used as delivered. No `payment.deposit.verified.v2`, no
second reservation trigger, no field added to make W01 easier.

Producer: `apps/api/src/modules/payment/application/admin/payment-decision.recorder.ts`,
appended inside the same transaction that satisfies the DEPOSIT obligation.

```text
eventType            payment.verified                 (SE-007)
aggregateKind        PAYMENT_ATTEMPT
aggregateId          the verified attempt id
payloadSchemaVersion 1
payload              { paymentAttemptId, paymentObligationId,
                       obligationKind: 'DEPOSIT', orderId }
```

`apps/worker/src/jobs/inventory-reservation/domain/payment-verified.payload.ts`
reads it as a **lookup key, not authority**: the only question it answers is
*which order*. Every fact about what to reserve is re-read from the frozen rows
that own it, inside the reservation transaction.

`obligationKind` is validated as the literal `'DEPOSIT'` because the producer
writes it as a constant — `verify-payment-attempt.use-case.ts` refuses any
non-deposit obligation (`DEPOSIT_NOT_PAYABLE`) and `TR-LC17-04` is gated on *the
deposit verified event*. It is part of the contract's shape, not one of its
variables. A future remaining-payment verification therefore reaches an operator
through the dead-letter path instead of silently reserving stock a second time;
extending this consumer is APP9's deliberate work.

The exactly-once property of the event itself is unchanged and not re-derived
here: `satisfy()` locks the obligation and refuses a second application, so at
most one transaction per deposit can reach the recorder.

## 4. Handler and registry wiring

```text
handler   InventoryReservationHandler        (inventory-reservation.handler.ts)
eventType payment.verified
jobKind   INVENTORY_RESERVATION
version   1
registry  JobHandlerRegistry.register(...) in InventoryReservationModule.onModuleInit
composed  WorkerModule imports InventoryReservationModule (fifth capability)
retryPlan absent — the global `worker.runtime` schedule applies
```

The **same** runtime as its four predecessors: same registry, same claim through
`WorkerJobQueueRepository`, same lease, same `background_job_attempts` ledger,
same `DISPATCHED`/`DEAD_LETTER` completion, same `JobExecutionService`. The claim
filter grows by exactly one event type. The registry refuses two handlers for one
event type, and the integration suite asserts exactly one is registered for
`payment.verified`.

The handler is thin: linkage check, then one call into the orchestration. No SQL
and no reservation arithmetic in it.

### 4.1 The one job-kind addition

`INVENTORY_RESERVATION` was appended to `BACKGROUND_JOB_KINDS`
(`packages/persistence/src/platform/background-job-attempt-store.ts`) on exactly
the terms `ORDER_CREATION` was added by `APP7-W01`: `job_kind` is `text` with
**no CHECK** (TBL-075), so the list is the G-DB7-51 write-time guard and adding a
value is a source change, not a schema change. The work is committing stock
against an order, not dispatching an outbox row, and filing it under the
transport kind would hide it from an operator's dead-letter query — which is
precisely the alert path `TR-LC17-04` relies on.

## 5. The frozen order-item data source

```text
OrderRepository.findById(orderId)   the order must exist
OrderRepository.loadItems(orderId)  the frozen subjects and quantities
```

Both are **already on the shared `@embroidery/persistence` contract**, and
`OrderItem` already publishes `skuId`, `customerOwnedProductId` and `quantity`.
So no new persistence contract, query, repository or module was added
(`APP8-W01` §14's "add the narrowest read-only contract" clause is deliberately
unused — there was nothing to add).

Nothing live is read to reconstruct a frozen fact: no product defaults, no
Catalog SKU configuration, no quotation lines, no custom-request state, no design
session. `order_items` are immutable snapshots (INV-12, S24 trigger), and
`ck_order_items__exactly_one_subject` makes the Catalog/COP branch a total
function over what the database can store.

`findById` is not redundant. Without it a fabricated order id would resolve to
zero frozen items and be indistinguishable from a legitimate COP-only order — a
no-op reporting success for an order that does not exist. A missing order is
`ORDER_NOT_FOUND`, terminal.

## 6. Aggregation by SKU

`aggregateCatalogRequirements` (`domain/reservation-requirements.ts`), pure:

```text
Catalog item (sku_id set)      -> contributes its frozen quantity to that SKU
COP item (sku_id null)         -> contributes nothing, and appears nowhere
result                         -> one entry per SKU, sorted by SKU id
```

The checkpoint's worked example is asserted verbatim as a unit test:

```text
A: SKU-X 2 ; B: SKU-X 3 ; C: SKU-Y 1 ; D: COP 1
  -> SKU-X 5 , SKU-Y 1 , COP none
```

This is required, not an optimisation. `CST-016` /
`uq_inventory_reservations__order_stock__reserved` allows one active `RESERVED`
row per `(order_id, sku_stock_id)`, so per-item reservations would collide with
that index on the second insert. `APP8-G01` §1.5 settles the audit's per-item
phrasing against the delivered schema, and this function is the implementation of
that ruling.

```text
RESERVATION_IDENTITY = (order_id, sku_stock_id), one active RESERVED row
RESERVATION_QUANTITY = the aggregated frozen Catalog quantity for that SKU
```

## 7. The order-level transaction and atomicity boundary

One `TransactionManager.runInTransaction` in
`ReserveOrderInventoryUseCase.reserve` wraps the whole thing:

```text
begin
  findById            — the event names a real order
  loadItems           — the frozen subjects and quantities
  aggregate + sort    — the requirement set, in lock order
  idempotency.claim   — inventory.reserve on (order)
      replay?      -> return the reservation refs already created, write nothing
      in progress? -> transient, come back
  for each requirement, in order:
      SkuStockRepository.createReservation
        -> GRD-013 deposit gate via DepositEligibilityPort
        -> sku_stocks anchor FOR UPDATE, GRD-014 sufficiency under the lock
        -> inventory_reservations RESERVED + inventory_ledger_entries RESERVED
  idempotency.complete
commit
```

The canonical repository participates through the ambient `transactionContext`
its executor resolves — the same way it participates in an API use case's
transaction. There is no nested commit, no second connection and no `try`/`catch`
inside the boundary that could let a subset survive. A failure anywhere leaves no
reservation, no ledger row and no completed claim for the whole attempt.

**No compensating release logic was written** to imitate atomicity, and **no new
shared orchestration abstraction was added** to `@embroidery/persistence`: the
delivered low-level surface expressed the order-level transaction cleanly, so
§7's escape hatch stayed unused.

## 8. Multi-SKU lock ordering

`createReservation` takes the `sku_stocks` anchor row lock, so a multi-SKU order
takes several anchor locks in one transaction. `DB8_LOCK_ORDER_MATRIX.md` §2
documented no such pair before this checkpoint, so W01 is the first flow to
create it — and the matrix has been updated in this checkpoint rather than left
stale.

```text
ORDERING     ascending skus.id, from aggregateCatalogRequirements
ACQUISITION  sequential (for…of + await), never Promise.all
ISOLATION    READ COMMITTED with explicit row locks (DEC-DB7-006) — unchanged
NOT USED     SERIALIZABLE, advisory locks, distributed locks, NOWAIT
```

Same logical lock set → same acquisition order, on every execution, so the cycle
two concurrent workers would need is unconstructible. The sort key is the SKU id
rather than the `sku_stocks` row id because the anchor id is not knowable until
the anchor has been read, and an ordering that cannot be computed before locking
begins is not an ordering.

`Promise.all` over the requirements would still take every lock, but in whatever
order the connection interleaved them; the sequential `await` **is** the
ordering, and the source says so at the call site.

The delivered cross-context order — `payment_obligations` read → `sku_stocks`
lock (`DB8_LOCK_ORDER_MATRIX.md` §2) — is preserved per requirement, because the
eligibility read is the first thing `createReservation` does.

## 9. `ensureStockRow` is never called

```text
APP8_W01_CALLS_ENSURE_STOCK_ROW = NO
```

Asserted structurally, not merely intended: `canonical-inventory-authority.spec.ts`
scans every production source file in the capability (comments stripped) for
`ensureStockRow` and requires the offender list to be empty. Case 8 proves the
behaviour end-to-end — a paid order referencing a SKU with no `sku_stocks` row
creates **zero** anchors and zero reservations, and fails through the existing
worker semantics.

`APP8-B01` made anchor creation an Admin inventory operation on purpose. A
missing anchor is an operational failure, not a licence for the order path to
invent a zero-stock row.

## 10. Catalog / mixed / COP-only results

| Case | Seed | Reservations | Ledger `RESERVED` | `sku_stocks` created | Outcome |
|---|---|---:|---:|---:|---|
| 1 Catalog, one SKU | qty 4, on-hand 10 | **1**, quantity 4, right anchor, `expires_at` NULL | **1** | 0 | `SUCCEEDED` |
| 2 repeated SKU | 2 + 3 on one SKU | **1**, quantity **5** | **1** | 0 | `SUCCEEDED` |
| 3 mixed | Catalog 2, COP 7, Catalog 1 | **2**, quantities {1, 2}; no row of 7 | **2** | 0 | `SUCCEEDED` |
| 4 COP-only | COP 3 | **0** | **0** | **0** | `SUCCEEDED` |

Case 1 additionally asserts on-hand is **untouched** (10 → 10): reserving commits
availability, and only consumption reduces on-hand. `expires_at` is `NULL`, which
is this table's explicit no-expiry marker (`PO-APP8-002`, ADR-DB1-018 r3) — the
canonical repository writes no expiry and W01 supplies none. The ledger actor is
`SYSTEM` with `system_job_key = inventory.reserve` (`PO-APP8-003`).

Case 4 is a **successful no-op**, not a retry or dead-letter condition:
`PO-APP8-001` Option A makes the absence expected behaviour. No SKU, no
`sku_stocks` row, no reservation and no ledger effect is fabricated for a COP
item — asserted both as a unit property and against the database.

## 11. Duplicate / redelivery idempotency

Two outbox rows for one verification, both claimed and executed through the real
runtime, one attempt at a time. Final database truth:

```text
reservations for the order        2  (one per SKU, quantities 2 and 3)
duplicated quantity              none
RESERVED ledger rows              2  (no duplicate effect)
idempotency_records              1, status COMPLETED, namespace inventory.reserve
both attempts                    SUCCEEDED
```

The mechanism is the **delivered** `idempotency_records` protocol, claimed inside
the reservation's own transaction — no second idempotency table, token, hash
scheme or queue.

```text
namespace   inventory.reserve          (DB3_IDEMPOTENCY_SPECIFICATION.md)
scope       (order)                    — TR-LC17-04's own scope
fingerprint the sorted sku/qty set     — the spec's own fingerprint inputs
replay      the reservation ids created
arbiter     uq_inventory_reservations__order_stock__reserved (CST-016)
effect key  inventory-reservation:v1:<orderId>
```

The fingerprint genuinely carries information here, unlike `order.create`'s: this
operation has inputs beyond its scope — which SKUs and how many. They come from
frozen items, so two executions must agree; a disagreement would mean the frozen
snapshot had moved, and GRD-030 makes that an `IDEMPOTENCY_CONFLICT` rather than
a silent replay of a different quantity.

Uniqueness-violation swallowing is **not** the design (§13's prohibition): the
partial unique index is the physical backstop, and the runtime's execution
idempotency is the primary mechanism. This is proved by negative control — see
§19.1.

## 12. Insufficient stock

```text
attempt 1                     FAILED_RETRYABLE
attempt 2 (the cap)           FAILED_TERMINAL
outbox_events.status          DEAD_LETTER
reservations created          0
RESERVED ledger rows          0
sku_stocks.quantity_on_hand   4 -> 4   (untouched)
idempotency_records           0        (the claim rolled back with the work)
```

No oversubscription, no negative on-hand, no silently reduced quantity, no
automatic backorder, no substituted SKU, no fabricated stock. The bounded retry
and the dead-letter are the **runtime's**, not a loop invented here, and the
dead-letter row is `TR-LC17-04`'s *"admin alerted"*. No customer notification is
sent from W01.

## 13. Multi-SKU rollback

Seeded so the first requirement would succeed and the second is short: SKU `a`
quantity 2 against on-hand 10, SKU `b` quantity 8 against on-hand 3. The fixture
pins the generated SKU ids in sorted order so `a` really is processed first — a
random-UUID fixture would have made this case pass half the time for the wrong
reason.

```text
new reservations for the order        0
new RESERVED ledger rows              0
attempts                              FAILED_RETRYABLE -> FAILED_TERMINAL
```

**Not vacuous.** A separate assertion changes the *only* thing that was wrong —
`b`'s on-hand, raised to 20, which is `TR-LC17-04`'s own stated resolution
("admin restock") — redelivers the identical event, and the same order then
reserves **both** SKUs (quantities 2 and 8, two ledger rows). So the earlier zero
was the rollback of a reservation that had already been created inside the failed
transaction, not a first requirement that was never reachable.

## 14. Missing stock anchor

```text
new sku_stocks rows           0        (no lazy ensureStockRow)
reservations created          0
attempts                      FAILED_RETRYABLE -> FAILED_TERMINAL -> DEAD_LETTER
```

The existing worker failure/retry/dead-letter path, unchanged. No manual-review
subsystem was invented.

## 15. Deposit-not-satisfied guard

Seeded identically to a working case except the DEPOSIT obligation stays
`PENDING` — a stale or fabricated `payment.verified`. The order, the SKU, the
anchor and the stock are all valid.

```text
reservations created   0
RESERVED ledger rows   0
attempts               FAILED_RETRYABLE -> FAILED_TERMINAL
```

The refusal comes from `ReservationEligibilityGuard` inside the canonical
repository — the one implementation of GRD-013, reading
`DepositEligibilityPort.isDepositSatisfied(orderId)` — because the worker holds
**no deposit predicate of its own** to have caught it first. That is asserted
structurally too: the capability's sources may not name `isDepositSatisfied`,
`DEPOSIT_ELIGIBILITY_PORT` or `payment_obligations`.

```text
DEPOSIT_PREDICATE_COUNT = 1
```

## 16. Shared persistence imports and the structural guard

The worker resolves the **same** Nest modules and the **same** Symbols the API
does:

```text
InventoryReservationModule imports
  DatabaseModule, WorkerRuntimeModule, OrderPersistenceModule,
  InventoryPersistenceModule                       — all from @embroidery/persistence
```

`InventoryPersistenceModule` already imports `PaymentPersistenceModule` for
`DEPOSIT_ELIGIBILITY_PORT`, so this module does not: the deposit authority is
reached through the guard *inside* the aggregate, never around it. The capability
declares no repository of its own.

`FU-APP8-B02-03` is closed by
`apps/worker/src/jobs/inventory-reservation/tests/canonical-inventory-authority.spec.ts`,
placed beside the capability it guards, as `canonical-order-authority.spec.ts` is
for the Order aggregate. Eight assertions, all passing:

| Assertion | What it forbids |
|---|---|
| `SKU_STOCK_REPOSITORY` is the API's Symbol | two tokens, two bindings, two implementations |
| `DEPOSIT_ELIGIBILITY_PORT` is the API's Symbol | a second deposit gate |
| `InventoryPersistenceModule` is published | a worker-local composition root |
| no `INSERT`/`UPDATE` into the four inventory tables | direct canonical inventory writes |
| no `drizzle-orm` import, no Drizzle table identifier | worker-local inventory SQL |
| no `isDepositSatisfied` / `DEPOSIT_ELIGIBILITY_PORT` / `payment_obligations` | a worker-side deposit predicate |
| no `ensureStockRow` | lazy anchor creation on the order path (§9) |
| no `production_jobs` / `production_specifications` / `ProductionModule` / `IN_PRODUCTION` | production behaviour leaking into W01 (§16) |
| no `from '…apps/api…'` | an app-to-app import |

Comments are stripped before scanning, for the reason the sibling records: several
files explain the boundary by naming exactly what they do not do, and that prose
must not count as a violation of itself. It is a narrow guard over one
capability, not an architecture linter.

`FU-APP8-B02-02` is honoured: reservation creation goes through
`createReservation`, which locks the `sku_stocks` anchor and asserts sufficiency
under that lock. The unlocked `findReservation` is not used anywhere in W01.

## 17. Schema

```text
MIGRATIONS = 0
```

`packages/database/migrations/` is untouched. No reservation table, worker
reservation table, idempotency table, order-item snapshot table, stock cache,
queue table, retry table or speculative index. `INVENTORY_RESERVATION` is a
TypeScript constant in the G-DB7-51 write-time guard over a `text` column with no
CHECK — the same terms `ORDER_CREATION` and `PRODUCT` were added on.

## 18. OpenAPI / generated client

```text
OPENAPI_BEFORE            = 88 paths / 95 operations / 195 schemas
OPENAPI_AFTER             = 88 paths / 95 operations / 195 schemas  (unchanged)
APP8_W01_HTTP_OPERATIONS  = 0
OPENAPI_REGEN             = NOT_REQUIRED_BY_CHANGE_IMPACT
API_CLIENT_REGEN          = NOT_REQUIRED_BY_CHANGE_IMPACT
```

Verified by change impact rather than by reflex regeneration: the complete
changed-file list (§21) contains no controller, no DTO or request/response
schema, no Swagger decorator, no operation-id source and no module that registers
a controller. Nothing in `apps/worker` can move the API document at all. The
counts above were read from the committed
`packages/contracts/openapi/openapi.generated.json`, which `git status` reports
unmodified.

## 19. Focused test ledger

Every command names the input that justified it. No passing command was repeated
against unchanged input.

| # | Command | Why run | Result |
|---:|---|---|---|
| 1 | `packages/persistence` → `pnpm run build` | `BACKGROUND_JOB_KINDS` gained a value the worker imports | pass |
| 2 | `apps/worker` → `pnpm exec tsc --noEmit` | the new capability and the changed `WorkerModule` | pass |
| 3 | `apps/worker` → `jest src/jobs/inventory-reservation/domain` | the pure aggregation, lock-ordering, payload and fingerprint rules | 19/19 pass |
| 4 | `apps/worker` → `jest …/tests/canonical-inventory-authority.spec.ts` | the new `FU-APP8-B02-03` structural guard | 8/8 pass |
| 5 | `apps/worker` → `jest …/tests/inventory-reservation.integration.spec.ts` | first run of the live-runtime suite, cases 1–9 | 20 pass, **2 fail** — diagnosed §19.2 |
| 6 | same, after the cross-case queue fix | the suite's own input changed | 25/25 pass |
| 7 | negative control: replay branch disabled → `jest -t "case 5"` | prove the redelivery case is not vacuous | **3 failed, as required** (§19.1) |
| 8 | restore → `jest src/jobs/inventory-reservation` | restore the correct input, plus the case-7 non-vacuity proof | 53/53 pass |
| 9 | `apps/worker` → `jest src/bootstrap/worker-persistence.integration.spec.ts` | `worker.module.ts` changed — the smallest existing boot proof | 3/3 pass |
| 10 | `packages/persistence` → `jest src/platform/{order-creation,inventory-reservation,asset-processing}-job-kind.spec.ts` | the APP7 spec asserts the **exhaustive** kind list, which this checkpoint appended to | 14/14 pass |
| 11 | `apps/api` → `pnpm exec tsc --noEmit` | the shared package index changed | pass |
| 12 | `apps/worker` + `packages/persistence` → `pnpm exec eslint` (changed scopes) | new and changed sources | pass, 0 findings |
| 13 | `prettier --write` over the changed governed files | formatting gate on changed files only | 4 reformatted |
| 14 | `apps/worker` → `tsc --noEmit` + `jest src/jobs/inventory-reservation` | rerun justified: prettier reformatted four files after runs 2 and 8 | 53/53 pass |

### 19.1 The tests are not vacuous — two negative controls

**Redelivery (case 5).** The replay branch was disabled (`if (false && …)`) and
case 5 re-run: all three assertions failed. Without the idempotency replay the
second delivery reaches `createReservation` again and
`uq_inventory_reservations__order_stock__reserved` rejects it, so the attempt
fails instead of succeeding. The branch was restored before any reported run.

**Multi-SKU rollback (case 7).** Proved in-suite rather than by mutation, because
a caught error inside an aborted PostgreSQL transaction cannot be swallowed to
build the control: restocking the short SKU and redelivering the identical event
reserves both SKUs, which is what shows the first requirement was reachable and
its effect rolled back. See §13.

### 19.2 The two initial failures, and what they were

Case 8 reported `FAILED_TERMINAL` where `FAILED_RETRYABLE` was expected. The
handler was correct; the **test** was wrong. `runOnce` claims whatever row is due
across the whole queue, and cases 6 and 7 each left a retryable job behind, so
case 8 was claiming its predecessor's second attempt instead of its own.

Fixed by making every failing case drive its own job to the dead-letter inside its
`beforeAll` (`drainToDeadLetter`), which leaves the queue empty before the next
case seeds — and, as a bonus, turns each case into a proof that the bounded retry
terminates rather than loops. Recorded here rather than quietly corrected: the
first run's red is evidence the suite observes the real queue.

### 19.3 Concurrency

```text
NEW_CONCURRENCY_TEST = NONE
```

`APP8-W01` §19.2 permits one only where the multi-SKU orchestration introduces
lock behaviour that existing tests plus code inspection cannot establish. It does
not: the ordering is a **pure function**, asserted directly in
`reservation-requirements.spec.ts` (a set built forwards and backwards yields the
identical sorted order), and the anchor lock itself plus its sufficiency guard are
`APP8-B01`/`B02` proven against unchanged code. The DB8 race suite was not rerun
and `APP8-B02`'s CC-21 cases were not re-proved — neither implementation changed.

## 20. Deliberately not run

| Not run | Why |
|---|---|
| full monorepo Jest, full API / worker / DB suites | no demonstrated impact; the changed closure is one new worker capability, one job-kind constant and the `WorkerModule` import list |
| the other four worker capabilities' suites (`asset-inspection`, `asset-normalization`, `notification-delivery`, `order-conversion`) | no file of theirs changed, and their registrations are independent — the registry refuses collisions and the new suite asserts exactly one handler for `payment.verified`. The `WorkerModule` boot itself is covered by run 9 |
| all DB8 inventory races, `APP8-B02` CC-21 cases | `inventory-reservations.ts` is byte-unchanged (§19.3) |
| `APP8-B01` Admin stock reads, `admin-sku-stock-api.integration.spec.ts` | no API file changed; the API typecheck (run 11) is the change-impact proof |
| other `packages/persistence` suites (`platform/` beyond the job-kind specs, `query/`, `runtime/`, `transaction/`, `order/`, `inventory/`) | the only package change is one appended constant; nothing else's imports or behaviour moved |
| APP7 payment acceptance, production suites, Admin UI, Storefront, Playwright / E2E, Docker full stack | outside the change closure; no UI, no HTTP contract, no runtime topology change |
| DB9 benchmarks | a benchmark measures latency, and no read path changed |
| OpenAPI / client regeneration | §18 — no contract input changed |
| SonarQube | not required by this checkpoint's governance; ESLint and Prettier ran on the changed scopes |

## 21. Changed files

**Added** (10):

```text
apps/worker/src/jobs/inventory-reservation/domain/payment-verified.payload.ts
apps/worker/src/jobs/inventory-reservation/domain/payment-verified.payload.spec.ts
apps/worker/src/jobs/inventory-reservation/domain/reservation-requirements.ts
apps/worker/src/jobs/inventory-reservation/domain/reservation-requirements.spec.ts
apps/worker/src/jobs/inventory-reservation/domain/inventory-reservation.errors.ts
apps/worker/src/jobs/inventory-reservation/domain/order-reserve-idempotency.ts
apps/worker/src/jobs/inventory-reservation/application/reserve-order-inventory.usecase.ts
apps/worker/src/jobs/inventory-reservation/inventory-reservation.handler.ts
apps/worker/src/jobs/inventory-reservation/inventory-reservation.module.ts
packages/persistence/src/platform/inventory-reservation-job-kind.spec.ts
```

**Added — test support** (3):

```text
apps/worker/src/jobs/inventory-reservation/tests/inventory-reservation-context.ts
apps/worker/src/jobs/inventory-reservation/tests/inventory-reservation-fixture.ts
apps/worker/src/jobs/inventory-reservation/tests/inventory-reservation.integration.spec.ts
apps/worker/src/jobs/inventory-reservation/tests/canonical-inventory-authority.spec.ts
```

**Modified** (5):

```text
apps/worker/src/bootstrap/worker.module.ts                          (+1 import, +1 entry)
packages/persistence/src/platform/background-job-attempt-store.ts   (+1 job kind)
packages/persistence/src/platform/order-creation-job-kind.spec.ts   (exhaustive list)
docs/implementation/phases/APP8-INVENTORY-AND-PRODUCTION.md         (status, §12 roadmap)
docs/database/DB8_LOCK_ORDER_MATRIX.md                              (§1, §2 — see §8)
```

**Added — documentation** (1): this report.

## 22. File-size disposition

| File | Lines | Limit | Note |
|---|---:|---:|---|
| `…/tests/inventory-reservation.integration.spec.ts` | 455 | 600 | test; below the 500 review threshold. Nine acceptance cases against one live worker; splitting them would mean booting several disposable databases to assert on one capability |
| `…/tests/inventory-reservation-fixture.ts` | 355 | 600 | test support; the chain an order sits at the end of |
| `…/tests/inventory-reservation-context.ts` | 241 | 600 | test support |
| `…/application/reserve-order-inventory.usecase.ts` | 195 | 400 | source |
| `…/tests/canonical-inventory-authority.spec.ts` | 143 | 600 | test |
| `…/domain/reservation-requirements.spec.ts` | 128 | 600 | test |
| `…/domain/order-reserve-idempotency.ts` | 113 | 400 | source |
| `…/domain/inventory-reservation.errors.ts` | 113 | 400 | source |
| `…/domain/payment-verified.payload.ts` | 109 | 400 | source |
| `…/domain/payment-verified.payload.spec.ts` | 101 | 600 | test |
| `…/inventory-reservation.handler.ts` | 96 | 400 | source |
| `…/domain/reservation-requirements.ts` | 75 | 400 | source |
| `…/inventory-reservation.module.ts` | 65 | 400 | source |
| `apps/worker/src/bootstrap/worker.module.ts` | 66 | 400 | +7 |
| `packages/persistence/…/background-job-attempt-store.ts` | 188 | 400 | +7 |
| `packages/persistence/…/inventory-reservation-job-kind.spec.ts` | 49 | 600 | new |

Nothing exceeds a hard maximum, and no source file exceeds the 300-line review
threshold. Responsibilities are split rather than line ranges: event contract,
aggregation, refusal taxonomy, idempotency identity, orchestration, handler and
composition are each one file.

## 23. Non-blocking findings

| Id | Finding | Owner |
|---|---|---|
| `FU-APP8-W01-01` | **A remaining-payment `payment.verified` would dead-letter.** §3 explains why that is the deliberate reading today — the producer writes `obligationKind` as a literal and `TR-LC17-04` is gated on the deposit event — but when APP9 makes final-payment verification real, this consumer must be extended in the same checkpoint rather than discovering the dead-letter in production. Recorded so the coupling is visible from the APP9 side. | APP9 |
| `FU-APP8-W01-02` | **No sweeper deletes `idempotency_records`, so the swept-claim replay path is untested — and unreachable.** `order.create` guards it with a second read; `inventory.reserve` does not, because there is nothing to guard against yet. If a retention sweep is ever introduced, `inventory.reserve` needs the equivalent of `findByRequest`: a decision-grade, **locked** read of the order's active reservations. `FU-APP8-B02-02` already names the shape it would have to take. | unassigned (retention owner) |
| `FU-APP8-B02-01` | **Pre-existing, unchanged: three ESLint errors** in `approve-design-version.use-case.ts`. Not absorbed; not re-run at this checkpoint (no `apps/api` source changed). Carried forward only so a future `apps/api` lint result is not mistaken for a regression. | unassigned (APP6 owner) |

Carried forward untouched: `FU-APP8-B01-01` (low-stock-threshold authoring),
`FU-APP8-B01-02` (ledger pagination), `FU-APP8-B01-05` (GET stock lock
behaviour), `FU-APP8-B02-02` (decision-grade reservation reads must lock — honoured
here, §16, and still open for `APP8-B04`). `FU-APP8-B02-03` is **closed** by §16.

## 24. Scope exclusions honoured

No production job created, no specification frozen, no order transition, no
reservation consumed or released, no production event emitted, no
`ProductionModule` touched — all asserted structurally (§16). No Admin API, no
manual reservation endpoint, no soft hold, no reservation expiry or sweep, no
low-stock threshold authoring, no ledger pagination, no Admin UI, no Storefront
UI, no Figma, no APP9 work, no artifact generation, no migration, no new broker,
queue or idempotency architecture. Dependency manifests are unchanged.

## 25. Roadmap

```text
R00   COMPLETE
G01   COMPLETE          (corrected by APP8-G01-C1)
B01   COMPLETE
B02   COMPLETE
W01   COMPLETE
B03   INCOMPLETE — Next
B04   INCOMPLETE
D01   INCOMPLETE
A01   INCOMPLETE
A02   INCOMPLETE
A03   INCOMPLETE
E01   INCOMPLETE
X01   INCOMPLETE
```

Exactly one `Next`.
`docs/implementation/phases/APP8-INVENTORY-AND-PRODUCTION.md` §12 carries the
same table.

## 26. Stop

```text
APP8-W01 = COMPLETE
NEXT_CHECKPOINT = APP8-B03
NOT_PUSHED = true
```

`APP8-B03` is not started.
