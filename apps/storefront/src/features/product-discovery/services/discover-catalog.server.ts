import { publicProductList, type PublicProductListResponse } from '@embroidery/api-client';

import { getServerApiClient } from '../../../config/server-api-client';
import { DISCOVER_PAGE_SIZE } from '../model/discover-query-keys';

/**
 * Server-side read of the first Discover page, used to render the initial HTML
 * and seed the client cache.
 *
 * Anonymous by construction: it forwards no cookie and reads no header. The
 * public catalog is the same for every visitor, which is what makes the page
 * safe to render on the server without knowing who asked.
 *
 * Errors propagate to the caller's prefetch, which absorbs them by design: a
 * failed prefetch must degrade to the client's own first request and, if that
 * also fails, to the approved "chưa thể tải" state — never to a rendered error
 * page for what may be a momentary API blip.
 */
export async function fetchFirstDiscoverPageOnServer(
  categorySlug: string | undefined,
): Promise<PublicProductListResponse> {
  const body = await publicProductList(
    {
      limit: DISCOVER_PAGE_SIZE,
      ...(categorySlug === undefined ? {} : { categorySlug }),
    },
    { instance: getServerApiClient() },
  );
  return body.data;
}
