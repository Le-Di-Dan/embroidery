/**
 * The transform chrome's handle set (`APP3-S03`).
 *
 * Eight resize handles and one rotate affordance, exactly as
 * `FIG-STUDIO-TRANSFORM-DESKTOP-{MOVE 606:186, RESIZE 606:256, ROTATE 606:326}`
 * draw them. Nine, and not a tenth: a handle that cannot be grabbed is a promise
 * nothing has shipped, and `APP3-S04` owns anything that reorders or locks.
 *
 * A handle is described here by the **local-box point it grabs**, never by a
 * pixel position. The local box runs `(0,0)` to `(width,height)` — `IMP-D045`
 * PO-02 — so a handle's document position is whatever `APP3-P02` says that
 * point maps to under the element's effective matrix. Nothing in this module
 * knows about the screen, the viewport, CSS or the DOM.
 */
import type { Point2D } from '@embroidery/design-engine';

export type ResizeHandleId = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

/** Clockwise from the top-left, which is the order the approved frame draws. */
export const RESIZE_HANDLES: readonly ResizeHandleId[] = Object.freeze([
  'nw',
  'n',
  'ne',
  'e',
  'se',
  's',
  'sw',
  'w',
]);

/**
 * The four the mobile stage draws (`APP3-S11`, `610:242`).
 *
 * Corners only, and it is a subset rather than a second set: `610:242` draws
 * ~22 px knobs at the four corners of a selected element and no edge or rotate
 * affordance. `APP3-S11` §8 forbids reproducing all eight desktop handles
 * automatically, and a mid-edge knob on a phone would sit under the fingertip
 * that is already holding the element.
 */
export const CORNER_HANDLES: readonly ResizeHandleId[] = Object.freeze(['nw', 'ne', 'se', 'sw']);

/**
 * Where each handle sits in the local box, as a fraction of width and height.
 *
 * A fraction rather than a coordinate so the same table works for every element
 * size, and so the axis a handle *drives* is readable from the table: an anchor
 * at `0.5` is on the centre line, so dragging it cannot change that axis's
 * scale — dividing by a zero offset would be the classic silent `Infinity`.
 */
const ANCHORS: Readonly<Record<ResizeHandleId, Point2D>> = Object.freeze({
  nw: { x: 0, y: 0 },
  n: { x: 0.5, y: 0 },
  ne: { x: 1, y: 0 },
  e: { x: 1, y: 0.5 },
  se: { x: 1, y: 1 },
  s: { x: 0.5, y: 1 },
  sw: { x: 0, y: 1 },
  w: { x: 0, y: 0.5 },
});

/** The point a handle grabs, in the element's own local box. */
export function handleLocalPoint(handle: ResizeHandleId, width: number, height: number): Point2D {
  const anchor = ANCHORS[handle];
  return { x: anchor.x * width, y: anchor.y * height };
}

/**
 * The handle's offset from the local-box centre, which is the scale pivot.
 *
 * `IMP-D045` PO-04 fixes that pivot, so this vector is what a resize divides by
 * to recover a scale factor. A zero component means "this handle does not drive
 * this axis" and the caller must keep the existing scale rather than divide.
 */
export function handleCentreOffset(handle: ResizeHandleId, width: number, height: number): Point2D {
  const point = handleLocalPoint(handle, width, height);
  return { x: point.x - width / 2, y: point.y - height / 2 };
}

/** The local point the rotate affordance is anchored to: the top-edge midpoint. */
export function rotateLocalPoint(width: number): Point2D {
  return { x: width / 2, y: 0 };
}
