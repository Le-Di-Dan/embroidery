import { Module } from '@nestjs/common';
import { DatabaseModule, PaymentPersistenceModule } from '@embroidery/persistence';

import { AuditContextModule } from '../../platform/audit-context/audit-context.module';
import { CustomerModule } from '../customer/customer.module';
import { OrderDepositContextModule } from '../order/order-deposit-context.module';
import { PaymentTargetResolver } from './application/customer/payment-target.resolver';
import { InitiateFinalPaymentAttemptUseCase } from './application/customer/initiate-final-payment-attempt.use-case';
import { PublicOrderFinalPaymentAttemptController } from './presentation/public-order-final-payment-attempt.controller';

/**
 * `APP9-B02` — the customer's one final-payment write.
 *
 * A second final-payment surface module beside `CustomerFinalPaymentModule`, on
 * the `APP7-B03` arrangement and for its reason: that module's documented
 * security property is an **absence** — it imports no `DatabaseModule`, so
 * nothing composed there can open a transaction or claim an idempotency scope.
 * This route needs both. Merging them would delete the read module's property to
 * gain nothing, since the reads and the write share only the target resolver.
 *
 * ### What this module may inject, which is what its route may eventually do
 *
 * - `CustomerModule` — three capabilities and no machinery.
 *   `AuthorizeSecureLink` for the pre-transaction admission (identical policy,
 *   budget and digest to the reads); `ReauthorizeSecureGrant` for the
 *   in-transaction, row-locked re-check `ADR-DB3-004` r9 requires; and
 *   `StepUpEvidenceResolver` for GRD-003, whose sensitive set names "pay"
 *   explicitly. It issues nothing: no grant, no token, no challenge and no
 *   payment session;
 * - `OrderDepositContextModule` — the one read-only Ordering port, so the target
 *   chain reaches the order without acquiring `ORDER_REPOSITORY` and its
 *   `transition()`. That absence is what makes "a customer cannot move an order
 *   to READY_FOR_DELIVERY" true of the wiring rather than of the code written
 *   today;
 * - `PaymentPersistenceModule` — the canonical AGG-16 contract, whose
 *   `openAttempt` re-reads the obligation `FOR UPDATE` and refuses a
 *   non-`PENDING` one. The delivered writer; no second payment writer and no
 *   payment SQL of its own;
 * - `DatabaseModule` — `TransactionManager` and `IdempotencyStore`. The
 *   delivered claim mechanism in the delivered `payment.initiate` namespace, not
 *   a second idempotency system;
 * - `AuditContextModule` — the injectable clock, so the transaction's instant is
 *   one a suite can pin instead of `new Date()` inside a money path.
 *
 * ### What is absent, and what each absence prevents
 *
 * No `IdentityModule`, so no Admin guard and no Admin route can exist here:
 * verification and `TR-LC14-06` are `APP9-B03`'s and are unreachable from this
 * injector. No `OrderModule`, so no LC-14 transition is reachable. No outbox
 * store of any kind, so opening an attempt can emit no event — none is specified
 * for it, `payment.verified` is emitted only by Admin verification, and one here
 * would create a side-effect contract no consumer was designed against. No
 * `AssetModule`, no object storage and no intake lane, so no evidence capability
 * exists here. No provider SDK, no webhook controller and no `recordProviderEvent`
 * call: `IMP-O007` stays open and `payment_provider_events` stays unused. No
 * inventory, production or shipping module.
 *
 * It exports nothing. There is one entry point and it is one HTTP operation.
 */
@Module({
  imports: [
    AuditContextModule,
    CustomerModule,
    DatabaseModule,
    OrderDepositContextModule,
    PaymentPersistenceModule,
  ],
  controllers: [PublicOrderFinalPaymentAttemptController],
  providers: [PaymentTargetResolver, InitiateFinalPaymentAttemptUseCase],
})
export class CustomerFinalPaymentAttemptModule {}
