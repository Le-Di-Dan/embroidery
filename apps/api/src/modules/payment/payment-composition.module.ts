import { Module } from '@nestjs/common';

import { CustomerDepositModule } from './customer-deposit.module';
import { CustomerDepositAttemptModule } from './customer-deposit-attempt.module';
import { CustomerDepositEvidenceModule } from './customer-deposit-evidence.module';
import { CustomerFinalPaymentModule } from './customer-final-payment.module';
import { CustomerFinalPaymentAttemptModule } from './customer-final-payment-attempt.module';
import { AdminOrderPaymentModule } from './admin-order-payment.module';
import { AdminPaymentEvidenceModule } from './admin-payment-evidence.module';
import { AdminPaymentVerificationModule } from './admin-payment-verification.module';

/**
 * The CTX-PAY HTTP surface, composed in one place (`APP11-B01-C1`).
 *
 * Eight modules, every one of them under `modules/payment`, and the reason
 * there are eight rather than one is written against each below: each is the
 * whole security boundary of one obligation lane, and a reviewer must be able
 * to read one without the other. That argument is about *these* modules, so it
 * belongs beside them — not in the application root, where it was the single
 * largest block and where the root file carried it past the `CLAUDE.md` §6
 * source limit.
 *
 * This module is composition and nothing else: it declares no controller, no
 * provider and no export, so it grants no capability any member did not already
 * have and resolves nothing on its own. Every member keeps its own injector and
 * its own published domain, so the "defined by what it cannot inject" property
 * each one is accepted on is exactly as it was.
 *
 * Registration order inside the array is preserved verbatim from the root, and
 * `AppModule` imports this module at the position the block occupied. The route
 * surface is therefore byte-identical — proved by the committed OpenAPI
 * artifact still matching after the extraction.
 */
@Module({
  imports: [
    // APP7-B03 — the customer's two zero-write deposit operations, on their own
    // `public/orders` base path. Disjoint from `admin/orders` above and from
    // every public module before it, so registration order cannot make one
    // shadow another. Like `CustomerQuotationModule` it is defined by what it
    // cannot inject: no `DatabaseModule`, so no transaction manager and no
    // idempotency store; no `OrderModule`, so no LC-14 transition; no asset or
    // storage module, so the QR is generated in-process and nothing is stored.
    // Its merchant bank configuration is read by a factory, so a deployment
    // missing one of the four values fails at composition rather than at the
    // first customer request.
    CustomerDepositModule,
    // APP7-B03 — the customer's one deposit write, on the same `public/orders`
    // base path with a distinct sub-path (`deposit/attempts`), disjoint from
    // `deposit` and `deposit/qr` above. A second deposit module because it is
    // the mirror image of the first: it holds the transaction manager, the
    // idempotency store and the canonical AGG-16 repository that the read is
    // defined by not holding. `CONTROLLER_DOMAIN_KEYS` keeps both publishing
    // `publicOrderDeposit`.
    CustomerDepositAttemptModule,
    // APP7-B05 — the customer transfer-evidence lane, on the same `public/orders`
    // base path with a distinct sub-path (`deposit/evidence`), disjoint from the
    // three above. A third deposit module because it is the only one that needs a
    // configured object store and the delivered intake pipeline, and the only one
    // that writes `payment_transfer_evidence`. It publishes its own
    // `publicOrderDepositEvidence` domain — an intake lane is its own domain, on
    // the precedent `CONTROLLER_DOMAIN_KEYS` already records for
    // `PublicCustomRequestAssetController`.
    CustomerDepositEvidenceModule,
    // APP9-B02 — the customer's two zero-write final-payment operations, on the
    // same `public/orders` base path with sub-paths (`final-payment`,
    // `final-payment/qr`) disjoint from the deposit lane's five above, so
    // registration order cannot make one shadow another. A fourth module on that
    // base path rather than more controllers on `CustomerDepositModule`, because
    // each of these modules is the whole security boundary of one obligation
    // kind and a reviewer must be able to read one without the other. Like the
    // deposit read it is defined by what it cannot inject: no `DatabaseModule`,
    // so no transaction manager and no idempotency store; no `OrderModule`, so
    // no LC-14 transition and no `TR-LC14-06`; no `IdentityModule`, so no Admin
    // verification; no asset or storage module, so the QR is generated
    // in-process and nothing is stored. It reuses the same `REQUEST_ACCESS`
    // grant and the same merchant bank factory — no new grant scope and no
    // second merchant configuration.
    CustomerFinalPaymentModule,
    // APP9-B02 — the customer's one final-payment write, on the same base path
    // with a distinct sub-path (`final-payment/attempts`). A second
    // final-payment module for the reason `CustomerDepositAttemptModule` is a
    // second deposit module: it is the mirror image of the read, holding the
    // transaction manager, the idempotency store and the canonical AGG-16
    // repository that the read is defined by not holding.
    // `CONTROLLER_DOMAIN_KEYS` keeps both publishing `publicOrderFinalPayment`.
    CustomerFinalPaymentAttemptModule,
    // APP7-B04 — the Admin deposit-payment read, on the `admin/orders` base path
    // with a sub-path (`{orderId}/payments`) disjoint from `AdminOrderModule`'s
    // two routes, so registration order cannot make one shadow another. A
    // separate module from the mutations below because it is defined by what it
    // cannot inject: no `PaymentPersistenceModule` and no `OrderPersistenceModule`,
    // so neither writer is resolvable and the read cannot settle, satisfy or
    // transition anything. It publishes its own `adminOrderPayment` domain — an
    // order's payment vertical is its own resource, not a split of B02's detail.
    AdminOrderPaymentModule,
    // APP7-B04 — the two Admin payment mutations, on their own
    // `admin/payment-attempts` base path. The first and only module in the
    // repository that may move money state: it holds both canonical writers, the
    // transaction manager, the outbox and the audit writer. That is exactly the
    // reach every other payment module is defined by not having, and keeping it
    // in one injector is what makes "only Admin verification can reach
    // DEPOSIT_PAID" a property of the wiring.
    AdminPaymentVerificationModule,
    // APP7-B06 — the one Admin private transfer-evidence binary, on its own
    // `admin/payment-evidence` base path, disjoint from both modules above. A
    // fourth payment module because it is the only Admin payment surface that
    // needs a configured object store, and putting one in `AdminOrderPaymentModule`
    // would make `getObjectStream` resolvable from a JSON read that must never
    // open an object. It holds neither writer, so the preview cannot move an
    // attempt, an obligation or an order. It publishes its own
    // `adminPaymentEvidence` domain — a private binary lane is its own domain, on
    // the precedent `AdminCustomRequestAssetController` already set.
    AdminPaymentEvidenceModule,
  ],
})
export class PaymentCompositionModule {}
