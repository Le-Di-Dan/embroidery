/**
 * What the customer's shipping-fee acknowledgement command may reach, and
 * nothing else (`APP9-B04-C1` §3, §5, §6).
 *
 * A narrow Ordering contract beside {@link OrderRepository}, on the precedent
 * `OrderDepositContextPort` set and for its reason. `ORDER_REPOSITORY` is the
 * AGG-15 **writer** — `transition`, `dispatch`, `saveShippingDetails`,
 * `openCancellationRequest`. A public route holding it would have the dispatch
 * freeze and the shipping detail itself one injection away from an anonymous
 * caller carrying a link, and `WHO_EDITS_BEFORE_FREEZE = ADMIN` would be a
 * property of what this code happens to call rather than of what it can call.
 *
 * Three methods. Two read; the third appends one immutable evidence row. There
 * is no shipping mutation here, no obligation, no order transition and no
 * payment attempt — not because the use case declines to call them, but because
 * no method exists to call.
 */
import type { ShippingDetailState } from '@embroidery/database';

import type { CustomRequestId } from './custom-request.repository';

export const SHIPPING_FEE_ACKNOWLEDGEMENT_PORT = Symbol('SHIPPING_FEE_ACKNOWLEDGEMENT_PORT');

/**
 * The order and its fee baseline, read behind a `REQUEST_ACCESS` grant.
 *
 * `storedFeeAmount` and `quotedFeeAmount` are the two inputs to `baselineFeeOf`
 * and are handed over as the exact stored strings — no amount is parsed on this
 * side of the boundary. `shippingStatus` is `undefined` when no detail exists
 * yet, which is a normal state and not an absence: the baseline still resolves.
 */
export interface ShippingFeeContext {
  readonly orderId: string;
  readonly orderCode: string;
  readonly shippingStatus: ShippingDetailState | undefined;
  readonly storedFeeAmount: string | undefined;
  readonly quotedFeeAmount: string;
}

/** One committed acknowledgement row, as the customer surface reports it. */
export interface ShippingFeeAcknowledgementRecord {
  readonly orderId: string;
  readonly previousFeeAmount: string;
  readonly newFeeAmount: string;
  readonly currencyCode: string;
  readonly acknowledgedAt: Date;
}

export interface AppendShippingFeeAcknowledgementInput {
  readonly orderId: string;
  readonly previousFeeAmount: string;
  readonly newFeeAmount: string;
  readonly grantId: string;
  readonly stepUpChallengeId: string;
  readonly acknowledgedAt: Date;
}

export interface FindShippingFeeAcknowledgementQuery {
  readonly orderId: string;
  readonly previousFeeAmount: string;
  readonly newFeeAmount: string;
}

export interface ShippingFeeAcknowledgementPort {
  /**
   * The one order of one request (`uq_orders__request`) with its fee baseline,
   * taken under the shipping detail's own row lock.
   *
   * Never throws for absence: the caller is a non-enumerating public surface and
   * a request that has not been converted must look exactly like a request that
   * does not exist.
   *
   * @requiresTransaction — a lock taken outside one proves nothing.
   */
  lockFeeContextForRequest(requestId: CustomRequestId): Promise<ShippingFeeContext | undefined>;

  /** The standing decision for one exact fee movement, if the customer made it. */
  findAcknowledgement(
    query: FindShippingFeeAcknowledgementQuery,
  ): Promise<ShippingFeeAcknowledgementRecord | undefined>;

  /** @requiresTransaction — append-only; there is no update and no delete. */
  appendAcknowledgement(
    input: AppendShippingFeeAcknowledgementInput,
  ): Promise<ShippingFeeAcknowledgementRecord>;
}
