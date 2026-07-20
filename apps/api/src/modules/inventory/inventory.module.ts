import { Module } from '@nestjs/common';
import { DatabaseModule } from '@embroidery/persistence';

import { SKU_STOCK_REPOSITORY } from './domain/repositories/sku-stock.repository';
import { DrizzleSkuStockRepository } from './infrastructure/persistence/drizzle-sku-stock.repository';
import { InventoryCommitments } from './infrastructure/persistence/inventory-commitments';
import { StockAnchor } from './infrastructure/persistence/stock-anchor';

/**
 * CTX-INV — stock truth: ledger, holds and reservations (DB7-CP4).
 *
 * DB7 implements the lock-anchor access path and proves single-run
 * correctness. Concurrent oversubscription is DB8 CC-20/21/22.
 */
@Module({
  imports: [DatabaseModule],
  providers: [
    StockAnchor,
    InventoryCommitments,
    { provide: SKU_STOCK_REPOSITORY, useClass: DrizzleSkuStockRepository },
  ],
  exports: [SKU_STOCK_REPOSITORY],
})
export class InventoryModule {}
