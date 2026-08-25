'use client';

/**
 * The queue filter state, held in the URL rather than in a component.
 *
 * The convention `APP2-A02` set and `APP3-A02`/`APP5-A01`/`APP7-A01` followed,
 * reused for the same reason: a narrowed queue is a place an operator bookmarks,
 * reloads and pastes into a message to a colleague. A second way to hold Admin
 * list filters would make this screen behave differently from the other five for
 * no reason, and there is no Zustand copy of any of it — server state has one
 * home and query state has one home.
 *
 * `replace` rather than `push`: narrowing a queue is not a navigation step, and
 * a back button that walked a filter history would be a surprise. `scroll:
 * false` keeps the operator where they were.
 *
 * Reading is total — an arbitrary, repeated or hand-edited parameter is dropped
 * and never echoed into the DOM. `getAll` is what makes the **repeatable**
 * `status` readable at all: `get` would see only the first of several, so a
 * two-status URL would come back as a one-status queue.
 *
 * There is no cursor in the URL, and deliberately so: the cursor is `useInfiniteQuery`'s
 * page parameter, so a bookmarked address always reads from the first page and a
 * stale cursor cannot be pasted into one. What the URL carries is exactly what
 * the operator chose.
 */
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo } from 'react';

import {
  DEFAULT_PRODUCTION_QUEUE_FILTERS,
  PRODUCTION_QUEUE_ORDER_PARAM,
  PRODUCTION_QUEUE_STATUS_PARAM,
  normalizeProductionQueueFilters,
  toProductionQueueSearchString,
  toggleProductionStatus,
  withOrderFilter,
  withoutOrderFilter,
  withoutStatusFilter,
  type ProductionQueueFilters,
} from '../model/production-queue-filters';
import type { ProductionStatusValue } from '../model/production-status';

export interface ProductionQueueFilterController {
  readonly filters: ProductionQueueFilters;
  readonly toggleStatus: (status: ProductionStatusValue) => void;
  readonly setOrderId: (orderId: string) => void;
  readonly clearStatuses: () => void;
  readonly clearOrderId: () => void;
  readonly clearAll: () => void;
}

export function useProductionQueueFilters(): ProductionQueueFilterController {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const filters = useMemo(
    () =>
      normalizeProductionQueueFilters(
        searchParams.getAll(PRODUCTION_QUEUE_STATUS_PARAM),
        searchParams.get(PRODUCTION_QUEUE_ORDER_PARAM),
      ),
    [searchParams],
  );

  const apply = useCallback(
    (next: ProductionQueueFilters) => {
      const query = toProductionQueueSearchString(next);
      router.replace(query === '' ? pathname : `${pathname}?${query}`, { scroll: false });
    },
    [pathname, router],
  );

  const toggleStatus = useCallback(
    (status: ProductionStatusValue) => {
      apply(toggleProductionStatus(filters, status));
    },
    [apply, filters],
  );

  // Only a value the accepted schema would take reaches the URL. A partially
  // typed id is a draft the field holds, not a filter the queue is under, so it
  // never addresses a cache entry and never becomes a request.
  const setOrderId = useCallback(
    (orderId: string) => {
      apply(withOrderFilter(filters, orderId));
    },
    [apply, filters],
  );

  const clearStatuses = useCallback(() => {
    apply(withoutStatusFilter(filters));
  }, [apply, filters]);

  const clearOrderId = useCallback(() => {
    apply(withoutOrderFilter(filters));
  }, [apply, filters]);

  // Resets to the default, which is the same thing as an empty query string —
  // so the reset affordance and a hand-cleared address bar land in one state.
  const clearAll = useCallback(() => {
    apply(DEFAULT_PRODUCTION_QUEUE_FILTERS);
  }, [apply]);

  return { filters, toggleStatus, setOrderId, clearStatuses, clearOrderId, clearAll };
}
