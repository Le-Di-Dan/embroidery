/**
 * The Catalog facts one Ready-Made order line is frozen from (`APP12-B02`,
 * `BR-021` / `BR-022`).
 *
 * ## Why this is not `PublicProductVariantRepository`
 *
 * That port answers *"what may a customer select at this public product
 * address"* — it is keyed by **slug**, returns every active variant, and is
 * read outside any transaction because nothing it feeds writes anything
 * (`APP12-B01`). Order creation asks a different question: *"is this one SKU
 * still sellable, right now, inside the transaction that is about to commit an
 * order against it"*. Keyed by SKU id, answering for one row, and read where a
 * decision is made.
 *
 * Reusing the slug-keyed read would mean the writer trusting a client-supplied
 * slug to name the product it is charging for, or loading a whole page's worth
 * of variants to find one SKU. Neither is the smaller change.
 *
 * ## The eligibility predicate is the same one, in the same place
 *
 * `status = 'PUBLISHED'`, the public-category join, `archived_at IS NULL`,
 * `product_variants.is_active` and `skus.is_active` — the exact five predicates
 * `drizzle-public-product-variant.repository.ts` applies, from the same
 * constants. They are in the SQL, so an ineligible SKU never arrives for a
 * service to filter out later and there is no code path on which forgetting a
 * check sells an unpublished product.
 *
 * ## The price is inputs, never a resolved amount
 *
 * Both operands of `BR-021`'s `COALESCE(skus.price_override_amount,
 * products.base_price_amount)` travel with the currency of the row they came
 * from, and the resolution itself is `public-sku-price.policy.ts` — the same
 * function `APP12-B01` publishes the advisory price through. Resolving it here
 * would be a second implementation of a rule that exists precisely so there is
 * one.
 *
 * ## What is deliberately absent
 *
 * Nothing from the Inventory context: no stock anchor, no `quantity_on_hand`,
 * no reservation and no availability. Stock is decided under the `sku_stocks`
 * anchor lock by the Inventory writer (`BR-022`, `APP12-B02` §16), and a
 * Catalog read that carried a stock number would invite a decision to be made
 * from it. `products.is_display_out_of_stock` is presentation authority only
 * and is not read here either.
 *
 * No SKU code, no `is_active` flag, no timestamps, no media and no description:
 * this port publishes what one order line freezes, and an order line freezes
 * display facts and a price.
 */
import type { ProductId, ProductVariantId, SkuId } from './placement-hierarchy.port';

export const PURCHASABLE_SKU_PORT = Symbol('PURCHASABLE_SKU_PORT');

/**
 * One order-eligible SKU with everything a Ready-Made line needs.
 *
 * `variantLabel` and `sizeLabel` are the two independent nullable attribute
 * columns `product_variants` actually carries (DB4 locked `color_name` and
 * `size_label`, and there is no variant *name*). They are published exactly as
 * stored: a variant with no colour has no `variantLabel`, and the order line
 * snapshots that absence rather than a fabricated `'N/A'`.
 */
export interface PurchasableSku {
  readonly skuId: SkuId;
  readonly productId: ProductId;
  readonly productVariantId: ProductVariantId;
  /** `products.name` — what the customer will see in their order history. */
  readonly productName: string;
  /** `product_variants.color_name`, as stored. */
  readonly variantLabel: string | undefined;
  /** `product_variants.size_label`, as stored. */
  readonly sizeLabel: string | undefined;
  /** `skus.price_override_amount`; absent when the base price applies. */
  readonly priceOverrideAmount: string | undefined;
  /** The currency of `priceOverrideAmount`, from the SKU's own row (CST-068). */
  readonly skuCurrencyCode: string;
  /** `products.base_price_amount` — `BR-021`'s fallback operand. */
  readonly basePriceAmount: string;
  /** The currency of `basePriceAmount`, from the product's own row (CST-068). */
  readonly productCurrencyCode: string;
}

export interface PurchasableSkuPort {
  /**
   * The SKU, if it is currently sellable by Ready-Made.
   *
   * `undefined` for every reason it might not be — unknown id, inactive SKU,
   * inactive variant, unpublished or archived Product, non-public category. The
   * caller collapses all of them into one refusal, exactly as the public
   * catalogue collapses them into one 404, so an anonymous caller cannot use
   * order creation to enumerate unreleased Catalog rows.
   *
   * Read inside the creation transaction, so the eligibility it reports and the
   * order it authorizes are the same instant's truth (`APP12-B02` §10).
   */
  findPurchasable(skuId: string): Promise<PurchasableSku | undefined>;
}
