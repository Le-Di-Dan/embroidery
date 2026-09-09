/**
 * Client-side shape check for the verification email (`APP4-S01` §8).
 *
 * **This is not normalization and must never become it.** The server is the
 * canonical normalizer — `APP4-P01` lowercases and trims — and none of that is
 * reproduced here. What this function does is refuse input that could not
 * possibly be a destination, so the customer sees the approved `623:27` state
 * immediately instead of a round trip.
 *
 * Everything that passes is still sent as typed and still may be refused by the
 * server with a 422; the approved invalid state is the same either way. A check
 * that is more permissive than the server is correct here. One that is stricter
 * would reject destinations the platform accepts, which is why the pattern is
 * deliberately loose.
 *
 * ## There is no contact *kind* any more (`APP12-N01.S01`)
 *
 * `CUSTOMER_OTP_CHANNEL = EMAIL_ONLY`. This module used to carry a `ContactKind`
 * union, a phone shape check and — after `N01.B01` narrowed the generated
 * contract — a cast that let a `PHONE` literal reach the wire so the server
 * could refuse it. All three are gone. Email is the verification identity, so
 * the *type* of the flow no longer admits a second channel and no runtime guard
 * is needed to keep one out.
 *
 * A phone number is still a first-class value in this product — it is the
 * recipient's number on a delivery address (`readyMade.delivery`) and a contact
 * point an operator can call. It is simply not a verification channel, and
 * nothing in this feature validates or transports one.
 */

/**
 * Something before an `@`, something after it, and a dot in the domain.
 *
 * Deliberately not an RFC 5322 matcher. The purpose is to catch `ban@vidu` —
 * the exact value the approved invalid frame `623:43` shows — not to adjudicate
 * address syntax, which the server does.
 */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@.]+\.[^\s@]+$/;

/** Whether the value could be an email destination. Never a verdict. */
export function isPlausibleEmail(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed === '') return false;
  return EMAIL_SHAPE.test(trimmed);
}
