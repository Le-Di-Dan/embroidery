'use client';

import { STUDIO_COPY } from '../model/studio-copy';

export interface StudioSessionExpiredProps {
  readonly onRestart: () => void;
}

/**
 * The approved Session-expired state (`APP3-B07` answers 401).
 *
 * One path forward, and it is an explicit new start. The old Session is not
 * revived, not extended and not retried: there is no grace secret, and offering
 * "try again" here would invite the visitor to keep asking a question the
 * server has already answered permanently.
 */
export function StudioSessionExpired({ onRestart }: StudioSessionExpiredProps) {
  return (
    <section className="studio-expired" aria-labelledby="studio-expired-heading" role="alert">
      <h2 className="studio-expired__heading" id="studio-expired-heading">
        {STUDIO_COPY.expiredHeading}
      </h2>
      <p className="studio-expired__body">{STUDIO_COPY.expiredBody}</p>
      <button className="studio-button studio-button--primary" onClick={onRestart} type="button">
        {STUDIO_COPY.expiredRestart}
      </button>
    </section>
  );
}
