/**
 * The closed refusal set of the `payment.verified` reservation (`APP8-W01`
 * §10, §13).
 *
 * Two families, split by whether the answer can ever change:
 *
 * - **deterministic** — the event names an order no row answers to, or its
 *   linkage contradicts its payload. Attempt five reads what attempt one read,
 *   so these are `JOB_INVARIANT_VIOLATION` and terminal on the first failure.
 *   The delivered `background_job_attempts` dead-letter row is the operator
 *   alert path; nothing else is invented here.
 * - **operational** — the stock anchor has not been created yet, availability is
 *   short, or the deposit is not satisfied. `TR-LC17-04` says what happens in so
 *   many words: *"insufficient stock → order REQUIRES attention: reservation NOT
 *   created, admin alerted, order stays DEPOSIT_PAID with blocked production"*.
 *   The resolution is an operator restocking, adjusting or creating the anchor —
 *   a change in the world, not in the code. So these take the runtime's bounded
 *   retry and dead-letter at the cap, which is the existing failure semantics
 *   `APP8-W01` §9 and §10 require rather than a new manual-review subsystem.
 *
 * ### What a refusal must never do
 *
 * Not reduce a quantity, not backorder, not substitute a SKU, not fabricate
 * stock, and not create the anchor `APP8-B01` deliberately made an Admin
 * operation. It names a reason and lets the transaction roll back, which is also
 * what makes the multi-SKU set atomic (§7): a failure on the third SKU leaves no
 * reservation and no ledger row for the first two.
 *
 * Messages stay in memory for the operator's live log. Only `errorClass` is
 * persisted, and only `reason` is a stable identifier — neither ever carries a
 * database value, an amount, a customer fact or a storage key.
 */
import { isPersistenceError } from '@embroidery/database';

import { WorkerJobError } from '../../../runtime/errors/worker-job-error';

export const RESERVATION_REFUSALS = [
  /** The payload named an order no row answers to. */
  'ORDER_NOT_FOUND',
  /** The event's aggregate linkage and its payload name different attempts. */
  'EVENT_LINKAGE_MISMATCH',
] as const;

export type ReservationRefusal = (typeof RESERVATION_REFUSALS)[number];

/**
 * The canonical inventory guard codes this consumer recognises as operational.
 *
 * Every one is raised by `@embroidery/persistence`, not restated here: the
 * worker owns no availability arithmetic, no anchor check and no deposit
 * predicate. This set only decides *how the runtime should treat* what the one
 * implementation already refused.
 *
 * `RECORD_NOT_FOUND` is `StockAnchor.requireLocked`'s answer to a SKU with no
 * `sku_stocks` row — the missing anchor of §9, which W01 must not lazily create.
 */
const OPERATIONAL_INVENTORY_CODES: ReadonlySet<string> = new Set([
  'INSUFFICIENT_STOCK',
  'RESERVATION_NOT_ELIGIBLE',
  'RECORD_NOT_FOUND',
  'QUANTITY_INVALID',
]);

export class ReservationRefusalError extends WorkerJobError {
  readonly reason: ReservationRefusal;

  constructor(reason: ReservationRefusal, message: string) {
    super('JOB_INVARIANT_VIOLATION', message);
    this.name = 'ReservationRefusalError';
    this.reason = reason;
  }
}

export function reservationRefusal(
  reason: ReservationRefusal,
  message: string,
): ReservationRefusalError {
  return new ReservationRefusalError(reason, message);
}

/** The claim is held by a live attempt; the runtime should come back. */
export function reservationInProgress(): WorkerJobError {
  return new WorkerJobError(
    'JOB_TRANSIENT_FAILURE',
    'Another attempt is reserving inventory for this order right now.',
  );
}

/**
 * Classifies whatever the canonical inventory repository threw.
 *
 * A recognised operational guard becomes `JOB_TRANSIENT_FAILURE` — retried on
 * the global schedule and dead-lettered at the cap, so a missing anchor or a
 * short shelf reaches an operator through the delivered path. Anything else is
 * left unclassified rather than guessed at from a message, exactly as the
 * delivered taxonomy requires: `JOB_UNKNOWN_FAILURE` is retryable below the cap
 * and terminal at it.
 */
export function classifyReservationFailure(error: unknown): WorkerJobError {
  if (error instanceof WorkerJobError) {
    return error;
  }
  if (isPersistenceError(error) && OPERATIONAL_INVENTORY_CODES.has(error.code)) {
    return new WorkerJobError(
      'JOB_TRANSIENT_FAILURE',
      `Inventory refused the reservation: ${error.code}.`,
      { cause: error },
    );
  }
  return new WorkerJobError('JOB_UNKNOWN_FAILURE', 'Inventory reservation failed.', {
    cause: error,
  });
}
