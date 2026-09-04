/**
 * The closed label vocabularies of the Wave-1 metrics plane (`APP12-H03` §5, §7).
 *
 * Every value a metric label may carry is enumerated here, and every one of
 * them comes from the domain's own vocabulary rather than a parallel one
 * invented for telemetry: `origin` is `orders.origin`, `payment_kind` is
 * `payment_obligations.kind`, `job_type` is `BACKGROUND_JOB_KINDS`. §7 is
 * explicit that current domain vocabulary must be used and that no state may be
 * invented for a dashboard's convenience — a metric that says `PAID` when the
 * lifecycle has no such state teaches an operator something false.
 *
 * `outcome` is the exception, and is the most important definition in this
 * file. It is a telemetry concept, not a domain one, and it exists to answer
 * the single question every alert in §15 turns on: **is this the system
 * failing, or the business correctly saying no?**
 */

/**
 * The three-way split every commerce metric reports.
 *
 * - `success` — the operation committed. Recorded after the transaction
 *   resolves, never before, so a rollback can never present as one (§22);
 * - `refused` — the domain declined for a reason it publishes: no stock, a
 *   stale attempt, an unverified contact. Expected, frequent, and never an
 *   alert (§26);
 * - `system_error` — anything else. A database failure, a bug, an unmapped
 *   exception. This is the class alerts fire on.
 */
export const METRIC_OUTCOMES = ['success', 'refused', 'system_error'] as const;
export type MetricOutcome = (typeof METRIC_OUTCOMES)[number];

/** `orders.origin`. */
export const METRIC_ORIGINS = ['READY_MADE', 'CUSTOM'] as const;

/** `payment_obligations.kind`. */
export const METRIC_PAYMENT_KINDS = ['DEPOSIT', 'REMAINING', 'FULL'] as const;

/** Reservation lifecycle transitions this plane observes. */
export const METRIC_RESERVATION_TRANSITIONS = ['create', 'consume', 'release', 'expire'] as const;
export type MetricReservationTransition = (typeof METRIC_RESERVATION_TRANSITIONS)[number];

/** Fulfilment transitions this plane observes (`APP12-H03` §7). */
export const METRIC_FULFILMENT_TRANSITIONS = [
  'shipping_fee_set',
  'shipping_fee_corrected',
  'dispatch',
  'complete',
] as const;
export type MetricFulfilmentTransition = (typeof METRIC_FULFILMENT_TRANSITIONS)[number];

/**
 * Notification purposes this plane observes, as delivery operations.
 *
 * Derived from what a delivery actually carries — `DELIVERY_SECRET_KINDS` and
 * `SECURE_LINK_LANDINGS` — rather than from a wishlist of future purposes. A
 * delivery whose envelope could not be opened contributes `other`, which is
 * honest: the purpose is inside the ciphertext that failed to open.
 */
export const METRIC_NOTIFICATION_OPERATIONS = [
  'order_access',
  'request_access',
  'verification',
  'other',
] as const;
export type MetricNotificationOperation = (typeof METRIC_NOTIFICATION_OPERATIONS)[number];

/** Worker attempt outcomes, mirroring `AttemptSummary.outcome`. */
export const METRIC_JOB_OUTCOMES = [
  'succeeded',
  'failed_retryable',
  'failed_terminal',
  'abandoned',
  'unresponsive',
] as const;
export type MetricJobOutcome = (typeof METRIC_JOB_OUTCOMES)[number];

/** Application-boundary dependencies whose system errors are counted (§9). */
export const METRIC_DEPENDENCIES = ['database', 'object_storage'] as const;
export type MetricDependency = (typeof METRIC_DEPENDENCIES)[number];

/** HTTP status classes. A bounded projection of the status code (§6). */
export const METRIC_STATUS_CLASSES = ['1xx', '2xx', '3xx', '4xx', '5xx', 'other'] as const;

/** The one value `reason_class` falls back to when a code is unrecognisable. */
export const UNCLASSIFIED_REASON = 'other';

/**
 * A domain refusal code, shaped for a label.
 *
 * The domain error codes (`SKU_NOT_AVAILABLE`, `STALE_ATTEMPT`) are already a
 * closed, human-authored vocabulary, so they can be carried directly — that is
 * what makes "why is checkout refusing" answerable without a log query. What
 * cannot be carried is anything else: a message, a formatted value, a code from
 * a library. Anything that does not match the shape of a deliberate constant
 * becomes `other`, and the family's own cardinality cap is the backstop under
 * that.
 */
const REASON_PATTERN = /^[A-Z][A-Z0-9_]{0,47}$/;

export function reasonClass(code: string | undefined): string {
  if (code === undefined || !REASON_PATTERN.test(code)) {
    return UNCLASSIFIED_REASON;
  }
  return code;
}

/** Projects a status code onto its class. Unknown codes are `other`. */
export function statusClass(statusCode: number): string {
  if (!Number.isInteger(statusCode) || statusCode < 100 || statusCode > 599) {
    return 'other';
  }
  return `${String(Math.floor(statusCode / 100))}xx`;
}
