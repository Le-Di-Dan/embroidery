/**
 * The answers the three Admin maintenance mutations may give (`APP10-B01`).
 *
 * A separate table from `admin-support.errors.ts`, and deliberately so. That
 * one is `APP4-B07`'s and belongs to three reads and a grant revocation; its
 * failure union is closed and enumerated by the accepted B07 contract gate.
 * Widening it would make B01's refusals look like B07's, and an operator
 * reading a 409 could not tell whether a grant or a contact was the subject.
 *
 * The distinctions this table draws, and the one it refuses to draw:
 *
 * - **404** — the customer does not exist, or the contact does not exist *for
 *   this customer*. Those last four words are the whole privacy rule below.
 * - **409** — the row exists and is this customer's, but is not in a state the
 *   operation accepts: a merged customer, an unverified or retired contact, a
 *   primary contact somebody is trying to retire, or the last verified channel
 *   the identity model needs.
 *
 * ### A foreign contact is a 404, identical to a missing one
 *
 * {@link CONTACT_NOT_FOUND} is returned for an id that names no row **and** for
 * an id that names another customer's row. An operator holding a contact id
 * from one customer's detail read must not be able to learn, by pointing it at
 * a second customer, that the id is real. Distinguishing the two would make
 * this surface an ownership oracle over ids that are handed out one customer at
 * a time — the same enumeration refusal `ADR-APP4-001` §3 makes for contact
 * values, applied to the identifiers that address them.
 *
 * ### No message names a contact
 *
 * Every message below is a fixed, server-authored string. None interpolates an
 * id, a contact value, a mask, a display name or an operator note, so no
 * refusal can carry PII into a client, a log line or an error tracker.
 */
import { HttpException, HttpStatus } from '@nestjs/common';

export const CUSTOMER_MAINTENANCE_FAILURES = [
  /** No `customers` row with that id. */
  'CUSTOMER_NOT_FOUND',
  /**
   * The customer carries `merged_into_customer_id`.
   *
   * Ordinary maintenance stops at a tombstone. The row is the losing half of a
   * completed merge, kept so history resolves; editing it would record an
   * operator's intent against a record nothing reads any more, and silently
   * redirecting the write to the survivor would be worse — the operator would
   * believe they had edited the customer they addressed.
   */
  'CUSTOMER_MERGED',
  /** No contact with that id belongs to this customer. See the file header. */
  'CONTACT_NOT_FOUND',
  /**
   * The contact is this customer's, but has never completed a verification
   * challenge.
   *
   * Promotion would make an unproven channel the default destination for the
   * customer's notifications. B01 mints no verification evidence, so the way
   * out is the verification flow (LC-02), not this endpoint.
   */
  'CONTACT_NOT_VERIFIED',
  /** The contact is already deactivated, so there is nothing to promote. */
  'CONTACT_NOT_ACTIVE',
  /**
   * The contact is the current primary, and retiring it would leave the
   * customer with no default destination.
   *
   * Not resolved by silently promoting another: which channel becomes primary
   * is an operator decision with consequences for every later notification, and
   * B01 makes them state it through the promotion operation first.
   */
  'CONTACT_IS_PRIMARY',
  /**
   * The contact is the customer's last active verified one.
   *
   * A customer exists *because* a verified contact was proven (ADR-DB2-001 r5).
   * Retiring the last one would leave an identity with nothing that established
   * it and nothing to reach it by — a state the model does not describe.
   */
  'CONTACT_IS_LAST_VERIFIED',
] as const;

export type CustomerMaintenanceFailure = (typeof CUSTOMER_MAINTENANCE_FAILURES)[number];

/**
 * A maintenance refusal.
 *
 * Thrown rather than returned: every one of these paths is decided before or
 * inside the transaction that would have written, so unwinding leaves the row
 * exactly as it was and there is no evidence to commit.
 */
export class CustomerMaintenanceError extends Error {
  readonly failure: CustomerMaintenanceFailure;

  constructor(failure: CustomerMaintenanceFailure) {
    super(failure);
    this.name = 'CustomerMaintenanceError';
    this.failure = failure;
  }
}

export function isCustomerMaintenanceError(error: unknown): error is CustomerMaintenanceError {
  return error instanceof CustomerMaintenanceError;
}

/**
 * The published status and message for each failure.
 *
 * An exhaustive `Record` rather than a switch: adding a failure to the union
 * without giving it a status stops compiling, which is the only way a new
 * refusal cannot reach a client as an unmapped 500.
 */
const RESPONSE_OF: Readonly<Record<CustomerMaintenanceFailure, () => HttpException>> = {
  CUSTOMER_NOT_FOUND: () =>
    new HttpException({ message: 'No such customer.' }, HttpStatus.NOT_FOUND),
  CUSTOMER_MERGED: () =>
    new HttpException(
      { message: 'That customer has been merged into another and can no longer be maintained.' },
      HttpStatus.CONFLICT,
    ),
  // Phrased about this customer, not about the id: "no such contact" would be
  // read as a claim the id names nothing anywhere, which is exactly the fact
  // this operation refuses to confirm or deny.
  CONTACT_NOT_FOUND: () =>
    new HttpException({ message: 'This customer has no such contact.' }, HttpStatus.NOT_FOUND),
  CONTACT_NOT_VERIFIED: () =>
    new HttpException(
      { message: 'That contact is not verified, so it cannot become the primary contact.' },
      HttpStatus.CONFLICT,
    ),
  CONTACT_NOT_ACTIVE: () =>
    new HttpException(
      { message: 'That contact is deactivated, so it cannot become the primary contact.' },
      HttpStatus.CONFLICT,
    ),
  CONTACT_IS_PRIMARY: () =>
    new HttpException(
      {
        message:
          'That contact is the primary contact. Promote another verified contact first, ' +
          'then deactivate this one.',
      },
      HttpStatus.CONFLICT,
    ),
  CONTACT_IS_LAST_VERIFIED: () =>
    new HttpException(
      { message: 'That is the customer’s last verified contact and cannot be deactivated.' },
      HttpStatus.CONFLICT,
    ),
};

export function customerMaintenanceFailureResponse(
  failure: CustomerMaintenanceFailure,
): HttpException {
  return RESPONSE_OF[failure]();
}

/** Runs one controller action, translating this feature's refusals. */
export async function guardedCustomerMaintenance<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error: unknown) {
    if (isCustomerMaintenanceError(error)) {
      throw customerMaintenanceFailureResponse(error.failure);
    }
    // Anything else propagates to the platform filter, which sanitises it.
    // Catching more broadly here is how a `PersistenceError` — whose diagnostics
    // name a constraint and can quote a column — would be shaped into a
    // response by this file.
    throw error;
  }
}
