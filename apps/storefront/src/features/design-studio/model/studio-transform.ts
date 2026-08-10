/**
 * The three transform candidates (`APP3-S03`).
 *
 * Every number here comes out of `@embroidery/design-engine`. This module
 * composes no matrix of its own, walks no parent chain and expands no stroke:
 * it asks `APP3-P02` for the frames an element lives in, does one division or
 * one addition in those frames, and hands back persisted `transform` fields.
 *
 * ## The frame that makes resize simple
 *
 * `IMP-D045` PO-05 fixes the local matrix as
 * `T(x + w/2, y + h/2) · R · S · T(-w/2, -h/2)`, so for a local point `p`
 *
 * ```text
 * M_effective · p  =  A · S · (p − centre)      where  A = M_parent · T(x + w/2, y + h/2) · R
 * ```
 *
 * `A` is everything *outside* the scale. Inverting it turns a document-space
 * pointer position straight into `S · (p − centre)`, and a scale factor is then
 * a single division by the handle's own centre offset. No trigonometry, no
 * hand-written matrix, and no second interpretation of the pivot.
 *
 * ## Gestures are frozen at their start
 *
 * Each candidate takes the transform the gesture *began* with and the total
 * pointer delta since. Nothing accumulates onto the previous frame, so a drag
 * that returns to where it started returns the element to exactly the values it
 * started with rather than to a drifted neighbour of them.
 */
import type { DesignElement, DesignElementTransform } from '@embroidery/design-document';
import {
  type ElementGraph,
  IDENTITY_MATRIX,
  type Matrix2D,
  type Point2D,
  composeMatrices,
  invertMatrix,
  isGeometryFinding,
  resolveEffectiveTransform,
  rotationClockwiseMatrix,
  transformPoint,
  transformVector,
  translationMatrix,
  type Vector2D,
} from '@embroidery/design-engine';

import {
  handleCentreOffset,
  type ResizeHandleId,
  rotateLocalPoint,
} from './studio-transform-handles';

/** The three frames a transform gesture needs, all resolved by `APP3-P02`. */
export interface ElementFrames {
  /** The element's parent frame. Document space for a root element (PO-02). */
  readonly parent: Matrix2D;
  /** Everything outside the scale: `parent · T(centre) · R`. */
  readonly preScale: Matrix2D;
  /** The full effective matrix `APP3-P02` resolved. */
  readonly effective: Matrix2D;
  readonly element: DesignElement;
}

/**
 * Resolves the frames, or `undefined` when the graph cannot answer.
 *
 * An unresolvable graph yields no frames at all rather than an identity
 * fallback: a transform applied in the wrong frame is a design stitched in the
 * wrong place, and `APP3-S02` already refuses to draw a scene it cannot resolve.
 */
export function elementFrames(graph: ElementGraph, elementId: string): ElementFrames | undefined {
  const resolved = resolveEffectiveTransform(graph, elementId);
  if (isGeometryFinding(resolved)) return undefined;

  const parentId = graph.parentOf.get(elementId);
  let parent = IDENTITY_MATRIX;
  if (parentId !== undefined) {
    const resolvedParent = resolveEffectiveTransform(graph, parentId);
    if (isGeometryFinding(resolvedParent)) return undefined;
    parent = resolvedParent.matrix;
  }

  const { transform } = resolved.element;
  const preScale = composeMatrices(
    parent,
    translationMatrix(transform.x + transform.width / 2, transform.y + transform.height / 2),
    rotationClockwiseMatrix(transform.rotationDeg),
  );

  return { parent, preScale, effective: resolved.matrix, element: resolved.element };
}

/**
 * A move, expressed in the element's **parent** frame.
 *
 * `x`/`y` are parent-frame coordinates (PO-02), so a document-space pointer
 * delta cannot simply be added to them: a child of a rotated or scaled group
 * would travel in the wrong direction, at the wrong speed, by an amount that
 * looks plausible until the group is rotated. The delta is a direction and a
 * distance, not a position, so it goes through the inverse parent matrix as a
 * **vector** — translation must not apply to it.
 */
export function moveCandidate(
  start: DesignElementTransform,
  frames: ElementFrames,
  documentDelta: Vector2D,
): DesignElementTransform | undefined {
  const inverse = safeInvert(frames.parent);
  if (inverse === undefined) return undefined;
  const local = transformVector(inverse, documentDelta);
  return { ...start, x: start.x + local.x, y: start.y + local.y };
}

