/**
 * The shared result shape of contact normalization (`APP4-P01`, `ADR-APP4-001` §2).
 *
 * Normalization returns a result rather than throwing. A malformed contact is an
 * ordinary outcome of a public form submission, not an exceptional condition,
 * and the caller that has to render a field error should not have to catch.
 *
 * Two values come back on success because the database stores both
 * (`customer_contact_points`): `normalized` is the identity used for lookup,
 * comparison and the CST-005 partial unique; `display` is the as-entered copy
 * kept for the operator. Only `normalized` ever decides identity.
 */
import type { ContactKind } from '@embroidery/database';

/**
 * Why a contact value was refused.
 *
 * Deliberately coarse. These are field-level shape problems; nothing here
 * reports on whether a contact already exists, because the caller must not be
 * able to enumerate that (`ADR-APP4-001` §3).
 */
export const CONTACT_REJECTION_REASONS = [
  'EMPTY',
  'TOO_LONG',
  'INVALID_FORMAT',
  'UNSUPPORTED_COUNTRY_CODE',
] as const;

export type ContactRejectionReason = (typeof CONTACT_REJECTION_REASONS)[number];

export interface NormalizedContact {
  readonly kind: ContactKind;
  /** Lookup/comparison identity. Lowercase email, or E.164 phone. */
  readonly normalized: string;
  /** The trimmed as-entered value, for operator display only. */
  readonly display: string;
}

export type ContactNormalization =
  | { readonly ok: true; readonly contact: NormalizedContact }
  | { readonly ok: false; readonly reason: ContactRejectionReason };

export function rejected(reason: ContactRejectionReason): ContactNormalization {
  return { ok: false, reason };
}

export function accepted(
  kind: ContactKind,
  normalized: string,
  display: string,
): ContactNormalization {
  return { ok: true, contact: { kind, normalized, display } };
}
