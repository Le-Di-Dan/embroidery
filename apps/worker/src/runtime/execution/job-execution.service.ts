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
import { WorkerFatalService } from '../lifecycle/worker-fatal.service';
import { FATAL_EXIT_SAFETY_MS } from '../lifecycle/worker-process';
import { formatJobLogLine, projectJobLogFields } from '../logging/job-log-fields';
import {
  UNKNOWN_JOB_TYPE,
  jobOutcomeOf,
  recordJobAttempt,
} from '../metrics/job-attempt-observation';
import { WorkerRuntimeMetrics } from '../metrics/worker-metrics.providers';
import type { JobHandler } from '../registry/job-handler';
import { MAX_EFFECT_KEY_LENGTH } from '../registry/job-handler';
import { JobHandlerRegistry } from '../registry/job-handler.registry';
import { retryDelayMs } from '../retry/retry-schedule';
import type { WorkerRuntimePolicy } from '../policy/worker-runtime-policy';

export interface AttemptSummary {
  readonly outboxEventId: bigint;
  readonly attemptNo: number;
  readonly outcome:
    | 'SUCCEEDED'
    | 'FAILED_RETRYABLE'
    | 'FAILED_TERMINAL'
    | 'ABANDONED'
    | 'FATAL_HANDLER_UNRESPONSIVE';
  readonly errorClass?: WorkerErrorClass;
  readonly stale: boolean;
}

/** The handler is still running past the hard-stop deadline. */
const UNRESPONSIVE = Symbol('UNRESPONSIVE');
const ABORTED = Symbol('ABORTED');
const HARD_STOP = Symbol('HARD_STOP');

type Settled = { readonly ok: true } | { readonly ok: false; readonly error: unknown };

@Injectable()
export class JobExecutionService {
  private readonly logger = new Logger(JobExecutionService.name);

