import { Module } from '@nestjs/common';
import { DatabaseModule } from '@embroidery/persistence';

import { PaymentModule } from '../payment/payment.module';
import { SKU_STOCK_REPOSITORY } from './domain/repositories/sku-stock.repository';
import { DrizzleSkuStockRepository } from './infrastructure/persistence/drizzle-sku-stock.repository';
import { InventoryCommitments } from './infrastructure/persistence/inventory-commitments';
import { InventoryReservations } from './infrastructure/persistence/inventory-reservations';
import { ReservationEligibilityGuard } from './infrastructure/persistence/reservation-eligibility.guard';
import { StockAnchor } from './infrastructure/persistence/stock-anchor';

/**
 * CTX-INV — stock truth: ledger, holds and reservations (DB7-CP4/CP5).
 *
 * Imports `PaymentModule` for `DEPOSIT_ELIGIBILITY_PORT` only: an official
 * reservation is gated on deposit satisfaction (G-DB7-27), a port rather
 * than payment's concrete repository (`BACKEND_CONVENTIONS.md` §10).
 *
 * DB7 implements the lock-anchor access path and proves single-run
 * correctness. Concurrent oversubscription is DB8 CC-20/21/22.
 */
@Module({
  imports: [DatabaseModule, PaymentModule],
  providers: [
    StockAnchor,
    ReservationEligibilityGuard,
    InventoryCommitments,
    InventoryReservations,
    { provide: SKU_STOCK_REPOSITORY, useClass: DrizzleSkuStockRepository },
  ],
  exports: [SKU_STOCK_REPOSITORY],
})
export class InventoryModule {}
