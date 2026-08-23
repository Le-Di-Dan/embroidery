import { Module } from '@nestjs/common';
import { DatabaseModule } from '@embroidery/persistence';

import { AssetModule } from '../asset/asset.module';
import { ObjectStorageModule } from '../asset/infrastructure/storage/object-storage.module';
import { IdentityModule } from '../identity/identity.module';
import { DeliverTransferEvidence } from './application/admin/deliver-transfer-evidence.use-case';
import { ADMIN_PAYMENT_READ_REPOSITORY } from './domain/repositories/admin-payment-read.repository';
import { DrizzleAdminPaymentReadRepository } from './infrastructure/persistence/drizzle-admin-payment-read.repository';
import { AdminPaymentEvidenceController } from './presentation/admin-payment-evidence.controller';

/**
 * `APP7-B06` — Admin delivery of submitted transfer evidence.
 *
 * A **fourth** CTX-PAY surface module beside the customer deposit read, the
 * attempt initiation, the evidence intake, the Admin payment read and the two
 * Admin mutations, on the pattern all of them set: one surface, one injector,
 * one set of dependencies.
 *
 * The split from `AdminOrderPaymentModule` is not cosmetic, and that module's
 * own documentation already anticipated it: this is the only Admin payment
 * module that needs `ObjectStorageModule`, and folding it in would put an S3
 * client into the injector of a JSON read route whose whole contract is that it
 * serves no bytes — and would make `getObjectStream` resolvable from a handler
 * that must never open an object. `APP5-B06` split its delivery module from the
 * APP5 Admin read model for exactly this reason.
 *
 * The reverse containment matters more here than anywhere in APP7. This module
 * deliberately does **not** import `PaymentPersistenceModule`,
 * `AdminPaymentVerificationModule` or `OrderModule`, so
 * `PAYMENT_OBLIGATION_REPOSITORY`, `settleAttempt`, `satisfy`,
 * `appendReconciliation`, `VerifyPaymentAttempt`, `ReviewPaymentAttempt`,
 * `ORDER_REPOSITORY` and `transition()` are all unreachable from a route that
 * must only read. There is no `TransactionManager` handed out, no
 * `OutboxEventStore` and no audit writer, so nothing here can open a write
 * transaction or announce one. "Opening evidence changes no payment truth" is
 * therefore a property of the wiring, not a claim about the code written today.
 *
 * Its dependencies are exactly four, and each is a boundary rather than a
 * convenience:
 *
 * - `IdentityModule` — the APP1 guard, and nothing else. No session is read
 *   here, no cookie parsed, no admin account queried;
 * - `AssetModule` — `ASSET_REPOSITORY` only, for the source descriptor, used
 *   through its non-locking scoped batch read. Asset keeps owning the file;
 *   Payment owns the association;
 * - `ObjectStorageModule` — the shared `ObjectStoragePort` binding, so exactly
 *   one S3 client is built for the process, and one with no presign operation to
 *   reach for;
 * - `DatabaseModule` — the executor the association read is built on. No
 *   `TransactionManager` is used: there is nothing to commit, and no storage I/O
 *   ever happens inside a transaction.
 *
 * `ADMIN_PAYMENT_READ_REPOSITORY` is bound here rather than imported from
 * `AdminOrderPaymentModule`, which exports nothing. It is the same read-only
 * adapter B04 binds — four `select`s, no transaction, no lock — so a second
 * instance is not a second authority, and reusing the seam is what keeps B04 and
 * B06 from growing two statements against one association table.
 *
 * There is no merchant bank configuration and no QR encoder: a delivery route
 * has no business reading a bank account, and a module that cannot inject one
 * cannot leak it. It exports nothing. There is one entry point and it is an HTTP
 * operation.
 */
@Module({
  imports: [AssetModule, DatabaseModule, IdentityModule, ObjectStorageModule],
  controllers: [AdminPaymentEvidenceController],
  providers: [
    { provide: ADMIN_PAYMENT_READ_REPOSITORY, useClass: DrizzleAdminPaymentReadRepository },
    DeliverTransferEvidence,
  ],
})
export class AdminPaymentEvidenceModule {}
