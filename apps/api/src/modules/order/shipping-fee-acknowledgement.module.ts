import { Module } from '@nestjs/common';
import { OrderPersistenceModule } from '@embroidery/persistence';

import { SHIPPING_FEE_ACKNOWLEDGEMENT_PORT } from './domain/repositories/shipping-fee-acknowledgement.port';
import { OrderShippingFeeAcknowledgementAdapter } from './infrastructure/persistence/order-shipping-fee-acknowledgement.adapter';

/**
 * The customer shipping-fee evidence contract, published on its own
 * (`APP9-B04-C1` §3).
 *
 * A module whose entire purpose is to export **one narrow port**, on the
 * precedent `OrderDepositContextModule` set for this context. It exists rather
 * than the customer surface importing `OrderPersistenceModule` directly for that
 * module's stated reason: `ORDER_REPOSITORY` is the AGG-15 **write** contract,
 * and a public route that imported it to append one evidence row would gain
 * `saveShippingDetails()`, `transition()` and `dispatch()` in the same injector.
 *
 * That is not a hypothetical tidiness argument here. `APP9-B04-C1` §3 turns on
 * the claim that the new customer operation is *not* customer shipping mutation
 * and that Admin remains the sole editor before freeze; §23 forbids dispatch and
 * freeze outright. This module is what makes both structural — three methods
 * leave it, two of which read.
 *
 * `OrderPersistenceModule` is imported for the adapter and is **not**
 * re-exported, so importing this module confers the port and nothing else. It
 * declares no controller, so it publishes no route.
 */
@Module({
  imports: [OrderPersistenceModule],
  providers: [
    {
      provide: SHIPPING_FEE_ACKNOWLEDGEMENT_PORT,
      useClass: OrderShippingFeeAcknowledgementAdapter,
    },
  ],
  exports: [SHIPPING_FEE_ACKNOWLEDGEMENT_PORT],
})
export class ShippingFeeAcknowledgementModule {}
