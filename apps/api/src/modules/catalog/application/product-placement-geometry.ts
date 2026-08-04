/**
 * The geometry half of placement validation, delegated to
 * `@embroidery/design-engine` (`APP3-B01`; IMP-D045).
 *
 * Nothing here computes geometry. `IMP-D045` makes `design-engine` the sole
 * owner of coordinate, scale and containment semantics and the APP3 source map
 * says in as many words that no other package may re-implement them — so this
 * file's whole job is to turn stored `numeric` strings into the numbers the
 * engine takes, call it, and translate its findings into the feature's safe
 * errors.
 *
 * The temptation it exists to remove is a two-line `width / mm !== pxPerMm`
 * check written inline "because it is obvious". It is obvious and it is also a
 * second authority: the engine reports both axes rather than averaging them,
 * compares exactly on the quantized grid rather than with a tolerance, and
 * treats a boundary-touching area as contained. A local copy would agree with
 * none of those the first time an operator authored a side whose two axes
 * disagreed by one ten-thousandth.
 */
import {
  containsBounds,
  rectToBounds,
  validateProductSideScaleConsistency,
  type EmbroideryAreaAuthority,
  type PlacementAuthority,
} from '@embroidery/design-engine';

import { productPlacementError } from '../domain/product-placement.errors';

/** A side as the engine wants it: every measurement already a finite number. */
export interface SideGeometry {
  readonly code: string;
  readonly imageWidthPx: number;
  readonly imageHeightPx: number;
  readonly physicalWidthMm: number;
  readonly physicalHeightMm: number;
  readonly pxPerMm: number;
}

export interface AreaGeometry {
  readonly code: string;
  readonly boundXPx: number;
  readonly boundYPx: number;
  readonly boundWidthPx: number;
  readonly boundHeightPx: number;
  readonly maxWidthMm?: number | undefined;
  readonly maxHeightMm?: number | undefined;
}

/**
 * Parses a stored `numeric` string.
 *
 * `Number()` rather than `parseFloat`: `parseFloat('12abc')` is 12, which would
 * turn a corrupt column into a plausible measurement. A non-finite result is a
 * validation failure, never a NaN that silently propagates into a bound.
 */
export function toFiniteNumber(value: string | number): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    throw productPlacementError('PLACEMENT_GEOMETRY_INVALID');
  }
  return parsed;
}

export function toOptionalNumber(value: string | undefined | null): number | undefined {
  return value === undefined || value === null ? undefined : toFiniteNumber(value);
}

/**
 * The engine's Product Side authority shape.
 *
 * `retiredAt: null` unconditionally — this is authoring-time validation of the
 * geometry itself, and whether the row is selectable is a separate question the
 * engine answers for *documents*, not for the operator authoring the side.
 */
function asAuthority(side: SideGeometry, productSideId: string): PlacementAuthority {
  return {
    productSideId,
    code: side.code,
    retiredAt: null,
    imageWidthPx: side.imageWidthPx,
    imageHeightPx: side.imageHeightPx,
    physicalWidthMm: side.physicalWidthMm,
    physicalHeightMm: side.physicalHeightMm,
    pxPerMm: side.pxPerMm,
  };
}

/**
 * Rejects a side whose two axes imply different scales.
 *
 * A side whose width says 5 px/mm and whose height says 4 is not a rounding
 * problem to be averaged away — one of the three numbers the operator typed is
 * wrong, and every millimetre the Studio later reports for that side would be
 * wrong with it.
 */
export function assertSideScaleConsistent(side: SideGeometry, productSideId: string): void {
  const result = validateProductSideScaleConsistency(asAuthority(side, productSideId));
  if (!result.ok) {
    throw productPlacementError(
      'PLACEMENT_SCALE_INCONSISTENT',
      result.findings.map((finding) => finding.code),
    );
  }
}

/**
 * Rejects an area that is not wholly inside its side's canvas.
 *
 * Boundary-inclusive, because the engine's containment is: an area flush with
 * the right edge of the background is a legitimate placement, and rejecting it
 * would make the last usable column of pixels unreachable. One unit past it is
 * not.
 */
export function assertAreaWithinCanvas(side: SideGeometry, area: AreaGeometry): void {
  const canvas = rectToBounds({ x: 0, y: 0, width: side.imageWidthPx, height: side.imageHeightPx });
  const bounds = rectToBounds({
    x: area.boundXPx,
    y: area.boundYPx,
    width: area.boundWidthPx,
    height: area.boundHeightPx,
  });
  if (!containsBounds(canvas, bounds)) {
    throw productPlacementError('PLACEMENT_AREA_OUTSIDE_CANVAS');
  }
}

/**
 * The engine's Embroidery Area authority shape, for callers that need it.
 *
 * Physical maxima are optional in the schema and required by the engine's type,
 * so an absent maximum becomes the side's own physical extent: "no smaller
 * limit than the side itself" is the only reading that does not invent one.
 */
export function asAreaAuthority(
  area: AreaGeometry,
  side: SideGeometry,
  ids: { readonly embroideryAreaId: string; readonly productSideId: string },
): EmbroideryAreaAuthority {
  return {
    embroideryAreaId: ids.embroideryAreaId,
    productSideId: ids.productSideId,
    code: area.code,
    retiredAt: null,
    boundXPx: area.boundXPx,
    boundYPx: area.boundYPx,
    boundWidthPx: area.boundWidthPx,
    boundHeightPx: area.boundHeightPx,
    maxWidthMm: area.maxWidthMm ?? side.physicalWidthMm,
    maxHeightMm: area.maxHeightMm ?? side.physicalHeightMm,
  };
}
