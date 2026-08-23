import { Module } from '@nestjs/common';
import { DatabaseModule } from '@embroidery/persistence';

import { ORDER_DEPOSIT_CONTEXT_PORT } from './domain/repositories/order-deposit-context.port';
import { DrizzleOrderDepositContextAdapter } from './infrastructure/persistence/drizzle-order-deposit-context.adapter';

/**
 * The order behind a customer's request, published on its own (`APP7-B03` §8).
 *
 * A module whose entire purpose is to export **one read-only port**, on the
 * precedent `CustomRequestQuotationPointerModule` and `CustomRequestStatusModule`
 * set for this context: Ordering publishes narrow contracts, and a consumer
 * imports the one it is allowed to hold rather than the aggregate that contains
 * it.
 *
 * It exists rather than adding the provider to `OrderModule` because that module
 * exports `CUSTOM_REQUEST_REPOSITORY` and `ORDER_REPOSITORY` — the AGG-13 and
 * AGG-15 **write** contracts. A public customer deposit surface that imported it
 * to read one order would gain `transition()` and `createFromAcceptedQuotation()`
 * in the same injector, which is exactly the reach `APP7-B03` §4 forbids: no
 * customer action may move an order to `DEPOSIT_PAID`.
 *
 * It declares no controller, so it publishes no route, and it holds no
 * transaction manager of its own to hand out: `DatabaseModule` is imported for
 * the adapter's executor and is not re-exported, so importing this module
 * confers the port and nothing else.
 */
@Module({
  imports: [DatabaseModule],
  providers: [{ provide: ORDER_DEPOSIT_CONTEXT_PORT, useClass: DrizzleOrderDepositContextAdapter }],
  exports: [ORDER_DEPOSIT_CONTEXT_PORT],
})
export class OrderDepositContextModule {}
