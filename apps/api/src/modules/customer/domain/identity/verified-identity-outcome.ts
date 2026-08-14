/**
 * What verified-identity resolution can produce (`APP4-B02`).
 *
 * Two successes and a closed set of refusals. The refusals matter more than the
 * successes: each one names a situation the model deliberately refuses to
 * resolve automatically, and every one of them is a place where a plausible
 * implementation would silently do the wrong thing instead.
 *
 * Nothing here carries a contact value, a SQLSTATE, a constraint name or a
 * database DETAIL. The error's message **is** its failure code, so a caller that
 * logs or renders the error cannot leak what it does not have.
 */
import type { ContactPointId, CustomerId } from '../repositories/customer.repository';

/** A resolution that changed nothing: the identity already had an owner. */
export const RESOLVED = 'RESOLVED';
/** A resolution that created the customer and its first verified contact. */
export const CREATED = 'CREATED';

export interface VerifiedIdentityResolution {
  readonly outcome: typeof RESOLVED | typeof CREATED;
  readonly customerId: CustomerId;
  /** The active verified contact point that carries this identity. */
  readonly contactPointId: ContactPointId;
}

/** An attachment that changed nothing: this customer already held the contact. */
export const ALREADY_OWNED = 'ALREADY_OWNED';
/** An attachment that added and verified a further contact. */
export const ATTACHED = 'ATTACHED';

export interface VerifiedContactAttachment {
  readonly outcome: typeof ALREADY_OWNED | typeof ATTACHED;
  readonly contactPointId: ContactPointId;
}

export const VERIFIED_IDENTITY_FAILURES = [
  /**
   * CST-005 rejected the write: another transaction verified the same
   * `(kind, normalizedValue)` between this one's lookup and its insert.
   *
   * Not an internal error and not a duplicate to swallow — a genuine race with a
   * real winner. The losing transaction is already doomed at this point, so this
   * failure always travels with a rollback and can never leave a customer row
   * behind (`APP4-B02` §10.5).
   */
  'CONCURRENT_VERIFICATION_LOSS',
  /**
   * The identity is verified and active on a **different** customer.
   *
   * Refused rather than reassigned. Moving an active verified link between
   * customers is contact stealing, and joining the two customers is a merge —
   * `ADR-DB2-001` r8 makes merge an admin-initiated audited operation and r5
   * forbids the automatic path outright.
   */
  'CONTACT_OWNED_BY_ANOTHER_CUSTOMER',
  /**
   * The owning customer is a merge tombstone (`customers.merged_into_customer_id`
   * is set, REL-014).
   *
   * Refused rather than followed. `ADR-DB2-001` says the pointer is followed
   * forward, but *how far* and what happens to the loser's contacts are merge
   * mechanics the ADR defers to G10, which is not implemented — so following it
   * here would be inventing merge behaviour inside a checkpoint that is
   * forbidden to have any. No delivered code can currently produce this state;
   * the guard exists so that when merge arrives, an unmigrated contact fails
   * loudly instead of quietly attaching new submissions to a dead identity.
   */
  'CONTACT_OWNED_BY_MERGED_CUSTOMER',
  /** The caller named a customer that does not exist. */
  'CUSTOMER_NOT_FOUND',
  /** `verifiedSource` was not a bounded evidence reference. */
  'VERIFIED_SOURCE_NOT_ALLOWED',
] as const;

export type VerifiedIdentityFailure = (typeof VERIFIED_IDENTITY_FAILURES)[number];

/**
 * The one error verified-identity resolution raises.
 *
 * The message is the failure code and nothing else. There is no longer
 * explanation available anywhere on this path: everything that would make one
 * richer — the contact value, the constraint name, the driver's DETAIL — is
 * exactly what must not travel.
 */
export class VerifiedIdentityConflictError extends Error {
  readonly failure: VerifiedIdentityFailure;

  constructor(failure: VerifiedIdentityFailure) {
    super(failure);
    this.name = 'VerifiedIdentityConflictError';
    this.failure = failure;
  }
}

export function isVerifiedIdentityConflict(error: unknown): error is VerifiedIdentityConflictError {
  return error instanceof VerifiedIdentityConflictError;
}
