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
import type { DesignDocument, DesignElement, ImageElement } from '@embroidery/design-document';
import type { DesignSessionScopeResponse } from '@embroidery/api-client';

import type { StudioImageMedia } from './studio-image-authority';

/**
 * The initial box: the derivative's own aspect ratio, centred in the Embroidery
 * Area and fitted inside it, never enlarged.
 *
 * `APP3-S06`'s Figma states show a placed image inside the safe area and do not
 * specify a first geometry, so this is the operator-approved deterministic
 * fallback (§15) and it is expressed in exactly the terms the document uses:
 * canvas pixels, from the Session's own scope rectangle.
 *
 * Three properties, each deliberate:
 *
 * - **The ratio is the derivative's.** `intrinsicWidthPx / intrinsicHeightPx` is
 *   what the server measured, so the first thing a customer sees is their
 *   picture undistorted.
 * - **`scale` is capped at 1.** A 40×40 logo opens at 40×40 rather than being
 *   stretched across the area: upscaling invents detail that will be stitched.
 * - **Centred in the Area, not the canvas.** The Area is where embroidery is
 *   allowed; centring on the canvas would routinely produce a first placement
 *   that `APP3-P02` refuses.
 *
 * No millimetre appears here. Physical size is `APP3-P02`'s question and is
 * asked afterwards by `ruleOnImageCandidate`; converting mm to pixels here would
 * be a second implementation of the rule that decides it.
 */
export function initialImageTransform(
  media: StudioImageMedia,
  scope: DesignSessionScopeResponse,
): DesignElement['transform'] {
  const scale = Math.min(
    1,
    scope.boundWidthPx / media.widthPx,
    scope.boundHeightPx / media.heightPx,
  );
  const width = media.widthPx * scale;
  const height = media.heightPx * scale;

  return {
    x: scope.boundXPx + (scope.boundWidthPx - width) / 2,
    y: scope.boundYPx + (scope.boundHeightPx - height) / 2,
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
 * A candidate document with one new image appended.
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
): DesignDocument {
  const element: ImageElement = {
    id: elementId,
    type: 'image',
    visible: true,
    locked: false,
    opacity: 1,
    transform: initialImageTransform(media, scope),
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
