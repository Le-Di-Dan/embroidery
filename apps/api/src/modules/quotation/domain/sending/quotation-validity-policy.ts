/**
 * The published `quotation.validity` policy, as the send transaction consumes
 * it (`APP6-G01` §6.1, `APP6-B03`).
 *
 * The **value** is not here. `7` lives in
 * `packages/database/seed/app6-policy-configuration.seed.json`, is published
 * into `policy_configurations` / `policy_configuration_versions` by
 * `PublishApp6PolicyUseCase` (`APP6-B01`), and is read at the point of use. This
 * file states the shape and the arithmetic; a default here would be a second
 * authority, and a fallback would let the API put a validity window in front of
 * a customer that no published policy supports.
 *
 * The same reasoning `quotation-deposit-policy.ts` records, for the same reason:
 * these two keys are the phase's two priced facts, and neither may become a
 * TypeScript constant.
 */
export const QUOTATION_VALIDITY_POLICY_KEY = 'quotation.validity';

export interface QuotationValidityPolicy {
  /** Calendar days a sent version stays acceptance-eligible (`APP6-G01` §6.1). */
  readonly validityDays: number;
}

export type ValidityPolicyParse =
  { readonly ok: true; readonly policy: QuotationValidityPolicy } | { readonly ok: false };

/**
 * The upper bound is a sanity rail, not a business rule.
 *
 * A published value outside it is a publication mistake — a window of ten years
 * is not a quotation — and refusing is how the operator finds out, rather than
 * the customer holding a price open indefinitely.
 */
const MAX_VALIDITY_DAYS = 365;

/** Parses a published policy value, or reports that it is unusable. */
export function parseQuotationValidityPolicy(value: unknown): ValidityPolicyParse {
  if (typeof value !== 'object' || value === null) {
    return { ok: false };
  }
  const days = (value as Record<string, unknown>)['validityDays'];

  // At least one whole day: `ck_quotation_versions__validity_window` requires
  // `valid_from < valid_until`, so a zero or negative window is a row the
  // database would reject after the version had already been frozen.
  if (typeof days !== 'number' || !Number.isInteger(days) || days < 1 || days > MAX_VALIDITY_DAYS) {
    return { ok: false };
  }
  return { ok: true, policy: { validityDays: days } };
}

/**
 * `valid_until` from the committed send instant (`APP6-G01` §6.1).
 *
 * Calendar days, added on the date components rather than as a multiple of
 * 86 400 000 ms — the two agree here because `Asia/Ho_Chi_Minh` observes no
 * daylight saving, and writing it as date arithmetic is what keeps the code
 * saying "seven calendar days" rather than "604 800 000 milliseconds", which is
 * what `APP6-G01` §6.1 actually locked.
 *
 * The input is never mutated: the send instant is also `valid_from` and
 * `sent_at`, and a helper that shifted its argument would move all three.
 */
export function addCalendarDays(from: Date, days: number): Date {
  const result = new Date(from.getTime());
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}
