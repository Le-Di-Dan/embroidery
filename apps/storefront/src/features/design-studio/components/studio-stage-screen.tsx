'use client';

import { useEffect, useMemo, useRef } from 'react';

import type {
  DesignSessionScopeResponse,
  DesignSessionSnapshotResponse,
} from '@embroidery/api-client';
import { rectToBounds } from '@embroidery/design-engine';

import { useSideBackground } from '../hooks/use-side-background';
import { useStudioAutosave } from '../hooks/use-studio-autosave';
import { useStudioHistory } from '../hooks/use-studio-history';
import { useStudioHistoryShortcuts } from '../hooks/use-studio-history-shortcuts';
import { useStudioImage } from '../hooks/use-studio-image';
import { useStudioImageMedia } from '../hooks/use-studio-image-media';
import { useStudioLayers } from '../hooks/use-studio-layers';
import { useStudioUnsavedWarning } from '../hooks/use-studio-unsaved-warning';
import { useStudioWatermarkToken } from '../hooks/use-studio-watermark-token';
import { useStudioTransform } from '../hooks/use-studio-transform';
import { hasUnsavedWork } from '../model/studio-autosave';
import { STUDIO_STAGE_COPY } from '../model/studio-stage-copy';
import { imageElementOf } from '../model/studio-image-placement';
import { sessionKeyOf } from '../model/studio-session-key';
import type { StudioAreaLimits } from '../model/studio-transform-authority';
import { zoomAt } from '../model/studio-viewport';
import {
  buildRenderableScene,
  resolveRenderableElement,
  type StudioSceneMemo,
} from '../renderer/studio-scene';
import { useStudioDocumentStore } from '../store/studio-document.store';
import { useStudioInteractionStore } from '../store/studio-interaction.store';
import { useStudioViewportStore } from '../store/studio-viewport.store';
import { StudioHistoryRail } from './studio-history-rail';
import { StudioSaveState } from './studio-save-state';
import { StudioSessionPanel } from './studio-session-panel';
import { StudioStageTopbar } from './studio-stage-topbar';
import { StudioStage } from './studio-stage';
import { StudioStageBackgroundNotice } from './studio-stage-background-notice';
import { StudioStageControls } from './studio-stage-controls';
import { StudioStageStatus } from './studio-stage-status';
import { StudioStageWatermark, StudioWatermarkNotice } from './studio-stage-watermark';
import { StudioStageUnavailable } from './studio-stage-unavailable';
import { StudioStageViewport } from './studio-stage-viewport';
import { StudioStagePanels } from './studio-stage-panels';
import { StudioTransformOverlay } from './studio-transform-overlay';

export interface StudioStageScreenProps {
  readonly snapshot: DesignSessionSnapshotResponse;
  /**
   * The placement `APP3-B07` resolved when the Session was opened.
   *
   * Session scope, never the picker's. A later change to the pre-bootstrap Side
   * or Area selection cannot retarget an open Session, because nothing on this
   * screen can see that selection.
   */
  readonly scope: DesignSessionScopeResponse | null;
  /**
   * The Embroidery Area's physical maxima, captured when the Session opened. The
   * scope carries no `maxWidthMm`/`maxHeightMm` and `APP3-P02` needs them, so
   * they come from the manifest `APP3-S01` already fetched — no new API — and are
   * passed as a value, so a later reconcile cannot change them under an open
   * Session.
   */
  readonly areaLimits: StudioAreaLimits | null;
  readonly isResuming: boolean;
  readonly onResume: () => void;
  /**
   * The display name of the Template this Session was cloned from, or `null`.
   * Presentation only, from data `APP3-S01` already holds — no request is made
   * for it, and it reaches one history row and nothing else: never the document,
   * the hash or a save.
   */
  readonly templateName: string | null;
  /**
   * The Session was refused as no longer valid, mid-edit (`APP3-S10`). Raised by
   * the autosave loop; the screen above owns what replaces the Studio. Nothing
   * here decides a Session is dead, and nothing here tries to revive one.
   */
  readonly onExpired: () => void;
}

/**
 * The Studio stage screen (`APP3-S02`, extended by `APP3-S07` and `APP3-S03`).
 *
 * The chain still runs in one direction: the canonical Session snapshot arrives,
 * `APP3-P01` decides whether its document can be read, `APP3-P02` decides where
 * everything lands, the adapter turns both into a scene, and the stage draws it.
 * `APP3-S03` put a **working document** at the front of it and `APP3-S08` a
 * bounded past and future beside that — not a second scene.
 *
 * `APP3-S10` adds the other direction: a saved document can come **back** —
 * canonicalized by the server, replaced by a resume, or replaced by the customer
 * choosing the server's version after a conflict. All three arrive through the
 * store's server-origin seams, so there is still one current document and none
 * of them is a history entry.
 */
