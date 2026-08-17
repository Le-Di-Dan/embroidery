'use client';

/**
 * The queue filter state, held in the URL rather than in a component.
 *
 * The convention `APP2-A02` set and `APP3-A02` followed, reused for the same
 * reason: a narrowed queue is a place an operator bookmarks, reloads and pastes
 * into a message to a colleague. A second way to hold Admin list filters would
 * make this screen behave differently from the other three for no reason.
 *
 * `replace` rather than `push`: narrowing a queue is not a navigation step, and
 * a back button that walked a filter history would be a surprise.
 * `scroll: false` keeps the operator where they were.
 *
 * Reading is total — an arbitrary, repeated or hand-edited parameter normalizes
 * to the default and is never echoed into the DOM.
 */
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo } from 'react';

import {
  normalizeQueueFilters,
  toQueueFilterSearchString,
  DEFAULT_QUEUE_FILTERS,
  QUEUE_FILTER_PARAMS,
  type CustomRequestQueueFilters,
  type QueueStatusFilter,
  type QueueSubjectFilter,
} from '../model/custom-request-queue-filters';

export interface CustomRequestQueueFilterController {
  readonly filters: CustomRequestQueueFilters;
  readonly setStatus: (status: QueueStatusFilter) => void;
  readonly setSubjectKind: (subjectKind: QueueSubjectFilter) => void;
  readonly reset: () => void;
}

export function useCustomRequestQueueFilters(): CustomRequestQueueFilterController {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const filters = useMemo(
    () =>
      normalizeQueueFilters({
        status: searchParams.get(QUEUE_FILTER_PARAMS.status) ?? undefined,
        subject: searchParams.get(QUEUE_FILTER_PARAMS.subjectKind) ?? undefined,
      }),
    [searchParams],
  );

  const apply = useCallback(
    (next: CustomRequestQueueFilters) => {
      const query = toQueueFilterSearchString(next);
      router.replace(query === '' ? pathname : `${pathname}?${query}`, { scroll: false });
    },
    [pathname, router],
  );

  const setStatus = useCallback(
    (status: QueueStatusFilter) => {
      apply({ ...filters, status });
    },
    [apply, filters],
  );

  const setSubjectKind = useCallback(
    (subjectKind: QueueSubjectFilter) => {
      apply({ ...filters, subjectKind });
    },
    [apply, filters],
  );

  // Resets to the defaults, which is the same thing as an empty query string —
  // so the reset affordance and a hand-cleared address bar land in one state.
  const reset = useCallback(() => {
    apply(DEFAULT_QUEUE_FILTERS);
  }, [apply]);

  return { filters, setStatus, setSubjectKind, reset };
}
