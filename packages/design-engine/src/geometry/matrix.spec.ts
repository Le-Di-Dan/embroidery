/**
 * Matrix primitives against the locked contract.
 *
 * The rotation-direction case is the one that matters most. Under y-down,
 * `a = cos, b = sin, c = -sin, d = cos` turns `(1, 0)` toward **+y**, which is
 * downward on screen and therefore clockwise. The same matrix under y-up would
 * turn it the other way, so this test is really asserting PO-01 and PO-03
 * together — and it is exactly the fact the three spike renderers disagreed on.
 */
import { transform } from '../testing/fixtures';
import {
  GeometryError,
  IDENTITY_MATRIX,
  composeMatrices,
  invertMatrix,
  isSingular,
  localMatrix,
  multiplyMatrices,
  rotationClockwiseMatrix,
  scaleMatrix,
  transformPoint,
  transformVector,
  translationMatrix,
} from './matrix';
import { quantize } from './quantized';

const round = (value: number) => quantize(value);
const roundPoint = (point: { x: number; y: number }) => ({ x: round(point.x), y: round(point.y) });

describe('identity', () => {
  it('leaves a point where it is', () => {
    expect(transformPoint(IDENTITY_MATRIX, { x: 3, y: -7 })).toEqual({ x: 3, y: -7 });
  });

  it('is the neutral element of multiplication on both sides', () => {
    const matrix = localMatrix(transform({ rotationDeg: 30, scaleX: 2 }));
    expect(multiplyMatrices(IDENTITY_MATRIX, matrix)).toEqual(matrix);
    expect(multiplyMatrices(matrix, IDENTITY_MATRIX)).toEqual(matrix);
  });
});

describe('translation', () => {
  it('moves a point and leaves a vector alone', () => {
    const matrix = translationMatrix(10, -4);
    expect(transformPoint(matrix, { x: 1, y: 1 })).toEqual({ x: 11, y: -3 });
    // A vector is a difference between points; translating it would be wrong.
    expect(transformVector(matrix, { x: 1, y: 1 })).toEqual({ x: 1, y: 1 });
  });

  it('rejects a non-finite translation', () => {
    expect(() => translationMatrix(Number.NaN, 0)).toThrow(GeometryError);
    expect(() => translationMatrix(0, Number.POSITIVE_INFINITY)).toThrow(GeometryError);
  });
});

describe('rotation is clockwise under y-down', () => {
  it('turns +x toward +y at 90 degrees', () => {
    const matrix = rotationClockwiseMatrix(90);
    expect(roundPoint(transformPoint(matrix, { x: 1, y: 0 }))).toEqual({ x: 0, y: 1 });
  });

  it('has the ruled coefficient signs', () => {
    const matrix = rotationClockwiseMatrix(30);
    expect(round(matrix.a)).toBe(round(Math.cos(Math.PI / 6)));
    expect(round(matrix.b)).toBe(round(Math.sin(Math.PI / 6)));
    expect(round(matrix.c)).toBe(round(-Math.sin(Math.PI / 6)));
    expect(round(matrix.d)).toBe(round(Math.cos(Math.PI / 6)));
  });

  it('normalizes negative zero', () => {
    const matrix = rotationClockwiseMatrix(0);
    expect(Object.is(matrix.c, -0)).toBe(false);
  });
});

