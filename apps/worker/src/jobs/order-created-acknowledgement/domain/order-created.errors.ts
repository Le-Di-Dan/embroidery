/**
 * The one refusal an `order.created` acknowledgement can raise
 * (`APP12-H03-C1` §10).
 *
 * A handler that performs no work has almost nothing to refuse — which is the
 * point of the exception that remains. The acknowledgement's whole value is that
 * it settles a row nobody owes anything for; settling a row whose linkage
 * contradicts its payload would settle a **producer defect**, and the permanent
 * `PENDING` row was at least evidence. So the one deterministic contradiction is
 * refused terminally and reaches an operator through the delivered dead-letter
 * path, exactly as `ReservationRefusalError` does for the same contradiction on
 * `payment.verified`.
 *
 * Messages stay in memory for the operator's live log. Only `errorClass` is
 * persisted, and only `reason` is a stable identifier; neither carries a
 * database value, an amount or a customer fact.
 */
import { WorkerJobError } from '../../../runtime/errors/worker-job-error';

export const ACKNOWLEDGEMENT_REFUSALS = [
  /** The event's aggregate linkage and its payload name different orders. */
  'EVENT_LINKAGE_MISMATCH',
] as const;

export type AcknowledgementRefusal = (typeof ACKNOWLEDGEMENT_REFUSALS)[number];

export class AcknowledgementRefusalError extends WorkerJobError {
  readonly reason: AcknowledgementRefusal;

  constructor(reason: AcknowledgementRefusal, message: string) {
    super('JOB_INVARIANT_VIOLATION', message);
    this.name = 'AcknowledgementRefusalError';
    this.reason = reason;
  }
}

export function acknowledgementRefusal(
  reason: AcknowledgementRefusal,
  message: string,
): AcknowledgementRefusalError {
  return new AcknowledgementRefusalError(reason, message);
}
