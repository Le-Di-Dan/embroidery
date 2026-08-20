/**
 * What a historical quotation version looks like to an Admin reader
 * (`APP6-B02`).
 *
 * Shared by the history and the detail because they are the *same* version seen
 * at two depths — the detail adds the lines, and nothing else. A second
 * definition would be a second answer to "what did version 3 cost", and the two
 * would drift the first time a column was added.
 *
 * ### Every field is a column
 *
 * There is no computed property here, and that is the checkpoint's load-bearing
 * property rather than an economy. `depositPercent` is the share the version was
 * **priced at**, read from its own row — not the share published policy carries
 * today; `totalAmount` is the persisted total, not `subtotal + adjustment +
 * shipping` recomputed in TypeScript. A version drafted last month under a 30%
 * deposit still reads as 30%, and it reads that way because nothing on this path
 * knows how to calculate a deposit.
 *
 * Amounts are `string`, all the way from `numeric(14,2)`. The one number-typed
 * money-ish field would be the one that lost a đồng.
 */
export interface QuotationVersionView {
  readonly versionId: string;
  readonly version: number;
  readonly status: string;
  readonly quantityTotal: number;
  readonly stitchCount: number | undefined;
  readonly currencyCode: string;
  readonly subtotalAmount: string;
  readonly manualAdjustmentAmount: string;
  readonly adjustmentReason: string | undefined;
  readonly shippingFeeAmount: string;
  readonly totalAmount: string;
  readonly depositPercent: string;
  readonly depositAmount: string;
  readonly remainingAmount: string;
  readonly validFrom: Date | undefined;
  readonly validUntil: Date | undefined;
  readonly sentAt: Date | undefined;
  readonly acceptedAt: Date | undefined;
  readonly supersededAt: Date | undefined;
  readonly expiredAt: Date | undefined;
  readonly createdAt: Date;
  /**
   * Whether the quotation header points at this version.
   *
   * Derived from `quotations.current_version_id` by identity comparison and
   * nothing else — it is not inferred from the status, and it is not a
   * recomputation of which version *ought* to be current. Until `APP6-B03`
   * advances that pointer it is `false` on every version, which is the honest
   * answer for a quotation that has never been sent.
   */
  readonly current: boolean;
}

/** One frozen priced line of a version (TBL-052). */
export interface QuotationLineItemView {
  readonly position: number;
  readonly lineKind: string;
  readonly description: string;
  readonly skuId: string | undefined;
  readonly quantity: number;
  readonly unitPriceAmount: string;
  readonly lineTotalAmount: string;
}

/** The quotation a version belongs to — the address, not a second projection. */
export interface QuotationHeaderView {
  readonly quotationId: string;
  readonly quotationCode: string;
  readonly customRequestId: string;
  readonly quotationStatus: string;
  readonly currentVersionId: string | undefined;
}
