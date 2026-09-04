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
  findDiscoverCategory,
  discoverCategoryTitle,
  buildDiscoverHref,
  type DiscoverSearchParams,
} from '../../features/product-discovery';
import { fetchCategoryInventoryOnServer } from '../../features/product-discovery/services/category-inventory.server';
import { fetchFirstDiscoverPageOnServer } from '../../features/product-discovery/services/discover-catalog.server';
import { publicPageMetadata, publicPageTitle } from '../../features/storefront-seo';

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
 * every category state self-canonicalises to its own URL, and the unfiltered
 * feed canonicalises to `/kham-pha` with no query at all. Collapsing the
 * filtered states onto the bare path would tell a crawler that several
 * distinct, linked, browsable feeds are one page; adding a query to the
 * unfiltered one would invent an address nothing links to.
 *
 * *Every* category state, not four: the set is whatever the database currently
 * publishes (`APP12-C01-C1`).
 *
 * Only the category parameter survives. The URL is rebuilt from the resolved
 * selection through `buildDiscoverHref` rather than echoed back, so a tracking
 * or pagination parameter someone appends cannot enter the canonical.
 *
 * An unknown or repeated value never reaches here: it takes the existing
 * not-found boundary in the page component below, which is where a malformed
 * category has always been answered.
 *
 * ## The title and the indexing directive are the category's own (`APP12-C03`)
 *
 * A selected category contributes its `name` to the title and its
 * `isIndexable` to the robots directive, both read from the row this request
 * already fetched. Neither is invented: there is no category SEO copy in this
 * system, so a description rebuilt from a slug would be marketing text written
 * by a build step, and the shared Discover description stays.
 *
 * `isIndexable=false` is the operator saying *do not index this filter*, and
 * until now only the sitemap heard it — the page itself carried no directive,
 * so a crawler following the chip indexed it anyway. `noindex, follow` closes
 * that: the category stays a first-class customer filter, keeps its chip, its
 * breadcrumb and its self-canonical, and is simply not indexed. Indexability is
 * not visibility.
 *
 * When the inventory could not be read the directive is **omitted** rather than
 * defaulted to `noindex`. An unreadable inventory is *unknown*, not *not
 * indexable*, and a momentary API blip must not be able to ask a crawler to drop
 * a real category page — the same reason the selection falls back to slug
 * syntax instead of 404ing.
 *
 * Layout, query behaviour and the feed itself are untouched.
 */
export async function generateMetadata({ searchParams }: DiscoverPageProps): Promise<Metadata> {
  const [params, categories] = await Promise.all([searchParams, fetchCategoryInventoryOnServer()]);
  const selection = resolveDiscoverSelection(params, categories);
  const selectedSlug = selectionSlug(selection);
  const selectedCategory = findDiscoverCategory(categories, selectedSlug);

  return {
    ...publicPageMetadata({
      // An invalid selection renders the not-found surface, which carries its own
      // head; canonicalising it to the unfiltered feed here would be the closest
      // thing to a redirect this checkpoint is allowed to emit, and it would
      // reward a mistyped link with a real URL.
      path: buildDiscoverHref(selectedSlug),
      title: publicPageTitle(
        selectedCategory === undefined
          ? DISCOVER_COPY.heading
          : discoverCategoryTitle(selectedCategory.name),
      ),
      description: DISCOVER_COPY.intro,
    }),
    // Applied after the public block so it can never be overwritten by it, the
    // same composition the Product and gallery detail routes use.
    ...(selectedCategory === undefined
      ? {}
      : { robots: { index: selectedCategory.isIndexable, follow: true } }),
  };
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
 * link never answers a question the visitor did not ask. "Unknown" is now
 * measured against the live category inventory (`APP12-C01-C1`), so a category
 * published a minute ago resolves and one archived a minute ago stops
 * resolving — neither needing a deployment.
 *
 * The prefetch absorbs its own failure by design: a first request that cannot
 * reach the API dehydrates nothing, the client issues it again, and a genuine
 * outage surfaces as the approved "Chưa thể tải các tác phẩm" state rather than
 * as a rendered error page.
 */
export default async function DiscoverPage({ searchParams }: DiscoverPageProps) {
  // Both reads start together: the inventory decides which `?category=` values
  // are real, and the feed page depends on the resolved selection, so the
  // category read is on the critical path and must not be serialised behind the
  // params promise.
  const [params, categories] = await Promise.all([searchParams, fetchCategoryInventoryOnServer()]);

  const selection = resolveDiscoverSelection(params, categories);
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
      <DiscoverCategoryNav categories={categories} activeSlug={categorySlug} />
      <DiscoverQueryProvider>
        <HydrationBoundary state={dehydrate(queryClient)}>
          <DiscoverFeedScreen categorySlug={categorySlug} />
        </HydrationBoundary>
      </DiscoverQueryProvider>
    </div>
  );
}
