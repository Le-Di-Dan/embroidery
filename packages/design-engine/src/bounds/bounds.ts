/**
 * Transformed bounds — `CONSERVATIVE_TRANSFORMED_AABB` (`IMP-D045` PO-08).
 *
 * The order is the ruling, not an implementation detail:
 *
 * ```text
 * 1. derive the exact local drawable envelope (stroke included)
 * 2. transform ITS four corners with the full effective matrix
 * 3. take the document-space min/max
 * 4. quantize comparable output
 * ```
 *
 * Expanding after the transform is explicitly forbidden, and the reason is
 * arithmetic: a 3× scaled element would still be charged one unscaled
 * half-stroke, so the "conservative" bound would be short by exactly the amount
 * that matters most. Expanding first lets the matrix scale and rotate the stroke
 * along with everything else.
 *
 * This is deliberately **not** path-accurate. A rotated ellipse's true outline
 * sits inside the transformed AABB of its box, so some designs are rejected
 * whose visible pixels would have fitted. PO-08 accepts that: a rejected design
 * is recoverable, a clipped garment is not.
 */
import type { DesignDocument, DesignElement } from '@embroidery/design-document';

import { transformPoint } from '../geometry/matrix';
import { quantizeBounds, quantizedAtLeast, quantizedAtMost } from '../geometry/quantized';
import { boundsCorners, boundsOfPoints, type Bounds2D, type Point2D } from '../geometry/types';
import { geometryFinding, type GeometryFinding } from '../findings/finding';
import {
  buildElementGraph,
  drawableDescendants,
  drawableElements,
  isGeometryFinding,
  resolveEffectiveTransform,
  type ElementGraph,
} from '../transforms/graph';
import { localEnvelope } from './envelope';

export interface BoundsOptions {
  /**
   * Report only elements whose `visible` is true.
   *
   * Off by default and never consulted by validation: PO-08 says hidden and
   * locked elements still have geometry, so this exists for a caller drawing a
   * selection outline, not for deciding whether a document may be saved.
   */
  readonly visibleOnly?: boolean;
}

function includeElement(element: DesignElement, options: BoundsOptions): boolean {
  return options.visibleOnly !== true || element.visible;
}

/** The transformed AABB of one element, or a typed finding. */
export function getElementBounds(
  document: DesignDocument,
  elementId: string,
  graph: ElementGraph = buildElementGraph(document),
): Bounds2D | GeometryFinding {
  const resolved = resolveEffectiveTransform(graph, elementId);
  if (isGeometryFinding(resolved)) return resolved;

  const envelope = localEnvelope(resolved.element);
  if (envelope === undefined) {
    return geometryFinding(
      'INVALID_GEOMETRY',
      '$.elements',
      'This element has no usable local geometry.',
      { elementId },
    );
  }

  const corners: readonly Point2D[] = boundsCorners(envelope).map((corner) =>
    transformPoint(resolved.matrix, corner),
  );
  const bounds = boundsOfPoints(corners);
  if (bounds === undefined || !Number.isFinite(bounds.minX) || !Number.isFinite(bounds.maxY)) {
    return geometryFinding(
      'INVALID_GEOMETRY',
      '$.elements',
      'This element transforms to a non-finite area.',
      { elementId },
    );
  }
  return quantizeBounds(bounds);
}

function unionOf(
  document: DesignDocument,
  elements: readonly DesignElement[],
  graph: ElementGraph,
) {
  const findings: GeometryFinding[] = [];
  let union: Bounds2D | undefined;
  for (const element of elements) {
    const bounds = getElementBounds(document, element.id, graph);
    if (isGeometryFinding(bounds as never)) {
      findings.push(bounds as GeometryFinding);
      continue;
    }
    union = union === undefined ? (bounds as Bounds2D) : unionBounds(union, bounds as Bounds2D);
  }
  return { union, findings };
}

/**
 * A group's bounds: the union of its descendants' transformed AABBs.
 *
 * Never the group's own persisted box — that box is its local frame and pivot
 * (PO-07), and using it as bounds would let a group claim area no child paints.
 */
export function getGroupBounds(
  document: DesignDocument,
  groupId: string,
  options: BoundsOptions = {},
  graph: ElementGraph = buildElementGraph(document),
): Bounds2D | GeometryFinding {
  const group = graph.byId.get(groupId);
  if (group === undefined || group.type !== 'group') {
    return geometryFinding('UNKNOWN_ELEMENT', '$.elements', 'This group is not in the document.', {
      elementId: groupId,
    });
  }
  const descendants = drawableDescendants(graph, groupId).filter((element) =>
    includeElement(element, options),
  );
  const { union, findings } = unionOf(document, descendants, graph);
  if (union === undefined) {
    return (
      findings[0] ??
      geometryFinding('INVALID_GEOMETRY', '$.elements', 'This group has no drawable descendant.', {
        elementId: groupId,
      })
    );
  }
  return union;
}

/** The union of every drawable element's transformed AABB. */
export function getDocumentBounds(
  document: DesignDocument,
  options: BoundsOptions = {},
  graph: ElementGraph = buildElementGraph(document),
): Bounds2D | undefined {
  const elements = drawableElements(graph).filter((element) => includeElement(element, options));
  return unionOf(document, elements, graph).union;
}

export function unionBounds(left: Bounds2D, right: Bounds2D): Bounds2D {
  return {
    minX: Math.min(left.minX, right.minX),
    minY: Math.min(left.minY, right.minY),
    maxX: Math.max(left.maxX, right.maxX),
    maxY: Math.max(left.maxY, right.maxY),
  };
}

/**
 * The overlap of two boxes, or `undefined` when they do not overlap.
 *
 * Reports overlap; it never moves anything. Collision *resolution* is not this
 * package's business, and PO-09 forbids the engine mutating a document at all.
 */
export function intersectBounds(left: Bounds2D, right: Bounds2D): Bounds2D | undefined {
  const minX = Math.max(left.minX, right.minX);
  const minY = Math.max(left.minY, right.minY);
  const maxX = Math.min(left.maxX, right.maxX);
  const maxY = Math.min(left.maxY, right.maxY);
  if (minX > maxX || minY > maxY) return undefined;
  return { minX, minY, maxX, maxY };
}

/** Boundary-inclusive, on the quantized grid. */
export function containsPoint(bounds: Bounds2D, point: Point2D): boolean {
  return (
    quantizedAtLeast(point.x, bounds.minX) &&
    quantizedAtMost(point.x, bounds.maxX) &&
    quantizedAtLeast(point.y, bounds.minY) &&
    quantizedAtMost(point.y, bounds.maxY)
  );
}

/** True when `inner` lies wholly inside `outer`, touching allowed (PO-09). */
export function containsBounds(outer: Bounds2D, inner: Bounds2D): boolean {
  return (
    quantizedAtLeast(inner.minX, outer.minX) &&
    quantizedAtLeast(inner.minY, outer.minY) &&
    quantizedAtMost(inner.maxX, outer.maxX) &&
    quantizedAtMost(inner.maxY, outer.maxY)
  );
}
