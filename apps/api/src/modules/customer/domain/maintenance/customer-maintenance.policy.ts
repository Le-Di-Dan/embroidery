/**
 * When maintenance is allowed, as pure decisions (`APP10-B01`).
 *
 * Every rule B01 enforces is here, decided from rows already loaded and
 * returning either an outcome or a {@link CustomerMaintenanceError}. Nothing in
 * this file opens a transaction, calls a repository or reaches a clock, so each
 * rule can be read — and tested — as the sentence it is, and the two use cases
 * that call them hold orchestration only.
 *
 * The rules that are *not* here are the ones the database owns: exactly one
 * primary per customer (CST-006, a partial unique) and one active verified
 * holder per `(kind, value)` (CST-005). Those are arbiters, not checks, and
 * re-deciding them in application code would replace a constraint that cannot
 * be raced with a read that can.
 */
import type { ContactPoint, ContactPointId, Customer } from '../repositories/customer.repository';
import { CustomerMaintenanceError } from './customer-maintenance.errors';

/**
 * Whether the promotion has anything to do.
 *
 * `ALREADY_PRIMARY` is a success, not a refusal: an operator clicking twice, a
 * retried request and a client replaying a queued action all describe a world
 * that is already the requested one, and answering 409 would make correctness
 * depend on how many times a button was pressed.
 */
export type PromotionOutcome = 'PROMOTE' | 'ALREADY_PRIMARY';

/** Same rule, same reason, for retirement. */
export type DeactivationOutcome = 'DEACTIVATE' | 'ALREADY_DEACTIVATED';

/**
 * The customer this maintenance may touch.
 *
 * Absent is a 404 and merged is a 409, and the second is the interesting one:
 * a tombstoned customer is the losing half of a completed merge, kept only so
 * history resolves. Editing it records an operator's intent against a record
 * nothing reads; redirecting the edit to the survivor would be worse still,
 * because the operator would believe they had changed the customer they named.
 * Neither happens — the operation stops.
 */
export function requireMaintainableCustomer(customer: Customer | undefined): Customer {
  if (customer === undefined) {
    throw new CustomerMaintenanceError('CUSTOMER_NOT_FOUND');
  }
  if (customer.mergedIntoCustomerId !== undefined) {
    throw new CustomerMaintenanceError('CUSTOMER_MERGED');
  }
  return customer;
}

/**
 * The contact addressed by the path, proven to belong to the customer in it.
 *
 * The search is over the customer's **own** contacts, so a contact id that
 * names another customer's row is not found here — it takes the same
 * `CONTACT_NOT_FOUND` an id naming nothing at all takes. That is the whole
 * cross-customer rule, and it is enforced by never loading a contact by id
 * alone: there is no branch on this path that has seen a foreign row and then
 * decided what to say about it.
 */
export function requireOwnedContact(
  contacts: readonly ContactPoint[],
  contactPointId: ContactPointId,
): ContactPoint {
  const contact = contacts.find((candidate) => candidate.id === contactPointId);
  if (contact === undefined) {
    throw new CustomerMaintenanceError('CONTACT_NOT_FOUND');
  }
  return contact;
}

/**
 * Whether this contact may become the primary one.
 *
 * Three conditions, and the order matters only for which message an operator
 * reads. Already-primary is answered first because it is not a failure at all;
 * then the contact must be active, and then verified.
 *
 * Verified is the condition that carries the security weight. The primary
 * contact is the default destination for the customer's notifications, so
 * promoting an unproven channel would route a customer's mail to an address
 * nobody has demonstrated they hold. B01 mints no verification evidence and
 * never writes `verified_at`; the only way a contact becomes promotable is the
 * verification challenge (LC-02) that already exists.
 */
export function promotionOutcome(contact: ContactPoint): PromotionOutcome {
  if (contact.isPrimary) {
    return 'ALREADY_PRIMARY';
  }
  if (contact.deactivatedAt !== undefined) {
    throw new CustomerMaintenanceError('CONTACT_NOT_ACTIVE');
  }
  if (contact.verifiedAt === undefined) {
    throw new CustomerMaintenanceError('CONTACT_NOT_VERIFIED');
  }
  return 'PROMOTE';
}

/**
 * Whether this contact may be retired.
 *
 * Already-deactivated is answered first, and is a success for the reason
 * {@link PromotionOutcome} records.
 *
 * Then two refusals, and they are different rules that happen to protect the
 * same thing. **Primary** is refused because CST-006 is partial on `is_primary`
 * alone: a deactivated primary would still occupy the single primary slot while
 * being unreachable, so the customer would have a default destination that
 * cannot be delivered to and no way to take the slot back. **Last verified** is
 * refused because a customer exists *because* a verified contact was proven
 * (ADR-DB2-001 r5) — retiring the last one leaves an identity with nothing that
 * established it.
 *
 * Neither is resolved by promoting some other contact as a side effect. Which
 * channel becomes primary shapes every later notification, and an operator
 * states it through the promotion operation rather than discovering what a
 * deactivation chose for them.
 */
export function deactivationOutcome(
  contacts: readonly ContactPoint[],
  target: ContactPoint,
): DeactivationOutcome {
  if (target.deactivatedAt !== undefined) {
    return 'ALREADY_DEACTIVATED';
  }
  if (target.isPrimary) {
    throw new CustomerMaintenanceError('CONTACT_IS_PRIMARY');
  }
  const survivingVerified = contacts.filter(
    (candidate) =>
      candidate.id !== target.id &&
      candidate.deactivatedAt === undefined &&
      candidate.verifiedAt !== undefined,
  );
  if (target.verifiedAt !== undefined && survivingVerified.length === 0) {
    throw new CustomerMaintenanceError('CONTACT_IS_LAST_VERIFIED');
  }
  return 'DEACTIVATE';
}

/** The contact currently holding the primary designation, if any. */
export function currentPrimary(contacts: readonly ContactPoint[]): ContactPoint | undefined {
  return contacts.find((contact) => contact.isPrimary);
}
