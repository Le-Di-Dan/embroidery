import {
  publicCategoryList,
  type PublicCategoryInventoryItemResponse,
} from '@embroidery/api-client';

import { getServerApiClient } from '../../../config/server-api-client';

/**
 * The single server-side read of the public category inventory (`APP12-C01-C1`).
 *
 * Anonymous by construction, like every other Storefront server read: no cookie
 * is forwarded and no header is inspected. The inventory is identical for every
 * visitor, which is what makes it safe to render without knowing who asked.
 *
 * ## Why it returns `undefined` on failure instead of throwing
 *
 * Discover is a **page**, and a page whose category strip failed to load should
 * still render its feed — the same principle the product feed loader already
 * follows. But the alternative that must never happen is substituting a
 * remembered taxonomy: the four historical slugs are not a safe default, they
 * are the exact defect this checkpoint removed, and a fallback list would
 * silently resurrect it (and would offer chips for categories that may since
 * have been archived).
 *
 * So failure is `undefined` — *unknown*, not *empty* — and the callers treat the
 * two differently:
 *
 * - the chip row renders the approved "chưa thể tải danh mục" state rather than
 *   a fabricated one;
 * - the route stops narrowing `?category=` against an inventory it does not
 *   have, and falls back to slug **syntax**, so a perfectly valid category is
 *   never answered with a 404 because of a momentary API blip.
 *
 * An **empty** inventory is a different, truthful answer — the store has
 * published no categories — and renders as an empty chip row.
 *
 * The sitemap deliberately does not use this function: an unreadable inventory
 * there must fail the whole file rather than emit a partial one
 * (`sitemap-inventory.server.ts`).
 */
export async function fetchCategoryInventoryOnServer(): Promise<
  readonly PublicCategoryInventoryItemResponse[] | undefined
> {
  try {
    const body = await publicCategoryList({ instance: getServerApiClient() });
    return body.data.items;
  } catch {
    return undefined;
  }
}
