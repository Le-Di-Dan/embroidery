/**
 * The answers the three merge lifecycle operations may give (`APP10-B02`).
 *
 * A separate table from `customer-maintenance.errors.ts` and from
 * `admin-support.errors.ts`, on the rule B01 recorded: each closed failure union
 * belongs to one accepted contract, and widening a neighbour's would make a
 * merge refusal indistinguishable from a contact refusal in an operator's
 * client.
 *
 * The distinctions this table draws:
 *
 * - **404** — the case does not exist, or one of the two customers does not.
 *   Both participants are ids the operator obtained from the exact-contact
 *   resolver, so an unknown one is a stale id, not a discovery.
 * - **409** — every row exists, but the pair or the case is not in a state the
 *   operation accepts: a participant already tombstoned by an earlier merge, an
 *   open case for the same pair, or a case that is no longer `REQUESTED`.
 *
 * ### Survivor and loser are refused separately
 *
 * {@link CustomerMergeFailure} carries `SURVIVOR_NOT_FOUND` and
 * `LOSER_NOT_FOUND` as two failures, not one, and likewise the two merged
 * refusals. The operator picked which identity survives, and a single "one of
 * these is wrong" would send them back to re-resolve both contacts. This is not
 * an enumeration risk: reaching this code needs an authenticated Admin session
 * **and** two ids that only the exact-contact resolver hands out, and that
 * resolver already refuses to distinguish an unknown contact from an unverified
 * one.
 *
 * ### No message names a customer
 *
 * Every message is a fixed, server-authored string. None interpolates an id, a
 * contact value, a mask, a display name or the operator's reason, so no refusal
 * can carry PII into a client, a log line or an error tracker.
 */
import { HttpException, HttpStatus } from '@nestjs/common';

export const CUSTOMER_MERGE_FAILURES = [
  /** No `customers` row for the chosen survivor. */
  'SURVIVOR_NOT_FOUND',
  /** No `customers` row for the chosen loser. */
  'LOSER_NOT_FOUND',
  /**
   * The survivor already carries `merged_into_customer_id`.
   *
   * A tombstone is the losing half of a completed merge. Merging *into* one
   * would make this case's survivor a record nothing resolves through, and
   * following the pointer to its own survivor instead would silently merge a
   * pair the operator never chose. Neither happens — `APP10-B02` §6.2 forbids
   * both — and the operator re-resolves the surviving identity explicitly.
   */
  'SURVIVOR_ALREADY_MERGED',
  /** The loser already carries `merged_into_customer_id`. Same rule, same reason. */
  'LOSER_ALREADY_MERGED',
  /**
   * A `REQUESTED` case already exists for this ordered pair.
   *
   * CST-010's partial unique is the arbiter. The use case also reads first, so
   * the ordinary case is a clean refusal rather than a caught driver error, but
   * the index is what makes two simultaneous requests unable to both succeed.
   */
  'MERGE_CASE_ALREADY_OPEN',
  /** No `customer_merge_cases` row with that id. */
  'MERGE_CASE_NOT_FOUND',
  /**
   * The case is no longer `REQUESTED`, so it cannot be rejected.
   *
   * Deliberately **not** idempotent. `adminSecureGrant_revoke` set the
   * precedent — revoking an already-revoked grant is a conflict — and merge has
   * a stronger reason to follow it: a rejection carries a mandatory operator
   * reason and the schema has no idempotency key, so a replay is
   * indistinguishable from a second operator deciding the same case. Answering
   * 204 would silently discard the second reason; 409 says the decision was
   * already made.
   */
  'MERGE_CASE_NOT_REQUESTED',
] as const;

export type CustomerMergeFailure = (typeof CUSTOMER_MERGE_FAILURES)[number];

/**
 * A merge lifecycle refusal.
 *
 * Thrown rather than returned: every path is decided before or inside the
 * transaction that would have written, so unwinding leaves both customers and
 * the case table exactly as they were.
 */
export class CustomerMergeError extends Error {
  readonly failure: CustomerMergeFailure;

  constructor(failure: CustomerMergeFailure) {
    super(failure);
    this.name = 'CustomerMergeError';
    this.failure = failure;
  }
}

export function isCustomerMergeError(error: unknown): error is CustomerMergeError {
  return error instanceof CustomerMergeError;
}

/**
 * The published status and message for each failure.
 *
 * An exhaustive `Record` rather than a switch: a failure added to the union
 * without a status stops compiling, which is the only way a new refusal cannot
 * reach a client as an unmapped 500.
 */
const RESPONSE_OF: Readonly<Record<CustomerMergeFailure, () => HttpException>> = {
  SURVIVOR_NOT_FOUND: () =>
    new HttpException({ message: 'No such surviving customer.' }, HttpStatus.NOT_FOUND),
  LOSER_NOT_FOUND: () =>
    new HttpException({ message: 'No such merged-away customer.' }, HttpStatus.NOT_FOUND),
  SURVIVOR_ALREADY_MERGED: () =>
    new HttpException(
      {
        message:
          'The surviving customer has already been merged into another and cannot survive a ' +
          'second merge. Resolve the current identity and open the case against it.',
      },
      HttpStatus.CONFLICT,
    ),
  LOSER_ALREADY_MERGED: () =>
    new HttpException(
      { message: 'That customer has already been merged into another.' },
      HttpStatus.CONFLICT,
    ),
  MERGE_CASE_ALREADY_OPEN: () =>
    new HttpException(
      { message: 'A merge case is already open for this pair of customers.' },
      HttpStatus.CONFLICT,
    ),
  MERGE_CASE_NOT_FOUND: () =>
    new HttpException({ message: 'No such merge case.' }, HttpStatus.NOT_FOUND),
  MERGE_CASE_NOT_REQUESTED: () =>
    new HttpException(
      { message: 'That merge case has already been decided and can no longer be rejected.' },
      HttpStatus.CONFLICT,
    ),
};

export function customerMergeFailureResponse(failure: CustomerMergeFailure): HttpException {
  return RESPONSE_OF[failure]();
}

/** Runs one controller action, translating this feature's refusals. */
export async function guardedCustomerMerge<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error: unknown) {
    if (isCustomerMergeError(error)) {
      throw customerMergeFailureResponse(error.failure);
    }
    // Anything else propagates to the platform filter, which sanitises it. A
    // `PersistenceError` reaching here would otherwise be shaped by this file
    // into a response, and its diagnostics name a constraint.
    throw error;
  }
}
