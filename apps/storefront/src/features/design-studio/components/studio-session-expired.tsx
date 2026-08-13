'use client';

import { STUDIO_SAVE_COPY } from '../model/studio-autosave-copy';
import { STUDIO_COPY } from '../model/studio-copy';

export interface StudioSessionExpiredProps {
  readonly onRestart: () => void;
  /** Back to the Template list. `APP3-S10` §21's second approved way out. */
  readonly onPickTemplate: () => void;
}

/**
 * The expired / credential-lost state (`APP3-S10`, `610:201`).
 *
 * `APP3-B07` answers **401** for an expired, revoked or unknown Session: the
 * resume guard authorizes before it resolves, so "no longer valid" and "never
 * yours" are one answer, and the two causes the frame names — the Session
 * expired, or the identifying cookie is no longer on this device — are
 * indistinguishable from here. The copy says both rather than picking one.
 *
 * ## Nothing here promises recovery
 *
 * There is no retry, no grace secret and no client-side reactivation. The
 * Session secret is an `HttpOnly` cookie: this code cannot read it, cannot
 * restore it, and does not scan `document.cookie` looking for it. `APP3-G03`
 * makes expiry the server's, absolutely, and a browser may not extend a TTL it
 * does not own.
 *
 * ## Two ways forward, both of them existing paths
 *
 * `Bắt đầu phiên mới` returns to the `APP3-S01` start actions and
 * `Chọn mẫu khác` to its Template picker. Neither opens a Session by itself —
 * the customer still chooses Blank or a Template, which is the accepted flow and
 * is why no Session is spent on a dead one.
 *
 * `APP3-S10` also clears the stored resume handle for this placement before this
 * screen is shown, so a reload does not offer the same dead Session again.
 */
export function StudioSessionExpired({ onRestart, onPickTemplate }: StudioSessionExpiredProps) {
  return (
    <section className="studio-expired" aria-labelledby="studio-expired-heading" role="alert">
      <p className="studio-expired__eyebrow">{STUDIO_SAVE_COPY.expiredEyebrow}</p>
      <h2 className="studio-expired__heading" id="studio-expired-heading">
        {STUDIO_SAVE_COPY.expiredHeading}
      </h2>
      <p className="studio-expired__body">{STUDIO_SAVE_COPY.expiredBody}</p>

      <div className="studio-expired__actions">
        <button
          className="studio-button studio-button--primary"
          data-testid="studio-expired-restart"
          onClick={onRestart}
          type="button"
        >
          {STUDIO_COPY.expiredRestart}
        </button>
        <button
          className="studio-button"
          data-testid="studio-expired-pick-template"
          onClick={onPickTemplate}
          type="button"
        >
          {STUDIO_SAVE_COPY.expiredPickTemplate}
        </button>
      </div>
    </section>
  );
}
