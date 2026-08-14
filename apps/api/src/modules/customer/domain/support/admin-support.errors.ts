/**
 * The answers the three Admin support operations may give (`APP4-B07`).
 *
 * A separate table from `verification-attempt-http.errors.ts` and
 * `secure-link.errors.ts`, and the reason is the *audience*, not the module.
 * Both of those exist to make every refusal look identical to an anonymous
 * caller — a secure link that is unknown, expired, revoked or for someone else
 * answers with one 404 precisely so a token cannot be probed. That rule does not
 * apply here and must not be copied here: the caller is an authenticated
 * operator whose job is to find out *why* a link stopped working, and a support
 * screen that answered "unavailable" to everything would be useless.
 *
 * So this table distinguishes exactly what an operator needs and nothing more:
 *
 * - **404** — no such Customer, or no such grant. There is no id to act on.
 * - **409** — the grant exists but is not in a state this transition accepts.
 *   LC-03 has no `REVOKED → REVOKED` edge and no `EXPIRED → REVOKED` edge, so a
 *   second revoke is a conflict with the current state, not a bad request and
 *   not a silent success.
 *
 * The distinction is safe because it is drawn behind `AuthenticatedAdminGuard`
 * and because neither answer names anything an operator did not already type: no
 * token, no digest, no contact value, no customer id, no revoke reason.
 */
import { HttpException, HttpStatus } from '@nestjs/common';

export const ADMIN_SUPPORT_FAILURES = [
  /** No `customers` row with that id. */
  'CUSTOMER_NOT_FOUND',
  /** No `secure_access_grants` row with that id. */
  'GRANT_NOT_FOUND',
  /**
   * The grant exists but is not `ACTIVE`, so `TR-LC03-02` does not apply.
   *
   * Named for the *transition*, not the state, because two different states
   * reach it — already `REVOKED`, and swept to `EXPIRED` — and an operator's
   * next step is the same for both: there is nothing left to kill.
   */
  'GRANT_NOT_REVOCABLE',
] as const;

export type AdminSupportFailure = (typeof ADMIN_SUPPORT_FAILURES)[number];

/**
 * A support refusal.
 *
 * Thrown rather than returned, following `SecureGrantError` for the reason that
 * file records: none of these paths has evidence to commit. A read that found
 * nothing wrote nothing, and a refused revoke left the row exactly as it was, so
 * unwinding is the correct effect.
 */
export class AdminSupportError extends Error {
  readonly failure: AdminSupportFailure;

  constructor(failure: AdminSupportFailure) {
    super(failure);
    this.name = 'AdminSupportError';
    this.failure = failure;
  }
}

export function isAdminSupportError(error: unknown): error is AdminSupportError {
  return error instanceof AdminSupportError;
}

/**
 * The published status and message for each failure.
 *
 * An exhaustive `Record` rather than a switch: adding a failure to the union
 * without giving it a status stops compiling, which is the only way a new
 * refusal cannot reach a client as an unmapped 500.
 */
const RESPONSE_OF: Readonly<Record<AdminSupportFailure, () => HttpException>> = {
  CUSTOMER_NOT_FOUND: () =>
    new HttpException({ message: 'No such customer.' }, HttpStatus.NOT_FOUND),
  GRANT_NOT_FOUND: () =>
    new HttpException({ message: 'No such secure grant.' }, HttpStatus.NOT_FOUND),
  GRANT_NOT_REVOCABLE: () =>
    new HttpException(
      { message: 'That secure grant is no longer active and cannot be revoked.' },
      HttpStatus.CONFLICT,
    ),
};

export function adminSupportFailureResponse(failure: AdminSupportFailure): HttpException {
  return RESPONSE_OF[failure]();
}

/** Runs one controller action, translating this feature's refusals. */
export async function guardedAdminSupportOperation<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error: unknown) {
    if (isAdminSupportError(error)) {
      throw adminSupportFailureResponse(error.failure);
    }
    // Anything else propagates to the platform filter, which sanitises it.
    // Catching more broadly here is how a `PersistenceError` — whose diagnostics
    // name a constraint and can quote a column — would be shaped into a response
    // by this file.
    throw error;
  }
}
