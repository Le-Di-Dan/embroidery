import Link from 'next/link';

import { AdminStatusBadge } from '../../../shared/status/admin-status-badge';
import { formatInstant } from '../../../shared/presentation/instant';
import { PRODUCTION_QUEUE_COPY } from '../model/production-queue-copy';
import type { ProductionQueueRow } from '../model/production-queue-rows';

interface ProductionQueueTableProps {
  readonly rows: readonly ProductionQueueRow[];
}

/**
 * The queue itself (`780:40`, `789:119`).
 *
 * A real `<table>`, not a grid of `<div>`s: the approved layout *is* a table, so
 * a screen reader should be able to navigate it as one. The job id is the row
 * header, because it is the identity an operator scans by and the value every
 * other cell qualifies.
 *
 * Every identifier is shortened for its cell with the full value kept in
 * `title`, exactly as the frames draw it — `APP8-B03` publishes no display name
 * for a job, an order or an approval snapshot, and three full UUIDs in one row
 * would push the status and the timestamps off the table.
 *
 * ### One link per row, and nothing else interactive
 *
 * `780:58` marks the trailing "Mở →" as the link and leaves the job id as text,
 * so that is what is built: one anchor per row, with an accessible name that
 * carries the job's shortened id so the links stay distinguishable when a screen
 * reader lists them out of context. There is no Start, Complete or Cancel
 * control here and no status control of any kind — a transition is taken on the
 * job detail, under the server's row lock, beside the facts it is judged
 * against.
 *
 * ### Server order, preserved
 *
 * Nothing here sorts. The rows arrive newest-first on `(createdAt, id)` — the
 * same key the keyset cursor pages by — and a second client-side sort would put
 * the visible list out of step with the pagination that produced it.
 *
 * ### The approval column at the approved narrow width
 *
 * `789:157` fixes the single reduction: below the narrow reference the
 * `approvalSnapshotId` column is hidden, and nothing else is. It is marked
 * `production-table__approval` here and hidden in the stylesheet — head and body
 * cells together, so the table never goes ragged — while the job, the order, the
 * status, both timestamps and the link stay on screen at every width.
 */
export function ProductionQueueTable({ rows }: ProductionQueueTableProps) {
  return (
    <table className="production-table" data-testid="production-queue-table">
      <caption className="production-table__caption">
        {PRODUCTION_QUEUE_COPY.page.tableLabel}
      </caption>
      <colgroup>
        <col className="production-table__col--job" />
        <col className="production-table__col--order" />
        <col className="production-table__col--approval" />
        <col className="production-table__col--status" />
        <col className="production-table__col--created" />
        <col className="production-table__col--milestone" />
        <col className="production-table__col--open" />
      </colgroup>
      <thead>
        <tr>
          <th scope="col">{PRODUCTION_QUEUE_COPY.columns.jobId}</th>
          <th scope="col">{PRODUCTION_QUEUE_COPY.columns.orderId}</th>
          <th scope="col" className="production-table__approval">
            {PRODUCTION_QUEUE_COPY.columns.approvalSnapshotId}
          </th>
          <th scope="col">{PRODUCTION_QUEUE_COPY.columns.status}</th>
          <th scope="col">{PRODUCTION_QUEUE_COPY.columns.createdAt}</th>
          <th scope="col">{PRODUCTION_QUEUE_COPY.columns.milestone}</th>
          <th scope="col">
            <span className="production-table__sr-only">{PRODUCTION_QUEUE_COPY.columns.open}</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.key} data-testid="production-queue-row">
            <th scope="row" className="production-table__job" title={row.jobId}>
              {row.jobShortId}
            </th>
            <td className="production-table__order" title={row.orderId}>
              {row.orderShortId}
            </td>
            <td className="production-table__approval" title={row.approvalSnapshotId}>
              {row.approvalShortId}
            </td>
            <td>
              <AdminStatusBadge
                token={row.status.token}
                label={row.status.label}
                tone={row.status.tone}
                symbol={row.status.symbol}
                testId="production-queue-status"
              />
            </td>
            <td>
              {/* Machine-readable in `dateTime`, human-readable in the text;
                  neither is derived from the other by guesswork. */}
              <time dateTime={row.createdAt}>{formatInstant(row.createdAt)}</time>
            </td>
            <td className="production-table__milestone">
              {row.milestone === undefined ? (
                // Absent is not unknown: a job that has not started simply has
                // no milestone, and `780:57` renders exactly this.
                <span className="production-table__absent">
                  {PRODUCTION_QUEUE_COPY.milestones.none}
                </span>
              ) : (
                <time dateTime={row.milestone.at}>
                  {`${row.milestone.verb} ${formatInstant(row.milestone.at)}`}
                </time>
              )}
            </td>
            <td>
              <Link
                className="production-table__open"
                href={row.detailHref}
                aria-label={`${PRODUCTION_QUEUE_COPY.columns.open}: ${row.jobShortId}`}
              >
                {PRODUCTION_QUEUE_COPY.actions.open}
              </Link>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
