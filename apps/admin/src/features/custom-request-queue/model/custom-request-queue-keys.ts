/**
 * The query-key factory for the Admin custom-request queue.
 *
 * A key carries the page size and the two filter values and nothing else. It is
 * serialized into the cache, so a credential, an `AbortSignal`, a cursor or a
 * raw error would outlive the request that produced it and must never appear
 * here. The cursor in particular: a key that contained it would make every page
 * its own cache entry and defeat the accumulation `useInfiniteQuery` provides.
 *
 * The filters are part of the key on purpose — changing one addresses a
 * different entry, which is what makes "reset the cursor chain, fetch a fresh
 * first page, never merge pages across filters" structural rather than a rule a
 * component has to remember.
 */
import type { CustomRequestQueueFilters } from './custom-request-queue-filters';

/** Client request size for one page; the contract allows 1–100. */
export const CUSTOM_REQUEST_QUEUE_PAGE_SIZE = 20;

const ROOT = ['admin', 'custom-requests'] as const;

export const customRequestQueueKeys = {
  all: ROOT,
  lists: () => [...ROOT, 'queue'] as const,
  list: (filters: CustomRequestQueueFilters, pageSize: number = CUSTOM_REQUEST_QUEUE_PAGE_SIZE) =>
    [
      ...ROOT,
      'queue',
      { pageSize, status: filters.status, subjectKind: filters.subjectKind },
    ] as const,
} as const;
