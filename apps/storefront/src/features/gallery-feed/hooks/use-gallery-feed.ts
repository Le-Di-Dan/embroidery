'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { useMemo, useRef } from 'react';

import {
  flattenGalleryPages,
  nextGalleryCursorOf,
  type GalleryFeedCard,
} from '../model/gallery-feed';
import { galleryQueryKeys } from '../model/gallery-query-keys';
import { fetchGalleryPage } from '../services/gallery-feed.client';

export interface GalleryFeed {
  readonly cards: readonly GalleryFeedCard[];
  /** True only while the very first page is in flight (no data yet). */
  readonly isInitialLoading: boolean;
  /** True when the first page failed and nothing is on screen. */
  readonly hasInitialError: boolean;
  readonly isEmpty: boolean;
  readonly hasMore: boolean;
  readonly isLoadingMore: boolean;
  readonly hasContinuationError: boolean;
  /** Requests the next page. Ignored when unusable. */
  readonly loadMore: () => void;
  /** Explicit visitor-initiated replay of the exact cursor that failed. */
  readonly retryContinuation: () => void;
  /** Re-runs the first request after an initial failure. */
  readonly retryInitial: () => void;
}

/**
 * The gallery feed's client state: hydrated first page plus keyset continuation.
 *
 * Continuation is **explicit** here, unlike `/kham-pha`. The Discover feed
 * advances on an IntersectionObserver sentinel; UI05's own loading board draws a
 * control, and an editorial feed of variable-height cards is one a visitor reads
 * deliberately rather than scrolls through. So there is no sentinel, no viewport
 * observer and no auto-load anywhere in this feature — the next page is
 * requested only when the visitor presses the control.
 *
 * Retries are off on purpose. A hidden automatic retry would replay the same
 * cursor without the visitor knowing, turning one failed continuation into
 * several silent requests; the approved copy offers an explicit "Thử lại"
 * instead, and TanStack replays the exact `pageParam` that failed rather than
 * restarting the sequence.
 *
 * Continuation is gated on `hasNext` **and** a usable cursor, computed by
 * `nextGalleryCursorOf`, so the feed cannot request past the last page or loop
 * on a page that claims a successor it did not supply.
 */
export function useGalleryFeed(): GalleryFeed {
  const query = useInfiniteQuery({
    queryKey: galleryQueryKeys.feed(),
    queryFn: ({ pageParam }) => fetchGalleryPage(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: nextGalleryCursorOf,
    retry: false,
  });

  const cards = useMemo(
    () => flattenGalleryPages(query.data?.pages ?? []),
    // `pages` identity changes only when a page is appended, so the flatten and
    // its dedupe run once per page rather than on every render.
    [query.data?.pages],
  );

  const hasLoadedSomething = query.data !== undefined;
  const pages = query.data?.pages;
  const cursor = nextGalleryCursorOf(pages?.[pages.length - 1]);

  /**
   * The cursor currently being requested.
   *
   * `isFetchingNextPage` is render state, so two presses landing in one
   * synchronous batch would both read the same stale `false` and each start a
   * request for the same cursor. A ref is updated immediately, which is what
   * actually enforces "one request at a time".
   */
  const inFlightCursorRef = useRef<string | undefined>(undefined);

  const canLoadMore = query.hasNextPage && !query.isFetchingNextPage && !query.isFetchNextPageError;

  function requestPage(): void {
    if (cursor === undefined) return;
    inFlightCursorRef.current = cursor;
    void query.fetchNextPage().finally(() => {
      if (inFlightCursorRef.current === cursor) inFlightCursorRef.current = undefined;
    });
  }

  return {
    cards,
    isInitialLoading: query.isPending,
    hasInitialError: query.isError && !hasLoadedSomething,
    isEmpty: hasLoadedSomething && cards.length === 0,
    hasMore: query.hasNextPage,
    isLoadingMore: query.isFetchingNextPage,
    hasContinuationError: query.isFetchNextPageError,
    loadMore: () => {
      if (!canLoadMore) return;
      if (inFlightCursorRef.current === cursor) return;
      requestPage();
    },
    retryContinuation: () => {
      if (query.isFetchingNextPage || !query.hasNextPage) return;
      // Explicitly requested, so the in-flight guard is released first. TanStack
      // replays the same `pageParam` that failed, so the retry sends the exact
      // cursor rather than restarting the sequence.
      inFlightCursorRef.current = undefined;
      requestPage();
    },
    retryInitial: () => {
      void query.refetch();
    },
  };
}
