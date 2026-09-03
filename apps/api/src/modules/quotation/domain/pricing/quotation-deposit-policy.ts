/**
 * The published `quotation.deposit` policy, as pricing consumes it
 * (`APP6-G01` §6.4, `APP6-B01`).
 *
 * The **values** are not here. `40` and `60` live in
 * `packages/database/seed/app6-policy-configuration.seed.json`, are published
 * into `policy_configurations` / `policy_configuration_versions` by
 * `PublishApp6PolicyUseCase`, and are read at the point of use. This file only
 * states the shape and turns it into exact arithmetic input; a default here
 * would be a second authority, and a fallback would let the API price a
 * quotation against a share nobody published.
 *
 * `remainingPercent` is validated as the complement but is deliberately **not**
 * used to compute the remaining amount: that is `total − deposit`, so CST-064
 * holds for every total rather than for the ones that divide evenly. Its role is
 * to catch a dataset that says something incoherent — a 40/50 split — before a
 * price is built on it.
 */
import { parsePercentHundredths } from './vnd-amount';

export const QUOTATION_DEPOSIT_POLICY_KEY = 'quotation.deposit';

export interface QuotationDepositPolicy {
  /** The deposit share in hundredths of a percent (`deposit_percent numeric(5,2)`). */
  readonly depositPercentHundredths: bigint;
}

const FULL_PERCENT = 100n * 100n;

export type DepositPolicyParse =
  { readonly ok: true; readonly policy: QuotationDepositPolicy } | { readonly ok: false };

/** Parses a published policy value, or reports that it is unusable. */
export function parseQuotationDepositPolicy(value: unknown): DepositPolicyParse {
  if (typeof value !== 'object' || value === null) {
    return { ok: false };
  }
  const record = value as Record<string, unknown>;
  const deposit = parsePercentHundredths(record['depositPercent']);
  const remaining = parsePercentHundredths(record['remainingPercent']);

  if (deposit === undefined || remaining === undefined) {
    return { ok: false };
  }
  // The two shares must describe one whole quotation. A dataset where they do
  // not is a publication mistake, and pricing against it would silently invent
  // a share the business never agreed.
  if (deposit + remaining !== FULL_PERCENT) {
    return { ok: false };
  }
  return { ok: true, policy: { depositPercentHundredths: deposit } };
}
