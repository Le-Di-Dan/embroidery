/**
 * Which contact kinds may carry a **customer verification code** (`APP12-N01`).
 *
 * The Product Owner locked the channel to email only. Phone numbers keep every
 * other job they already have — a recipient on a delivery address, a contact
 * point an operator can call — but they are no longer a verification channel:
 *
 * ```text
 * CUSTOMER_OTP_CHANNEL = EMAIL_ONLY
 * PHONE_NUMBER != VERIFICATION_CHANNEL
 * ```
 *
 * ### Why this lives in the domain and not only in the request schema
 *
 * `APP12-U01` proved the delivery half of this: the repository ships exactly one
 * `NotificationChannelPort` implementation and it delivers to nobody, so no real
 * customer could ever receive a code. `N01.B01` supplies an SMTP transport —
 * and an SMTP transport can carry an email and nothing else. A `PHONE` challenge
 * would therefore mint a real code, raise a real `SMS` notification intent, and
 * have no transport able to deliver it: the customer waits for a message that
 * physically cannot arrive, and the failure looks like a bug in verification
 * rather than a channel that was never built.
 *
 * Narrowing the HTTP body alone would leave that reachable from any non-HTTP
 * caller. This module is the authority the *issuer* consults, so the refusal
 * holds for the public endpoint, the resend path and anything added later — the
 * same shape `ADR-APP4-001` §12 already uses for the contact-kind → channel
 * mapping it declares once and reads everywhere.
 *
 * ### What this deliberately does not do
 *
 * It does not touch `contact_kind` in the database, and no historical `PHONE`
 * row is rewritten or removed. Existing values remain readable; only *new*
 * verification is constrained.
 */
import type { ContactKind } from '@embroidery/database';

/** The contact kinds a new verification challenge may target. Email only. */
export const VERIFICATION_CONTACT_KINDS = ['EMAIL'] as const satisfies readonly ContactKind[];

export type VerificationContactKind = (typeof VERIFICATION_CONTACT_KINDS)[number];

/** Whether this contact kind may carry a verification code. */
export function isVerificationContactKind(kind: ContactKind): kind is VerificationContactKind {
  return (VERIFICATION_CONTACT_KINDS as readonly ContactKind[]).includes(kind);
}

/**
 * The stable, safe refusal for a contact kind that is not a verification
 * channel.
 *
 * A bounded code rather than a sentence, so the public envelope carries the same
 * classification the rest of APP4's refusals do, and no branch of it echoes the
 * contact back.
 */
export const VERIFICATION_CHANNEL_UNSUPPORTED = 'VERIFICATION_CHANNEL_UNSUPPORTED';
