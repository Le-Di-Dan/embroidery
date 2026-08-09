'use client';

import type { DesignSessionSnapshotResponse } from '@embroidery/api-client';

import { STUDIO_COPY } from '../model/studio-copy';

export interface StudioSessionPanelProps {
  readonly snapshot: DesignSessionSnapshotResponse;
  readonly isResuming: boolean;
  readonly onResume: () => void;
}

/**
 * What S01 shows once it owns a canonical Session snapshot.
 *
 * The smallest truthful placeholder for the stage `APP3-S02` will bring. No
 * canvas, no tool rail, no layer list and no disabled editing controls: a
 * greyed-out toolbar would promise an editor that does not exist, and this
 * checkpoint's honest statement is that the Session is open and the drawing
 * surface comes next.
 *
 * Every fact here is read from the server's snapshot. The expiry is displayed,
 * never computed, and the revision is never advanced client-side.
 */
export function StudioSessionPanel({ snapshot, isResuming, onResume }: StudioSessionPanelProps) {
  return (
    <section className="studio-session" aria-labelledby="studio-session-heading">
      <h2 className="studio-session__heading" id="studio-session-heading">
        {STUDIO_COPY.readyHeading}
      </h2>
      <p className="studio-session__body">{STUDIO_COPY.readyBody}</p>

      <dl className="studio-session__facts">
        <div className="studio-session__fact">
          <dt>{STUDIO_COPY.readyExpiresPrefix}</dt>
          <dd>{snapshot.expiresAt}</dd>
        </div>
        {snapshot.lineage === undefined ? null : (
          <div className="studio-session__fact">
            <dt>{STUDIO_COPY.readyFromTemplatePrefix}</dt>
            <dd>
              {snapshot.lineage.templateSlug} · {STUDIO_COPY.templateVersionPrefix}{' '}
              {snapshot.lineage.templateVersion}
            </dd>
          </div>
        )}
      </dl>

      <button className="studio-button" disabled={isResuming} onClick={onResume} type="button">
        {isResuming ? STUDIO_COPY.resuming : STUDIO_COPY.resume}
      </button>
    </section>
  );
}
