/**
 * Local drawable envelopes (`IMP-D045` PO-08, as corrected by `APP3-G05-C1`).
 *
 * The envelope is what an element paints, expressed in its **own** local frame
 * before any transform. Getting it right here is what makes the transformed AABB
 * conservative rather than merely plausible.
 *
 * The stroke is drawable geometry, not decoration. It is centred on the local
 * path, so every kind that stores `strokeWidthPx` — `rectangle`, `ellipse`,
 * `line`, `freehand` — expands by `strokeWidthPx / 2` on all four sides. The
 * delivered G05 ruling expanded only line and freehand, and a stroked rectangle
 * could therefore paint outside its own "conservative" bounds and pass
 * containment; C1 closed that.
 *
 * Two v1 facts have no other source and are locked rather than inferred: a
 * `line` stores no endpoints, so its path is exactly `(0,0) → (width,height)`;
 * and cap/join/miter are **version-level constants**, not document fields.
 */
import type { DesignElement } from '@embroidery/design-document';

import { boundsOfPoints, expandBounds, type Bounds2D } from '../geometry/types';

/** Fixed v1 stroke semantics. Constants of the schema version, never fields. */
export const RECTANGLE_LINE_JOIN = 'miter';
export const RECTANGLE_MITER_LIMIT = 4;
export const LINE_CAP = 'round';
export const LINE_JOIN = 'round';
export const FREEHAND_CAP = 'round';
export const FREEHAND_JOIN = 'round';

/** Kinds whose stroke participates in bounds. */
export const STROKED_KINDS: readonly string[] = Object.freeze([
  'rectangle',
  'ellipse',
  'line',
  'freehand',
]);

/** Kinds with no stroke at all: their declared box is the envelope. */
export const UNSTROKED_KINDS: readonly string[] = Object.freeze(['text', 'image']);

function declaredBox(element: DesignElement): Bounds2D {
  return { minX: 0, minY: 0, maxX: element.transform.width, maxY: element.transform.height };
}

function halfStroke(strokeWidthPx: number): number | undefined {
  if (!Number.isFinite(strokeWidthPx) || strokeWidthPx < 0) return undefined;
  return strokeWidthPx / 2;
}

/**
 * The exact local drawable envelope, or `undefined` when the element's own
 * geometry is unusable.
 *
 * `undefined` rather than a throw: the caller turns it into a typed
 * `INVALID_GEOMETRY` finding, and this package must fail safely when called
 * directly with input P01 never validated.
 */
export function localEnvelope(element: DesignElement): Bounds2D | undefined {
  const box = declaredBox(element);
  if (!Number.isFinite(box.maxX) || !Number.isFinite(box.maxY) || box.maxX < 0 || box.maxY < 0) {
    return undefined;
  }

  switch (element.type) {
    // PO-08: no font measurement, no image read, no stroke.
    case 'text':
    case 'image':
      return box;

    case 'shape': {
      const half = halfStroke(element.strokeWidthPx);
      if (half === undefined) return undefined;
      if (element.shape === 'line') {
        // v1 stores no endpoints; the path is the box diagonal, and round caps
        // extend it by half the stroke in every direction.
        const points = [
          { x: 0, y: 0 },
          { x: box.maxX, y: box.maxY },
        ];
        const path = boundsOfPoints(points);
        return path === undefined ? undefined : expandBounds(path, half);
      }
      // Rectangle (miter/4 over four 90° corners) and ellipse (inscribed in the
      // declared box) share the same conservative envelope.
      return expandBounds(box, half);
    }

    case 'freehand': {
      const half = halfStroke(element.strokeWidthPx);
      if (half === undefined) return undefined;
      const points = element.points.filter(
        (point: { x: number; y: number }) => Number.isFinite(point.x) && Number.isFinite(point.y),
      );
      if (points.length !== element.points.length) return undefined;
      // One point is a round dot of radius half the stroke; the polyline AABB of
      // a single point is that point, so the same expansion produces it.
      const path = boundsOfPoints(points);
      return path === undefined ? undefined : expandBounds(path, half);
    }

    default:
      // A group paints nothing of its own (PO-07).
      return undefined;
  }
}

/** True when the element paints something and therefore has an envelope. */
export function isDrawable(element: DesignElement): boolean {
  return element.type !== 'group';
}
