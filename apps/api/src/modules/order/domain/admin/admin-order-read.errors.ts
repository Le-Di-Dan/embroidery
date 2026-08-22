/**
 * The answers the two Admin order reads may give (`APP7-B02` §12).
 *
 * Two entries, and it stays at two because B02 is read-only. There is no
 * lifecycle refusal, no payment-verification conflict and no
 * `ORDER_NOT_VERIFIABLE`: `APP7-B04` owns every Admin payment operation, and a
 * refusal code minted before the mutation that raises it is a contract promise
 * nothing keeps.
 *
 * Both answers are safe to be specific about. The caller is an authenticated
 * operator behind `AuthenticatedAdminGuard`, and neither answer names anything
 * they did not already type: no order code they were not given, no customer id,
 * no transfer reference, no storage key and no session secret. Nothing here
 * shapes a `PersistenceError` into a response — a SQLSTATE, a constraint name
 * and a query fragment reach the platform filter, which sanitises them.
 */
import { HttpException, HttpStatus } from '@nestjs/common';

export const ADMIN_ORDER_READ_FAILURES = [
  /** No `orders` row with that id. */
  'ORDER_NOT_FOUND',
  /** The supplied page cursor is not one this endpoint issued. */
  'ORDER_CURSOR_INVALID',
] as const;

export type AdminOrderReadFailure = (typeof ADMIN_ORDER_READ_FAILURES)[number];

export class AdminOrderReadError extends Error {
  readonly failure: AdminOrderReadFailure;

  constructor(failure: AdminOrderReadFailure) {
    super(failure);
    this.name = 'AdminOrderReadError';
    this.failure = failure;
  }
}

export function adminOrderReadError(failure: AdminOrderReadFailure): AdminOrderReadError {
  return new AdminOrderReadError(failure);
}

export function isAdminOrderReadError(error: unknown): error is AdminOrderReadError {
  return error instanceof AdminOrderReadError;
}

/**
 * The published status and message for each failure.
 *
 * An exhaustive `Record` rather than a switch: adding a failure without giving
 * it a status stops compiling, which is the only way a new refusal cannot reach
 * a client as an unmapped 500.
 */
const RESPONSE_OF: Readonly<Record<AdminOrderReadFailure, () => HttpException>> = {
  ORDER_NOT_FOUND: () =>
    new HttpException({ code: 'ORDER_NOT_FOUND', message: 'No such order.' }, HttpStatus.NOT_FOUND),
  ORDER_CURSOR_INVALID: () =>
    new HttpException(
      { code: 'ORDER_CURSOR_INVALID', message: 'That page cursor is not valid.' },
      HttpStatus.BAD_REQUEST,
    ),
};

/** Runs one controller action, translating this feature's refusals. */
export async function guardedAdminOrderRead<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error: unknown) {
    if (isAdminOrderReadError(error)) {
      throw RESPONSE_OF[error.failure]();
    }
    throw error;
  }
}
