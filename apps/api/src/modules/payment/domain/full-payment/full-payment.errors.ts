/**
 * The customer full-payment refusals (`APP12-B04` §14, §25).
 *
 * A sibling of `deposit.errors.ts` and `final-payment.errors.ts`, not a reuse of
 * either. Every status mapping, every shape and every tone is the delivered one;
 * only the two codes that name the obligation differ, because
 * `FINAL_PAYMENT_NOT_PAYABLE` on a Ready-Made route would tell a customer their
 * *balance* is settled when a Ready-Made order has no balance and no deposit.
 * `REVERIFICATION_REQUIRED`, `DUPLICATE_OPERATION` and `IDEMPOTENCY_CONFLICT`
 * are the delivered vocabulary verbatim: they describe the caller's situation
 * rather than the obligation, so a third spelling of them would be the
 * uncontrolled error family `APP9-B02` §13 forbids.
 *
 * Nothing here answers "does this order exist". Every miss on the access chain
 * leaves as the delivered `404 / SECURE_LINK_UNAVAILABLE`: an unusable token, a
 * token for another order, an order with no live `FULL` obligation — which
 * includes both a Ready-Made order whose shipping fee has not been set (there is
 * genuinely no obligation yet, `APP12-B04` §14) and one whose obligation a fee
 * correction superseded. So the refusals below are reachable only by a caller
 * who has already proved possession of a live `ORDER_ACCESS` grant for this
 * order.
 */
import { ConflictException, ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import type { HttpException } from '@nestjs/common';

export const FULL_PAYMENT_FAILURES = [
  'REVERIFICATION_REQUIRED',
  'FULL_PAYMENT_NOT_PAYABLE',
  'DUPLICATE_OPERATION',
  'IDEMPOTENCY_CONFLICT',
  'FULL_PAYMENT_INSTRUCTIONS_UNAVAILABLE',
] as const;

export type FullPaymentFailure = (typeof FULL_PAYMENT_FAILURES)[number];

const FULL_PAYMENT_MESSAGES: Readonly<Record<FullPaymentFailure, string>> = {
  REVERIFICATION_REQUIRED: 'Please confirm your contact again before paying.',
  // One message for both halves of the predicate. A customer told "your order
  // has been cancelled" versus "this payment is already settled" learns the
  // order's internal state from a public route; the read they can make instead
  // carries both states honestly.
  FULL_PAYMENT_NOT_PAYABLE: 'This order is not awaiting payment.',
  DUPLICATE_OPERATION: 'This payment is already being started. Please wait a moment.',
  IDEMPOTENCY_CONFLICT: 'That request key has already been used for a different payment.',
  FULL_PAYMENT_INSTRUCTIONS_UNAVAILABLE: 'Payment instructions are temporarily unavailable.',
};

export class FullPaymentError extends Error {
  constructor(readonly failure: FullPaymentFailure) {
    super(FULL_PAYMENT_MESSAGES[failure]);
    this.name = 'FullPaymentError';
  }
}

export function fullPaymentError(failure: FullPaymentFailure): FullPaymentError {
  return new FullPaymentError(failure);
}

export function isFullPaymentError(error: unknown): error is FullPaymentError {
  return error instanceof FullPaymentError;
}

export function toFullPaymentHttpException(error: FullPaymentError): HttpException {
  const body = { code: error.failure, message: error.message };
  switch (error.failure) {
    case 'REVERIFICATION_REQUIRED':
      return new ForbiddenException(body);
    case 'FULL_PAYMENT_INSTRUCTIONS_UNAVAILABLE':
      return new ServiceUnavailableException(body);
    default:
      return new ConflictException(body);
  }
}
