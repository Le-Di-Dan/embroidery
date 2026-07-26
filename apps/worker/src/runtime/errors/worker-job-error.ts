/**
 * The closed worker error taxonomy (APP2-I02 §10).
 *
 * Closed on purpose. Every failure a job can suffer has to land on one of these
 * classes before anything is written, because `outbox_events.last_error` and
 * `background_job_attempts.error_class` are read by operators and must never
 * become a sink for provider messages, stack traces, payload fragments or PII.
 * A handler that throws a raw `Error` gets classified here; its message is used
 * to decide *nothing* and is never persisted.
 */

export const WORKER_ERROR_CLASSES = [
  'JOB_PAYLOAD_INVALID',
  'JOB_SCHEMA_UNSUPPORTED',
  'JOB_HANDLER_TIMEOUT',
  'JOB_DEPENDENCY_UNAVAILABLE',
  'JOB_TRANSIENT_FAILURE',
  'JOB_INVARIANT_VIOLATION',
  'JOB_UNKNOWN_FAILURE',
  'STALE_JOB_LEASE',
  'WORKER_LEASE_EXPIRED',
] as const;

export type WorkerErrorClass = (typeof WORKER_ERROR_CLASSES)[number];

/**
 * Classes that are terminal no matter how many attempts remain.
 *
 * A malformed payload, an unsupported schema version and a violated invariant
 * are all deterministic: attempt 5 will fail exactly like attempt 1, so
 * retrying only delays the dead-letter row an operator has to look at anyway.
 */
const ALWAYS_TERMINAL: ReadonlySet<WorkerErrorClass> = new Set([
  'JOB_PAYLOAD_INVALID',
  'JOB_SCHEMA_UNSUPPORTED',
  'JOB_INVARIANT_VIOLATION',
]);

/** Classes the runtime raises itself; a handler must never produce them. */
const RUNTIME_ONLY: ReadonlySet<WorkerErrorClass> = new Set([
  'STALE_JOB_LEASE',
  'WORKER_LEASE_EXPIRED',
]);

export type FailureDisposition = 'RETRYABLE' | 'TERMINAL';

/**
 * A failure a handler (or the runtime) can classify deliberately.
 *
 * The `message` stays in memory for logs the operator reads live; only
 * `errorClass` is ever persisted.
 */
export class WorkerJobError extends Error {
  readonly errorClass: WorkerErrorClass;

  constructor(errorClass: WorkerErrorClass, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'WorkerJobError';
    this.errorClass = errorClass;
  }
}

/**
 * Maps any thrown value onto the taxonomy.
 *
 * Anything unrecognised becomes `JOB_UNKNOWN_FAILURE` rather than being guessed
 * at from its message: string-matching a provider's wording is how a
 * classification silently stops working after a dependency upgrade.
 */
export function classifyHandlerError(error: unknown): WorkerErrorClass {
  if (error instanceof WorkerJobError && !RUNTIME_ONLY.has(error.errorClass)) {
    return error.errorClass;
  }
  return 'JOB_UNKNOWN_FAILURE';
}

/**
 * Decides retry versus dead-letter (§10, §11).
 *
 * `JOB_UNKNOWN_FAILURE` is retryable before the cap and terminal at it: an
 * unclassified failure is usually transient, but an unbounded retry of one
 * nobody understands is an infinite loop with a database write in it.
 */
export function dispositionOf(
  errorClass: WorkerErrorClass,
  attemptNo: number,
  maxAttempts: number,
): FailureDisposition {
  if (ALWAYS_TERMINAL.has(errorClass)) {
    return 'TERMINAL';
  }
  return attemptNo >= maxAttempts ? 'TERMINAL' : 'RETRYABLE';
}

export function isWorkerErrorClass(value: string): value is WorkerErrorClass {
  return (WORKER_ERROR_CLASSES as readonly string[]).includes(value);
}
