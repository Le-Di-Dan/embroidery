import {
  publicGalleryEntryList,
  type PublicGalleryEntryListResponse,
} from '@embroidery/api-client';

import { getBrowserApiClient } from '../../../config/browser-api-client';
import { GALLERY_PAGE_SIZE } from '../model/gallery-query-keys';

/**
 * Browser-side read of one gallery page through the same-origin gateway.
 *
 * The cursor is opaque: it is passed back exactly as the server issued it and is
 * never parsed, composed, inspected or written to the browser URL. `APP11-B03`
 * publishes no offset and no page number, so there is nothing else a caller
 * could send even if it wanted to.
 */
export async function fetchGalleryPage(
  cursor: string | undefined,
): Promise<PublicGalleryEntryListResponse> {
  const body = await publicGalleryEntryList(
    {
      limit: GALLERY_PAGE_SIZE,
      ...(cursor === undefined ? {} : { cursor }),
    },
    { instance: getBrowserApiClient() },
  );
  return body.data;
}
