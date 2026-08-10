/**
 * The one place a matrix becomes SVG syntax (`APP3-S02` §11).
 *
 * This is the whole of the renderer's licence over geometry: `APP3-P02` decides
 * every number, and this function writes those six numbers in the order SVG's
 * `matrix()` expects. It does not multiply, invert, round, clamp or reorder
 * them. If it ever needed to, that would be a sign the engine was missing an
 * answer — and the fix would belong in `@embroidery/design-engine`, not here.
 *
 * `Matrix2D`'s field names are already SVG's `a b c d e f` for column-vector
 * composition, so the mapping is an identity rather than a translation.
 */
import type { Matrix2D } from '@embroidery/design-engine';

export function toSvgMatrix(matrix: Matrix2D): string {
  const { a, b, c, d, e, f } = matrix;
  return `matrix(${String(a)} ${String(b)} ${String(c)} ${String(d)} ${String(e)} ${String(f)})`;
}
