import { Module } from '@nestjs/common';
import { DatabaseModule } from '@embroidery/persistence';

import { CUSTOM_REQUEST_REPOSITORY } from './domain/repositories/custom-request.repository';
import { ORDER_REPOSITORY } from './domain/repositories/order.repository';
import { DrizzleCustomRequestRepository } from './infrastructure/persistence/drizzle-custom-request.repository';
import { DrizzleOrderRepository } from './infrastructure/persistence/drizzle-order.repository';
import { DrizzleOrderShippingRepository } from './infrastructure/persistence/drizzle-order-shipping.repository';
import { OrderChainGuard } from './infrastructure/persistence/order-chain.guard';

/**
 * CTX-ORD — Ordering (DB7-CP4).
 *
 * Hosts AGG-13 Custom Request and AGG-15 Order: DB2's bounded context map
 * places the request inside Ordering as a separate aggregate, while
 * REPOSITORY_STRUCTURE §7 names the directory `order/` (DEC-DB7-008).
 */
@Module({
  imports: [DatabaseModule],
  providers: [
    OrderChainGuard,
    DrizzleOrderShippingRepository,
    { provide: CUSTOM_REQUEST_REPOSITORY, useClass: DrizzleCustomRequestRepository },
    { provide: ORDER_REPOSITORY, useClass: DrizzleOrderRepository },
  ],
  exports: [CUSTOM_REQUEST_REPOSITORY, ORDER_REPOSITORY],
})
export class OrderModule {}
