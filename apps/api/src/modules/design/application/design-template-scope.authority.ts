/**
 * The placement scope a Design Template header may claim (`APP3-B03` §6).
 *
 * `IMP-D042` PO-06 rules that APP3 publishes **area-scoped Templates only**,
 * requiring the exact `product_id → product_side_id → embroidery_area_id` chain
 * with all three active under `IMP-D041` — and, in the same ruling, that
 * *"drafts may hold an incomplete scope while being authored but cannot publish
 * until it is complete"*.
 *
 * Those two sentences give this file its whole shape. A draft may name **no**
 * scope at all, which is why the columns are nullable. What it may never hold is
 * a *partial* scope: a Side with no Product, or an Area belonging to a different
 * Side, is not "incomplete", it is wrong — and `APP3-B04` would have to repair
 * it before it could publish, which is exactly the state §12 of the backend
 * standard says a request must not be able to create.
 *
 * Validation reads through `PRODUCT_PLACEMENT_REPOSITORY`, the same port
 * `APP3-B08` uses, so Design never touches Catalog's tables or its
 * controller-bearing module.
 *
 * Publication readiness is **not** decided here. Whether the Product is
 * published, whether the document fits the Area, whether assets are eligible —
 * all of that is `IMP-D042` PO-07's `GRD-T01`, and it belongs to `APP3-B04`. A
 * draft scoped to an unpublished Product is a perfectly ordinary draft.
 */
import { Inject, Injectable } from '@nestjs/common';

import {
  PRODUCT_PLACEMENT_REPOSITORY,
  type ProductPlacementRepository,
} from '../../catalog/domain/repositories/product-placement.repository';
import type {
  EmbroideryAreaId,
  ProductId,
  ProductSideId,
} from '../../catalog/domain/repositories/placement-hierarchy.port';
import { designTemplateDraftError } from '../domain/design-template-draft.errors';

/** The three ids as a caller may supply them: all present, or all absent. */
export interface TemplateScopeCandidate {
  readonly productId?: string | undefined;
  readonly productSideId?: string | undefined;
  readonly embroideryAreaId?: string | undefined;
}

export interface ResolvedTemplateScope {
  readonly productId: ProductId;
  readonly productSideId: ProductSideId;
  readonly embroideryAreaId: EmbroideryAreaId;
}

@Injectable()
export class DesignTemplateScopeAuthority {
  constructor(
    @Inject(PRODUCT_PLACEMENT_REPOSITORY)
    private readonly placement: ProductPlacementRepository,
  ) {}

  /**
   * Resolves a scope candidate, or `undefined` for a deliberately unscoped
   * draft.
   *
   * Throws `DESIGN_TEMPLATE_SCOPE_INCOMPLETE` for a partial triple and
   * `DESIGN_TEMPLATE_SCOPE_INVALID` for one that does not resolve — including a
   * retired Side or Area. A retired row is not a placement a *new* draft may be
   * authored against: `IMP-D041` retires without deleting precisely so existing
   * references survive, and creating a fresh one would defeat that.
   */
  async resolve(candidate: TemplateScopeCandidate): Promise<ResolvedTemplateScope | undefined> {
    const supplied = [
      candidate.productId,
      candidate.productSideId,
      candidate.embroideryAreaId,
    ].filter((value) => value !== undefined && value !== '');

    if (supplied.length === 0) return undefined;
    if (supplied.length !== 3) {
      throw designTemplateDraftError('DESIGN_TEMPLATE_SCOPE_INCOMPLETE');
    }

    const productId = candidate.productId as string;
    const snapshot = await this.placement.findPlacement(productId as ProductId);
    if (snapshot === undefined) {
      throw designTemplateDraftError('DESIGN_TEMPLATE_SCOPE_INVALID');
    }

    const side = snapshot.sides.find((row) => row.id === candidate.productSideId);
    if (side === undefined || side.retiredAt !== undefined) {
      throw designTemplateDraftError('DESIGN_TEMPLATE_SCOPE_INVALID');
    }

    const area = snapshot.areas.find((row) => row.id === candidate.embroideryAreaId);
    // The Area must hang from *this* Side. Without that check a Template could
    // be scoped to an Area on a different Side of the same Product, and the
    // geometry `APP3-B04` later validates would be the wrong Area's.
    if (area === undefined || area.retiredAt !== undefined || area.productSideId !== side.id) {
      throw designTemplateDraftError('DESIGN_TEMPLATE_SCOPE_INVALID');
    }

    // `side.id` and `area.id` are already branded by the placement port, so the
    // resolved scope carries the repository's own identities rather than the
    // caller's strings — the Product id is the only one that still needs the
    // brand, because it was never read back.
    return {
      productId: snapshot.product.id,
      productSideId: side.id,
      embroideryAreaId: area.id,
    };
  }
}
