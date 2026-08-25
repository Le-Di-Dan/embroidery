/**
 * The query-key factory for the Admin production queue.
 *
 * A key carries the page size and the two filters, and nothing else. It is
 * serialized into the cache, so a credential, an `AbortSignal`, a cursor or a
 * raw error would outlive the request that produced it and must never appear
 * here. The cursor in particular: a key that contained it would make every page
 * its own cache entry and defeat the accumulation `useInfiniteQuery` provides.
 *
 * The filters are part of the key on purpose — changing one addresses a
 * different entry, which is what makes "reset the cursor chain, fetch a fresh
 * first page, never merge pages across filters" structural rather than a rule a
 * component has to remember. The statuses are stored already sorted so two
 * orders of the same selection are one cache entry rather than two.
 */
import type { ProductionQueueFilters } from './production-queue-filters';

/** Client request size for one page; the contract allows 1–100. */
export const PRODUCTION_QUEUE_PAGE_SIZE = 20;

const ROOT = ['admin', 'production-jobs'] as const;

export const productionQueueKeys = {
  all: ROOT,
  /** The root every queue page lives under — what a future transition invalidates. */
  lists: () => [...ROOT, 'queue'] as const,
  list: (filters: ProductionQueueFilters, pageSize: number = PRODUCTION_QUEUE_PAGE_SIZE) =>
    [
      ...ROOT,
      'queue',
      {
        pageSize,
        statuses: [...filters.statuses].sort(),
        orderId: filters.orderId ?? null,
      },
    ] as const,
} as const;