describe('the local matrix', () => {
  it('rotates about the untransformed local-box centre', () => {
    // A 100×50 box at the origin rotated 180° keeps its centre at (50, 25).
    const matrix = localMatrix(transform({ rotationDeg: 180 }));
    expect(roundPoint(transformPoint(matrix, { x: 50, y: 25 }))).toEqual({ x: 50, y: 25 });
    expect(roundPoint(transformPoint(matrix, { x: 0, y: 0 }))).toEqual({ x: 100, y: 50 });
  });

  it('scales about the same centre', () => {
    const matrix = localMatrix(transform({ scaleX: 2, scaleY: 2 }));
    expect(roundPoint(transformPoint(matrix, { x: 50, y: 25 }))).toEqual({ x: 50, y: 25 });
    expect(roundPoint(transformPoint(matrix, { x: 0, y: 0 }))).toEqual({ x: -50, y: -25 });
  });

  it('applies scale before rotation', () => {
    // With scale first, the 2× x-stretch is rotated onto the y axis.
    const matrix = localMatrix(transform({ rotationDeg: 90, scaleX: 2, scaleY: 1 }));
    const corner = roundPoint(transformPoint(matrix, { x: 0, y: 0 }));
    expect(corner).toEqual({ x: 75, y: -75 });
  });

  it('reflects about the centre for a negative scale', () => {
    const matrix = localMatrix(transform({ scaleX: -1 }));
    expect(roundPoint(transformPoint(matrix, { x: 0, y: 0 }))).toEqual({ x: 100, y: 0 });
    expect(roundPoint(transformPoint(matrix, { x: 100, y: 0 }))).toEqual({ x: 0, y: 0 });
  });

  it('places the box at its persisted x and y with no rotation or scale', () => {
    const matrix = localMatrix(transform({ x: 20, y: 30 }));
    expect(roundPoint(transformPoint(matrix, { x: 0, y: 0 }))).toEqual({ x: 20, y: 30 });
    expect(roundPoint(transformPoint(matrix, { x: 100, y: 50 }))).toEqual({ x: 120, y: 80 });
  });
});

describe('composition', () => {
  it('applies the rightmost matrix first', () => {
    const move = translationMatrix(10, 0);
    const grow = scaleMatrix(2, 2);
    // move × grow: scale, then move. grow × move: move, then scale.
    expect(roundPoint(transformPoint(multiplyMatrices(move, grow), { x: 1, y: 0 }))).toEqual({
      x: 12,
      y: 0,
    });
    expect(roundPoint(transformPoint(multiplyMatrices(grow, move), { x: 1, y: 0 }))).toEqual({
      x: 22,
      y: 0,
    });
  });

  it('is associative within quantized comparison', () => {
    const a = translationMatrix(3, 4);
    const b = rotationClockwiseMatrix(37);
    const c = scaleMatrix(1.5, 0.5);
    const left = multiplyMatrices(multiplyMatrices(a, b), c);
    const right = multiplyMatrices(a, multiplyMatrices(b, c));
    const point = { x: 11, y: -6 };
    expect(roundPoint(transformPoint(left, point))).toEqual(
      roundPoint(transformPoint(right, point)),
    );
  });

  it('composes left to right', () => {
    const composed = composeMatrices(translationMatrix(5, 0), scaleMatrix(2, 2));
    expect(composed).toEqual(multiplyMatrices(translationMatrix(5, 0), scaleMatrix(2, 2)));
  });
});

describe('inversion', () => {
  it('round-trips a point after quantization', () => {
    const matrix = localMatrix(
      transform({ x: 13, y: -7, rotationDeg: 41, scaleX: 1.7, scaleY: 0.6 }),
    );
    const inverse = invertMatrix(matrix);
    expect(inverse).toBeDefined();
    if (inverse === undefined) return;
    const point = { x: 23, y: 42 };
    expect(roundPoint(transformPoint(inverse, transformPoint(matrix, point)))).toEqual(point);
  });

  it('returns undefined for a singular matrix rather than throwing', () => {
    const collapsed = scaleMatrix(0, 1);
    expect(isSingular(collapsed)).toBe(true);
    expect(invertMatrix(collapsed)).toBeUndefined();
  });

  it('treats a near-singular matrix as singular', () => {
    expect(invertMatrix(scaleMatrix(1e-14, 1e-14))).toBeUndefined();
  });
});

describe('purity and determinism', () => {
  it('does not mutate its inputs', () => {
    const left = translationMatrix(1, 2);
    const right = scaleMatrix(3, 4);
    const before = { left: { ...left }, right: { ...right } };
    multiplyMatrices(left, right);
    transformPoint(left, { x: 1, y: 1 });
    invertMatrix(right);
    expect(left).toEqual(before.left);
    expect(right).toEqual(before.right);
  });

  it('produces identical output on repeated calls', () => {
    const build = () => localMatrix(transform({ rotationDeg: 17.3, scaleX: 1.1 }));
    expect(build()).toEqual(build());
  });

  it('rejects a non-finite scale or rotation', () => {
    expect(() => scaleMatrix(Number.NaN, 1)).toThrow(GeometryError);
    expect(() => rotationClockwiseMatrix(Number.POSITIVE_INFINITY)).toThrow(GeometryError);
  });
});
