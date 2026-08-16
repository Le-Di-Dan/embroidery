/**
 * The answers the two Admin request reads may give (`APP5-B04` §4, §7).
 *
 * A short table, and it stays short because a read has few ways to fail. There
 * is no `REQUEST_NOT_MODERATABLE`, no lifecycle conflict and no state guard
 * here: `APP5-B05` owns every transition, and a refusal code minted in advance
 * of the mutation that raises it is a contract promise nothing keeps.
 *
 * Unlike the public surfaces, the two answers below are allowed to be specific.
 * The caller is an authenticated operator behind `AuthenticatedAdminGuard`, and
 * neither answer names anything they did not already type: no token, no digest,
 * no contact value, no storage key and no customer id.
 */
import { HttpException, HttpStatus } from '@nestjs/common';

export const ADMIN_REQUEST_READ_FAILURES = [
  /** No `custom_requests` row with that id. */
  'REQUEST_NOT_FOUND',
  /** The supplied page cursor is not one this endpoint issued. */
  'REQUEST_CURSOR_INVALID',
] as const;

export type AdminRequestReadFailure = (typeof ADMIN_REQUEST_READ_FAILURES)[number];

export class AdminRequestReadError extends Error {
  readonly failure: AdminRequestReadFailure;

  constructor(failure: AdminRequestReadFailure) {
    super(failure);
    this.name = 'AdminRequestReadError';
    this.failure = failure;
  }
}

export function adminRequestReadError(failure: AdminRequestReadFailure): AdminRequestReadError {
  return new AdminRequestReadError(failure);
}

export function isAdminRequestReadError(error: unknown): error is AdminRequestReadError {
  return error instanceof AdminRequestReadError;
}

/**
 * The published status and message for each failure.
 *
 * An exhaustive `Record` rather than a switch: adding a failure without giving
 * it a status stops compiling, which is the only way a new refusal cannot reach
 * a client as an unmapped 500.
 */
const RESPONSE_OF: Readonly<Record<AdminRequestReadFailure, () => HttpException>> = {
  REQUEST_NOT_FOUND: () =>
    new HttpException(
      { code: 'REQUEST_NOT_FOUND', message: 'No such custom request.' },
      HttpStatus.NOT_FOUND,
    ),
  REQUEST_CURSOR_INVALID: () =>
    new HttpException(
      { code: 'REQUEST_CURSOR_INVALID', message: 'That page cursor is not valid.' },
      HttpStatus.BAD_REQUEST,
    ),
};

/** Runs one controller action, translating this feature's refusals. */
export async function guardedAdminRequestRead<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error: unknown) {
    if (isAdminRequestReadError(error)) {
      throw RESPONSE_OF[error.failure]();
    }
    // Anything else propagates to the platform filter, which sanitises it.
    // Catching more broadly here is how a `PersistenceError` — whose diagnostics
    // name a constraint and can quote a column — would be shaped into a response
    // by this file.
    throw error;
  }
}
