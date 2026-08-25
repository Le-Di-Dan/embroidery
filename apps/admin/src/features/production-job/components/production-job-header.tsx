'use client';

import Link from 'next/link';

import type { AdminProductionJobDetailResponse } from '@embroidery/api-client';

import { adminOrderDetailRoute } from '../../order-queue';
import { truncateIdentifier } from '../../../shared/presentation/identifier';
import { formatInstant } from '../../../shared/presentation/instant';
import { presentProductionStatus } from '../../../shared/presentation/production-status';
import { AdminStatusBadge } from '../../../shared/status/admin-status-badge';
import { PRODUCTION_JOB_COPY as COPY } from '../model/production-job-copy';

interface ProductionJobHeaderProps {
  readonly job: AdminProductionJobDetailResponse;
}

/**
 * The job identity card (`784:29`).
 *
 * Ids are shortened for reading and carried in full in `title`, the convention
 * `APP7-A01` set — the shortened form is display only and is never sent, looked
 * up or treated as an identity.
 *
 * `orderCode` is the one human-facing string the detail contract publishes that
 * the queue does not, and it is display and search only: the link addresses the
 * order by its `orderId`, because a code never authorizes anything.
 *
 * The timestamp line states only what the response carries. A `PLANNED` job has
 * no `startedAt` at all, so it says "Chưa bắt đầu" (`784:43`) rather than
 * printing an empty date; a job that never completed shows no completion.
 */
export function ProductionJobHeader({ job }: ProductionJobHeaderProps) {
  const status = presentProductionStatus(job.status);

  return (
    <section className="job-card job-identity" data-testid="production-job-header">
      <div className="job-identity__ident">
        <p className="job-identity__label">{COPY.header.jobLabel}</p>
        <p className="job-identity__id" title={job.jobId} data-testid="production-job-id">
          {truncateIdentifier(job.jobId)}
        </p>
        <p className="job-identity__order">
          <Link
            className="job-identity__order-link"
            href={adminOrderDetailRoute(job.orderId)}
            data-testid="production-job-order-link"
          >
            <span className="job-identity__order-code">{job.orderCode}</span>
            <span className="job-identity__order-open">{COPY.header.openOrder}</span>
          </Link>
        </p>
        <p className="job-identity__approval" title={job.approvalSnapshotId}>
          {COPY.header.approval(truncateIdentifier(job.approvalSnapshotId))}
        </p>
        {job.reworkedFromJobId === undefined ? null : (
          <p className="job-identity__rework" title={job.reworkedFromJobId}>
            {COPY.header.reworkedFrom(truncateIdentifier(job.reworkedFromJobId))}
          </p>
        )}
      </div>

      <div className="job-identity__meta">
        <AdminStatusBadge
          token={status.token}
          label={status.label}
          tone={status.tone}
          symbol={status.symbol}
          testId="production-job-status"
        />
        <p className="job-identity__stamp">
          <time dateTime={job.createdAt}>
            {COPY.header.createdAt(formatInstant(job.createdAt))}
          </time>
        </p>
        {job.startedAt === undefined ? (
          <p className="job-identity__stamp">{COPY.header.notStarted}</p>
        ) : (
          <p className="job-identity__stamp">
            <time dateTime={job.startedAt}>
              {COPY.header.startedAt(formatInstant(job.startedAt))}
            </time>
          </p>
        )}
        {job.completedAt === undefined ? null : (
          <p className="job-identity__stamp">
            <time dateTime={job.completedAt}>
              {COPY.header.completedAt(formatInstant(job.completedAt))}
            </time>
          </p>
        )}
        {job.cancelledAt === undefined ? null : (
          <p className="job-identity__stamp">
            <time dateTime={job.cancelledAt}>
              {COPY.header.cancelledAt(formatInstant(job.cancelledAt))}
            </time>
          </p>
        )}
        <p className="job-identity__stamp job-identity__stamp--muted">
          <time dateTime={job.updatedAt}>
            {COPY.header.updatedAt(formatInstant(job.updatedAt))}
          </time>
        </p>
      </div>
    </section>
  );
}
