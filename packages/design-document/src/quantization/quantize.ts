/**
 * Deterministic pre-canonicalization quantization.
 *
 * ## Authority
 *
 * `ADR-APP0-001` §4 locks the *rule* — "numbers are quantized before hashing so
 * accumulated float noise cannot change a hash" — and names
 * `spikes/app0-r01-design-studio/` as the ADR's formal **Evidence**. The
 * executed constant lives there, in `src/document/canonical.ts`:
 *
 * ```ts
 * const NUMERIC_SCALE = 10_000;
 * const rounded = Math.round(value * NUMERIC_SCALE) / NUMERIC_SCALE;
 * return Object.is(rounded, -0) ? 0 : rounded;
 * ```
 *
 * That is the precision that produced the cross-engine canonical hash recorded
 * in the accepted `APP0-R01` completion report — identical across three
 * engines, two platforms and five runs. `ADR-DB1-012` constrains numbers to be
 * JSON-interoperable and says nothing that contradicts it. So there is exactly
 * one precision in accepted authority, and this file reuses it rather than
 * choosing one.
 *
 * ## Why it exists at all
 *
 * A drag applies dozens of floating-point deltas. Two editors that move an
 * element to visually the same place accumulate different noise in the last
 * bits, and JCS faithfully serializes that noise — so two identical-looking
 * designs would hash differently, and an approval bound to one hash would not
 * match the other. Rounding to a fixed grid before canonicalization removes the
 * noise without removing anything a customer can see: at 1/10000 px the grid is
 * far finer than a stitch.
 */
import type { DesignDocument, DesignPlacementSnapshot } from '../schema/document';
import type { DesignElement, DesignElementTransform } from '../schema/elements';

/**
 * Reciprocal of the quantum, from APP0-R01 evidence. Four decimal places.
 *
 * Named after its authority so a future reader can trace it, and exported so a
 * gate can assert it rather than trusting prose.
 */
export const DESIGN_DOCUMENT_QUANTIZATION_SCALE = 10_000;

/** The smallest representable step: 1 / 10000. */
export const DESIGN_DOCUMENT_QUANTIZATION_STEP = 1 / DESIGN_DOCUMENT_QUANTIZATION_SCALE;

/** Decimal places the scale corresponds to, for messages and documentation. */
export const DESIGN_DOCUMENT_QUANTIZATION_DECIMALS = 4;

/** Where the constant came from. A gate reads this; humans read the header. */
export const DESIGN_DOCUMENT_QUANTIZATION_AUTHORITY =
  'ADR-APP0-001 §4 + APP0-R01 evidence (spikes/app0-r01-design-studio/src/document/canonical.ts)';

/**
 * The persisted floating-point fields this pass covers.
 *
 * Integers are deliberately absent. `schemaVersion`, `fontWeight` and the
 * intrinsic image dimensions are whole numbers validated as such — quantizing
 * them would be a no-op that implied they were approximate. Strings, ids and
 * array order are never touched.
 */
export const QUANTIZED_FIELDS = Object.freeze({
  placement: Object.freeze([
    'canvasWidthPx',
    'canvasHeightPx',
    'physicalWidthMm',
    'physicalHeightMm',
    'pxPerMm',
  ]),
  element: Object.freeze(['opacity', 'fontSizePx', 'strokeWidthPx']),
  transform: Object.freeze(['x', 'y', 'width', 'height', 'rotationDeg', 'scaleX', 'scaleY']),
  freehandPoint: Object.freeze(['x', 'y']),
});

export class DesignDocumentQuantizationError extends Error {}

/**
 * Rounds one value onto the grid.
 *
 * `-0` normalizes to `0` because JCS serializes them identically but they are
 * distinct JavaScript values; leaving `-0` in place would make round-trip
 * equality checks lie about a document that hashes the same.
 */
export function quantizeNumber(value: number): number {
  if (!Number.isFinite(value)) {
    throw new DesignDocumentQuantizationError(
      'Non-finite numbers are not JSON-interoperable and must be rejected by validation first.',
    );
  }
  const rounded =
    Math.round(value * DESIGN_DOCUMENT_QUANTIZATION_SCALE) / DESIGN_DOCUMENT_QUANTIZATION_SCALE;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function quantizeTransform(transform: DesignElementTransform): DesignElementTransform {
  return {
    x: quantizeNumber(transform.x),
    y: quantizeNumber(transform.y),
    width: quantizeNumber(transform.width),
    height: quantizeNumber(transform.height),
    rotationDeg: quantizeNumber(transform.rotationDeg),
    scaleX: quantizeNumber(transform.scaleX),
    scaleY: quantizeNumber(transform.scaleY),
  };
}

function quantizePlacement(placement: DesignPlacementSnapshot): DesignPlacementSnapshot {
  return {
    ...placement,
    canvasWidthPx: quantizeNumber(placement.canvasWidthPx),
    canvasHeightPx: quantizeNumber(placement.canvasHeightPx),
    physicalWidthMm: quantizeNumber(placement.physicalWidthMm),
    physicalHeightMm: quantizeNumber(placement.physicalHeightMm),
    pxPerMm: quantizeNumber(placement.pxPerMm),
  };
}

function quantizeElement(element: DesignElement): DesignElement {
  const base = {
    transform: quantizeTransform(element.transform),
    opacity: quantizeNumber(element.opacity),
  };
  switch (element.type) {
    case 'text':
      return { ...element, ...base, fontSizePx: quantizeNumber(element.fontSizePx) };
    case 'shape':
      return { ...element, ...base, strokeWidthPx: quantizeNumber(element.strokeWidthPx) };
    case 'freehand':
      return {
        ...element,
        ...base,
        strokeWidthPx: quantizeNumber(element.strokeWidthPx),
        points: element.points.map((point) => ({
          x: quantizeNumber(point.x),
          y: quantizeNumber(point.y),
        })),
      };
    default:
      return { ...element, ...base };
  }
}

/**
 * Returns a quantized copy. The input is never mutated, and running this twice
 * produces a value identical to running it once — rounding an already-rounded
 * value onto the same grid is a fixed point.
 */
export function quantizeDesignDocument(document: DesignDocument): DesignDocument {
  return {
    schemaVersion: document.schemaVersion,
    placement: quantizePlacement(document.placement),
    elements: document.elements.map(quantizeElement),
  };
}
