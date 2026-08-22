/**
 * The closed refusal set of the `design.approved` conversion (`APP7-W01` §16).
 *
 * Every reason below is **deterministic**: it describes something the frozen
 * chain says, and attempt five will read exactly what attempt one read. So each
 * maps onto `JOB_INVARIANT_VIOLATION`, which the delivered taxonomy already
 * treats as terminal no matter how many attempts remain — an approval whose
 * variant carries two ACTIVE SKUs must reach an operator's dead-letter query,
 * not a retry loop with a database write in it (`APP7-W01` §16, "never endless
 * retry").
 *
 * The one exception is {@link CONVERSION_IN_PROGRESS}: another attempt holds the
 * `order.create` claim right now, which is a fact about *this moment* and not
 * about the chain. It is transient, so it retries.
 *
 * ### What a refusal must never do
 *
 * It must not revoke, reopen or annotate the approval. `SE-005` says it plainly
 * — *"approval stands; order retried idempotently"* — and this module writes
 * nothing at all: it names a reason and lets the transaction roll back. There is
 * no compensation path and no operational-alert subsystem invented here; the
 * delivered `background_job_attempts` dead-letter row **is** the alert path
 * (`APP7-W01` §16).
 *
 * Messages stay in memory for the operator's live log. Only `errorClass` is
 * persisted, and only `reason` is a stable identifier — neither ever carries a
 * database value, an amount, a customer fact or a storage key.
 */
import { WorkerJobError } from '../../../runtime/errors/worker-job-error';

export const ORDER_CONVERSION_REFUSALS = [
  /** The payload named an approval snapshot no row answers to. */
  'APPROVAL_NOT_FOUND',
  /** The snapshot exists but belongs to a different request than the event claims. */
  'APPROVAL_BELONGS_TO_ANOTHER_REQUEST',
  /** The request has no `ACCEPTED` quotation version — GRD-009's price half. */
  'QUOTE_NOT_ACCEPTED',
  /** More than one `ACCEPTED` version resolves for the request: never guess which. */
  'ACCEPTED_QUOTATION_AMBIGUOUS',
  //
  // `QUOTATION_BELONGS_TO_ANOTHER_REQUEST` is **not** here, and must not be
  // added back (`APP7-W01-C1`). It is `OrderChainGuard`'s own code, raised by
  // the canonical repository inside the creating transaction; a copy in this set
  // would mean the worker had started deciding the chain again.
  //
  /** The accepted version priced no line, so no order line can be projected. */
  'ACCEPTED_QUOTATION_NOT_PRICED',
  /** Catalog branch: the frozen variant has **no** ACTIVE SKU (`APP7-W01` §7). */
  'CATALOG_SKU_NOT_FOUND',
  /** Catalog branch: the frozen variant has **several** ACTIVE SKUs. */
  'CATALOG_SKU_AMBIGUOUS',
  /** COP branch: the frozen customer-owned product no longer resolves. */
  'CUSTOMER_OWNED_PRODUCT_NOT_FOUND',
  /** COP branch: that product belongs to a different request. */
  'CUSTOMER_OWNED_PRODUCT_BELONGS_TO_ANOTHER_REQUEST',
  /**
   * The accepted deposit or remaining amount is not positive.
   *
   * `ck_payment_obligations__amount_positive` requires `> 0` while
   * `ck_quotation_versions__deposit_non_negative` allows `0`, so a 0%/100%
   * deposit is representable as a price and not representable as the obligation
   * pair INV-04 requires. Named here rather than surfacing as a CHECK violation.
   */
  'OBLIGATION_AMOUNT_NOT_POSITIVE',
] as const;

export type OrderConversionRefusal = (typeof ORDER_CONVERSION_REFUSALS)[number];

/** Another attempt holds the `order.create` claim. Transient, not a refusal. */
export const CONVERSION_IN_PROGRESS = 'CONVERSION_IN_PROGRESS';

export class OrderConversionRefusalError extends WorkerJobError {
  readonly reason: OrderConversionRefusal;

  constructor(reason: OrderConversionRefusal, message: string, options?: { cause?: unknown }) {
    super('JOB_INVARIANT_VIOLATION', message, options);
    this.name = 'OrderConversionRefusalError';
    this.reason = reason;
  }
}

export function conversionRefusal(
  reason: OrderConversionRefusal,
  message: string,
): OrderConversionRefusalError {
  return new OrderConversionRefusalError(reason, message);
}

/** The claim is held by a live attempt; the runtime should come back. */
export function conversionInProgress(): WorkerJobError {
  return new WorkerJobError(
    'JOB_TRANSIENT_FAILURE',
    'Another attempt is converting this approval right now.',
  );
}
