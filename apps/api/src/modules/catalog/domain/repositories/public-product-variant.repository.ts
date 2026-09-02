/**
 * The public, request-selectable Product Variants of one public Product
 * (`APP5-B07`).
 *
 * ## Why this exists at all
 *
 * `APP2` shipped the public catalog without variants on purpose: the Storefront
 * is a studio Work Detail, not an ecommerce PDP (IMP-D039), so
 * `PublicProductDetailResponse` publishes no ids and
 * `public-product.contract.spec.ts` asserts that `variant` is among the query
 * parameters the public list must **reject**.
 *
 * `APP5` then made one narrow demand that decision cannot satisfy.
 * `CustomRequestCatalogSubject` requires `productVariantId`, `G01-D08` requires
 * it because a request without a variant cannot be quoted, and
 * `fk_custom_requests__product_variant_id` (`ON DELETE restrict`) means an
 * invented id is refused by the database rather than merely unvalidated. The
 * approved `APP5-D01` frame `650:3` renders the variant as read-only context,
 * so a customer must be able to *see* which variant a request is for.
 *
 * `APP5-S01` was blocked on exactly that gap. This port closes it and nothing
 * else: it is a **selection** read for one submission field, not the beginning
 * of a commerce catalog.
 *
 * ## `APP12-B01` — the Ready-Made purchase projection, added beside it
 *
 * The locked `APP12` roadmap makes the SKU the buyable subject (`BR-021`), and
 * `BR-022` states purchasability in terms of a resolved price and available
 * stock. Neither had any public contract, so this port now also carries, for
 * each selectable variant, the SKUs of that variant which are **order-eligible**
 * (`skus.is_active`, the `APP7-G01` invariant `product-sku.policy.ts` already
 * enforces on write) and the price inputs `BR-021` resolves between.
 *
 * It is **additive**. The variant list itself is unchanged: a Product Variant
 * that is active still appears whether or not it has an order-eligible SKU,
 * whether or not that SKU is in stock, and whether or not it has a stock anchor
 * at all. A variant that is valid for the `APP5` custom-embroidery flow must not
 * disappear because Ready-Made cannot sell it — those are different questions
 * about the same row, and this port keeps answering both.
 *
 * ## What is deliberately still not here
 *
 * No SKU code, no `is_active` flag, no `display_order`, no `created_at` or
 * `updated_at`, and **nothing from the Inventory context**: no stock anchor id,
 * no `quantity_on_hand`, no held or reserved breakdown, no low-stock threshold,
 * no reservation and no ledger. `sku_stocks` and its children belong to CTX-INV
 * (REL-026) and this port does not join them — availability arrives through
 * `SKU_AVAILABILITY_SNAPSHOT_PORT`, which publishes one number and nothing else.
 * `products.is_display_out_of_stock` is presentation authority only (`BR-022`)
 * and is not read here.
 *
 * There is also no "default variant" and no "the" SKU. `G01-D08` gives no
 * authority for a default, and `product-sku.policy.ts` is explicit that
 * resolution never picks a member of the eligible set — the set is published as
 * it is, so a heuristic winner cannot be chosen by accident.
 */
import type { ProductId, ProductVariantId, SkuId } from './placement-hierarchy.port';

export const PUBLIC_PRODUCT_VARIANT_REPOSITORY = Symbol('PUBLIC_PRODUCT_VARIANT_REPOSITORY');

/**
 * One selectable variant, as stored.
 *
 * `product_variants` has **no name column**: DB4 locked two relational
 * attribute columns instead (`color_name`, `size_label`), and both are nullable.
 * They are carried exactly as stored rather than joined into an invented variant
 * name — the same rule `catalog-subject.port.ts` already applies for the Admin
 * and status projections, so one variant is described identically wherever it
 * appears.
 */
export interface PublicProductVariantRow {
  readonly id: ProductVariantId;
  readonly colorName: string | undefined;
  readonly sizeLabel: string | undefined;
  /**
   * The order-eligible SKUs of this variant, as stored (`APP12-B01`).
   *
   * Empty is a legal, common answer — a variant with no SKU, or whose only SKU
   * has been deactivated — and it never removes the variant.
   *
   * `product-sku.policy.ts` caps the order-eligible set at one per variant on
   * the write side, so in a consistent database this list holds zero or one
   * entry. It is still a list: the cap is a write invariant, not a shape the
   * read may assume, and a read that assumed it would have to pick a winner the
   * moment the invariant was ever violated.
   */
  readonly skus: readonly PublicProductSkuRow[];
}

/**
 * One order-eligible SKU's price inputs, as stored (`APP12-B01`).
 *
 * Both halves of `BR-021`'s `COALESCE(skus.price_override_amount,
 * products.base_price_amount)` travel with the currency of the row they came
 * from. The resolution itself is not done here — it is
 * `public-sku-price.policy.ts`, so the rule has one home and can be tested
 * without a database.
 */
export interface PublicProductSkuRow {
  readonly id: SkuId;
  /** `numeric(14,2)` as the driver returns it; absent when the base price applies. */
  readonly priceOverrideAmount: string | undefined;
  /** The currency of `priceOverrideAmount`, from the SKU's own row (CST-068). */
  readonly currencyCode: string;
}

/** The product a variant list belongs to, with its selectable variants. */
export interface PublicProductVariants {
  readonly productId: ProductId;
  /** `products.base_price_amount` — `BR-021`'s fallback (`APP12-B01`). */
  readonly basePriceAmount: string;
  /** The currency of `basePriceAmount`, from the product's own row (CST-068). */
  readonly currencyCode: string;
  readonly variants: readonly PublicProductVariantRow[];
}

export interface PublicProductVariantRepository {
  /**
   * The selectable variants of a publicly visible Product, or nothing.
   *
   * `undefined` means the Product is not publicly visible — unknown slug, draft,
   * archived, or a product whose category is not public. The caller turns all
   * four into one 404, exactly as the catalogue and the placement manifest do,
   * so an anonymous caller cannot use this route to enumerate unreleased work.
   *
   * An **empty variant list is not `undefined`**. A published Product with no
   * active variant genuinely exists and genuinely cannot form an APP5 catalog
   * request; reporting that as a 404 would tell the customer the product does
   * not exist, which is false, and would make the two cases indistinguishable to
   * the Storefront that has to render different states for them.
   */
  findPublicVariants(slug: string): Promise<PublicProductVariants | undefined>;
}
