/**
 * The one boundary between screen pixels and document units (`APP3-S03`).
 *
 * There is exactly one conversion in this feature and it lives here, because a
 * second one would be a second answer to "how big is a document pixel" and the
 * two would agree at 100 % and disagree at every other zoom.
 *
 * ## Positions never come through here
 *
 * Handles are positioned as a **percentage of the stage box**, not in pixels:
 * the `APP3-S02` canvas fills its box and preserves the document's aspect
 * ratio, so `docX / canvasWidthPx` *is* the fraction across the box at every
 * zoom, pan and viewport width, with nothing measured and nothing to drift.
 * That is also why the overlay sits inside the `APP3-S07` transform layer — it
 * inherits the viewport transform for free, exactly as the selection outline
 * does, and cannot fall out of register with the artwork.
 *
 * Only a **delta** needs a scale factor, because a pointer moves in screen
 * pixels and a transform is persisted in document units.
 */
import type { Vector2D } from '@embroidery/design-engine';

export interface StageMapping {
  readonly canvasWidthPx: number;
  readonly canvasHeightPx: number;
  /** The overlay's own untransformed layout size. CSS transforms do not change it. */
  readonly boxWidthPx: number;
  readonly boxHeightPx: number;
  /** The `APP3-S07` viewport scale the layer is currently drawn at. */
  readonly zoom: number;
}

/**
 * A pointer delta in screen pixels, in document units.
 *
 * Two divisions, in this order: the viewport scale, because the layer is drawn
 * `zoom` times larger than it is laid out, and then the stage scale, because the
 * document canvas is drawn `boxWidthPx / canvasWidthPx` times larger than it is
 * authored. At 400 % a hundred-pixel drag must move the element a quarter as far
 * through the document as it would at 100 %, which is precisely this.
 */
export function screenDeltaToDocument(
  mapping: StageMapping,
  deltaXPx: number,
  deltaYPx: number,
): Vector2D {
  const { canvasWidthPx, canvasHeightPx, boxWidthPx, boxHeightPx, zoom } = mapping;
  if (!usable(boxWidthPx) || !usable(boxHeightPx) || !usable(zoom)) return { x: 0, y: 0 };
  return {
    x: (deltaXPx / zoom) * (canvasWidthPx / boxWidthPx),
    y: (deltaYPx / zoom) * (canvasHeightPx / boxHeightPx),
  };
}

/** A document point as a percentage of the stage box, for CSS placement. */
export function documentToPercent(
  canvasWidthPx: number,
  canvasHeightPx: number,
  point: Vector2D,
): { readonly left: number; readonly top: number } {
  return {
    left: usable(canvasWidthPx) ? (point.x / canvasWidthPx) * 100 : 0,
    top: usable(canvasHeightPx) ? (point.y / canvasHeightPx) * 100 : 0,
  };
}

/**
 * How much to shrink a handle so it stays the same size on screen.
 *
 * The overlay is inside the viewport layer, so a 44 px control would be drawn at
 * 176 px at 400 %. Counter-scaling keeps the visible knob at its design size and
 * — the part that matters — keeps the *effective* hit target at its design size
 * too, rather than making it enormous at high zoom and correct nowhere else.
 */
export function handleCounterScale(zoom: number): number {
  // Only the viewport scale, deliberately. The overlay's own layout box already
  // *is* the stage box, so a 44 px control is 44 layout pixels there and the
  // stage scale never enters — folding it in would shrink every handle by the
  // canvas-to-box ratio and quietly break the ≥44 px floor at ordinary widths.
  return usable(zoom) ? 1 / zoom : 1;
}

function usable(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}
