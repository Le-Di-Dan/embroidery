'use client';

import type { AdminProductionJobDetailResponse } from '@embroidery/api-client';

import { PRODUCTION_JOB_COPY as COPY } from '../model/production-job-copy';
import { productionJobActions, type ProductionJobAction } from '../model/production-job-actions';
import { toReservationView } from '../model/production-job-reservation';

interface ProductionActionsCardProps {
  readonly job: AdminProductionJobDetailResponse;
  readonly onAction: (action: ProductionJobAction) => void;
}

/**
 * The guarded action set (`784:120`, `784:251`, `785:128`, `785:264`).
 *
 * ## Visibility follows the read status, and legality does not follow visibility
 *
 * The controls come from `productionJobActions(job.status)` and nothing else. A
 * visible button means the approved frame for that state draws it — it is not a
 * prediction, and the copy under the buttons says so in as many words
 * (`784:128`). The reservation summary is not consulted here at all: reading it
 * to enable or disable "Bắt đầu sản xuất" would be GRD-015 reconstructed in the
 * browser from a figure taken without the stock row lock.
 *
 * ## What a terminal job offers, which is nothing
 *
 * A `COMPLETED` job has no APP8 move left and no "next commercial action": the
 * remaining payment, shipping and settlement belong to a later phase and no
 * button for them exists on this screen, before or after a successful
 * completion. A `CANCELLED` job cannot be restarted, and a redo would be a new
 * job APP8 does not create. Both render prose instead of controls.
 */
export function ProductionActionsCard({ job, onAction }: ProductionActionsCardProps) {
  const actions = productionJobActions(job.status);
  const summary = job.reservationSummary;
  const copOnly = summary !== undefined && toReservationView(summary).mode === 'customerOwned';

  return (
    <section className="job-card job-actions" data-testid="production-job-actions">
      <h2 className="job-card__title">{COPY.actions.title}</h2>

      {actions.includes('start') ? (
        <button
          type="button"
          className="job-actions__button job-actions__button--primary"
          data-testid="production-job-start"
          onClick={() => {
            onAction('start');
          }}
        >
          {COPY.actions.start}
        </button>
      ) : null}

      {actions.includes('complete') ? (
        <button
          type="button"
          className="job-actions__button job-actions__button--primary"
          data-testid="production-job-complete"
          onClick={() => {
            onAction('complete');
          }}
        >
          {COPY.actions.complete}
        </button>
      ) : null}

      {actions.includes('cancel') ? (
        <button
          type="button"
          className="job-actions__button job-actions__button--destructive"
          data-testid="production-job-cancel"
          onClick={() => {
            onAction('cancel');
          }}
        >
          {COPY.actions.cancel}
        </button>
      ) : null}

      {job.status === 'PLANNED' ? (
        <>
          <p className="job-actions__note">{COPY.actions.plannedNote}</p>
          {copOnly ? <p className="job-card__note">{COPY.actions.plannedCopNote}</p> : null}
        </>
      ) : null}

      {job.status === 'STARTED' ? (
        <p className="job-actions__note">{COPY.actions.startedNote}</p>
      ) : null}

      {job.status === 'COMPLETED' ? (
        <>
          <p className="job-actions__note">{COPY.actions.completedNote}</p>
          <p className="job-card__note">{COPY.actions.completedOrderNote}</p>
        </>
      ) : null}

      {job.status === 'CANCELLED' ? (
        <>
          <p className="job-actions__note">{COPY.actions.cancelledNote}</p>
          <p className="job-card__note">{COPY.actions.cancelledStockNote}</p>
        </>
      ) : null}

      <p className="job-card__note">{COPY.actions.serverOwnsLegality}</p>
    </section>
  );
}
