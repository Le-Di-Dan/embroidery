/**
 * The frozen authority a conversion reads before it creates an order
 * (`APP7-W01`, corrected by `APP7-W01-C1`).
 *
 * **Reads only.** This port writes nothing, and after `APP7-W01-C1` it may not:
 * the Order aggregate, its items and the canonical `order.created` append belong
 * to `OrderRepository.createFromAcceptedQuotation`, and the DEPOSIT/REMAINING
 * pair belongs to `PaymentObligationRepository.createForOrder` — both now shared
 * from `@embroidery/persistence` and consumed by this worker directly.
 *
 * What remains here is exactly what `APP7-W01` §6 permits a worker-local seam to
 * own: facts no canonical repository already answers for.
 *
 * ```text
 * the frozen Approval Snapshot projection      (branch, subject, display copy)
 * the exact ACCEPTED quotation version + its priced lines
 * the Catalog active-SKU lookup for a frozen variant
 * the customer-owned-product lookup
 * ```
 *
 * None of these is an Order write, none reads `orders` — "has this already
 * converted?" is `OrderRepository.findByRequest`, asked of the canonical
 * repository — and none duplicates GRD-009, which is `OrderChainGuard`, resolved
 * from the shared package and run inside the canonical creating repository where
 * it always did.
 */

/** The frozen placement branch, as `ck_approval_snapshots__exactly_one_placement_branch` shapes it. */
export interface FrozenApprovalSnapshot {
  readonly id: string;
  readonly customRequestId: string;
  //
  // The customer is deliberately **absent** (`APP7-W01-C1`). `APP7-W01` read it
  // here and never used it: the order's `customer_id` comes from the chain
  // `OrderChainGuard` verified, inside the canonical repository, so the stored
  // customer provably matches the approval the guard checked rather than a value
  // a caller supplied.
  //
  /** Catalog branch: non-null together with the other three Catalog columns. */
  readonly productVariantId: string | undefined;
  /** COP branch: non-null exactly when the Catalog columns are null. */
  readonly customerOwnedProductId: string | undefined;
  /** Frozen display copy. Never re-derived from a live `products` row. */
  readonly productName: string;
  readonly variantLabel: string | undefined;
  readonly quantityTotal: number;
}

/** One priced line of the accepted version, copied and never recomputed. */
export interface AcceptedQuotationLine {
  readonly position: number;
  readonly quantity: number;
  readonly unitPriceAmount: string;
  readonly lineTotalAmount: string;
}

/** The exact accepted version — the only commercial authority the order copies. */
export interface AcceptedQuotationVersion {
  readonly id: string;
  readonly customRequestId: string;
  readonly totalAmount: string;
  readonly depositAmount: string;
  readonly remainingAmount: string;
  readonly currencyCode: string;
  readonly acceptedAt: Date | undefined;
  readonly lineItems: readonly AcceptedQuotationLine[];
}

export const CONVERSION_AUTHORITY_REPOSITORY = Symbol('CONVERSION_AUTHORITY_REPOSITORY');

export interface ConversionAuthorityRepository {
  findApprovalSnapshot(approvalSnapshotId: string): Promise<FrozenApprovalSnapshot | undefined>;

  /**
   * Every `ACCEPTED` version of every quotation raised for the request.
   *
   * Returns the set rather than "the" version on purpose: zero and several are
   * different refusals, and a query that returned one row could only answer
   * "several" by picking — the `MAX(version)` / latest heuristic `APP7-W01` §5
   * forbids.
   */
  findAcceptedQuotationVersions(customRequestId: string): Promise<AcceptedQuotationVersion[]>;

  /** Every `is_active` SKU of the frozen variant. Zero and several both refuse. */
  findActiveSkuIdsForVariant(productVariantId: string): Promise<string[]>;

  findCustomerOwnedProduct(
    customerOwnedProductId: string,
  ): Promise<
    { readonly id: string; readonly name: string; readonly customRequestId: string } | undefined
  >;
}
