import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import {
  DiscoverCategoryNav,
  DiscoverFeedScreen,
  DiscoverIntro,
  DiscoverQueryProvider,
  DISCOVER_COPY,
  discoverQueryKeys,
  nextCursorOf,
  resolveDiscoverSelection,
  selectionSlug,
  type DiscoverSearchParams,
} from '../../features/product-discovery';
import { fetchFirstDiscoverPageOnServer } from '../../features/product-discovery/services/discover-catalog.server';

/**
 * Static, source-grounded metadata. No canonical URL and no structured product
 * data: the Product Detail route is unresolved (IMP-D038), and a canonical or
 * an item URL invented here would quietly lock a path the Product Owner has not
 * approved.
 */
export const metadata: Metadata = {
  title: `${DISCOVER_COPY.heading} — Xưởng Thêu`,
  description: DISCOVER_COPY.intro,
};

/**
 * `force-dynamic` renders this segment per request and forbids a build-time or
 * full-route cached copy. That is a correctness requirement rather than a
 * performance preference: publication is re-read on every API request precisely
 * because nothing in this system invalidates a cache, so a stored page could
 * keep showing a product the operator has unpublished.
 */
export const dynamic = 'force-dynamic';

interface DiscoverPageProps {
  readonly searchParams: Promise<DiscoverSearchParams>;
}

/**
 * `/kham-pha` — the anonymous Discover feed (IMP-D038).
 *
 * A thin server segment: it resolves the category from the URL, seeds the
 * matching first keyset page into a request-scoped `QueryClient`, and hands the
 * dehydrated cache to the client island. The first page is therefore present in
 * the server-rendered HTML; only continuation is hydrated behaviour.
 *
 * An unknown or repeated `?category=` value takes the approved not-found
 * boundary rather than silently rendering everything, so a stale or mistyped
 * link never answers a question the visitor did not ask.
 *
 * The prefetch absorbs its own failure by design: a first request that cannot
 * reach the API dehydrates nothing, the client issues it again, and a genuine
 * outage surfaces as the approved "Chưa thể tải các tác phẩm" state rather than
 * as a rendered error page.
 */
export default async function DiscoverPage({ searchParams }: DiscoverPageProps) {
  const selection = resolveDiscoverSelection(await searchParams);
  if (selection.kind === 'invalid') notFound();

  const categorySlug = selectionSlug(selection);
  const queryClient = new QueryClient();

  await queryClient.prefetchInfiniteQuery({
    queryKey: discoverQueryKeys.list(categorySlug),
    queryFn: () => fetchFirstDiscoverPageOnServer(categorySlug),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: nextCursorOf,
  });

  return (
    <div className="discover">
      <DiscoverIntro />
      <DiscoverCategoryNav activeSlug={categorySlug} />
      <DiscoverQueryProvider>
        <HydrationBoundary state={dehydrate(queryClient)}>
          <DiscoverFeedScreen categorySlug={categorySlug} />
        </HydrationBoundary>
      </DiscoverQueryProvider>
    </div>
  );
}
