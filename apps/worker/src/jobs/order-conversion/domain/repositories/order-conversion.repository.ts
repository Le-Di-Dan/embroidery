/**
 * The worker's order-conversion persistence contract (`APP7-W01` §24).
 *
 * A **worker-local** port over the rows the conversion reads and writes, not a
 * borrowed one. `OrderRepository` and `PaymentObligationRepository` live in
 * `apps/api`, and importing either here would be the app-to-app dependency the
 * delivered `APP4-W01` port refused for exactly the same reason — and would drag
 * shipping, dispatch, cancellation, refunds, provider events and reconciliation
 * into a worker that performs none of them.
 *
 * So this declares the operations the conversion actually performs, and no more.
 * There is deliberately no transition, no attempt, no satisfy, no refund and no
 * shipping method: `TR-LC14-02` and everything after it belong to `APP7-B04` and
 * `APP9`, and a method here would be an invitation to reach them from a worker.
 *
 * ### One write, because it is one durable effect
 *
 * {@link OrderConversionRepository.createConvertedOrder} is a single method for
 * the same reason `settleAttempt` is: the order, its frozen lines, both
 * obligations (INV-04) and the `order.created` outbox row (SE-006, G-DB7-54) are
 * one fact. Splitting them into four calls would put four chances to commit a
 * subset into the caller, and `APP7-W01` §11 forbids exactly that. It also keeps
 * **one** owner of `order.created`: this method appends it and nothing else in
 * the checkpoint may.
 *
 * GRD-009 is re-read inside that same method, against the persisted rows, not
 * taken from the event.
 */

/** The frozen placement branch, as `ck_approval_snapshots__exactly_one_placement_branch` shapes it. */
export interface FrozenApprovalSnapshot {
  readonly id: string;
  readonly customRequestId: string;
  readonly customerId: string;
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

/** A line as the order freezes it. Subject and labels frozen, money copied. */
export interface ConvertedOrderItem {
  readonly position: number;
  readonly skuId: string | undefined;
  readonly customerOwnedProductId: string | undefined;
  readonly productName: string;
  readonly variantLabel: string | undefined;
  readonly sizeLabel: string | undefined;
  readonly quantity: number;
  readonly unitPriceAmount: string;
  readonly lineTotalAmount: string;
}

export interface CreateConvertedOrderInput {
  readonly id: string;
  readonly code: string;
  readonly customRequestId: string;
  readonly acceptedQuotationVersionId: string;
  readonly approvalSnapshotId: string;
  readonly items: readonly ConvertedOrderItem[];
  readonly depositObligationId: string;
  readonly depositAmount: string;
  readonly remainingObligationId: string;
  readonly remainingAmount: string;
}

/** What a committed conversion — or a replay of one — is identified by. */
export interface ConvertedOrder {
  readonly id: string;
  readonly code: string;
}

export const ORDER_CONVERSION_REPOSITORY = Symbol('ORDER_CONVERSION_REPOSITORY');

export interface OrderConversionRepository {
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

  /** The already-converted order for this request, if one exists. */
  findOrderByRequest(customRequestId: string): Promise<ConvertedOrder | undefined>;

  /**
   * The whole conversion: chain re-read, order, frozen items, both obligations
   * and `order.created` — one method, one transaction, one event.
   *
   * @requiresTransaction
   */
  createConvertedOrder(input: CreateConvertedOrderInput): Promise<ConvertedOrder>;
}
