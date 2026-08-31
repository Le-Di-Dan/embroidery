'use client';

/**
 * The list filter state, held in the URL rather than in a component.
 *
 * The convention `APP2-A02` set and `APP3-A02`/`APP5-A01`/`APP7-A01`/`APP8-A02`
 * followed, reused for the same reason: a narrowed list is a place an operator
 * bookmarks, reloads and pastes into a message to a colleague. A second way to
 * hold Admin list filters would make this screen behave differently from the
 * other six for no reason, and there is no Zustand copy of any of it — server
 * state has one home and query state has one home.
 *
 * `replace` rather than `push`: narrowing a list is not a navigation step, and a
 * back button that walked a filter history would be a surprise. `scroll: false`
 * keeps the operator where they were.
 *
 * Reading is total — an arbitrary, repeated or hand-edited parameter normalizes
 * to "no filter" and is never echoed into the DOM. `getAll` is what makes a
 * repeated parameter *visible* at all: `get` would see only the first of
 * several and silently filter by a value the operator never chose, whereas
 * `APP11-B01` accepts **one** optional status, so a URL naming two has named
 * none this screen can honour.
 *
 * There is no cursor in the URL, and deliberately so: the cursor is
 * `useInfiniteQuery`'s page parameter, so a bookmarked address always reads
 * from the first page and a stale cursor cannot be pasted into one. What the
 * URL carries is exactly what the operator chose.
 */
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo } from 'react';

import {
  GALLERY_LIST_STATUS_PARAM,
  DEFAULT_GALLERY_LIST_FILTERS,
  normalizeGalleryListFilters,
  toGalleryListSearchString,
  type GalleryListFilters,
  type GalleryStatusFilter,
} from '../model/gallery-list-filters';

export interface GalleryListFilterController {
  readonly filters: GalleryListFilters;
  readonly setStatus: (status: GalleryStatusFilter) => void;
  readonly clearAll: () => void;
}

export function useGalleryListFilters(): GalleryListFilterController {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const filters = useMemo(
    () => normalizeGalleryListFilters(searchParams.getAll(GALLERY_LIST_STATUS_PARAM)),
    [searchParams],
  );

  const apply = useCallback(
    (next: GalleryListFilters) => {
      const query = toGalleryListSearchString(next);
      router.replace(query === '' ? pathname : `${pathname}?${query}`, { scroll: false });
    },
    [pathname, router],
  );

  // Changing the status addresses a different cache entry, so the cursor chain
  // is unreachable and the list starts again from the first page. That is a
  // consequence of the key rather than a reset this hook performs.
  const setStatus = useCallback(
    (status: GalleryStatusFilter) => {
      apply({ status });
    },
    [apply],
  );

  // Resets to the default, which is the same thing as an empty query string —
  // so the reset affordance and a hand-cleared address bar land in one state.
  const clearAll = useCallback(() => {
    apply(DEFAULT_GALLERY_LIST_FILTERS);
  }, [apply]);

  return { filters, setStatus, clearAll };
}
