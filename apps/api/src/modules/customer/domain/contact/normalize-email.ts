/**
 * Email normalization (`APP4-P01`, `ADR-APP4-001` §2.1).
 *
 * The rule is deliberately two steps and nothing more: **trim, then lowercase
 * the complete address**. Every "smarter" variant is stated below as a
 * prohibition rather than an omission, because each one is a silent identity
 * merge:
 *
 * - stripping `+tag` merges `an+shop@vidu.com` into `an@vidu.com`;
 * - removing dots merges `a.b@gmail.com` into `ab@gmail.com`;
 * - canonicalizing `googlemail.com` to `gmail.com` merges two domains.
 *
 * Those are one inbox at one provider but **two distinct customers** under
 * `ADR-DB2-001`, and deciding otherwise is a product decision APP4 does not own.
 * `customer_contact_points` enforces one active verified link per
 * `(kind, normalized_value)`, so a normalization that collapses two addresses
 * collapses two identities with it.
 *
 * `String.prototype.trim` is the right trim: the ECMAScript `WhiteSpace`
 * production it uses already covers Unicode `Zs`, `NBSP` and `ZWNBSP`, so a
 * pasted address padded with a non-breaking space normalizes correctly without
 * a bespoke character class.
 *
 * Validation here is **structural only** — it proves the value has the shape of
 * an address, never that it can receive mail. Deliverability is what the
 * verification challenge itself establishes. `packages/validation` is an
 * approved but empty package boundary, and no other email validation exists in
 * the API, so there was nothing to reuse; this stays local rather than becoming
 * a second application-wide validation framework.
 */
import { accepted, rejected, type ContactNormalization } from './contact-value';

/**
 * RFC 5321 §4.5.3.1.3 caps a reverse/forward path at 256 octets including the
 * angle brackets, leaving 254 for the address itself.
 */
export const EMAIL_MAX_LENGTH = 254;

/** RFC 5321 §4.5.3.1.1/2: 64-octet local part, 255-octet domain. */
const LOCAL_MAX_LENGTH = 64;
const DOMAIN_MAX_LENGTH = 255;

/**
 * One `@`, a non-empty local part of printable non-whitespace characters, and a
 * dotted domain of letter/digit/hyphen labels ending in an alphabetic TLD.
 *
 * Intentionally narrower than RFC 5322: quoted local parts, comments and
 * address literals are all valid by the grammar and none of them can be typed
 * into a storefront form by a customer who wants to receive a code.
 */
const EMAIL_PATTERN =
  /^[^\s@,;:<>[\]\\"]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/;

/**
 * Normalizes and structurally validates an email address.
 *
 * Lowercasing covers the whole address, including the local part. The RFC makes
 * the local part case-sensitive in principle; treating it as case-insensitive is
 * the deliberate `ADR-APP4-001` ruling, and it is the safer direction — it
 * cannot split one real mailbox into two customers.
 */
export function normalizeEmail(raw: string): ContactNormalization {
  const display = raw.trim();
  if (display === '') {
    return rejected('EMPTY');
  }
  if (display.length > EMAIL_MAX_LENGTH) {
    return rejected('TOO_LONG');
  }

  const normalized = display.toLowerCase();
  if (!EMAIL_PATTERN.test(normalized)) {
    return rejected('INVALID_FORMAT');
  }

  // The pattern guarantees exactly one `@`, so this split is total.
  const separator = normalized.lastIndexOf('@');
  const local = normalized.slice(0, separator);
  const domain = normalized.slice(separator + 1);
  if (local.length > LOCAL_MAX_LENGTH || domain.length > DOMAIN_MAX_LENGTH) {
    return rejected('TOO_LONG');
  }

  return accepted('EMAIL', normalized, display);
}
