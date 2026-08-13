'use client';

/**
 * The touch gestures the mobile stage answers (`APP3-S11`, `610:242`).
 *
 * `610:242` states the whole contract in four lines, and this hook is those four
 * lines and nothing else:
 *
 * ```text
 * Chạm            → chọn phần tử
 * Kéo             → di chuyển
 * Chụm hai ngón   → thu phóng khung
 * Kéo hai ngón    → di chuyển khung
 * ```
 *
 * ## One finger is the design, two fingers are the camera
 *
 * The rule is a function of the touch count and nothing else
 * ({@link gestureKindFor}), which is what makes it decidable at the instant a
 * finger lands rather than after enough movement to guess an intent. A gesture
 * that had to *infer* whether the customer meant to move a flower or the view
 * would be wrong some of the time, and being wrong here means moving a design
 * the customer thought they were only looking at.
 *
 * When the second finger arrives mid-drag, the element gesture is **closed**
 * through `APP3-S03`'s own cancellation — the same path an unmount takes — so
 * what was already validated and committed becomes one history entry and the
 * pinch starts clean. Nothing is left half applied, because every frame of a
 * drag committed either a whole valid document or nothing at all.
 *
 * ## What a viewport gesture may not touch
 *
 * Pinch and two-finger pan reach `APP3-S07`'s store and stop there: no
 * `APP3-P01` mutation, no `APP3-S08` entry, no `APP3-S10` dirtiness. Moving the
 * camera is not editing the design, and the accepted rule that the viewport is
 * never persisted depends on it staying that way.
 *
 * ## Bookkeeping lives in refs
 *
 * Live pointers are per-gesture scratch. They are never put in Zustand — neither
 * the selection store nor the viewport store may hold a `PointerEvent`, and both
 * say so — and never in the Design Document. What survives a gesture is what the
 * gesture *committed*, not the fingers that drove it.
 */
import { type PointerEvent as ReactPointerEvent, useCallback, useEffect, useRef } from 'react';

import {
  centroidOf,
  gestureKindFor,
  isPanningTouch,
  pinchStepFor,
  separationOf,
  type TouchPoint,
} from '../model/studio-touch';
import { useStudioViewportStore } from '../store/studio-viewport.store';
import type { StudioTransformApi } from './use-studio-transform';

export interface UseStudioTouchGesturesOptions {
  /** Off at every tier but mobile; the desktop pointer paths are untouched. */
  readonly enabled: boolean;
  /** `APP3-S03`'s gesture lifecycle. The only way an element is ever moved. */
  readonly transform: StudioTransformApi;
}

export interface StudioTouchHandlers {
  readonly onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  readonly onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
  readonly onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void;
  readonly onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => void;
}

/** The viewport gesture in progress, frozen at the moment the second finger landed. */
interface ViewportGesture {
  readonly startStep: number;
  readonly startSeparationPx: number;
  centroid: TouchPoint;
  widthPx: number;
  heightPx: number;
}

export function useStudioTouchGestures(
  options: UseStudioTouchGesturesOptions,
): StudioTouchHandlers {
  const { enabled, transform } = options;
  const panByPixels = useStudioViewportStore((state) => state.panByPixels);
  const setZoomStep = useStudioViewportStore((state) => state.setZoomStep);

  /*
   * Every touch currently down on this surface, by pointer id.
   *
   * A `Map` rather than a count, because arbitration needs the *positions* of
   * the first two, and because a browser that never delivers `pointerup` for a
   * contact it lost must not leave a phantom finger behind — the cleanup below
   * clears the whole map rather than decrementing a number that could drift.
   */
  const touches = useRef(new Map<number, TouchPoint>());
  const viewport = useRef<ViewportGesture | null>(null);
  const latest = useRef({ transform, panByPixels, setZoomStep });
  latest.current = { transform, panByPixels, setZoomStep };

  const endViewportGesture = useCallback(() => {
    viewport.current = null;
  }, []);

  // A stage that goes away mid-pinch leaves nothing behind: no phantom finger to
  // make the next tap look like a two-finger gesture, and no open element action.
  // `APP3-S03`'s own unmount cleanup closes any gesture it still owns.
  useEffect(() => {
    return () => {
      touches.current.clear();
      viewport.current = null;
    };
  }, []);

  const beginViewport = useCallback((node: HTMLElement) => {
    const points = [...touches.current.values()];
    const [first, second] = points;
    if (first === undefined || second === undefined) return;
    // The element drag, if there was one, is over the moment a second finger
    // lands. Closed through S03's accepted cancellation, never abandoned.
    latest.current.transform.cancelGesture();
    viewport.current = {
      startStep: useStudioViewportStore.getState().zoomStep,
      startSeparationPx: separationOf(first, second),
      centroid: centroidOf(first, second),
      // The only measurement taken of the browser's layout, read at the moment
      // of the gesture and never stored: it converts a centroid delta into a pan
      // ratio and is not, and cannot become, document geometry.
      widthPx: node.clientWidth,
      heightPx: node.clientHeight,
    };
  }, []);

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (!enabled || event.pointerType !== 'touch') return;
      touches.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (gestureKindFor(touches.current.size) === 'viewport') {
        beginViewport(event.currentTarget);
      }
    },
    [beginViewport, enabled],
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (!enabled || event.pointerType !== 'touch') return;
      if (!touches.current.has(event.pointerId)) return;
      touches.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

      const active = viewport.current;
      if (active === null) return;

      const [first, second] = [...touches.current.values()];
      if (first === undefined || second === undefined) return;

      // Zoom: a step index from the *total* ratio since the pinch began. Never a
      // factor, never accumulated onto the previous frame.
      latest.current.setZoomStep(
        pinchStepFor(active.startStep, active.startSeparationPx, separationOf(first, second)),
      );

      // Pan: the centroid's travel since the last frame. Measured from the two
      // fingers together, so spreading them apart moves the camera by nothing.
      const centroid = centroidOf(first, second);
      const deltaX = centroid.x - active.centroid.x;
      const deltaY = centroid.y - active.centroid.y;
      if (!isPanningTouch(deltaX, deltaY)) return;
      active.centroid = centroid;
      latest.current.panByPixels(deltaX, deltaY, active.widthPx, active.heightPx);
    },
    [enabled],
  );

  const release = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (!enabled || event.pointerType !== 'touch') return;
      touches.current.delete(event.pointerId);
      // One finger left after a pinch does not become an element drag: the drag
      // that a lift ends is the one it started, and there is none.
      if (gestureKindFor(touches.current.size) !== 'viewport') endViewportGesture();
    },
    [enabled, endViewportGesture],
  );

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp: release,
    onPointerCancel: release,
  };
}
