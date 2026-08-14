/**
 * The evidence a caller must hold before an identity can exist (`APP4-B02`,
 * `ADR-DB2-001` Option A, r3/r5).
 *
 * This type is the whole reason there is no "create customer" operation in the
 * system. A `customers` row exists **only** from a verified contact, so the
 * application's only entry point takes proof of verification as its input —
 * and the proof is a {@link NormalizedContact}, which cannot be constructed by
 * hand: the sole way to obtain one is through the `APP4-P01` normalizers. A
 * caller holding a raw string therefore cannot reach this service at all, which
 * is r5's "raw string matches on unverified contacts never link identities"
 * expressed as a type rather than as a runtime check.
 *
 * What it deliberately does **not** carry:
 *
 * - **no code, code hash, token or secret.** B02 does not verify anything; it is
 *   told that verification succeeded. Whoever proved possession is `APP4-B03`
 *   and `APP4-B04`, and handing the secret along would put it in a second place
 *   for no purpose.
 * - **no correlation id.** The audit trail's correlation is the request id, read
 *   from the platform request context by the recorder — the same source every
 *   other audited use case in the repository uses. A field here would let a
 *   caller file a mutation under a correlation that never happened.
 * - **no display name.** Nothing in the identity rule needs one, and accepting
 *   free text from an anonymous submission into a PII column that B02 has no
 *   requirement to fill is a liability with no requirement behind it.
 */
import type { NormalizedContact } from '../contact/contact-value';

/**
 * Upper bound and shape of `customer_contact_points.verified_source`
 * (COL-TBL005-07 — "challenge purpose/channel evidence ref").
 *
 * A *reference*, never free text. The column sits in a PII-bearing table and is
 * read by operators, so restricting it to an uppercase token is what stops a
 * caller from spilling a contact value, a provider message or a raw error into
 * it — the one field in this contract a caller could otherwise fill with
 * anything.
 */
const VERIFIED_SOURCE_PATTERN = /^[A-Z][A-Z0-9_]{0,31}$/;

export interface VerifiedContactEvidence {
  /**
   * The just-verified contact, in `APP4-P01` canonical form.
   *
   * `normalized` is the identity the CST-005 arbiter reads; `display` is the
   * as-entered copy the schema keeps for the operator. Only `normalized` ever
   * decides identity (`ADR-DB2-001` r4/r6).
   */
  readonly contact: NormalizedContact;
  /** When possession was proven. Becomes the customer's immutable `verified_at`. */
  readonly verifiedAt: Date;
  /** A bounded evidence reference, e.g. the challenge purpose. Never free text. */
  readonly verifiedSource: string;
}

export function isWellFormedVerifiedSource(value: string): boolean {
  return VERIFIED_SOURCE_PATTERN.test(value);
}
