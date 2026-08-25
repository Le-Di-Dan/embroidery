'use client';

import { PRODUCTION_JOB_COPY as COPY } from '../model/production-job-copy';

interface ProductionCancellationCardProps {
  /** Mandatory evidence on a cancelled job; absent only if the server omitted it. */
  readonly reason: string | undefined;
}

/**
 * The cancellation evidence card, shown only on a `CANCELLED` job (`785:178`).
 *
 * It carries the recorded reason and the boundary statement that binds every
 * cancel surface in APP8: this cancelled the **production job**, not the
 * customer order. The order's commercial state is unchanged — no move to
 * `CANCELLING`, no refund, no payout — because `APP8-B04` deliberately does not
 * execute the order cancellation workflow, and no control on this screen offers
 * to.
 */
export function ProductionCancellationCard({ reason }: ProductionCancellationCardProps) {
  return (
    <section className="job-card job-card--cancelled" data-testid="production-job-cancellation">
      <h2 className="job-card__title job-card__title--error">{COPY.cancellation.title}</h2>
      <p className="job-card__source">{COPY.cancellation.source}</p>

      {reason === undefined ? null : (
        <div className="job-reason">
          <p className="job-reason__label">{COPY.cancellation.reasonLabel}</p>
          <p className="job-reason__value" data-testid="production-job-cancelled-reason">
            {reason}
          </p>
        </div>
      )}

      <div className="job-boundary">
        <p className="job-boundary__title">{COPY.cancellation.boundaryTitle}</p>
        <p className="job-boundary__body">{COPY.cancellation.boundaryBody}</p>
      </div>
    </section>
  );
}
