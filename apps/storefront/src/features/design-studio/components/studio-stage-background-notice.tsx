'use client';

import type { SideBackgroundState } from '../hooks/use-side-background';
import { STUDIO_STAGE_COPY } from '../model/studio-stage-copy';

export interface StudioStageBackgroundNoticeProps {
  readonly background: SideBackgroundState;
  /** False when the Session snapshot carried no placement scope to address. */
  readonly hasScope: boolean;
}

/**
 * What the stage says about the garment underneath the design.
 *
 * Nothing, once the artwork is on screen: a notice over a loaded background
 * would sit on top of the very thing it was reporting about.
 *
 * The states are kept apart because they are not all failures. A Side with no
 * approved background, and a Session resumed by id — which `APP3-B07` answers
 * without a placement scope — are facts about what is available, not errors the
 * customer caused. Only a real fetch failure is offered a retry, and the design
 * remains fully visible and fully selectable in every one of these states: the
 * background is context, never a precondition for working.
 */
export function StudioStageBackgroundNotice({
  background,
  hasScope,
}: StudioStageBackgroundNoticeProps) {
  if (background.objectUrl !== null) return null;

  if (!hasScope) {
    return (
      <p
        className="studio-stage__notice"
        role="status"
        data-testid="studio-stage-background-notice"
      >
        {STUDIO_STAGE_COPY.backgroundUnavailable}
      </p>
    );
  }

  if (background.failure !== null) {
    return (
      <p
        className="studio-stage__notice"
        role="status"
        data-testid="studio-stage-background-notice"
      >
        {background.failure === 'gone'
          ? STUDIO_STAGE_COPY.backgroundUnavailable
          : STUDIO_STAGE_COPY.backgroundFailed}
        {/* Retry only where retrying can work: `gone` means the server will not
            resolve a background at this address at all. */}
        {background.failure === 'gone' ? null : (
          <button
            className="studio-stage__notice-action"
            data-testid="studio-stage-background-retry"
            onClick={background.retry}
            type="button"
          >
            {STUDIO_STAGE_COPY.backgroundRetry}
          </button>
        )}
      </p>
    );
  }

  return (
    <p className="studio-stage__notice" role="status" data-testid="studio-stage-background-notice">
      {background.isLoading
        ? STUDIO_STAGE_COPY.backgroundLoading
        : STUDIO_STAGE_COPY.backgroundUnavailable}
    </p>
  );
}
