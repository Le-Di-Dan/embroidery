/**
 * Public placement resolution for a Session bootstrap (`APP3-B07` §7).
 *
 * One bounded snapshot through `ProductPlacementQuery.publicRead`, which is the
 * accepted `APP3-B01`/`B02` publication authority: it already refuses an
 * unpublished Product, a Product under a non-public Category, a retired Side and
 * a retired Area. Re-deriving any of that here would be a second, quietly
 * divergent definition of "publicly designable".
 *
 * The caller names a Product slug, a Side code and an Area code, and this
 * resolves **the chain**, never three independent lookups: the Side must belong
 * to that Product's manifest and the Area to that Side. A caller cannot pair a
 * Side from one Product with an Area from another, because neither is looked up
 * outside its parent.
 *
 * Every miss — unknown slug, unpublished Product, unknown or retired code —
 * collapses to one `undefined`. The caller turns that into a single public
 * failure that names nothing.
 */
import { Injectable } from '@nestjs/common';

import { ProductPlacementQuery } from '../../catalog/application/product-placement.query';
import type { DesignSessionScopeView } from './design-session-snapshot';

export interface ResolvedDesignScope {
  /** Internal ids, for persistence and the document's placement snapshot. */
  readonly productId: string;
  readonly productSideId: string;
  readonly embroideryAreaId: string;
  /** The public view returned to the client. */
  readonly view: DesignSessionScopeView;
  /** Area limits, needed by the `APP3-P02` containment authority. */
  readonly maxWidthMm: number;
  readonly maxHeightMm: number;
}

export interface DesignScopeRequest {
  readonly productSlug: string;
  readonly sideCode: string;
  readonly areaCode: string;
}

@Injectable()
export class DesignSessionScopeResolver {
  constructor(private readonly placement: ProductPlacementQuery) {}

  async resolve(request: DesignScopeRequest): Promise<ResolvedDesignScope | undefined> {
    let manifest;
    try {
      manifest = await this.placement.publicRead(request.productSlug);
    } catch {
      // A not-found or not-published Product raises through the catalog's own
      // error contract. It is not this operation's job to distinguish those for
      // an anonymous caller, so every miss becomes the same absent result.
      return undefined;
    }

    // `APP3-G01`: being published is not the same as being designable. A
    // Product can be publicly visible and still not offer the Studio, and
    // opening a Session on one would be exactly the conflation G01 refused.
    if (!manifest.studioEligible) return undefined;

    const side = manifest.sides.find((candidate) => candidate.code === request.sideCode);
    if (side === undefined) return undefined;

    const area = side.areas.find((candidate) => candidate.code === request.areaCode);
    if (area === undefined) return undefined;

    return {
      productId: manifest.productId,
      productSideId: side.id,
      embroideryAreaId: area.id,
      // An absent mm cap means "no cap beyond the area itself", so the physical
      // size of the area's own bounds is the limit. Passing a zero or an
      // invented constant to `APP3-P02` would either reject every document or
      // silently widen the area.
      maxWidthMm: area.maxWidthMm ?? area.boundWidthPx / side.pxPerMm,
      maxHeightMm: area.maxHeightMm ?? area.boundHeightPx / side.pxPerMm,
      view: {
        productSlug: request.productSlug,
        sideCode: side.code,
        areaCode: area.code,
        canvasWidthPx: side.imageWidthPx,
        canvasHeightPx: side.imageHeightPx,
        physicalWidthMm: side.physicalWidthMm,
        physicalHeightMm: side.physicalHeightMm,
        pxPerMm: side.pxPerMm,
        boundXPx: area.boundXPx,
        boundYPx: area.boundYPx,
        boundWidthPx: area.boundWidthPx,
        boundHeightPx: area.boundHeightPx,
      },
    };
  }
}
