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
  buildDiscoverHref,
  type DiscoverSearchParams,
} from '../../features/product-discovery';
import { fetchFirstDiscoverPageOnServer } from '../../features/product-discovery/services/discover-catalog.server';
import { publicPageMetadata } from '../../features/storefront-seo';

interface DiscoverPageProps {
  readonly searchParams: Promise<DiscoverSearchParams>;
}

/**
 * Discover metadata, including the self-canonical this route lacked
 * (`FU-APP11-G01-05`).
 *
 * The comment that used to stand here justified the missing canonical with "the
 * Product Detail route is unresolved (IMP-D038)". That reason expired when
 * IMP-D039 locked `/san-pham/[slug]`, and it was never the real obstacle
 * anyway: what a canonical needs is an origin, which `APP11-S04` now supplies.
 *
 * ## The category state is part of the canonical
 *
 * `?category=` is not decoration on one page — it is the canonical address of a
 * filtered feed (IMP-D038, `APP2-S01-G01`; there is no `/danh-muc/[slug]`). So
 * each of the four category states self-canonicalises to its own URL, and the
 * unfiltered feed canonicalises to `/kham-pha` with no query at all. Collapsing
 * the filtered states onto the bare path would tell a crawler that four
 * distinct, linked, browsable feeds are one page; adding a query to the
 * unfiltered one would invent an address nothing links to.
 *
 * Only the category parameter survives. The URL is rebuilt from the resolved
 * selection through `buildDiscoverHref` rather than echoed back, so a tracking
 * or pagination parameter someone appends cannot enter the canonical.
 *
 * An unknown or repeated value never reaches here: it takes the existing
 * not-found boundary in the page component below, which is where a malformed
 * category has always been answered.
 *
 * Layout, query behaviour and the feed itself are untouched.
 */
export async function generateMetadata({ searchParams }: DiscoverPageProps): Promise<Metadata> {
  const selection = resolveDiscoverSelection(await searchParams);

  return publicPageMetadata({
    // An invalid selection renders the not-found surface, which carries its own
    // head; canonicalising it to the unfiltered feed here would be the closest
    // thing to a redirect this checkpoint is allowed to emit, and it would
    // reward a mistyped link with a real URL.
    path: buildDiscoverHref(selectionSlug(selection)),
    title: `${DISCOVER_COPY.heading} — Xưởng Thêu`,
    description: DISCOVER_COPY.intro,
  });
}

/**
 * `force-dynamic` renders this segment per request and forbids a build-time or
 * full-route cached copy. That is a correctness requirement rather than a
 * performance preference: publication is re-read on every API request precisely
 * because nothing in this system invalidates a cache, so a stored page could
 * keep showing a product the operator has unpublished.
 */
export const dynamic = 'force-dynamic';

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
