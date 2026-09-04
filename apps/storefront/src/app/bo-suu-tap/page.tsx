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
import { STOREFRONT_GALLERY_ROUTE } from '../../features/storefront-shell';
import { publicPageMetadata, publicPageTitle } from '../../features/storefront-seo';

/**
 * Gallery feed metadata: the title and description it always had, plus the
 * self-canonical and public Open Graph block `APP11-S04` supplies now that an
 * absolute origin exists.
 *
 * The feed takes no filter and keeps no cursor in the URL, so it has exactly one
 * address and the canonical is simply the shell's gallery route.
 *
 * No `og:image`, and specifically not the first entry's cover: the leading card
 * changes whenever an operator reorders the feed, so a social preview built from
 * it would silently re-present the gallery as whatever was published most
 * recently. There is no canonical representative image for the collection as a
 * whole, and inventing one is not this checkpoint's decision to make.
 *
 * No `BreadcrumbList`: this page draws no visible trail, and structured data
 * describes what the page shows.
 */
export function generateMetadata(): Metadata {
  return publicPageMetadata({
    path: STOREFRONT_GALLERY_ROUTE,
    title: publicPageTitle(GALLERY_COPY.heading),
    description: GALLERY_COPY.intro,
  });
}

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
 * `/bo-suu-tap/[slug]` sits beneath this segment as of `APP11-S03`, which added
 * the route and activated the card's detail action in one change.
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
