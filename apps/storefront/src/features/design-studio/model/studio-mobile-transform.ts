/**
 * The numeric transform the mobile sheet offers (`APP3-S11`, `610:294`).
 *
 * `610:294` draws three read-outs — `Rộng (mm)`, `Cao (mm)`, `Xoay (°)` — each
 * with a decrement and an increment. That is a **button** path to the capability
 * `APP3-S03` already owns, not a second geometry engine: every function here
 * returns a `DesignElementTransform` candidate, and the caller puts it through
 * `ruleOnCandidate` exactly as a pointer drag does. Nothing here validates,
 * quantizes, clamps or commits.
 *
 * ## Why the size buttons scale, and read back a measurement
 *
 * `IMP-D045` PO-04 makes `scaleX`/`scaleY` the persisted resize model and states
 * that scale never alters `width`/`height` — and `APP3-S03` §7 recorded why: two
 * of the five v1 element kinds cannot be resized by a width field at all. So a
 * millimetre button cannot write a millimetre; it writes the scale that moves the
 * measured size by about that much.
 *
 * The number the customer reads is therefore the **measured** physical size —
 * the same stroke-aware transformed AABB `APP3-P02` gives the desktop read-out,
 * through the same `pxPerMm` — re-measured after every accepted adjustment. A
 * rotated element's AABB does not change by exactly one millimetre when its scale
 * does, and the read-out says what it actually became rather than what was asked
 * for. A field that echoed the request would be the only number on the screen
 * that was not true.
 */
import type { DesignDocument, DesignElementTransform } from '@embroidery/design-document';
import {
  type Bounds2D,
  type ElementGraph,
  boundsSize,
  getElementBounds,
  isGeometryFinding,
  sizePxToMm,
} from '@embroidery/design-engine';

/**
 * One press of a size button, in millimetres.
 *
 * A presentation step, not a persisted precision: `APP3-P01` quantizes to four
 * decimals and no accepted authority states a UI increment, so this checkpoint
 * chooses one and says so. One millimetre is the smallest step an embroidery
 * customer can act on and is well above the quantization floor, so no press is
 * ever rounded away to nothing.
 */
export const SIZE_STEP_MM = 1;

/** One press of the rotation button, in degrees. Exactly representable at P01's precision. */
export const ROTATION_STEP_DEG = 1;

export interface MeasuredSizeMm {
  readonly widthMm: number;
  readonly heightMm: number;
}

/**
 * The element's physical size, or `null` when the engine cannot answer.
 *
 * The same authority the desktop read-out uses (`IMP-D045` PO-10): `APP3-P02`
 * bounds and the Side's `pxPerMm`, never CSS pixels, device pixel ratio, 96 DPI
 * or the viewport scale. Zooming changes how large the element looks and changes
 * nothing here.
 */
export function measuredSizeMm(
  document: DesignDocument,
  elementId: string,
  graph: ElementGraph,
  pxPerMm: number,
): MeasuredSizeMm | null {
  const bounds = getElementBounds(document, elementId, graph);
  if (isGeometryFinding(bounds as never)) return null;
  try {
    const size = sizePxToMm(boundsSize(bounds as Bounds2D), pxPerMm);
    if (!Number.isFinite(size.width) || !Number.isFinite(size.height)) return null;
    return { widthMm: size.width, heightMm: size.height };
  } catch {
    return null;
  }
}

export type SizeAxis = 'width' | 'height';

/**
 * The scale that moves one measured axis by one step.
 *
 * The factor is `(measured ± step) / measured`, so the request is expressed
 * against the size the customer can actually see. A measurement at or below zero
 * yields no candidate: there is no factor that grows a zero-sized box, and
 * inventing one would produce a scale `APP3-P01` then refuses.
 */
export function resizeByStep(
  start: DesignElementTransform,
  axis: SizeAxis,
  direction: 1 | -1,
  measured: MeasuredSizeMm,
): DesignElementTransform | undefined {
  const current = axis === 'width' ? measured.widthMm : measured.heightMm;
  if (!Number.isFinite(current) || current <= 0) return undefined;

  const target = current + direction * SIZE_STEP_MM;
  // Shrinking past nothing is not a smaller element, it is a mirrored one — and
  // `APP3-P01` would take a negative scale as a valid document.
  if (target <= 0) return undefined;

  const factor = target / current;
  return axis === 'width'
    ? { ...start, scaleX: start.scaleX * factor }
    : { ...start, scaleY: start.scaleY * factor };
}

/**
 * One step of rotation, clockwise-positive about the local-box centre.
 *
 * The same convention every other rotation in the Studio uses (`IMP-D045`
 * PO-01/PO-03): `y` grows downward, so a positive value turns clockwise on
 * screen. The value is folded into `[0, 360)` so pressing decrement from `0`
 * reads `359` rather than `-1` — the same angle, said the way a customer counts.
 */
export function rotateByStep(
  start: DesignElementTransform,
  direction: 1 | -1,
): DesignElementTransform {
  const raw = start.rotationDeg + direction * ROTATION_STEP_DEG;
  return { ...start, rotationDeg: normalizeDegrees(raw) };
}

export function normalizeDegrees(degrees: number): number {
  if (!Number.isFinite(degrees)) return 0;
  const folded = degrees % 360;
  return folded < 0 ? folded + 360 : folded;
}

/** A millimetre, as the sheet prints it. One decimal: finer than a needle places. */
export function formatMm(value: number): string {
  return value.toFixed(1);
}

/** A rotation, as the sheet prints it. Whole degrees, matching the step. */
export function formatDegrees(value: number): string {
  return String(Math.round(normalizeDegrees(value)));
}
