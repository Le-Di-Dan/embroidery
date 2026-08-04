/**
 * The two placement reads (`APP3-B01`; IMP-D041 PO-02).
 *
 * Orchestration only: ask the repository, project. No transaction, no lock, no
 * cache — the invariant that unpublishing a Product removes it from the manifest
 * on the next read is satisfied by there being nothing between the caller and
 * the row.
 *
 * The public query never learns *why* a lookup failed. Unknown slug, draft,
 * archived and a product whose category is not public all collapse to the same
 * absence here, and therefore to the same 404 at the boundary — the treatment
 * `public-product.query.ts` already established, and the only one that does not
 * let an anonymous caller enumerate unpublished products.
 */
import { Inject, Injectable } from '@nestjs/common';

import { publicProductNotFound } from '../domain/public-product-catalog.errors';
import { productPlacementError } from '../domain/product-placement.errors';
import type { ProductId } from '../domain/repositories/placement-hierarchy.port';
import {
  PRODUCT_PLACEMENT_REPOSITORY,
  type ProductPlacementRepository,
} from '../domain/repositories/product-placement.repository';
import {
  toAdminPlacementView,
  toPublicPlacementView,
  type AdminPlacementView,
  type PublicPlacementView,
} from './product-placement.projection';

@Injectable()
export class ProductPlacementQuery {
  constructor(
    @Inject(PRODUCT_PLACEMENT_REPOSITORY) private readonly placement: ProductPlacementRepository,
  ) {}

  /**
   * The Admin authoring model, active and retired rows alike.
   *
   * Retired rows are included deliberately: they are what an existing Template
   * or Session references, and an operator who could not see them would have no
   * way to understand why a code is unavailable.
   */
  async adminRead(productId: string): Promise<AdminPlacementView> {
    const snapshot = await this.placement.findPlacement(productId as ProductId);
    if (snapshot === undefined) {
      throw productPlacementError('PLACEMENT_PRODUCT_NOT_FOUND');
    }
    return toAdminPlacementView(snapshot);
  }

  /**
   * The public manifest for a Storefront Product address.
   *
   * A Product with no placement at all is **not** an error: publication does not
   * require placement (IMP-D041 PO-06), so this returns an empty side list with
   * `studioEligible: false` rather than a 404. Only the Product's own public
   * visibility decides whether the manifest exists.
   */
  async publicRead(slug: string): Promise<PublicPlacementView> {
    const placement = await this.placement.findPublicPlacement(slug);
    if (placement === undefined) {
      throw publicProductNotFound();
    }
    return toPublicPlacementView(placement);
  }
}
