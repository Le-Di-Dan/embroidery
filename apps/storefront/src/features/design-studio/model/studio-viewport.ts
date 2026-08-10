/**
 * The Studio viewport: zoom, pan and the transform they produce (`APP3-S07`).
 *
 * ## Why this is a finite list and not a multiplier
 *
 * `ADR-APP0-001` measured the one real performance risk in the whole rendering
 * architecture: **WebKit re-rasterises the entire SVG whenever the viewport
 * scale changes**, at a p95 of 41 ms per frame against a 20 ms desktop budget,
 * versus 16.7 ms on Chromium. The spike reached that number by driving a
 * continuous pinch — sixty frames, each at an arbitrary new scale, each one a
 * full re-raster. The ADR's own mitigation is to "step discretely and/or use a
 * CSS transform on a wrapper rather than continuously changing the SVG scale".
 *
 * So zoom here is an **index into a frozen list**, never a factor applied to
 * whatever the zoom happened to be. Three properties follow, and all three are
 * the point:
 *
 * 1. A gesture cannot produce sixty distinct scales, because there are only
 *    {@link ZOOM_STEPS}`.length` scales that exist. The expensive path is not
 *    made faster — it is made unrepresentable.
 * 2. `zoom *= 1.1` accumulates binary64 error, so zooming in and back out lands
 *    near 1 rather than on it. An index returns to exactly `1`.
 * 3. The same action always produces the same value, which is what makes the
 *    benchmark's p95 mean anything across runs.
 *
 * ## Why pan is a ratio and not a pixel count
 *
 * Pan is stored as a fraction of the viewport's own width and height, so the
 * store holds no measurement of the browser's layout — no `DOMRect`, no cached
 * pixel size that a resize would silently invalidate. A CSS percentage in
 * `translate()` resolves against the element's own border box, so the ratio *is*
 * the transform, and a container that changes size keeps the same view of the
 * design instead of jumping (`APP3-S07` §24).
 */

/**
 * Every zoom the Studio has, smallest first.
 *
 * `1` is first and is deliberate: the stage already fits its canvas into the
 * frame — the SVG `viewBox` is the placement canvas and `xMidYMid meet` letterboxes
 * it — so "fitted" is `1`, and there is nothing below it worth showing. Zooming
 * out from fit would only add empty space around a design that is already
 * entirely visible, so the zoom-out control is disabled at fit rather than given
 * a step that does nothing useful.
 *
 * The ceiling is `4`. An embroidery area is a few hundred document pixels across,
 * and four times is enough to inspect a stitch boundary without inviting a scale
 * at which a customer can no longer tell which side of the garment they are on.
 */
export const ZOOM_STEPS: readonly number[] = Object.freeze([1, 1.25, 1.5, 2, 3, 4]);

/**
 * The step the stage opens at, and the one Fit returns it to.
 *
 * Fit and "reset the viewport" are the same canonical state here, because the
 * fitted view *is* zoom `1` with no pan. The approved design draws a Fit control
 * (`FIG-STUDIO-ZOOM-DESKTOP-FIT`) and no separate reset, so exactly one control
 * exists (`APP3-S07` §13).
 */
export const FIT_STEP = 0;

export interface StudioViewport {
  /** An index into {@link ZOOM_STEPS}, never a scale factor. */
  readonly zoomStep: number;
  /** Horizontal pan as a fraction of the viewport's width. `0` at fit. */
  readonly panXRatio: number;
  /** Vertical pan as a fraction of the viewport's height. `0` at fit. */
  readonly panYRatio: number;
}

export const FITTED_VIEWPORT: StudioViewport = Object.freeze({
  zoomStep: FIT_STEP,
  panXRatio: 0,
  panYRatio: 0,
});

/** The scale a step means. Out-of-range steps clamp rather than throw. */
export function zoomAt(zoomStep: number): number {
  return ZOOM_STEPS[clampStep(zoomStep)] ?? 1;
}

export function clampStep(zoomStep: number): number {
  if (!Number.isFinite(zoomStep)) return FIT_STEP;
  return Math.min(Math.max(Math.trunc(zoomStep), 0), ZOOM_STEPS.length - 1);
}

