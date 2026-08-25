# DB8 — Lock Order Matrix

**Compiled:** DB8-CP0, from the "Lock / read" and "Tx boundary" columns of
`DB7_TX_APP_GUARD_MATRIX.md` and the actual `FOR UPDATE` call sites in the
repository implementations. This is the reference DB8-CP6's deadlock fixture
and every P0/P1 concurrency test is checked against — a test that locks rows
in an order not listed here is testing a scenario that cannot happen in
production code, not a real race.

## 1. Row locks taken by each flow (in the order the transaction takes them)

| Flow | Repository method | Lock 1 | Lock 2 | Lock 3 |
|---|---|---|---|
| Order creation | `OrderRepository.createFromAcceptedQuotation` | `quotations` (read `current_version_id`, no explicit lock — arbiter is `uq_orders__request` on insert) | — | — |
| Order dispatch | `OrderRepository.dispatch` | `orders` FOR UPDATE | `shipping_details` FOR UPDATE | `payment_obligations` (read, no lock — SATISFIED is immutable once set) |
| Stock hold/reserve | `SkuStockRepository.loadForUpdate` → `hold`/`reserve` | `sku_stocks` FOR UPDATE | — | — |
| Hold → reservation conversion | `SkuStockRepository.convertHold` | `sku_stocks` FOR UPDATE | `inventory_soft_holds` (state check, same tx) | — |
| Stock adjustment | `SkuStockRepository.adjust` | `sku_stocks` FOR UPDATE | — | — |
| Reservation release / consume (`APP8-B02`) | `SkuStockRepository.releaseReservation` / `consumeReservation` | `inventory_reservations` FOR UPDATE (CC-21 arbiter) | `sku_stocks` FOR UPDATE (consume only) | — |
| Order official reservation (`APP8-W01`) | `ReserveOrderInventoryUseCase.reserve` → `SkuStockRepository.createReservation` × N | `payment_obligations` (read, no lock — GRD-013 via `DepositEligibilityPort`) | `sku_stocks` FOR UPDATE, **once per required SKU, in ascending `skus.id`** | — |
| Guarded production transition (`APP8-B04`) | `TransitionProductionJobUseCase.transition` → `OrderRepository.loadForUpdate` → `ProductionJobRepository.loadForUpdate`/`transition` → `SkuStockRepository.consumeOrderReservation` / `releaseOrderReservationIfActive` × N → `OrderRepository.transition` | `orders` FOR UPDATE | `production_jobs` FOR UPDATE | `inventory_reservations` FOR UPDATE then `sku_stocks` FOR UPDATE, **once per required SKU, in ascending `skus.id`** |
| Payment obligation satisfaction | `PaymentObligationRepository.satisfy` | `payment_obligations` FOR UPDATE | — | — |
| Design case version pointer | `DesignCaseRepository.setCurrentVersion` | `design_cases` FOR UPDATE | — | — |
| Quotation acceptance | `QuotationRepository.accept` | `quotations` FOR UPDATE | — | — |
| Agreement publish | `AgreementRepository.setCurrentVersion` | `agreements` FOR UPDATE | — | — |
| Policy config publish | `PolicyConfigurationRepository.publishVersion` | `policy_configurations` FOR UPDATE | — | — |
| Outbox claim | `OutboxEventStore.claimBatch` | `outbox_events` FOR UPDATE SKIP LOCKED (batch) | — | — |
| Notification claim | `NotificationIntentRepository.claimBatch` | `notification_intents` (claimable partial index; no `FOR UPDATE`/`SKIP LOCKED` documented in DB7 — G-DB7-58 says "no exactly-once claim is made") | — | — |
| Idempotency claim | `IdempotencyStore.claim` | `idempotency_records` (arbiter is the unique index on insert, not a row lock) | — | — |

## 2. Cross-flow lock order

No two flows in the table above ever take locks on **more than one** of the
same tables in a documented order except:

- **`orders` → `production_jobs` → `inventory_reservations` → `sku_stocks`** —
  added by `APP8-B04`, which is the first flow to take all four. It supersedes
  this file's earlier statement that `orders` then `sku_stocks` "never happens
  directly": it now does, in exactly one direction, and the direction is fixed
  by what each row arbitrates.

  - The **order** row is first because it is the arbiter between production
    start and an order hold or cancellation (`GRD-022`). Both commands must
    serialise on it, and a start that read the order's status without holding it
    could consume inventory for an order a hold had just claimed.
  - The **job** row is second because it arbitrates LC-18 (`G-DB7-25`), and no
    other flow locks a job.
  - The **reservation** rows are third, keeping `APP8-B02`'s CC-21 direction
    exactly (reservation row before the anchor), one per required SKU in the
    ascending `skus.id` order `aggregateCatalogRequirements` returns, taken
    sequentially and never concurrently.
  - The **`sku_stocks`** anchor stays last, reached from inside the consume, in
    the same per-SKU order.

  There is no reverse path: no delivered flow locks `sku_stocks`, a reservation
  or a production job and then reaches for `orders`. Dispatch takes `orders` and
  never touches inventory, and `APP8-W01` takes no `orders` lock at all — it
  reads the order and then locks anchors — so its `sku_stocks` locks cannot be
  held while an `orders` lock is wanted. Isolation stays `READ COMMITTED` with
  explicit row locks; no `SERIALIZABLE`, advisory lock, distributed lock or
  `NOWAIT` was introduced (`APP8-B04` §8).
