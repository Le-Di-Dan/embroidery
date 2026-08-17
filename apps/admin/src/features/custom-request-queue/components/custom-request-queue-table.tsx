import Link from 'next/link';

import { CUSTOM_REQUEST_QUEUE_COPY } from '../model/custom-request-queue-copy';
import { formatInstant, type CustomRequestQueueRow } from '../model/custom-request-queue-rows';
import { CustomRequestStatusBadge } from './custom-request-status-badge';

interface CustomRequestQueueTableProps {
  readonly rows: readonly CustomRequestQueueRow[];
}

/**
 * The queue itself (`662:3`, and `663:9` at 1280).
 *
 * A real `<table>`, not a grid of `<div>`s: the approved layout *is* a table, so
 * a screen reader should be able to navigate it as one. The request code is the
 * row header, because it is the identity an operator scans by and the value
 * every other cell qualifies.
 *
 * The `colgroup` states the intended proportions rather than letting the longest
 * subject name decide them. That is what keeps the 1280 reference honest: the
 * approved narrow frame drops no column and scrolls nowhere sideways, which auto
 * table layout would not have guaranteed.
 *
 * Each row carries one explicit "Xem chi tiết" link rather than whole-row
 * navigation: a row that is entirely clickable gives no hint about where it
 * goes, makes the code unselectable and is not keyboard-reachable. The
 * accessible name includes the request code, so the links stay distinguishable
 * when a screen reader lists them out of context.
 *
 * No moderation control appears here, and none may: `APP5-A01` is read-only and
 * the transitions belong to `APP5-B05`/`APP5-A02`.
 */
export function CustomRequestQueueTable({ rows }: CustomRequestQueueTableProps) {
  return (
    <table className="custom-request-table" data-testid="request-queue-table">
      <caption className="custom-request-table__caption">
        {CUSTOM_REQUEST_QUEUE_COPY.page.tableLabel}
      </caption>
      <colgroup>
        <col className="custom-request-table__col--code" />
        <col className="custom-request-table__col--status" />
        <col className="custom-request-table__col--subject" />
        <col className="custom-request-table__col--customer" />
        <col className="custom-request-table__col--submitted" />
        <col className="custom-request-table__col--quantity" />
        <col className="custom-request-table__col--actions" />
      </colgroup>
      <thead>
        <tr>
          <th scope="col">{CUSTOM_REQUEST_QUEUE_COPY.columns.code}</th>
          <th scope="col">{CUSTOM_REQUEST_QUEUE_COPY.columns.status}</th>
          <th scope="col">{CUSTOM_REQUEST_QUEUE_COPY.columns.subject}</th>
          <th scope="col">{CUSTOM_REQUEST_QUEUE_COPY.columns.customer}</th>
          <th scope="col">{CUSTOM_REQUEST_QUEUE_COPY.columns.submitted}</th>
          <th scope="col" className="custom-request-table__numeric">
            {CUSTOM_REQUEST_QUEUE_COPY.columns.quantity}
          </th>
          <th scope="col">{CUSTOM_REQUEST_QUEUE_COPY.columns.actions}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.key} data-testid="request-queue-row">
            <th scope="row" className="custom-request-table__code">
              {row.code}
            </th>
            <td>
              <CustomRequestStatusBadge status={row.status} />
            </td>
            <td className="custom-request-table__subject">
              <span className="custom-request-table__subject-kind">{row.subjectKindLabel}</span>
              <span className="custom-request-table__subject-summary">{row.subjectSummary}</span>
            </td>
            <td>{row.customerDisplayName}</td>
            <td>
              {/* Machine-readable in `dateTime`, human-readable in the text;
                  neither is derived from the other by guesswork. */}
              <time dateTime={row.submittedAt}>{formatInstant(row.submittedAt)}</time>
            </td>
            <td className="custom-request-table__numeric">{row.totalQuantity}</td>
            <td>
              <Link
                className="custom-request-table__open"
                href={row.detailHref}
                aria-label={`${CUSTOM_REQUEST_QUEUE_COPY.actions.open}: ${row.code}`}
              >
                {CUSTOM_REQUEST_QUEUE_COPY.actions.open}
              </Link>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
