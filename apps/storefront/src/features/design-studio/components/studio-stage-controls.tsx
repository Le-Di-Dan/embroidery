'use client';

import { STUDIO_VIEWPORT_COPY } from '../model/studio-viewport-copy';
import { FIT_STEP, canZoomIn, canZoomOut, zoomPercent } from '../model/studio-viewport';
import { useStudioViewportStore } from '../store/studio-viewport.store';

/**
 * The Studio viewport controls (`APP3-S07`).
 *
 * Exactly the controls the approved design draws — `FIG-STUDIO-ZOOM-DESKTOP-FIT`
 * (`609:3`), `-ZOOMED` (`609:51`) and `-SAFEAREAHIDDEN` (`609:99`) — and nothing
 * else. There is no slider, no zoom preset menu and no separate reset, because
 * the design contains none of those and a control that is not drawn is a
 * capability nobody approved.
 *
 * Every button is a real `<button>` with a real label. An icon-only control with
 * no accessible name is unusable by anyone who cannot see the icon, and the
 * disabled ends of the zoom range are exposed as `disabled` rather than as a
 * button that silently does nothing when pressed. The zoom level is stated in
 * text, so it can be read aloud instead of being inferred from how big the
 * artwork looks.
 *
 * Nothing here saves. Zoom, pan, fit and the safe-area toggle are runtime state
 * (`ADR-APP0-001`), so none of these handlers calls the API, touches the Design
 * Document or increments a revision.
 */
export function StudioStageControls() {
  const zoomStep = useStudioViewportStore((state) => state.zoomStep);
  const safeAreaVisible = useStudioViewportStore((state) => state.safeAreaVisible);
  const zoomIn = useStudioViewportStore((state) => state.zoomIn);
  const zoomOut = useStudioViewportStore((state) => state.zoomOut);
  const fitViewport = useStudioViewportStore((state) => state.fitViewport);
  const toggleSafeArea = useStudioViewportStore((state) => state.toggleSafeArea);

  return (
    <div
      className="studio-stage__controls"
      role="group"
      aria-label={STUDIO_VIEWPORT_COPY.toolbarLabel}
      data-testid="studio-stage-controls"
    >
      <button
        type="button"
        className="studio-stage__control"
        onClick={zoomOut}
        disabled={!canZoomOut(zoomStep)}
        data-testid="studio-zoom-out"
      >
        {STUDIO_VIEWPORT_COPY.zoomOut}
      </button>

      <span className="studio-stage__zoom-value" role="status" data-testid="studio-zoom-value">
        {STUDIO_VIEWPORT_COPY.zoomValue(zoomPercent(zoomStep))}
      </span>

      <button
        type="button"
        className="studio-stage__control"
        onClick={zoomIn}
        disabled={!canZoomIn(zoomStep)}
        data-testid="studio-zoom-in"
      >
        {STUDIO_VIEWPORT_COPY.zoomIn}
      </button>

      <button
        type="button"
        className="studio-stage__control"
        onClick={fitViewport}
        disabled={zoomStep === FIT_STEP}
        title={STUDIO_VIEWPORT_COPY.fitHint}
        data-testid="studio-zoom-fit"
      >
        {STUDIO_VIEWPORT_COPY.fit}
      </button>

      {/*
        A toggle, not two buttons: `aria-pressed` carries the current state, so
        the safe area's visibility is available to assistive technology rather
        than only to whoever can see whether a dashed rectangle is on screen.
      */}
      <button
        type="button"
        className="studio-stage__control"
        onClick={toggleSafeArea}
        aria-pressed={safeAreaVisible}
        data-testid="studio-safe-area-toggle"
      >
        {safeAreaVisible ? STUDIO_VIEWPORT_COPY.safeAreaHide : STUDIO_VIEWPORT_COPY.safeAreaShow}
      </button>

      {safeAreaVisible ? (
        <span className="studio-stage__legend" data-testid="studio-safe-area-legend">
          {STUDIO_VIEWPORT_COPY.safeAreaLegend}
        </span>
      ) : null}
    </div>
  );
}
