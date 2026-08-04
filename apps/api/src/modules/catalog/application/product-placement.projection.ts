/**
 * Row → view projection for both placement reads (`APP3-B01`; IMP-D041 PO-02).
 *
 * The two views are built here, side by side and from the same rows, because
 * the difference between them **is** the security contract: the Admin view
 * carries `backgroundAssetId`, `retiredAt` and `supersededById`; the public
 * manifest carries none of the three, and never a storage key, an original URL
 * or a derivative address in any form. Writing them in two files would let one
 * drift into the other's fields the first time a field was added.
 *
 * Measurements become `number` here and nowhere else. The columns are `numeric`
 * and cross the repository boundary as strings so the operator's authored value
 * is not re-rounded on the way in; the wire and the geometry engine both want
 * numbers, so exactly one conversion happens, at exactly this point.
 */
import type {
  PlacementAreaRow,
  PlacementSideRow,
  PlacementSnapshot,
  PublicPlacement,
  PublicPlacementSideRow,
} from '../domain/repositories/product-placement.repository';
import { toFiniteNumber, toOptionalNumber } from './product-placement-geometry';

export interface AdminPlacementAreaView {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly displayOrder: number;
  readonly boundXPx: number;
  readonly boundYPx: number;
  readonly boundWidthPx: number;
  readonly boundHeightPx: number;
  readonly maxWidthMm: number | null;
  readonly maxHeightMm: number | null;
  readonly retiredAt: string | null;
  readonly supersededById: string | null;
}

export interface AdminPlacementSideView {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly displayOrder: number;
  readonly backgroundAssetId: string;
  readonly imageWidthPx: number;
  readonly imageHeightPx: number;
  readonly physicalWidthMm: number;
  readonly physicalHeightMm: number;
  readonly pxPerMm: number;
  readonly retiredAt: string | null;
  readonly supersededById: string | null;
  readonly areas: readonly AdminPlacementAreaView[];
}

export interface AdminPlacementView {
  readonly productId: string;
  readonly productStatus: string;
  /**
   * The concurrency token a replace must echo back.
   *
   * Not in the IMP-D041 PO-02 field list because that list describes the
   * *public* manifest. Without it the Admin read could not be followed by a
   * safe write at all, and the operator's client would have to guess.
   */
  readonly updatedAt: string;
  readonly sides: readonly AdminPlacementSideView[];
}

/** A `null` retirement instant means "still selectable", never "unknown". */
const instant = (value: Date | undefined): string | null =>
  value === undefined ? null : value.toISOString();

export function toAdminAreaView(row: PlacementAreaRow): AdminPlacementAreaView {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    displayOrder: row.displayOrder,
    boundXPx: toFiniteNumber(row.boundXPx),
    boundYPx: toFiniteNumber(row.boundYPx),
    boundWidthPx: toFiniteNumber(row.boundWidthPx),
    boundHeightPx: toFiniteNumber(row.boundHeightPx),
    maxWidthMm: toOptionalNumber(row.maxWidthMm) ?? null,
    maxHeightMm: toOptionalNumber(row.maxHeightMm) ?? null,
    retiredAt: instant(row.retiredAt),
    supersededById: row.supersededById ?? null,
  };
}

export function toAdminSideView(
  row: PlacementSideRow,
  areas: readonly PlacementAreaRow[],
): AdminPlacementSideView {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    displayOrder: row.displayOrder,
    backgroundAssetId: row.backgroundAssetId,
    imageWidthPx: row.imageWidthPx,
    imageHeightPx: row.imageHeightPx,
    physicalWidthMm: toFiniteNumber(row.physicalWidthMm),
    physicalHeightMm: toFiniteNumber(row.physicalHeightMm),
    pxPerMm: toFiniteNumber(row.pxPerMm),
    retiredAt: instant(row.retiredAt),
    supersededById: row.supersededById ?? null,
    areas: areas.map(toAdminAreaView),
  };
}

export function toAdminPlacementView(snapshot: PlacementSnapshot): AdminPlacementView {
  const areasBySide = groupBySide(snapshot.areas);
  return {
    productId: snapshot.product.id,
    productStatus: snapshot.product.status,
    updatedAt: snapshot.product.updatedAt.toISOString(),
    sides: snapshot.sides.map((side) => toAdminSideView(side, areasBySide.get(side.id) ?? [])),
  };
}

