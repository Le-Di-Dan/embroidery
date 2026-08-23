/**
 * The query-key factory for the Admin order queue.
 *
 * A key carries the page size and the selected statuses, and nothing else. It is
 * serialized into the cache, so a credential, an `AbortSignal`, a cursor or a
 * raw error would outlive the request that produced it and must never appear
 * here. The cursor in particular: a key that contained it would make every page
 * its own cache entry and defeat the accumulation `useInfiniteQuery` provides.
 *
 * The selected statuses are part of the key on purpose — changing the filter
 * addresses a different entry, which is what makes "reset the cursor chain,
 * fetch a fresh first page, never merge pages across filters" structural rather
 * than a rule a component has to remember. They are stored already sorted so
 * two orders of the same selection are one cache entry rather than two.
 */
import type { OrderQueueFilters } from './order-queue-filters';

/** Client request size for one page; the contract allows 1–100. */
export const ORDER_QUEUE_PAGE_SIZE = 20;

const ROOT = ['admin', 'orders'] as const;

export const orderQueueKeys = {
  all: ROOT,
  /** The root every queue page lives under — what a payment decision invalidates. */
  lists: () => [...ROOT, 'queue'] as const,
  list: (filters: OrderQueueFilters, pageSize: number = ORDER_QUEUE_PAGE_SIZE) =>
    [...ROOT, 'queue', { pageSize, statuses: [...filters.statuses].sort() }] as const,
} as const;
