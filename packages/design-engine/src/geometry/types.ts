/**
 * Plain immutable geometry values (`IMP-D045` PO-01, PO-05).
 *
 * Everything here is data a JSON document could hold: no class instances, no
 * `DOMMatrix`, no renderer node. That is not stylistic — `ADR-APP0-001` requires
 * the document model to stay framework-independent, and a geometry type that
 * carried a renderer object would let one leak back into the layer that is
 * supposed to be neutral.
 *
 * The coordinate system is locked: origin **top-left**, positive **x** right,
 * positive **y** **down**, angles in degrees. Every value below is expressed in
 * it.
 */

export interface Point2D {
  readonly x: number;
  readonly y: number;
}

/** A direction and magnitude. Distinguished from `Point2D` because a matrix
 * translates a point but not a vector. */
export interface Vector2D {
  readonly x: number;
  readonly y: number;
}

export interface Size2D {
  readonly width: number;
  readonly height: number;
}

/** An axis-aligned rectangle given by its top-left corner and size. */
export interface Rect2D {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * An axis-aligned box given by its extremes.
 *
 * Bounds are min/max rather than origin+size because that is the form every
 * union, intersection and containment test actually needs; converting once at
 * the edge beats converting at every comparison.
 */
export interface Bounds2D {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

/**
 * A 2D affine matrix in column-vector form (PO-05):
 *
 * ```text
 * x' = a*x + c*y + e
 * y' = b*x + d*y + f
 * ```
 *
 * Row-vector semantics are forbidden. A graphics library's own convention must
 * be converted into this one, never relied upon.
 */
export interface Matrix2D {
  readonly a: number;
  readonly b: number;
  readonly c: number;
  readonly d: number;
  readonly e: number;
  readonly f: number;
}

export function rectToBounds(rect: Rect2D): Bounds2D {
  return {
    minX: rect.x,
    minY: rect.y,
    maxX: rect.x + rect.width,
    maxY: rect.y + rect.height,
  };
}

export function boundsSize(bounds: Bounds2D): Size2D {
  return { width: bounds.maxX - bounds.minX, height: bounds.maxY - bounds.minY };
}

/** The four corners of a box, in a fixed order so output is deterministic. */
export function boundsCorners(bounds: Bounds2D): readonly Point2D[] {
  return [
    { x: bounds.minX, y: bounds.minY },
    { x: bounds.maxX, y: bounds.minY },
    { x: bounds.maxX, y: bounds.maxY },
    { x: bounds.minX, y: bounds.maxY },
  ];
}

/** The axis-aligned box enclosing every given point. */
export function boundsOfPoints(points: readonly Point2D[]): Bounds2D | undefined {
  const first = points[0];
  if (first === undefined) return undefined;
  let minX = first.x;
  let minY = first.y;
  let maxX = first.x;
  let maxY = first.y;
  for (const point of points) {
    if (point.x < minX) minX = point.x;
    if (point.y < minY) minY = point.y;
    if (point.x > maxX) maxX = point.x;
    if (point.y > maxY) maxY = point.y;
  }
  return { minX, minY, maxX, maxY };
}

/** Grows a box outward on all four sides. Used for the stroke envelope. */
export function expandBounds(bounds: Bounds2D, amount: number): Bounds2D {
  return {
    minX: bounds.minX - amount,
    minY: bounds.minY - amount,
    maxX: bounds.maxX + amount,
    maxY: bounds.maxY + amount,
  };
}
