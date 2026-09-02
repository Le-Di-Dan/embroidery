import { Module } from '@nestjs/common';
import { DatabaseModule } from '@embroidery/persistence';

import { SKU_AVAILABILITY_SNAPSHOT_PORT } from './domain/repositories/sku-availability-snapshot.port';
import { DrizzleSkuAvailabilitySnapshotAdapter } from './infrastructure/persistence/drizzle-sku-availability-snapshot.adapter';

/**
 * The public availability snapshot, published on its own (`APP12-B01`).
 *
 * A module whose entire purpose is to export **one read-only port**, on the
 * precedent `OrderReservationSummaryModule` set. It exists rather than exporting
 * this read from `InventoryModule` because that one re-exports
 * `InventoryPersistenceModule` — `SKU_STOCK_REPOSITORY`, the AGG-07 writer with
 * `createSoftHold`, `createReservation`, `ensureStockRow` and `adjust` on it. An
 * anonymous public catalog read that imported it to show a number would acquire
 * every method `APP12-B01` §9 and §14 forbid it from calling, and the guarantee
 * "this GET writes nothing" would rest on the query's restraint instead of on
 * the graph.
 *
 * It declares no controller, so it publishes no route, and `DatabaseModule` is
 * imported for the adapter's executor and not re-exported: importing this module
 * confers the port and nothing else.
 */
@Module({
  imports: [DatabaseModule],
  providers: [
    { provide: SKU_AVAILABILITY_SNAPSHOT_PORT, useClass: DrizzleSkuAvailabilitySnapshotAdapter },
  ],
  exports: [SKU_AVAILABILITY_SNAPSHOT_PORT],
})
export class SkuAvailabilitySnapshotModule {}
