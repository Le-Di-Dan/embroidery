import {
  publicGalleryEntryList,
  type PublicGalleryEntryListResponse,
} from '@embroidery/api-client';

import { getServerApiClient } from '../../../config/server-api-client';
import { GALLERY_PAGE_SIZE } from '../model/gallery-query-keys';

/**
 * Server-side read of the first gallery page, used to render the initial HTML
 * and seed the client cache.
 *
 * Anonymous by construction: it forwards no cookie and reads no header. The
 * published gallery is the same for every visitor, which is what makes the page
 * safe to render on the server without knowing who asked.
 *
 * Errors propagate to the caller's prefetch, which absorbs them by design: a
 * failed prefetch must degrade to the client's own first request and, if that
 * also fails, to the approved "Không thể tải bộ sưu tập" state — never to a
 * rendered error page for what may be a momentary API blip.
 */
export async function fetchFirstGalleryPageOnServer(): Promise<PublicGalleryEntryListResponse> {
  const body = await publicGalleryEntryList(
    { limit: GALLERY_PAGE_SIZE },
    { instance: getServerApiClient() },
  );
  return body.data;
}
