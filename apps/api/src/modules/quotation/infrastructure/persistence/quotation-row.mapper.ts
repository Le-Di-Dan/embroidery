/**
 * Row → domain mapping for the AGG-14 Quotation aggregate.
 *
 * Every amount stays a `string`. `numeric` must never become a JS number: a
 * quotation total that lost precision is a price the customer did not agree to.
 *
 * `toVersion` projects the persisted pricing row **whole** — the adjustment and
 * its reason, the deposit share, the stitch count and the lifecycle timestamps
 * included. `APP6-B02` reads a historical version to explain it, and a fact
 * dropped here is one a read would have to reconstruct from the current policy
 * or by recomputing an amount the row already holds. Nothing is derived: every
 * value below is the column.
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
    stitchCount: row.stitchCount ?? undefined,
    subtotalAmount: row.subtotalAmount,
    manualAdjustmentAmount: row.manualAdjustmentAmount,
    adjustmentReason: row.adjustmentReason ?? undefined,
    shippingFeeAmount: row.shippingFeeAmount,
    totalAmount: row.totalAmount,
    depositPercent: row.depositPercent,
    depositAmount: row.depositAmount,
    remainingAmount: row.remainingAmount,
    currencyCode: row.currencyCode,
    validFrom: row.validFrom ?? undefined,
    validUntil: row.validUntil ?? undefined,
    sentAt: row.sentAt ?? undefined,
    acceptedAt: row.acceptedAt ?? undefined,
    supersededAt: row.supersededAt ?? undefined,
    expiredAt: row.expiredAt ?? undefined,
    createdAt: row.createdAt,
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
