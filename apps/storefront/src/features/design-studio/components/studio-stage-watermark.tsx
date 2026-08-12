'use client';

/**
 * The runtime watermark (`609:263` light, `609:299` dark, `609:335` mobile,
 * `609:371` policy).
 *
 * ## Where it sits, and why there
 *
 * A sibling of `APP3-S07`'s transformed viewport layer, not a child of it. That
 * one placement is what makes the watermark *viewport-space*: the zoom and pan
 * transform is applied to the layer beside this one, so the marks neither scale
 * nor slide when the customer zooms to 400 % and pans to a corner. Coverage is
 * of what is actually on screen, which is what a watermark is for — a watermark
 * anchored to document coordinates leaves the visible preview bare the moment
 * the visible preview stops being the whole document.
 *
 * The viewport clips it (`overflow: hidden`), so the marks never escape the
 * stage frame, and DOM order puts it above the artwork and its chrome and below
 * `APP3-S07`'s pan hint.
 *
 * ## Legible on light *and* dark, without looking at a single pixel
 *
 * `APP3-D01` approves two treatments — ink at ~13 % over light imagery, white at
 * ~22 % over dark — and the customer's own uploaded photograph decides which
 * applies. Sampling it would mean reading pixels of customer artwork every frame,
 * which this checkpoint has no authority to do and which would be a new
 * per-frame cost on the one surface `ADR-APP0-001` measured.
 *
 * So each mark is drawn **twice**, in both approved treatments, offset by a
 * hairline: the white pass reads against dark imagery and the ink pass against
 * light, and on mid-tone imagery the pair reads as an embossed mark. The design
 * requirement — legible on both, never mistakable for design content — is met by
 * construction rather than by a decision this component is not entitled to make.
 *
 * ## What it cannot do
 *
 * It cannot be selected, transformed, reordered, locked, hidden or deleted,
 * because it is not in the document any of those operate on. `pointer-events:
 * none` and `aria-hidden` are presentation on top of that, not the guarantee:
 * they keep it from swallowing a click meant for the artwork and from reading
 * thirty-five identical marks to a screen reader. The single policy sentence is
 * the accessible text, and it is outside the pattern.
 */
import { STUDIO_WATERMARK_COPY } from '../model/studio-watermark-copy';
import { WATERMARK_ANGLE_DEG, watermarkTiles, type WatermarkTile } from '../model/studio-watermark';

export interface StudioStageWatermarkProps {
  /** The opaque runtime token. Never an identity, a secret or a document value. */
  readonly token: string;
}

export function StudioStageWatermark({ token }: StudioStageWatermarkProps) {
  const label = `${STUDIO_WATERMARK_COPY.wordmark} · ${STUDIO_WATERMARK_COPY.preview} · ${token}`;

  return (
    /*
      `aria-hidden` because thirty-five repetitions of one string is noise to a
      screen reader, not information — the fact it conveys is stated once, as
      real text, by the policy note the stage renders beside its status line.
    */
    <div
      className="studio-watermark"
      data-testid="studio-watermark"
      aria-hidden="true"
      style={{ '--studio-watermark-angle': `${String(WATERMARK_ANGLE_DEG)}deg` } as never}
    >
      {watermarkTiles().map((tile) => (
        <WatermarkMark key={tile.key} label={label} tile={tile} />
      ))}
    </div>
  );
}

/**
 * The policy note (`609:371`), as real text.
 *
 * Rendered beside the stage rather than inside the pattern, because the pattern
 * is `aria-hidden` and this is the one place the fact is *stated*. It says the
 * preview is marked and that there is nothing to download, and it says nothing
 * about screenshots or screen recording — `APP3-D01` §I.4 records that the
 * approved frame explicitly makes no such claim, and
 * `docs/09-SECURITY-AND-ABUSE-PREVENTION.md` §6 ends with "do not claim absolute
 * screenshot prevention". A promise a build cannot keep is worse than no promise.
 */
export function StudioWatermarkNotice() {
  return (
    <p className="studio-watermark__policy" data-testid="studio-watermark-policy">
      {STUDIO_WATERMARK_COPY.policy} {STUDIO_WATERMARK_COPY.policyNoDownload}
    </p>
  );
}

/**
 * One repeated mark, in both approved treatments.
 *
 * The white pass is beneath and offset by a hairline; the ink pass sits on top.
 * Neither is a colour literal — both bind the existing tokens, which is the
 * thing `APP3-D01-C1` had to repair in the design file itself when a legibility
 * fix left a raw ink value behind.
 */
function WatermarkMark({ label, tile }: { readonly label: string; readonly tile: WatermarkTile }) {
  const position = { left: `${String(tile.leftPercent)}%`, top: `${String(tile.topPercent)}%` };
  return (
    <span className="studio-watermark__mark" style={position}>
      <span className="studio-watermark__text studio-watermark__text--dark">{label}</span>
      <span className="studio-watermark__text studio-watermark__text--light">{label}</span>
    </span>
  );
}
