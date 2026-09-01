import type { MetadataRoute } from 'next';

import { composeSitemap } from '../features/storefront-seo';
import {
  fetchPublicCategoryInventory,
  fetchPublicSitemapInventory,
} from '../features/storefront-seo/services/sitemap-inventory.server';

/**
 * `/sitemap.xml` — the public URL index (`APP11-S04`).
 *
 * A framework **metadata route**, not a page: it adds no browser page to the
 * Storefront's route count. Like every other segment in this app it is thin — it
 * reads the `APP11-B04` entity inventory and the `APP12-C01` category inventory
 * and hands both to the composer, which owns the static routes, the entity path
 * mapping, the category indexability rule, the ordering and the capacity bound.
 *
 * The two reads run concurrently: they are independent, and a sitemap should
 * cost one round trip's latency rather than two.
 *
 * ## Nothing is absorbed
 *
 * There is no `try`/`catch`. A failed inventory read and an over-capacity
 * composition both propagate, the route fails, and no file is served. That is
 * deliberate and is the opposite of how every feed loader in this app behaves: a
 * crawler cannot distinguish a partial sitemap from a complete one, so a
 * static-only fallback, an empty `<urlset>` or a truncated list would each tell
 * it that real pages have been delisted. A missing file tells it nothing, and
 * "nothing" is the safe answer.
 *
 * `force-dynamic` is correctness rather than performance, for the same reason
 * the public pages set it: publication and indexability are re-read on every API
 * request precisely because nothing in this system invalidates a cache, so a
 * stored sitemap could keep advertising a URL the operator has unpublished.
 */
export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [inventory, categories] = await Promise.all([
    fetchPublicSitemapInventory(),
    fetchPublicCategoryInventory(),
  ]);
  return composeSitemap(inventory, categories);
}
