'use client';

/**
 * What the stage is currently doing, in words (`APP3-S02`, `APP3-S03`).
 *
 * Extracted from `StudioStageScreen` unchanged when `APP3-S04` added the layer
 * panel — one responsibility, not a line budget: this is the stage's textual
 * status, and the screen above it is composition.
 *
 * Everything here exists because the visual signal is not enough on its own. A
 * coloured outline is invisible to a screen reader, a millimetre value cannot be
 * inferred from how large something looks on a zoomed canvas, and a refusal that
 * only manifested as "the element stopped moving" would read as a bug rather
 * than as the rule it is.
 */
import type { DesignDocument } from '@embroidery/design-document';
import type { ElementGraph } from '@embroidery/design-engine';
import type { DesignSessionScopeResponse } from '@embroidery/api-client';

import { STUDIO_STAGE_COPY } from '../model/studio-stage-copy';
import { elementLabel } from '../model/studio-stage-label';
import type { TransformRefusal } from '../model/studio-transform-authority';
import { STUDIO_TRANSFORM_COPY } from '../model/studio-transform-copy';
import type { RenderableElement } from '../renderer/studio-scene';
import { physicalSizeLabel } from './studio-transform-overlay';

export interface StudioStageStatusProps {
  readonly document: DesignDocument | null;
  readonly graph: ElementGraph | null;
  readonly scope: DesignSessionScopeResponse | null;
  /** The selected element, or `undefined`. */
  readonly selected: RenderableElement | undefined;
  /** The selected element when it may actually be transformed, or `undefined`. */
  readonly transformable: RenderableElement | undefined;
  readonly refusal: TransformRefusal | null;
}

export function StudioStageStatus({
  document,
  graph,
  refusal,
  scope,
  selected,
  transformable,
}: StudioStageStatusProps) {
  return (
    <>
      <p className="studio-stage__selection-status" role="status">
        {selected === undefined
          ? STUDIO_STAGE_COPY.selectionNone
          : `${STUDIO_STAGE_COPY.selectionPrefix}: ${elementLabel(selected.element)}`}
        {transformable === undefined ? null : (
          <span className="studio-stage__hint" data-testid="studio-transform-size">
            {scope === null || document === null || graph === null
              ? STUDIO_TRANSFORM_COPY.physicalSizeUnavailable
              : physicalSizeLabel(document, transformable.id, scope.pxPerMm, graph)}
          </span>
        )}
        {selected !== undefined && selected.element.locked ? (
          <span className="studio-stage__hint" data-testid="studio-transform-locked">
            {STUDIO_TRANSFORM_COPY.lockedElement}
          </span>
        ) : null}
      </p>

      {refusal === null ? null : (
        <p className="studio-stage__refusal" role="alert" data-testid="studio-transform-refusal">
          {refusalCopy(refusal)}
        </p>
      )}
    </>
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
