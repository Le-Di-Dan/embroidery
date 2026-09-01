/**
 * Row → domain mapping for the AGG-15 Order aggregate.
 *
 * Amounts stay strings: an order total that lost precision is money.
 */
import { guardViolationError } from '@embroidery/database';
import type { OrderState, ShippingDetailState, schema } from '@embroidery/database';

import type { CustomRequestId } from './ordering-identity';
import type {
  Order,
  OrderId,
  OrderItem,
  ShippingDetail,
  ShippingFeeAcknowledgement,
} from './order.repository';

export type OrderRow = typeof schema.orders.$inferSelect;
export type ItemRow = typeof schema.orderItems.$inferSelect;
export type ShippingRow = typeof schema.shippingDetails.$inferSelect;
export type ShippingFeeAcknowledgementRow = typeof schema.shippingFeeAcknowledgements.$inferSelect;

/**
 * Maps an order row onto the AGG-15 custom-order aggregate.
 *
 * APP12-DB01 made the three custom-chain columns nullable, because a
 * `READY_MADE` order has no request, quotation or approval snapshot. This
 * aggregate is the *custom* one — every consumer of it reads at least one of
 * those three — so a Ready-Made row is refused here rather than mapped with
 * empty strings or silently widened to optional fields. Until APP12-B02/B05
 * give Ready-Made its own read path, reaching this function with such a row is
 * a routing bug, and it should say so instead of producing a half-built order.
 */
export function toOrder(row: OrderRow): Order {
  if (
    row.customRequestId === null ||
    row.acceptedQuotationVersionId === null ||
    row.currentApprovalSnapshotId === null
  ) {
    throw guardViolationError(
      'OrderRowMapper.toOrder',
      'ORDER_ORIGIN_NOT_CUSTOM',
      'This order has no custom request, quotation or approval chain to read.',
    );
  }

  return {
    id: row.id as OrderId,
    code: row.code,
    customRequestId: row.customRequestId as CustomRequestId,
    customerId: row.customerId,
    acceptedQuotationVersionId: row.acceptedQuotationVersionId,
    currentApprovalSnapshotId: row.currentApprovalSnapshotId,
    status: row.status as OrderState,
    totalAmount: row.totalAmount,
    currencyCode: row.currencyCode,
    deliveredAt: row.deliveredAt ?? undefined,
  };
}

export function toItem(row: ItemRow): OrderItem {
  return {
    position: row.position,
    skuId: row.skuId ?? undefined,
    customerOwnedProductId: row.customerOwnedProductId ?? undefined,
    productName: row.productName,
    variantLabel: row.variantLabel ?? undefined,
    sizeLabel: row.sizeLabel ?? undefined,
    quantity: row.quantity,
    unitPriceAmount: row.unitPriceAmount,
    lineTotalAmount: row.lineTotalAmount,
  };
}

export function toShippingDetail(row: ShippingRow): ShippingDetail {
  return {
    recipientName: row.recipientName,
    recipientPhone: row.recipientPhone,
    addressLine: row.addressLine,
    ward: row.ward ?? undefined,
    district: row.district ?? undefined,
    province: row.province,
    countryCode: row.countryCode,
    feeAmount: row.feeAmount ?? undefined,
    carrierName: row.carrierName ?? undefined,
    trackingCode: row.trackingCode ?? undefined,
    status: row.status as ShippingDetailState,
    frozenAt: row.frozenAt ?? undefined,
  };
}

/** The identity column is `bigint`; it leaves as text so no caller can round it. */
export function toShippingFeeAcknowledgement(
  row: ShippingFeeAcknowledgementRow,
): ShippingFeeAcknowledgement {
  return {
    id: String(row.id),
    orderId: row.orderId,
    previousFeeAmount: row.previousFeeAmount,
    newFeeAmount: row.newFeeAmount,
    currencyCode: row.currencyCode,
    grantId: row.grantId,
    stepUpChallengeId: row.stepUpChallengeId,
    acknowledgedAt: row.acknowledgedAt,
  };
}
