/**
 * The one composition root for AGG-15 Order persistence (`APP7-W01-C1`).
 *
 * `APP7-W01` shipped a second, worker-local SQL implementation of the Order
 * chain guard and the Order/`order.created` writes, because the worker may not
 * import `apps/api`. The app boundary was real; the conclusion was wrong. A
 * runtime boundary is a reason to **share** authority, not to copy it — two
 * implementations of GRD-009 are one refactor away from disagreeing about which
 * customer's approval may be paired with which customer's price, and nothing in
 * the schema would notice (INV-19).
 *
 * So the delivered DB7 implementation moved here unchanged, and both
 * applications now resolve the same classes:
 *
 * ```text
 * apps/api    OrderModule            imports OrderPersistenceModule
 * apps/worker OrderConversionModule  imports OrderPersistenceModule
 * ```
 *
 * `OrderChainGuard` is exported alongside `ORDER_REPOSITORY` because it is the
 * guard's *own* identity that must be single, not merely its result: a consumer
 * handed a pre-validated boolean could not tell a chain that was checked from
 * one that was asserted.
 *
 * The module binds only what AGG-15 owns. It creates no transaction — every
 * write here participates in the caller's, through the ambient
 * `transactionContext` the executor resolves — and it knows nothing about
 * quotations, approvals, Catalog or payments beyond the foreign keys it stores.
 */
import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database.module';
import { DrizzleOrderRepository } from './drizzle-order.repository';
import { DrizzleOrderShippingRepository } from './drizzle-order-shipping.repository';
import { OrderChainGuard } from './order-chain.guard';
import { ORDER_REPOSITORY } from './order.repository';

@Module({
  imports: [DatabaseModule],
  providers: [
    OrderChainGuard,
    DrizzleOrderShippingRepository,
    { provide: ORDER_REPOSITORY, useClass: DrizzleOrderRepository },
  ],
  exports: [ORDER_REPOSITORY, OrderChainGuard],
})
export class OrderPersistenceModule {}
