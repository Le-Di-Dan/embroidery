/**
 * The zero-write customer full-payment read (`APP12-B04` §15, §16).
 *
 * ```text
 * secure token -> ORDER_ACCESS grant -> order -> live FULL obligation
 * ```
 *
 * One hop shorter than the custom walk and otherwise the delivered one: the
 * same `AuthorizeSecureLink` admission — so this route shares the secure-link
 * abuse budget rather than opening a second one — and the same
 * `PaymentTargetResolver`, asked for `FULL` from the order the grant names
 * instead of from a request. No order id, obligation id, attempt id, amount or
 * customer identifier is accepted from the caller, because there is nothing on
 * this surface to accept one with.
 *
 * ### The scope is narrowed here, not chosen by the caller
 *
 * `AuthorizeSecureLink` resolves a grant of either scope and applies the
 * release gate; `orderSubjectOf` then refuses anything that is not
 * `ORDER_ACCESS`, with the one indistinguishable `SECURE_LINK_UNAVAILABLE`. So
 * a custom customer's live `REQUEST_ACCESS` link cannot read a Ready-Made
 * payment even when Wave 2 is released, and cannot be told that is why.
 *
 * ### The amount is copied, never computed
 *
 * `target.obligation.amount` is the `numeric(14,2)` `APP12-B03` composed once
 * as `frozen merchandise subtotal + exact shipping fee`. Nothing here adds a
 * fee, subtracts a deposit, reads a quotation or touches an order line. After a
 * fee correction the live obligation is the **successor**, so this read returns
 * the corrected figure with no special case — `findLiveForOrder` excludes the
 * superseded predecessor, which is the whole reason the amount is read through
 * it rather than remembered.
 *
 * ### Before the fee
 *
 * A Ready-Made order at `AWAITING_SHIPPING_FEE` has no `FULL` obligation at all
 * (`BR-029` — `APP12-B03` creates it with the fee), so the resolver misses and
 * this read answers with the same 404 as an unusable token. That is deliberate:
 * §14 forbids a provisional obligation, and the customer's *order* read is the
 * operation that truthfully reports "shipping is not priced yet".
 *
 * ### Readable after the window closes
 *
 * Unlike the QR and the attempt, this read is not gated on payability. A
 * customer whose transfer an Admin has verified is entitled to see that
 * committed truth, and `payable: false` is what tells them and the UI which of
 * the two they have. What they may not do is act on it, and neither of the
 * other two operations lets them.
 */
import { Inject, Injectable } from '@nestjs/common';

import {
  AuthorizeSecureLink,
  type SecureLinkAdmission,
} from '../../../customer/application/authorize-secure-link.service';
import { orderSubjectOf } from '../../../customer/domain/grant/grant-subject';
import type { NetworkReadableRequest } from '../../../customer/infrastructure/rate-limit/public-network-key.service';
import { MERCHANT_BANK_CONFIG, type MerchantBankConfig } from '../../config/merchant-bank.config';
import { isFullPaymentPayable } from '../../domain/full-payment/full-payment.policy';
import { fullTransferReference } from '../../domain/full-payment/full-payment-reference';
import { PaymentTargetResolver } from './payment-target.resolver';
import type { CustomerFullPaymentView } from './customer-full-payment.view';

/** The one obligation kind this surface resolves. `DEPOSIT` is never a fallback. */
const FULL = 'FULL' as const;

export interface ReadFullPaymentCommand {
  readonly token: string;
}

export type FullPaymentReadOutcome =
  | { readonly outcome: 'READ'; readonly view: CustomerFullPaymentView }
  | { readonly outcome: 'RATE_LIMITED'; readonly retryAfterSeconds: number };

@Injectable()
export class ReadFullPayment {
  constructor(
    private readonly links: AuthorizeSecureLink,
    private readonly targets: PaymentTargetResolver,
    @Inject(MERCHANT_BANK_CONFIG) private readonly bank: MerchantBankConfig,
  ) {}

  async read(
    request: NetworkReadableRequest,
    command: ReadFullPaymentCommand,
  ): Promise<FullPaymentReadOutcome> {
    const admission: SecureLinkAdmission = await this.links.authorize(request, command.token);
    if (admission.outcome === 'RATE_LIMITED') {
      return { outcome: 'RATE_LIMITED', retryAfterSeconds: admission.retryAfterSeconds };
    }

    const target = await this.targets.resolveForOrder(orderSubjectOf(admission.link), FULL);

    return {
      outcome: 'READ',
      view: {
        orderCode: target.order.code,
        orderStatus: target.order.status,
        fullPaymentStatus: target.obligation.status,
        // Straight through. The obligation's own amount and its own currency,
        // still strings, never re-derived from an order total or a fee.
        fullPaymentAmount: target.obligation.amount,
        currencyCode: target.obligation.currencyCode,
        payable: isFullPaymentPayable({
          orderStatus: target.order.status,
          obligationStatus: target.obligation.status,
        }),
        bankInstructions: {
          bankBin: this.bank.bankBin,
          bankDisplayName: this.bank.bankDisplayName,
          accountNumber: this.bank.accountNumber,
          accountName: this.bank.accountName,
          // The FL memo, so an operator reconciling the statement can tell a
          // Ready-Made transfer from a custom deposit or balance.
          transferReference: fullTransferReference(target.order.code),
        },
        accessExpiresAt: admission.link.expiresAt,
      },
    };
  }
}
