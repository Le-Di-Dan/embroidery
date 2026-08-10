'use client';

import { useEffect, useMemo, useRef } from 'react';

import type {
  DesignSessionScopeResponse,
  DesignSessionSnapshotResponse,
} from '@embroidery/api-client';
import { buildElementGraph, rectToBounds } from '@embroidery/design-engine';

import { useSideBackground } from '../hooks/use-side-background';
import { useStudioTransform } from '../hooks/use-studio-transform';
import { STUDIO_STAGE_COPY } from '../model/studio-stage-copy';
import { sessionKeyOf } from '../model/studio-session-key';
import { elementLabel } from '../model/studio-stage-label';
import type { StudioAreaLimits, TransformRefusal } from '../model/studio-transform-authority';
import { STUDIO_TRANSFORM_COPY } from '../model/studio-transform-copy';
import { zoomAt } from '../model/studio-viewport';
import { buildRenderableScene, resolveRenderableElement } from '../renderer/studio-scene';
import { useStudioDocumentStore } from '../store/studio-document.store';
import { useStudioInteractionStore } from '../store/studio-interaction.store';
import { useStudioViewportStore } from '../store/studio-viewport.store';
import { StudioSessionPanel } from './studio-session-panel';
import { StudioStage } from './studio-stage';
import { StudioStageBackgroundNotice } from './studio-stage-background-notice';
import { StudioStageControls } from './studio-stage-controls';
import { StudioStageUnavailable } from './studio-stage-unavailable';
import { StudioStageViewport } from './studio-stage-viewport';
import { StudioTransformOverlay, physicalSizeLabel } from './studio-transform-overlay';

export interface StudioStageScreenProps {
  readonly snapshot: DesignSessionSnapshotResponse;
  /**
   * The placement `APP3-B07` resolved when the Session was opened.
   *
   * Session scope, never the picker's. Once a Session exists its placement is
   * fixed, so a later change to the pre-bootstrap Side or Area selection must
   * not retarget an open Session — and it cannot, because nothing on this
   * screen can see that selection.
   */
  readonly scope: DesignSessionScopeResponse | null;
  /**
   * The Embroidery Area's physical maxima, captured when the Session opened.
   *
   * The Session scope carries the safe-area rectangle and the Side's `pxPerMm`
   * but not `maxWidthMm`/`maxHeightMm`, and `APP3-P02` needs them to rule on
   * physical size. They come from the public placement manifest `APP3-S01`
   * already fetched — no new API — and are passed as a value rather than read
   * live, so a later manifest reconcile cannot change the limits under an open
   * Session.
   */
  readonly areaLimits: StudioAreaLimits | null;
  readonly isResuming: boolean;
  readonly onResume: () => void;
}

/**
 * The Studio stage screen (`APP3-S02`, extended by `APP3-S07` and `APP3-S03`).
 *
 * The chain is unchanged and still runs in one direction: the canonical Session
 * snapshot arrives, `APP3-P01` decides whether its document can be read,
 * `APP3-P02` decides where everything lands, the adapter turns both into a
 * scene, and the stage draws it.
 *
 * `APP3-S03` adds one thing to the front of that chain — a **working document**.
 * It is initialized once from the snapshot and is what the renderer consumes
 * from then on, so there is exactly one answer to "what is on the stage". The
 * server snapshot stays an immutable baseline for `APP3-S10`; it never competes
 * as a second editable scene.
 *
 * Nothing here saves. There is no autosave timer, no `publicDesignSessionAutosave`
 * call and no saving/saved indicator: `APP3-S10` owns persistence, and `S08`
 * owns history.
 */
