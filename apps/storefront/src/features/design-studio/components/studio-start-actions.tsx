'use client';

import { STUDIO_COPY } from '../model/studio-copy';
import type { StudioSessionState } from '../hooks/use-studio-session';

export interface StudioStartActionsProps {
  readonly session: StudioSessionState;
  readonly canStart: boolean;
  readonly selectedTemplateSlug: string | null;
  readonly onStartBlank: () => void;
  readonly onStartClone: () => void;
}

/**
 * The two explicit ways to open a Session (`APP3-B07`).
 *
 * They are two buttons because they are two decisions. Blank stays available
 * when the compatible list is empty — a Product with no Template is still a
 * Product a customer can design on — and Clone appears only when a Template is
 * actually selected, so there is no button that could open a session from
 * nothing and call it a clone.
 *
 * Both are disabled while a bootstrap is in flight. That is the duplicate-submit
 * guard the visitor can see; the hook holds the one they cannot.
 */
export function StudioStartActions({
  session,
  canStart,
  selectedTemplateSlug,
  onStartBlank,
  onStartClone,
}: StudioStartActionsProps) {
  const busy = session.isStarting;
  const failure = session.startFailure;

  return (
    <div className="studio-start">
      <h2 className="studio-start__heading">{STUDIO_COPY.startHeading}</h2>

      <div className="studio-start__actions">
        <button
          className="studio-button studio-button--primary"
          disabled={!canStart || busy}
          onClick={onStartBlank}
          type="button"
        >
          {STUDIO_COPY.startBlank}
        </button>

        {selectedTemplateSlug === null ? null : (
          <button
            className="studio-button studio-button--primary"
            disabled={!canStart || busy}
            onClick={onStartClone}
            type="button"
          >
            {STUDIO_COPY.startClone}
          </button>
        )}
      </div>

      {busy ? (
        <p className="studio-start__status" role="status">
          {STUDIO_COPY.starting}
        </p>
      ) : null}

      {/* A failed clone is reported as a failed clone. It never becomes a blank
          session that succeeded — the visitor chose a Template. */}
      {failure === null ? null : (
        <p className="studio-start__status" role="alert">
          {failure.mode === 'clone' ? STUDIO_COPY.startCloneError : STUDIO_COPY.startBlankError}
        </p>
      )}
    </div>
  );
}
