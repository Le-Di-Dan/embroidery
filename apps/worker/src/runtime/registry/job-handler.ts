/**
 * The job handler contract (APP2-I02 §9).
 *
 * A handler declares what it consumes and how to identify the durable effect it
 * produces; the runtime owns everything else — claiming, leasing, timing out,
 * classifying, retrying and recording evidence. That split is what makes
 * at-least-once delivery survivable: the runtime guarantees the job runs *at
 * least* once, and `deriveEffectKey` is how the handler guarantees the effect
 * happens *at most* once.
 */
import type { BackgroundJobKind } from '@embroidery/persistence';

import type { WorkerErrorClass } from '../errors/worker-job-error';

export interface JobExecutionContext {
  readonly outboxEventId: bigint;
  /**
   * The claimed row's non-secret aggregate linkage.
   *
   * Carried through because it is the *only* place some events state what they
   * are about: `APP4-B01` puts the current notification intent id here and the
   * whole payload inside ciphertext, so a handler that could not read the
   * linkage would have to decrypt to discover its own subject — or, worse, use
   * a lineage id that happens to match on the first delivery and stops matching
   * on the first replay (`ADR-APP4-001` §6.5). Read-only; nothing about
   * claiming, leasing or completion changes.
   */
  readonly aggregateKind: string;
  readonly aggregateId: string;
  readonly attemptNo: number;
  readonly workerInstanceId: string;
  readonly correlationId: string;
  /** The handler's own idempotency identity for this job's durable effect. */
  readonly effectKey: string;
}

/**
 * A per-job attempt budget and backoff, when the global runtime schedule is not
 * the right one for a job kind.
 *
 * Optional, and absent for every handler that does not need it: the default
 * stays the bounded exponential schedule in `retry/retry-schedule.ts` under the
 * `worker.runtime` policy. A handler supplies one when its own **published
 * policy** names a schedule the global one cannot express — `notification.delivery`
 * locks `[60, 300]` seconds, which no `base × 2^n` curve produces
 * (`ADR-APP4-001` §14, `APP4-G01`).
 *
 * The runtime still owns the decision. It asks the plan for numbers and then
 * applies them through exactly the same completion path, so a plan can change
 * *when* a job is retried and how many times — never whether the retry is
 * recorded, guarded or leased.
 */
export interface JobRetryPlan {
  /** Total automatic attempts, including the first. */
  readonly maxAttempts: number;
  /** Delay before the attempt after `attemptNo`. Only called below the cap. */
  retryDelayMs(attemptNo: number): number;
}

/**
 * A precondition for a handler's event type being **claimed at all**
 * (`APP12-H04-C1` §3).
 *
 * The distinction this draws is the whole point. A handler that *runs* and
 * fails closed still spends an attempt, and a bounded attempt budget spent
 * against a deployment gap is a job that dead-letters for a reason that has
 * nothing to do with the job. `APP12-H04` measured that: the `staff-bootstrap`
 * Job publishes `notification.delivery` while the worker is already running, so
 * a worker that won the startup race burned all three attempts on every
 * customer credential in about four seconds and dead-lettered them permanently.
 *
 * A closed gate removes the event type from the claim filter instead, so the row
 * stays `PENDING`, unclaimed, with `attempt_count` untouched. Nothing is
 * dropped, nothing is deferred to a second queue, and a missing policy can never
 * be mistaken for a delivered notification.
 *
 * `refresh` is what lets the gate open without a restart, and it is called only
 * while the gate is closed, so a live capability's configuration is never
 * swapped underneath work already measured against it.
 */
export interface JobClaimGate {
  /** A stable, safe name for what is being waited on. Never a value. */
  readonly requirement: string;
  /** False while this handler's event type must not be claimed. */
  ready(): boolean;
  /** Re-checks the precondition. Called only while `ready()` is false. */
  refresh(): Promise<void>;
}

export interface PayloadValidationSuccess<TPayload> {
  readonly valid: true;
  readonly payload: TPayload;
}

export interface PayloadValidationFailure {
  readonly valid: false;
  /** Must be `JOB_PAYLOAD_INVALID` or `JOB_SCHEMA_UNSUPPORTED`; both terminal. */
  readonly errorClass: Extract<WorkerErrorClass, 'JOB_PAYLOAD_INVALID' | 'JOB_SCHEMA_UNSUPPORTED'>;
}

export type PayloadValidationResult<TPayload> =
  PayloadValidationSuccess<TPayload> | PayloadValidationFailure;

export interface JobHandler<TPayload = unknown> {
  readonly eventType: string;
  readonly jobKind: BackgroundJobKind;
  readonly payloadSchemaVersion: number;

  /**
   * The attempt budget and backoff for this job kind, when its own policy owns
   * them. Omit to use the global `worker.runtime` schedule.
   *
   * Read per completion rather than captured once, so a handler whose policy
   * loads asynchronously can return `undefined` until it has one — which fails
   * closed onto the global schedule instead of onto an invented default.
   */
  readonly retryPlan?: JobRetryPlan | undefined;

  /**
   * A precondition for this handler's event type being claimed at all.
   *
   * Omit when the handler has none — the overwhelmingly common case, and the
   * reason this is optional rather than a method every handler must implement.
   * Read per poll cycle for the same reason `retryPlan` is read per completion:
   * a capability whose policy loads asynchronously must be able to answer
   * "not yet" and then "yes" without the runtime caching the first answer.
   */
  readonly claimGate?: JobClaimGate | undefined;

  /**
   * Validates the raw JSONB payload before any effect is attempted.
   *
   * Returns a result rather than throwing so the terminal-versus-retryable
   * decision cannot depend on which error type happened to escape.
   */
  validatePayload(
    payload: unknown,
    payloadSchemaVersion: number,
  ): PayloadValidationResult<TPayload>;

  /**
   * A stable, non-empty, bounded identity for this job's durable effect.
   *
   * Must be a pure function of the payload and the job identity — never of the
   * attempt number or the clock, or two attempts at the same job would produce
   * two different effects, which is exactly what it exists to prevent.
   */
  deriveEffectKey(payload: TPayload, outboxEventId: bigint): string;

  /**
   * Performs the work. `abortSignal` fires at the handler timeout; a handler
   * that ignores it will be abandoned, not killed, so long-running work should
   * check it.
   */
  execute(payload: TPayload, context: JobExecutionContext, abortSignal: AbortSignal): Promise<void>;
}

/** Upper bound on an effect key, so it cannot become an unbounded sink. */
export const MAX_EFFECT_KEY_LENGTH = 200;
