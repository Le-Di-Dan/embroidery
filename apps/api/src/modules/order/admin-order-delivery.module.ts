import { Module } from '@nestjs/common';
import {
  DatabaseModule,
  OrderPersistenceModule,
  PaymentPersistenceModule,
} from '@embroidery/persistence';

import { IdentityModule } from '../identity/identity.module';
import { CompleteOrderUseCase } from './application/admin/complete-order.use-case';
import { DispatchOrderUseCase } from './application/admin/dispatch-order.use-case';
import { AdminOrderDeliveryController } from './presentation/admin-order-delivery.controller';
import { OrderFulfilmentMetrics } from './application/admin/order-fulfilment.metrics';
import { MetricsModule } from '../../platform/metrics/metrics.module';

/**
 * `APP9-B05` — the two guarded Admin delivery commands (`TR-LC14-07`,
 * `TR-LC14-08`), and the authority they genuinely need.
 *
 * ### Why a third Admin order module
 *
 * `APP7-B02`'s `AdminOrderModule` is composed so its two routes **cannot** move
 * an order — it imports no order writer at all, and its report states that
 * absence as the structural reason a read cannot write. `APP9-B01`'s
 * `AdminOrderLifecycleModule` holds the order writer but no shipping authority,
 * and its accepted suite says so. B05's dispatch must freeze shipping and
 * snapshot it. Adding that to either module would put the freeze writer into the
 * injector of routes that must never reach it and would quietly retire a
 * boundary an accepted checkpoint was reviewed on.
 *
 * So the delivery commands arrive in their own module, and both earlier modules
 * stay exactly as delivered. All three controllers publish into the one
 * `adminOrder` domain through `CONTROLLER_DOMAIN_KEYS`, so a composition
 * decision does not name a public identifier.
 *
 * ### What it may inject, which is what its two routes may do
 *
 * | Imported | For |
 * |---|---|
 * | `OrderPersistenceModule` | the canonical `ORDER_REPOSITORY` — `loadForUpdate`, `lockShippingFeeBaseline`, `dispatch` and the LC-14 `transition` |
 * | `PaymentPersistenceModule` | the canonical `PAYMENT_OBLIGATION_REPOSITORY` — `findLiveForOrder`, GRD-016's kind-aware read |
 * | `IdentityModule` | the APP1 guards, and nothing else |
 * | `DatabaseModule` | `TransactionManager` |
 *
 * Both repositories are canonical implementations reached through their tokens.
 * **No persistence is promoted, none is duplicated and no migration is added**:
 * AGG-15 and AGG-16 both already live in `@embroidery/persistence`, the freeze
 * and the snapshot are the delivered `dispatch(...)` transaction, and no SQL for
 * orders, shipping or obligations is written anywhere in this module.
 *
 * ### What is absent, and why each absence matters
 *
 * `PaymentPersistenceModule` brings a *writer* — it is one module — but the two
 * use cases here call exactly one obligation method, `findLiveForOrder`, a read.
 * Nothing opens an attempt, satisfies an obligation, recalculates a fee, appends
 * a reconciliation or records a provider event.
 *
 * There is no HTTP client, no carrier configuration, no scheduler and no worker:
 * `LIVE_CARRIER_TRACKING` is out of scope, so there is nothing here that could
 * contact a courier even by accident. There is no `NotificationModule` and no
 * outbox consumer — the canonical `order_transitions` rows the repositories
 * already append are LC-14's actor and correlation evidence, and B05 mints no
 * event of its own (`APP9-G01` §8; APP10 owns customer communication). There is
 * no inventory, production, refund or cancellation authority.
 *
 * It exports nothing, and has two entry points.
 */
@Module({
  imports: [
    DatabaseModule,
    IdentityModule,
    // `APP12-H03` — `OrderFulfilmentMetrics` injects `ApiCommerceMetrics`.
    // `MetricsModule` is `@Global()`, so the running application would resolve it
    // from the root module — but a Testing module that imports only this module
    // has no root, and would fail to compose. Imported explicitly so this
    // module's dependency graph is complete on its own.
    MetricsModule,
    OrderPersistenceModule,
    PaymentPersistenceModule,
  ],
  controllers: [AdminOrderDeliveryController],
  providers: [DispatchOrderUseCase, CompleteOrderUseCase, OrderFulfilmentMetrics],
})
export class AdminOrderDeliveryModule {}
