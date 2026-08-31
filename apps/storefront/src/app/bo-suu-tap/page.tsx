import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query';
import type { Metadata } from 'next';

import {
  GalleryFeedScreen,
  GalleryIntro,
  GalleryQueryProvider,
  GALLERY_COPY,
  galleryQueryKeys,
  nextGalleryCursorOf,
} from '../../features/gallery-feed';
import { fetchFirstGalleryPageOnServer } from '../../features/gallery-feed/services/gallery-feed.server';

/**
 * Static, source-grounded metadata — title and description only.
 *
 * No `metadataBase`, canonical, robots directive, Open Graph block or
 * structured data: `APP11-S03` owns per-entry SEO and `APP11-S04` owns the
 * technical SEO infrastructure. A canonical invented here would lock an absolute
 * origin neither checkpoint has settled.
 */
export const metadata: Metadata = {
  title: `${GALLERY_COPY.heading} — Xưởng Thêu`,
  description: GALLERY_COPY.intro,
};

/**
 * `force-dynamic` renders this segment per request and forbids a build-time or
 * full-route cached copy. That is a correctness requirement rather than a
 * performance preference: `APP11-B03` re-reads publication and image
 * eligibility on every request precisely because nothing in this system
 * invalidates a cache, so a stored page could keep showing an entry the operator
 * has unpublished or a cover whose bytes have been withdrawn.
 */
export const dynamic = 'force-dynamic';

/**
 * `/bo-suu-tap` — the anonymous public gallery feed.
 *
 * A thin server segment: it seeds the first keyset page into a request-scoped
 * `QueryClient` and hands the dehydrated cache to the client island, so the
 * first page is present in the server-rendered HTML and only continuation is
 * hydrated behaviour. There is no `searchParams` to resolve — the feed takes no
 * filter, and the cursor lives in the query cache rather than the URL.
 *
 * The prefetch absorbs its own failure by design: a first request that cannot
 * reach the API dehydrates nothing, the client issues it again, and a genuine
 * outage surfaces as the approved "Không thể tải bộ sưu tập" state rather than
 * as a rendered error page.
 *
 * There is no `/bo-suu-tap/[slug]` beneath this segment. `APP11-S03` adds it and
 * activates card navigation in the same change.
 */
export default async function GalleryFeedPage() {
  const queryClient = new QueryClient();

  await queryClient.prefetchInfiniteQuery({
    queryKey: galleryQueryKeys.feed(),
    queryFn: fetchFirstGalleryPageOnServer,
    initialPageParam: undefined as string | undefined,
    getNextPageParam: nextGalleryCursorOf,
  });

  return (
    <div className="gallery-feed">
      <GalleryIntro />
      <GalleryQueryProvider>
        <HydrationBoundary state={dehydrate(queryClient)}>
          <GalleryFeedScreen />
        </HydrationBoundary>
      </GalleryQueryProvider>
    </div>
  );
}
