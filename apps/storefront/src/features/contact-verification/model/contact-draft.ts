/**
 * Client-side shape checks for the contact field (`APP4-S01` §8).
 *
 * **This is not normalization and must never become it.** The server is the
 * canonical normalizer — `APP4-P01` lowercases, trims, parses the country code
 * and produces the E.164 form — and none of that is reproduced here. What these
 * functions do is refuse input that could not possibly be a destination, so the
 * customer sees the approved `623:27` state immediately instead of a round trip.
 *
 * Everything that passes is still sent as typed and still may be refused by the
 * server with a 422; the approved invalid state is the same either way. A check
 * that is more permissive than the server is correct here. One that is stricter
 * would reject destinations the platform accepts, which is why both patterns are
 * deliberately loose.
 */
import { IssueVerificationChallengeBodyContactKind } from '@embroidery/api-client';

export type ContactKind = 'EMAIL' | 'PHONE';

/**
 * The contract's own enum, so the wire value is never a typed literal.
 *
 * `PHONE` is no longer in the contract: `APP12-N01` locked customer verification
 * to email, and the generated enum narrowed with it. The local literal below
 * keeps this module compiling and the phone *shape check* working for the UI
 * that still renders a choice — it is not a wire value any more, and the server
 * refuses it.
 *
 * This is the bounded compile-compatibility change `APP12-N01.B01` §22 allows.
 * Removing the affordance itself — the choice, its copy and its error states —
 * is `N01.S01`'s work and is deliberately not done here.
 */
export const CONTACT_KIND_VALUES = {
  EMAIL: IssueVerificationChallengeBodyContactKind.EMAIL,
  PHONE: 'PHONE',
} as const;

export const CONTACT_KINDS: readonly ContactKind[] = ['EMAIL', 'PHONE'];

/**
 * Something before an `@`, something after it, and a dot in the domain.
 *
 * Deliberately not an RFC 5322 matcher. The purpose is to catch `ban@vidu` —
 * the exact value the approved invalid frame `623:43` shows — not to adjudicate
 * address syntax, which the server does.
 */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@.]+\.[^\s@]+$/;

/**
 * Digits, with optional spaces, dots or dashes, and an optional leading `+`.
 *
 * The bounds are the widest E.164 could ever need (a country code plus a
 * national number is at most 15 digits) rather than a Vietnam-specific rule:
 * the field accepts an international number by design (`APP4-D01` §D.1), so a
 * check tuned to `0xxxxxxxxx` would reject exactly the case the design allows.
 */
const PHONE_SHAPE = /^\+?[\d][\d\s.-]{5,20}$/;

/** Whether the value could be a destination of this kind. Never a verdict. */
export function isPlausibleContact(kind: ContactKind, value: string): boolean {
  const trimmed = value.trim();
  if (trimmed === '') return false;
  if (kind === 'EMAIL') return EMAIL_SHAPE.test(trimmed);
  // Count digits rather than characters: separators are presentation and the
  // shortest real national number is longer than any of these patterns' noise.
  const digits = trimmed.replace(/\D/g, '');
  return PHONE_SHAPE.test(trimmed) && digits.length >= 6 && digits.length <= 15;
}
