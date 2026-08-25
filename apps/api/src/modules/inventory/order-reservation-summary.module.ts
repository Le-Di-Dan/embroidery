import { Module } from '@nestjs/common';
import { DatabaseModule } from '@embroidery/persistence';

import { ORDER_RESERVATION_SUMMARY_PORT } from './domain/repositories/order-reservation-summary.port';
import { DrizzleOrderReservationSummaryAdapter } from './infrastructure/persistence/drizzle-order-reservation-summary.adapter';

/**
 * The reservations standing against one order, published on its own
 * (`APP8-B03` §8.4).
 *
 * A module whose entire purpose is to export **one read-only port**, on the
 * precedent `OrderDepositContextModule` set. It exists rather than exporting
 * this read from `InventoryModule` because that one re-exports
 * `InventoryPersistenceModule` — `SKU_STOCK_REPOSITORY`, the canonical AGG-07
 * writer with `createReservation`, `release` and `consume` on it. A production
 * detail read that imported it to show reservation backing would gain the three
 * methods `APP8-B03` §13 forbids B03 from calling, and would resolve
 * `PaymentPersistenceModule`'s obligation writer with them.
 *
 * It declares no controller, so it publishes no route, and `DatabaseModule` is
 * imported for the adapter's executor and is not re-exported: importing this
 * module confers the port and nothing else.
 */
@Module({
  imports: [DatabaseModule],
  providers: [
    { provide: ORDER_RESERVATION_SUMMARY_PORT, useClass: DrizzleOrderReservationSummaryAdapter },
  ],
  exports: [ORDER_RESERVATION_SUMMARY_PORT],
})
export class OrderReservationSummaryModule {}
