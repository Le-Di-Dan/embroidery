/**
 * The dynamic bank-transfer QR (`APP7-B03` §16, §19, §20).
 *
 * ```text
 * secure link token
 *   → AuthorizeSecureLink                 (APP4-B06: policy, abuse budget, digest)
 *   → the one order of that grant's request, and its live DEPOSIT obligation
 *   → EMVCo/NAPAS payload  = merchant BIN + merchant account
 *                          + the obligation's exact amount
 *                          + the derived DC reference
 *   → PNG bytes
 * ```
 *
 * ### Zero-write, and structurally so
 *
 * Nothing here opens a transaction, and this module holds no `TransactionManager`
 * to open one with. No QR bytes, object, asset, derivative or storage key is
 * persisted; no Asset row is created; object storage is not reached. No
 * `updated_at` moves because the QR was viewed, no obligation or attempt state
 * changes, no reconciliation row appears and no outbox event is emitted. The
 * image is regenerated from the same immutable inputs on every request, which is
 * why persisting it would only create a second thing to keep in sync.
 *
 * ### The QR carries instructions and nothing else
 *
 * No application URL, no grant or payment token, no attempt id, no attempt
 * secret, no evidence link, no provider checkout session and no customer-editable
 * input. `bank-transfer-qr.payload.ts` writes every field explicitly, so there is
 * nowhere for one to be added by accident.
 *
 * ### A failure to encode is a 503, not a refusal of the customer
 *
 * A merchant account that cannot produce a payload, or an encoder that fails, is
 * a deployment fault. Answering it as a validation error would tell the customer
 * their request was wrong; answering it with the encoder's own message would
 * disclose configuration internals. It becomes one
 * `DEPOSIT_INSTRUCTIONS_UNAVAILABLE`.
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
import { buildBankTransferQrPayload } from '../../domain/deposit/bank-transfer-qr.payload';
import { depositTransferReference } from '../../domain/deposit/deposit-reference';
import { depositError } from '../../domain/deposit/deposit.errors';
import { BankTransferQrEncoder } from '../../infrastructure/qr/bank-transfer-qr.encoder';
import { PaymentTargetResolver } from './payment-target.resolver';

/** The one obligation kind this deposit surface resolves (`CST-039`). */
const DEPOSIT = 'DEPOSIT' as const;

/** The whole input. One credential — the QR names no attempt and no order. */
export interface DeliverDepositQrCommand {
  readonly token: string;
}

export type DepositQrOutcome =
  | { readonly outcome: 'RENDERED'; readonly png: Buffer }
  | { readonly outcome: 'RATE_LIMITED'; readonly retryAfterSeconds: number };

@Injectable()
export class DeliverDepositQr {
  constructor(
    private readonly links: AuthorizeSecureLink,
    private readonly targets: PaymentTargetResolver,
    private readonly encoder: BankTransferQrEncoder,
    @Inject(MERCHANT_BANK_CONFIG) private readonly bank: MerchantBankConfig,
  ) {}

  async render(
    request: NetworkReadableRequest,
    command: DeliverDepositQrCommand,
  ): Promise<DepositQrOutcome> {
    const admission: SecureLinkAdmission = await this.links.authorize(request, command.token);
    if (admission.outcome === 'RATE_LIMITED') {
      return { outcome: 'RATE_LIMITED', retryAfterSeconds: admission.retryAfterSeconds };
    }

    const target = await this.targets.resolve(
      requestSubjectOf(admission.link) as CustomRequestId,
      DEPOSIT,
    );

    let png: Buffer;
    try {
      png = await this.encoder.encodePng(
        buildBankTransferQrPayload({
          bankBin: this.bank.bankBin,
          accountNumber: this.bank.accountNumber,
          // The obligation's own frozen amount. Nothing here recomputes a share
          // of a total, and no caller-supplied amount exists to override it.
          amount: target.obligation.amount,
          transferReference: depositTransferReference(target.order.code),
        }),
      );
    } catch {
      // Deliberately swallowed rather than re-thrown: the payload builder's and
      // the encoder's messages describe the merchant configuration, and this
      // response is read by an anonymous browser.
      throw depositError('DEPOSIT_INSTRUCTIONS_UNAVAILABLE');
    }

    return { outcome: 'RENDERED', png };
  }
}
