import { Module } from '@nestjs/common';
import {
  DatabaseModule,
  OrderPersistenceModule,
  PaymentPersistenceModule,
} from '@embroidery/persistence';

import { IdentityModule } from '../identity/identity.module';
import { OpenFinalPaymentUseCase } from './application/admin/open-final-payment.use-case';
import { AdminOrderLifecycleController } from './presentation/admin-order-lifecycle.controller';

/**
 * `APP9-B01` — the one guarded Admin order lifecycle command (`TR-LC14-05`),
 * and the write authority it genuinely needs.
 *
 * ### Why a second Admin order module
 *
 * `APP7-B02`'s `AdminOrderModule` is deliberately composed so its two routes
 * **cannot** move an order: it imports no `OrderModule` and no
 * `OrderPersistenceModule`, and its report states that absence as the structural
 * reason a read cannot write. B01's command must move one. Adding the write
 * authority to that module would put `createFromAcceptedQuotation()` and
 * `transition()` into the injector of a queue projection and a detail read that
 * must never reach them, and would quietly retire a boundary the previous
 * checkpoint was accepted on.
 *
 * So the write authority arrives in its own module, and B02's stays exactly as
 * delivered. Both controllers publish into the one `adminOrder` domain through
 * `CONTROLLER_DOMAIN_KEYS`, so a composition decision does not name a public
 * identifier — the same mechanism ten other split surfaces use. It is the shape
 * `AdminProductionTransitionModule` established beside `AdminProductionModule`
 * for `APP8-B04`.
 *
 * ### What it may inject, which is what its one route may do
 *
 * | Imported | For |
 * |---|---|
 * | `OrderPersistenceModule` | the canonical `ORDER_REPOSITORY` — `loadForUpdate` and the LC-14 `transition` |
 * | `PaymentPersistenceModule` | the canonical `PAYMENT_OBLIGATION_REPOSITORY` — `findLiveForOrder`, the kind-aware `REMAINING` guard |
 * | `IdentityModule` | the APP1 guards, and nothing else |
 * | `DatabaseModule` | `TransactionManager` |
 *
 * Both repositories are canonical implementations reached through their tokens.
 * **No persistence is promoted, none is duplicated and no migration is added**:
 * AGG-15 and AGG-16 both already live in `@embroidery/persistence`, and no SQL
 * for orders or obligations is written anywhere in this module. Orchestration is
 * the application layer's; mutation is the repositories'.
 *
 * ### What is absent, and why each absence matters
 *
 * `PaymentPersistenceModule` does bring a *writer* — that is unavoidable, it is
 * one module — but this module provides exactly one use case and that use case
 * calls exactly one obligation method, `findLiveForOrder`, a read. Nothing here
 * opens an attempt, satisfies an obligation, appends a reconciliation or records
 * a provider event; `APP9-B03` owns Admin final-payment verification.
 *
 * There is no `AuditModule` and no `OutboxEventStore` consumer: the canonical
 * `order_transitions` row the repository already appends is LC-14's actor and
 * correlation evidence, and B01 mints no event of its own (`APP9-G01` §8 —
 * notification intents are APP10's, and no accepted side effect is invented
 * here). There is no object storage, no QR encoder, no merchant bank
 * configuration and no shipping, refund or production authority.
 *
 * It exports nothing, and has one entry point.
 */
@Module({
  imports: [DatabaseModule, IdentityModule, OrderPersistenceModule, PaymentPersistenceModule],
  controllers: [AdminOrderLifecycleController],
  providers: [OpenFinalPaymentUseCase],
})
export class AdminOrderLifecycleModule {}
