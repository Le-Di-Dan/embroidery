import { Module } from '@nestjs/common';
import { PaymentPersistenceModule } from '@embroidery/persistence';

import { CustomerModule } from '../customer/customer.module';
import { OrderDepositContextModule } from '../order/order-deposit-context.module';
import { MERCHANT_BANK_CONFIG, loadMerchantBankConfig } from './config/merchant-bank.config';
import type { MerchantBankConfig } from './config/merchant-bank.config';
import { DeliverFinalPaymentQr } from './application/customer/deliver-final-payment-qr.query';
import { PaymentTargetResolver } from './application/customer/payment-target.resolver';
import { ReadFinalPayment } from './application/customer/read-final-payment.query';
import { BankTransferQrEncoder } from './infrastructure/qr/bank-transfer-qr.encoder';
import { PublicOrderFinalPaymentController } from './presentation/public-order-final-payment.controller';

/**
 * `APP9-B02` — the customer's two zero-write final-payment operations.
 *
 * The exact import list of `CustomerDepositModule`, for the exact reasons that
 * module records. It is a **separate** module rather than two more controllers
 * on that one because Nest resolves controllers per module and the two surfaces
 * must stay independently composable: `APP9-S01` and a later APP10 change should
 * be able to move one without touching the other, and a reviewer reading either
 * module should see the whole security boundary of one obligation kind.
 *
 * Its four dependencies:
 *
 * - `CustomerModule` — `AuthorizeSecureLink` only. The **same** `REQUEST_ACCESS`
 *   grant APP5 created at submission, resolved by the delivered APP4 policy,
 *   budget and digest. No new grant scope, no `FINAL_PAYMENT_ACCESS`, no second
 *   secure-access architecture, and nothing minted here;
 * - `OrderDepositContextModule` — the one read-only Ordering port, so this
 *   surface reaches the order behind the grant's request without touching
 *   Ordering's tables and without acquiring `ORDER_REPOSITORY`;
 * - `PaymentPersistenceModule` — the canonical AGG-16 contract, for
 *   `findLiveForOrder(order, 'REMAINING')`. No payment persistence is
 *   re-implemented and no second payment repository exists;
 * - the merchant bank configuration, from the same factory the deposit surface
 *   uses, so a missing or malformed value fails when this module is composed
 *   rather than at the first customer request (`APP7-G01` §3). It is the same
 *   merchant account: `APP9-B02` changes no merchant configuration architecture.
 *
 * ### What is absent, and what each absence prevents
 *
 * No `DatabaseModule`, so no `TransactionManager`, no `IdempotencyStore` and no
 * executor can be injected: nothing composed here can open a transaction, and
 * the AGG-16 repository's mutating methods all call `requireTransaction` and
 * would throw rather than write even if one were reached. No `OrderModule`, so
 * no LC-14 transition is reachable and `TR-LC14-06` — `APP9-B03`'s, inside the
 * Admin verification transaction — cannot be triggered from a customer request.
 * No `IdentityModule`, so no Admin guard and no Admin verification route can
 * exist here. No outbox store, so reading a balance or a QR cannot emit
 * `payment.verified` or any other event. No `AssetModule` and no object storage:
 * the QR is generated in-process and never stored, and transfer evidence stays
 * the delivered attempt-scoped lane. No provider SDK and no webhook controller —
 * `IMP-O007` stays open. No quotation module, so no balance can be recomputed
 * from a total.
 *
 * It exports nothing. There are two entry points and they are the HTTP
 * operations.
 */
@Module({
  imports: [CustomerModule, OrderDepositContextModule, PaymentPersistenceModule],
  controllers: [PublicOrderFinalPaymentController],
  providers: [
    {
      provide: MERCHANT_BANK_CONFIG,
      useFactory: (): MerchantBankConfig => loadMerchantBankConfig(process.env),
    },
    BankTransferQrEncoder,
    PaymentTargetResolver,
    ReadFinalPayment,
    DeliverFinalPaymentQr,
  ],
})
export class CustomerFinalPaymentModule {}
