import { Module } from '@nestjs/common';
import { DatabaseModule, PaymentPersistenceModule } from '@embroidery/persistence';

import { AuditContextModule } from '../../platform/audit-context/audit-context.module';
import { CustomerModule } from '../customer/customer.module';
import { OrderDepositContextModule } from '../order/order-deposit-context.module';
import { DepositTargetResolver } from './application/customer/deposit-target.resolver';
import { InitiateDepositAttemptUseCase } from './application/customer/initiate-deposit-attempt.use-case';
import { PublicOrderDepositAttemptController } from './presentation/public-order-deposit-attempt.controller';

/**
 * `APP7-B03` — the customer's one deposit write.
 *
 * A second CTX-PAY surface module beside `CustomerDepositModule`, on the
 * `APP6-B04` / `APP6-B05` arrangement and for its reason: that module's
 * documented security property is an **absence** — it imports no
 * `DatabaseModule`, so nothing composed there can open a transaction or claim an
 * idempotency scope. This route needs both. Merging them would delete the read
 * module's property to gain nothing, since the read and the write share only the
 * target resolver.
 *
 * ### What this module may inject, which is what its route may eventually do
 *
 * - `CustomerModule` — three capabilities and no machinery.
 *   `AuthorizeSecureLink` for the pre-transaction admission (identical policy,
 *   budget and digest to the read); `ReauthorizeSecureGrant` for the
 *   in-transaction, row-locked re-check ADR-DB3-004 r9 requires; and
 *   `StepUpEvidenceResolver` for GRD-003, whose sensitive set names "pay"
 *   explicitly. It issues nothing: no grant, no token, no challenge and no
 *   payment session — `APP7-B03` reuses the delivered APP4 verification flow;
 * - `OrderDepositContextModule` — the one read-only Ordering port, so the target
 *   chain can reach the order without acquiring `ORDER_REPOSITORY` and its
 *   `transition()`. That absence is what makes "a customer cannot move an order
 *   to DEPOSIT_PAID" true of the wiring rather than of the code written today;
 * - `PaymentPersistenceModule` — the canonical AGG-16 contract
 *   (`APP7-W01-C1`), whose `openAttempt` re-reads the obligation `FOR UPDATE`
 *   and refuses a non-`PENDING` one. This is the delivered writer; `APP7-B03`
 *   introduces no second payment writer and no payment SQL of its own;
 * - `DatabaseModule` — `TransactionManager` and `IdempotencyStore`. The
 *   delivered claim mechanism, not a parallel one;
 * - `AuditContextModule` — the injectable clock, so the transaction's instant is
 *   one a suite can pin instead of `new Date()` inside a money path.
 *
 * ### What is absent, and what each absence prevents
 *
 * There is no `IdentityModule`, so no Admin guard and no Admin route can exist
 * here: verification is `APP7-B04`'s and is unreachable from this injector.
 * There is no `OrderModule`, so no LC-14 transition is reachable. There is no
 * outbox store of any kind, so opening an attempt can emit no event — none is
 * specified for it, and one here would create a side-effect contract no consumer
 * was designed against. There is no `AssetModule`, no object storage and no
 * intake lane, so no evidence capability exists (`APP7-B05` owns it). There is
 * no provider SDK, no webhook controller and no `recordProviderEvent` call:
 * `IMP-O007` stays open and `payment_provider_events` stays unused. There is no
 * inventory or production module.
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
  controllers: [PublicOrderDepositAttemptController],
  providers: [DepositTargetResolver, InitiateDepositAttemptUseCase],
})
export class CustomerDepositAttemptModule {}
