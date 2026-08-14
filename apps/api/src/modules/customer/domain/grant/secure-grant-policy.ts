/**
 * The `secure_grant` policy and its validation (`APP4-G01`, `ADR-APP4-001`
 * §1.3; published by `APP4-B01-C1`).
 *
 * **No default, and adding one would defeat the file** — the rule
 * `verification-challenge-policy.ts` already states, and it applies harder here.
 * A guessed `standardTtlSeconds` is a credential with an unknown lifetime; a
 * guessed `stepUpWindowSeconds` silently widens the window in which a leaked
 * link can authorize money. Both values are versioned business policy with an
 * audit trail in `policy_configurations`, and a fallback constant would be a
 * second, unversioned source that wins exactly when the published one fails to
 * load.
 *
 * Shape validation is a result, never a throw, following the same precedent: a
 * misconfiguration leaves the process up and the capability refusing, rather
 * than crash-looping over a JSONB value an operator is mid-edit on.
 *
 * The two fields belong to one key because they are one decision. A grant's
 * validity and the freshness a step-up must have are the two halves of
 * ADR-DB3-004's model — "leaked link exposes read access at worst for a bounded
 * window; money and approval always require possession of the verified contact
 * *now*" — and splitting them across keys would let one be republished without
 * the other.
 */

/** The canonical policy key this capability reads. Never publishes. */
export const SECURE_GRANT_POLICY_KEY = 'secure_grant';

export interface SecureGrantPolicy {
  /** `grant.standard` expiry class (ADR-DB3-004 r3). */
  readonly standardTtlSeconds: number;
  /** `grant.step-up-window` (ADR-DB3-004 r4). */
  readonly stepUpWindowSeconds: number;
}

const POSITIVE_FIELDS = ['standardTtlSeconds', 'stepUpWindowSeconds'] as const;

export type SecureGrantPolicyProblem =
  | { readonly kind: 'SECURE_GRANT_POLICY_MISSING' }
  | { readonly kind: 'SECURE_GRANT_POLICY_INVALID'; readonly reasons: readonly string[] };

export type SecureGrantPolicyResult =
  | { readonly ok: true; readonly policy: SecureGrantPolicy }
  | { readonly ok: false; readonly problem: SecureGrantPolicyProblem };

/**
 * Sanity bounds, not business limits.
 *
 * A grant living beyond ninety days is an account rather than a link, and a
 * step-up window longer than a day would mean one OTP authorizes a day of money
 * actions — which is the model ADR-DB3-004 rejected.
 */
const MAX_TTL_SECONDS = 90 * 24 * 60 * 60;
const MAX_STEP_UP_WINDOW_SECONDS = 24 * 60 * 60;

export function parseSecureGrantPolicy(value: unknown): SecureGrantPolicyResult {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {
      ok: false,
      problem: { kind: 'SECURE_GRANT_POLICY_INVALID', reasons: ['value is not an object'] },
    };
  }

  const record = value as Record<string, unknown>;
  const reasons: string[] = [];

  for (const field of POSITIVE_FIELDS) {
    const candidate = record[field];
    if (typeof candidate !== 'number' || !Number.isInteger(candidate) || candidate <= 0) {
      reasons.push(`${field} must be a positive integer`);
    }
  }
  if (reasons.length > 0) {
    return { ok: false, problem: { kind: 'SECURE_GRANT_POLICY_INVALID', reasons } };
  }

  const policy: SecureGrantPolicy = {
    standardTtlSeconds: record['standardTtlSeconds'] as number,
    stepUpWindowSeconds: record['stepUpWindowSeconds'] as number,
  };

  if (policy.standardTtlSeconds > MAX_TTL_SECONDS) {
    reasons.push('standardTtlSeconds exceeds its sanity bound');
  }
  if (policy.stepUpWindowSeconds > MAX_STEP_UP_WINDOW_SECONDS) {
    reasons.push('stepUpWindowSeconds exceeds its sanity bound');
  }
  if (policy.stepUpWindowSeconds > policy.standardTtlSeconds) {
    // A step-up window outliving the grant it protects inverts the model: the
    // link would expire while the authorization it gates was still fresh.
    reasons.push('stepUpWindowSeconds must not exceed standardTtlSeconds');
  }

  if (reasons.length > 0) {
    return { ok: false, problem: { kind: 'SECURE_GRANT_POLICY_INVALID', reasons } };
  }
  return { ok: true, policy };
}

/**
 * The instant a grant issued at `issuedAt` expires (LC-03).
 *
 * Derived, never a persisted `EXPIRED` transition of its own: `resolveActive`
 * enforces `expires_at > now` on read, so a grant stops resolving the moment it
 * passes regardless of whether any sweep has run.
 */
export function grantExpiryOf(policy: SecureGrantPolicy, issuedAt: Date): Date {
  return new Date(issuedAt.getTime() + policy.standardTtlSeconds * 1_000);
}

/** The earliest completion instant a step-up may have and still count. */
export function stepUpNotBefore(policy: SecureGrantPolicy, now: Date): Date {
  return new Date(now.getTime() - policy.stepUpWindowSeconds * 1_000);
}
