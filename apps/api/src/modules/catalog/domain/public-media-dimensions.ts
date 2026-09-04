/**
 * The intrinsic pixel size of the derivative a public media URL addresses
 * (`APP12-H05-C1`).
 *
 * ## Why this exists at all
 *
 * `APP12-H05` measured Cumulative Layout Shift over 0.10 on the Discover and
 * Gallery grids: the card images carry no intrinsic dimensions, so every image
 * box is zero-height until its bytes arrive and the grid grows underneath
 * content the visitor is already looking at. The browser can only reserve the
 * right box if it is told the size before the bytes land, and the only place
 * that truth exists is `asset_derivatives.width_px` / `height_px`, which
 * `APP2-W01` already writes and the database has stored all along.
 *
 * So this publishes an existing fact. It is not a new capability, not a new
 * rendition and not a layout decision — the shape stays the artwork's own.
 *
 * ## Truthful absence, not a fabricated ratio
 *
 * `ck_asset_derivatives__metadata_all_or_none` allows a derivative to carry
 * `width_px`, `height_px`, `media_type` and `byte_size` **all** or **none**, so
 * a historical row may legitimately have no dimensions. Two rules follow, and
 * both are deliberate:
 *
 * 1. Eligibility is unchanged. A derivative without dimensions is still
 *    deliverable and still appears in the catalogue. Requiring dimensions to be
 *    present would have silently withdrawn historical media from the public
 *    surfaces — a functional regression traded for a layout metric.
 * 2. The size is **absent**, never guessed. No default, no square assumption,
 *    no ratio inferred from a sibling. A consumer that receives no size renders
 *    exactly as it did before, and the shift returns for that one image rather
 *    than the wrong box being reserved for it.
 */

/** The intrinsic size of one derivative, in CSS pixels. Both or neither. */
export interface PublicMediaIntrinsicSize {
  readonly width: number;
  readonly height: number;
}

/**
 * Narrows a persisted dimension pair to a publishable size.
 *
 * Returns `undefined` unless **both** values are present and positive. The
 * all-or-none CHECK constraint makes a half-populated pair unreachable through
 * the write path, so the pair test is a boundary assertion rather than a
 * defence against a state the schema permits; the positivity test is the same
 * assertion for `ck_asset_derivatives__metadata_positive`. Neither is trusted
 * from the constraint alone, because this value is about to become a rendered
 * `width`/`height` attribute and a zero there would collapse the box the whole
 * correction exists to reserve.
 */
export function toIntrinsicSize(
  width: number | null | undefined,
  height: number | null | undefined,
): PublicMediaIntrinsicSize | undefined {
  if (
    width === null ||
    width === undefined ||
    height === null ||
    height === undefined ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return undefined;
  }
  return { width, height };
}
