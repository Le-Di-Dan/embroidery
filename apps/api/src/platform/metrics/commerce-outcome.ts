/**
 * The refusal-versus-failure split, applied to a thrown error
 * (`APP12-H03` §7, §15, §22, §26.26).
 *
 * This is the single most consequential classification in the checkpoint. Every
 * alert in §15 fires on `system_error` and must never fire on `refused`, so a
 * misclassification here is either an alert that wakes an operator because a
 * customer ordered more units than exist, or an alert that stays silent while
 * the database is unreachable.
 *
 * The rule is deliberately conservative and asymmetric: an error is `refused`
 * **only** when the domain's own published refusal type recognises it.
 * Everything else — including an error nobody has classified yet — is
 * `system_error`. Guessing the other way round would let a new, unmapped
 * failure disappear into the refusal series and never be alerted on, which is
 * exactly the failure mode "expected refusal" alerting exists to avoid.
 */
import { performance } from 'node:perf_hooks';

import { reasonClass, UNCLASSIFIED_REASON, type MetricOutcome } from '@embroidery/observability';

export interface OutcomeClassification {
  readonly outcome: MetricOutcome;
  readonly reasonClass: string;
}

/** The observation a committed operation records. */
export const SUCCEEDED: OutcomeClassification = {
  outcome: 'success',
  reasonClass: UNCLASSIFIED_REASON,
};

/**
 * Recognises a domain refusal and names it. Returns `undefined` for anything
 * the domain does not publish as a refusal — which the caller then records as
 * a system error.
 */
export type RefusalRecognizer = (error: unknown) => string | undefined;

export function classifyOutcome(
  error: unknown,
  recognize: RefusalRecognizer,
): OutcomeClassification {
  const refusal = recognize(error);
  if (refusal === undefined) {
    return { outcome: 'system_error', reasonClass: UNCLASSIFIED_REASON };
  }
  return { outcome: 'refused', reasonClass: reasonClass(refusal) };
}

/**
 * A monotonic stopwatch in seconds.
 *
 * `performance.now()` rather than `Date.now()`: a duration measured across a
 * wall-clock adjustment would be negative, and a negative observation is
 * discarded by the histogram — silently losing the data point that a clock
 * change happened during.
 */
export function startMetricTimer(): () => number {
  const startedAt = performance.now();
  return () => (performance.now() - startedAt) / 1000;
}
