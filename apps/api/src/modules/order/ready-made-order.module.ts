import { Module } from '@nestjs/common';
import { DatabaseModule } from '@embroidery/persistence';

import { AuditContextModule } from '../../platform/audit-context/audit-context.module';
import { CatalogPurchasableSkuModule } from '../catalog/catalog-purchasable-sku.module';
import { CustomerModule } from '../customer/customer.module';
import { InventoryModule } from '../inventory/inventory.module';
import { OrderModule } from './order.module';
import { CreateReadyMadeOrderUseCase } from './application/ready-made/create-ready-made-order.use-case';
import { PublicReadyMadeOrderController } from './presentation/public-ready-made-order.controller';
import { ReadyMadeOrderMetrics } from './application/ready-made/ready-made-order.metrics';
import { MetricsModule } from '../../platform/metrics/metrics.module';

/**
 * `APP12-B02` — the Ready-Made order-creation surface.
 *
 * A separate module from `OrderModule` on the `CustomRequestSubmissionModule`
 * pattern, and for the same reason. `OrderModule` is the CTX-ORD **persistence**
 * module: it holds the AGG-13 and AGG-15 repositories, imports nothing but
 * `DatabaseModule` and `OrderPersistenceModule`, and is composed by suites that
 * want those repositories and nothing else. Teaching it about Customer, Catalog
 * and Inventory would make every one of those consumers boot three more
 * contexts to read an order row.
 *
 * The cross-context imports are narrow and each one is a **port or an exported
 * application capability**, never another context's tables:
 *
 * - `CustomerModule` — `VerifiedChallengeIdentityResolver`, the one APP4 path
 *   from a verified challenge to a `customers` row. Ordering never resolves an
 *   identity itself and never accepts a client-supplied customer id;
 * - `CatalogPurchasableSkuModule` — `PURCHASABLE_SKU_PORT` only, one method,
 *   one SKU. Not `CatalogPublicModule`: this module has no business holding a
 *   public product query;
 * - `InventoryModule` — `SKU_STOCK_REPOSITORY`, the single delivered writer
 *   that takes the `sku_stocks` anchor lock (GRD-014). There is no second
 *   reservation path and this module does not compose one;
 * - `OrderModule` — `READY_MADE_ORDER_REPOSITORY` for the order and its frozen
 *   line, and `ORDER_REPOSITORY` for `saveShippingDetails`, which is already
 *   the one writer of `shipping_details`;
 * - `AuditContextModule` — `AuditClock`, so the transaction reads one time
 *   source rather than calling `Date.now()` in three places;
 * - `DatabaseModule` — `TransactionManager` and `IdempotencyStore`, the two
 *   platform primitives the whole command is built on.
 *
 * It exports nothing. There is one entry point and it is the HTTP operation.
 */
@Module({
  imports: [
    DatabaseModule,
    AuditContextModule,
    // `APP12-H03` — `ReadyMadeOrderMetrics` injects `ApiCommerceMetrics`.
    // Explicit, so a Testing module that imports only this module composes.
    MetricsModule,
    OrderModule,
    CustomerModule,
    CatalogPurchasableSkuModule,
    InventoryModule,
  ],
  controllers: [PublicReadyMadeOrderController],
  providers: [CreateReadyMadeOrderUseCase, ReadyMadeOrderMetrics],
})
export class ReadyMadeOrderModule {}
