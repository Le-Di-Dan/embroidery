/**
 * The final-payment bank-transfer QR (`APP9-B02` §2 B, §9).
 *
 * The same EMVCo/NAPAS account-transfer payload builder and the same encoder
 * `APP7-B03` delivered, given a different obligation and a different memo.
 * Neither is touched: `buildBankTransferQrPayload` and `BankTransferQrEncoder`
 * take a bank, an account, an amount and a reference, none of which mentions an
 * obligation kind, so the whole real-bank-scan-compatible encoding is reused
 * unchanged. It is not a checkout session: it carries no application URL, no
 * secure-link token, no attempt id and no provider reference.
 *
 * ### Gated on payability, unlike the read
 *
 * A QR is an instruction to send money. Producing one for an order that has not
 * reached `AWAITING_FINAL_PAYMENT`, or for a balance an Admin has already
 * verified, would invite a transfer nobody owes and that nobody would reconcile.
 * So this operation refuses outside the window `isFinalPaymentPayable` defines,
 * with the one code that names neither half of the predicate.
 *
 * Still zero-write: the refusal writes nothing and the success writes nothing.
 * No attempt is opened here — that is the third operation, and a customer who
 * scans without initiating is in exactly the position a deposit payer is.
 */
import { Inject, Injectable } from '@nestjs/common';

import {
  AuthorizeSecureLink,
  type SecureLinkAdmission,
} from '../../../customer/application/authorize-secure-link.service';
import type { NetworkReadableRequest } from '../../../customer/infrastructure/rate-limit/public-network-key.service';
import type { CustomRequestId } from '../../../order/domain/repositories/custom-request.repository';
import { MERCHANT_BANK_CONFIG, type MerchantBankConfig } from '../../config/merchant-bank.config';
import { buildBankTransferQrPayload } from '../../domain/deposit/bank-transfer-qr.payload';
import { finalPaymentError } from '../../domain/final-payment/final-payment.errors';
import { isFinalPaymentPayable } from '../../domain/final-payment/final-payment.policy';
import { remainingTransferReference } from '../../domain/final-payment/final-payment-reference';
import { BankTransferQrEncoder } from '../../infrastructure/qr/bank-transfer-qr.encoder';
import { PaymentTargetResolver } from './payment-target.resolver';

/** The one obligation kind this surface resolves. `DEPOSIT` is never a fallback. */
const REMAINING = 'REMAINING' as const;

export interface DeliverFinalPaymentQrCommand {
  readonly token: string;
}

export type FinalPaymentQrOutcome =
  | { readonly outcome: 'RENDERED'; readonly png: Buffer }
  | { readonly outcome: 'RATE_LIMITED'; readonly retryAfterSeconds: number };

@Injectable()
export class DeliverFinalPaymentQr {
  constructor(
    private readonly links: AuthorizeSecureLink,
    private readonly targets: PaymentTargetResolver,
    private readonly encoder: BankTransferQrEncoder,
    @Inject(MERCHANT_BANK_CONFIG) private readonly bank: MerchantBankConfig,
  ) {}

  async render(
    request: NetworkReadableRequest,
    command: DeliverFinalPaymentQrCommand,
  ): Promise<FinalPaymentQrOutcome> {
    const admission: SecureLinkAdmission = await this.links.authorize(request, command.token);
    if (admission.outcome === 'RATE_LIMITED') {
      return { outcome: 'RATE_LIMITED', retryAfterSeconds: admission.retryAfterSeconds };
    }

    const target = await this.targets.resolve(
      admission.link.customRequestId as CustomRequestId,
      REMAINING,
    );

    if (
      !isFinalPaymentPayable({
        orderStatus: target.order.status,
        obligationStatus: target.obligation.status,
      })
    ) {
      throw finalPaymentError('FINAL_PAYMENT_NOT_PAYABLE');
    }

    let png: Buffer;
    try {
      png = await this.encoder.encodePng(
        buildBankTransferQrPayload({
          bankBin: this.bank.bankBin,
          accountNumber: this.bank.accountNumber,
          // The obligation's own frozen amount. Nothing here recomputes a
          // balance, and no caller-supplied amount exists to override it.
          amount: target.obligation.amount,
          transferReference: remainingTransferReference(target.order.code),
        }),
      );
    } catch {
      // Deliberately swallowed rather than re-thrown: the payload builder's and
      // the encoder's messages describe the merchant configuration, and this
      // response is read by an anonymous browser.
      throw finalPaymentError('FINAL_PAYMENT_INSTRUCTIONS_UNAVAILABLE');
    }

    return { outcome: 'RENDERED', png };
  }
}
