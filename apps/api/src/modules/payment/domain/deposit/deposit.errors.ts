/**
 * The closed public vocabulary of the customer deposit surface (`APP7-B03` §27).
 *
 * ### What is folded into `SECURE_LINK_UNAVAILABLE`, and why
 *
 * Every reason the caller could not be bound to a deposit — an unknown, expired,
 * revoked, superseded or wrong-scope token, a request with no order, an order
 * with no live DEPOSIT obligation, a request row that has vanished — leaves this
 * surface as the delivered `404 / SECURE_LINK_UNAVAILABLE`, identical in status,
 * code, message and shape. That answer is produced by `secure-link.errors.ts`
 * and is not restated here.
 *
 * A caller therefore cannot distinguish a foreign order from an unknown one,
 * from an invalid grant, from an expired grant — which is the non-enumeration
 * property `APP4-B06` established and every APP5/APP6 customer surface has kept.
 *
 * ### What is deliberately **not** folded in
 *
 * The four codes below are only reachable after the caller has already proved
 * possession of a live grant for this request, so none of them discloses
 * anything a probe did not already hold — and collapsing them would leave the
 * customer's screen with no way to tell "confirm your contact again" from "this
 * deposit is already settled" from "your payment is already starting". They
 * follow `quotation-decision.errors.ts` exactly, for exactly that reason.
 *
 * `DEPOSIT_INSTRUCTIONS_UNAVAILABLE` is a **503** and not a validation refusal:
 * a deployment whose merchant account is unusable has not been handed a bad
 * request, and telling the customer their input was wrong would be false. Its
 * message names no variable, no value and no internal detail.
 */
import { ConflictException, ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import type { HttpException } from '@nestjs/common';

export const DEPOSIT_FAILURES = [
  /** GRD-003: the link is live, but no recent step-up stands for this customer. */
  'REVERIFICATION_REQUIRED',
  /** The DEPOSIT obligation is no longer payable — already satisfied, or cancelled. */
  'DEPOSIT_NOT_PAYABLE',
  /** Another initiation with this key is still in flight. */
  'DUPLICATE_OPERATION',
  /** This idempotency key was already spent on a different initiation. */
  'IDEMPOTENCY_CONFLICT',
  /** The merchant bank account, or the QR encoder, is not usable right now. */
  'DEPOSIT_INSTRUCTIONS_UNAVAILABLE',
] as const;

export type DepositFailure = (typeof DEPOSIT_FAILURES)[number];

/**
 * The published messages.
 *
 * None interpolates an amount, an order code, a reference, an obligation state,
 * an environment variable name or a constraint name.
 */
const DEPOSIT_MESSAGES: Readonly<Record<DepositFailure, string>> = {
  REVERIFICATION_REQUIRED: 'Please confirm your contact again before paying.',
  DEPOSIT_NOT_PAYABLE: 'This deposit is not awaiting payment.',
  DUPLICATE_OPERATION: 'This payment is already being started. Please wait a moment.',
  IDEMPOTENCY_CONFLICT: 'That request key has already been used for a different payment.',
  DEPOSIT_INSTRUCTIONS_UNAVAILABLE: 'Payment instructions are temporarily unavailable.',
};

export class DepositError extends Error {
  constructor(readonly failure: DepositFailure) {
    super(DEPOSIT_MESSAGES[failure]);
    this.name = 'DepositError';
  }
}

export function depositError(failure: DepositFailure): DepositError {
  return new DepositError(failure);
}

export function isDepositError(error: unknown): error is DepositError {
  return error instanceof DepositError;
}

/** Maps the transport-free domain error onto its HTTP exception. */
export function toDepositHttpException(error: DepositError): HttpException {
  const body = { code: error.failure, message: error.message };
  switch (error.failure) {
    case 'REVERIFICATION_REQUIRED':
      return new ForbiddenException(body);
    case 'DEPOSIT_INSTRUCTIONS_UNAVAILABLE':
      return new ServiceUnavailableException(body);
    default:
      return new ConflictException(body);
  }
}
