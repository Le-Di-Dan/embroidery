import {
  publicCategoryList,
  publicSitemapEntryList,
  type PublicCategoryInventoryItemResponse,
  type PublicSitemapEntryResponse,
} from '@embroidery/api-client';

import { getServerApiClient } from '../../../config/server-api-client';

/**
 * The single server-side read of the public SEO inventory (`APP11-B04`).
 *
 * Anonymous by construction, like every other Storefront server read: no cookie
 * is forwarded and no header is inspected. The inventory is identical for every
 * visitor — that is what makes it safe to render without knowing who asked.
 *
 * ## Failure is propagated, never absorbed
 *
 * Every other loader in this app turns a failed read into an empty or
 * not-found state, because a feed that cannot load should still render a page.
 * A sitemap is the opposite: an empty `<urlset>` is not a degraded answer, it is
 * an affirmative statement that the store has no indexable pages, and a crawler
 * acting on it would delist the catalogue. `APP11-B04` fails with 503 rather
 * than truncating for exactly that reason, and swallowing that 503 here would
 * undo the guard one layer up.
 *
 * So the error is rethrown, the metadata route fails, and `/sitemap.xml` answers
 * an error status. There is no static-only partial sitemap, no stale copy and no
 * "treat the inventory as empty" branch: a missing file is a condition crawlers
 * handle by keeping what they already know, which is the safe outcome.
 */
export async function fetchPublicSitemapInventory(): Promise<PublicSitemapEntryResponse[]> {
  const body = await publicSitemapEntryList({ instance: getServerApiClient() });
  return body.data.items;
}

/**
 * The public category inventory, read for the sitemap's category URLs
 * (`APP12-C01-C1`).
 *
 * Deliberately **not** the Discover feature's own reader, which returns
 * `undefined` on failure so a page can still render its feed. Here the failure
 * policy is the one above: a sitemap that silently dropped every category URL
 * would tell a crawler those feeds have been delisted, which is the same defect
 * as an empty `<urlset>` in a smaller disguise. So the error propagates, the
 * metadata route fails, and no file is served.
 *
 * The indexability filter is applied by the composer, not here: this function's
 * job is to read, and the SEO rule belongs beside the URL composition it
 * governs.
 */
export async function fetchPublicCategoryInventory(): Promise<
  PublicCategoryInventoryItemResponse[]
> {
  const body = await publicCategoryList({ instance: getServerApiClient() });
  return body.data.items;
}
