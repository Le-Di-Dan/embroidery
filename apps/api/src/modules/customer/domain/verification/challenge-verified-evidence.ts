/**
 * Turns a just-answered challenge into the evidence `APP4-B02` requires.
 *
 * `VerifiedContactEvidence` carries a {@link NormalizedContact}, which by
 * design cannot be built by hand — the only way to obtain one is through the
 * `APP4-P01` normalizers. That is the type-level form of `ADR-DB2-001` r5, and
 * B04 does not get an exemption from it. So the challenge's own
 * `normalized_value` is passed back through the **same** P01 authority that
 * produced it at issuance, and the result is accepted only if normalization is
 * a fixed point on it.
 *
 * Three things this deliberately is not:
 *
 * - **Not a second normalizer.** It calls `normalizeEmail`/`normalizePhone` and
 *   implements no rule of its own — no lowercasing, no trimming, no country
 *   handling. If P01's rules change, this changes with them.
 * - **Not a fabrication of the display value.** `customer_contact_points`
 *   stores an as-entered copy, and a challenge never captured one: `APP4-B03`
 *   persists the normalized target and nothing else, because the raw string a
 *   caller typed is not evidence of anything. The canonical value is therefore
 *   the honest display value — it is the address possession was proven for.
 *   Inventing a prettier one would put a string into a PII column that no
 *   caller ever entered.
 * - **Not a channel for request data.** The contact comes from the persisted
 *   challenge, never from the attempt body, which carries a code and nothing
 *   else. A replacement contact accepted here would let anyone holding a
 *   challenge id bind a proven verification to an address of their choosing.
 *
 * The fixed-point check is what makes `undefined` mean something. A row whose
 * `normalized_value` does not normalize to itself was not written by the
 * issue path as it stands, and creating an identity from it would silently
 * register a customer under a value the CST-005 arbiter reads differently.
 * The caller refuses instead.
 */
import type { NormalizedContact } from '../contact/contact-value';
import { normalizeEmail } from '../contact/normalize-email';
import { normalizePhone } from '../contact/normalize-phone';
import type { VerifiedContactEvidence } from '../identity/verified-contact-evidence';
import type { VerificationChallenge } from '../repositories/verification-challenge.repository';

/**
 * The `verified_source` reference written onto the contact point.
 *
 * The challenge **purpose**, prefixed — a bounded uppercase token as
 * `isWellFormedVerifiedSource` requires, and the one fact about the evidence
 * an operator reading `customer_contact_points` needs: which flow proved this
 * channel. Never the challenge id, which would be a dangling reference the
 * moment the transient family is TTL-deleted.
 */
export function verifiedSourceOf(challenge: VerificationChallenge): string {
  return `VERIFICATION_${challenge.purpose}`;
}

/**
 * The canonical contact of a challenge, re-derived through P01.
 *
 * `undefined` when the stored value is not its own canonical form.
 */
export function canonicalContactOf(
  challenge: VerificationChallenge,
): NormalizedContact | undefined {
  const result =
    challenge.contactKind === 'EMAIL'
      ? normalizeEmail(challenge.normalizedValue)
      : normalizePhone(challenge.normalizedValue);

  if (!result.ok || result.contact.normalized !== challenge.normalizedValue) {
    return undefined;
  }
  return result.contact;
}

/**
 * The B02 evidence for a challenge that has just been answered correctly.
 *
 * `verifiedAt` is the instant possession was proven — the same instant the
 * challenge was completed at, so the customer's immutable `verified_at` and the
 * challenge's `verified_at` cannot disagree.
 */
export function verifiedContactEvidenceOf(
  challenge: VerificationChallenge,
  verifiedAt: Date,
): VerifiedContactEvidence | undefined {
  const contact = canonicalContactOf(challenge);
  if (contact === undefined) {
    return undefined;
  }
  return { contact, verifiedAt, verifiedSource: verifiedSourceOf(challenge) };
}
