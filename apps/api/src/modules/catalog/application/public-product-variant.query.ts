/**
 * The public variant selection read (`APP5-B07`).
 *
 * Orchestration only: ask the repository, project, or refuse. No transaction, no
 * lock and no cache — the invariant that unpublishing a Product removes its
 * variants from the selector on the next read is satisfied by there being
 * nothing between the caller and the row.
 *
 * Like `public-product.query.ts` and `product-placement.query.ts`, this query
 * never learns *why* a lookup failed. Unknown slug, draft, archived and a
 * product whose category is not public all collapse to the same absence here,
 * and therefore to the same 404 at the boundary.
 */
import { Inject, Injectable } from '@nestjs/common';

import { publicProductNotFound } from '../domain/public-product-catalog.errors';
import {
  PUBLIC_PRODUCT_VARIANT_REPOSITORY,
  type PublicProductVariantRepository,
  type PublicProductVariants,
} from '../domain/repositories/public-product-variant.repository';

/** One selectable variant as the Storefront receives it. */
export interface PublicProductVariantView {
  /**
   * The id `SubmitCustomRequestBody.catalog.productVariantId` expects.
   *
   * Named `productVariantId` rather than `id` because that is what the caller
   * has to send back: the one place this value is used is the APP5 submission
   * body, and a field a client must rename on the way through is a field a
   * client eventually renames wrongly.
   */
  readonly productVariantId: string;
  /** As stored; `null` when the variant carries no colour attribute. */
  readonly colorName: string | null;
  /** As stored; `null` when the variant carries no size attribute. */
  readonly sizeLabel: string | null;
}

export interface PublicProductVariantListView {
  /**
   * The other id the APP5 catalog subject requires.
   *
   * The public catalogue publishes no product id, deliberately — but the public
   * placement manifest already does (`PublicProductPlacementResponse.productId`,
   * IMP-D041 PO-02), for the same reason it appears here: a Storefront that must
   * submit `productId` and `productVariantId` together should not have to read
   * two endpoints and hope they agree about which product it is looking at.
   */
  readonly productId: string;
  readonly variants: readonly PublicProductVariantView[];
}

@Injectable()
export class PublicProductVariantQuery {
  constructor(
    @Inject(PUBLIC_PRODUCT_VARIANT_REPOSITORY)
    private readonly variants: PublicProductVariantRepository,
  ) {}

  /**
   * The selectable variants at one public Product address.
   *
   * A Product with no active variant returns an **empty list**, not a 404: it is
   * published and it exists, it simply cannot form an APP5 catalog request
   * today. `APP5-S01` renders the approved unavailable state for that, which it
   * could not do if the answer were indistinguishable from a product that was
   * never published.
   */
  async publicRead(slug: string): Promise<PublicProductVariantListView> {
    const found = await this.variants.findPublicVariants(slug);
    if (found === undefined) {
      throw publicProductNotFound();
    }
    return toPublicVariantListView(found);
  }
}

/**
 * Domain → view.
 *
 * A separate function rather than an inline map so the exhaustive field list
 * lives in one place: adding a column to `PublicProductVariantRow` does not
 * silently publish it, because it has to be named here as well.
 */
export function toPublicVariantListView(
  source: PublicProductVariants,
): PublicProductVariantListView {
  return {
    productId: source.productId,
    variants: source.variants.map((variant) => ({
      productVariantId: variant.id,
      colorName: variant.colorName ?? null,
      sizeLabel: variant.sizeLabel ?? null,
    })),
  };
}
