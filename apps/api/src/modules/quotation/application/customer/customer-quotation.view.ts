/**
 * What the current quotation looks like to the customer holding the secure link
 * (`APP6-B04` §8).
 *
 * A **separate, narrower** type from {@link QuotationVersionView}, not the Admin
 * view re-exported. The Admin read is an archive: it answers "what did version 2
 * cost, and who is it for" and carries `customRequestId`, the quotation's own
 * status vocabulary, the stitch count that priced it and the reason an operator
 * wrote for moving the total off-list. This one answers a single question an
 * anonymous browser is allowed to ask — *"what am I being quoted, and until
 * when?"* — so each of those is absent here, and absent from the type rather
 * than dropped by a mapper further down.
 *
 * ### What is absent, and why each one is absent
 *
 * **Identity and credentials.** No `customerId`, no `grantId`, no token, digest
 * or scope kind, no `customRequestId`. The grant proved whose quotation this is
 * before this type was built; echoing any of it back would turn a link into a
 * lookup and hand a caller an identifier they did not present.
 *
 * **Operator evidence.** No `adjustmentReason` — TBL-051 describes it as the
 * *evidence for why the total was moved off-list*, and no repository or product
 * authority makes it customer-facing. The repository's pattern for text a
 * customer may read is a **dedicated** column (`cancelled_reason` beside
 * `cancelled_customer_reason`, COL-TBL037-08/09); the quotation has one
 * adjustment reason and it is the internal half. The amount is shown; the
 * operator's note is not. No `stitchCount` either: an admin-entered pricing
 * input (GAP-10), not a fact about what the customer owes.
 *
 * **Audit and provenance.** No admin id, no audit event id, no outbox id, no
 * correlation id, no policy row or version id. The validity window is reported
 * as the two instants the version froze, never as the policy that produced them.
 *
 * **Other versions.** No history, no version list, no superseded sibling and no
 * superseded line item. This is the one version the pointers name.
 *
 * ### Every amount is a `string`
 *
 * Straight from `numeric(14,2)`, through the repository, through this type and
 * out. Nothing on this path adds, multiplies or rounds — see
 * `read-current-quotation.query.ts`.
 */

/** One frozen priced line of the current version (TBL-052). */
export interface CustomerQuotationLineItemView {
  /** Unique per version (CST-037), which is what makes the order total. */
  readonly position: number;
  readonly lineKind: string;
  readonly description: string;
  readonly quantity: number;
  readonly unitPriceAmount: string;
  readonly lineTotalAmount: string;
  // No `skuId`: an internal catalog key the customer neither presented nor
  // needs, and one this surface publishes no way to resolve.
}

export interface CustomerQuotationView {
  /**
   * The stable human-facing code, for quoting in a conversation with the
   * workshop. Display only — it never opens a quotation, and no operation on
   * this surface accepts it.
   */
  readonly quotationCode: string;
  /**
   * The **exact** version this read resolved, and the reason `APP6-B04` returns
   * an id at all.
   *
   * `APP6-B05` binds acceptance to the exact version the customer was looking
   * at (GRD-006 / G-DB7-20), and a stale acceptance must fail. That refusal is
   * only possible if the customer's decision names a version — so this is the
   * fingerprint the later decision carries back, not a locator this surface
   * would ever accept.
   */
  readonly versionId: string;
  readonly version: number;
  /** The LC-13 state of this version as stored. Reading it never advances it. */
  readonly status: string;
  /** The AGG-14 header state as stored. */
  readonly quotationStatus: string;
  readonly currencyCode: string;
  readonly quantityTotal: number;
  readonly subtotalAmount: string;
  readonly manualAdjustmentAmount: string;
  readonly shippingFeeAmount: string;
  readonly totalAmount: string;
  readonly depositPercent: string;
  readonly depositAmount: string;
  readonly remainingAmount: string;
  readonly lineItems: readonly CustomerQuotationLineItemView[];
  readonly sentAt: Date | undefined;
  readonly validFrom: Date | undefined;
  readonly validUntil: Date | undefined;
  /**
   * Whether the validity window has elapsed **at read time**.
   *
   * Derived, never stored, and computed without touching the row: `APP6-B04`
   * §11 keeps the expired-quotation state distinct from an unusable secure link,
   * and the sweep that persists `EXPIRED` is not this checkpoint's. A version
   * whose `valid_until` has passed is still a real quotation the customer may
   * read; this flag is what lets the page say so. `true` also whenever the
   * stored status is already `EXPIRED`, so the two sources cannot disagree on
   * screen.
   */
  readonly expired: boolean;
  /**
   * When the secure link itself stops working, so the page can say so before it
   * does. The grant's expiry, not the quotation's.
   */
  readonly accessExpiresAt: Date;
}
