'use client';

/**
 * The Studio's viewport state (`APP3-S07`).
 *
 * A **separate** store from `studio-interaction.store.ts` rather than a second
 * slice inside it, and deliberately so. Selection is a reference into the
 * document; the viewport is a description of where the camera is pointing.
 * Neither can express the other, and keeping them in two modules is what lets
 * `APP3-S02`'s rule — the selection store may not contain the string `zoom` or
 * `pan` — stay absolute instead of being relaxed to make room for this
 * checkpoint. A rule that never had to bend is worth more than one that did.
 *
 * ## What may never be in here
 *
 * The same bar the selection store sets, for the same reason: only serializable,
 * engine-neutral numbers. No `DOMRect`, `DOMMatrix`, `SVGElement`, pointer
 * event, animation-frame handle, `AbortController`, object URL, React ref,
 * Session snapshot or Design Document. The viewport is measured in ratios
 * precisely so that no pixel measurement of the browser's layout ever needs to
 * be kept — the numbers here survive a resize because they never described a
 * size in the first place.
 *
 * ## The viewport is never persisted
 *
 * Not into the Design Document, not through autosave, not to `localStorage`,
 * `sessionStorage`, the URL or a cookie. `ADR-APP0-001` locks viewport zoom and
 * pan as runtime state, and `APP3-P01` has no field that could hold it. Where a
 * customer had scrolled to is not part of what they designed, and a zoom level
 * restored into a different Session would be a view of someone else's canvas.
 */
import { create } from 'zustand';

import {
  FITTED_VIEWPORT,
  type StudioViewport,
  canZoomIn,
  canZoomOut,
  clampStep,
  normalizeViewport,
  panBy,
} from '../model/studio-viewport';

export interface StudioViewportState extends StudioViewport {
  /**
   * Whether the embroidery-area boundary is drawn.
   *
   * Presentation only. `APP3-S02` draws the boundary from the Session's own
   * scope rectangle, and hiding it changes what is painted and nothing else —
   * not the rectangle, not the Session scope, not the document placement.
   */
  readonly safeAreaVisible: boolean;
  readonly zoomIn: () => void;
  readonly zoomOut: () => void;
  /** Back to the canonical fitted view. The one recovery the design draws. */
  readonly fitViewport: () => void;
  /**
   * Lands on one of the frozen steps directly (`APP3-S11`).
   *
   * A pinch does not walk the list one step at a time — a fast spread crosses
   * three boundaries in as many frames — so it needs to say which step it has
   * reached rather than how many times to press a button. What it may *not* do
   * is propose a scale: the argument is an index, `clampStep` is what receives
   * it, and `normalizeViewport` re-clamps the pan for the new zoom exactly as
   * the two button paths do.
   */
  readonly setZoomStep: (zoomStep: number) => void;
  readonly panByPixels: (
    deltaXPx: number,
    deltaYPx: number,
    widthPx: number,
    heightPx: number,
  ) => void;
  readonly toggleSafeArea: () => void;
  /**
   * Drops the whole viewport back to its opening state.
   *
   * Called when the Session identity changes. A pan and zoom are a position on
   * one particular canvas; carrying them into a different design would point
   * the camera at coordinates that mean something else there.
   */
  readonly resetViewport: () => void;
}

const INITIAL = Object.freeze({ ...FITTED_VIEWPORT, safeAreaVisible: true });

export const useStudioViewportStore = create<StudioViewportState>()((set) => ({
  ...INITIAL,
  zoomIn: () => {
    set((state) =>
      canZoomIn(state.zoomStep)
        ? normalizeViewport({ ...state, zoomStep: state.zoomStep + 1 })
        : state,
    );
  },
  zoomOut: () => {
    // Re-normalised, not merely decremented: a pan that was legal at the old
    // zoom can be outside the smaller interval the new one allows.
    set((state) =>
      canZoomOut(state.zoomStep)
        ? normalizeViewport({ ...state, zoomStep: state.zoomStep - 1 })
        : state,
    );
  },
  fitViewport: () => {
    set(FITTED_VIEWPORT);
  },
  setZoomStep: (zoomStep) => {
    set((state) => {
      const next = clampStep(zoomStep);
      // The same value is the same viewport. Returning a fresh object every
      // pinch frame would re-render the whole transformed layer sixty times for
      // a gesture that spends most of its frames between two boundaries.
      if (next === state.zoomStep) return state;
      return normalizeViewport({ ...state, zoomStep: next });
    });
  },
  panByPixels: (deltaXPx, deltaYPx, widthPx, heightPx) => {
    set((state) => panBy(state, deltaXPx, deltaYPx, widthPx, heightPx));
  },
  toggleSafeArea: () => {
    set((state) => ({ safeAreaVisible: !state.safeAreaVisible }));
  },
  resetViewport: () => {
    set(INITIAL);
  },
}));
