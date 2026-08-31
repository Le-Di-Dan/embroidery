import { publicSitemapEntryList, type PublicSitemapEntryResponse } from '@embroidery/api-client';

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
