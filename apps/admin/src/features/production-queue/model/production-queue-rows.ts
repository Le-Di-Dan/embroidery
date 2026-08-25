/**
 * The queue row view model, and pure page accumulation around it.
 *
 * The row component never sees the raw response. `jobId` survives as the detail
 * address and as a shortened display handle; `orderId` and `approvalSnapshotId`
 * are shortened for their cells with the full value kept in `title`, exactly as
 * `780:50`…`780:52` draw them. `APP8-B03` publishes no display name for any of
 * the three — and no `orderCode` at all — so nothing here invents one and
 * nothing opens a second read to find one.
 *
 * ### The queue's facts, and only the queue's facts
 *
 * There is no product name, no variant, no area, no quantity, no priority, no
 * operator, no machine and no attempt count on this row, because
 * `AdminProductionJobQueueItemResponse` publishes none of them. The frozen
 * specification exists on the **detail** contract; a column here would have to
 * be filled by a per-row Catalog or order read, which is the N+1 the design
 * package explicitly refused (`788:179`).
 *
 * ### The milestone is selected, never computed
 *
 * `780:57` renders one "most recent milestone" per row. It is chosen by
 * lifecycle precedence over the timestamps the server actually sent —
 * cancelled, then completed, then started — rather than by comparing instants:
 * the states are ordered by the lifecycle, and a clock comparison would let two
 * timestamps a millisecond apart reorder the meaning of a row. A `PLANNED` job
 * has no milestone and renders an em dash, which is the absence of an event and
 * not an unknown value.
 *
 * ### Page accumulation
 *
 * The list is cursor-paginated, so a concurrent job creation can shift the
 * keyset window and put one job on two pages. Rendering it twice would be a lie
 * about the queue and re-sorting would move rows under the operator's cursor —
 * so the first occurrence wins and the server's newest-first order is never
 * disturbed.
 */
import type {
  AdminProductionJobQueueItemResponse,
  AdminProductionJobQueueResponse,
} from '@embroidery/api-client';

import { truncateIdentifier } from '../../../shared/presentation/identifier';
import { PRODUCTION_QUEUE_COPY } from './production-queue-copy';
import { adminProductionJobRoute } from './production-queue-route';
import { presentProductionStatus, type ProductionStatusPresentation } from './production-status';

export interface ProductionMilestone {
  /** The raw ISO instant, for the machine-readable `dateTime` attribute. */
  readonly at: string;
  /** The approved verb: "bắt đầu", "xong" or "huỷ". */
  readonly verb: string;
}

export interface ProductionQueueRow {
  /** Stable render identity. Not rendered as text. */
  readonly key: string;
  readonly jobId: string;
  readonly jobShortId: string;
  readonly orderId: string;
  readonly orderShortId: string;
  readonly approvalSnapshotId: string;
  readonly approvalShortId: string;
  readonly status: ProductionStatusPresentation;
  /** The raw ISO instant, for the machine-readable `dateTime` attribute. */
  readonly createdAt: string;
  /** The one lifecycle event to show, or `undefined` for a job that has none. */
  readonly milestone: ProductionMilestone | undefined;
  readonly detailHref: string;
}

function resolveMilestone(
  item: AdminProductionJobQueueItemResponse,
): ProductionMilestone | undefined {
  const { milestones } = PRODUCTION_QUEUE_COPY;
  if (item.cancelledAt !== undefined) {
    return { at: item.cancelledAt, verb: milestones.cancelled };
  }
  if (item.completedAt !== undefined) {
    return { at: item.completedAt, verb: milestones.completed };
  }
  if (item.startedAt !== undefined) {
    return { at: item.startedAt, verb: milestones.started };
  }
  return undefined;
}

export function toProductionQueueRow(
  item: AdminProductionJobQueueItemResponse,
): ProductionQueueRow {
  return {
    key: item.jobId,
    jobId: item.jobId,
    jobShortId: truncateIdentifier(item.jobId),
    orderId: item.orderId,
    orderShortId: truncateIdentifier(item.orderId),
    approvalSnapshotId: item.approvalSnapshotId,
    approvalShortId: truncateIdentifier(item.approvalSnapshotId),
    status: presentProductionStatus(item.status),
    createdAt: item.createdAt,
    milestone: resolveMilestone(item),
    detailHref: adminProductionJobRoute(item.jobId),
  };
}

/** Flattens accumulated pages in server order, first occurrence winning. */
export function flattenProductionQueuePages(
  pages: readonly AdminProductionJobQueueResponse[],
): readonly ProductionQueueRow[] {
  const seen = new Set<string>();
  const rows: ProductionQueueRow[] = [];
  for (const page of pages) {
    for (const item of page.items) {
      if (seen.has(item.jobId)) {
        continue;
      }
      seen.add(item.jobId);
      rows.push(toProductionQueueRow(item));
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
export function resolveProductionNextCursor(
  page: AdminProductionJobQueueResponse | undefined,
): string | undefined {
  if (page === undefined || !page.hasNext) {
    return undefined;
  }
  return typeof page.nextCursor === 'string' && page.nextCursor !== ''
    ? page.nextCursor
    : undefined;
}