  constructor(
    private readonly registry: JobHandlerRegistry,
    private readonly queue: WorkerJobQueueRepository,
    private readonly transactions: TransactionManager,
    private readonly fatal: WorkerFatalService,
    @Inject(WORKER_CLOCK) private readonly clock: WorkerClock,
    private readonly metrics: WorkerRuntimeMetrics,
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
      // No handler, so no `jobKind`: the claim carries an event type, and an
      // event type is an open vocabulary that must never become a label
      // (`APP12-H03` §5). `UNKNOWN_JOB_TYPE` is the bounded stand-in, and a
      // non-zero rate on it is itself the signal — a deployment is claiming
      // work it cannot run.
      this.metrics.recordJobClaimed(UNKNOWN_JOB_TYPE);
      recordJobAttempt(this.metrics, UNKNOWN_JOB_TYPE, 'abandoned', 0, job.attemptNo);
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

    // `APP12-H03` §8 — the shared execution boundary, instrumented once. A job
    // kind a later checkpoint registers is observable the moment it is
    // registered; nobody has to remember to instrument a handler.
    this.metrics.recordJobClaimed(handler.jobKind);

    // Bound for the whole attempt: validation, effect-key derivation, handler
    // execution and completion logging all read the same correlation.
    return jobCorrelation.run(context, async () => {
      const startedAt = this.clock.now();
      const failure = await this.attempt(job, handler, policy, workerInstanceId);
      const durationMs = this.clock.now() - startedAt;

      if (failure === UNRESPONSIVE) {
        // No completion of any kind. The row stays exactly as claimed —
        // `PENDING`, owned by this worker, same attempt, same lease deadline —
        // so nothing can pick it up until the lease expires, by which time this
        // process (and the runaway handler inside it) no longer exists.
        recordJobAttempt(this.metrics, handler.jobKind, 'unresponsive', durationMs, job.attemptNo);
        await this.fatal.triggerUnresponsiveHandler(projectJobLogFields(context, { durationMs }));
        return {
          outboxEventId: job.outboxEventId,
          attemptNo: job.attemptNo,
          outcome: 'FATAL_HANDLER_UNRESPONSIVE' as const,
          errorClass: 'JOB_HANDLER_TIMEOUT' as const,
          stale: false,
        };
      }

      const summary =
        failure === undefined
          ? await this.completeSuccess(job, handler, policy, workerInstanceId)
          : await this.completeFailure(job, handler, policy, workerInstanceId, failure);

      recordJobAttempt(
        this.metrics,
        handler.jobKind,
        jobOutcomeOf(summary.outcome),
        durationMs,
        job.attemptNo,
      );
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

  /**
   * Runs validation and the handler under the timeout state machine
   * (APP2-I02-C1 §5).
   *
   * Returns the error class, `undefined` on success, or `UNRESPONSIVE` when the
   * handler is still running past the hard-stop deadline.
   *
   * The handler promise is **never detached**. An earlier version raced it
   * against the abort and walked away, which released the lease while the
   * handler was still executing — so a retry of the same job, with the same
   * effect key, could run concurrently with it. Node cannot cancel a running
   * promise, so the only two safe endings are "the handler settled" and "this
   * process dies".
   */
  private async attempt(
    job: ClaimedWorkerJob,
    handler: JobHandler,
    policy: WorkerRuntimePolicy,
    workerInstanceId: string,
  ): Promise<WorkerErrorClass | typeof UNRESPONSIVE | undefined> {
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
    let abortRequestedAt: number | undefined;
    const cancelTimer = this.clock.timer(policy.handlerTimeoutMs, () => {
      abortRequestedAt = this.clock.now();
      controller.abort(new WorkerJobError('JOB_HANDLER_TIMEOUT', 'Handler timed out.'));
    });

    // Settled once, reflected forever. Attaching both branches here also means
    // the promise can never surface as an unhandled rejection while the runtime
    // is waiting on the abort.
    const execution: Promise<Settled> = (async (): Promise<Settled> => {
      try {
        await handler.execute(
          validation.payload,
          {
            outboxEventId: job.outboxEventId,
            // Straight off the claimed row. The runtime reads nothing into it
            // and derives nothing from it.
            aggregateKind: job.aggregateKind,
            aggregateId: job.aggregateId,
            attemptNo: job.attemptNo,
            workerInstanceId,
            correlationId: buildCorrelationId(handler.jobKind, job.outboxEventId, job.attemptNo),
            effectKey,
          },
          controller.signal,
        );
        return { ok: true };
      } catch (error: unknown) {
        return { ok: false, error };
      }
    })();

    try {
      const first = await Promise.race([execution, aborted(controller.signal)]);
      if (first !== ABORTED) {
        return first.ok ? undefined : classifyHandlerError(first.error);
      }

      // Timed out: abort requested, now wait — bounded — for the handler to
      // notice. `abortRequestedAt` is set by the timer that just fired.
      const waitMs = hardStopWaitMs(
        abortRequestedAt ?? this.clock.now(),
        this.clock.now(),
        job.leaseExpiresAt,
        policy.leaseSafetyMarginMs,
      );
      const settled = await Promise.race([
        execution,
        this.clock.sleep(waitMs).then(() => HARD_STOP),
      ]);

      if (settled === HARD_STOP) {
        return UNRESPONSIVE;
      }
      // Cooperative, but still a timeout. A handler that finishes *after* its
      // abort must not be recorded as `SUCCEEDED`: the runtime already decided
      // the attempt was over, and calling it a success would hide a handler
      // that routinely overruns its budget.
      return 'JOB_HANDLER_TIMEOUT';
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

    // A handler's published policy may own its own budget and backoff; absent
    // one, the global `worker.runtime` schedule applies unchanged. Either way
    // the completion below is the same guarded write — the plan supplies two
    // numbers, never a second lifecycle.
    const plan = handler.retryPlan;
    const maxAttempts = plan?.maxAttempts ?? policy.maxAttempts;
    const disposition = dispositionOf(errorClass, job.attemptNo, maxAttempts);

    const result = await this.transactions.runInTransaction(() =>
      disposition === 'TERMINAL'
        ? this.queue.completeTerminalAttempt({ ...guard, errorClass })
        : this.queue.completeRetryableAttempt({
            ...guard,
            retryDelayMs:
              plan === undefined
                ? retryDelayMs(job.attemptNo, policy.backoffBaseMs, policy.backoffMaxMs)
                : plan.retryDelayMs(job.attemptNo),
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

/** Resolves when the attempt's abort signal fires. Never rejects. */
function aborted(signal: AbortSignal): Promise<typeof ABORTED> {
  if (signal.aborted) {
    return Promise.resolve(ABORTED);
  }
  return new Promise<typeof ABORTED>((resolve) => {
    signal.addEventListener(
      'abort',
      () => {
        resolve(ABORTED);
      },
      { once: true },
    );
  });
}

/**
 * How long to keep waiting for a timed-out handler (APP2-I02-C1 §5.3):
 *
 *     min(timeoutInstant + leaseSafetyMarginMs, leaseExpiresAt − fatalExitSafetyMs)
 *
 * The margin term bounds how long a cooperative handler may take to unwind. The
 * lease term is the hard one: whatever happens, this process must have decided
 * and exited before another worker can legally reclaim the row. `leaseExpiresAt`
 * is the database's instant compared against this process's clock, so
 * `fatalExitSafetyMs` also absorbs the small skew between them; policy
 * validation keeps `leaseSafetyMarginMs` larger, so the lease term only ever
 * wins when the lease really is about to expire.
 */
export function hardStopWaitMs(
  abortRequestedAt: number,
  now: number,
  leaseExpiresAt: Date,
  leaseSafetyMarginMs: number,
): number {
  const byMargin = abortRequestedAt + leaseSafetyMarginMs;
  const byLease = leaseExpiresAt.getTime() - FATAL_EXIT_SAFETY_MS;
  return Math.max(0, Math.min(byMargin, byLease) - now);
}
