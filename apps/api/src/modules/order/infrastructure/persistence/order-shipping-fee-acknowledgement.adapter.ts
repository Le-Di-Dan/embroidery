/**
 * The AGG-15 half of `ShippingFeeAcknowledgementPort` (`APP9-B04-C1`).
 *
 * It delegates to `ORDER_REPOSITORY` rather than issuing its own SQL, because
 * the three statements it needs already exist there and are already the
 * canonical ones: `lockShippingFeeBaseline` is the same locked read the Admin
 * write uses — one lock rule, one baseline query, no second version of either to
 * drift — and the acknowledgement append is the delivered writer for TBL-049.
 *
 * The narrowing is done by **composition**, not by a second query layer: this
 * class holds the aggregate contract, its module does not re-export it, and what
 * leaves through the port is three methods. A public customer surface therefore
 * cannot reach `dispatch()`, `transition()` or `saveShippingDetails()` even
 * though the row it appends lives in the same aggregate.
 */
import { Inject, Injectable } from '@nestjs/common';
import { ORDER_REPOSITORY, type OrderId, type OrderRepository } from '@embroidery/persistence';

import type { CustomRequestId } from '../../domain/repositories/custom-request.repository';
import type {
  AppendShippingFeeAcknowledgementInput,
  FindShippingFeeAcknowledgementQuery,
  ShippingFeeAcknowledgementPort,
  ShippingFeeAcknowledgementRecord,
  ShippingFeeContext,
} from '../../domain/repositories/shipping-fee-acknowledgement.port';

@Injectable()
export class OrderShippingFeeAcknowledgementAdapter implements ShippingFeeAcknowledgementPort {
  constructor(@Inject(ORDER_REPOSITORY) private readonly orders: OrderRepository) {}

  async lockFeeContextForRequest(
    requestId: CustomRequestId,
  ): Promise<ShippingFeeContext | undefined> {
    const order = await this.orders.findByRequest(requestId);
    if (order === undefined) {
      return undefined;
    }
    const baseline = await this.orders.lockShippingFeeBaseline(order.id);
    if (baseline === undefined) {
      return undefined;
    }
    return {
      orderId: order.id,
      orderCode: order.code,
      shippingStatus: baseline.detail?.status,
      // Copied, never parsed. There is no arithmetic in this file.
      storedFeeAmount: baseline.detail?.feeAmount,
      quotedFeeAmount: baseline.quotedFeeAmount,
    };
  }

  async findAcknowledgement(
    query: FindShippingFeeAcknowledgementQuery,
  ): Promise<ShippingFeeAcknowledgementRecord | undefined> {
    const row = await this.orders.findShippingFeeAcknowledgement({
      orderId: query.orderId as OrderId,
      previousFeeAmount: query.previousFeeAmount,
      newFeeAmount: query.newFeeAmount,
    });
    return row === undefined ? undefined : toRecord(row);
  }

  async appendAcknowledgement(
    input: AppendShippingFeeAcknowledgementInput,
  ): Promise<ShippingFeeAcknowledgementRecord> {
    const row = await this.orders.acknowledgeShippingFee({
      orderId: input.orderId as OrderId,
      previousFeeAmount: input.previousFeeAmount,
      newFeeAmount: input.newFeeAmount,
      grantId: input.grantId,
      stepUpChallengeId: input.stepUpChallengeId,
      acknowledgedAt: input.acknowledgedAt,
    });
    return toRecord(row);
  }
}

/**
 * The published projection.
 *
 * The row's `grant_id` and `step_up_challenge_id` are deliberately dropped: they
 * are the evidence the *server* keeps, and the customer's confirmation screen
 * has no use for either. Neither is a secret, but a field a response never
 * carries is one nothing downstream can log.
 */
function toRecord(row: {
  readonly orderId: string;
  readonly previousFeeAmount: string;
  readonly newFeeAmount: string;
  readonly currencyCode: string;
  readonly acknowledgedAt: Date;
}): ShippingFeeAcknowledgementRecord {
  return {
    orderId: row.orderId,
    previousFeeAmount: row.previousFeeAmount,
    newFeeAmount: row.newFeeAmount,
    currencyCode: row.currencyCode,
    acknowledgedAt: row.acknowledgedAt,
  };
}
