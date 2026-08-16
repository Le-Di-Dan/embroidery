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
 * ## What is deliberately not here
 *
 * No SKU, price, stock, inventory, `is_active`, `display_order`, `created_at`,
 * `updated_at` or any other authoring column. `skus` is a separate table
 * (TBL-014) and this port does not join it — the absence is structural, so a
 * later edit cannot expose a price by widening a projection that never loaded
 * one.
 *
 * There is also no "default variant". `G01-D08` gives no authority for one, and
 * choosing on the customer's behalf would guess what they ordered.
 */
import type { ProductId, ProductVariantId } from './placement-hierarchy.port';

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
}

/** The product a variant list belongs to, with its selectable variants. */
export interface PublicProductVariants {
  readonly productId: ProductId;
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
