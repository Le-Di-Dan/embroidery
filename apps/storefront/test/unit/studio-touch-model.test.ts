/**
 * The touch arithmetic (`APP3-S11`).
 *
 * Pure functions, so these are the cases a browser makes expensive to reach: a
 * pinch that spans the whole zoom list, one that sits inside the dead zone, two
 * fingers that land on top of each other, and the arbitration at every touch
 * count. None of them needs a DOM, and none of them may need one later — the
 * moment this file has to render something, the model has stopped being a model.
 */
import {
  PINCH_DEAD_ZONE,
  PINCH_MIN_SEPARATION_PX,
  TOUCH_PAN_THRESHOLD_PX,
  centroidOf,
  gestureKindFor,
  isPanningTouch,
  nearestStep,
  pinchStepFor,
  separationOf,
} from '../../src/features/design-studio/model/studio-touch';
import { ZOOM_STEPS, zoomAt } from '../../src/features/design-studio/model/studio-viewport';
import {
  ROTATION_STEP_DEG,
  SIZE_STEP_MM,
  formatDegrees,
  formatMm,
  normalizeDegrees,
  resizeByStep,
  rotateByStep,
} from '../../src/features/design-studio/model/studio-mobile-transform';

const TRANSFORM = {
  x: 10,
  y: 20,
  width: 100,
  height: 50,
  rotationDeg: 0,
  scaleX: 1,
  scaleY: 1,
};

