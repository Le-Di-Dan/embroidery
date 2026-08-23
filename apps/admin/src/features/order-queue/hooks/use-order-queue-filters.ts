'use client';

/**
 * The queue filter state, held in the URL rather than in a component.
 *
 * The convention `APP2-A02` set and `APP3-A02`/`APP5-A01` followed, reused for
 * the same reason: a narrowed queue is a place an operator bookmarks, reloads
 * and pastes into a message to a colleague. A second way to hold Admin list
 * filters would make this screen behave differently from the other four for no
 * reason.
 *
 * `replace` rather than `push`: narrowing a queue is not a navigation step, and
 * a back button that walked a filter history would be a surprise.
 * `scroll: false` keeps the operator where they were.
 *
 * Reading is total — an arbitrary, repeated or hand-edited parameter is dropped
 * and never echoed into the DOM. `getAll` is what makes the **repeatable**
 * parameter readable at all: `get` would see only the first of several, so a
 * two-status URL would come back as a one-status queue.
 */
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo } from 'react';

import {
  DEFAULT_ORDER_QUEUE_FILTERS,
  ORDER_QUEUE_STATUS_PARAM,
  normalizeOrderQueueFilters,
  toOrderQueueSearchString,
  toggleOrderStatus,
  type OrderQueueFilters,
  type OrderStatusFilterValue,
} from '../model/order-queue-filters';

export interface OrderQueueFilterController {
  readonly filters: OrderQueueFilters;
  readonly toggleStatus: (status: OrderStatusFilterValue) => void;
  readonly reset: () => void;
}

export function useOrderQueueFilters(): OrderQueueFilterController {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const filters = useMemo(
    () => normalizeOrderQueueFilters(searchParams.getAll(ORDER_QUEUE_STATUS_PARAM)),
    [searchParams],
  );

  const apply = useCallback(
    (next: OrderQueueFilters) => {
      const query = toOrderQueueSearchString(next);
      router.replace(query === '' ? pathname : `${pathname}?${query}`, { scroll: false });
    },
    [pathname, router],
  );

  const toggleStatus = useCallback(
    (status: OrderStatusFilterValue) => {
      apply(toggleOrderStatus(filters, status));
    },
    [apply, filters],
  );

  // Resets to the default, which is the same thing as an empty query string —
  // so the reset affordance and a hand-cleared address bar land in one state.
  const reset = useCallback(() => {
    apply(DEFAULT_ORDER_QUEUE_FILTERS);
  }, [apply]);

  return { filters, toggleStatus, reset };
}
