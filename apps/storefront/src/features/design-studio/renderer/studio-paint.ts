/**
 * How a placed element is painted, given that `APP3-P02` already decided where
 * it lands.
 *
 * These are the presentation facts a renderer owns and geometry does not: which
 * SVG anchor a text alignment means, where that anchor sits inside the local
 * box, and how a point list becomes a `points` attribute. All of them are pure
 * derivations of P01 fields, kept out of the React tree so they can be asserted
 * directly.
 *
 * ## Why the stroke constants are re-exported rather than written
 *
 * `APP3-P02`'s conservative envelope is computed from fixed v1 cap/join/miter
 * values — they are constants of the schema version, not document fields. A
 * renderer that painted a butt cap where the engine measured a round one would
 * paint *inside* its own bounds; one that painted a miter join where the engine
 * assumed none would paint **outside** them, and the selection outline would be
 * visibly too small. Either way the two would disagree about the same element.
 * So the painted stroke is bound to the same constants the bounds were measured
 * with, by importing them rather than by matching literals.
 */
import type { FreehandPoint, TextAlign } from '@embroidery/design-document';
import {
  FREEHAND_CAP,
  FREEHAND_JOIN,
  LINE_CAP,
  LINE_JOIN,
  RECTANGLE_LINE_JOIN,
  RECTANGLE_MITER_LIMIT,
} from '@embroidery/design-engine';

export {
  FREEHAND_CAP,
  FREEHAND_JOIN,
  LINE_CAP,
  LINE_JOIN,
  RECTANGLE_LINE_JOIN,
  RECTANGLE_MITER_LIMIT,
};

/** `textAlign` as SVG's `text-anchor`. */
export function textAnchorFor(align: TextAlign): 'start' | 'middle' | 'end' {
  if (align === 'center') return 'middle';
  return align === 'right' ? 'end' : 'start';
}

/**
 * Where the anchor sits inside the element's own local box.
 *
 * The box runs `0,0` to `width,height` — `APP3-P02` folds the authored `x`/`y`
 * into the effective matrix — so an aligned run of text is positioned by moving
 * its anchor, never by offsetting the element a second time.
 */
export function textAnchorXFor(align: TextAlign, width: number): number {
  if (align === 'center') return width / 2;
  return align === 'right' ? width : 0;
}

/** A freehand path's `points` attribute, in the element's local frame. */
export function freehandPoints(points: readonly FreehandPoint[]): string {
  return points.map((point) => `${String(point.x)},${String(point.y)}`).join(' ');
}
