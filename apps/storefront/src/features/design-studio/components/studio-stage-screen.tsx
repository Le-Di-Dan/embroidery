'use client';

import { useEffect, useMemo, useRef } from 'react';

import type {
  DesignSessionScopeResponse,
  DesignSessionSnapshotResponse,
} from '@embroidery/api-client';
import { rectToBounds } from '@embroidery/design-engine';

import { useSideBackground } from '../hooks/use-side-background';
import { useStudioImage } from '../hooks/use-studio-image';
import { useStudioImageMedia } from '../hooks/use-studio-image-media';
import { useStudioLayers } from '../hooks/use-studio-layers';
import { useStudioWatermarkToken } from '../hooks/use-studio-watermark-token';
import { useStudioTransform } from '../hooks/use-studio-transform';
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
import { StudioSessionPanel } from './studio-session-panel';
import { StudioStage } from './studio-stage';
import { StudioStageBackgroundNotice } from './studio-stage-background-notice';
import { StudioStageControls } from './studio-stage-controls';
import { StudioStageStatus } from './studio-stage-status';
import { StudioStageWatermark, StudioWatermarkNotice } from './studio-stage-watermark';
import { StudioStageUnavailable } from './studio-stage-unavailable';
import { StudioStageViewport } from './studio-stage-viewport';
import { StudioImagePanel } from './studio-image-panel';
import { StudioLayersPanel } from './studio-layers-panel';
import { StudioTextPanel } from './studio-text-panel';
import { StudioTransformOverlay } from './studio-transform-overlay';

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
  const commitDocument = useStudioDocumentStore((state) => state.commit);

  const sessionKey = sessionKeyOf(snapshot.sessionId, snapshot.revision);
  useEffect(() => {
    initializeDocument(sessionKey, snapshot.document);
  }, [initializeDocument, sessionKey, snapshot.document]);

  // The snapshot until the working document exists, and the working document
  // from then on. One scene, one source, and the memo depends on the document
  // alone — never on the viewport, which would rebuild the whole adapter on
  // every zoom step.
  const stageDocument = workingDocument ?? snapshot.document;

  /*
   * The previous successful build, offered back to the adapter (`APP3-S03-C1`).
   *
   * It is a cache, not a second document: the adapter validates the incoming
   * payload exactly as before and uses this only to keep the *instances* of
   * elements whose values are unchanged, so React can skip the ninety-nine
   * subtrees a one-element drag does not touch. A discarded render can leave a
   * scene here that was never shown, and that is harmless — reuse is decided by
   * value equality, so the worst case is reusing an equal answer.
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
  // frame, shared by the transform chrome and the physical read-out. Each of
  // them used to build its own graph, so a hundred-element scene resolved the
  // parent graph three times a frame for no new information.
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

  // One set of inspector inputs, read by both slots. The two mounts differ only
  // in where they sit in the frame; giving each its own prop list would let the
  // topbar and the body drift apart on what they are editing.
  const textPanel = {
    commit: commitDocument,
    document: sceneDocument,
    elementId: selectedElementId,
    limits: areaLimits,
    scope,
  };

  /*
   * The image capability's controller, owned **here** (`APP3-S06`).
   *
   * Above the viewport tier, deliberately. The tier decides which of the image
   * panel's two mounts renders, so crossing a breakpoint unmounts one and mounts
   * the other — and a controller owned by the inspector went with it, taking the
   * Session revision the last upload returned. The next upload then presented
   * the revision the Session was bootstrapped with, and `APP3-B06B` refused it
   * `409 CONFLICT`. A real browser found that; no unit test could, because none
   * of them changes viewport mid-session.
   *
   * It writes back through the same `commit` the transform and text capabilities
   * use, so there is still one answer to "what is on the stage".
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

  /*
   * The bytes for every image the working document places (`APP3-S06`).
   *
   * Driven by the *scene's* document rather than the snapshot's, so an image the
   * customer just added is fetched immediately and a replaced one stops being
   * fetched at once. The map is keyed by derivative, so replacing an image
   * addresses different bytes and the previous object URL is revoked by the
   * hook's own cleanup rather than lingering under a new media identity.
   */
  const imageMedia = useStudioImageMedia(snapshot.sessionId, sceneDocument);

  // Minted once per Studio runtime, never persisted, never sent (`APP3-S09`).
  const watermarkToken = useStudioWatermarkToken();

  /*
   * The layer capability's controller (`APP3-S04`), owned here for the same
   * reason the image controller is: the tier decides which of its two mounts
   * renders, so a controller owned by the panel would be discarded and rebuilt
   * on every breakpoint crossing. It reads the scene's document and the graph
   * the scene already resolved — never a second graph — and writes back through
   * the same `commit` every other capability uses.
   */
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
          {/*
            The Studio topbar (`APP3-S05-MI01`): a control region above the
            stage, which is where `APP3-D01-C1` puts the tablet inspector's
            toggle. It is a real first child rather than a reordered later one,
            so the keyboard reaches it in the order the eye does. Only the
            tablet composition puts anything here.
          */}
          <StudioTextPanel slot="topbar" {...textPanel}>
            {/* The tablet composition puts the image controls in the *same*
                inspector drawer (`APP3-S06` §7): one topbar, one trigger, one
                out-of-flow panel. A second drawer over the same stage edge
                would be a second drawer system. */}
            <StudioImagePanel slot="drawer" {...imagePanel} />
            {/* And the layers, in that same one drawer (`APP3-D01-C1`: "layers
                merge into that same drawer because 1024 cannot hold three
                regions"). */}
            <StudioLayersPanel slot="drawer" layers={layers} />
          </StudioTextPanel>

          <StudioStageBackgroundNotice background={background} hasScope={scope !== null} />

          {/*
            Hiding the safe area withholds the rectangle from the paint, and
            does nothing else: `area` is the same `rectToBounds` answer either
            way, and the Session scope, the document placement and the persisted
            geometry are untouched.
          */}
          {/* The runtime watermark (`APP3-S09`) rides the viewport box rather
              than the transformed layer, so it covers what is on screen at any
              zoom or pan. It is not in the document and cannot be. */}
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

          {/*
            The text inspector (`APP3-S05`). It reads the same document the
            scene was built from and writes back through the same working-
            document commit the transform gesture uses, so there is still one
            answer to "what is on the stage".

            Mounted through the panel (`APP3-S05-C1`), which decides where the
            inspector belongs on this viewport: beside the stage at 1440, in the
            `618:140` right drawer at 1024, and nowhere at 390 — mobile text
            editing is `APP3-S11`'s. The tablet composition renders in the
            topbar slot above instead, so this one is empty there.
          */}
          <StudioTextPanel slot="body" {...textPanel} />

          {/* The desktop and mobile image mounts (`APP3-S06`). The tablet
              composition renders in the drawer above instead, so this one is
              empty there. */}
          <StudioImagePanel slot="body" {...imagePanel} />

          {/* The desktop and mobile layer mounts (`APP3-S04`). */}
          <StudioLayersPanel slot="body" layers={layers} />

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
