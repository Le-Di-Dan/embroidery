/**
 * The Studio viewport model (`APP3-S07`).
 *
 * These cover the properties that make the WebKit mitigation real rather than
 * claimed: that the zoom set is finite and index-addressed so an arbitrary scale
 * cannot be produced, that zooming in and back out returns to *exactly* the
 * value it started at rather than near it, and that the pan interval collapses
 * at the fitted step so the stage cannot be dragged out of its own frame.
 *
 * They also assert the negative space. Nothing in this module knows what a
 * Design Document is, so there is no assertion that it leaves one alone — it
 * could not reach one. That is the point of the module being pure.
 */
import {
  FITTED_VIEWPORT,
  FIT_STEP,
  ZOOM_STEPS,
  canZoomIn,
  canZoomOut,
  clampPan,
  clampStep,
  normalizeViewport,
  panBy,
  panLimit,
  viewportTransform,
  zoomAt,
  zoomPercent,
} from '../../src/features/design-studio/model/studio-viewport';

const at = (zoomStep: number, panXRatio = 0, panYRatio = 0) => ({ zoomStep, panXRatio, panYRatio });
const TOP = ZOOM_STEPS.length - 1;

describe('the zoom set is finite, ordered and deterministic', () => {
  it('is strictly increasing, so a step index is a monotonic zoom', () => {
    for (let index = 1; index < ZOOM_STEPS.length; index += 1) {
      expect(ZOOM_STEPS[index]).toBeGreaterThan(ZOOM_STEPS[index - 1] ?? 0);
    }
  });

  it('opens fitted at exactly 1', () => {
    expect(zoomAt(FIT_STEP)).toBe(1);
    expect(FITTED_VIEWPORT).toEqual(at(FIT_STEP));
  });

  it('bounds the zoom at both ends rather than growing the set', () => {
    expect(clampStep(-4)).toBe(FIT_STEP);
    expect(clampStep(999)).toBe(TOP);
    expect(canZoomOut(FIT_STEP)).toBe(false);
    expect(canZoomIn(TOP)).toBe(false);
    expect(canZoomIn(FIT_STEP)).toBe(true);
    expect(canZoomOut(TOP)).toBe(true);
  });

  it('returns to the identical value after zooming in and back out', () => {
    // The reason this is an index and not `zoom *= 1.1`: a multiplied zoom
    // lands *near* 1 and never on it, and every later comparison against the
    // fitted state then has to be approximate.
    let step = FIT_STEP;
    for (let n = 0; n < TOP; n += 1) step += 1;
    for (let n = 0; n < TOP; n += 1) step -= 1;

    expect(zoomAt(step)).toBe(1);
    expect(Object.is(zoomAt(step), zoomAt(FIT_STEP))).toBe(true);
  });

  it('gives the same value for the same step, every time', () => {
    expect(zoomAt(3)).toBe(zoomAt(3));
    expect(viewportTransform(at(3, -0.5))).toBe(viewportTransform(at(3, -0.5)));
  });

  it('states the zoom as a whole percent', () => {
    expect(zoomPercent(FIT_STEP)).toBe(100);
    expect(zoomPercent(TOP)).toBe(Math.round((ZOOM_STEPS[TOP] ?? 1) * 100));
  });

  it('survives a non-finite step instead of producing NaN in a transform', () => {
    expect(clampStep(Number.NaN)).toBe(FIT_STEP);
    expect(viewportTransform(at(Number.NaN))).not.toContain('NaN');
  });
});

describe('the pan interval keeps the stage inside its own frame', () => {
  it('allows no pan at all at the fitted step', () => {
    expect(panLimit(FIT_STEP)).toBe(0);
    expect(clampPan(-0.5, FIT_STEP)).toBe(0);
    expect(clampPan(0.5, FIT_STEP)).toBe(0);
  });

  it('allows exactly the interval that keeps the content covering the frame', () => {
    for (let step = 0; step < ZOOM_STEPS.length; step += 1) {
      const limit = zoomAt(step) - 1;
      expect(panLimit(step)).toBeCloseTo(limit, 10);
      expect(clampPan(-limit, step)).toBeCloseTo(-limit, 10);
      // One step beyond the interval on either side is refused, not scaled.
      expect(clampPan(-limit - 1, step)).toBeCloseTo(-limit, 10);
      expect(clampPan(1, step)).toBe(0);
    }
  });

  it('re-clamps a legal pan that a zoom-out makes illegal', () => {
    const panned = normalizeViewport(at(TOP, -panLimit(TOP), -panLimit(TOP)));
    const zoomedOut = normalizeViewport({ ...panned, zoomStep: FIT_STEP });

    expect(zoomedOut).toEqual(at(FIT_STEP));
  });

  it('converts a pointer delta into a ratio of the element it was dragged on', () => {
    const panned = panBy(at(TOP), -100, -50, 1000, 500);

    expect(panned.panXRatio).toBeCloseTo(-0.1, 10);
    expect(panned.panYRatio).toBeCloseTo(-0.1, 10);
    expect(panned.zoomStep).toBe(TOP);
  });

  it('ignores a drag on an element with no measurable size', () => {
    expect(panBy(at(TOP, -0.2, -0.2), -100, -50, 0, 0)).toEqual(at(TOP, -0.2, -0.2));
  });

  it('cannot be dragged past the interval however far the pointer travels', () => {
    let viewport = at(1);
    for (let n = 0; n < 50; n += 1) viewport = panBy(viewport, -1000, -1000, 100, 100);

    expect(viewport.panXRatio).toBeCloseTo(-panLimit(1), 10);
    expect(viewport.panYRatio).toBeCloseTo(-panLimit(1), 10);
  });
});

describe('the transform is the only thing the viewport produces', () => {
  it('is the identity at the fitted viewport', () => {
    expect(viewportTransform(FITTED_VIEWPORT)).toBe('translate(0.0000%, 0.0000%) scale(1)');
  });

  it('expresses pan as a percentage, so it has no pixel size in it', () => {
    const transform = viewportTransform(at(TOP, -0.25, -0.5));

    expect(transform).toContain('translate(-25.0000%, -50.0000%)');
    expect(transform).not.toContain('px');
  });

  it('carries exactly one scale and one translate', () => {
    const transform = viewportTransform(at(2, -0.1, -0.1));

    expect(transform.match(/scale\(/g)).toHaveLength(1);
    expect(transform.match(/translate\(/g)).toHaveLength(1);
    // No matrix, no rotation, no skew: the viewport is a pan and a zoom.
    expect(transform).not.toMatch(/matrix|rotate|skew/);
  });

  it('normalises before serialising, so an out-of-range viewport cannot be drawn', () => {
    expect(viewportTransform(at(FIT_STEP, -5, -5))).toBe(viewportTransform(FITTED_VIEWPORT));
  });
});
