/**
 * Touch gesture arithmetic (`APP3-S11`).
 *
 * Pure: no React, no DOM, no store, no clock, and no `PointerEvent`. Everything
 * here takes plain numbers and returns plain numbers, which is what lets the
 * arbitration be tested without a browser and what keeps a pointer object out of
 * the places `APP3-S02` and `APP3-S07` forbid one.
 *
 * ## Why a pinch cannot produce an arbitrary scale
 *
 * `ADR-APP0-001` measured the one real rendering risk: WebKit re-rasterises the
 * whole SVG whenever the viewport scale changes, at a p95 of 41 ms against a
 * 20 ms budget — and it reached that number *by driving a continuous pinch*.
 * `APP3-S07` answered by making zoom an index into a frozen list, so an arbitrary
 * scale is unrepresentable rather than merely discouraged.
 *
 * A pinch is the gesture that number came from, so it does not get an exception.
 * {@link pinchStepFor} converts the live finger separation into a **step index**,
 * never a factor: sixty frames of a pinch can cross at most five boundaries, and
 * between two boundaries the scale does not change at all.
 *
 * ## Frozen start, total ratio
 *
 * The same discipline `APP3-S03` uses for a drag. A pinch remembers the distance
 * and the zoom step it began with, and every frame recomputes from those plus the
 * *total* ratio since. Nothing accumulates, so pinching out and back lands on the
 * step it started on rather than drifting a step per direction change.
 */
import { ZOOM_STEPS, clampStep, zoomAt } from './studio-viewport';

/**
 * A finger separation below this is not a pinch.
 *
 * Two touches that land almost on top of each other produce a ratio dominated by
 * jitter — and a divisor near zero turns a two-pixel wobble into a 10× scale.
 * Below the floor the gesture pans and does not zoom, which is the honest reading
 * of two fingers whose distance carries no signal.
 */
export const PINCH_MIN_SEPARATION_PX = 24;

/**
 * How far a pinch must travel before it changes the zoom at all.
 *
 * Two fingers are never perfectly still, and without a dead zone a two-finger
 * *pan* would flicker between adjacent zoom steps for the whole gesture. 8% is
 * comfortably above hand tremor and well below the 25% gap to the first
 * neighbouring step, so a deliberate pinch still reaches the next step quickly.
 */
export const PINCH_DEAD_ZONE = 0.08;

/** A drag shorter than this is two fingers resting, not a two-finger pan. */
export const TOUCH_PAN_THRESHOLD_PX = 3;

/** One touch point, reduced to what the arithmetic needs. */
export interface TouchPoint {
  readonly x: number;
  readonly y: number;
}

/** The separation of two touches, in CSS pixels. */
export function separationOf(a: TouchPoint, b: TouchPoint): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** The midpoint two touches share — what a two-finger pan follows. */
export function centroidOf(a: TouchPoint, b: TouchPoint): TouchPoint {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/**
 * The zoom **step** a pinch has reached, from the step and separation it began
 * with.
 *
 * The ratio is applied to the *scale the gesture started at*, and the answer is
 * the index of the frozen step nearest that product — so the customer's fingers
 * choose from the six scales that exist and never propose a seventh. Inside the
 * dead zone the starting step is returned unchanged, and a degenerate separation
 * answers with the starting step rather than with `Infinity`.
 */
export function pinchStepFor(startStep: number, startSeparationPx: number, separationPx: number) {
  const start = clampStep(startStep);
  if (
    !Number.isFinite(startSeparationPx) ||
    !Number.isFinite(separationPx) ||
    startSeparationPx < PINCH_MIN_SEPARATION_PX ||
    separationPx < PINCH_MIN_SEPARATION_PX
  ) {
    return start;
  }

  const ratio = separationPx / startSeparationPx;
  if (Math.abs(ratio - 1) < PINCH_DEAD_ZONE) return start;

  const target = zoomAt(start) * ratio;
  return nearestStep(target);
}

/**
 * The index of the frozen zoom nearest a desired scale.
 *
 * Nearest in **log** space, because the steps are multiplicative: half way
 * between 3× and 4× is 3.46×, not 3.5×, and a linear comparison would make the
 * larger gaps at the top of the list feel sticky on the way up and slippery on
 * the way down.
 */
export function nearestStep(scale: number): number {
  if (!Number.isFinite(scale) || scale <= 0) return 0;
  let best = 0;
  let bestDistance = Infinity;
  for (let index = 0; index < ZOOM_STEPS.length; index += 1) {
    const step = ZOOM_STEPS[index] ?? 1;
    const distance = Math.abs(Math.log(scale) - Math.log(step));
    if (distance < bestDistance) {
      bestDistance = distance;
      best = index;
    }
  }
  return best;
}

/**
 * Which gesture a set of active touches means.
 *
 * The whole arbitration, as one total function of the touch count:
 *
 * - `'none'` — nothing is down.
 * - `'element'` — exactly one finger. Whether it actually moves an element is
 *   the caller's question (it needs a selection and an editable target); what
 *   this settles is that one finger is *never* a viewport gesture.
 * - `'viewport'` — two or more. Pinch and two-finger pan run together, from the
 *   first two touches, and no third finger starts a second gesture.
 *
 * Stated as one function so the two callers cannot answer it differently, and so
 * a third touch arriving mid-pinch cannot silently become an element drag.
 */
export type TouchGestureKind = 'none' | 'element' | 'viewport';

export function gestureKindFor(touchCount: number): TouchGestureKind {
  if (touchCount <= 0) return 'none';
  return touchCount === 1 ? 'element' : 'viewport';
}

/** Whether a two-finger movement has cleared the resting threshold. */
export function isPanningTouch(deltaXPx: number, deltaYPx: number): boolean {
  return (
    Math.abs(deltaXPx) >= TOUCH_PAN_THRESHOLD_PX || Math.abs(deltaYPx) >= TOUCH_PAN_THRESHOLD_PX
  );
}
