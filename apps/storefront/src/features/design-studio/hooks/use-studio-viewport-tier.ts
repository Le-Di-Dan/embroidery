'use client';

/**
 * The Studio composition this browser is currently showing (`APP3-S05-C1`).
 *
 * ## Why the server answer is "unknown"
 *
 * A server has no viewport. Guessing one and rendering the desktop inspector
 * into the HTML would put real, focusable text fields on a 390 phone for the
 * time between paint and hydration — the exact `APP3-S11` surface this
 * correction exists to keep out. So the server snapshot is `null`, the panel
 * renders nothing for it, and the first client render supplies the truth. Being
 * one frame late with an inspector is the cheap failure; shipping an editing
 * surface nobody approved is not.
 *
 * `useSyncExternalStore` is what makes that safe rather than a hydration
 * mismatch: React renders the server snapshot during hydration and re-reads the
 * client one immediately after, by design.
 *
 * ## Why `innerWidth` and not `matchMedia`
 *
 * The tier is a three-way answer, so `matchMedia` would need two query objects
 * and two listeners to compute what one width already gives. The snapshot is a
 * string, so a resize that does not cross a breakpoint is `Object.is`-equal and
 * re-renders nothing.
 */
import { useSyncExternalStore } from 'react';

import { studioTierFor, type StudioViewportTier } from '../model/studio-responsive';

/**
 * The last observed tier.
 *
 * `getSnapshot` runs during render, more than once per render, and on **every**
 * render of the panel — which includes every frame of an `APP3-S03` transform
 * gesture, because a gesture commits the working document per frame. Reading
 * `window.innerWidth` there asks the engine for a geometric fact, and an engine
 * with a hundred elements' worth of pending layout has to flush that layout
 * before it can answer. Measured on `APP3-S03`'s own benchmark, that put WebKit
 * resize p95 at 28 ms against the 20 ms budget of `ADR-APP0-001` §6.
 *
 * So the width is read where a width legitimately changes — at subscription and
 * on a resize event — and never during render. The snapshot is a string, so a
 * resize that does not cross a breakpoint re-renders nothing either.
 */
let observed: StudioViewportTier | null = null;

function subscribe(onChange: () => void): () => void {
  const measure = () => {
    observed = studioTierFor(window.innerWidth);
    onChange();
  };
  // Fresh at mount. React re-reads the snapshot straight after subscribing, so
  // a viewport that changed before this hook existed is picked up here rather
  // than being served stale from a previous mount's measurement.
  observed = studioTierFor(window.innerWidth);
  window.addEventListener('resize', measure);
  return () => {
    window.removeEventListener('resize', measure);
  };
}

function clientTier(): StudioViewportTier {
  // Never a layout read. Before the first subscription there is nothing
  // observed yet, and one measurement is taken to answer this render.
  observed ??= studioTierFor(window.innerWidth);
  return observed;
}

function serverTier(): null {
  return null;
}

/** The current tier, or `null` before a viewport has been observed. */
export function useStudioViewportTier(): StudioViewportTier | null {
  return useSyncExternalStore(subscribe, clientTier, serverTier);
}
