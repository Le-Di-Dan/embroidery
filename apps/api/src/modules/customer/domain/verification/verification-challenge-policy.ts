/**
 * The `verification.challenge` policy and its validation (`APP4-G01`,
 * `ADR-APP4-001` §1.3; published by `APP4-B01-C1`).
 *
 * **No default, and adding one would defeat the file.** Every value here is
 * versioned business policy with an audit trail in `policy_configurations`; a
 * fallback constant would be a second, unversioned source that silently wins
 * exactly when the published one fails to load. A process that cannot read the
 * policy issues nothing — that is the whole fail-closed behaviour, and it only
 * works if there is nothing to fall back to.
 *
 * Shape validation follows `worker-runtime-policy.ts`: a result, never a throw,
 * so a misconfiguration leaves the process up and the endpoint refusing rather
 * than crash-looping over a JSONB value an operator is mid-edit on.
 *
 * `maxAttempts` is parsed and deliberately **not consumed here**. It belongs to
 * `APP4-B04`, which owns submitted answers; validating it now means B04 inherits
 * a policy already known to be coherent, and reading it now would be B04's work
 * done in the wrong checkpoint.
 */

/** The canonical policy key this capability reads. Never publishes. */
export const VERIFICATION_CHALLENGE_POLICY_KEY = 'verification.challenge';

export interface VerificationChallengePolicy {
  readonly ttlSeconds: number;
  readonly codeLength: number;
  readonly codeAlphabet: string;
  /** `APP4-B04` owns this one. Validated here, consumed there. */
  readonly maxAttempts: number;
  readonly resendCooldownSeconds: number;
  readonly rateWindowSeconds: number;
  readonly maxIssuesPerTargetPerWindow: number;
}

const POSITIVE_FIELDS = [
  'ttlSeconds',
  'codeLength',
  'maxAttempts',
  'resendCooldownSeconds',
  'rateWindowSeconds',
  'maxIssuesPerTargetPerWindow',
] as const;

export type VerificationPolicyProblem =
  | { readonly kind: 'VERIFICATION_POLICY_MISSING' }
  | { readonly kind: 'VERIFICATION_POLICY_INVALID'; readonly reasons: readonly string[] };

export type VerificationPolicyResult =
  | { readonly ok: true; readonly policy: VerificationChallengePolicy }
  | { readonly ok: false; readonly problem: VerificationPolicyProblem };

/**
 * Sanity bounds, not business limits.
 *
 * A day is far past any credible OTP window, and an unbounded issuance budget is
 * a spam relay rather than a rate limit.
 */
const MAX_SECONDS = 24 * 60 * 60;
const MAX_ISSUES = 100;

export function parseVerificationChallengePolicy(value: unknown): VerificationPolicyResult {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {
      ok: false,
      problem: { kind: 'VERIFICATION_POLICY_INVALID', reasons: ['value is not an object'] },
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
  if (typeof record['codeAlphabet'] !== 'string' || record['codeAlphabet'] === '') {
    reasons.push('codeAlphabet must be a non-empty string');
  }

  if (reasons.length > 0) {
    return { ok: false, problem: { kind: 'VERIFICATION_POLICY_INVALID', reasons } };
  }

  const policy: VerificationChallengePolicy = {
    ttlSeconds: record['ttlSeconds'] as number,
    codeLength: record['codeLength'] as number,
    codeAlphabet: record['codeAlphabet'] as string,
    maxAttempts: record['maxAttempts'] as number,
    resendCooldownSeconds: record['resendCooldownSeconds'] as number,
    rateWindowSeconds: record['rateWindowSeconds'] as number,
    maxIssuesPerTargetPerWindow: record['maxIssuesPerTargetPerWindow'] as number,
  };

  for (const [field, bound] of [
    ['ttlSeconds', MAX_SECONDS],
    ['resendCooldownSeconds', MAX_SECONDS],
    ['rateWindowSeconds', MAX_SECONDS],
    ['maxIssuesPerTargetPerWindow', MAX_ISSUES],
  ] as const) {
    if (policy[field] > bound) {
      reasons.push(`${field} exceeds its sanity bound`);
    }
  }
  if (policy.resendCooldownSeconds > policy.ttlSeconds) {
    // A cooldown longer than the challenge's own life makes resend unreachable:
    // the source expires before it becomes eligible, and the endpoint could
    // never succeed for any caller.
    reasons.push('resendCooldownSeconds must not exceed ttlSeconds');
  }

  if (reasons.length > 0) {
    return { ok: false, problem: { kind: 'VERIFICATION_POLICY_INVALID', reasons } };
  }
  return { ok: true, policy };
}

/** The instant a challenge issued at `issuedAt` expires. */
export function expiryOf(policy: VerificationChallengePolicy, issuedAt: Date): Date {
  return new Date(issuedAt.getTime() + policy.ttlSeconds * 1_000);
}

/** The instant a challenge issued at `issuedAt` becomes resendable. */
export function resendAvailableAtOf(policy: VerificationChallengePolicy, issuedAt: Date): Date {
  return new Date(issuedAt.getTime() + policy.resendCooldownSeconds * 1_000);
}

/** The start of the rate window ending at `now`. */
export function rateWindowStart(policy: VerificationChallengePolicy, now: Date): Date {
  return new Date(now.getTime() - policy.rateWindowSeconds * 1_000);
}
