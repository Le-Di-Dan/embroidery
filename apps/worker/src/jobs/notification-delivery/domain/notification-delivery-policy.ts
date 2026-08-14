/**
 * The `notification.delivery` retry policy and its validation (`APP4-G01`,
 * `ADR-APP4-001` §14; published by `APP4-B01-C1`).
 *
 * **There is no default in this file, and adding one would defeat it.** The two
 * values — the attempt budget and the backoff schedule — are business policy
 * with a version history in `policy_configurations`, and a fallback constant
 * here would be a second, unversioned source that silently wins whenever the
 * published one fails to load. A worker that cannot read the policy sends
 * nothing; that is the whole fail-closed behaviour, and it only works if there
 * is nothing to fall back to.
 *
 * The shape is validated rather than trusted, following
 * `runtime/policy/worker-runtime-policy.ts`: a result, never a throw, so a
 * misconfiguration leaves the process up and the secret undelivered instead of
 * crash-looping over a JSONB value an operator is in the middle of fixing.
 *
 * The relation `retryDelaysSeconds.length === maxAttempts - 1` is the one that
 * matters. A schedule shorter than the budget would leave the runtime asking for
 * a delay that does not exist; a longer one means the operator believes in more
 * attempts than the budget allows, and guessing which half they meant is worse
 * than refusing both.
 */

/** The canonical policy key this capability reads. Never publishes. */
export const NOTIFICATION_DELIVERY_POLICY_KEY = 'notification.delivery';

/** The value shape version stored alongside the JSONB value. */
export const NOTIFICATION_DELIVERY_POLICY_SCHEMA_VERSION = 1;

export interface NotificationDeliveryPolicy {
  readonly maxAttempts: number;
  /** One delay per retry: index 0 precedes attempt 2, index 1 attempt 3. */
  readonly retryDelaysSeconds: readonly number[];
}

export type NotificationPolicyProblem =
  | { readonly kind: 'NOTIFICATION_POLICY_MISSING' }
  | { readonly kind: 'NOTIFICATION_POLICY_INVALID'; readonly reasons: readonly string[] };

export type NotificationPolicyResult =
  | { readonly ok: true; readonly policy: NotificationDeliveryPolicy }
  | { readonly ok: false; readonly problem: NotificationPolicyProblem };

/** Sanity bounds, not business limits: an unbounded budget is a send loop. */
const MAX_ATTEMPTS_BOUND = 10;
const MAX_DELAY_SECONDS = 24 * 60 * 60;

export function parseNotificationDeliveryPolicy(value: unknown): NotificationPolicyResult {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {
      ok: false,
      problem: { kind: 'NOTIFICATION_POLICY_INVALID', reasons: ['value is not an object'] },
    };
  }

  const record = value as Record<string, unknown>;
  const reasons: string[] = [];
  const maxAttempts = record['maxAttempts'];
  const delays = record['retryDelaysSeconds'];

  if (typeof maxAttempts !== 'number' || !Number.isInteger(maxAttempts)) {
    reasons.push('maxAttempts must be an integer');
  } else if (maxAttempts < 1 || maxAttempts > MAX_ATTEMPTS_BOUND) {
    reasons.push(`maxAttempts must be between 1 and ${String(MAX_ATTEMPTS_BOUND)}`);
  }

  if (!Array.isArray(delays)) {
    reasons.push('retryDelaysSeconds must be an array');
  } else {
    for (const [index, delay] of delays.entries()) {
      if (typeof delay !== 'number' || !Number.isInteger(delay) || delay <= 0) {
        reasons.push(`retryDelaysSeconds[${String(index)}] must be a positive integer`);
      } else if (delay > MAX_DELAY_SECONDS) {
        reasons.push(`retryDelaysSeconds[${String(index)}] exceeds the sanity bound`);
      }
    }
  }

  if (reasons.length > 0) {
    return { ok: false, problem: { kind: 'NOTIFICATION_POLICY_INVALID', reasons } };
  }

  const policy: NotificationDeliveryPolicy = {
    maxAttempts: maxAttempts as number,
    retryDelaysSeconds: delays as number[],
  };
  if (policy.retryDelaysSeconds.length !== policy.maxAttempts - 1) {
    return {
      ok: false,
      problem: {
        kind: 'NOTIFICATION_POLICY_INVALID',
        reasons: ['retryDelaysSeconds must carry exactly maxAttempts - 1 entries'],
      },
    };
  }
  return { ok: true, policy };
}

/**
 * The delay before the attempt that follows `attemptNo`, in milliseconds.
 *
 * Throws on an attempt number outside the schedule rather than clamping: the
 * runtime only asks below the cap, so being asked past it means the budget and
 * the schedule have disagreed somewhere, and quietly reusing the last delay
 * would hide an unbounded retry behind a plausible number.
 */
export function retryDelayMsFor(policy: NotificationDeliveryPolicy, attemptNo: number): number {
  const delay = policy.retryDelaysSeconds[attemptNo - 1];
  if (delay === undefined) {
    throw new RangeError(
      `The notification delivery schedule has no delay after attempt ${String(attemptNo)}.`,
    );
  }
  return delay * 1_000;
}
