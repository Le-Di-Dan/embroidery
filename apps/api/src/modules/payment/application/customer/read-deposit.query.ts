/**
 * The customer's read of the deposit their secure link opens (`APP7-B03` §14).
 *
 * ```text
 * secure link token
 *   → AuthorizeSecureLink                 (APP4-B06: policy, abuse budget, digest)
 *   → ResolvedSecureLink.customRequestId  (the grant row, never the caller)
 *   → the one order of that request        (uq_orders__request)
 *   → its live DEPOSIT obligation
 *   + the fail-fast merchant bank configuration
 *   + the reference derived from the order code
 * ```
 *
 * ### Reading changes nothing
 *
 * No transaction, no lock, no write. No attempt is opened, no obligation is
 * touched, no order is transitioned, no `updated_at` moves and no outbox event
 * is emitted. The grant is not consumed either — ADR-DB3-004 r2 keeps a link
 * multi-use within its validity, so a customer refreshing their payment page
 * must not burn it. The only row APP4's admission writes is its own
 * grant-resolution audit, written because a token was resolved and not because a
 * deposit was read.
 *
 * ### No arithmetic
 *
 * There is no `Number()`, no `parseFloat` and no operator applied to an amount
 * in this file. The deposit amount is the `numeric(14,2)` string the obligation
 * row holds. The 40 % share is **not** recomputed and could not be: this module
 * imports no quotation repository and no deposit policy reader, so
 * `deposit_percent` is unreachable from here. `APP7-G01` §5 makes the obligation
 * the frozen payment authority, and this read consumes exactly that row.
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
import { depositTransferReference } from '../../domain/deposit/deposit-reference';
import { PaymentTargetResolver } from './payment-target.resolver';
import type { CustomerDepositView } from './customer-deposit.view';

/** The one obligation kind this deposit surface resolves (`CST-039`). */
const DEPOSIT = 'DEPOSIT' as const;

/** The whole input. One credential, by design — see the header. */
export interface ReadDepositCommand {
  readonly token: string;
}

/** Either the view, or the rate-limit refusal the controller turns into a 429. */
export type DepositReadOutcome =
  | { readonly outcome: 'READ'; readonly view: CustomerDepositView }
  | { readonly outcome: 'RATE_LIMITED'; readonly retryAfterSeconds: number };

@Injectable()
export class ReadDeposit {
  constructor(
    private readonly links: AuthorizeSecureLink,
    private readonly targets: PaymentTargetResolver,
    @Inject(MERCHANT_BANK_CONFIG) private readonly bank: MerchantBankConfig,
  ) {}

  async read(
    request: NetworkReadableRequest,
    command: ReadDepositCommand,
  ): Promise<DepositReadOutcome> {
    const admission: SecureLinkAdmission = await this.links.authorize(request, command.token);
    if (admission.outcome === 'RATE_LIMITED') {
      return { outcome: 'RATE_LIMITED', retryAfterSeconds: admission.retryAfterSeconds };
    }

    const target = await this.targets.resolve(
      requestSubjectOf(admission.link) as CustomRequestId,
      DEPOSIT,
    );

    return {
      outcome: 'READ',
      view: {
        orderCode: target.order.code,
        orderStatus: target.order.status,
        depositStatus: target.obligation.status,
        // Straight through. The obligation's own amount and its own currency,
        // still strings, never re-derived from an order total or a quotation.
        depositAmount: target.obligation.amount,
        currencyCode: target.obligation.currencyCode,
        bankInstructions: {
          bankBin: this.bank.bankBin,
          bankDisplayName: this.bank.bankDisplayName,
          accountNumber: this.bank.accountNumber,
          accountName: this.bank.accountName,
          transferReference: depositTransferReference(target.order.code),
        },
        accessExpiresAt: admission.link.expiresAt,
      },
    };
  }
}
