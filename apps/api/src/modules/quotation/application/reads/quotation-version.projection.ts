/**
 * Persisted version row → Admin view (`APP6-B02`).
 *
 * A projection, in the strict sense: it renames nothing, computes nothing and
 * drops nothing but the quotation id the caller already has. The only judgement
 * it makes is `current`, and that is an identity comparison against the header's
 * own pointer.
 *
 * It exists as a function rather than inline in each query so the history and
 * the detail cannot answer differently about the same row.
 */
import type {
  QuotationLineItem,
  QuotationVersion,
  QuotationVersionId,
} from '../../domain/repositories/quotation.repository';
import type { QuotationLineItemView, QuotationVersionView } from './quotation-version.view';

export function projectVersion(
  version: QuotationVersion,
  currentVersionId: QuotationVersionId | undefined,
): QuotationVersionView {
  return {
    versionId: version.id,
    version: version.version,
    status: version.status,
    quantityTotal: version.quantityTotal,
    stitchCount: version.stitchCount,
    currencyCode: version.currencyCode,
    // Straight through. Every amount below is the `numeric(14,2)` the row holds,
    // still a string, never re-derived from the others.
    subtotalAmount: version.subtotalAmount,
    manualAdjustmentAmount: version.manualAdjustmentAmount,
    adjustmentReason: version.adjustmentReason,
    shippingFeeAmount: version.shippingFeeAmount,
    totalAmount: version.totalAmount,
    depositPercent: version.depositPercent,
    depositAmount: version.depositAmount,
    remainingAmount: version.remainingAmount,
    validFrom: version.validFrom,
    validUntil: version.validUntil,
    sentAt: version.sentAt,
    acceptedAt: version.acceptedAt,
    supersededAt: version.supersededAt,
    expiredAt: version.expiredAt,
    createdAt: version.createdAt,
    current: currentVersionId !== undefined && currentVersionId === version.id,
  };
}

export function projectLineItem(line: QuotationLineItem): QuotationLineItemView {
  return {
    position: line.position,
    lineKind: line.lineKind,
    description: line.description,
    skuId: line.skuId,
    quantity: line.quantity,
    unitPriceAmount: line.unitPriceAmount,
    lineTotalAmount: line.lineTotalAmount,
  };
}