export function StudioStageScreen({
  snapshot,
  scope,
  areaLimits,
  isResuming,
  onResume,
  templateName,
  onExpired,
}: StudioStageScreenProps) {
  const workingDocument = useStudioDocumentStore((state) => state.document);
  const initializeDocument = useStudioDocumentStore((state) => state.initialize);
  const commitDocument = useStudioDocumentStore((state) => state.commit);

  const sessionKey = sessionKeyOf(snapshot.sessionId, snapshot.revision);
  useEffect(() => {
    initializeDocument(sessionKey, snapshot.document);
  }, [initializeDocument, sessionKey, snapshot.document]);

  // The snapshot until the working document exists, and the working document
  // from then on. One scene, one source; the memo depends on the document alone,
  // never on the viewport, which would rebuild the adapter on every zoom step.
  const stageDocument = workingDocument ?? snapshot.document;

  /*
   * The previous successful build, offered back to the adapter (`APP3-S03-C1`).
   *
   * A cache, not a second document: the adapter validates the incoming payload
   * exactly as before and uses this only to keep the *instances* of elements
   * whose values are unchanged, so React skips the ninety-nine subtrees a
   * one-element drag does not touch. Reuse is by value equality, so a scene left
   * by a discarded render is at worst an equal answer.
   */
  const sceneMemo = useRef<StudioSceneMemo | null>(null);
  const result = useMemo(
    () => buildRenderableScene(stageDocument, sceneMemo.current),
    [stageDocument],
  );
  if (result.ok && sceneMemo.current?.scene !== result.scene) {
    sceneMemo.current = { document: result.document, scene: result.scene };
  }

  // The document and graph the scene was actually built from — one of each per
  // frame, shared by the transform chrome and the physical read-out, which each
  // used to build their own and resolved the parent graph three times a frame.
  const sceneDocument = result.ok ? result.document : null;
  const graph = result.ok ? result.graph : null;

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
  // it — by a resume, a conflict resolution, or a document this build stops
  // being able to read. An id pointing at nothing must resolve to no selection
  // rather than a stale outline, so this runs against every scene.
  useEffect(() => {
    reconcileSelection(presentIds);
  }, [presentIds, reconcileSelection]);

  // Runtime selection is released when the stage goes away: interaction state,
  // not a saved preference, and the store outlives this mount.
  useEffect(() => clearSelection, [clearSelection]);

  // The viewport belongs to one canvas: a zoom and pan carried into a different
  // Session would point the camera at coordinates that mean something else, so
  // the Session's identity — not the mount — is what resets it.
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
  // Hidden and locked elements keep their geometry and z-order, and neither may
  // be transformed. Unlocking is `APP3-S04`'s.
  const transformable =
    selected !== undefined && selected.visible && !selected.element.locked ? selected : undefined;

  // One set of inspector inputs, read by both slots: giving each its own prop
  // list would let the topbar and the body drift apart on what they edit.
  const textPanel = {
    commit: commitDocument,
    document: sceneDocument,
    elementId: selectedElementId,
    limits: areaLimits,
    scope,
  };

  /*
   * Every capability controller is owned **here**, above the viewport tier.
   * Crossing a breakpoint swaps a panel's two mounts, and a controller owned by a
   * panel goes with it: `APP3-S06` lost the Session revision that way and
   * `APP3-B06B` refused the next upload `409 CONFLICT`. The same discard would
   * take the undo stack and, since `APP3-S10`, an in-flight save.
   */
  const selectedImage = imageElementOf(sceneDocument, selectedElementId);
  const replaceableImage =
    selectedImage !== undefined && selectedImage.visible && !selectedImage.locked;
  const image = useStudioImage({
    sessionId: snapshot.sessionId,
    revision: snapshot.revision,
    document: sceneDocument,
    scope,
    limits: areaLimits,
    replacingElementId: replaceableImage ? selectedElementId : null,
    commit: commitDocument,
    onPlaced: selectElement,
  });

  const imagePanel = {
    image,
    replaceable: replaceableImage,
    sessionId: snapshot.sessionId,
  };

  // The bytes for every image the working document places (`APP3-S06`). Driven
  // by the *scene's* document, so a just-added image is fetched immediately and
  // a replaced one stops being fetched at once; keyed by derivative, so the
  // previous object URL is revoked by the hook's own cleanup.
  const imageMedia = useStudioImageMedia(snapshot.sessionId, sceneDocument);

  // Minted once per Studio runtime, never persisted, never sent (`APP3-S09`).
  const watermarkToken = useStudioWatermarkToken();
  /*
   * The history capability's controller (`APP3-S08`). It reads the past and
   * future from the same store that holds the one working document, so an undo
   * cannot produce a second answer to "what is on the stage". The keyboard path
   * is bound once, on the window, and stands down for editable fields.
   *
   * `APP3-B07` sets lineage only on a clone, which is what the baseline row
   * asks. The slug and version travelling with it are not names.
   */
  const history = useStudioHistory({ cloned: snapshot.lineage !== undefined, templateName });
  useStudioHistoryShortcuts({ undo: history.undo, redo: history.redo });

  /*
   * The autosave loop (`APP3-S10`), owned here for the same reason every other
   * controller is: a loop owned by a panel would be discarded — with its
   * in-flight request, its revision and its conflict — the first time the
   * customer rotated a tablet.
   *
   * It starts from the snapshot's revision and uses only revisions the server
   * returned afterwards. Undo and redo reach it as document mutations, because
   * that is what they are.
   */
  const save = useStudioAutosave({
    sessionId: snapshot.sessionId,
    revision: snapshot.revision,
    onExpired,
  });
  useStudioUnsavedWarning(hasUnsavedWork(save.state));

  // The layer capability's controller (`APP3-S04`). It reads the scene's
  // document and the graph the scene already resolved — never a second graph.
  const layers = useStudioLayers({
    clearSelection,
    commit: commitDocument,
    document: sceneDocument,
    graph,
    select: selectElement,
    selectedElementId,
  });

  return (
    <div className="studio-stage">
      <StudioSessionPanel isResuming={isResuming} onResume={onResume} snapshot={snapshot} />

      {result.ok ? (
        <section className="studio-stage__frame" aria-label={STUDIO_STAGE_COPY.stageLabel}>
          {/* The persistent left tool rail (`609:147`, `618:140`), first child so
              the keyboard reaches it in the order the eye does. */}
          <StudioHistoryRail
            canRedo={history.canRedo}
            canUndo={history.canUndo}
            redo={history.redo}
            undo={history.undo}
          />

          {/* The one Studio topbar (`APP3-S05-MI01`, shared by `APP3-S10`): the
              save chip at every tier, and at 1024 the one drawer trigger. */}
          <StudioStageTopbar save={save}>
            <StudioStagePanels
              region="topbar"
              history={history}
              image={imagePanel}
              layers={layers}
              text={textPanel}
            />
          </StudioStageTopbar>

          {/* What the save is doing, and any decision the customer owes
              (`APP3-S10`). Above the stage at every tier, never inside the
              drawer: a choice about losing work may not be behind a toggle. */}
          <StudioSaveState save={save} />

          <StudioStageBackgroundNotice background={background} hasScope={scope !== null} />

          {/* Hiding the safe area withholds the rectangle from the paint and
              nothing else. The watermark (`APP3-S09`) rides the viewport box, not
              the transformed layer, and is not in the document. */}
          <StudioStageViewport overlay={<StudioStageWatermark token={watermarkToken} />}>
            <div className="studio-stage__scene">
              <StudioStage
                area={safeAreaVisible ? area : null}
                backgroundUrl={background.objectUrl}
                media={imageMedia.media}
                onClearSelection={clearSelection}
                onSelect={selectElement}
                scene={result.scene}
                selectedElementId={selectedElementId}
              />

              {transformable === undefined ||
              scope === null ||
              sceneDocument === null ||
              graph === null ? null : (
                <StudioTransformOverlay
                  document={sceneDocument}
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

          {/* The policy note (`609:371`), as real text beside the stage. */}
          <StudioWatermarkNotice />

          {/* The capability panels (`APP3-S05`, `S06`, `S04`, `S08`). The tablet
              composition renders them in the topbar region above, so this one is
              empty there. */}
          <StudioStagePanels
            region="body"
            history={history}
            image={imagePanel}
            layers={layers}
            text={textPanel}
          />

          {result.scene.elements.length === 0 ? (
            <p className="studio-stage__empty" data-testid="studio-stage-empty" role="status">
              {STUDIO_STAGE_COPY.empty}
              <span className="studio-stage__hint">{STUDIO_STAGE_COPY.emptyHint}</span>
            </p>
          ) : null}

          <StudioStageStatus
            document={sceneDocument}
            graph={graph}
            refusal={transform.refusal}
            scope={scope}
            selected={selected}
            transformable={transformable}
          />
        </section>
      ) : (
        <StudioStageUnavailable failure={result.failure} />
      )}
    </div>
  );
}
