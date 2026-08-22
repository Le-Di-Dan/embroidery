'use client';

/**
 * The runtime watermark over the review preview (`APP6-D01` §5, reproducing
 * `APP3-S09`'s delivered treatment at `609:263`; policy note `609:371`).
 *
 * ## Where it sits, and why there
 *
 * A sibling of the SVG, inside a clipped preview frame — never a child of the
 * drawing. Putting it in the document's own coordinate system would make it
 * scale with the artwork's canvas, and would also make it part of the tree a
 * customer's browser renders *as the design*. It is neither. It is chrome over
 * a picture, and the picture underneath is byte-for-byte the document whose
 * hash the approval binds.
 *
 * ## Legible on light *and* dark, without looking at a single pixel
 *
 * `APP3-D01` approves two treatments — ink over light imagery, white over dark
 * — and the customer's own artwork decides which applies. Sampling it would
 * mean reading pixels of customer artwork, which this checkpoint has no
 * authority to do. So each mark is drawn **twice**, in both approved
 * treatments, offset by a hairline: the white pass reads against dark artwork
 * and the ink pass against light, and on mid-tone artwork the pair reads as an
 * embossed mark.
 *
 * ## What it cannot do
 *
 * There is no toggle, no opacity control, no "hide watermark" and no code path
 * that renders the preview without it: the preview component mounts this
 * unconditionally, and a test asserts that removing it is visible. It cannot be
 * selected, transformed, reordered or deleted, because it is not in the
 * document any of those would operate on — `APP3-P01` has no watermark field,
 * so it cannot be serialized and cannot enter the canonical hash.
 *
 * `pointer-events: none` and `aria-hidden` are presentation on top of that, not
 * the guarantee: they keep it from swallowing a click and from reading
 * thirty-five identical marks to a screen reader. The single policy sentence is
 * the accessible text, and it is outside the pattern.
 */
import type { CSSProperties } from 'react';

import { DESIGN_REVIEW_COPY as COPY } from '../model/design-review-copy';
import {
  REVIEW_WATERMARK_ANGLE_DEG,
  reviewWatermarkTiles,
  type ReviewWatermarkTile,
} from '../model/review-watermark';

export interface ReviewWatermarkProps {
  /** The opaque runtime token. Never an identity, a secret or a document value. */
  readonly token: string;
}

export function ReviewWatermark({ token }: ReviewWatermarkProps) {
  const label = `${COPY.preview.watermarkWordmark} · ${COPY.preview.watermarkTag} · ${token}`;

  return (
    <div
      className="secure-design-review__watermark"
      data-testid="design-review-watermark"
      aria-hidden="true"
      style={
        {
          '--secure-design-review-watermark-angle': `${String(REVIEW_WATERMARK_ANGLE_DEG)}deg`,
        } as CSSProperties
      }
    >
      {reviewWatermarkTiles().map((tile) => (
        <WatermarkMark key={tile.key} label={label} tile={tile} />
      ))}
    </div>
  );
}

/**
 * The policy note (`609:371`), as real text.
 *
 * Rendered beside the preview rather than inside the pattern, because the
 * pattern is `aria-hidden` and this is the one place the fact is *stated*. It
 * says the preview is marked and that there is nothing to download, and it says
 * nothing about screenshots or screen recording —
 * `docs/09-SECURITY-AND-ABUSE-PREVENTION.md` §6 ends with "do not claim
 * absolute screenshot prevention", and a promise a build cannot keep is worse
 * than no promise.
 */
export function ReviewWatermarkNotice() {
  return (
    <p
      className="secure-design-review__watermark-policy"
      data-testid="design-review-watermark-policy"
    >
      {COPY.preview.watermarkPolicy}
    </p>
  );
}

/** One repeated mark, in both approved treatments. */
function WatermarkMark({
  label,
  tile,
}: {
  readonly label: string;
  readonly tile: ReviewWatermarkTile;
}) {
  const position = { left: `${String(tile.leftPercent)}%`, top: `${String(tile.topPercent)}%` };
  return (
    <span className="secure-design-review__watermark-mark" style={position}>
      <span className="secure-design-review__watermark-text secure-design-review__watermark-text--light">
        {label}
      </span>
      <span className="secure-design-review__watermark-text secure-design-review__watermark-text--dark">
        {label}
      </span>
    </span>
  );
}
