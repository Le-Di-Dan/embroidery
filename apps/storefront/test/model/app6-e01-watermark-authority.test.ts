/**
 * `APP6-E01` §9 — the runtime watermark authority is one authority.
 *
 * The Product Owner ruled at `APP6-E01` entry:
 *
 * ```text
 * APP6_WATERMARK_RUNTIME_AUTHORITY = DELIVERED_APP3_S09
 * ```
 *
 * `APP6-S02` reproduced `APP3-S09`'s delivered treatment rather than `APP6-D01`'s
 * drawn measurements, and this file is the cheap cross-layer proof that the
 * reproduction is faithful — that the mark a customer sees on the secure review
 * surface is the mark the Studio drew on the same artwork.
 *
 * It compares the two modules' **exported behaviour**, not their source text: a
 * regex over the files would pass on a comment and fail on a rename, while these
 * assertions fail exactly when the two runtimes would draw differently.
 *
 * The numeric discrepancy between `APP6-D01` §5 and the delivered runtime is
 * `FU-APP6-S02-WATERMARK-DRAWN-VS-DELIVERED-01`, owned by `APP6-X01`. Nothing
 * here is gated against the drawing, and no Figma artifact is touched.
 */
import {
  REVIEW_WATERMARK_ANGLE_DEG,
  REVIEW_WATERMARK_COLUMNS,
  REVIEW_WATERMARK_ROWS,
  REVIEW_WATERMARK_TOKEN_UNAVAILABLE,
  mintReviewWatermarkToken,
  reviewWatermarkTiles,
} from '../../src/features/secure-design-review/model/review-watermark';
import {
  WATERMARK_ANGLE_DEG,
  WATERMARK_COLUMNS,
  WATERMARK_ROWS,
  WATERMARK_TOKEN_UNAVAILABLE,
  mintWatermarkToken,
  watermarkTiles,
} from '../../src/features/design-studio/model/studio-watermark';

/** The delivered `APP3-S09` treatment, restated so a drift is a failure here. */
const DELIVERED_APP3_S09 = { angleDeg: -30, rows: 7, columns: 5 } as const;

describe('APP6-E01 §9 — Studio and secure review resolve to one watermark authority', () => {
  it('both runtimes carry the delivered APP3-S09 geometry', () => {
    expect(WATERMARK_ANGLE_DEG).toBe(DELIVERED_APP3_S09.angleDeg);
    expect(WATERMARK_ROWS).toBe(DELIVERED_APP3_S09.rows);
    expect(WATERMARK_COLUMNS).toBe(DELIVERED_APP3_S09.columns);

    expect(REVIEW_WATERMARK_ANGLE_DEG).toBe(WATERMARK_ANGLE_DEG);
    expect(REVIEW_WATERMARK_ROWS).toBe(WATERMARK_ROWS);
    expect(REVIEW_WATERMARK_COLUMNS).toBe(WATERMARK_COLUMNS);
  });

  it('both draw the same tile grid, mark for mark', () => {
    const studio = watermarkTiles();
    const review = reviewWatermarkTiles();

    expect(review).toHaveLength(studio.length);
    expect(studio).toHaveLength(DELIVERED_APP3_S09.rows * DELIVERED_APP3_S09.columns);
    expect(review.map((tile) => ({ ...tile }))).toEqual(studio.map((tile) => ({ ...tile })));
  });

  it('both mint a token from the same alphabet and length, and fail the same way', () => {
    expect(REVIEW_WATERMARK_TOKEN_UNAVAILABLE).toBe(WATERMARK_TOKEN_UNAVAILABLE);

    const studioToken = mintWatermarkToken();
    const reviewToken = mintReviewWatermarkToken();
    expect(reviewToken).toHaveLength(studioToken.length);
    // The unambiguous alphabet, identical on both surfaces.
    expect(studioToken).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);
    expect(reviewToken).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);
  });

  it('neither runtime can put a watermark into a DesignDocument', () => {
    // A tile is position and a key, and nothing else: there is no element id, no
    // transform and no document field, so a mark cannot be serialized into the
    // artwork whose hash an approval binds.
    for (const tile of reviewWatermarkTiles()) {
      expect(Object.keys(tile).sort()).toEqual(['key', 'leftPercent', 'topPercent']);
    }
  });
});
