import { publicProductList, type PublicProductListResponse } from '@embroidery/api-client';

import { getBrowserApiClient } from '../../../config/browser-api-client';
import { DISCOVER_PAGE_SIZE } from '../model/discover-query-keys';

/**
 * Browser-side read of one Discover page through the same-origin gateway.
 *
 * The cursor is opaque: it is passed back exactly as the server issued it and is
 * never parsed, composed or inspected here. It also travels with the category it
 * was issued under, because `APP2-B04` rejects a cursor replayed under a
 * different filter (IMP-D037).
 */
export async function fetchDiscoverPage(
  categorySlug: string | undefined,
  cursor: string | undefined,
): Promise<PublicProductListResponse> {
  const body = await publicProductList(
    {
      limit: DISCOVER_PAGE_SIZE,
      ...(categorySlug === undefined ? {} : { categorySlug }),
      ...(cursor === undefined ? {} : { cursor }),
    },
    { instance: getBrowserApiClient() },
  );
  return body.data;
}
