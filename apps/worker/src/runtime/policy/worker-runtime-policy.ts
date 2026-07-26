/**
 * The worker runtime policy and its validation (APP2-I02 §12).
 *
 * These nine values are **not** environment variables. They are operational
 * business policy, they must be auditable and versioned, and the platform
 * already owns exactly that mechanism (`policy_configurations` /
 * `policy_configuration_versions`, AGG-23). Duplicating them into env would
 * create a second source of truth with no version history and no reason to
 * prefer either copy.
 *
 * There is deliberately no production default. A worker with no policy is a
 * worker nobody has configured, and quietly inventing a lease duration for it
 * is how a fleet ends up with two different definitions of "expired".
 */

import { FATAL_EXIT_SAFETY_MS } from '../lifecycle/worker-process';

/** The canonical policy key this runtime reads. */
export const WORKER_RUNTIME_POLICY_KEY = 'worker.runtime';

/** The value shape version stored alongside the JSONB value. */
export const WORKER_RUNTIME_POLICY_SCHEMA_VERSION = 1;

export interface WorkerRuntimePolicy {
  readonly concurrency: number;
  readonly batchSize: number;
  readonly pollIntervalMs: number;
  readonly leaseDurationMs: number;
  readonly handlerTimeoutMs: number;
  readonly leaseSafetyMarginMs: number;
  readonly shutdownGraceMs: number;
  readonly maxAttempts: number;
  readonly backoffBaseMs: number;
  readonly backoffMaxMs: number;
}

const POLICY_FIELDS = [
  'concurrency',
  'batchSize',
  'pollIntervalMs',
  'leaseDurationMs',
  'handlerTimeoutMs',
  'leaseSafetyMarginMs',
  'shutdownGraceMs',
  'maxAttempts',
  'backoffBaseMs',
  'backoffMaxMs',
] as const;

export type WorkerPolicyProblem =
  | { readonly kind: 'WORKER_POLICY_MISSING' }
  | { readonly kind: 'WORKER_POLICY_INVALID'; readonly reasons: readonly string[] };

export type WorkerPolicyResult =
  | { readonly ok: true; readonly policy: WorkerRuntimePolicy }
  | { readonly ok: false; readonly problem: WorkerPolicyProblem };

/**
 * Upper bound on any single policy integer.
 *
 * Not a business limit — a sanity limit. `Number.MAX_SAFE_INTEGER` for
 * `leaseDurationMs` would produce a lease that never expires, which looks
 * identical to a stuck worker.
 */
const MAX_POLICY_VALUE = 24 * 60 * 60 * 1_000;

function positiveIntegerProblem(field: string, value: unknown): string | undefined {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    return `${field} must be an integer`;
  }
  if (value <= 0) {
    return `${field} must be greater than zero`;
  }
  if (value > MAX_POLICY_VALUE) {
    return `${field} exceeds the sanity bound of ${String(MAX_POLICY_VALUE)}`;
  }
  return undefined;
}

/**
 * Parses and validates a stored policy value.
 *
 * The four relations are checked as well as the individual bounds, because each
 * one is a real failure mode rather than a style preference:
 *
 * - `backoffBaseMs <= backoffMaxMs` — otherwise the cap shortens the first
 *   retry instead of bounding the last.
 * - `handlerTimeoutMs + leaseSafetyMarginMs <= leaseDurationMs` — otherwise a
 *   handler can still be running when its own lease expires and a second
 *   worker starts the same job.
 * - `shutdownGraceMs <= handlerTimeoutMs` — otherwise shutdown waits longer
 *   than the work can possibly take.
 * - `pollIntervalMs < leaseDurationMs` — otherwise a lease can expire between
 *   two polls and the queue drains slower than it leases.
 */
export function parseWorkerRuntimePolicy(value: unknown): WorkerPolicyResult {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {
      ok: false,
      problem: { kind: 'WORKER_POLICY_INVALID', reasons: ['value is not an object'] },
    };
  }

  const record = value as Record<string, unknown>;
  const reasons: string[] = [];

  for (const field of POLICY_FIELDS) {
    const problem = positiveIntegerProblem(field, record[field]);
    if (problem !== undefined) {
      reasons.push(problem);
    }
  }

  if (reasons.length > 0) {
    return { ok: false, problem: { kind: 'WORKER_POLICY_INVALID', reasons } };
  }

  const policy: WorkerRuntimePolicy = {
    concurrency: record['concurrency'] as number,
    batchSize: record['batchSize'] as number,
    pollIntervalMs: record['pollIntervalMs'] as number,
    leaseDurationMs: record['leaseDurationMs'] as number,
    handlerTimeoutMs: record['handlerTimeoutMs'] as number,
    leaseSafetyMarginMs: record['leaseSafetyMarginMs'] as number,
    shutdownGraceMs: record['shutdownGraceMs'] as number,
    maxAttempts: record['maxAttempts'] as number,
    backoffBaseMs: record['backoffBaseMs'] as number,
    backoffMaxMs: record['backoffMaxMs'] as number,
  };

  if (policy.backoffBaseMs > policy.backoffMaxMs) {
    reasons.push('backoffBaseMs must not exceed backoffMaxMs');
  }
  if (policy.handlerTimeoutMs + policy.leaseSafetyMarginMs > policy.leaseDurationMs) {
    reasons.push('handlerTimeoutMs + leaseSafetyMarginMs must not exceed leaseDurationMs');
  }
  if (policy.shutdownGraceMs > policy.handlerTimeoutMs) {
    reasons.push('shutdownGraceMs must not exceed handlerTimeoutMs');
  }
  if (policy.pollIntervalMs >= policy.leaseDurationMs) {
    reasons.push('pollIntervalMs must be shorter than leaseDurationMs');
  }
  if (policy.leaseSafetyMarginMs <= FATAL_EXIT_SAFETY_MS) {
    // The margin bounds how long a timed-out handler may take to unwind;
    // `fatalExitSafetyMs` is the budget for closing and exiting once it will
    // not. A margin at or below it would leave no room to unwind at all, so
    // every timeout would go straight to a fatal exit.
    reasons.push(
      `leaseSafetyMarginMs must exceed the ${String(FATAL_EXIT_SAFETY_MS)}ms fatal-exit reserve`,
    );
  }

  if (reasons.length > 0) {
    return { ok: false, problem: { kind: 'WORKER_POLICY_INVALID', reasons } };
  }
  return { ok: true, policy };
}
