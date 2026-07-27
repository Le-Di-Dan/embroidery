/**
 * Server-side read of the first asset page, used only to seed the client cache.
 *
 * Server-only by construction: it calls `next/headers`, which throws in a
 * Client Component, and it uses the internal Docker-network Axios instance that
 * is never exposed to the browser bundle. The incoming session `Cookie` header
 * is forwarded verbatim per call — this module re-uses the APP1 forwarding
 * shape and neither parses, stores nor logs the cookie value.
 */
import { adminAssetList, type AdminAssetListResponse } from '@embroidery/api-client';
import { cookies } from 'next/headers';

import { getServerApiClient } from '../../../config/server-api-client';
import { ASSET_LIST_PAGE_SIZE } from '../model/asset-query-keys';

/**
 * Fetches the first keyset page for hydration. Errors are intentionally left to
 * propagate to the caller's `prefetchInfiniteQuery`, which absorbs them: a
 * failed prefetch must degrade to the client's own first-page request (and, if
 * that also fails, to the approved unavailable state) rather than turning a
 * transient API blip into a rendered error page.
 */
export async function fetchFirstAssetPageOnServer(): Promise<AdminAssetListResponse> {
  const cookieStore = await cookies();
  const body = await adminAssetList(
    { limit: ASSET_LIST_PAGE_SIZE },
    {
      instance: getServerApiClient(),
      config: { headers: { Cookie: cookieStore.toString() } },
    },
  );
  return body.data;
}
