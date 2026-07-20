/**
 * Row → domain mapping for the AGG-15 Order aggregate.
 *
 * Amounts stay strings: an order total that lost precision is money.
 */
import type { OrderState, ShippingDetailState, schema } from '@embroidery/database';

import type { CustomRequestId } from '../../domain/repositories/custom-request.repository';
import type {
  Order,
  OrderId,
  OrderItem,
  ShippingDetail,
} from '../../domain/repositories/order.repository';

export type OrderRow = typeof schema.orders.$inferSelect;
export type ItemRow = typeof schema.orderItems.$inferSelect;
export type ShippingRow = typeof schema.shippingDetails.$inferSelect;

export function toOrder(row: OrderRow): Order {
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
    province: row.province,
    feeAmount: row.feeAmount ?? undefined,
    carrierName: row.carrierName ?? undefined,
    trackingCode: row.trackingCode ?? undefined,
    status: row.status as ShippingDetailState,
  };
}
