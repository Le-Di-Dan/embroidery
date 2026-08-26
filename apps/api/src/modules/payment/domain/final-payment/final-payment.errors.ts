/**
 * The customer final-payment refusals (`APP9-B02` §13).
 *
 * A sibling of `deposit.errors.ts`, not a reuse of it. Every status mapping,
 * every shape and every tone is the delivered one; only the two codes that name
 * the obligation differ, because `DEPOSIT_NOT_PAYABLE` on a final-payment route
 * would tell a customer their *deposit* is settled when what is settled is the
 * balance. `REVERIFICATION_REQUIRED`, `DUPLICATE_OPERATION` and
 * `IDEMPOTENCY_CONFLICT` are the delivered vocabulary verbatim: they describe
 * the caller's situation, not the obligation, so a second spelling of them would
 * be the uncontrolled error family `APP9-B02` §13 forbids.
 *
 * Nothing here answers "does this order exist". Every miss on the access chain —
 * an unusable token, a request with no order, an order with no live `REMAINING`
 * obligation — leaves as the delivered `404 / SECURE_LINK_UNAVAILABLE`, so the
 * refusals below are reachable only by a caller who has already proved
 * possession of a live grant for this request.
 */
import { ConflictException, ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import type { HttpException } from '@nestjs/common';

export const FINAL_PAYMENT_FAILURES = [
  'REVERIFICATION_REQUIRED',
  'FINAL_PAYMENT_NOT_PAYABLE',
  'DUPLICATE_OPERATION',
  'IDEMPOTENCY_CONFLICT',
  'FINAL_PAYMENT_INSTRUCTIONS_UNAVAILABLE',
] as const;

export type FinalPaymentFailure = (typeof FINAL_PAYMENT_FAILURES)[number];

const FINAL_PAYMENT_MESSAGES: Readonly<Record<FinalPaymentFailure, string>> = {
  REVERIFICATION_REQUIRED: 'Please confirm your contact again before paying.',
  // One message for both halves of the predicate. A customer told "your order
  // is not at the final-payment step yet" versus "this balance is already paid"
  // learns the order's internal state from a public route; the read they can
  // make instead carries both states honestly.
  FINAL_PAYMENT_NOT_PAYABLE: 'This final payment is not awaiting payment.',
  DUPLICATE_OPERATION: 'This payment is already being started. Please wait a moment.',
  IDEMPOTENCY_CONFLICT: 'That request key has already been used for a different payment.',
  FINAL_PAYMENT_INSTRUCTIONS_UNAVAILABLE: 'Payment instructions are temporarily unavailable.',
};

export class FinalPaymentError extends Error {
  constructor(readonly failure: FinalPaymentFailure) {
    super(FINAL_PAYMENT_MESSAGES[failure]);
    this.name = 'FinalPaymentError';
  }
}

export function finalPaymentError(failure: FinalPaymentFailure): FinalPaymentError {
  return new FinalPaymentError(failure);
}

export function isFinalPaymentError(error: unknown): error is FinalPaymentError {
  return error instanceof FinalPaymentError;
}

export function toFinalPaymentHttpException(error: FinalPaymentError): HttpException {
  const body = { code: error.failure, message: error.message };
  switch (error.failure) {
    case 'REVERIFICATION_REQUIRED':
      return new ForbiddenException(body);
    case 'FINAL_PAYMENT_INSTRUCTIONS_UNAVAILABLE':
      return new ServiceUnavailableException(body);
    default:
      return new ConflictException(body);
  }
}