describe('the geometry two fingers describe', () => {
  it('measures separation and midpoint', () => {
    expect(separationOf({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
    expect(centroidOf({ x: 0, y: 0 }, { x: 10, y: 20 })).toEqual({ x: 5, y: 10 });
  });

  it('treats a movement under the threshold as two fingers resting', () => {
    expect(isPanningTouch(TOUCH_PAN_THRESHOLD_PX - 1, 0)).toBe(false);
    expect(isPanningTouch(0, TOUCH_PAN_THRESHOLD_PX)).toBe(true);
  });
});

describe('a pinch chooses from the frozen zoom list', () => {
  it('never proposes a scale outside it', () => {
    // Every ratio from a tenth to ten times, at the widest starting step. The
    // property is the one `ADR-APP0-001` bought with a discrete list: a pinch
    // cannot produce a seventh scale, however hard it is driven.
    for (let ratio = 0.1; ratio <= 10; ratio += 0.05) {
      const step = pinchStepFor(0, 100, 100 * ratio);
      expect(Number.isInteger(step)).toBe(true);
      expect(step).toBeGreaterThanOrEqual(0);
      expect(step).toBeLessThan(ZOOM_STEPS.length);
    }
  });

  it('holds the starting step inside the dead zone', () => {
    const inside = 1 + PINCH_DEAD_ZONE / 2;
    expect(pinchStepFor(3, 200, 200 * inside)).toBe(3);
    expect(pinchStepFor(3, 200, 200 / inside)).toBe(3);
  });

  it('holds the starting step when the fingers are too close to mean anything', () => {
    const tooClose = PINCH_MIN_SEPARATION_PX - 1;
    expect(pinchStepFor(2, tooClose, 400)).toBe(2);
    expect(pinchStepFor(2, 400, tooClose)).toBe(2);
    // A degenerate separation answers with the starting step, never `Infinity`.
    expect(pinchStepFor(2, 0, 0)).toBe(2);
    expect(pinchStepFor(2, Number.NaN, 100)).toBe(2);
  });

  it('returns to the step it started on when the fingers return', () => {
    // The frozen-start discipline. Nothing accumulates, so a pinch out and back
    // lands on the original step rather than a drifted neighbour of it.
    const start = 2;
    const out = pinchStepFor(start, 150, 450);
    expect(out).toBeGreaterThan(start);
    expect(pinchStepFor(start, 150, 150)).toBe(start);
  });

  it('spreads outward and inward across the whole list', () => {
    expect(pinchStepFor(0, 100, 1000)).toBe(ZOOM_STEPS.length - 1);
    expect(pinchStepFor(ZOOM_STEPS.length - 1, 1000, 100)).toBe(0);
  });

  it('picks the nearest step in log space', () => {
    // Half way between 3× and 4× is 3.46×, not 3.5×. A linear comparison would
    // put 3.5 on the 3× side and make the top of the list feel sticky.
    expect(zoomAt(nearestStep(3.4))).toBe(3);
    expect(zoomAt(nearestStep(3.5))).toBe(4);
    expect(nearestStep(0)).toBe(0);
    expect(nearestStep(Number.NaN)).toBe(0);
  });
});

describe('one finger is the design, two are the camera', () => {
  it('answers for every touch count', () => {
    expect(gestureKindFor(0)).toBe('none');
    expect(gestureKindFor(1)).toBe('element');
    expect(gestureKindFor(2)).toBe('viewport');
    // A third finger starts no second gesture.
    expect(gestureKindFor(3)).toBe('viewport');
    expect(gestureKindFor(10)).toBe('viewport');
  });
});

describe('the numeric transform builds candidates and rules on none of them', () => {
  it('scales an axis by the factor one millimetre of the measured size implies', () => {
    const measured = { widthMm: 50, heightMm: 25 };
    const wider = resizeByStep(TRANSFORM, 'width', 1, measured);
    expect(wider?.scaleX).toBeCloseTo((50 + SIZE_STEP_MM) / 50, 10);
    // The other axis is untouched: a width button is not a uniform scale.
    expect(wider?.scaleY).toBe(TRANSFORM.scaleY);

    const shorter = resizeByStep(TRANSFORM, 'height', -1, measured);
    expect(shorter?.scaleY).toBeCloseTo((25 - SIZE_STEP_MM) / 25, 10);
    expect(shorter?.scaleX).toBe(TRANSFORM.scaleX);
  });

  it('offers no candidate that would mirror or erase the element', () => {
    // Shrinking past nothing is not a smaller element, it is a mirrored one.
    expect(resizeByStep(TRANSFORM, 'width', -1, { widthMm: 0.5, heightMm: 10 })).toBeUndefined();
    expect(resizeByStep(TRANSFORM, 'width', 1, { widthMm: 0, heightMm: 10 })).toBeUndefined();
    expect(
      resizeByStep(TRANSFORM, 'height', 1, { widthMm: 10, heightMm: Number.NaN }),
    ).toBeUndefined();
  });

  it('turns clockwise-positive and counts the way a customer does', () => {
    expect(rotateByStep(TRANSFORM, 1).rotationDeg).toBe(ROTATION_STEP_DEG);
    // Decrementing from zero reads as 359, not -1: the same angle, said the way
    // a customer counts.
    expect(rotateByStep(TRANSFORM, -1).rotationDeg).toBe(360 - ROTATION_STEP_DEG);
    expect(rotateByStep({ ...TRANSFORM, rotationDeg: 359 }, 1).rotationDeg).toBe(0);
  });

  it('normalizes and formats without inventing precision', () => {
    expect(normalizeDegrees(-90)).toBe(270);
    expect(normalizeDegrees(720)).toBe(0);
    expect(normalizeDegrees(Number.POSITIVE_INFINITY)).toBe(0);
    expect(formatMm(12.34)).toBe('12.3');
    expect(formatDegrees(44.6)).toBe('45');
  });

  it('changes nothing but the transform it was given', () => {
    // The candidate is a new object; the caller still owns the original, which
    // is what lets a refusal cost nothing.
    const measured = { widthMm: 50, heightMm: 25 };
    const before = { ...TRANSFORM };
    resizeByStep(TRANSFORM, 'width', 1, measured);
    rotateByStep(TRANSFORM, 1);
    expect(TRANSFORM).toEqual(before);
  });
});
