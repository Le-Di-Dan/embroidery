'use client';

import { useEffect, useMemo } from 'react';

import type {
  DesignSessionScopeResponse,
  DesignSessionSnapshotResponse,
} from '@embroidery/api-client';
import { rectToBounds } from '@embroidery/design-engine';

import { useSideBackground } from '../hooks/use-side-background';
import { STUDIO_STAGE_COPY } from '../model/studio-stage-copy';
import { elementLabel } from '../model/studio-stage-label';
import { buildRenderableScene, resolveRenderableElement } from '../renderer/studio-scene';
import { useStudioInteractionStore } from '../store/studio-interaction.store';
import { StudioSessionPanel } from './studio-session-panel';
import { StudioStage } from './studio-stage';
import { StudioStageBackgroundNotice } from './studio-stage-background-notice';
import { StudioStageUnavailable } from './studio-stage-unavailable';

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
  readonly isResuming: boolean;
  readonly onResume: () => void;
}

/**
 * The Studio stage screen (`APP3-S02`).
 *
 * What S01 handed over and what S02 does with it, in one place: the canonical
 * Session snapshot arrives, `APP3-P01` decides whether its document can be
 * read, `APP3-P02` decides where everything lands, the adapter turns both into
 * a scene, and the stage draws it. No step is skipped and none is repeated
 * elsewhere.
 *
 * The Session is **not** re-fetched on mount. S01 already holds the snapshot
 * the server returned, and asking again would replace a known-good document
 * with a second copy for no reason — resume exists to check a Session that may
 * have expired, not to load the design.
 *
 * Nothing here saves. There is no autosave timer, no `publicDesignSessionAutosave`
 * call and no saving/saved indicator, because S02 makes no document mutation
 * and `APP3-S10` owns persistence.
 */
export function StudioStageScreen({
  snapshot,
  scope,
  isResuming,
  onResume,
}: StudioStageScreenProps) {
  const result = useMemo(() => buildRenderableScene(snapshot.document), [snapshot.document]);

  const background = useSideBackground(
    scope === null ? undefined : { productSlug: scope.productSlug, sideCode: scope.sideCode },
  );

  const selectedElementId = useStudioInteractionStore((state) => state.selectedElementId);
  const selectElement = useStudioInteractionStore((state) => state.selectElement);
  const clearSelection = useStudioInteractionStore((state) => state.clearSelection);
  const reconcileSelection = useStudioInteractionStore((state) => state.reconcileSelection);

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

  return (
    <div className="studio-stage">
      <StudioSessionPanel isResuming={isResuming} onResume={onResume} snapshot={snapshot} />

      {result.ok ? (
        <section className="studio-stage__frame" aria-label={STUDIO_STAGE_COPY.stageLabel}>
          <StudioStageBackgroundNotice background={background} hasScope={scope !== null} />

          <StudioStage
            area={area}
            backgroundUrl={background.objectUrl}
            onClearSelection={clearSelection}
            onSelect={selectElement}
            scene={result.scene}
            selectedElementId={selectedElementId}
          />

          {result.scene.elements.length === 0 ? (
            <p className="studio-stage__empty" data-testid="studio-stage-empty" role="status">
              {STUDIO_STAGE_COPY.empty}
              <span className="studio-stage__hint">{STUDIO_STAGE_COPY.emptyHint}</span>
            </p>
          ) : null}

          {/*
            Selection announced in text, not only by the outline. A coloured
            rectangle is invisible to a screen reader and to anyone who cannot
            distinguish it from the artwork underneath, so the selected
            element's name is stated here as well.
          */}
          <p className="studio-stage__selection-status" role="status">
            {selected === undefined
              ? STUDIO_STAGE_COPY.selectionNone
              : `${STUDIO_STAGE_COPY.selectionPrefix}: ${elementLabel(selected.element)}`}
          </p>
        </section>
      ) : (
        <StudioStageUnavailable failure={result.failure} />
      )}
    </div>
  );
}
