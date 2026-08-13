/**
 * The placement geometry a **resumed** Session needs (`APP3-S10`).
 *
 * ## Why this has to exist
 *
 * `APP3-B07` returns `scope` on **create**, which resolved the placement from
 * the public slug and codes, and omits it on **resume**, which addresses the
 * Session by id alone. That is correct of the API — the placement did not change
 * so the server has nothing new to say about it — but it leaves a Session
 * resumed after a full page reload with no create response to have remembered
 * one from. Without geometry the stage cannot draw the garment, the safe area or
 * a millimetre read-out, so a resume that produced no scope would be a resume
 * that produced no editor.
 *
 * ## Why the manifest is the right authority and not an invention
 *
 * Every field of `DesignSessionScopeResponse` is already published, verbatim, by
 * the public placement manifest `APP3-S01` fetched to draw the picker: the Side
 * carries the canvas size, the physical size and the sole `pxPerMm` conversion
 * authority, and the Area carries the safe-area rectangle. Nothing here
 * computes, rounds, scales or defaults a value — each one is copied from the row
 * it came from, which is the same row the server itself resolved when the
 * Session was opened.
 *
 * The Side and Area are not guessed either. A resume happens only for a handle
 * stored under this exact `product → side → area` key
 * (`studio-resume-handle.ts`), so the placement composed here is the placement
 * the handle was written for.
 */
import type {
  DesignSessionScopeResponse,
  PublicPlacementAreaResponse,
  PublicPlacementSideResponse,
} from '@embroidery/api-client';

export function resumedScopeOf(
  productSlug: string,
  side: PublicPlacementSideResponse,
  area: PublicPlacementAreaResponse,
): DesignSessionScopeResponse {
  return {
    productSlug,
    sideCode: side.code,
    areaCode: area.code,
    canvasWidthPx: side.imageWidthPx,
    canvasHeightPx: side.imageHeightPx,
    physicalWidthMm: side.physicalWidthMm,
    physicalHeightMm: side.physicalHeightMm,
    pxPerMm: side.pxPerMm,
    boundXPx: area.boundXPx,
    boundYPx: area.boundYPx,
    boundWidthPx: area.boundWidthPx,
    boundHeightPx: area.boundHeightPx,
  };
}
