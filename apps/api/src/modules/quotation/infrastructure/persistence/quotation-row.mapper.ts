/**
 * Row → domain mapping for the AGG-14 Quotation aggregate.
 *
 * Every amount stays a `string`. `numeric` must never become a JS number: a
 * quotation total that lost precision is a price the customer did not agree to.
 */
import type {
  QuotationLineKind,
  QuotationState,
  QuotationVersionState,
  schema,
} from '@embroidery/database';

import type {
  Quotation,
  QuotationId,
  QuotationLineItem,
  QuotationVersion,
  QuotationVersionId,
} from '../../domain/repositories/quotation.repository';

export type QuotationRow = typeof schema.quotations.$inferSelect;
export type VersionRow = typeof schema.quotationVersions.$inferSelect;
export type LineItemRow = typeof schema.quotationLineItems.$inferSelect;

export function toQuotation(row: QuotationRow): Quotation {
  return {
    id: row.id as QuotationId,
    code: row.code,
    customRequestId: row.customRequestId,
    status: row.status as QuotationState,
    currentVersionId: (row.currentVersionId ?? undefined) as QuotationVersionId | undefined,
  };
}

export function toVersion(row: VersionRow): QuotationVersion {
  return {
    id: row.id as QuotationVersionId,
    quotationId: row.quotationId as QuotationId,
    version: row.version,
    status: row.status as QuotationVersionState,
    quantityTotal: row.quantityTotal,
    subtotalAmount: row.subtotalAmount,
    shippingFeeAmount: row.shippingFeeAmount,
    totalAmount: row.totalAmount,
    depositAmount: row.depositAmount,
    remainingAmount: row.remainingAmount,
    currencyCode: row.currencyCode,
    validUntil: row.validUntil ?? undefined,
    sentAt: row.sentAt ?? undefined,
    acceptedAt: row.acceptedAt ?? undefined,
  };
}

export function toLineItem(row: LineItemRow): QuotationLineItem {
  return {
    position: row.position,
    lineKind: row.lineKind as QuotationLineKind,
    description: row.description,
    skuId: row.skuId ?? undefined,
    quantity: row.quantity,
    unitPriceAmount: row.unitPriceAmount,
    lineTotalAmount: row.lineTotalAmount,
  };
}
