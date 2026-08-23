/**
 * The chain an Admin payment decision must prove before it moves anything
 * (`APP7-B04` §12, §13).
 *
 * ```text
 * lock the attempt                      payment_attempts FOR UPDATE
 * read its obligation in the same tx
 * assert obligation.kind = DEPOSIT
 * assert attempt.method = BANK_TRANSFER
 * read the order the obligation belongs to
 * derive the expected amount, currency and DC reference from those rows
 * ```
 *
 * One resolver, used by both mutations, so the chain is proved identically by
 * each: a review that checked less than a verification would be a second, weaker
 * door into the same rows.
 *
 * ### Every expected fact comes from a row, never from the request
 *
 * The amount is `payment_obligations.amount` — the value frozen at order
 * creation from the accepted quotation version. The currency is that row's own
 * column. The reference is derived from `orders.code` by the one B03 function.
 * `APP7-B04` §12 forbids recomputing the 40 % share, and nothing here can: this
 * file has no percentage, no multiplication and no quotation reader.
 *
 * ### The attempt id is a locator, never authority
 *
 * It addresses a row. Everything that decides what may happen to that row —
 * which obligation it belongs to, which order that obligation belongs to, what
 * is owed — is read from the database inside the transaction, so naming another
 * attempt gets an operator that attempt's facts and no reach into anything else.
 */
import { Inject, Injectable } from '@nestjs/common';
import {
  PAYMENT_OBLIGATION_REPOSITORY,
  type AttemptId,
  type PaymentObligationRepository,
  type VerifiableAttempt,
} from '@embroidery/persistence';

import {
  ORDER_REPOSITORY,
  type OrderId,
  type OrderRepository,
} from '../../../order/domain/repositories/order.repository';
import { depositTransferReference } from '../../domain/deposit/deposit-reference';
import {
  BANK_TRANSFER_METHOD,
  DEPOSIT_OBLIGATION_KIND,
  type ExpectedDepositFacts,
} from '../../domain/verification/payment-verification.policy';
import { paymentVerificationError } from '../../domain/verification/payment-verification.errors';

/** Everything one decision needs, all of it read under the attempt's lock. */
export interface PaymentDecisionChain {
  readonly locked: VerifiableAttempt;
  readonly orderId: string;
  readonly orderCode: string;
  readonly expected: ExpectedDepositFacts;
}

@Injectable()
export class PaymentDecisionChainResolver {
  constructor(
    @Inject(PAYMENT_OBLIGATION_REPOSITORY)
    private readonly obligations: PaymentObligationRepository,
    @Inject(ORDER_REPOSITORY) private readonly orders: OrderRepository,
  ) {}

  /** @requiresTransaction — takes the first of the three row locks. */
  async resolve(attemptId: string): Promise<PaymentDecisionChain> {
    const locked = await this.obligations.lockAttemptForVerification(attemptId as AttemptId);
    if (locked === undefined) {
      throw paymentVerificationError('PAYMENT_ATTEMPT_NOT_FOUND');
    }

    // The obligation is read, not trusted: `fk_payment_attempts__payment_obligation_id`
    // proves the row exists, and only this comparison proves it is a DEPOSIT.
    // Without it a REMAINING attempt — which APP9 will create — would be
    // verifiable by an APP7 route that has no authority over it.
    if (locked.obligation.kind !== DEPOSIT_OBLIGATION_KIND) {
      throw paymentVerificationError('PAYMENT_ATTEMPT_NOT_VERIFIABLE');
    }
    // `APP7-G01` §1: the manual MVP settles bank transfers and nothing else. A
    // `PROVIDER_REDIRECT` attempt is a provider's to confirm, and IMP-O007 is
    // open, so no operator may hand-settle one here.
    if (locked.attempt.method !== BANK_TRANSFER_METHOD) {
      throw paymentVerificationError('PAYMENT_ATTEMPT_NOT_VERIFIABLE');
    }

    const order = await this.orders.findById(locked.obligation.orderId as OrderId);
    if (order === undefined) {
      // Unreachable through `payment_obligations.order_id NOT NULL` and its FK.
      // Reported rather than asserted away: a decision that cannot see the order
      // cannot derive the reference it must match, so it must refuse.
      throw paymentVerificationError('PAYMENT_ORDER_NOT_FOUND');
    }

    return {
      locked,
      orderId: order.id,
      orderCode: order.code,
      expected: {
        amount: locked.obligation.amount,
        currencyCode: locked.obligation.currencyCode,
        transferReference: depositTransferReference(order.code),
      },
    };
  }
}
