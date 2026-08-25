/**
 * Production queue fixtures shaped exactly like the `APP8-B03` list contract.
 *
 * The optional fields are **omitted by default**, because that is what the
 * server actually sends: a `PLANNED` job has no `startedAt`, `completedAt` or
 * `cancelledAt` at all. A fixture that always supplied them would let the queue
 * pass a test the real API could never satisfy — which is exactly the defect the
 * milestone column exists to avoid.
 *
 * The response carries ids, a status and lifecycle timestamps and nothing else.
 * There is deliberately no `orderCode`, no product name, no priority, no
 * operator, no machine and no attempt count here, because
 * `AdminProductionJobQueueItemResponse` publishes none of them — so a screen
 * that rendered one would be caught by the type, not merely by a reviewer.
 *
 * All values are synthetic UUIDs; no real order, customer or admin identifier
 * appears anywhere.
 */
import type {
  AdminProductionJobQueueItemResponse,
  AdminProductionJobQueueResponse,
} from '@embroidery/api-client';

export const JOB_ID = '019a0000-0000-7000-8000-000000006091';
export const JOB_ID_STARTED = '019a0000-0000-7000-8000-000000006092';
export const JOB_ID_COMPLETED = '019a0000-0000-7000-8000-000000006094';
export const JOB_ID_CANCELLED = '019a0000-0000-7000-8000-000000006095';
export const ORDER_ID = '019a0000-0000-7000-8000-000000006081';
export const APPROVAL_SNAPSHOT_ID = '019a0000-0000-7000-8000-000000006031';

/** A `PLANNED` job: created, never started, so it carries no milestone at all. */
export function makeJob(
  overrides: Partial<AdminProductionJobQueueItemResponse> = {},
): AdminProductionJobQueueItemResponse {
  return {
    jobId: JOB_ID,
    orderId: ORDER_ID,
    approvalSnapshotId: APPROVAL_SNAPSHOT_ID,
    status: 'PLANNED',
    createdAt: '2026-08-25T02:00:00.000Z',
    ...overrides,
  };
}

export function makeQueuePage(
  items: AdminProductionJobQueueItemResponse[],
  options: { next?: string } = {},
): AdminProductionJobQueueResponse {
  const { next } = options;
  return {
    items,
    ...(next === undefined ? { hasNext: false } : { hasNext: true, nextCursor: next }),
  };
}

/** The standard success envelope every Admin read arrives in. */
export function envelope<TData>(data: TData) {
  return {
    success: true,
    code: 'OK',
    message: 'ok',
    data,
    meta: { requestId: 'req-app8-a02', timestamp: '2026-08-25T03:00:00.000Z' },
  } as never;
}
