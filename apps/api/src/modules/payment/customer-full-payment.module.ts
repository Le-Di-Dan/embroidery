import { Module } from '@nestjs/common';
import { PaymentPersistenceModule } from '@embroidery/persistence';

import { CustomerModule } from '../customer/customer.module';
import { OrderDepositContextModule } from '../order/order-deposit-context.module';
import { MERCHANT_BANK_CONFIG, loadMerchantBankConfig } from './config/merchant-bank.config';
import type { MerchantBankConfig } from './config/merchant-bank.config';
import { DeliverFullPaymentQr } from './application/customer/deliver-full-payment-qr.query';
import { PaymentTargetResolver } from './application/customer/payment-target.resolver';
import { ReadFullPayment } from './application/customer/read-full-payment.query';
import { BankTransferQrEncoder } from './infrastructure/qr/bank-transfer-qr.encoder';
import { PublicOrderFullPaymentController } from './presentation/public-order-full-payment.controller';

/**
 * `APP12-B04` — the customer's two zero-write Ready-Made payment operations.
 *
 * The exact import list of `CustomerDepositModule` and
 * `CustomerFinalPaymentModule`, for the exact reasons those modules record. It
 * is a **separate** module rather than two more controllers on either because
 * Nest resolves controllers per module and the three surfaces must stay
 * independently composable: a reviewer reading any one of them should see the
 * whole security boundary of one obligation kind, and `APP12-S03` should be
 * able to move this one without touching the custom two.
 *
 * Its four dependencies:
 *
 * - `CustomerModule` — `AuthorizeSecureLink` only. The **same** APP4 policy,
 *   budget and digest, resolving the `ORDER_ACCESS` grant `APP12-B04` issues at
 *   order creation. No new grant scope beyond the one `APP12-DB01` added, no
 *   `FULL_PAYMENT_ACCESS`, no second secure-access architecture, no customer
 *   account or session, and nothing minted here;
 * - `OrderDepositContextModule` — the one read-only Ordering port, so this
 *   surface reaches the order the grant names without touching Ordering's
 *   tables and without acquiring `ORDER_REPOSITORY`. `findOrderById` already
 *   existed for the Admin payment read, so no Ordering read is added;
 * - `PaymentPersistenceModule` — the canonical AGG-16 contract, for
 *   `findLiveForOrder(order, 'FULL')`. No payment persistence is
 *   re-implemented and no second payment repository exists;
 * - the merchant bank configuration, from the same factory the other two
 *   surfaces use, so a missing or malformed value fails when this module is
 *   composed rather than at the first customer request (`APP7-G01` §3). It is
 *   the same merchant account: `APP12-B04` changes no merchant configuration
 *   architecture and adds no second one (§33).
 *
 * ### What is absent, and what each absence prevents
 *
 * No `DatabaseModule`, so no `TransactionManager`, no `IdempotencyStore` and no
 * executor can be injected: nothing composed here can open a transaction, and
 * the AGG-16 repository's mutating methods all call `requireTransaction` and
 * would throw rather than write even if one were reached. No `OrderModule` and
 * no `ReadyMadeOrderModule`, so no order transition is reachable and
 * `AWAITING_PAYMENT -> READY_FOR_DELIVERY` — `APP12-B05`'s, inside the Admin
 * verification transaction — cannot be triggered from a customer request, and
 * neither can a shipping-fee write (§35). No `InventoryModule`, so nothing here
 * can reserve, release or reschedule stock. No `IdentityModule`, so no Admin
 * guard and no Admin verification route can exist here. No outbox store, so
 * reading a payment or a QR cannot emit `payment.verified` or any other event.
 * No `AssetModule` and no object storage: the QR is generated in-process and
 * never stored, and transfer evidence stays the delivered attempt-scoped lane
 * (§22). No provider SDK and no webhook controller — `IMP-O007` stays open. No
 * quotation module and no catalog module, so no total can be recomposed from a
 * live price.
 *
 * It exports nothing. There are two entry points and they are the HTTP
 * operations.
 */
@Module({
  imports: [CustomerModule, OrderDepositContextModule, PaymentPersistenceModule],
  controllers: [PublicOrderFullPaymentController],
  providers: [
    {
      provide: MERCHANT_BANK_CONFIG,
      useFactory: (): MerchantBankConfig => loadMerchantBankConfig(process.env),
    },
    BankTransferQrEncoder,
    PaymentTargetResolver,
    ReadFullPayment,
    DeliverFullPaymentQr,
  ],
})
export class CustomerFullPaymentModule {}
