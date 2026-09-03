import { Module } from '@nestjs/common';
import { DatabaseModule } from '@embroidery/persistence';

import { IdentityModule } from '../identity/identity.module';
import { InventoryModule } from '../inventory/inventory.module';
import { ADMIN_ORDER_READ_REPOSITORY } from './domain/repositories/admin-order-read.repository';
import { DrizzleAdminOrderReadRepository } from './infrastructure/persistence/drizzle-admin-order-read.repository';
import { ReadAdminOrderDetail } from './application/admin/read-admin-order-detail.query';
import { ReadAdminOrderQueue } from './application/admin/read-admin-order-queue.query';
import { AdminOrderController } from './presentation/admin-order.controller';

/**
 * `APP7-B02` — the Admin order queue and detail.
 *
 * A read module, on the pattern `CustomRequestAdminModule` set: it deliberately
 * does **not** import `OrderModule`. That one re-exports
 * `OrderPersistenceModule`, and importing it would make `ORDER_REPOSITORY`
 * resolvable from a controller whose only job is to read — handing two GET
 * routes a `createFromAcceptedQuotation()` and a `transition()` they must never
 * call. The boundary is what lets this module's suite state, structurally, that
 * B02 cannot write.
 *
 * That is also why `APP7-W01-C1` stays intact. Canonical Order persistence and
 * the one `OrderChainGuard` remain in `@embroidery/persistence`, resolved by the
 * API's `OrderModule` and the worker's conversion job. B02 adds a **read seam**
 * beside them — `AdminOrderReadRepository`, three query methods, no transaction
 * — not a second Order authority.
 *
 * Two imports and no more:
 *
 * - `IdentityModule` — the APP1 guard, and nothing else. No session is read
 *   here, no cookie parsed, no admin account queried;
 * - `DatabaseModule` — the executor the read adapter is built on.
 *
 * There is no `CatalogModule` and no `CustomerModule`, and their absence is the
 * point: `APP7-B02` §3 forbids reconstructing a frozen order fact from live
 * Catalog state, and a module that cannot resolve a catalog or customer port
 * cannot do it by accident. There is no `PaymentModule` either — `APP7-B04`
 * owns Admin payment operations.
 *
 * It exports nothing. There are two entry points and both are HTTP operations.
 */
/*
 * `APP12-A02-C1` adds one import, `InventoryModule`, for the Ready-Made
 * payment deadline. The detail read publishes the reservation's own committed
 * `expires_at` and must take it from the canonical
 * `SkuStockRepository.findActiveOrderReservation` — the same lock-free selector
 * `APP12-B04` gives the customer — rather than recomputing a window or picking
 * the newest reservation row. That is the precedent `ReadyMadeOrderAccessModule`
 * already set for a public surface, so this follows it rather than inventing a
 * second reservation-reading port with the same statement inside.
 */
@Module({
  imports: [DatabaseModule, IdentityModule, InventoryModule],
  controllers: [AdminOrderController],
  providers: [
    { provide: ADMIN_ORDER_READ_REPOSITORY, useClass: DrizzleAdminOrderReadRepository },
    ReadAdminOrderQueue,
    ReadAdminOrderDetail,
  ],
})
export class AdminOrderModule {}
