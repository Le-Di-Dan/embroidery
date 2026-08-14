/**
 * The `secure_link.resolve` policy and its validation (`APP4-G01`, IMP-D049
 * PO-01; published by `APP4-B01-C1`).
 *
 * One value: how many resolve requests one source may make per minute.
 *
 * **It counts requests, never outcomes**, and that is the whole design. A
 * limiter that only charged for *failures* would be a validity oracle: a caller
 * could binary-search the token space and read the answer off whether or not
 * their budget moved. Charging every request — valid, unknown, expired, revoked,
 * superseded, wrong-target alike — makes the limiter's behaviour independent of
 * the credential, so it bounds abuse without measuring anything about the token.
 * That rule lives in the limiter, but it is restated here because this is the
 * file whose name makes someone think about it.
 *
 * **No default, and adding one would defeat the file** — the rule
 * `secure-grant-policy.ts` and `verification-challenge-policy.ts` both carry. A
 * fallback constant is a second, unversioned source that silently wins exactly
 * when the published one fails to load, and a guessed abuse limit is either a
 * denial of service or no limit at all.
 *
 * Shape validation is a result, never a throw, following the same precedent: a
 * misconfiguration leaves the process up and the endpoint refusing rather than
 * crash-looping over a JSONB value an operator is mid-edit on.
 */

/** The canonical policy key this capability reads. Never publishes. */
export const SECURE_LINK_RESOLVE_POLICY_KEY = 'secure_link.resolve';

/** The window the published limit is expressed over. */
export const SECURE_LINK_RESOLVE_WINDOW_MS = 60_000;

export interface SecureLinkResolvePolicy {
  readonly maxRequestsPerIpPerMinute: number;
}

export type SecureLinkPolicyProblem =
  | { readonly kind: 'SECURE_LINK_POLICY_MISSING' }
  | { readonly kind: 'SECURE_LINK_POLICY_INVALID'; readonly reasons: readonly string[] };

export type SecureLinkPolicyResult =
  | { readonly ok: true; readonly policy: SecureLinkResolvePolicy }
  | { readonly ok: false; readonly problem: SecureLinkPolicyProblem };

/**
 * A sanity bound, not a business limit.
 *
 * An unbounded per-minute allowance is not a rate limit, and a published value
 * in the tens of thousands is far likelier to be a units mistake — per hour, or
 * milliseconds — than an intended policy.
 */
const MAX_REQUESTS_PER_MINUTE = 10_000;

export function parseSecureLinkResolvePolicy(value: unknown): SecureLinkPolicyResult {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {
      ok: false,
      problem: { kind: 'SECURE_LINK_POLICY_INVALID', reasons: ['value is not an object'] },
    };
  }

  const candidate = (value as Record<string, unknown>)['maxRequestsPerIpPerMinute'];
  const reasons: string[] = [];

  if (typeof candidate !== 'number' || !Number.isInteger(candidate) || candidate <= 0) {
    reasons.push('maxRequestsPerIpPerMinute must be a positive integer');
  } else if (candidate > MAX_REQUESTS_PER_MINUTE) {
    reasons.push('maxRequestsPerIpPerMinute exceeds its sanity bound');
  }

  if (reasons.length > 0) {
    return { ok: false, problem: { kind: 'SECURE_LINK_POLICY_INVALID', reasons } };
  }
  return { ok: true, policy: { maxRequestsPerIpPerMinute: candidate as number } };
}
