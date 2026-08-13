'use client';

import { useEffect, useMemo, useRef } from 'react';

import type {
  DesignSessionScopeResponse,
  DesignSessionSnapshotResponse,
} from '@embroidery/api-client';
import { rectToBounds } from '@embroidery/design-engine';

import { useSideBackground } from '../hooks/use-side-background';
import { useStudioAutosave } from '../hooks/use-studio-autosave';
import { useStudioMobileSheets } from '../hooks/use-studio-mobile-sheets';
import { useStudioTouchGestures } from '../hooks/use-studio-touch-gestures';
import { useStudioViewportTier } from '../hooks/use-studio-viewport-tier';
import { useStudioHistory } from '../hooks/use-studio-history';
import { useStudioHistoryShortcuts } from '../hooks/use-studio-history-shortcuts';
import { useStudioImage } from '../hooks/use-studio-image';
import { useStudioImageMedia } from '../hooks/use-studio-image-media';
import { useStudioLayers } from '../hooks/use-studio-layers';
import { useStudioSessionRevision } from '../hooks/use-studio-session-revision';
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
import { StudioMobileSurface } from './studio-mobile-surface';
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
   * The placement `APP3-B07` resolved when the Session was opened. Session
   * scope, never the picker's: a later change to the pre-bootstrap Side or Area
   * selection cannot retarget an open Session, because nothing here sees it.
   */
  readonly scope: DesignSessionScopeResponse | null;
  /**
   * The Embroidery Area's physical maxima, captured when the Session opened. The
   * scope carries none and `APP3-P02` needs them, so they come from the manifest
   * `APP3-S01` already fetched — no new API — as a value, so a later reconcile
   * cannot change them under an open Session.
   */
  readonly areaLimits: StudioAreaLimits | null;
  readonly isResuming: boolean;
  readonly onResume: () => void;
  /**
   * The Template this Session was cloned from, or `null`. Presentation only,
   * from data `APP3-S01` already holds: it reaches one history row and nothing
   * else — never the document, the hash or a save.
   */
  readonly templateName: string | null;
  /**
   * The Session was refused as no longer valid, mid-edit (`APP3-S10`). Raised by
   * the autosave loop; the screen above owns what replaces the Studio.
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
 * canonicalized, resumed, or chosen over the local one after a conflict. All
 * three arrive through the store's server-origin seams, so there is still one
 * current document and none of them is a history entry.
 *
 * `APP3-S11` adds a third way in and not a fourth chain: a finger reaches the
 * same `APP3-S03` gesture the mouse does, and the mobile sheets drive the same
 * controllers. What is new is arbitration and a composition.
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

  // The snapshot until the working document exists, then the working document.
  // The memo depends on the document alone, never on the viewport.
  const stageDocument = workingDocument ?? snapshot.document;

  // The previous successful build, offered back to the adapter (`APP3-S03-C1`).
  // A cache, not a second document: it keeps the *instances* of unchanged
  // elements, so React skips the subtrees a one-element drag does not touch.
  const sceneMemo = useRef<StudioSceneMemo | null>(null);
  const result = useMemo(
    () => buildRenderableScene(stageDocument, sceneMemo.current),
    [stageDocument],
  );
  if (result.ok && sceneMemo.current?.scene !== result.scene) {
    sceneMemo.current = { document: result.document, scene: result.scene };
  }

  // The document and graph the scene was built from — one of each per frame,
  // shared by the chrome, the read-out and the mobile sheets.
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

  // The composition this viewport gets (`APP3-S11`), read here because two
  // things above the panels depend on it: whether a touch may drive a
  // transform, and where the conflict decision is drawn.
  const tier = useStudioViewportTier();
  const mobile = tier === 'mobile';
  const sheets = useStudioMobileSheets();

  const overlayRef = useRef<HTMLDivElement | null>(null);
  const transform = useStudioTransform({
    document: workingDocument,
    elementId: selectedElementId,
    scope,
    limits: areaLimits,
    zoom: zoomAt(zoomStep),
    overlay: overlayRef,
    touch: mobile,
  });
  // One finger is the design, two are the camera (`610:242`).
  const touch = useStudioTouchGestures({ enabled: mobile, transform });

  const presentIds = useMemo(
    () => (result.ok ? result.scene.elements.map((renderable) => renderable.id) : []),
    [result],
  );

  // A selection is a reference into a document that can be replaced underneath
  // it, so an id pointing at nothing must resolve to no selection.
  useEffect(() => {
    reconcileSelection(presentIds);
  }, [presentIds, reconcileSelection]);

  // Runtime selection is released when the stage goes away; the store outlives it.
  useEffect(() => clearSelection, [clearSelection]);

  // The viewport belongs to one canvas: a zoom carried into a different Session
  // would point the camera at coordinates that mean something else there.
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
  // Hidden and locked elements may not be transformed. Unlocking is `APP3-S04`'s.
  const transformable =
    selected !== undefined && selected.visible && !selected.element.locked ? selected : undefined;

  // One set of inspector inputs, read by every slot and by the mobile sheets.
  const textPanel = {
    commit: commitDocument,
    document: sceneDocument,
    elementId: selectedElementId,
    limits: areaLimits,
    scope,
  };

  // Every capability controller is owned **here**, above the viewport tier.
  // Crossing a breakpoint swaps a panel's mounts, and a controller owned by a
  // panel goes with it: `APP3-S06` lost the Session revision that way and the
  // next upload was refused `409 CONFLICT`. The same discard would take the undo
  // stack, an in-flight save, and now an open sheet.
  // Both Session mutations are compare-and-set on the same number, so exactly
  // one thing here knows it (`APP3-E01-C1`). While each capability kept its own
  // copy, an upload advanced the Session and the next autosave still presented
  // the pre-upload revision — a `409`, and a conflict shown to a customer who
  // had one tab open (`FU-APP3-UPLOAD-REVISION-SEAM-01`).
  const sessionRevision = useStudioSessionRevision(snapshot.sessionId, snapshot.revision);

  const selectedImage = imageElementOf(sceneDocument, selectedElementId);
  const replaceableImage =
    selectedImage !== undefined && selectedImage.visible && !selectedImage.locked;
  const image = useStudioImage({
    sessionId: snapshot.sessionId,
    sessionRevision,
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

  // The bytes for every image the working document places (`APP3-S06`), keyed
  // by derivative so the previous object URL is revoked by the hook's cleanup.
  const imageMedia = useStudioImageMedia(snapshot.sessionId, sceneDocument);

  // Minted once per Studio runtime, never persisted, never sent (`APP3-S09`).
  const watermarkToken = useStudioWatermarkToken();
  // The history controller (`APP3-S08`), reading the past and future from the
  // store that holds the one working document. One controller, three surfaces.
  const history = useStudioHistory({ cloned: snapshot.lineage !== undefined, templateName });
  useStudioHistoryShortcuts({ undo: history.undo, redo: history.redo });

  // The autosave loop (`APP3-S10`), owned here for the same reason: a loop owned
  // by a panel would be discarded — with its in-flight request, its revision and
  // its conflict — the first time the customer rotated a tablet.
  const save = useStudioAutosave({
    sessionId: snapshot.sessionId,
    revision: snapshot.revision,
    sessionRevision,
    onExpired,
  });
  useStudioUnsavedWarning(hasUnsavedWork(save.state));

  // The layer controller (`APP3-S04`), reading the graph the scene resolved.
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
              the keyboard reaches it in the order the eye does. Nothing at 390. */}
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
              drawer: a choice about losing work may not be behind a toggle. At
              390 the conflict half of it is drawn by `610:514` instead. */}
          <StudioSaveState save={save} suppressConflict={mobile} />

          <StudioStageBackgroundNotice background={background} hasScope={scope !== null} />

          {/* The watermark (`APP3-S09`) rides the viewport box, not the
              transformed layer, and is not in the document. */}
          <StudioStageViewport
            overlay={<StudioStageWatermark token={watermarkToken} />}
            touch={mobile ? touch : undefined}
          >
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
                  onOpenSheet={
                    mobile
                      ? () => {
                          sheets.show('transform');
                        }
                      : undefined
                  }
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

          {/* The capability panels. The tablet composition renders them in the
              topbar region above, and the mobile one in its sheets below. */}
          <StudioStagePanels
            region="body"
            history={history}
            image={imagePanel}
            layers={layers}
            text={textPanel}
          />

          {/* The 390 composition (`APP3-S11`), mounted only at this tier. */}
          {mobile ? (
            <StudioMobileSurface
              graph={graph}
              history={history}
              image={imagePanel}
              layers={layers}
              save={save}
              sheets={sheets}
              text={textPanel}
            />
          ) : null}

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
