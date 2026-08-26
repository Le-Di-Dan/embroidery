import { Module } from '@nestjs/common';
import {
  DatabaseModule,
  OrderPersistenceModule,
  PaymentPersistenceModule,
} from '@embroidery/persistence';

import { AuditContextModule } from '../../platform/audit-context/audit-context.module';
import { AuditModule } from '../audit/audit.module';
import { IdentityModule } from '../identity/identity.module';
import { PaymentDecisionChainResolver } from './application/admin/payment-decision-chain.resolver';
import { PaymentDecisionRecorder } from './application/admin/payment-decision.recorder';
import { ReviewPaymentAttemptUseCase } from './application/admin/review-payment-attempt.use-case';
import { RouteAttemptToReview } from './application/admin/route-attempt-to-review.service';
import { VerifyPaymentAttemptUseCase } from './application/admin/verify-payment-attempt.use-case';
import { AdminPaymentAttemptController } from './presentation/admin-payment-attempt.controller';

/**
 * `APP7-B04` — Admin manual verification and review.
 *
 * The **first** CTX-PAY surface module in the repository authorized to move
 * money state, and the only one. Every other payment module is defined by not
 * holding what this one holds: `CustomerDepositModule` has no transaction
 * manager, `CustomerDepositAttemptModule` can only open a `PENDING` attempt, and
 * `CustomerDepositEvidenceModule` has no `IdentityModule` and so cannot mount an
 * Admin route at all.
 *
 * ### What it may inject, which is what its two routes may do
 *
 * - `IdentityModule` — the APP1 guard and the two staff mutation guards. No
 *   session is read here, no cookie parsed, and no operator identity is ever a
 *   parameter: `requirePaymentAdminActorId` reads the actor the guard bound;
 * - `PaymentPersistenceModule` — the one canonical AGG-16 writer.
 *   `lockAttemptForVerification`, `settleAttempt`, `satisfy` and
 *   `appendReconciliation` are all its methods. There is no payment SQL in this
 *   module and no second satisfy implementation;
 * - `OrderPersistenceModule` — the one canonical AGG-15 writer, imported
 *   directly rather than through `OrderModule` so `CUSTOM_REQUEST_REPOSITORY`
 *   stays out of a payment injector. `transition()` is used for exactly one
 *   move, `AWAITING_DEPOSIT → DEPOSIT_PAID`, and the LC-14 legality check inside
 *   it is what refuses every other;
 * - `AuditModule` — the delivered append-only audit writer, not a second
 *   mechanism;
 * - `DatabaseModule` — `TransactionManager` and `OutboxEventStore`. One
 *   transaction per decision, and the delivered outbox rather than a parallel
 *   one;
 * - `AuditContextModule` — the injectable clock, so a suite can pin the instant
 *   rather than a money path calling `new Date()` in five places.
 *
 * ### What is absent, and what each absence prevents
 *
 * There is no `ADMIN_PAYMENT_READ_REPOSITORY` here: the read is
 * `AdminOrderPaymentModule`'s, and keeping the projection out of the writing
 * injector is what lets each module's suite state its own claim structurally.
 *
 * There is no `AssetModule` and no `ObjectStorageModule`, so no evidence byte,
 * object key or bucket is reachable — evidence is supporting material
 * (`APP7-G01` §7.6) and cannot become a verification input here even by
 * accident. There is no `CustomerModule`, so no grant, token or step-up is
 * reachable: Admin verification is authorized by the Admin session and nothing
 * else. There is no inventory or production module, so `DEPOSIT_PAID` is where
 * this module's authority ends — APP8 consumes it later through the delivered
 * `DepositEligibilityPort`. And there is no provider SDK, webhook controller or
 * `recordProviderEvent` call anywhere in it, so `IMP-O007` cannot be reopened
 * through this surface.
 *
 * It exports nothing. There are two entry points and both are HTTP operations.
 */
@Module({
  imports: [
    AuditContextModule,
    AuditModule,
    DatabaseModule,
    IdentityModule,
    OrderPersistenceModule,
    PaymentPersistenceModule,
  ],
  controllers: [AdminPaymentAttemptController],
  providers: [
    PaymentDecisionChainResolver,
    PaymentDecisionRecorder,
    RouteAttemptToReview,
    VerifyPaymentAttemptUseCase,
    ReviewPaymentAttemptUseCase,
  ],
})
export class AdminPaymentVerificationModule {}
