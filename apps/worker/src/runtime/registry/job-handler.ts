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
  readonly attemptNo: number;
  readonly workerInstanceId: string;
  readonly correlationId: string;
  /** The handler's own idempotency identity for this job's durable effect. */
  readonly effectKey: string;
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
