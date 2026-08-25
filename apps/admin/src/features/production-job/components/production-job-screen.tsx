'use client';

import Link from 'next/link';
import { useCallback, useState } from 'react';

import { truncateIdentifier } from '../../../shared/presentation/identifier';
import { presentProductionStatus } from '../../../shared/presentation/production-status';
import { ADMIN_PRODUCTION_ROUTE } from '../../production-queue';
import { useProductionJobQuery } from '../hooks/use-production-job-query';
import type { ProductionJobAction } from '../model/production-job-actions';
import { PRODUCTION_JOB_COPY as COPY } from '../model/production-job-copy';
import { classifyProductionJobReadFailure } from '../model/production-job-failure';
import { ProductionActionsCard } from './production-actions-card';
import { ProductionCancellationCard } from './production-cancellation-card';
import { ProductionHistoryCard } from './production-history-card';
import { ProductionJobFailureState } from './production-job-failure-state';
import { ProductionJobHeader } from './production-job-header';
import { ProductionJobSkeleton } from './production-job-skeleton';
import { ProductionReservationCard } from './production-reservation-card';
import { ProductionSpecificationCard } from './production-specification-card';
import { ProductionTransitionDialog } from './production-transition-dialog';

interface ProductionJobScreenProps {
  readonly jobId: string;
}

/**
 * `/san-xuat/{jobId}` — the Admin production job detail (`784:3`, `784:129`,
 * `785:3`, `785:134`, `785:270`, `789:160`).
 *
 * ## One read is the whole page
 *
 * `APP8-B03`'s detail response carries the job root, the frozen specification,
 * the append-only history and the reservation summary, so this screen opens no
 * second request to enrich anything. No Catalog, Product, quotation, Design
 * Session, payment, customer, artifact or storage read exists in this feature:
 * the specification is a frozen copy, and reading a live catalog to "improve" it
 * would replace what is being produced with what is currently sold.
 *
 * ## The server owns legality, start to finish
 *
 * The action set comes from the read status alone. Nothing on this screen
 * reconstructs GRD-015 — not from the reservation summary, which is taken
 * without the stock row lock, and not from the history. A visible control means
 * the approved frame draws it; the server re-decides under the lock and may
 * refuse, and the refusal path reloads truth rather than retrying.
 *
 * ## What this screen deliberately does not have
 *
 * No production-job creation, no order cancellation or refund, no remaining
 * payment, no shipping, no artifact, no note mutation, no operator or machine
 * assignment, no priority or SLA, no attempts or claims, no rework creation, no
 * inventory adjustment, no manual reservation action and no APP9 behaviour. Each
 * is missing because no accepted contract publishes an operation for it
 * (`788:52`), not because it was forgotten — and the terminal state APP8 reaches
 * is `job = COMPLETED`, `order = PRODUCTION_COMPLETED`, with no "next" button
 * beyond it.
 *
 * ## The route key authorizes nothing
 *
 * `jobId` is passed down as a plain string. Both `APP8-B03` and `APP8-B04`
 * re-check the Admin session on every request, and a job id in a URL grants
 * nothing on its own.
 */
export function ProductionJobScreen({ jobId }: ProductionJobScreenProps) {
  const query = useProductionJobQuery(jobId);
  const [pendingAction, setPendingAction] = useState<ProductionJobAction | null>(null);
  const [announcement, setAnnouncement] = useState('');

  const closeDialog = useCallback(() => {
    setPendingAction(null);
  }, []);

  const header = (
    <header className="job-page__header">
      <p className="job-page__breadcrumb">{COPY.page.breadcrumb(truncateIdentifier(jobId))}</p>
      <Link className="job-page__back" href={ADMIN_PRODUCTION_ROUTE}>
        {COPY.page.backToQueue}
      </Link>
      <h1 className="job-page__title">{COPY.page.title}</h1>
    </header>
  );

  if (query.isPending) {
    return (
      <div className="job-page" data-testid="production-job-page">
        {header}
        <ProductionJobSkeleton />
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="job-page" data-testid="production-job-page">
        {header}
        <ProductionJobFailureState
          failure={classifyProductionJobReadFailure(query.error)}
          onRetry={() => {
            void query.refetch();
          }}
        />
      </div>
    );
  }

  const job = query.data;

  return (
    <div className="job-page" data-testid="production-job-page">
      {header}
      <ProductionJobHeader job={job} />

      {/* The announcement quotes the server's own receipt, never the state the
          command asked for; the page around it is the re-read that followed. */}
      <p className="job-page__live" role="status" aria-live="polite">
        {announcement}
      </p>

      <div className="job-columns">
        <div className="job-columns__main">
          {job.status === 'CANCELLED' ? (
            <ProductionCancellationCard reason={job.cancelledReason} />
          ) : null}
          <ProductionSpecificationCard specification={job.specification} />
          <ProductionHistoryCard transitions={job.transitions} />
        </div>

        <aside className="job-columns__aside">
          <ProductionActionsCard job={job} onAction={setPendingAction} />
          <ProductionReservationCard summary={job.reservationSummary} />
        </aside>
      </div>

      {pendingAction === null ? null : (
        <ProductionTransitionDialog
          job={job}
          action={pendingAction}
          onClose={closeDialog}
          onCommitted={(result) => {
            setPendingAction(null);
            // The receipt's `status` is what the committing transaction wrote —
            // server truth, not the destination the command asked for. It is
            // read only after the authoritative re-read has already landed.
            setAnnouncement(COPY.states.refreshed(presentProductionStatus(result.status).label));
          }}
        />
      )}
    </div>
  );
}
