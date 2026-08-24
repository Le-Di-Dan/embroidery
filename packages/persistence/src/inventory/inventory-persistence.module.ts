/**
 * The one composition root for AGG-07 SKU Stock persistence (`APP8-B02`).
 *
 * Here for the reason `PO-APP8-006` states and no wider one: `APP8-W01` turns
 * `payment.verified` into an official reservation from `apps/worker`, while the
 * Admin stock surface `APP8-B01` delivered writes the same tables from
 * `apps/api`. The worker may not import `apps/api`, and the alternative — a
 * worker-local inventory adapter — is exactly the defect `APP7-W01-C1`
 * corrected one aggregate over: two implementations of the availability
 * arithmetic, of the anchor lock or of the deposit gate are one refactor away
 * from disagreeing, and no constraint in the schema would notice (INV-19).
 *
 * ```text
 * apps/api    InventoryModule  imports InventoryPersistenceModule
 * apps/worker (APP8-W01)       imports InventoryPersistenceModule
 * ```
 *
 * `PaymentPersistenceModule` is imported, not re-declared: `G-DB7-27`'s deposit
 * gate resolves the one `DEPOSIT_ELIGIBILITY_PORT` Symbol bound to
 * `DrizzleDepositEligibilityAdapter`. There is no second port, no second
 * adapter and no copy of the SQL predicate (`APP8-G01` §7.1).
 *
 * Only `SKU_STOCK_REPOSITORY` is exported. `StockAnchor`,
 * `InventoryCommitments`, `InventoryReservations` and
 * `ReservationEligibilityGuard` are the aggregate's internal split by
 * responsibility (DB7 §10.1) and stay private, so no consumer can reach the
 * anchor arithmetic or the eligibility gate around the one contract.
 *
 * The module creates no transaction — every write participates in the caller's,
 * through the ambient `transactionContext` the executor resolves.
 *
 * **Production persistence is not here.** `PO-APP8-006` and `APP8-G01`
 * `PRODUCTION_PERSISTENCE_DISPOSITION = REMAINS API-LOCAL`: job creation is
 * Admin-initiated and synchronous, so no accepted APP8 runtime outside
 * `apps/api` writes it. Moving it would be symmetry, not need.
 */
import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database.module';
import { PaymentPersistenceModule } from '../payment/payment-persistence.module';
import { DrizzleSkuStockRepository } from './drizzle-sku-stock.repository';
import { InventoryCommitments } from './inventory-commitments';
import { InventoryReservations } from './inventory-reservations';
import { ReservationEligibilityGuard } from './reservation-eligibility.guard';
import { SKU_STOCK_REPOSITORY } from './sku-stock.repository';
import { StockAnchor } from './stock-anchor';

@Module({
  imports: [DatabaseModule, PaymentPersistenceModule],
  providers: [
    StockAnchor,
    ReservationEligibilityGuard,
    InventoryCommitments,
    InventoryReservations,
    { provide: SKU_STOCK_REPOSITORY, useClass: DrizzleSkuStockRepository },
  ],
  exports: [SKU_STOCK_REPOSITORY],
})
export class InventoryPersistenceModule {}
