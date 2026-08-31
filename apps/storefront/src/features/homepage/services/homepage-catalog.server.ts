import { publicProductList } from '@embroidery/api-client';

import { getServerApiClient } from '../../../config/server-api-client';
import { HOMEPAGE_WORKS_LIMIT, toHomepageWorks, type HomepageWorks } from '../model/homepage-works';

/**
 * The Homepage's single bounded catalog read (`APP11-S01` §8).
 *
 * Anonymous by construction, like every Storefront server read: no cookie is
 * forwarded and no header is inspected, because the published catalog is the
 * same for every visitor.
 *
 * It reuses the already-delivered `APP2` public discovery operation. No Product
 * API was added, and no gallery operation is called — `publicGalleryEntry_list`
 * and `publicGalleryEntry_detail` belong to `APP11-S02`/`S03`.
 *
 * **Failure is absorbed here, deliberately.** Every other Storefront server read
 * lets the error propagate so a client island can retry it; this one cannot,
 * because the Homepage has no island — a thrown error would take the whole
 * server-rendered page to the error boundary and lose the Hero, the Studio Story
 * and the Commission CTA, none of which need the catalog at all. Returning an
 * `error` status keeps the damage inside two sections, which is exactly what
 * §14 requires. Nothing about the failure reaches the visitor: no status code,
 * no message, no request id — only the approved reduced state.
 */
export async function fetchHomepageWorksOnServer(): Promise<HomepageWorks> {
  try {
    const body = await publicProductList(
      { limit: HOMEPAGE_WORKS_LIMIT },
      { instance: getServerApiClient() },
    );
    return toHomepageWorks(body.data);
  } catch {
    return { status: 'error' };
  }
}
