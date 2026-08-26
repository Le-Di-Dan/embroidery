import { Module } from '@nestjs/common';
import { DatabaseModule, PaymentPersistenceModule } from '@embroidery/persistence';

import { AuditContextModule } from '../../platform/audit-context/audit-context.module';
import { AssetModule } from '../asset/asset.module';
import { ObjectStorageModule } from '../asset/infrastructure/storage/object-storage.module';
import { UploadTimer } from '../asset/application/ports/upload-timer';
import { CustomerModule } from '../customer/customer.module';
import { OrderDepositContextModule } from '../order/order-deposit-context.module';
import { PaymentTargetResolver } from './application/customer/payment-target.resolver';
import { AttemptStepUpVerifier } from './application/evidence/attempt-step-up.verifier';
import { EvidenceAttemptAuthorizer } from './application/evidence/evidence-attempt.authorizer';
import { ReadTransferEvidence } from './application/evidence/read-transfer-evidence.query';
import { TransferEvidenceObjectWriter } from './application/evidence/transfer-evidence-object.writer';
import { TransferEvidenceTransactionsService } from './application/evidence/transfer-evidence-transactions.service';
import { UploadTransferEvidenceService } from './application/evidence/upload-transfer-evidence.service';
import { PublicOrderDepositEvidenceController } from './presentation/public-order-deposit-evidence.controller';

/**
 * `APP7-B05` — the customer transfer-evidence lane.
 *
 * A third CTX-PAY surface module, separate from `CustomerDepositModule` and
 * `CustomerDepositAttemptModule` on the same pattern that separates
 * `CustomRequestIntakeModule` from `CustomRequestSubmissionModule`, and for the
 * same reason: this is the only deposit surface that needs a configured object
 * store, and folding it into either of the others would make every consumer of
 * the deposit read or the attempt write boot storage it never calls.
 *
 * It also has a genuinely different dependency shape. The deposit read needs the
 * merchant bank configuration and the QR encoder, which this needs not at all;
 * this needs `ObjectStorageModule` and the intake pipeline, which neither of
 * those has.
 *
 * ### What it may inject, which is what its two routes may eventually do
 *
 * - `CustomerModule` — three capabilities and no machinery. `AuthorizeSecureLink`
 *   for the pre-transaction admission, `ReauthorizeSecureGrant` for the
 *   in-transaction row-locked re-check (ADR-DB3-004 r9), and the customer and
 *   verification-challenge ports so the attempt's **own** step-up can be
 *   re-verified. It issues nothing: no grant, no token, no challenge and no
 *   payment session;
 * - `OrderDepositContextModule` — the one read-only Ordering port, so the target
 *   chain reaches the order without acquiring `ORDER_REPOSITORY` and its
 *   `transition()`. That absence is what makes "a customer cannot move an order
 *   to `DEPOSIT_PAID`" true of the wiring rather than of the code written today;
 * - `PaymentPersistenceModule` — `PaymentTransferEvidenceRepository`, the one
 *   canonical writer of the association, and `PAYMENT_OBLIGATION_REPOSITORY` for
 *   the target resolver's obligation read. No payment SQL of its own;
 * - `AssetModule` — `ASSET_REPOSITORY` only. Asset keeps owning the asset row;
 * - `ObjectStorageModule` — the streamed private write, with no presign
 *   operation on the port to reach for;
 * - `DatabaseModule` — `TransactionManager`, `IdempotencyAllocationStore` and
 *   `OutboxEventStore`. The delivered claim and handoff mechanisms, not parallel
 *   ones;
 * - `AuditContextModule` — the injectable clock, so a suite can pin the instant
 *   rather than a money-adjacent path calling `new Date()` in five places.
 *
 * ### What is absent, and what each absence prevents
 *
 * There is no `IdentityModule`, so no Admin guard and no Admin route can exist
 * here: verification is `APP7-B04`'s and Admin evidence delivery is
 * `APP7-B06`'s, and both are unreachable from this injector. There is no
 * `OrderModule`, so no LC-14 transition is reachable. The obligation repository
 * is present because the chain must read the obligation — but nothing here calls
 * `settleAttempt`, `satisfy`, `openAttempt`, `appendReconciliation` or
 * `recordProviderEvent`, and there is no provider SDK and no webhook controller
 * for `IMP-O007` to be reopened through. There is no inventory or production
 * module.
 *
 * `UploadTimer` is provided here rather than imported, exactly as
 * `CustomRequestIntakeModule` provides it: `AssetIntakeModule` does not export
 * it, and it is a stateless scheduling seam, so a second instance is not a
 * second source of truth.
 *
 * `PaymentTargetResolver` is likewise provided rather than exported from the
 * read module — it is a stateless walk over two injected ports, and importing
 * `CustomerDepositModule` to reach it would drag the merchant bank configuration
 * and the QR encoder into a surface that uses neither.
 *
 * It exports nothing. There are two entry points and both are HTTP operations.
 */
@Module({
  imports: [
    AuditContextModule,
    AssetModule,
    CustomerModule,
    DatabaseModule,
    ObjectStorageModule,
    OrderDepositContextModule,
    PaymentPersistenceModule,
  ],
  controllers: [PublicOrderDepositEvidenceController],
  providers: [
    UploadTimer,
    PaymentTargetResolver,
    AttemptStepUpVerifier,
    EvidenceAttemptAuthorizer,
    TransferEvidenceObjectWriter,
    TransferEvidenceTransactionsService,
    UploadTransferEvidenceService,
    ReadTransferEvidence,
  ],
})
export class CustomerDepositEvidenceModule {}
