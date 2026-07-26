/**
 * One attempt, start to finish (APP2-I02 §9, §10, §11, §14).
 *
 * Everything a single attempt does lives here: resolve the handler, reject an
 * unusable payload before any effect is possible, bind correlation, run the
 * handler under a bounded timeout, classify whatever comes back, and record the
 * outcome through the guarded completion seam.
 *
 * This service never throws for a job failure. A handler blowing up is an
 * expected event in an at-least-once runtime, and letting it propagate would
 * take sibling jobs down with it.
 */
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ClaimedWorkerJob } from '@embroidery/persistence';
import { TransactionManager, WorkerJobQueueRepository } from '@embroidery/persistence';

import type { WorkerClock } from '../clock/worker-clock';
import { WORKER_CLOCK } from '../clock/worker-clock';
import { jobCorrelation } from '../context/job-correlation';
import type { WorkerErrorClass } from '../errors/worker-job-error';
import { WorkerJobError, classifyHandlerError, dispositionOf } from '../errors/worker-job-error';
import { buildCorrelationId } from '../identity/worker-identity';
import { formatJobLogLine, projectJobLogFields } from '../logging/job-log-fields';
import type { JobHandler } from '../registry/job-handler';
import { MAX_EFFECT_KEY_LENGTH } from '../registry/job-handler';
import { JobHandlerRegistry } from '../registry/job-handler.registry';
import { retryDelayMs } from '../retry/retry-schedule';
import type { WorkerRuntimePolicy } from '../policy/worker-runtime-policy';

export interface AttemptSummary {
  readonly outboxEventId: bigint;
  readonly attemptNo: number;
  readonly outcome: 'SUCCEEDED' | 'FAILED_RETRYABLE' | 'FAILED_TERMINAL' | 'ABANDONED';
  readonly errorClass?: WorkerErrorClass;
  readonly stale: boolean;
}

@Injectable()
export class JobExecutionService {
  private readonly logger = new Logger(JobExecutionService.name);

  constructor(
    private readonly registry: JobHandlerRegistry,
    private readonly queue: WorkerJobQueueRepository,
    private readonly transactions: TransactionManager,
    @Inject(WORKER_CLOCK) private readonly clock: WorkerClock,
  ) {}

  async run(
    job: ClaimedWorkerJob,
    policy: WorkerRuntimePolicy,
    workerInstanceId: string,
  ): Promise<AttemptSummary> {
    const handler = this.registry.resolve(job.eventType);
    if (handler === undefined) {
      // Unreachable through the claim filter, which only asks for registered
      // types. If it ever happens, abandoning the lease is the safe response:
      // the job is left for a deployment that can run it rather than
      // dead-lettered by one that cannot.
      this.logger.error(
        `Claimed event type "${job.eventType}" has no handler; abandoning the lease.`,
      );
      return {
        outboxEventId: job.outboxEventId,
        attemptNo: job.attemptNo,
        outcome: 'ABANDONED',
        stale: false,
      };
    }

    const context = {
      correlationId: buildCorrelationId(handler.jobKind, job.outboxEventId, job.attemptNo),
      outboxEventId: job.outboxEventId,
      attemptNo: job.attemptNo,
      workerInstanceId,
      eventType: job.eventType,
      jobKind: handler.jobKind,
    };

    // Bound for the whole attempt: validation, effect-key derivation, handler
    // execution and completion logging all read the same correlation.
    return jobCorrelation.run(context, async () => {
      const startedAt = this.clock.now();
      const failure = await this.attempt(job, handler, policy, workerInstanceId);
      const durationMs = this.clock.now() - startedAt;

      const summary =
        failure === undefined
          ? await this.completeSuccess(job, handler, policy, workerInstanceId)
          : await this.completeFailure(job, handler, policy, workerInstanceId, failure);

      this.logger.log(
        formatJobLogLine(
          projectJobLogFields(context, {
            outcome: summary.outcome,
            ...(summary.errorClass === undefined ? {} : { errorClass: summary.errorClass }),
            durationMs,
          }),
        ),
      );
      return summary;
    });
  }

