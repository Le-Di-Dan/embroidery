import { Module } from '@nestjs/common';
import {
  DatabaseModule,
  InventoryPersistenceModule,
  OrderPersistenceModule,
  PaymentPersistenceModule,
} from '@embroidery/persistence';

import { IdentityModule } from '../identity/identity.module';
import { AdminShippingFeeRouter } from './application/admin/admin-shipping-fee.router';
import { ReadShippingDetailQuery } from './application/admin/read-shipping-detail.query';
import { SaveShippingDetailUseCase } from './application/admin/save-shipping-detail.use-case';
import { ReadyMadePayableTotalResolver } from './application/ready-made/payable-total.resolver';
import { SetReadyMadeShippingFeeUseCase } from './application/ready-made/set-ready-made-shipping-fee.use-case';
import { AdminOrderShippingController } from './presentation/admin-order-shipping.controller';
import { OrderFulfilmentMetrics } from './application/admin/order-fulfilment.metrics';
import { MetricsModule } from '../../platform/metrics/metrics.module';

/**
 * `APP9-B04` — the two guarded Admin shipping-detail operations, and the write
 * authority they genuinely need.
 *
 * ### Why a third Admin order module
 *
 * `APP7-B02`'s `AdminOrderModule` is composed so its two reads **cannot** move
 * an order: it holds no `ORDER_REPOSITORY`. `APP9-B01`'s
 * `AdminOrderLifecycleModule` holds one, but its only obligation call is
 * `findLiveForOrder`, a read — its report states that absence as the reason a
 * lifecycle entry cannot touch money. B04 must do both: write the shipping
 * record *and* recalculate an obligation. Folding that into either delivered
 * module would quietly retire a boundary a previous checkpoint was accepted on.
 *
 * ### What it may inject, which is what its two routes may do
 *
 * | Imported | For |
 * |---|---|
 * | `OrderPersistenceModule` | the canonical `ORDER_REPOSITORY` — `findById`, `lockShippingFeeBaseline`, `loadShippingDetail`, `saveShippingDetails`, `findShippingFeeAcknowledgement` |
 * | `PaymentPersistenceModule` | the canonical `PAYMENT_OBLIGATION_REPOSITORY` — `findLiveForOrder`, `recalculate`, `appendReconciliation` |
 * | `IdentityModule` | the APP1 guards, and nothing else |
 * | `DatabaseModule` | `TransactionManager` |
 *
 * All three repositories are canonical implementations reached through their
 * tokens. **No persistence is promoted, none is duplicated and no migration is
 * added**: AGG-15 and AGG-16 both already live in `@embroidery/persistence`, the
 * fulfillment tables shipped in migration `0023` with their freeze triggers in
 * `0030`, and no SQL for orders, shipping or obligations is written anywhere in
 * this module.
 *
 * ### What is absent, and why each absence matters
 *
 * `ORDER_REPOSITORY` does bring `dispatch()` — that is unavoidable, it is one
 * contract — but nothing in this module calls it, creates a `shipping_snapshots`
 * row, sets `frozen_at` or appends an `order_transitions` row. `APP9-B05` owns
 * `TR-LC14-07` and `TR-LC14-08`, and the freeze is trigger-enforced underneath
 * (GRD-024) whatever this module intends.
 *
 * `CustomerModule` is **gone**, and its absence is the point of `APP9-B04-C1`.
 * The first attempt imported it so the Admin write could find a grant and a
 * step-up challenge and append the customer's acknowledgement itself — evidence
 * of a decision nobody made. The acknowledgement is now written only by the
 * customer's own command (`CustomerShippingFeeModule`), and this module has no
 * grant repository, no step-up resolver and no way to reach either. What it does
 * instead is `findShippingFeeAcknowledgement`: a read of a decision that must
 * already exist and must match this exact fee movement.
 *
 * `acknowledgeShippingFee` remains on the AGG-15 contract — it is one contract
 * — but nothing in this module calls it, and the integration suite asserts that
 * a refused increase and an applied one both leave the acknowledgement count
 * exactly as the customer left it.
 *
 * There is no `AuditModule` and no `OutboxEventStore` consumer: B04 mints no
 * event (`APP9-G01` §8 — notification intents are APP10's), and the money record
 * it does write is the canonical `payment_reconciliations` row `TR-LC15-04`
 * already calls for. There is no object storage, no QR encoder, no merchant bank
 * configuration, no carrier client, no refund and no production authority.
 *
 * It exports nothing, and has one entry point.
 */
@Module({
  imports: [
    DatabaseModule,
    IdentityModule,
    // `APP12-H03` — the fee router records through `OrderFulfilmentMetrics`.
    // Explicit, so a Testing module that imports only this module composes.
    MetricsModule,
    InventoryPersistenceModule,
    OrderPersistenceModule,
    PaymentPersistenceModule,
  ],
  controllers: [AdminOrderShippingController],
  providers: [
    ReadShippingDetailQuery,
    SaveShippingDetailUseCase,
    ReadyMadePayableTotalResolver,
    SetReadyMadeShippingFeeUseCase,
    AdminShippingFeeRouter,
    OrderFulfilmentMetrics,
  ],
})
export class AdminOrderShippingModule {}
