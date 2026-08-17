/**
 * Queue-page fixtures shaped exactly like the `APP5-B04` contract.
 *
 * `customerDisplayName` and `subjectSummary` are **optional in the contract and
 * omitted by default here**: the server reports a customer who gave no name and
 * a catalog product that no longer resolves as *absent*, not as an empty string.
 * A fixture that always supplied them would let the screen pass a test the real
 * API could never satisfy.
 *
 * `appliedStatuses` is always present, including on an empty page — it is the
 * server's statement of what it filtered by, and the queue's scope line is built
 * from it rather than from the screen's own idea of the default.
 */
import type {
  AdminCustomRequestQueueItemResponse,
  AdminCustomRequestQueueResponse,
} from '@embroidery/api-client';

export const REQUEST_NEW_ID = '01940000-0000-7000-8000-000000000001';
export const REQUEST_REVIEW_ID = '01940000-0000-7000-8000-000000000002';
export const REQUEST_QUOTED_ID = '01940000-0000-7000-8000-000000000003';
export const CUSTOMER_ID = '01930000-0000-7000-8000-0000000000c1';

/** The default triage set `APP5-B04` applies when no `status` is sent. */
export const TRIAGE_APPLIED_STATUSES = ['NEW', 'UNDER_REVIEW', 'NEEDS_CLARIFICATION'];

export function makeQueueItem(
  overrides: Record<string, unknown> = {},
): AdminCustomRequestQueueItemResponse {
  return {
    requestId: REQUEST_NEW_ID,
    code: 'REQ-2026-000123',
    status: 'NEW',
    subjectKind: 'CATALOG',
    subjectSummary: 'Gấu bông thêu tên',
    customerId: CUSTOMER_ID,
    customerDisplayName: 'Chị Lan',
    submittedAt: '2026-08-14T02:30:00.000Z',
    totalQuantity: 12,
    ...overrides,
  } as unknown as AdminCustomRequestQueueItemResponse;
}

export function makeQueuePage(
  items: AdminCustomRequestQueueItemResponse[],
  options: { next?: string; appliedStatuses?: string[] } = {},
): AdminCustomRequestQueueResponse {
  const { next, appliedStatuses = TRIAGE_APPLIED_STATUSES } = options;
  return {
    items,
    appliedStatuses,
    ...(next === undefined ? { hasNext: false } : { hasNext: true, nextCursor: next }),
  } as unknown as AdminCustomRequestQueueResponse;
}

export function queueEnvelope(page: AdminCustomRequestQueueResponse) {
  return {
    success: true,
    code: 'CUSTOM_REQUEST_QUEUE_READ',
    message: 'ok',
    data: page,
    meta: { requestId: 'req-1', timestamp: '2026-08-17T00:00:00.000Z' },
  } as never;
}
