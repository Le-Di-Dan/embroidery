import { Module } from '@nestjs/common';
import { PaymentPersistenceModule } from '@embroidery/persistence';

import { CustomerModule } from '../customer/customer.module';
import { OrderDepositContextModule } from '../order/order-deposit-context.module';
import { MERCHANT_BANK_CONFIG, loadMerchantBankConfig } from './config/merchant-bank.config';
import type { MerchantBankConfig } from './config/merchant-bank.config';
import { DeliverDepositQr } from './application/customer/deliver-deposit-qr.query';
import { DepositTargetResolver } from './application/customer/deposit-target.resolver';
import { ReadDeposit } from './application/customer/read-deposit.query';
import { BankTransferQrEncoder } from './infrastructure/qr/bank-transfer-qr.encoder';
import { PublicOrderDepositController } from './presentation/public-order-deposit.controller';

/**
 * `APP7-B03` — the customer's two zero-write deposit operations.
 *
 * CTX-PAY's **first** HTTP surface, composed beside `PaymentModule` rather than
 * inside it, on the arrangement every APP5/APP6 surface records: the context
 * module publishes the aggregate's port and stays free of controllers, and each
 * delivered surface assembles what it needs around that port. This is a public,
 * unauthenticated surface holding a customer's secure-link token, so the list
 * below is the checkpoint's security boundary as much as its wiring — what a
 * module can inject is what its routes can eventually do.
 *
 * Its dependencies are four:
 *
 * - `CustomerModule` — `AuthorizeSecureLink` only. APP4 owns the policy read,
 *   the abuse budget, the digest and GRD-002; this module consumes the result
 *   and holds no token handling of its own. It issues nothing: `APP7-B03` reuses
 *   the `REQUEST_ACCESS` grant APP5 created at submission and mints no token, no
 *   scope kind, no payment link and no second secure-access architecture;
 * - `OrderDepositContextModule` — one read-only Ordering port, so this surface
 *   can reach the order behind the grant's request without touching Ordering's
 *   tables and without acquiring `ORDER_REPOSITORY`;
 * - `PaymentPersistenceModule` — the canonical AGG-16 contract
 *   (`APP7-W01-C1`), for `findLiveForOrder`. No payment persistence is
 *   re-implemented here and no second payment repository or writer exists;
 * - the merchant bank configuration, provided by a factory so a missing or
 *   malformed value fails when this module is composed rather than silently at
 *   the first customer request (`APP7-G01` §3).
 *
 * What is **absent** is what keeps these two routes reads. There is no
 * `DatabaseModule` import, so no `TransactionManager`, no `IdempotencyStore` and
 * no executor can be injected: nothing composed here can open a transaction, and
 * a write that needed one could not be added without changing this file. (The
 * AGG-16 repository's mutating methods all call `requireTransaction`, so they
 * would throw rather than write even if one were reached.) There is no
 * `OrderModule`, so no order can be transitioned and `DEPOSIT_PAID` is
 * unreachable. There is no `AuditModule` and no outbox store, so reading a
 * deposit or a QR cannot append business evidence. There is no `AssetModule` and
 * no object storage: the QR is generated in-process and never stored, and
 * evidence belongs to `APP7-B05`. There is no `IdentityModule`, so no Admin
 * verification is reachable, and no quotation module, so no deposit share can be
 * recomputed.
 *
 * It exports nothing. There are two entry points and they are the HTTP
 * operations.
 */
@Module({
  imports: [CustomerModule, OrderDepositContextModule, PaymentPersistenceModule],
  controllers: [PublicOrderDepositController],
  providers: [
    {
      provide: MERCHANT_BANK_CONFIG,
      useFactory: (): MerchantBankConfig => loadMerchantBankConfig(process.env),
    },
    BankTransferQrEncoder,
    DepositTargetResolver,
    ReadDeposit,
    DeliverDepositQr,
  ],
})
export class CustomerDepositModule {}