export function StudioStageScreen({
  snapshot,
  scope,
  areaLimits,
  isResuming,
  onResume,
}: StudioStageScreenProps) {
  const workingDocument = useStudioDocumentStore((state) => state.document);
  const initializeDocument = useStudioDocumentStore((state) => state.initialize);

  const sessionKey = sessionKeyOf(snapshot.sessionId, snapshot.revision);
  useEffect(() => {
    initializeDocument(sessionKey, snapshot.document);
  }, [initializeDocument, sessionKey, snapshot.document]);

  // The snapshot until the working document exists, and the working document
  // from then on. One scene, one source, and the memo depends on the document
  // alone — never on the viewport, which would rebuild the whole adapter on
  // every zoom step.
  const stageDocument = workingDocument ?? snapshot.document;
  const result = useMemo(() => buildRenderableScene(stageDocument), [stageDocument]);
  // One graph per document, shared by the transform chrome and the read-out.
  // Each of them used to build its own, so a hundred-element scene resolved the
  // parent graph three times a frame for no new information.
  const graph = useMemo(() => buildElementGraph(stageDocument), [stageDocument]);

  const background = useSideBackground(
    scope === null ? undefined : { productSlug: scope.productSlug, sideCode: scope.sideCode },
  );

  const selectedElementId = useStudioInteractionStore((state) => state.selectedElementId);
  const selectElement = useStudioInteractionStore((state) => state.selectElement);
  const clearSelection = useStudioInteractionStore((state) => state.clearSelection);
  const reconcileSelection = useStudioInteractionStore((state) => state.reconcileSelection);

  const safeAreaVisible = useStudioViewportStore((state) => state.safeAreaVisible);
  const resetViewport = useStudioViewportStore((state) => state.resetViewport);
  const zoomStep = useStudioViewportStore((state) => state.zoomStep);

  const overlayRef = useRef<HTMLDivElement | null>(null);
  const transform = useStudioTransform({
    document: workingDocument,
    elementId: selectedElementId,
    scope,
    limits: areaLimits,
    zoom: zoomAt(zoomStep),
    overlay: overlayRef,
  });

  const presentIds = useMemo(
    () => (result.ok ? result.scene.elements.map((renderable) => renderable.id) : []),
    [result],
  );

  // A selection is a reference into a document that can be replaced underneath
  // it — by a resume, or by a document this build stops being able to read. An
  // id pointing at nothing must resolve to no selection rather than to a stale
  // outline, so this runs against every scene rather than only the first.
  useEffect(() => {
    reconcileSelection(presentIds);
  }, [presentIds, reconcileSelection]);

  // Runtime selection is released when the stage goes away. It is interaction
  // state, not a saved preference, and the store outlives this mount.
  useEffect(() => clearSelection, [clearSelection]);

  // The viewport belongs to one canvas. A zoom and pan carried into a different
  // Session would point the camera at coordinates that mean something else
  // there, so the identity of the Session — not the mount — is what resets it.
  useEffect(() => {
    resetViewport();
  }, [resetViewport, snapshot.sessionId]);

  const area =
    scope === null
      ? null
      : rectToBounds({
          x: scope.boundXPx,
          y: scope.boundYPx,
          width: scope.boundWidthPx,
          height: scope.boundHeightPx,
        });

  const selected = result.ok
    ? resolveRenderableElement(result.scene, selectedElementId)
    : undefined;
  // Hidden and locked elements keep their geometry and their place in z-order,
  // and neither may be transformed. Unlocking is `APP3-S04`'s.
  const transformable =
    selected !== undefined && selected.visible && !selected.element.locked ? selected : undefined;

  return (
    <div className="studio-stage">
      <StudioSessionPanel isResuming={isResuming} onResume={onResume} snapshot={snapshot} />

      {result.ok ? (
        <section className="studio-stage__frame" aria-label={STUDIO_STAGE_COPY.stageLabel}>
          <StudioStageBackgroundNotice background={background} hasScope={scope !== null} />

          {/*
            Hiding the safe area withholds the rectangle from the paint, and
            does nothing else: `area` is the same `rectToBounds` answer either
            way, and the Session scope, the document placement and the persisted
            geometry are untouched.
          */}
          <StudioStageViewport>
            <div className="studio-stage__scene">
              <StudioStage
                area={safeAreaVisible ? area : null}
                backgroundUrl={background.objectUrl}
                onClearSelection={clearSelection}
                onSelect={selectElement}
                scene={result.scene}
                selectedElementId={selectedElementId}
              />

              {transformable === undefined || scope === null ? null : (
                <StudioTransformOverlay
                  document={stageDocument}
                  elementId={transformable.id}
                  graph={graph}
                  overlayRef={overlayRef}
                  transform={transform}
                  zoom={zoomAt(zoomStep)}
                />
              )}
            </div>
          </StudioStageViewport>

          <StudioStageControls />

          {result.scene.elements.length === 0 ? (
            <p className="studio-stage__empty" data-testid="studio-stage-empty" role="status">
              {STUDIO_STAGE_COPY.empty}
              <span className="studio-stage__hint">{STUDIO_STAGE_COPY.emptyHint}</span>
            </p>
          ) : null}

          {/*
            Selection, physical size and any refusal, all in text. A coloured
            rectangle is invisible to a screen reader, a millimetre value cannot
            be inferred from how large something looks, and a refusal that only
            manifested as "the element stopped moving" would read as a bug.
          */}
          <p className="studio-stage__selection-status" role="status">
            {selected === undefined
              ? STUDIO_STAGE_COPY.selectionNone
              : `${STUDIO_STAGE_COPY.selectionPrefix}: ${elementLabel(selected.element)}`}
            {transformable === undefined ? null : (
              <span className="studio-stage__hint" data-testid="studio-transform-size">
                {scope === null
                  ? STUDIO_TRANSFORM_COPY.physicalSizeUnavailable
                  : physicalSizeLabel(stageDocument, transformable.id, scope.pxPerMm, graph)}
              </span>
            )}
            {selected !== undefined && selected.element.locked ? (
              <span className="studio-stage__hint" data-testid="studio-transform-locked">
                {STUDIO_TRANSFORM_COPY.lockedElement}
              </span>
            ) : null}
          </p>

          {transform.refusal === null ? null : (
            <p
              className="studio-stage__refusal"
              role="alert"
              data-testid="studio-transform-refusal"
            >
              {refusalCopy(transform.refusal)}
            </p>
          )}
        </section>
      ) : (
        <StudioStageUnavailable failure={result.failure} />
      )}
    </div>
  );
}

function refusalCopy(refusal: TransformRefusal): string {
  switch (refusal) {
    case 'outside-embroidery-area':
      return STUDIO_TRANSFORM_COPY.outsideArea;
    case 'too-large-for-area':
      return STUDIO_TRANSFORM_COPY.tooLarge;
    default:
      return STUDIO_TRANSFORM_COPY.unreadable;
  }
}
