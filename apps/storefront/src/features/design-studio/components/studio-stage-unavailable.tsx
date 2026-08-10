'use client';

import { STUDIO_STAGE_COPY } from '../model/studio-stage-copy';
import type { StudioSceneFailure } from '../renderer/studio-scene';

export interface StudioStageUnavailableProps {
  readonly failure: StudioSceneFailure;
}

const MESSAGES: Readonly<Record<StudioSceneFailure, string>> = {
  'unreadable-document': STUDIO_STAGE_COPY.unreadableDocument,
  'unresolvable-geometry': STUDIO_STAGE_COPY.unresolvableGeometry,
  'uncontrolled-font': STUDIO_STAGE_COPY.uncontrolledFont,
};

/**
 * What the stage shows instead of a drawing it cannot vouch for.
 *
 * A bounded state, and bounded is the whole point: no `<svg>` is rendered, so
 * there is nothing half-drawn to mistake for a design; and no document, JSON
 * path, element id or finding message is shown, so a stage refusing to trust a
 * payload does not put that payload on screen while it says so.
 *
 * Three messages rather than one, because the three causes are three different
 * facts and only one of them is likely to change on its own. Guessing geometry
 * would be worse than any of them: an element drawn at the identity matrix
 * looks like a position rather than like a failure.
 */
export function StudioStageUnavailable({ failure }: StudioStageUnavailableProps) {
  return (
    <section
      className="studio-stage__unavailable"
      role="alert"
      data-testid="studio-stage-unavailable"
      data-failure={failure}
    >
      <p className="studio-stage__unavailable-text">{MESSAGES[failure]}</p>
      <p className="studio-stage__hint">{STUDIO_STAGE_COPY.failureHint}</p>
    </section>
  );
}
