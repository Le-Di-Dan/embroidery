/**
 * The placement a saved document must agree with (`APP3-B08` §7).
 *
 * `APP3-B07` resolves a placement from the *public* names a caller supplies — a
 * Product slug and two codes — because bootstrap is the moment a caller chooses
 * where to design. Autosave is not that moment. The Session already records
 * which Product, Side and Area it was opened against, and those persisted ids
 * are the only authority a save may be checked against; re-resolving from
 * anything the client sends would let a caller move a live Session onto a
 * different placement by asking nicely.
 *
 * So this reads by id, through the placement repository `CatalogPlacementRead`
 * already exports. Two consequences are deliberate:
 *
 * - `findPlacement` projects retired rows as well as live ones, so `retiredAt`
 *   arrives as the real value. B07's resolver can hard-code `retiredAt: null`
 *   because the public manifest it reads never contains a retired row; here the
 *   row is fetched by id and a retired Side or Area is a genuine possibility,
 *   which `APP3-P02` is then allowed to refuse.
 * - Publication is *not* re-checked. `APP3-G01`'s `studioEligible` governs
 *   whether a Session may be **opened**; a Product unpublished mid-session does
 *   not retroactively make the customer's in-progress work unsavable. Retirement
 *   of the actual Side or Area is the geometry-affecting change, and that is
 *   caught above.
 *
 * Numeric columns arrive from Drizzle as strings; every one is converted here,
 * once, so no consumer re-parses a dimension.
 */
import { Inject, Injectable } from '@nestjs/common';
import type { EmbroideryAreaAuthority, PlacementAuthority } from '@embroidery/design-engine';

import {
  PRODUCT_PLACEMENT_REPOSITORY,
  type ProductPlacementRepository,
} from '../../catalog/domain/repositories/product-placement.repository';
import type {
  EmbroideryAreaId,
  ProductId,
  ProductSideId,
} from '../../catalog/domain/repositories/placement-hierarchy.port';

export interface SessionPlacementAuthority {
  readonly side: PlacementAuthority;
  readonly area: EmbroideryAreaAuthority;
}

/**
 * The three ids a placement is resolved from.
 *
 * Narrowed from `DesignSession` to exactly the fields this resolver reads
 * (`APP6-B08`). `DesignSession` still satisfies it structurally, so every APP3
 * caller is unchanged and untouched; the widening is what lets `APP6-B08` resolve
 * the same authority for a **formal** version — whose placement comes from the
 * submitted session but which is not itself a session — without a second copy of
 * the retirement, chain and unit-conversion rules below. A second copy is how the
 * two would eventually disagree about what a retired Area means.
 */
export interface PlacementChainReference {
  readonly productId: ProductId;
  readonly productSideId: ProductSideId;
  readonly embroideryAreaId: EmbroideryAreaId;
}

@Injectable()
export class SessionPlacementResolver {
  constructor(
    @Inject(PRODUCT_PLACEMENT_REPOSITORY)
    private readonly placement: ProductPlacementRepository,
  ) {}

  /**
   * Resolves the Side and Area this Session is bound to.
   *
   * `undefined` when either row has vanished, or when the Area no longer hangs
   * from that Side — a chain that no longer resolves cannot authorize a save,
   * and inventing geometry for it would be worse than refusing.
   */
  async resolve(session: PlacementChainReference): Promise<SessionPlacementAuthority | undefined> {
    const snapshot = await this.placement.findPlacement(session.productId);
    if (snapshot === undefined) return undefined;

    const side = snapshot.sides.find((row) => row.id === session.productSideId);
    if (side === undefined) return undefined;

    const area = snapshot.areas.find((row) => row.id === session.embroideryAreaId);
    // The Area must belong to *this* Side. Without that check a Session could be
    // validated against an Area from a different Side of the same Product.
    if (area === undefined || area.productSideId !== side.id) return undefined;

    const pxPerMm = Number(side.pxPerMm);
    const boundWidthPx = Number(area.boundWidthPx);
    const boundHeightPx = Number(area.boundHeightPx);

    return {
      side: {
        productSideId: side.id,
        code: side.code,
        // `APP3-P02` reads retirement as an ISO instant, not a `Date`.
        retiredAt: side.retiredAt?.toISOString() ?? null,
        imageWidthPx: side.imageWidthPx,
        imageHeightPx: side.imageHeightPx,
        physicalWidthMm: Number(side.physicalWidthMm),
        physicalHeightMm: Number(side.physicalHeightMm),
        pxPerMm,
      },
      area: {
        embroideryAreaId: area.id,
        productSideId: area.productSideId,
        code: area.code,
        retiredAt: area.retiredAt?.toISOString() ?? null,
        boundXPx: Number(area.boundXPx),
        boundYPx: Number(area.boundYPx),
        boundWidthPx,
        boundHeightPx,
        // Absent mm caps mean "no cap beyond the area itself", exactly as the
        // B07 resolver reads them. A zero would reject every document.
        maxWidthMm:
          area.maxWidthMm === undefined ? boundWidthPx / pxPerMm : Number(area.maxWidthMm),
        maxHeightMm:
          area.maxHeightMm === undefined ? boundHeightPx / pxPerMm : Number(area.maxHeightMm),
      },
    };
  }
}
