/**
 * The full-payment bank-transfer QR (`APP12-B04` §17).
 *
 * The same EMVCo/NAPAS account-transfer payload builder and the same encoder
 * `APP7-B03` delivered, given a different obligation and a different memo.
 * Neither is touched: `buildBankTransferQrPayload` and `BankTransferQrEncoder`
 * take a bank, an account, an amount and a reference, none of which mentions an
 * obligation kind, so the whole real-bank-scan-compatible encoding is reused
 * unchanged. `APP12-B04` introduces no second QR framework, no second merchant
 * configuration and no provider. It is not a checkout session: it carries no
 * application URL, no secure-link token, no attempt id and no provider
 * reference.
 *
 * ### The amount is the live obligation's, on every request
 *
 * The payload is built from `target.obligation.amount` each time, and the
 * obligation is re-resolved through `findLiveForOrder`. So a fee correction
 * that superseded the predecessor is reflected in the next QR download with no
 * cache to invalidate — which is exactly why the response is `no-store` and why
 * nothing about this image is persisted (`APP12-B04` §21).
 *
 * ### Gated on payability, unlike the read
 *
 * A QR is an instruction to send money. Producing one for an order whose
 * reservation lapsed and whose order is therefore `CANCELLED` (`BR-026`), or
 * for a payment an Admin has already verified, would invite a transfer nobody
 * owes and that nobody would reconcile. So this operation refuses outside the
 * window `isFullPaymentPayable` defines, with the one code that names neither
 * half of the predicate.
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
import { orderSubjectOf } from '../../../customer/domain/grant/grant-subject';
import type { NetworkReadableRequest } from '../../../customer/infrastructure/rate-limit/public-network-key.service';
import { MERCHANT_BANK_CONFIG, type MerchantBankConfig } from '../../config/merchant-bank.config';
import { buildBankTransferQrPayload } from '../../domain/deposit/bank-transfer-qr.payload';
import { fullPaymentError } from '../../domain/full-payment/full-payment.errors';
import { isFullPaymentPayable } from '../../domain/full-payment/full-payment.policy';
import { fullTransferReference } from '../../domain/full-payment/full-payment-reference';
import { BankTransferQrEncoder } from '../../infrastructure/qr/bank-transfer-qr.encoder';
import { PaymentTargetResolver } from './payment-target.resolver';

/** The one obligation kind this surface resolves. `DEPOSIT` is never a fallback. */
const FULL = 'FULL' as const;

export interface DeliverFullPaymentQrCommand {
  readonly token: string;
}

export type FullPaymentQrOutcome =
  | { readonly outcome: 'RENDERED'; readonly png: Buffer }
  | { readonly outcome: 'RATE_LIMITED'; readonly retryAfterSeconds: number };

@Injectable()
export class DeliverFullPaymentQr {
  constructor(
    private readonly links: AuthorizeSecureLink,
    private readonly targets: PaymentTargetResolver,
    private readonly encoder: BankTransferQrEncoder,
    @Inject(MERCHANT_BANK_CONFIG) private readonly bank: MerchantBankConfig,
  ) {}

  async render(
    request: NetworkReadableRequest,
    command: DeliverFullPaymentQrCommand,
  ): Promise<FullPaymentQrOutcome> {
    const admission: SecureLinkAdmission = await this.links.authorize(request, command.token);
    if (admission.outcome === 'RATE_LIMITED') {
      return { outcome: 'RATE_LIMITED', retryAfterSeconds: admission.retryAfterSeconds };
    }

    const target = await this.targets.resolveForOrder(orderSubjectOf(admission.link), FULL);

    if (
      !isFullPaymentPayable({
        orderStatus: target.order.status,
        obligationStatus: target.obligation.status,
      })
    ) {
      throw fullPaymentError('FULL_PAYMENT_NOT_PAYABLE');
    }

    let png: Buffer;
    try {
      png = await this.encoder.encodePng(
        buildBankTransferQrPayload({
          bankBin: this.bank.bankBin,
          accountNumber: this.bank.accountNumber,
          // The obligation's own frozen amount. Nothing here recomposes a total
          // from a subtotal and a fee, and no caller-supplied amount exists to
          // override it.
          amount: target.obligation.amount,
          transferReference: fullTransferReference(target.order.code),
        }),
      );
    } catch {
      // Deliberately swallowed rather than re-thrown: the payload builder's and
      // the encoder's messages describe the merchant configuration, and this
      // response is read by an anonymous browser.
      throw fullPaymentError('FULL_PAYMENT_INSTRUCTIONS_UNAVAILABLE');
    }

    return { outcome: 'RENDERED', png };
  }
}
