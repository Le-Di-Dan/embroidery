/**
 * `BR-021` unit-price resolution for the public Ready-Made projection
 * (`APP12-B01`).
 *
 * ```text
 * resolved_unit_price = COALESCE(skus.price_override_amount,
 *                                products.base_price_amount)
 * ```
 *
 * One pure function, in the domain, so the rule has a single home that can be
 * proved without a database and cannot be quietly re-derived by a second caller.
 * `APP12-B02` will resolve the same price again at durable order creation and
 * freeze it on the line (`BR-021`); it must resolve it *the same way*, and it
 * can only do that if there is one function to call.
 *
 * ## No arithmetic, therefore no float
 *
 * This selects between two strings. `numeric(14,2)` is returned by the driver as
 * a string precisely so no VND amount passes through an IEEE-754 double
 * (`primitives/money.ts`, INV-11), and a resolution that parsed either operand
 * to compare or normalise it would throw that away for nothing: there is nothing
 * to compare. Whole-đồng presentation is `toWholeDong`'s job, applied once at the
 * projection, the same helper the `APP2-B04` public price already goes through.
 *
 * ## The currency travels with the amount
 *
 * `skus.currency_code` and `products.currency_code` are separate columns with
 * separate CHECKs (`ck_skus__currency_allowed`, `ck_products__currency_allowed`),
 * and each is the currency **of its own row's amount**. So the resolved currency
 * is the currency of whichever amount won, read from that row — never a literal
 * `'VND'` written into this file because today's closed set happens to have one
 * member. The day a second currency is allowed, this function is already right.
 */

/** The SKU half of the resolution: its optional override and that override's currency. */
export interface SkuPriceInput {
  readonly priceOverrideAmount: string | undefined;
  readonly currencyCode: string;
}

/** The product half: the base price and its currency. */
export interface ProductPriceInput {
  readonly basePriceAmount: string;
  readonly currencyCode: string;
}

/** An amount with the currency it is denominated in. */
export interface ResolvedUnitPrice {
  readonly amount: string;
  readonly currencyCode: string;
}

/**
 * The unit price of one SKU, and the currency that price is in.
 *
 * An override of `'0'` is a real price and wins: `ck_skus__price_override_non_negative`
 * admits zero, `COALESCE` is null-checking rather than falsiness, and treating a
 * deliberate zero as "no override" would silently charge the base price for an
 * item an operator marked free.
 */
export function resolvePublicSkuUnitPrice(
  sku: SkuPriceInput,
  product: ProductPriceInput,
): ResolvedUnitPrice {
  return sku.priceOverrideAmount === undefined
    ? { amount: product.basePriceAmount, currencyCode: product.currencyCode }
    : { amount: sku.priceOverrideAmount, currencyCode: sku.currencyCode };
}