- **`sku_stocks` then `payment_obligations`**: `ReservationEligibilityGuard`
  (G-DB7-27) reads `payment_obligations` (no lock, SATISFIED state read
  in-tx) *before* `SkuStockRepository` takes the `sku_stocks` row lock in
  `createReservation`/`convertHold`. This is the one documented
  cross-context order: **obligation read → stock lock**, never the reverse.

- **`sku_stocks` then `sku_stocks`** — `APP8-W01` is the first flow to take
  **several** anchor locks in one transaction: a multi-SKU order reserves each
  required SKU inside one transaction, so a second worker reserving an
  overlapping SKU set for a different order could deadlock if the two chose
  different directions. It is arbitrated by a **deterministic total order, not a
  new lock anchor**: `aggregateCatalogRequirements` sorts the requirements by
  `skus.id` ascending and the use case awaits them sequentially, so the same
  logical lock set is always acquired in the same order and the cycle is
  unconstructible. The sort key is the SKU id rather than the `sku_stocks` row
  id because the anchor id is not knowable until the anchor has been read, and an
  ordering that cannot be computed before locking begins is not an ordering. No
  `SERIALIZABLE`, no advisory lock, no distributed lock (`APP8-W01` §8).
- **`inventory_reservations` then `sku_stocks`** — added by `APP8-B02`'s CC-21
  repair, in that direction only. No delivered path locks the anchor and then an
  *existing* reservation row: `createReservation` and `convertHold` lock the
  anchor and then **insert**, and a row nobody can name yet cannot be waited on.

Because no code path takes the same two locks in opposite orders, DB8-CP6's
deadlock fixture (§ below) constructs a **synthetic** opposite-order
interleaving to prove the mapper/retry policy works, rather than reproducing
a deadlock that exists in shipped code — recorded explicitly so it is not
mistaken for a found defect.

## 3. Isolation level

`TransactionManager.runInTransaction` supports an `isolationLevel` option
(`packages/persistence/src/transaction/transaction-manager.ts`), so
`SERIALIZABLE` is mechanically available — but every repository call site in
`apps/api` and `apps/worker` calls `runInTransaction` with no options,
running at PostgreSQL's default `READ COMMITTED`. Confirmed by:

```
grep -rn "isolationLevel" apps/api/src apps/worker/src
```

which returns zero matches — the option is exercised only by
`transaction-manager.integration.spec.ts` (the primitive's own test), never
by a business flow. This is why every P0/P1 race in
`DB8_RACE_COVERAGE_MATRIX.md` is arbitrated by an explicit `FOR UPDATE` row
lock or a unique index, never by `SERIALIZABLE`'s predicate locking —
consistent with CC-23's `N/A` verdict.

## 4. NOWAIT

No call site uses `NOWAIT` (confirmed by the same grep sweep, `DB8_RACE_COVERAGE_MATRIX.md`
CC-24). Every lock acquisition blocks until available or the statement
timeout fires (`57014`), by design — consistent with `DB7_ERROR_MAPPING_CATALOG.md`'s
note that `55P03` has no live producer today.

## 5. Deadlock fixture design (DB8-CP6)

Since §2 found no naturally opposite-ordered production lock pair, the
fixture is built directly against the harness (not through repository
methods) using two of the documented lock anchors (`sku_stocks`,
`payment_obligations` rows seeded by the shared fixture) taken in opposite
order by two concurrent transactions, proving:

1. PostgreSQL raises `40P01` on one of the two transactions.
2. `mapDatabaseError` classifies it `RETRYABLE_TRANSACTION_FAILURE`.
3. The bounded retry policy (`DB8Harness.withRetry`, DB8-CP1) re-runs the
   whole losing transaction, which then commits cleanly against the
   post-commit state.
4. No duplicate row results from the retry.

This is a harness-level proof of the retry/mapping pipeline, not a
regression test for a bug in application lock ordering — recorded here so a
future reader does not mistake it for "DB7 shipped code that deadlocks in
production."
