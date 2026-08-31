'use client';

import { useGalleryFeed } from '../hooks/use-gallery-feed';
import { GalleryContinuation } from './gallery-continuation';
import { GalleryEmpty } from './gallery-empty';
import { GalleryInitialError } from './gallery-initial-error';
import { GalleryInitialLoading } from './gallery-initial-loading';
import { GalleryMasonry } from './gallery-masonry';

/**
 * The gallery feed's client island: the hydrated first page, explicit keyset
 * continuation, and the three non-entry states.
 *
 * The feed takes no selection — `APP11-B03` publishes only `limit` and `cursor`,
 * so there is nothing for a URL to carry and nothing for this component to read
 * from one. That is also why the query key is constant and why no filter state
 * exists to fake.
 *
 * During server rendering the hydrated first page is already in the cache, so
 * the cards below are part of the initial HTML rather than something the browser
 * fetches after hydration. The initial-loading branch is reached only when the
 * server prefetch failed and the client is retrying.
 *
 * The `<h1>` is **not** here: `GalleryIntro` renders it as a Server Component
 * above this island, so the page has its heading even while the feed resolves
 * and in every one of these branches.
 */
export function GalleryFeedScreen() {
  const feed = useGalleryFeed();

  if (feed.isInitialLoading) return <GalleryInitialLoading />;
  if (feed.hasInitialError) return <GalleryInitialError onRetry={feed.retryInitial} />;
  if (feed.isEmpty) return <GalleryEmpty />;

  return (
    <>
      <GalleryMasonry cards={feed.cards} />
      <GalleryContinuation
        hasMore={feed.hasMore}
        isLoading={feed.isLoadingMore}
        hasError={feed.hasContinuationError}
        onLoadMore={feed.loadMore}
        onRetry={feed.retryContinuation}
      />
    </>
  );
}
