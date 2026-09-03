/**
 * The queue row view model, and pure page accumulation around it.
 *
 * The row component never sees the raw response. `orderId` survives only as the
 * detail address and `customRequestId` only as the link back to the request the
 * order was created from — by the time a component can reach either, it is an
 * `href`. The customer id has no route behind it at all, so it is shortened for
 * display (`732:3` renders `7c19…8b41`) and kept in full only as the cell's
 * `title`: `APP7-B02` publishes no customer name, and a full UUID in a table
 * cell pushes every other column out of the way.
 *
 * ### The total is transported, never recomputed
 *
 * `totalAmount` arrives as a decimal string and stays one. Nothing here sums,
 * multiplies, rounds or converts it — a VND figure through an IEEE-754 double
 * is precision loss no later formatting can undo. The formatter groups digits
 * and cannot change the value it was handed. The currency is the order's own
 * `currencyCode`, rendered in its own column exactly as `732:3` draws it, never
 * a constant this screen chose.
 *
 * ### Page accumulation
 *
 * The list is cursor-paginated, so a concurrent order creation can shift the
 * keyset window and put one order on two pages. Rendering it twice would be a
 * lie about the queue and re-sorting would move rows under the operator's
 * cursor — so the first occurrence wins and the server's newest-first order is
 * never disturbed.
 */
import type { AdminOrderQueueItemResponse, AdminOrderQueueResponse } from '@embroidery/api-client';

import { truncateIdentifier } from '../../../shared/presentation/identifier';
import {
  presentOrderOrigin,
  type OriginPresentation,
} from '../../../shared/presentation/order-origin';
import {
  presentOrderStatus,
  type StatusPresentation,
} from '../../../shared/presentation/order-status';
import { formatGroupedAmount } from '../../../shared/presentation/exact-amount';
import { adminOrderDetailRoute } from './order-queue-route';

/** The Admin request detail address `APP5-A01` owns; the queue only links to it. */
const ADMIN_REQUEST_DETAIL_PREFIX = '/requests';

export interface OrderQueueRow {
  /** Stable render identity. Not rendered as text. */
  readonly key: string;
  readonly code: string;
  readonly status: StatusPresentation;
  /**
   * The order-origin badge (`APP12-A02-C1`, `912:337`).
   *
   * Read from the contract's own `origin` and nothing else — never inferred
   * from the status, from a missing `customRequestId` or from a payment fact.
   */
  readonly origin: OriginPresentation;
  /** The frozen total, grouped for reading. Never re-summed. */
  readonly totalAmount: string;
  readonly currencyCode: string;
  /** The raw ISO instant, for the machine-readable `dateTime` attribute. */
  readonly createdAt: string;
  readonly detailHref: string;
  /**
   * The request this order was created from, where there is one.
   *
   * Absent on a Ready-Made order: it was never designed and carries no custom
   * request, so there is nothing to navigate to.
   */
  readonly requestHref: string | undefined;
  /** Shortened for the cell; the full value is the cell's `title`. */
  readonly customerShortId: string;
  readonly customerId: string;
}

export function toOrderQueueRow(item: AdminOrderQueueItemResponse): OrderQueueRow {
  return {
    key: item.orderId,
    code: item.code,
    status: presentOrderStatus(item.status),
    origin: presentOrderOrigin(item.origin),
    totalAmount: formatGroupedAmount(item.totalAmount),
    currencyCode: item.currencyCode,
    createdAt: item.createdAt,
    detailHref: adminOrderDetailRoute(item.orderId),
    // Built only where the id exists. A template over an absent id would
    // navigate an operator to `/requests/undefined`.
    requestHref:
      item.customRequestId === undefined
        ? undefined
        : `${ADMIN_REQUEST_DETAIL_PREFIX}/${item.customRequestId}`,
    customerShortId: truncateIdentifier(item.customerId),
    customerId: item.customerId,
  };
}

/** Flattens accumulated pages in server order, first occurrence winning. */
export function flattenOrderQueuePages(
  pages: readonly AdminOrderQueueResponse[],
): readonly OrderQueueRow[] {
  const seen = new Set<string>();
  const rows: OrderQueueRow[] = [];
  for (const page of pages) {
    for (const item of page.items) {
      if (seen.has(item.orderId)) {
        continue;
      }
      seen.add(item.orderId);
      rows.push(toOrderQueueRow(item));
    }
  }
  return rows;
}

/**
 * The cursor for the next request, or `undefined` when the queue is exhausted.
 *
 * Both parts of the contract must hold: `hasNext` alone is not a cursor, and a
 * stale `nextCursor` on a last page is not a continuation. The value is opaque —
 * it is passed back exactly as issued and never parsed into a page number.
 */
export function resolveOrderNextCursor(
  page: AdminOrderQueueResponse | undefined,
): string | undefined {
  if (page === undefined || !page.hasNext) {
    return undefined;
  }
  return typeof page.nextCursor === 'string' && page.nextCursor !== ''
    ? page.nextCursor
    : undefined;
}
