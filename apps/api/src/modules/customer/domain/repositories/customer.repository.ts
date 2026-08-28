/**
 * AGG-02 Customer persistence contract (TBL-004, TBL-005, TBL-078).
 *
 * A Customer exists only from a *verified* contact (ADR-DB2-001 r5,
 * BR-014/GRD-001): there is no "create an unverified customer" method, because
 * that state is not one the model allows.
 */
import type { ContactKind } from '@embroidery/database';

export type CustomerId = string & { readonly __brand: 'CustomerId' };
export type ContactPointId = string & { readonly __brand: 'ContactPointId' };

export interface Customer {
  readonly id: CustomerId;
  readonly displayName: string | undefined;
  /**
   * The operator's internal note on this Customer (`APP10-B01`).
   *
   * Staff-authored and staff-facing: it is never shown to the Customer, never
   * notified and never part of a public or secure-link projection. It reaches
   * the domain because B01 maintains it, and a field an operator may write but
   * never read back is not maintainable.
   */
  readonly notes: string | undefined;
  readonly verifiedAt: Date;
  readonly mergedIntoCustomerId: CustomerId | undefined;
  readonly anonymizedAt: Date | undefined;
}

export interface ContactPoint {
  readonly id: ContactPointId;
  readonly customerId: CustomerId;
  readonly contactKind: ContactKind;
  /** The comparison form. The unique arbiter is on this, not the display form. */
  readonly normalizedValue: string;
  readonly displayValue: string;
  readonly isPrimary: boolean;
  readonly verifiedAt: Date | undefined;
  readonly deactivatedAt: Date | undefined;
}

export interface CreateVerifiedCustomerInput {
  readonly id: CustomerId;
  readonly displayName?: string | undefined;
  readonly contact: {
    readonly id: ContactPointId;
    readonly contactKind: ContactKind;
    readonly normalizedValue: string;
    readonly displayValue: string;
    readonly verifiedSource: string;
  };
  readonly verifiedAt: Date;
}

export interface AddContactPointInput {
  readonly id: ContactPointId;
  readonly customerId: CustomerId;
  readonly contactKind: ContactKind;
  readonly normalizedValue: string;
  readonly displayValue: string;
}

export interface UpsertBusinessProfileInput {
  readonly customerId: CustomerId;
  readonly companyName: string;
  readonly taxCode?: string | undefined;
  readonly billingContact?: string | undefined;
}

/**
 * The bounded profile patch (`APP10-B01`).
 *
 * Two fields, and the absences are the contract. `verified_at` is NOT NULL and
 * immutable (ADR-DB2-001 option A), `merged_into_customer_id` belongs to the
 * merge execution checkpoint and `anonymized_at` to retention — none of the
 * three has a member here to be written through.
 *
 * A field is present to change it and absent to leave it alone; `null` clears
 * the column. "Unchanged" and "cleared" are therefore different inputs, not the
 * same one read two ways.
 */
export interface UpdateCustomerProfileInput {
  readonly displayName?: string | null;
  readonly notes?: string | null;
}

export const CUSTOMER_REPOSITORY = Symbol('CUSTOMER_REPOSITORY');

export interface CustomerRepository {
  /**
   * Creates the customer and its first, already-verified contact together.
   *
   * @requiresTransaction — two tables; a customer with no contact is not a
   * state the model permits, so they must land or fail as one.
   */
  createWithVerifiedContact(input: CreateVerifiedCustomerInput): Promise<Customer>;

  /** @requiresTransaction */
  addContactPoint(input: AddContactPointInput): Promise<ContactPoint>;

  /**
   * Marks a contact verified, which is when the `(kind, value)` uniqueness
   * arbiter starts applying to it.
   *
   * @requiresTransaction
   */
  markContactVerified(
    id: ContactPointId,
    verifiedAt: Date,
    verifiedSource: string,
  ): Promise<ContactPoint>;

  /** @requiresTransaction — exactly one primary per customer is arbitrated physically. */
  setPrimaryContact(customerId: CustomerId, contactPointId: ContactPointId): Promise<void>;

  /**
   * Writes the bounded profile metadata (`APP10-B01`).
   *
   * Refuses an unknown id rather than reporting a silent no-op, and touches no
   * column outside {@link UpdateCustomerProfileInput}. The merge and
   * anonymization guards are the use case's: they are rules about *when*
   * maintenance is allowed, not about how a row is written.
   */
  updateProfile(id: CustomerId, input: UpdateCustomerProfileInput): Promise<Customer>;

  /**
   * Retires a contact without deleting it (`APP10-B01`).
   *
   * Soft by construction: `deactivated_at` is set and the row stays. That is
   * the whole effect, because CST-005 is partial on `deactivated_at IS NULL` —
   * the verified-uniqueness arbiter simply stops applying to it. `verified_at`
   * is never cleared: the contact *was* verified, and erasing that would
   * rewrite evidence rather than retire a channel.
   *
   * Takes no instant: the retirement moment is simply now, as it is for every
   * other write in this contract that does not carry a business-meaningful
   * timestamp. `markContactVerified` and `anonymize` are the exceptions,
   * because a verification instant and a retention run's instant are decided by
   * their callers.
   */
  deactivateContactPoint(id: ContactPointId): Promise<ContactPoint>;

  /** @requiresTransaction */
  upsertBusinessProfile(input: UpsertBusinessProfileInput): Promise<void>;

  /**
   * Clears PII in place (DB10 executes the policy; DB7 provides the mechanism).
   *
   * @requiresTransaction — customer and contacts must be cleared together.
   */
  anonymize(id: CustomerId, at: Date): Promise<void>;

  findById(id: CustomerId): Promise<Customer | undefined>;

  /**
   * Resolves the customer behind a verified contact — the identity path for a
   * returning customer (REQ-CUST-001).
   */
  findByVerifiedContact(
    contactKind: ContactKind,
    normalizedValue: string,
  ): Promise<Customer | undefined>;

  listContactPoints(customerId: CustomerId): Promise<ContactPoint[]>;
  findContactPoint(id: ContactPointId): Promise<ContactPoint | undefined>;
}
