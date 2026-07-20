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
