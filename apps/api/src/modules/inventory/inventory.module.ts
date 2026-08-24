import { Module } from '@nestjs/common';
import { InventoryPersistenceModule } from '@embroidery/persistence';

/**
 * CTX-INV — stock truth: ledger, holds and reservations (DB7-CP4/CP5).
 *
 * The implementation moved to `@embroidery/persistence` in `APP8-B02`:
 * `APP8-W01` creates the official reservation from `apps/worker`, and
 * `PO-APP8-006` settles what that means — the persistence is *promoted*, not
 * copied, because a worker-local inventory adapter would be a second
 * implementation of the availability arithmetic, the anchor lock and the
 * deposit gate, free to disagree with this one (INV-19).
 *
 * This module imports the one implementation and re-exports it, so every API
 * consumer — `AdminSkuStockModule`, the DB7/DB8 inventory suites, the DB9
 * benchmarks — resolves the same `SKU_STOCK_REPOSITORY` Symbol bound to the
 * same class it did before. It declares no provider of its own: a second
 * binding here is exactly the duplication the promotion exists to prevent.
 *
 * `PaymentPersistenceModule` comes with it, so the G-DB7-27 deposit gate still
 * resolves the one `DEPOSIT_ELIGIBILITY_PORT` (`APP8-G01` §7.1).
 *
 * Production persistence stays in `apps/api` — see `InventoryPersistenceModule`
 * and `PRODUCTION_PERSISTENCE_DISPOSITION = REMAINS API-LOCAL`.
 */
@Module({
  // The module, not the token: Nest re-exports what it imports.
  imports: [InventoryPersistenceModule],
  exports: [InventoryPersistenceModule],
})
export class InventoryModule {}
