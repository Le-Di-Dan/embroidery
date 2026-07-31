import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query';
import { Suspense } from 'react';

import {
  normalizeProductFilters,
  ProductListScreen,
  productQueryKeys,
} from '../../../features/products';
import { fetchFirstProductPageOnServer } from '../../../features/products/services/product-catalog.server';

interface ProductsPageProps {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * `/products` — the Admin product list.
 *
 * A thin prefetch boundary and nothing else: the `(protected)` layout has
 * already resolved the session and rendered the shell, so this segment only
 * normalizes the requested filters, seeds the matching first cursor page into a
 * request-scoped `QueryClient` and hands the dehydrated cache to the client
 * capability. Normalizing here with the same total function the client uses is
 * what makes the hydrated key match the client's key — including for a
 * hand-edited `?status=nonsense`, which both sides read as "all".
 *
 * `prefetchInfiniteQuery` absorbs its own failure by design. A prefetch that
 * cannot reach the API dehydrates nothing, the client issues the request
 * itself, and a genuine outage surfaces as the approved "list unavailable"
 * state — never as a rendered error page.
 */
export default async function ProductsPage({ searchParams }: ProductsPageProps) {
  const filters = normalizeProductFilters(await searchParams);
  const queryClient = new QueryClient();

  await queryClient.prefetchInfiniteQuery({
    queryKey: productQueryKeys.list(filters),
    queryFn: () => fetchFirstProductPageOnServer(filters),
    initialPageParam: undefined as string | undefined,
  });

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      {/*
        `ProductListScreen` reads the filters from `useSearchParams`; the
        boundary is what App Router requires around that hook. The segment is
        already dynamic (the protected layout reads the session cookie), so this
        never actually suspends in production.
      */}
      <Suspense fallback={null}>
        <ProductListScreen />
      </Suspense>
    </HydrationBoundary>
  );
}
