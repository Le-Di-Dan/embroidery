'use client';

import { useDiscoverFeed } from '../hooks/use-discover-feed';
import type { DiscoverCategorySlug } from '../model/discover-categories';
import { DiscoverContinuation } from './discover-continuation';
import { DiscoverEmptyFiltered } from './discover-empty-filtered';
import { DiscoverEmptyUnfiltered } from './discover-empty-unfiltered';
import { DiscoverInitialError } from './discover-initial-error';
import { DiscoverInitialLoading } from './discover-initial-loading';
import { ProductMasonry } from './product-masonry';

interface DiscoverFeedScreenProps {
  /** Resolved by the server from the URL; `undefined` means the unfiltered feed. */
  readonly categorySlug: DiscoverCategorySlug | undefined;
}

/**
 * The Discover feed's client island: hydrated pages, scroll continuation and the
 * non-product states.
 *
 * The selection arrives as a **prop from the server**, not from `useSearchParams`.
 * Category chips are ordinary links, so a chip click re-runs the server page,
 * which resolves the URL and fetches the matching first page; this island then
 * mounts against a query key that already contains the new category. That is
 * what makes a category change start a fresh cursor sequence — required, because
 * `APP2-B04` rejects a cursor replayed under a different filter.
 *
 * During server rendering the hydrated first page is already in the cache, so
 * the products below are part of the initial HTML rather than something the
 * browser fetches after hydration.
 */
export function DiscoverFeedScreen({ categorySlug }: DiscoverFeedScreenProps) {
  const feed = useDiscoverFeed(categorySlug);

  if (feed.isInitialLoading) return <DiscoverInitialLoading />;
  if (feed.hasInitialError) return <DiscoverInitialError onRetry={feed.retryInitial} />;
  if (feed.isEmpty) {
    return categorySlug === undefined ? <DiscoverEmptyUnfiltered /> : <DiscoverEmptyFiltered />;
  }

  return (
    <>
      <ProductMasonry cards={feed.cards} />
      <DiscoverContinuation
        hasMore={feed.hasMore}
        isLoading={feed.isLoadingMore}
        hasError={feed.hasContinuationError}
        onLoadMore={feed.loadMore}
        onRetry={feed.retryContinuation}
      />
    </>
  );
}
