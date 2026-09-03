/**
 * The zero-write customer final-payment read (`APP9-B02` §2 A).
 *
 * ```text
 * secure token → grant → custom request → order → live REMAINING obligation
 * ```
 *
 * Every hop is the delivered one: the same `AuthorizeSecureLink` admission —
 * so this route shares the deposit's abuse budget rather than opening a second
 * one — and the same `PaymentTargetResolver`, asked for `REMAINING` instead of
 * `DEPOSIT`. No order id, obligation id or amount is accepted from the caller,
 * because there is nothing on this surface to accept one with.
 *
 * ### The amount is copied, never computed
 *
 * `target.obligation.amount` is the `numeric(14,2)` `APP7-W01` copied verbatim
 * from the accepted quotation version's `remaining_amount`. Nothing here
 * subtracts the deposit from a total, reads a quotation, or touches an order
 * line — a balance recomputed at read time would disagree with the obligation
 * the Admin will verify against the moment a shipping fee moved.
 *
 * ### Readable after the window closes
 *
 * Unlike the QR and the attempt, this read is not gated on payability. A
 * customer whose payment has been verified — order `READY_FOR_DELIVERY` or
 * beyond, obligation `SATISFIED` — is entitled to see that committed truth, and
 * `payable: false` is what tells them and the UI which of the two they have.
 * What they may not do is act on it, and neither of the other two operations
 * lets them.
 */
import { Inject, Injectable } from '@nestjs/common';

import {
  AuthorizeSecureLink,
  type SecureLinkAdmission,
} from '../../../customer/application/authorize-secure-link.service';
import type { NetworkReadableRequest } from '../../../customer/infrastructure/rate-limit/public-network-key.service';
import type { CustomRequestId } from '../../../order/domain/repositories/custom-request.repository';
import { requestSubjectOf } from '../../../customer/domain/grant/grant-subject';
import { MERCHANT_BANK_CONFIG, type MerchantBankConfig } from '../../config/merchant-bank.config';
import { isFinalPaymentPayable } from '../../domain/final-payment/final-payment.policy';
import { remainingTransferReference } from '../../domain/final-payment/final-payment-reference';
import { PaymentTargetResolver } from './payment-target.resolver';
import type { CustomerFinalPaymentView } from './customer-final-payment.view';

/** The one obligation kind this surface resolves. `DEPOSIT` is never a fallback. */
const REMAINING = 'REMAINING' as const;

export interface ReadFinalPaymentCommand {
  readonly token: string;
}

export type FinalPaymentReadOutcome =
  | { readonly outcome: 'READ'; readonly view: CustomerFinalPaymentView }
  | { readonly outcome: 'RATE_LIMITED'; readonly retryAfterSeconds: number };

@Injectable()
export class ReadFinalPayment {
  constructor(
    private readonly links: AuthorizeSecureLink,
    private readonly targets: PaymentTargetResolver,
    @Inject(MERCHANT_BANK_CONFIG) private readonly bank: MerchantBankConfig,
  ) {}

  async read(
    request: NetworkReadableRequest,
    command: ReadFinalPaymentCommand,
  ): Promise<FinalPaymentReadOutcome> {
    const admission: SecureLinkAdmission = await this.links.authorize(request, command.token);
    if (admission.outcome === 'RATE_LIMITED') {
      return { outcome: 'RATE_LIMITED', retryAfterSeconds: admission.retryAfterSeconds };
    }

    const target = await this.targets.resolve(
      requestSubjectOf(admission.link) as CustomRequestId,
      REMAINING,
    );

    return {
      outcome: 'READ',
      view: {
        orderCode: target.order.code,
        orderStatus: target.order.status,
        finalPaymentStatus: target.obligation.status,
        // Straight through. The obligation's own amount and its own currency,
        // still strings, never re-derived from an order total or a quotation.
        finalPaymentAmount: target.obligation.amount,
        currencyCode: target.obligation.currencyCode,
        payable: isFinalPaymentPayable({
          orderStatus: target.order.status,
          obligationStatus: target.obligation.status,
        }),
        bankInstructions: {
          bankBin: this.bank.bankBin,
          bankDisplayName: this.bank.bankDisplayName,
          accountNumber: this.bank.accountNumber,
          accountName: this.bank.accountName,
          // The RM memo, so the operator reconciling the statement can tell this
          // transfer from the deposit on the same order.
          transferReference: remainingTransferReference(target.order.code),
        },
        accessExpiresAt: admission.link.expiresAt,
      },
    };
  }
}
