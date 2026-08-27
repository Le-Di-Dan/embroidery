import { Module } from '@nestjs/common';
import { DatabaseModule } from '@embroidery/persistence';

import { AuditContextModule } from '../../platform/audit-context/audit-context.module';
import { CustomerModule } from '../customer/customer.module';
import { AcknowledgeShippingFeeUseCase } from './application/customer/acknowledge-shipping-fee.use-case';
import { PublicOrderShippingFeeController } from './presentation/public-order-shipping-fee.controller';
import { ShippingFeeAcknowledgementModule } from './shipping-fee-acknowledgement.module';

/**
 * `APP9-B04-C1` — the customer's one shipping-fee acknowledgement operation.
 *
 * Three dependencies:
 *
 * - `CustomerModule` — `AuthorizeSecureLink` for the public admission,
 *   `ReauthorizeSecureGrant` for the locked re-check inside the transaction, and
 *   `StepUpEvidenceResolver` for GRD-003. The **same** `REQUEST_ACCESS` grant
 *   APP5 created at submission, resolved by the delivered APP4 policy, budget
 *   and digest. No new grant scope, no second secure-access architecture, and
 *   nothing minted here;
 * - `ShippingFeeAcknowledgementModule` — the three-method Ordering port, so this
 *   surface reaches the order behind the grant and appends its evidence without
 *   acquiring the AGG-15 writer;
 * - `DatabaseModule` — the transaction manager. The whole decision commits or
 *   none of it does, and `AuditContextModule` supplies the one clock every
 *   timestamp on this path is read from.
 *
 * ### What is absent, and what each absence prevents
 *
 * No `OrderPersistenceModule` and no `ORDER_REPOSITORY`, so no shipping detail
 * can be created or updated from a customer request, no LC-14 transition is
 * reachable, and `dispatch()` — the freeze boundary `APP9-B05` owns — does not
 * exist in this injector. No `PaymentPersistenceModule`, so no obligation can be
 * superseded, created or satisfied and no payment attempt can be opened: the
 * recalculation stays the Admin transaction's. No `IdentityModule`, so no Admin
 * guard and no operator route can exist here. No outbox store, so recording a
 * decision cannot emit an event. No quotation module, so no balance can be
 * recomputed from a total. No asset or storage module.
 *
 * It exports nothing. There is one entry point and it is the HTTP operation.
 */
@Module({
  imports: [DatabaseModule, AuditContextModule, CustomerModule, ShippingFeeAcknowledgementModule],
  controllers: [PublicOrderShippingFeeController],
  providers: [AcknowledgeShippingFeeUseCase],
})
export class CustomerShippingFeeModule {}
