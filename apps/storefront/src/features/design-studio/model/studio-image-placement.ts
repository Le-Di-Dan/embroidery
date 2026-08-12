/**
 * Where a newly placed image starts, and what replacing one changes
 * (`APP3-S06` §15, §16).
 *
 * Both are **candidate constructions**, not decisions: everything here produces
 * a document for `ruleOnImageCandidate` to accept or refuse. Nothing below
 * clamps, retries at a smaller size, snaps, or adjusts a refused candidate until
 * it fits — `IMP-D045` PO-09 forbids each of those by name, and an image
 * silently shrunk to satisfy a rule is an image the customer never chose.
 */
import {
  DESIGN_DOCUMENT_QUANTIZATION_SCALE,
  type DesignDocument,
  type DesignElement,
  type ImageElement,
} from '@embroidery/design-document';
import type { DesignSessionScopeResponse } from '@embroidery/api-client';
import { UnitConversionError, mmToPx } from '@embroidery/design-engine';

import type { StudioImageMedia } from './studio-image-authority';
import { areaAuthorityOf, type StudioAreaLimits } from './studio-transform-authority';

/**
 * The initial box: the derivative's own aspect ratio, centred in the Embroidery
 * Area and fitted inside **every** limit that applies to it, never enlarged.
 *
 * `APP3-S06`'s Figma states show a placed image inside the safe area and do not
 * specify a first geometry, so this is the operator-approved deterministic
 * fallback (§15), expressed in the terms the document uses: canvas pixels.
 *
 * ## Why the millimetre limits are read here (`APP3-S06-C1`)
 *
 * They were not, and that was the defect. An Embroidery Area is a rectangle on
 * the canvas *and* a pair of physical maxima, and the two are independent: a
 * Side may offer a generous safe rectangle while the Area it carries permits a
 * 60 mm logo. Fitting only the rectangle then produced a candidate `APP3-P02`
 * correctly refused, and the customer was told to resize with `APP3-S03` an
 * element that had never been inserted — advice about an element that does not
 * exist.
 *
 * The fix is a **construction**, not a repair. `IMP-D045` PO-09 forbids clamping
 * a candidate: a transform the customer performed is committed exactly as
 * computed or refused outright, and nothing here changes that. But an initial
 * placement has no customer decision in it yet — the system is choosing the
 * first box — so the largest box that satisfies the authority is derived up
 * front, once, and then still has to pass P01 and P02 like any other candidate.
 * The order is derive → construct → validate, never construct → detect → shrink.
 *
 * ## The bounds
 *
 * - **The Area rectangle**, in canvas pixels, straight from the Session scope.
 * - **The Area's physical maxima**, converted by `APP3-P02`'s `mmToPx` using the
 *   Product Side's own `px_per_mm`. There is no second conversion here: no CSS
 *   pixel, no DPR, no 96 DPI, no local `pxPerMm` constant. The maxima themselves
 *   are resolved by `areaAuthorityOf`, so the "a null maximum means the Side is
 *   the only limit" rule has exactly one implementation and this agrees with
 *   what P02 will be asked afterwards by definition.
 * - **The intrinsic size**, as the cap on `scale`. A 40×40 logo opens at 40×40;
 *   upscaling invents detail that will be stitched.
 *
 * Centred in the Area, not the canvas — the Area is where embroidery is allowed.
 *
 * Returns `null` when no positive box exists under the authority at all (a
 * degenerate rectangle, a non-positive maximum, an unusable `px_per_mm`). That
 * is a refusal, and the only one: an Area merely *tighter* than its rectangle is
 * an Area a smaller image fits, so it places.
 */
export function initialImageTransform(
  media: StudioImageMedia,
  scope: DesignSessionScopeResponse,
  limits: StudioAreaLimits | null,
): DesignElement['transform'] | null {
  if (!positive(media.widthPx) || !positive(media.heightPx)) return null;

  const area = areaAuthorityOf(scope, limits);
  const physicalWidthPx = physicalMaximumPx(area.maxWidthMm, scope.pxPerMm);
  const physicalHeightPx = physicalMaximumPx(area.maxHeightMm, scope.pxPerMm);
  if (physicalWidthPx === null || physicalHeightPx === null) return null;

  const maxWidthPx = Math.min(scope.boundWidthPx, physicalWidthPx);
  const maxHeightPx = Math.min(scope.boundHeightPx, physicalHeightPx);
  if (!positive(maxWidthPx) || !positive(maxHeightPx)) return null;

  const scale = Math.min(1, maxWidthPx / media.widthPx, maxHeightPx / media.heightPx);
  const width = downToGrid(media.widthPx * scale);
  const height = downToGrid(media.heightPx * scale);
  // A limit smaller than one ten-thousandth of a pixel leaves nothing to place.
  if (!positive(width) || !positive(height)) return null;

  return {
    x: scope.boundXPx + downToGrid((scope.boundWidthPx - width) / 2),
    y: scope.boundYPx + downToGrid((scope.boundHeightPx - height) / 2),
    width,
    height,
    rotationDeg: 0,
    // The box carries the size; the scale factors stay neutral. `APP3-P02` folds
    // both into one effective matrix, so expressing the same size twice would
    // make the element twice as large as it reads.
    scaleX: 1,
    scaleY: 1,
  };
}

