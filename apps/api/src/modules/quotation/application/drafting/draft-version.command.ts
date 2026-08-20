/**
 * The pricing half of both drafting commands (`APP6-B01`).
 *
 * The two use cases differ in what they resolve — a request that may not yet
 * have a quotation, or a quotation that already exists — and agree completely on
 * what a **version** is. That agreement lives here so it cannot drift into two
 * slightly different definitions of a draft.
 */
import type { DraftLineInput } from '../../domain/pricing/quotation-pricing';

export interface DraftVersionCommand {
  /** COL-TBL051-08 — the garment count, an operator input, not a line count. */
  readonly quantityTotal: number;
  /** COL-TBL051-05 — an admin-entered pricing input (GAP-10), never derived. */
  readonly stitchCount: number | undefined;
  readonly shippingFeeAmount: string;
  readonly manualAdjustmentAmount: string | undefined;
  readonly adjustmentReason: string | undefined;
  readonly lineItems: readonly DraftLineInput[];
}

/** What a drafting call returns: enough to identify and explain the draft. */
export interface DraftedVersionView {
  readonly quotationId: string;
  readonly quotationCode: string;
  readonly customRequestId: string;
  readonly quotationStatus: string;
  readonly versionId: string;
  readonly version: number;
  readonly versionStatus: string;
  readonly currencyCode: string;
  readonly subtotalAmount: string;
  readonly manualAdjustmentAmount: string;
  readonly shippingFeeAmount: string;
  readonly totalAmount: string;
  readonly depositPercent: string;
  readonly depositAmount: string;
  readonly remainingAmount: string;
  readonly quantityTotal: number;
  readonly lineItemCount: number;
}
