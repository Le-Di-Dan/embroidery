/**
 * Centralised product-coordinate conversion (FRONTEND_CONVENTIONS §12: "Product
 * coordinate conversion must be centralized"). Three coordinate spaces exist and
 * must not be conflated:
 *
 *   viewport px  — what the user sees (zoom/pan). Transient, never serialized.
 *   document px  — product-image space. This is what the document stores.
 *   physical mm  — embroidery reality, derived from the area's mm/px ratio.
 */
import type { EmbroideryArea, Viewport } from './types';

export function mmPerPx(area: EmbroideryArea): number {
  return area.widthMm / area.widthPx;
}

export function documentPxToMm(area: EmbroideryArea, px: number): number {
  return px * mmPerPx(area);
}

export function mmToDocumentPx(area: EmbroideryArea, mm: number): number {
  return mm / mmPerPx(area);
}

export function documentToViewport(viewport: Viewport, xPx: number, yPx: number): [number, number] {
  return [xPx * viewport.zoom + viewport.panXPx, yPx * viewport.zoom + viewport.panYPx];
}

export interface AreaFit {
  readonly withinArea: boolean;
  readonly overflowMm: number;
}

/** Advisory out-of-area check (05 §6): warnings, not blocking, in the spike. */
export function fitsInArea(
  area: EmbroideryArea,
  box: { xPx: number; yPx: number; widthPx: number; heightPx: number },
): AreaFit {
  const overflowPx = Math.max(
    0,
    area.xPx - box.xPx,
    area.yPx - box.yPx,
    box.xPx + box.widthPx - (area.xPx + area.widthPx),
    box.yPx + box.heightPx - (area.yPx + area.heightPx),
  );
  return { withinArea: overflowPx === 0, overflowMm: documentPxToMm(area, overflowPx) };
}
