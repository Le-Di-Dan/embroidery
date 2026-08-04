/**
 * Row → domain mapping for placement (`APP3-B01`).
 *
 * The single boundary at which a `product_sides` or `embroidery_areas` row
 * becomes a domain object. `numeric` stays a string all the way through — the
 * same rule money follows, for the same reason: the operator authored
 * `physical_width_mm`, and a float round-trip here would hand back a value they
 * never typed.
 *
 * `null` becomes `undefined` at this line and nowhere else, so nothing
 * downstream has to handle both spellings of "absent".
 */
import type { schema } from '@embroidery/database';

import type {
  EmbroideryAreaId,
  ProductId,
  ProductSideId,
} from '../../domain/repositories/placement-hierarchy.port';
import type {
  PlacementAreaRow,
  PlacementSideRow,
} from '../../domain/repositories/product-placement.repository';

export type PlacementSideDbRow = typeof schema.productSides.$inferSelect;
export type PlacementAreaDbRow = typeof schema.embroideryAreas.$inferSelect;

export function toSide(row: PlacementSideDbRow): PlacementSideRow {
  return {
    id: row.id as ProductSideId,
    productId: row.productId as ProductId,
    code: row.code,
    name: row.name,
    displayOrder: row.displayOrder,
    backgroundAssetId: row.backgroundAssetId,
    imageWidthPx: row.imageWidthPx,
    imageHeightPx: row.imageHeightPx,
    physicalWidthMm: row.physicalWidthMm,
    physicalHeightMm: row.physicalHeightMm,
    pxPerMm: row.pxPerMm,
    retiredAt: row.retiredAt ?? undefined,
    supersededById: (row.supersededById ?? undefined) as ProductSideId | undefined,
  };
}

export function toArea(row: PlacementAreaDbRow): PlacementAreaRow {
  return {
    id: row.id as EmbroideryAreaId,
    productSideId: row.productSideId as ProductSideId,
    code: row.code,
    name: row.name,
    displayOrder: row.displayOrder,
    boundXPx: row.boundXPx,
    boundYPx: row.boundYPx,
    boundWidthPx: row.boundWidthPx,
    boundHeightPx: row.boundHeightPx,
    maxWidthMm: row.maxWidthMm ?? undefined,
    maxHeightMm: row.maxHeightMm ?? undefined,
    retiredAt: row.retiredAt ?? undefined,
    supersededById: (row.supersededById ?? undefined) as EmbroideryAreaId | undefined,
  };
}