/**
 * The reference components `APP3-B02` will address a background with.
 *
 * Components, not a URL: B02 owns the side-background delivery route and has not
 * been built, so composing a path here would publish an address that does not
 * resolve — the one defect a JSON contract can create entirely on its own. The
 * Product slug and the Side's stable code are what that route will be keyed by,
 * and neither is private.
 */
export interface PublicBackgroundReference {
  readonly productSlug: string;
  readonly sideCode: string;
}

export interface PublicPlacementAreaView {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly displayOrder: number;
  readonly boundXPx: number;
  readonly boundYPx: number;
  readonly boundWidthPx: number;
  readonly boundHeightPx: number;
  readonly maxWidthMm: number | null;
  readonly maxHeightMm: number | null;
}

export interface PublicPlacementSideView {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly displayOrder: number;
  readonly imageWidthPx: number;
  readonly imageHeightPx: number;
  readonly physicalWidthMm: number;
  readonly physicalHeightMm: number;
  readonly pxPerMm: number;
  readonly background: PublicBackgroundReference;
  readonly areas: readonly PublicPlacementAreaView[];
}

export interface PublicPlacementView {
  readonly productId: string;
  readonly slug: string;
  readonly studioEligible: boolean;
  readonly sides: readonly PublicPlacementSideView[];
}

function toPublicAreaView(row: PlacementAreaRow): PublicPlacementAreaView {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    displayOrder: row.displayOrder,
    boundXPx: toFiniteNumber(row.boundXPx),
    boundYPx: toFiniteNumber(row.boundYPx),
    boundWidthPx: toFiniteNumber(row.boundWidthPx),
    boundHeightPx: toFiniteNumber(row.boundHeightPx),
    maxWidthMm: toOptionalNumber(row.maxWidthMm) ?? null,
    maxHeightMm: toOptionalNumber(row.maxHeightMm) ?? null,
  };
}

function toPublicSideView(
  row: PublicPlacementSideRow,
  slug: string,
  areas: readonly PlacementAreaRow[],
): PublicPlacementSideView {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    displayOrder: row.displayOrder,
    imageWidthPx: row.imageWidthPx,
    imageHeightPx: row.imageHeightPx,
    physicalWidthMm: toFiniteNumber(row.physicalWidthMm),
    physicalHeightMm: toFiniteNumber(row.physicalHeightMm),
    pxPerMm: toFiniteNumber(row.pxPerMm),
    background: { productSlug: slug, sideCode: row.code },
    areas: areas.map(toPublicAreaView),
  };
}

/**
 * The public manifest, and the one derivation `studioEligible` is allowed.
 *
 * A Product is Studio-eligible when **one** side is completely usable: it has at
 * least one active Area *and* an editor-safe background the repository already
 * proved. Spread across two sides — areas on one, a usable background on the
 * other — nothing can actually be designed, and reporting `true` would put the
 * customer in an editor with no canvas.
 *
 * Incomplete placement is therefore `false` and never fabricated geometry
 * (IMP-D041 PO-02, PO-06). Publication is not affected either way: a Product
 * with no placement at all stays publicly visible with `studioEligible: false`.
 */
export function toPublicPlacementView(placement: PublicPlacement): PublicPlacementView {
  const areasBySide = groupBySide(placement.areas);
  const sides = placement.sides.map((side) =>
    toPublicSideView(side, placement.slug, areasBySide.get(side.id) ?? []),
  );
  const studioEligible = placement.sides.some(
    (side) => side.hasEligibleBackground && (areasBySide.get(side.id)?.length ?? 0) > 0,
  );
  return { productId: placement.productId, slug: placement.slug, studioEligible, sides };
}

function groupBySide(areas: readonly PlacementAreaRow[]): Map<string, PlacementAreaRow[]> {
  const grouped = new Map<string, PlacementAreaRow[]>();
  for (const area of areas) {
    const existing = grouped.get(area.productSideId);
    if (existing === undefined) grouped.set(area.productSideId, [area]);
    else existing.push(area);
  }
  return grouped;
}
