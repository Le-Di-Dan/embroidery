/**
 * The closed vocabulary of the three Admin payment operations (`APP7-B04` §7,
 * §12, §21).
 *
 * Every caller is an authenticated operator behind `AuthenticatedAdminGuard`, so
 * — unlike the customer deposit surface, whose refusals all collapse into one
 * non-enumerating `SECURE_LINK_UNAVAILABLE` — these answers are allowed to be
 * specific. An operator who cannot tell "already verified" from "this deposit is
 * settled by another attempt" from "that attempt is not a bank transfer" has no
 * way to act, and none of these codes names anything they did not already hold:
 * no customer id, no contact, no merchant account, no storage key, no token.
 *
 * Nothing here shapes a `PersistenceError` into a response. A SQLSTATE, a
 * constraint name or a query fragment travels to the platform filter, which
 * sanitises it — and a guard code this file did not anticipate must surface as a
 * fault rather than as a polite refusal that hides it.
 *
 * ### `REQUIRES_REVIEW` is not in this list, deliberately
 *
 * A wrong amount or a wrong reference is a **successful** operation with a
 * committed outcome (`APP7-B04` §18): the attempt moves to `REQUIRES_REVIEW`,
 * the reconciliation is appended and the operator is told what happened in the
 * response body. Mapping it to a `409` here would discard the durable review the
 * accepted lifecycle requires and leave the contradiction recorded nowhere.
 */
import {
  ConflictException,
  HttpException,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';

export const PAYMENT_VERIFICATION_FAILURES = [
  /** No `payment_attempts` row with that id. */
  'PAYMENT_ATTEMPT_NOT_FOUND',
  /** No `orders` row behind the attempt's obligation — a broken chain, not a refusal. */
  'PAYMENT_ORDER_NOT_FOUND',
  /**
   * The attempt exists but is outside this operation's authority: it is not a
   * `BANK_TRANSFER`, or its obligation is not the `DEPOSIT` one. `APP7-B04`
   * collects both under one code because both mean the same thing to an
   * operator — this is not an attempt B04 verifies.
   */
  'PAYMENT_ATTEMPT_NOT_VERIFIABLE',
  /** Terminal already (`SUCCEEDED`, `FAILED`, `EXPIRED`, refunded). LC-16 never regresses. */
  'PAYMENT_ATTEMPT_ALREADY_SETTLED',
  /** The DEPOSIT is `SATISFIED` or `CANCELLED` — a different attempt won, or it is void. */
  'DEPOSIT_NOT_PAYABLE',
] as const;

export type PaymentVerificationFailure = (typeof PAYMENT_VERIFICATION_FAILURES)[number];

/**
 * The published status and message for each failure.
 *
 * An exhaustive `Record` rather than a switch: a failure added without a status
 * stops compiling, which is the only way a new refusal cannot reach a client as
 * an unmapped 500. No message interpolates an amount, a reference, an order
 * code, an id or a constraint name.
 */
const RESPONSE_OF: Readonly<Record<PaymentVerificationFailure, () => HttpException>> = {
  PAYMENT_ATTEMPT_NOT_FOUND: () =>
    new NotFoundException({
      code: 'PAYMENT_ATTEMPT_NOT_FOUND',
      message: 'No such payment attempt.',
    }),
  PAYMENT_ORDER_NOT_FOUND: () =>
    new NotFoundException({
      code: 'PAYMENT_ORDER_NOT_FOUND',
      message: 'No such order.',
    }),
  PAYMENT_ATTEMPT_NOT_VERIFIABLE: () =>
    new ConflictException({
      code: 'PAYMENT_ATTEMPT_NOT_VERIFIABLE',
      message: 'That payment attempt is not a deposit bank transfer.',
    }),
  PAYMENT_ATTEMPT_ALREADY_SETTLED: () =>
    new ConflictException({
      code: 'PAYMENT_ATTEMPT_ALREADY_SETTLED',
      message: 'That payment attempt has already been settled.',
    }),
  DEPOSIT_NOT_PAYABLE: () =>
    new ConflictException({
      code: 'DEPOSIT_NOT_PAYABLE',
      message: 'This deposit is no longer awaiting payment.',
    }),
};

export class PaymentVerificationError extends Error {
  readonly failure: PaymentVerificationFailure;

  constructor(failure: PaymentVerificationFailure) {
    super(failure);
    this.name = 'PaymentVerificationError';
    this.failure = failure;
  }
}

export function paymentVerificationError(
  failure: PaymentVerificationFailure,
): PaymentVerificationError {
  return new PaymentVerificationError(failure);
}

export function isPaymentVerificationError(error: unknown): error is PaymentVerificationError {
  return error instanceof PaymentVerificationError;
}

/** Runs one controller action, translating this feature's refusals. */
export async function guardedPaymentVerification<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error: unknown) {
    if (isPaymentVerificationError(error)) {
      throw RESPONSE_OF[error.failure]();
    }
    throw error;
  }
}

/** The Admin payment read's own refusal. One entry, because the read is total. */
export class AdminPaymentReadError extends Error {
  constructor() {
    super('ORDER_NOT_FOUND');
    this.name = 'AdminPaymentReadError';
  }
}

export function isAdminPaymentReadError(error: unknown): error is AdminPaymentReadError {
  return error instanceof AdminPaymentReadError;
}

/** Runs the Admin payment read, translating its one refusal. */
export async function guardedAdminPaymentRead<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error: unknown) {
    if (isAdminPaymentReadError(error)) {
      throw new HttpException(
        { code: 'ORDER_NOT_FOUND', message: 'No such order.' },
        HttpStatus.NOT_FOUND,
      );
    }
    throw error;
  }
}
