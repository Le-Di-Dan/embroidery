'use client';

import { STUDIO_COPY } from '../model/studio-copy';

export interface StudioUnavailableProps {
  /** `ineligible` is a server fact; `error` is a failure the visitor may retry. */
  readonly reason: 'ineligible' | 'error';
  readonly onRetry?: () => void;
}

/**
 * The two ways the Studio can be closed before anything is chosen.
 *
 * `ineligible` is `studioEligible === false` from the placement manifest: the
 * Product is genuinely published, but its placement is incomplete or its
 * background is not yet editor-safe. Nothing is fabricated to fill the gap —
 * no Side, no Area, no Template request and no Session, because a Session
 * cannot be opened on a placement the server will not vouch for.
 *
 * `error` is a failed manifest read, which says nothing about the Product at
 * all and therefore offers a retry.
 */
export function StudioUnavailable({ reason, onRetry }: StudioUnavailableProps) {
  if (reason === 'error') {
    return (
      <div className="studio-unavailable">
        <p role="alert">{STUDIO_COPY.placementError}</p>
        {onRetry === undefined ? null : (
          <button className="studio-button" onClick={onRetry} type="button">
            {STUDIO_COPY.retry}
          </button>
        )}
      </div>
    );
  }

  return (
    <section className="studio-unavailable" aria-labelledby="studio-unavailable-heading">
      <h2 className="studio-unavailable__heading" id="studio-unavailable-heading">
        {STUDIO_COPY.ineligibleHeading}
      </h2>
      <p>{STUDIO_COPY.ineligibleBody}</p>
    </section>
  );
}
