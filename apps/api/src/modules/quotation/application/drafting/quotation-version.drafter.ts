/**
 * Adds one priced DRAFT version to an existing quotation (`APP6-B01`).
 *
 * Both drafting commands end here, which is the point: creating a quotation and
 * revising one differ only in how the quotation is obtained, and a second
 * definition of "a draft version" is the thing this file exists to prevent.
 *
 * ### `TR-LC12-01` is an append, never an edit
 *
 * There is no update path. `QuotationRepository.addVersion` inserts a new row
 * with `version = latest + 1` under a `FOR UPDATE` lock on the quotation, so
 * concurrent drafts serialise into consecutive versions rather than colliding on
 * `uq_quotation_versions__quotation_version`. Historical versions — including a
 * `SENT` one — are never read for mutation and never written: a new price is a
 * new version, and INV-02's freeze is upheld by having nowhere to express the
 * alternative.
 *
 * ### What it does not touch
 *
 * The version is created `DRAFT` and the quotation's `current_version_id` is
 * **not** advanced. That pointer means "the price the customer is looking at",
 * and `APP6-G01` §4 puts advancing it inside the send transaction (`TR-LC12-02`,
 * `APP6-B03`). Nothing here sends, freezes, sets a validity window, emits
 * `quotation.sent`, moves the custom request, or issues a grant.
 */
import { Inject, Injectable } from '@nestjs/common';
import { newId } from '@embroidery/database';

import {
  QUOTATION_REPOSITORY,
  type Quotation,
  type QuotationRepository,
  type QuotationVersionId,
} from '../../domain/repositories/quotation.repository';
import { QuotationDraftingError } from '../../domain/drafting/quotation-drafting.errors';
import { computeDraftPricing } from '../../domain/pricing/quotation-pricing';
import type { QuotationDepositPolicy } from '../../domain/pricing/quotation-deposit-policy';
import type { DraftVersionCommand, DraftedVersionView } from './draft-version.command';

@Injectable()
export class QuotationVersionDrafter {
  constructor(@Inject(QUOTATION_REPOSITORY) private readonly quotations: QuotationRepository) {}

  /**
   * Prices the command and appends the version.
   *
   * Must run inside the caller's transaction: `addVersion` writes the version
   * and its lines together, and `createForRequest` must commit with the first
   * version or not at all.
   */
  async draft(
    quotation: Quotation,
    command: DraftVersionCommand,
    policy: QuotationDepositPolicy,
  ): Promise<DraftedVersionView> {
    const priced = computeDraftPricing(
      {
        lineItems: command.lineItems,
        shippingFeeAmount: command.shippingFeeAmount,
        manualAdjustmentAmount: command.manualAdjustmentAmount,
        adjustmentReason: command.adjustmentReason,
      },
      policy,
    );
    if (!priced.ok) {
      throw new QuotationDraftingError('QUOTATION_PRICING_INVALID', priced.reason);
    }
    const pricing = priced.pricing;

    const version = await this.quotations.addVersion({
      id: newId() as QuotationVersionId,
      quotationId: quotation.id,
      quantityTotal: command.quantityTotal,
      subtotalAmount: pricing.subtotalAmount,
      manualAdjustmentAmount: pricing.manualAdjustmentAmount,
      adjustmentReason: pricing.adjustmentReason,
      shippingFeeAmount: pricing.shippingFeeAmount,
      totalAmount: pricing.totalAmount,
      depositPercent: pricing.depositPercent,
      depositAmount: pricing.depositAmount,
      remainingAmount: pricing.remainingAmount,
      stitchCount: command.stitchCount,
      lineItems: pricing.lineItems,
    });

    // Amounts are read back from the persisted row, not echoed from the input:
    // what the operator is shown is what `numeric(14,2)` actually holds, still
    // as strings, with no conversion anywhere on the path.
    return {
      quotationId: quotation.id,
      quotationCode: quotation.code,
      customRequestId: quotation.customRequestId,
      quotationStatus: quotation.status,
      versionId: version.id,
      version: version.version,
      versionStatus: version.status,
      currencyCode: version.currencyCode,
      subtotalAmount: version.subtotalAmount,
      manualAdjustmentAmount: pricing.manualAdjustmentAmount,
      shippingFeeAmount: version.shippingFeeAmount,
      totalAmount: version.totalAmount,
      depositPercent: pricing.depositPercent,
      depositAmount: version.depositAmount,
      remainingAmount: version.remainingAmount,
      quantityTotal: version.quantityTotal,
      lineItemCount: pricing.lineItems.length,
    };
  }
}
