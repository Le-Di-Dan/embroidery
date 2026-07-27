import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query';

import { AssetLibraryScreen, assetQueryKeys } from '../../../features/assets';
import { fetchFirstAssetPageOnServer } from '../../../features/assets/services/asset-catalog.server';

/**
 * `/assets` — the Admin asset library.
 *
 * A thin prefetch boundary and nothing else: the `(protected)` layout has
 * already resolved the session and rendered the shell, so this segment only
 * seeds the first cursor page into a request-scoped `QueryClient` and hands the
 * dehydrated cache to the client capability. That removes the duplicate
 * first-page request the client would otherwise make on mount.
 *
 * `prefetchInfiniteQuery` absorbs its own failure by design. A prefetch that
 * cannot reach the API dehydrates nothing, the client issues the request itself,
 * and a genuine outage surfaces as the approved "list unavailable" state — never
 * as a rendered error page for a screen whose upload panel still works.
 */
export default async function AssetsPage() {
  const queryClient = new QueryClient();

  await queryClient.prefetchInfiniteQuery({
    queryKey: assetQueryKeys.list(),
    queryFn: () => fetchFirstAssetPageOnServer(),
    initialPageParam: undefined as string | undefined,
  });

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <AssetLibraryScreen />
    </HydrationBoundary>
  );
}
