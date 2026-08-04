/**
 * The bridge to P01's quantization authority.
 *
 * `IMP-D045` reuses `DESIGN_DOCUMENT_QUANTIZATION_SCALE = 10_000` and forbids a
 * second precision, so this file imports the helper rather than reimplementing
 * the arithmetic — two implementations of "four decimal places" are two things
 * that can disagree about a value an approval is bound to.
 *
 * ## Why comparisons quantize instead of using an epsilon
 *
 * Geometry may use full floating-point precision internally; only what is
 * compared or returned is snapped to the grid. Comparing `a === b` after both
 * are quantized is exact and symmetric, whereas `Math.abs(a - b) < ε` invents a
 * tolerance nobody ruled — and PO-09 says boundary equality **passes**, which an
 * epsilon would quietly widen into "boundary plus ε passes too".
 */
import { quantizeNumber } from '@embroidery/design-document';

import type { Bounds2D } from './types';

export { DESIGN_DOCUMENT_QUANTIZATION_SCALE } from '@embroidery/design-document';

/** Snaps one value onto the locked grid. `-0` normalizes to `0`. */
export function quantize(value: number): number {
  return quantizeNumber(value);
}

export function quantizeBounds(bounds: Bounds2D): Bounds2D {
  return {
    minX: quantize(bounds.minX),
    minY: quantize(bounds.minY),
    maxX: quantize(bounds.maxX),
    maxY: quantize(bounds.maxY),
  };
}

/** Exact equality on the grid — the only comparison placement authority uses. */
export function quantizedEquals(left: number, right: number): boolean {
  return quantize(left) === quantize(right);
}

/** `left <= right` on the grid, so touching a boundary exactly passes. */
export function quantizedAtMost(left: number, right: number): boolean {
  return quantize(left) <= quantize(right);
}

/** `left >= right` on the grid, so touching a boundary exactly passes. */
export function quantizedAtLeast(left: number, right: number): boolean {
  return quantize(left) >= quantize(right);
}
