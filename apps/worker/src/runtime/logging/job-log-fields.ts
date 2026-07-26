/**
 * The allow-list projection for every worker log line (APP2-I02 §13).
 *
 * An allow-list, not a redaction pass. Redaction has to anticipate every shape
 * a secret can arrive in; an allow-list only has to name the fields an operator
 * actually needs. Payloads, object bytes, cookies, credentials and stack traces
 * are not in the list, so no future edit can leak one by forgetting a rule.
 */
import type { JobCorrelationContext } from '../context/job-correlation';

export interface JobLogFields {
  readonly correlationId: string;
  readonly jobKind: string;
  readonly jobKey: string;
  readonly attemptNo: number;
  readonly workerInstanceId: string;
  readonly eventType: string;
  readonly outcome?: string;
  readonly errorClass?: string;
  readonly durationMs?: number;
}

export interface JobLogOutcome {
  readonly outcome?: string;
  readonly errorClass?: string;
  readonly durationMs?: number;
}

/**
 * Projects the active attempt onto the allowed fields.
 *
 * Built key by key because the workspace enables `exactOptionalPropertyTypes`:
 * spreading an object with `undefined` values would not be assignable, and
 * silencing that would defeat the point of the optional fields.
 */
export function projectJobLogFields(
  context: JobCorrelationContext,
  outcome: JobLogOutcome = {},
): JobLogFields {
  const fields: {
    correlationId: string;
    jobKind: string;
    jobKey: string;
    attemptNo: number;
    workerInstanceId: string;
    eventType: string;
    outcome?: string;
    errorClass?: string;
    durationMs?: number;
  } = {
    correlationId: context.correlationId,
    jobKind: context.jobKind,
    jobKey: context.outboxEventId.toString(),
    attemptNo: context.attemptNo,
    workerInstanceId: context.workerInstanceId,
    eventType: context.eventType,
  };

  if (outcome.outcome !== undefined) {
    fields.outcome = outcome.outcome;
  }
  if (outcome.errorClass !== undefined) {
    fields.errorClass = outcome.errorClass;
  }
  if (outcome.durationMs !== undefined) {
    fields.durationMs = outcome.durationMs;
  }
  return fields;
}

/** One-line JSON, matching the API's structured-logging shape (IMP-D021). */
export function formatJobLogLine(fields: JobLogFields): string {
  return JSON.stringify(fields);
}