/**
 * A resize, persisted as `scaleX`/`scaleY` about the local-box centre.
 *
 * **This is the resolved v1 persistence model** (`APP3-S03` §7). `IMP-D045`
 * PO-04 makes the centre the scale pivot and states that scale never alters
 * `x`, `y`, `width` or `height`; PO-02 makes `width`/`height` the *unscaled*
 * dimensions. Writing width/height instead would not resize two of the five v1
 * kinds at all — a `freehand` element's envelope comes from its stored `points`
 * and a `text` element's from `fontSizePx`, neither of which a width change
 * touches — so scale is not a preference here, it is the only representation
 * that resizes every kind.
 *
 * The consequence is that a handle anchors the **centre**, not the opposite
 * corner. Anchoring the opposite corner would mean writing `x`/`y` as well, and
 * no accepted rule authorises that pairing.
 */
export function resizeCandidate(
  start: DesignElementTransform,
  frames: ElementFrames,
  handle: ResizeHandleId,
  documentDelta: Vector2D,
): DesignElementTransform | undefined {
  const inverse = safeInvert(frames.preScale);
  if (inverse === undefined) return undefined;

  const offset = handleCentreOffset(handle, start.width, start.height);
  const grabbed = transformPoint(frames.preScale, {
    x: offset.x * start.scaleX,
    y: offset.y * start.scaleY,
  });
  const target = transformPoint(inverse, {
    x: grabbed.x + documentDelta.x,
    y: grabbed.y + documentDelta.y,
  });

  // A handle on a centre line drives no scale on that axis; dividing by its
  // zero offset would produce `Infinity` and a document P01 then refuses.
  const scaleX = offset.x === 0 ? start.scaleX : target.x / offset.x;
  const scaleY = offset.y === 0 ? start.scaleY : target.y / offset.y;
  return { ...start, scaleX, scaleY };
}

/**
 * The document-space point the rotate affordance grabs, and the pivot it turns
 * about.
 *
 * The pivot is the untransformed local-box centre (PO-03) — never the
 * transformed AABB centre, which drifts as the element rotates.
 */
export function rotationAnchors(
  start: DesignElementTransform,
  frames: ElementFrames,
): { readonly pivot: Point2D; readonly grab: Point2D } {
  const local = rotateLocalPoint(start.width);
  const centre = { x: start.width / 2, y: start.height / 2 };
  return {
    pivot: transformPoint(frames.preScale, { x: 0, y: 0 }),
    grab: transformPoint(frames.preScale, {
      x: (local.x - centre.x) * start.scaleX,
      y: (local.y - centre.y) * start.scaleY,
    }),
  };
}

/**
 * A rotation, in degrees clockwise about the local-box centre.
 *
 * The angle is measured from the vector the gesture started with, so a pointer
 * that has not moved produces a difference of exactly zero and the element
 * keeps the value it had — there is no jump on grab, and a round trip lands on
 * the original number rather than near it.
 *
 * `Math.atan2` is the one piece of trigonometry this feature owns, and it is
 * here rather than anywhere else on purpose: it converts a **pointer** into an
 * angle. `APP3-P02` publishes no vector-to-angle helper because a document
 * never needs one, and every matrix this module uses is still the engine's.
 */
export function rotateCandidate(
  start: DesignElementTransform,
  startVector: Vector2D,
  documentDelta: Vector2D,
): DesignElementTransform | undefined {
  const current = {
    x: startVector.x + documentDelta.x,
    y: startVector.y + documentDelta.y,
  };
  if (isDegenerate(startVector) || isDegenerate(current)) return undefined;

  const swept = degrees(
    Math.atan2(current.y, current.x) - Math.atan2(startVector.y, startVector.x),
  );
  return { ...start, rotationDeg: start.rotationDeg + shortestTurn(swept) };
}

/** `y` grows downward, so a positive turn is clockwise on screen (PO-01/PO-03). */
function degrees(radians: number): number {
  return (radians * 180) / Math.PI;
}

/**
 * The swept angle folded into `(-180, 180]`.
 *
 * `atan2` wraps at ±180°, so a drag that crosses the seam would otherwise jump
 * a full turn. Folding keeps one gesture continuous; it also means a single
 * gesture cannot sweep more than half a turn, which is the accepted trade for
 * never producing a 360° jump.
 */
function shortestTurn(degreesSwept: number): number {
  const folded = ((degreesSwept + 180) % 360) - 180;
  return folded <= -180 ? folded + 360 : folded;
}

function isDegenerate(vector: Vector2D): boolean {
  return (
    !Number.isFinite(vector.x) || !Number.isFinite(vector.y) || (vector.x === 0 && vector.y === 0)
  );
}

/** `APP3-P02` throws on a singular matrix; a gesture answers "no candidate". */
function safeInvert(matrix: Matrix2D): Matrix2D | undefined {
  try {
    return invertMatrix(matrix);
  } catch {
    return undefined;
  }
}