  /** Runs validation and the handler. Returns the error class, or undefined on success. */
  private async attempt(
    job: ClaimedWorkerJob,
    handler: JobHandler,
    policy: WorkerRuntimePolicy,
    workerInstanceId: string,
  ): Promise<WorkerErrorClass | undefined> {
    if (job.payloadSchemaVersion !== handler.payloadSchemaVersion) {
      return 'JOB_SCHEMA_UNSUPPORTED';
    }

    const validation = handler.validatePayload(job.payload, job.payloadSchemaVersion);
    if (!validation.valid) {
      return validation.errorClass;
    }

    const effectKey = handler.deriveEffectKey(validation.payload, job.outboxEventId);
    if (effectKey === '' || effectKey.length > MAX_EFFECT_KEY_LENGTH) {
      // A blank or unbounded effect key means the handler cannot deduplicate
      // its own effect, so running it would break at-most-once for the effect.
      return 'JOB_INVARIANT_VIOLATION';
    }

    const controller = new AbortController();
    const cancelTimer = this.clock.timer(policy.handlerTimeoutMs, () => {
      controller.abort(new WorkerJobError('JOB_HANDLER_TIMEOUT', 'Handler timed out.'));
    });

    try {
      await Promise.race([
        handler.execute(
          validation.payload,
          {
            outboxEventId: job.outboxEventId,
            attemptNo: job.attemptNo,
            workerInstanceId,
            correlationId: buildCorrelationId(handler.jobKind, job.outboxEventId, job.attemptNo),
            effectKey,
          },
          controller.signal,
        ),
        abortRejection(controller.signal),
      ]);
      return undefined;
    } catch (error: unknown) {
      return classifyHandlerError(error);
    } finally {
      // Always cleared, including on success: a live timer per attempt would
      // hold the event loop open and delay shutdown by the timeout.
      cancelTimer();
    }
  }

  private async completeSuccess(
    job: ClaimedWorkerJob,
    handler: JobHandler,
    _policy: WorkerRuntimePolicy,
    workerInstanceId: string,
  ): Promise<AttemptSummary> {
    const result = await this.transactions.runInTransaction(() =>
      this.queue.completeSucceededAttempt({
        outboxEventId: job.outboxEventId,
        workerInstanceId,
        attemptNo: job.attemptNo,
        jobKind: handler.jobKind,
      }),
    );
    return {
      outboxEventId: job.outboxEventId,
      attemptNo: job.attemptNo,
      outcome: 'SUCCEEDED',
      stale: result.outcome === 'STALE_JOB_LEASE',
    };
  }

  private async completeFailure(
    job: ClaimedWorkerJob,
    handler: JobHandler,
    policy: WorkerRuntimePolicy,
    workerInstanceId: string,
    errorClass: WorkerErrorClass,
  ): Promise<AttemptSummary> {
    const guard = {
      outboxEventId: job.outboxEventId,
      workerInstanceId,
      attemptNo: job.attemptNo,
      jobKind: handler.jobKind,
    };

    const disposition = dispositionOf(errorClass, job.attemptNo, policy.maxAttempts);

    const result = await this.transactions.runInTransaction(() =>
      disposition === 'TERMINAL'
        ? this.queue.completeTerminalAttempt({ ...guard, errorClass })
        : this.queue.completeRetryableAttempt({
            ...guard,
            retryDelayMs: retryDelayMs(job.attemptNo, policy.backoffBaseMs, policy.backoffMaxMs),
            errorClass,
          }),
    );

    return {
      outboxEventId: job.outboxEventId,
      attemptNo: job.attemptNo,
      outcome: disposition === 'TERMINAL' ? 'FAILED_TERMINAL' : 'FAILED_RETRYABLE',
      errorClass,
      stale: result.outcome === 'STALE_JOB_LEASE',
    };
  }
}

/**
 * A promise that rejects when the attempt's signal aborts.
 *
 * Racing against the handler rather than waiting for it: a handler that ignores
 * its `AbortSignal` is abandoned at the timeout, not killed — Node cannot kill
 * it — so the runtime must stop waiting on its own.
 */
function abortRejection(signal: AbortSignal): Promise<never> {
  return new Promise<never>((_resolve, reject) => {
    const fail = (): void => {
      const reason: unknown = signal.reason;
      reject(
        reason instanceof WorkerJobError
          ? reason
          : new WorkerJobError('JOB_HANDLER_TIMEOUT', 'Handler timed out.'),
      );
    };
    if (signal.aborted) {
      fail();
      return;
    }
    signal.addEventListener('abort', fail, { once: true });
  });
}