/**
 * One axis' physical maximum, in canvas pixels, or `null` if it is unusable.
 *
 * `mmToPx` is `APP3-P02`'s and throws on an authority it cannot convert — a
 * `px_per_mm` of zero, a negative millimetre. That is not an exception this
 * screen can act on, so it becomes "no valid placement", which is the honest
 * answer: an Area whose scale is unusable has no legal box in it.
 */
function physicalMaximumPx(maxMm: number, pxPerMm: number): number | null {
  try {
    return mmToPx(maxMm, pxPerMm);
  } catch (error) {
    if (error instanceof UnitConversionError) return null;
    throw error;
  }
}

function positive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

/**
 * Snaps a length **down** onto `APP3-P01`'s grid.
 *
 * The grid is P01's, imported rather than restated — `DESIGN_DOCUMENT_QUANTIZATION_SCALE`
 * is the same constant `quantizeNumber` uses, so the result is a fixed point of
 * the quantization the document will get on the way in and nothing shifts
 * underneath the value that was just proved legal.
 *
 * Down, not nearest, and that direction is the whole point. `quantizeNumber`
 * rounds, so a width derived exactly at a maximum could round *up* off it and
 * land one quantized unit outside the limit it was built to respect — the check
 * afterwards would then refuse a box this function claimed was valid. Rounding
 * down cannot manufacture a value outside authority. It costs at most one
 * ten-thousandth of a pixel of size, and it is applied per axis, so the aspect
 * ratio holds to that same precision — which is the only precision the document
 * has.
 */
function downToGrid(value: number): number {
  return (
    Math.floor(value * DESIGN_DOCUMENT_QUANTIZATION_SCALE) / DESIGN_DOCUMENT_QUANTIZATION_SCALE
  );
}

/**
 * A candidate document with one new image appended, or `null` when the authority
 * admits no valid initial box at all.
 *
 * Appended, never inserted: `APP3-P01` defines the element array as z-order,
 * bottom first, so the end of the array *is* the top of the stack. Reordering is
 * `APP3-S04`'s and nothing here touches the existing order.
 */
export function withNewImage(
  document: DesignDocument,
  elementId: string,
  media: StudioImageMedia,
  scope: DesignSessionScopeResponse,
  limits: StudioAreaLimits | null,
): DesignDocument | null {
  const transform = initialImageTransform(media, scope, limits);
  if (transform === null) return null;

  const element: ImageElement = {
    id: elementId,
    type: 'image',
    visible: true,
    locked: false,
    opacity: 1,
    transform,
    assetId: media.assetId,
    derivativeId: media.derivativeId,
    // The document's intrinsic dimensions **are** the canonical derivative's.
    // `APP3-P01-C1` refuses any disagreement, and the only source for these is
    // the server's own measurement.
    intrinsicWidthPx: media.widthPx,
    intrinsicHeightPx: media.heightPx,
  };
  return { ...document, elements: [...document.elements, element] };
}

/**
 * A candidate document with one image's **media identity** replaced.
 *
 * `APP3-D01` assigns S06 `replace`, and its states show the picture changing in
 * place. So the element keeps its id and its position in the array — its z-order
 * — and its transform, and only the four media fields change.
 *
 * The transform is deliberately **not** recomputed to the new picture's ratio.
 * A customer who has positioned and sized an image has made a decision about
 * where it goes on the garment; re-centring or re-fitting it because the
 * replacement is a different shape would discard that decision silently. If the
 * kept transform is no longer valid for the replacement, the whole replacement is
 * refused and the prior element stays exactly as it was (§16) — the same
 * commit-or-refuse rule every other Studio edit follows.
 *
 * The old Asset is untouched: no delete, no tombstone, no storage call. A
 * replacement uploads a new Asset and leaves the old one alone, because nothing
 * in this checkpoint owns an Asset's lifecycle.
 */
export function withReplacedImage(
  document: DesignDocument,
  elementId: string,
  media: StudioImageMedia,
): DesignDocument {
  return {
    ...document,
    elements: document.elements.map((element) =>
      element.id === elementId && element.type === 'image'
        ? {
            ...element,
            assetId: media.assetId,
            derivativeId: media.derivativeId,
            intrinsicWidthPx: media.widthPx,
            intrinsicHeightPx: media.heightPx,
          }
        : element,
    ),
  };
}

/** The selected element when it is an image, otherwise `undefined`. */
export function imageElementOf(
  document: DesignDocument | null,
  elementId: string | null,
): ImageElement | undefined {
  if (document === null || elementId === null) return undefined;
  const element = document.elements.find((candidate) => candidate.id === elementId);
  return element?.type === 'image' ? element : undefined;
}
