/**
 * px ↔ mm conversion (`IMP-D045` PO-10).
 *
 * The **sole** source of scale is `product_sides.px_per_mm`, arriving through
 * caller authority. There is no DPI constant here and there never may be: 96 DPI
 * is a CSS convention about screens, image-metadata DPI is whatever a camera
 * wrote, and the Embroidery Area's own width ratio is a different quantity that
 * merely looks like this one. The APP0-R01 spike derived `mmPerPx` from the area
 * and is superseded on exactly this point.
 *
 * Getting it wrong is not a rounding error — it is stitching a logo at the wrong
 * physical size, which is discovered on a garment.
 */
import { quantize, quantizedEquals } from '../geometry/quantized';
import { geometryFinding, geometryResult, type GeometryFinding } from '../findings/finding';
import type { GeometryValidationResult } from '../findings/finding';
import type { Size2D } from '../geometry/types';
import type { PlacementAuthority } from './authority';

export class UnitConversionError extends Error {}

function requireScale(pxPerMm: number): number {
  if (!Number.isFinite(pxPerMm) || pxPerMm <= 0) {
    throw new UnitConversionError('pxPerMm must be a finite number greater than zero.');
  }
  return pxPerMm;
}

/**
 * Lengths may be zero but never negative.
 *
 * A zero-length side is a legitimate degenerate box; a negative one is a sign
 * convention nothing in v1 defines, so it fails rather than being absolved by
 * `Math.abs`.
 */
function requireLength(value: number, label: string): number {
  if (!Number.isFinite(value)) {
    throw new UnitConversionError(`${label} must be a finite number.`);
  }
  if (value < 0) {
    throw new UnitConversionError(`${label} must not be negative.`);
  }
  return value;
}

export function pxToMm(px: number, pxPerMm: number): number {
  return quantize(requireLength(px, 'Length in px') / requireScale(pxPerMm));
}

export function mmToPx(mm: number, pxPerMm: number): number {
  return quantize(requireLength(mm, 'Length in mm') * requireScale(pxPerMm));
}

export function sizePxToMm(size: Size2D, pxPerMm: number): Size2D {
  return { width: pxToMm(size.width, pxPerMm), height: pxToMm(size.height, pxPerMm) };
}

export function sizeMmToPx(size: Size2D, pxPerMm: number): Size2D {
  return { width: mmToPx(size.width, pxPerMm), height: mmToPx(size.height, pxPerMm) };
}

/**
 * Proves the Product Side's own numbers agree with its `px_per_mm` on **both**
 * axes.
 *
 * When they disagree the authority is inconsistent and the caller is told so.
 * Averaging the two would invent a scale neither axis states and make every
 * downstream millimetre subtly wrong in a way nothing would ever surface.
 */
export function validateProductSideScaleConsistency(
  side: PlacementAuthority,
): GeometryValidationResult {
  const findings: GeometryFinding[] = [];

  if (!Number.isFinite(side.pxPerMm) || side.pxPerMm <= 0) {
    findings.push(
      geometryFinding(
        'PX_PER_MM_MISMATCH',
        '$.placementAuthority.pxPerMm',
        'Product Side pxPerMm must be a finite number greater than zero.',
      ),
    );
    return geometryResult(findings);
  }

  for (const [axis, px, mm] of [
    ['width', side.imageWidthPx, side.physicalWidthMm],
    ['height', side.imageHeightPx, side.physicalHeightMm],
  ] as const) {
    if (!Number.isFinite(px) || !Number.isFinite(mm) || mm <= 0) {
      findings.push(
        geometryFinding(
          'PX_PER_MM_MISMATCH',
          `$.placementAuthority.${axis}`,
          'Product Side physical dimensions must be finite and greater than zero.',
        ),
      );
      continue;
    }
    if (!quantizedEquals(px / mm, side.pxPerMm)) {
      findings.push(
        geometryFinding(
          'PX_PER_MM_MISMATCH',
          `$.placementAuthority.${axis}`,
          'This axis implies a different scale from the recorded pxPerMm.',
          { meta: { implied: quantize(px / mm), recorded: quantize(side.pxPerMm) } },
        ),
      );
    }
  }

  return geometryResult(findings);
}