export function canZoomIn(zoomStep: number): boolean {
  return clampStep(zoomStep) < ZOOM_STEPS.length - 1;
}

export function canZoomOut(zoomStep: number): boolean {
  return clampStep(zoomStep) > 0;
}

/** `1` renders as `100`. Whole percent — a zoom set of whole ratios has no fraction. */
export function zoomPercent(zoomStep: number): number {
  return Math.round(zoomAt(zoomStep) * 100);
}

/**
 * The pan a zoom level allows, as a closed interval of ratios.
 *
 * With `transform-origin: 0 0`, `translate(P%) scale(Z)` puts the content across
 * `[P·W, P·W + Z·W]` while the frame is `[0, W]`. Keeping the frame covered is
 * therefore `P ≤ 0` and `P ≥ -(Z − 1)` — and at `Z = 1` those collapse to the
 * single value `0`.
 *
 * That collapse is the whole recovery story (`APP3-S07` §15): at fit there is no
 * pan to be lost in, and at any other step the content can never be dragged so
 * far that the stage leaves the frame. The stage cannot be panned into nowhere,
 * rather than being pannable into nowhere with a Fit button to escape.
 */
export function panLimit(zoomStep: number): number {
  return zoomAt(zoomStep) - 1;
}

export function clampPan(ratio: number, zoomStep: number): number {
  if (!Number.isFinite(ratio)) return 0;
  const clamped = Math.min(Math.max(ratio, -panLimit(zoomStep)), 0);
  // `Math.max(-0.5, -0)` is `-0`, which is equal to `0` but serialises as
  // `-0.0000%`. Two viewports that are the same position would then produce two
  // different transform strings, and every comparison against the fitted state
  // would have to know about it.
  return clamped === 0 ? 0 : clamped;
}

/**
 * A viewport with its pan re-clamped for its own zoom.
 *
 * Zooming out shrinks the legal pan interval, so a pan that was legal at 4× is
 * out of range at 2×. Re-clamping on every change is what stops a zoom-out from
 * leaving the content parked off-frame.
 */
export function normalizeViewport(viewport: StudioViewport): StudioViewport {
  const zoomStep = clampStep(viewport.zoomStep);
  return {
    zoomStep,
    panXRatio: clampPan(viewport.panXRatio, zoomStep),
    panYRatio: clampPan(viewport.panYRatio, zoomStep),
  };
}

/**
 * A pointer drag, converted from CSS pixels to pan ratios.
 *
 * The viewport's own width and height are the only measurement this feature
 * takes from the browser, they are read at the moment of the gesture and are
 * never stored. A drag of `dx` CSS pixels moves the content by `dx` pixels
 * because `translate` is applied before `scale` in the untransformed box — so
 * the ratio is a plain division, with no scale factor and no matrix.
 */
export function panBy(
  viewport: StudioViewport,
  deltaXPx: number,
  deltaYPx: number,
  widthPx: number,
  heightPx: number,
): StudioViewport {
  const x = widthPx > 0 ? viewport.panXRatio + deltaXPx / widthPx : viewport.panXRatio;
  const y = heightPx > 0 ? viewport.panYRatio + deltaYPx / heightPx : viewport.panYRatio;
  return normalizeViewport({ zoomStep: viewport.zoomStep, panXRatio: x, panYRatio: y });
}

/**
 * The one CSS transform the viewport produces.
 *
 * It is applied to a single wrapper around the whole scene, which is what keeps
 * the background, the embroidery area, every element and the selection outline
 * in one coordinate system: they are transformed together, as one layer, so
 * they cannot drift apart at any zoom. No element transform is touched, no
 * `viewBox` is rewritten and `APP3-P02` is never asked for anything again —
 * zooming does not rebuild the scene, it moves the picture of it.
 */
export function viewportTransform(viewport: StudioViewport): string {
  const { zoomStep, panXRatio, panYRatio } = normalizeViewport(viewport);
  const x = (panXRatio * 100).toFixed(4);
  const y = (panYRatio * 100).toFixed(4);
  return `translate(${x}%, ${y}%) scale(${String(zoomAt(zoomStep))})`;
}
