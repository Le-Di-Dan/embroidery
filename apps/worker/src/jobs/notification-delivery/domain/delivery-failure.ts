/**
 * The closed notification-delivery failure taxonomy (`APP4-W01`,
 * `ADR-APP4-001` §6.6).
 *
 * Closed for the same reason the worker taxonomy is: these classes are written
 * to `notification_delivery_attempts.error_class`, a column operators read, and
 * the one thing that must never reach it is the detail that explains a failure
 * best — a provider body carrying the recipient's address, a decrypt error
 * quoting a fragment, a stack trace. So the vocabulary is fixed here and the
 * *cause* is thrown away deliberately, never formatted into a message.
 *
 * Two axes, kept apart:
 *
 * - the **delivery** class, which explains the notification domain's own
 *   evidence row;
 * - the **worker** class, which explains the generic attempt ledger and drives
 *   the runtime's retry-versus-dead-letter decision.
 *
 * They are not the same fact. `NOTIFICATION_TRANSPORT_REJECTED` is precise for
 * an operator reading an intent's timeline and meaningless to the runtime, which
 * only needs to know the failure is deterministic.
 */
import { WorkerJobError } from '../../../runtime/errors/worker-job-error';
import type { WorkerErrorClass } from '../../../runtime/errors/worker-job-error';

export const NOTIFICATION_DELIVERY_FAILURES = [
  /** The transport could not be reached, or failed in a way that may pass. */
  'NOTIFICATION_TRANSPORT_UNAVAILABLE',
  /** The transport refused the message deterministically. Retrying repeats it. */
  'NOTIFICATION_TRANSPORT_REJECTED',
  /** The envelope did not open, or its plaintext was not the sealed shape. */
  'NOTIFICATION_ENVELOPE_UNREADABLE',
  /** The delivery material's own validity window has passed. */
  'NOTIFICATION_MATERIAL_EXPIRED',
  /** The envelope names a channel the intent does not, or one nobody serves. */
  'NOTIFICATION_CHANNEL_MISMATCH',
  /** The aggregate linkage names an intent that does not exist. */
  'NOTIFICATION_INTENT_UNRESOLVABLE',
  /** The retry policy is missing or malformed, so nothing may be sent. */
  'NOTIFICATION_POLICY_UNAVAILABLE',
] as const;

export type NotificationDeliveryFailure = (typeof NOTIFICATION_DELIVERY_FAILURES)[number];

/**
 * Which failures a later attempt could plausibly survive.
 *
 * `NOTIFICATION_POLICY_UNAVAILABLE` is retryable on purpose: an unconfigured
 * budget is an operator's omission, and dead-lettering a deliverable secret
 * because of it would destroy work that a published policy would have completed.
 */
const RETRYABLE: ReadonlySet<NotificationDeliveryFailure> = new Set([
  'NOTIFICATION_TRANSPORT_UNAVAILABLE',
  'NOTIFICATION_POLICY_UNAVAILABLE',
]);

/**
 * The worker class each delivery failure is reported to the runtime as.
 *
 * The three deterministic ones map onto classes the runtime treats as terminal
 * regardless of remaining budget, because they are: an envelope that will not
 * open on attempt 1 will not open on attempt 3, and the customer's secret cannot
 * be recovered by trying again.
 */
const WORKER_CLASS: Readonly<Record<NotificationDeliveryFailure, WorkerErrorClass>> = {
  NOTIFICATION_TRANSPORT_UNAVAILABLE: 'JOB_DEPENDENCY_UNAVAILABLE',
  NOTIFICATION_POLICY_UNAVAILABLE: 'JOB_DEPENDENCY_UNAVAILABLE',
  NOTIFICATION_TRANSPORT_REJECTED: 'JOB_INVARIANT_VIOLATION',
  NOTIFICATION_ENVELOPE_UNREADABLE: 'JOB_PAYLOAD_INVALID',
  NOTIFICATION_MATERIAL_EXPIRED: 'JOB_INVARIANT_VIOLATION',
  NOTIFICATION_CHANNEL_MISMATCH: 'JOB_INVARIANT_VIOLATION',
  NOTIFICATION_INTENT_UNRESOLVABLE: 'JOB_INVARIANT_VIOLATION',
};

export function isRetryableDeliveryFailure(failure: NotificationDeliveryFailure): boolean {
  return RETRYABLE.has(failure);
}

export function workerClassOf(failure: NotificationDeliveryFailure): WorkerErrorClass {
  return WORKER_CLASS[failure];
}

/**
 * The error the use case throws once it has recorded its own evidence.
 *
 * The message is the class and nothing else. Not an abbreviation of a longer
 * explanation — there is no longer explanation anywhere in this path, because
 * anything worth adding would be drawn from the plaintext, the ciphertext or a
 * provider response, and all three are forbidden sinks.
 */
export class NotificationDeliveryError extends WorkerJobError {
  readonly failure: NotificationDeliveryFailure;

  constructor(failure: NotificationDeliveryFailure) {
    super(workerClassOf(failure), failure);
    this.name = 'NotificationDeliveryError';
    this.failure = failure;
  }
}
