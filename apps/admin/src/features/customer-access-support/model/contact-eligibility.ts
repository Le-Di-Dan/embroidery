/**
 * Which maintenance action a contact may be offered, decided from the
 * authoritative detail read and nothing else (`FIG-APP10-A01-CONTACT-ELIGIBILITY`,
 * `833:60`).
 *
 * These are the client's *offer* rules, not the authority. `APP10-B01` decides
 * every one of them again inside its transaction, and the screen never treats a
 * hidden button as a guarantee — a contact promoted in another tab a second ago
 * makes any snapshot wrong. What the rules buy is that the ordinary case does
 * not present an operator with an action whose only possible outcome is a
 * refusal.
 *
 * ### The list has no inactive contacts to reason about
 *
 * `adminCustomerSupport_detail` publishes *current* contacts only, and
 * `AdminCustomerContactResponse` carries no active/deactivated field at all. So
 * "is it active" is not a predicate here: presence in the list is the fact, and
 * a deactivated contact is simply absent. That is also why deactivation's
 * success state is the contact leaving the list rather than a badge changing.
 */
import type {
  AdminCustomerDetailResponse,
  AdminCustomerContactResponse,
} from '@embroidery/api-client';

/**
 * Promotion needs a contact that is already verified and not already primary.
 *
 * Both halves are the server's preconditions. Promoting the current primary
 * succeeds and changes nothing, so an action there would be a button that does
 * nothing; promoting an unverified contact is refused, and the way out is the
 * customer's own verification challenge — never this screen.
 */
export function canPromote(contact: AdminCustomerContactResponse): boolean {
  return contact.verified && !contact.primary;
}

/**
 * Deactivation is withheld from the primary contact and offered otherwise.
 *
 * The primary is a stated hard precondition — the operator must promote a
 * replacement first, explicitly, because which channel becomes the default
 * destination is their decision and not a side effect. The *last verified*
 * contact is a refusal the server also owns, but it is not withheld here: a
 * customer whose one verified contact is not the primary one is a real shape,
 * and hiding the action would leave the operator with no explanation at all
 * where the refusal gives them the accurate one.
 */
export function canDeactivate(contact: AdminCustomerContactResponse): boolean {
  return !contact.primary;
}

/** The contact with this id in the authoritative detail, or `undefined`. */
export function findContact(
  customer: AdminCustomerDetailResponse | undefined,
  contactId: string,
): AdminCustomerContactResponse | undefined {
  return customer?.contacts.find((contact) => contact.contactId === contactId);
}

/**
 * Whether this contact is the customer's only verified one.
 *
 * Used to read a refusal, never to send one: the count is taken from a *fresh*
 * detail read after the server has already refused, so it explains what
 * happened rather than predicting it.
 */
export function isLastVerified(
  customer: AdminCustomerDetailResponse,
  contact: AdminCustomerContactResponse,
): boolean {
  return contact.verified && customer.contacts.filter((entry) => entry.verified).length === 1;
}
