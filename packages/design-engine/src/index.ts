/**
 * `@embroidery/design-engine` — deterministic geometry for the Design Studio.
 *
 * Pure, browser-safe and renderer-neutral. The one production dependency is the
 * public root of `@embroidery/design-document`, which stays the sole owner of
 * document shape, quantization, complexity and media/font validation; nothing
 * here duplicates or forks those.
 *
 * Every rule this package implements is locked by `IMP-D045` (`APP3-G05` and its
 * `C1` correction) rather than chosen here: top-left origin with y down,
 * clockwise degrees, rotation and scale about the untransformed local-box centre
 * with scale applied first, column-vector matrices composed parent-outermost,
 * stroke-aware conservative transformed AABBs, blocking boundary-inclusive
 * containment, and `product_sides.px_per_mm` as the sole conversion authority.
 * A renderer implements that contract; it does not define it.
 *
 * The package never mutates a document, never rebases a group's children and
 * never moves an element to make it fit.
 */

// Geometry values
export type { Bounds2D, Matrix2D, Point2D, Rect2D, Size2D, Vector2D } from './geometry/types';
export {
  boundsCorners,
  boundsOfPoints,
  boundsSize,
  expandBounds,
  rectToBounds,
} from './geometry/types';

// Matrices
export {
  GeometryError,
  IDENTITY_MATRIX,
  SINGULAR_DETERMINANT_THRESHOLD,
  composeMatrices,
  identityMatrix,
  invertMatrix,
  isSingular,
  localMatrix,
  matrixDeterminant,
  multiplyMatrices,
  rotationClockwiseMatrix,
  scaleMatrix,
  transformPoint,
  transformVector,
  translationMatrix,
} from './geometry/matrix';

// Quantization bridge — P01 authority, never a second precision
export {
  DESIGN_DOCUMENT_QUANTIZATION_SCALE,
  quantize,
  quantizeBounds,
  quantizedAtLeast,
  quantizedAtMost,
  quantizedEquals,
} from './geometry/quantized';

// Element graph and effective transforms
export {
  buildElementGraph,
  drawableDescendants,
  drawableElements,
  isGeometryFinding,
  parentChain,
  resolveEffectiveTransform,
  structuralFinding,
} from './transforms/graph';
export type { EffectiveTransform, ElementGraph } from './transforms/graph';

// Local drawable envelopes and the fixed v1 stroke semantics
export {
  FREEHAND_CAP,
  FREEHAND_JOIN,
  LINE_CAP,
  LINE_JOIN,
  RECTANGLE_LINE_JOIN,
  RECTANGLE_MITER_LIMIT,
  STROKED_KINDS,
  UNSTROKED_KINDS,
  isDrawable,
  localEnvelope,
} from './bounds/envelope';

// Transformed bounds
export {
  containsBounds,
  containsPoint,
  getDocumentBounds,
  getElementBounds,
  getGroupBounds,
  intersectBounds,
  unionBounds,
} from './bounds/bounds';
export type { BoundsOptions } from './bounds/bounds';

// Placement authority reconciliation
export { validatePlacementSnapshot } from './placement/authority';
export type {
  EmbroideryAreaAuthority,
  PlacementAuthority,
  PlacementValidationMode,
} from './placement/authority';

// px ↔ mm conversion
export {
  UnitConversionError,
  mmToPx,
  pxToMm,
  sizeMmToPx,
  sizePxToMm,
  validateProductSideScaleConsistency,
} from './placement/units';

// Containment and physical size
export {
  areaBounds,
  validateDocumentPhysicalSize,
  validateDocumentWithinEmbroideryArea,
  validateElementPhysicalSize,
  validateElementWithinEmbroideryArea,
} from './containment/area';

// Typed findings
export { geometryFinding, geometryResult } from './findings/finding';
export type {
  GeometryFinding,
  GeometryFindingCode,
  GeometryFindingMetadata,
  GeometryValidationResult,
} from './findings/finding';
