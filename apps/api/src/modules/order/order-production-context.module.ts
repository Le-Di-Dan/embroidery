import { Module } from '@nestjs/common';
import { DatabaseModule } from '@embroidery/persistence';

import { ORDER_PRODUCTION_CONTEXT_PORT } from './domain/repositories/order-production-context.port';
import { DrizzleOrderProductionContextAdapter } from './infrastructure/persistence/drizzle-order-production-context.adapter';

/**
 * The order behind a production job, published on its own (`APP8-B03` §5.3).
 *
 * A module whose entire purpose is to export **one read-only port**, on the
 * precedent `OrderDepositContextModule`, `CustomRequestQuotationPointerModule`
 * and `CustomRequestStatusModule` set for this context: Ordering publishes
 * narrow contracts, and a consumer imports the one it is allowed to hold rather
 * than the aggregate that contains it.
 *
 * It exists rather than adding the provider to `OrderModule` because that
 * module exports `CUSTOM_REQUEST_REPOSITORY` and `ORDER_REPOSITORY` — the
 * AGG-13 and AGG-15 **write** contracts. An Admin production surface that
 * imported it to read one approval reference would gain `transition()` in the
 * same injector, which is exactly the reach `APP8-B03` §13 forbids: B03 moves
 * no order to `IN_PRODUCTION` and no order at all.
 *
 * It declares no controller, so it publishes no route, and it holds no
 * transaction manager of its own to hand out: `DatabaseModule` is imported for
 * the adapter's executor and is not re-exported, so importing this module
 * confers the port and nothing else.
 */
@Module({
  imports: [DatabaseModule],
  providers: [
    { provide: ORDER_PRODUCTION_CONTEXT_PORT, useClass: DrizzleOrderProductionContextAdapter },
  ],
  exports: [ORDER_PRODUCTION_CONTEXT_PORT],
})
export class OrderProductionContextModule {}
