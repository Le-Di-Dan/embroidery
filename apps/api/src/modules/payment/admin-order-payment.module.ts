import { Module } from '@nestjs/common';
import { DatabaseModule } from '@embroidery/persistence';

import { AssetModule } from '../asset/asset.module';
import { IdentityModule } from '../identity/identity.module';
import { OrderDepositContextModule } from '../order/order-deposit-context.module';
import { ReadAdminOrderPayments } from './application/admin/read-admin-order-payments.query';
import { ADMIN_PAYMENT_READ_REPOSITORY } from './domain/repositories/admin-payment-read.repository';
import { DrizzleAdminPaymentReadRepository } from './infrastructure/persistence/drizzle-admin-payment-read.repository';
import { AdminOrderPaymentController } from './presentation/admin-order-payment.controller';

/**
 * `APP7-B04` — the Admin deposit-payment read.
 *
 * A read module, on the pattern `AdminOrderModule` set one aggregate over, and
 * defined by what it does **not** import. There is no `PaymentModule` and no
 * `PaymentPersistenceModule`, so `PAYMENT_OBLIGATION_REPOSITORY` is
 * unresolvable here and no route on this module can settle an attempt, satisfy
 * an obligation, append a reconciliation or record a provider event. There is no
 * `OrderModule`, so `ORDER_REPOSITORY` — and with it `transition()` — is out of
 * reach. There is no `TransactionManager` handed out and no `OutboxEventStore`,
 * so nothing here can open a write transaction or announce one.
 *
 * That absence is the checkpoint's "the read is zero-write" claim, stated
 * structurally. `AdminPaymentVerificationModule` holds the writers, and the two
 * are separate injectors for exactly that reason.
 *
 * Four imports and no more:
 *
 * - `IdentityModule` — the APP1 guard, and nothing else. No session is read
 *   here, no cookie parsed, no admin account queried;
 * - `OrderDepositContextModule` — the one read-only Ordering port. It answers
 *   with three columns of the order and has no method that could write one;
 * - `AssetModule` — `ASSET_REPOSITORY`, used only through its non-locking scoped
 *   batch read, so evidence metadata comes from AGG-08 rather than from a join
 *   this module has no right to write;
 * - `DatabaseModule` — the executor the read adapter is built on.
 *
 * There is no `CustomerModule` and no `CatalogModule`, and their absence is the
 * point: a payment view has no business resolving a customer's contact or a live
 * catalog price, and a module that cannot inject either cannot do it by
 * accident. There is no `ObjectStorageModule` either — B04 serves no bytes, and
 * `APP7-B06` owns the one Admin private delivery.
 *
 * It exports nothing. There is one entry point and it is an HTTP operation.
 */
@Module({
  imports: [AssetModule, DatabaseModule, IdentityModule, OrderDepositContextModule],
  controllers: [AdminOrderPaymentController],
  providers: [
    { provide: ADMIN_PAYMENT_READ_REPOSITORY, useClass: DrizzleAdminPaymentReadRepository },
    ReadAdminOrderPayments,
  ],
})
export class AdminOrderPaymentModule {}
