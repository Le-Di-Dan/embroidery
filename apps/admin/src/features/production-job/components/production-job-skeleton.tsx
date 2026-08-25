'use client';

import { PRODUCTION_JOB_COPY as COPY } from '../model/production-job-copy';

/**
 * The loading placeholder.
 *
 * It shows the shape of the page and no content: no status, no timestamp, no
 * specification value and — the one that matters — **no action button**. A
 * control drawn before the server has said what state the job is in would be a
 * command offered on a guess, and the note says so rather than leaving the
 * absence unexplained.
 *
 * The bars are decorative and hidden from assistive technology; the live region
 * announces the load itself.
 */
export function ProductionJobSkeleton() {
  return (
    <div className="job-skeleton" data-testid="production-job-skeleton">
      <p className="job-skeleton__status" role="status" aria-live="polite">
        {COPY.states.loading}
      </p>
      <div className="job-skeleton__bars" aria-hidden="true">
        <span className="job-skeleton__bar job-skeleton__bar--header" />
        <span className="job-skeleton__bar job-skeleton__bar--wide" />
        <span className="job-skeleton__bar job-skeleton__bar--wide" />
        <span className="job-skeleton__bar" />
        <span className="job-skeleton__bar" />
      </div>
      <p className="job-card__note">{COPY.states.loadingNote}</p>
    </div>
  );
}
