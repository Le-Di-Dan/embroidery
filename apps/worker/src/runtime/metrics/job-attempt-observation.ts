/**
 * Projecting a job attempt onto its metric observation (`APP12-H03` §8).
 *
 * Extracted from `JobExecutionService` rather than inlined there: the execution
 * service is the runtime's most safety-critical file — lease ownership, the
 * timeout state machine, the guarded completion seam — and it is at its 400-line
 * limit. Telemetry vocabulary has no business competing for room with any of
 * that, and it is a mapping rather than a decision.
 */
import type { MetricJobOutcome } from '@embroidery/observability';

import type { AttemptSummary } from '../execution/job-execution.service';
import type { WorkerRuntimeMetrics } from './worker-metrics.providers';

/**
 * The bounded stand-in for a claim whose event type has no registered handler.
 *
 * The claim carries an *event type*, and an event type is an open vocabulary
 * that grows with every checkpoint — so it must never become a label (§5). A
 * non-zero rate on this series is itself the signal: a deployment is claiming
 * work it cannot run.
 */
export const UNKNOWN_JOB_TYPE = 'UNKNOWN_JOB_TYPE';

const FIRST_ATTEMPT = 1;
const MILLISECONDS_PER_SECOND = 1000;

/**
 * `AttemptSummary.outcome` as the metric vocabulary.
 *
 * A total, exhaustive `Record` rather than a lowercase of the input: an outcome
 * added to `AttemptSummary` stops compiling here, which is what stops it from
 * silently becoming an unlabelled series nothing alerts on.
 */
const JOB_OUTCOME_OF: Readonly<Record<AttemptSummary['outcome'], MetricJobOutcome>> = {
  SUCCEEDED: 'succeeded',
  FAILED_RETRYABLE: 'failed_retryable',
  FAILED_TERMINAL: 'failed_terminal',
  ABANDONED: 'abandoned',
  FATAL_HANDLER_UNRESPONSIVE: 'unresponsive',
};

export function jobOutcomeOf(outcome: AttemptSummary['outcome']): MetricJobOutcome {
  return JOB_OUTCOME_OF[outcome];
}

/**
 * Records one attempt.
 *
 * `retry` is `attemptNo > 1` — a fact of the claimed row, not a guess. The
 * attempt number itself is deliberately not a label: it is unbounded by
 * construction and stays a log field, which is where §12 puts every
 * high-cardinality correlation value.
 */
export function recordJobAttempt(
  metrics: WorkerRuntimeMetrics,
  jobType: string,
  outcome: MetricJobOutcome,
  durationMs: number,
  attemptNo: number,
): void {
  metrics.recordJobAttempt({
    jobType,
    outcome,
    durationSeconds: durationMs / MILLISECONDS_PER_SECOND,
    retry: attemptNo > FIRST_ATTEMPT,
  });
}
