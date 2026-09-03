import Link from 'next/link';

import { AdminStatusBadge } from '../../../shared/status/admin-status-badge';
import { formatInstant } from '../../../shared/presentation/instant';
import { ORDER_QUEUE_COPY } from '../model/order-queue-copy';
import type { OrderQueueRow } from '../model/order-queue-rows';

interface OrderQueueTableProps {
  readonly rows: readonly OrderQueueRow[];
}

/**
 * The queue itself (`732:3`).
 *
 * A real `<table>`, not a grid of `<div>`s: the approved layout *is* a table, so
 * a screen reader should be able to navigate it as one. The order code is the
 * row header, because it is the identity an operator scans by and the value
 * every other cell qualifies.
 *
 * The `colgroup` states the intended proportions rather than letting the longest
 * status label decide them, which is what keeps the narrow-desktop reference
 * honest: no column is dropped and nothing scrolls sideways.
 *
 * Amount and currency are **two columns**, exactly as `732:3` draws them. The
 * amount is the frozen `totalAmount` transported as a decimal string and grouped
 * for reading — never re-summed from lines, never converted to a number — and
 * the currency is the order's own `currencyCode` rather than a mark this screen
 * chose.
 *
 * Each row carries two explicit links rather than whole-row navigation: a row
 * that is entirely clickable gives no hint about where it goes, makes the code
 * unselectable and is not keyboard-reachable. Both accessible names include the
 * order code, so the links stay distinguishable when a screen reader lists them
 * out of context.
 *
 * No payment control appears here, and none may: a verification is taken on the
 * order detail beside the facts it is judged against.
 */
export function OrderQueueTable({ rows }: OrderQueueTableProps) {
  return (
    <table className="order-table" data-testid="order-queue-table">
      <caption className="order-table__caption">{ORDER_QUEUE_COPY.page.tableLabel}</caption>
      <colgroup>
        <col className="order-table__col--code" />
        <col className="order-table__col--origin" />
        <col className="order-table__col--status" />
        <col className="order-table__col--total" />
        <col className="order-table__col--currency" />
        <col className="order-table__col--created" />
        <col className="order-table__col--request" />
        <col className="order-table__col--customer" />
      </colgroup>
      <thead>
        <tr>
          <th scope="col">{ORDER_QUEUE_COPY.columns.code}</th>
          <th scope="col">{ORDER_QUEUE_COPY.columns.origin}</th>
          <th scope="col">{ORDER_QUEUE_COPY.columns.status}</th>
          <th scope="col" className="order-table__numeric">
            {ORDER_QUEUE_COPY.columns.total}
          </th>
          <th scope="col">{ORDER_QUEUE_COPY.columns.currency}</th>
          <th scope="col">{ORDER_QUEUE_COPY.columns.createdAt}</th>
          <th scope="col">{ORDER_QUEUE_COPY.columns.request}</th>
          <th scope="col">{ORDER_QUEUE_COPY.columns.customer}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.key} data-testid="order-queue-row">
            <th scope="row" className="order-table__code">
              <Link
                className="order-table__open"
                href={row.detailHref}
                aria-label={`${ORDER_QUEUE_COPY.actions.openOrder}: ${row.code}`}
              >
                {row.code}
              </Link>
            </th>
            <td>
              {/* `912:337`'s `Nguồn` column, on the **existing** badge. The
                  symbol and the word carry the meaning as well as the tone, so
                  the two origins stay distinguishable without colour. */}
              <AdminStatusBadge
                token={row.origin.token}
                label={row.origin.label}
                tone={row.origin.tone}
                symbol={row.origin.symbol}
                testId="order-queue-origin"
              />
            </td>
            <td>
              <AdminStatusBadge
                token={row.status.token}
                label={row.status.label}
                tone={row.status.tone}
                symbol={row.status.symbol}
                testId="order-queue-status"
              />
            </td>
            <td className="order-table__numeric">{row.totalAmount}</td>
            <td>{row.currencyCode}</td>
            <td>
              {/* Machine-readable in `dateTime`, human-readable in the text;
                  neither is derived from the other by guesswork. */}
              <time dateTime={row.createdAt}>{formatInstant(row.createdAt)}</time>
            </td>
            {/* A Ready-Made order was never designed and carries no custom
                request, so there is nothing to open. The cell states the
                absence rather than offering a dead link — `BR-031` says omit
                the custom-only fact and say it is omitted. */}
            <td>
              {row.requestHref === undefined ? (
                <span className="order-table__absent">{ORDER_QUEUE_COPY.actions.noRequest}</span>
              ) : (
                <Link
                  className="order-table__request"
                  href={row.requestHref}
                  aria-label={`${ORDER_QUEUE_COPY.actions.openRequest}: ${row.code}`}
                >
                  {ORDER_QUEUE_COPY.actions.openRequest}
                </Link>
              )}
            </td>
            {/* Shortened for the column; the full id stays available on hover
                and to assistive technology through `title`. There is no route
                behind a customer id, so it is never a link. */}
            <td className="order-table__customer" title={row.customerId}>
              {row.customerShortId}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
