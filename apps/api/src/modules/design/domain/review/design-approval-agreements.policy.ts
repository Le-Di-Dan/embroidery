/**
 * The published `design_approval.agreements` policy, as the review read
 * consumes it (`APP6-G01-C1` §5.1, `APP6-B10` §10).
 *
 * The **values** are not here. `PAYMENT_POLICY` and `RETURN_POLICY` live in
 * `packages/database/seed/app6-policy-configuration.seed.json`, are published
 * into `policy_configurations` / `policy_configuration_versions` by
 * `PublishApp6PolicyUseCase`, and are read at the point of use. This file only
 * states the shape; a default here would be a second production allow-list, and
 * a fallback would let the API show a customer a set of terms nobody published.
 * `APP6-B01`'s `quotation-deposit-policy.ts` is the shape this follows.
 *
 * `agreements.agreement_type` carries no `CHECK` (COL-TBL068-01, deliberately
 * config-extensible), so the required set is data end to end: adding a fourth
 * policy page later is a dataset change, not a code change and not a migration.
 * Nothing in this file enumerates the two types that happen to be required
 * today, which is what makes that true rather than merely intended.
 *
 * **Order is part of the value.** The array is preserved exactly as published,
 * because it is what `APP6-B10` orders the returned agreement set by and what
 * `APP6-B11` will compare a submitted set against. Sorting it here would make
 * the response order an implementation detail of this parser rather than a fact
 * the operator published.
 *
 * `DESIGN_APPROVAL_TERMS` is deliberately not a value this file knows about.
 * `APP6-G01-C1` §5.2 rules the exact-design confirmation out of the agreement
 * model entirely — it is approval action semantics enforced by GRD-007, not a
 * versioned term — so there is no constant, no branch and no special case for
 * it anywhere below.
 */

export const DESIGN_APPROVAL_AGREEMENTS_POLICY_KEY = 'design_approval.agreements';

export interface DesignApprovalAgreementsPolicy {
  /** The required types, in published order. Never empty, never duplicated. */
  readonly requiredAgreementTypes: readonly string[];
}

export type AgreementsPolicyParse =
  { readonly ok: true; readonly policy: DesignApprovalAgreementsPolicy } | { readonly ok: false };

/** Parses a published policy value, or reports that it is unusable. */
export function parseDesignApprovalAgreementsPolicy(value: unknown): AgreementsPolicyParse {
  if (typeof value !== 'object' || value === null) {
    return { ok: false };
  }
  const types = (value as Record<string, unknown>)['requiredAgreementTypes'];
  if (!Array.isArray(types) || types.length === 0) {
    // An empty required set is refused rather than treated as "no terms needed":
    // a deployment that published `[]` by mistake would otherwise let approvals
    // bind nothing at all, silently, and GRD-008 would have nothing to verify.
    return { ok: false };
  }

  const required: string[] = [];
  for (const entry of types) {
    if (typeof entry !== 'string' || entry.trim() === '') {
      return { ok: false };
    }
    // A duplicate would make "exactly one effective version per required type"
    // ambiguous downstream — the same term counted twice is not a stricter
    // requirement, it is an unanswerable one.
    if (required.includes(entry)) {
      return { ok: false };
    }
    required.push(entry);
  }

  return { ok: true, policy: { requiredAgreementTypes: required } };
}
