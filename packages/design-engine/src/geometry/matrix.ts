/**
 * 2D affine matrices, exactly as `IMP-D045` PO-05 locks them.
 *
 * Column-vector semantics, `p' = M × p`:
 *
 * ```text
 * x' = a*x + c*y + e
 * y' = b*x + d*y + f
 * ```
 *
 * and because the coordinate system is **y-down**, a positive angle is
 * **clockwise**, which makes the rotation matrix `a = cos, b = sin, c = -sin,
 * d = cos`. Under y-up that same matrix would rotate the other way, so the sign
 * of `b` and `c` is not a convention this file chose — it follows from PO-01.
 *
 * Nothing here reads a library's multiplication order. `APP3-P02`'s first
 * attempt stopped precisely because three renderers disagreed about this, so the
 * contract is written out and tested rather than inherited.
 */
import type { Matrix2D, Point2D, Vector2D } from './types';

export class GeometryError extends Error {}

/**
 * Below this, an inverse would amplify floating-point noise into nonsense.
 *
 * A machine-level guard for matrix inversion **only** — PO-09 forbids an
 * epsilon anywhere near a placement or containment comparison, which are exact
 * after P01 quantization.
 */
export const SINGULAR_DETERMINANT_THRESHOLD = 1e-12;

const DEGREES_TO_RADIANS = Math.PI / 180;

/** `-0` normalizes to `0`: they compare unequal under `Object.is` but mean the same point. */
function normalize(value: number): number {
  return Object.is(value, -0) ? 0 : value;
}

function requireFinite(value: number, label: string): number {
  if (!Number.isFinite(value)) {
    throw new GeometryError(`${label} must be a finite number.`);
  }
  return normalize(value);
}

export const IDENTITY_MATRIX: Matrix2D = Object.freeze({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });

export function identityMatrix(): Matrix2D {
  return IDENTITY_MATRIX;
}

export function translationMatrix(tx: number, ty: number): Matrix2D {
  return {
    a: 1,
    b: 0,
    c: 0,
    d: 1,
    e: requireFinite(tx, 'Translation x'),
    f: requireFinite(ty, 'Translation y'),
  };
}

/**
 * Clockwise rotation about the origin, for a positive angle in degrees under
 * the y-down coordinate system (PO-01, PO-03).
 */
export function rotationClockwiseMatrix(degrees: number): Matrix2D {
  const radians = requireFinite(degrees, 'Rotation') * DEGREES_TO_RADIANS;
  const cos = normalize(Math.cos(radians));
  const sin = normalize(Math.sin(radians));
  return { a: cos, b: sin, c: normalize(-sin), d: cos, e: 0, f: 0 };
}

export function scaleMatrix(scaleX: number, scaleY: number): Matrix2D {
  return {
    a: requireFinite(scaleX, 'Scale x'),
    b: 0,
    c: 0,
    d: requireFinite(scaleY, 'Scale y'),
    e: 0,
    f: 0,
  };
}

/**
 * `left × right` — applied to a column vector, `right` acts first.
 *
 * So in `T × R × S × T⁻¹` the rightmost translation moves the box centre to the
 * origin before anything else happens, which is what makes the pivot the centre.
 */
export function multiplyMatrices(left: Matrix2D, right: Matrix2D): Matrix2D {
  return {
    a: normalize(left.a * right.a + left.c * right.b),
    b: normalize(left.b * right.a + left.d * right.b),
    c: normalize(left.a * right.c + left.c * right.d),
    d: normalize(left.b * right.c + left.d * right.d),
    e: normalize(left.a * right.e + left.c * right.f + left.e),
    f: normalize(left.b * right.e + left.d * right.f + left.f),
  };
}

/** Left-to-right composition: `compose(A, B, C)` is `A × B × C`. */
export function composeMatrices(...matrices: readonly Matrix2D[]): Matrix2D {
  return matrices.reduce<Matrix2D>(multiplyMatrices, IDENTITY_MATRIX);
}

export function matrixDeterminant(matrix: Matrix2D): number {
  return matrix.a * matrix.d - matrix.b * matrix.c;
}

export function isSingular(matrix: Matrix2D): boolean {
  const determinant = matrixDeterminant(matrix);
  return !Number.isFinite(determinant) || Math.abs(determinant) < SINGULAR_DETERMINANT_THRESHOLD;
}

/**
 * The inverse, or `undefined` when the matrix collapses space.
 *
 * Returning `undefined` rather than throwing keeps the caller in charge: a
 * singular transform is a document defect that deserves a typed
 * `SINGULAR_TRANSFORM` finding, not an exception crossing a validation boundary.
 */
export function invertMatrix(matrix: Matrix2D): Matrix2D | undefined {
  if (isSingular(matrix)) return undefined;
  const determinant = matrixDeterminant(matrix);
  const a = matrix.d / determinant;
  const b = -matrix.b / determinant;
  const c = -matrix.c / determinant;
  const d = matrix.a / determinant;
  return {
    a: normalize(a),
    b: normalize(b),
    c: normalize(c),
    d: normalize(d),
    e: normalize(-(a * matrix.e + c * matrix.f)),
    f: normalize(-(b * matrix.e + d * matrix.f)),
  };
}

/** Applies the full affine transform, translation included. */
export function transformPoint(matrix: Matrix2D, point: Point2D): Point2D {
  return {
    x: normalize(matrix.a * point.x + matrix.c * point.y + matrix.e),
    y: normalize(matrix.b * point.x + matrix.d * point.y + matrix.f),
  };
}

/**
 * Applies the linear part only.
 *
 * A vector is a difference between points, so translating it would be wrong —
 * the direction from A to B does not move when the whole scene does.
 */
export function transformVector(matrix: Matrix2D, vector: Vector2D): Vector2D {
  return {
    x: normalize(matrix.a * vector.x + matrix.c * vector.y),
    y: normalize(matrix.b * vector.x + matrix.d * vector.y),
  };
}

/**
 * The local-to-parent matrix of an element (PO-03, PO-04, PO-05):
 *
 * ```text
 * T(x + width/2, y + height/2) × R(rotationDeg) × S(scaleX, scaleY) × T(-width/2, -height/2)
 * ```
 *
 * Read right to left: move the local box so its centre sits at the origin,
 * scale, rotate, then place the centre in the parent frame. Scale before
 * rotation — swapping them shears a non-uniformly scaled rotated element.
 */
export function localMatrix(transform: {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly rotationDeg: number;
  readonly scaleX: number;
  readonly scaleY: number;
}): Matrix2D {
  const halfWidth = transform.width / 2;
  const halfHeight = transform.height / 2;
  return composeMatrices(
    translationMatrix(transform.x + halfWidth, transform.y + halfHeight),
    rotationClockwiseMatrix(transform.rotationDeg),
    scaleMatrix(transform.scaleX, transform.scaleY),
    translationMatrix(-halfWidth, -halfHeight),
  );
}
