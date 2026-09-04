/**
 * The intrinsic size a public media reference publishes, and the one way to put
 * it on an `<img>` (`APP12-H05-C1`).
 *
 * ## Why an `<img>` needs this
 *
 * `APP12-H05` measured Cumulative Layout Shift over 0.10 on the Discover and
 * Gallery grids. Their cards render a plain `<img>` with no `width`, no
 * `height` and no CSS `aspect-ratio`, so each image box is zero-height until its
 * bytes arrive; the grid then grows and pushes content the visitor is already
 * looking at down the page. Given `width` and `height` attributes, the browser
 * computes the box from the ratio *before* the bytes land and the growth
 * disappears.
 *
 * The attributes do not fix a size. With `width: 100%; height: auto` in the
 * stylesheet — which both grids already have — they only supply the ratio, so
 * the rendered picture is exactly the size and shape it was before. Nothing is
 * cropped and no uniform grid is imposed, which is what UI02 and UI05 forbid.
 *
 * ## Absent is a real answer
 *
 * `asset_derivatives` may legitimately hold no dimensions for a historical row,
 * and the API publishes absence rather than a guess. This module preserves that
 * to the last step: with no size, no attributes are emitted and the image
 * renders exactly as it did before. There is deliberately **no fallback ratio**
 * — a wrong reserved box is worse than an unreserved one, because it shifts
 * twice instead of once.
 */

/** The pair, as the public contract publishes it: both or neither. */
export interface MediaIntrinsicSize {
  readonly width: number;
  readonly height: number;
}

/**
 * Narrows an API width/height pair to a usable size.
 *
 * Both must be present and positive. A half-present pair cannot come from the
 * contract — the API projects the two together — so this is a boundary
 * assertion rather than a defence against a shape the server produces, and it
 * is applied anyway because these values become layout attributes.
 */
export function toMediaIntrinsicSize(
  width: number | null | undefined,
  height: number | null | undefined,
): MediaIntrinsicSize | undefined {
  if (
    typeof width !== 'number' ||
    typeof height !== 'number' ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return undefined;
  }
  return { width, height };
}

/**
 * The `width`/`height` attributes for an `<img>`, or nothing at all.
 *
 * Spread into the element so that "no size" emits no attribute rather than
 * `width={undefined}` — which React drops anyway, but which would leave the
 * call site reading as though a value were being supplied.
 */
export function intrinsicSizeAttributes(
  size: MediaIntrinsicSize | undefined,
): { width: number; height: number } | Record<string, never> {
  return size === undefined ? {} : { width: size.width, height: size.height };
}
