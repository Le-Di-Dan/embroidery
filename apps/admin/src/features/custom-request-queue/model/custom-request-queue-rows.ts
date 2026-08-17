/**
 * The queue row view model, and pure page accumulation around it.
 *
 * The row component never sees the raw response. `customerId` is not part of the
 * projection at all — nothing on this screen addresses a customer — and
 * `requestId` survives only as the detail-route key, which is why it is named
 * `detailHref` by the time a component can reach it. An operator-facing raw
 * identifier would be noise at best and a leak of internal identity at worst.
 *
 * An absent `customerDisplayName` or `subjectSummary` is a fact the server
 * stated (the customer gave no name; the catalog product no longer resolves), so
 * it is presented as such rather than filled in with a guess.
 *
 * The list is cursor-paginated, so a concurrent submission can shift the keyset
 * window and put one request on two pages. Rendering it twice would be a lie
 * about the queue and re-sorting would move rows under the operator's cursor —
 * so the first occurrence wins and the server's `created_at DESC, id DESC` order
 * is never disturbed.
 */
import type {
  AdminCustomRequestQueueItemResponse,
  AdminCustomRequestQueueResponse,
} from '@embroidery/api-client';

import { CUSTOM_REQUEST_QUEUE_COPY } from './custom-request-queue-copy';
import { adminCustomRequestDetailRoute } from './custom-request-queue-route';
import {
  presentStatus,
  subjectKindLabel,
  type StatusPresentation,
} from './custom-request-presentation';

export interface CustomRequestQueueRow {
  /** Stable render identity. Not rendered as text. */
  readonly key: string;
  readonly code: string;
  readonly status: StatusPresentation;
  readonly subjectKindLabel: string;
  readonly subjectSummary: string;
  readonly customerDisplayName: string;
  /** The raw ISO instant, for the machine-readable `dateTime` attribute. */
  readonly submittedAt: string;
  readonly totalQuantity: number;
  /** The only place `requestId` survives: the detail address. */
  readonly detailHref: string;
}

export function toQueueRow(item: AdminCustomRequestQueueItemResponse): CustomRequestQueueRow {
  return {
    key: item.requestId,
    code: item.code,
    status: presentStatus(item.status),
    subjectKindLabel: subjectKindLabel(item.subjectKind),
    subjectSummary: item.subjectSummary ?? CUSTOM_REQUEST_QUEUE_COPY.subject.missingSummary,
    customerDisplayName: item.customerDisplayName ?? CUSTOM_REQUEST_QUEUE_COPY.customer.unnamed,
    submittedAt: item.submittedAt,
    totalQuantity: item.totalQuantity,
    detailHref: adminCustomRequestDetailRoute(item.requestId),
  };
}

/** Flattens accumulated pages in server order, first occurrence winning. */
export function flattenQueuePages(
  pages: readonly AdminCustomRequestQueueResponse[],
): readonly CustomRequestQueueRow[] {
  const seen = new Set<string>();
  const rows: CustomRequestQueueRow[] = [];
  for (const page of pages) {
    for (const item of page.items) {
      if (seen.has(item.requestId)) {
        continue;
      }
      seen.add(item.requestId);
      rows.push(toQueueRow(item));
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
export function resolveNextCursor(
  page: AdminCustomRequestQueueResponse | undefined,
): string | undefined {
  if (page === undefined || !page.hasNext) {
    return undefined;
  }
  return typeof page.nextCursor === 'string' && page.nextCursor !== ''
    ? page.nextCursor
    : undefined;
}

/**
 * The server's ISO instant in the operator's locale — the convention `APP3-A02`
 * set for Admin lists, reused rather than replaced.
 *
 * The raw value is preserved in the caller's `dateTime` attribute either way, so
 * an unparseable instant degrades to being shown verbatim rather than to
 * "Invalid Date".
 */
export function formatInstant(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return iso;
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(at);
}
