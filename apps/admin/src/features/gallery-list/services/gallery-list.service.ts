/**
 * Feature service seam over the two generated operations the gallery list owns.
 *
 * The browser Axios instance is injected here so hooks and components never
 * touch Axios, a URL or the generated tree directly (FRONTEND_CONVENTIONS §8),
 * and the Admin session cookie rides the same client every other Admin screen
 * uses — this feature creates no auth path of its own. Every failure leaves
 * this module as a `GalleryListApiError` carrying only the normalized envelope,
 * so no raw transport error reaches React state.
 *
 * These are the **only** gallery operations this screen may call, and the only
 * two exported from this module. Creation, the entry detail, the update, the
 * asset replacement and both publication transitions are not reached from here
 * at all: `APP11-A02` owns them beside the facts the editor shows, and the
 * public api-client boundary does not even publish them to this app.
 */
import {
  adminGalleryAssetPreview,
  adminGalleryEntryList,
  normalizeApiClientError,
} from '@embroidery/api-client';
import type { AdminGalleryEntryListResponse } from '@embroidery/api-client';

import { getBrowserApiClient } from '../../../config/browser-api-client';
import { GalleryListApiError } from '../model/gallery-list-failure';
import { toGalleryListParams, type GalleryListFilters } from '../model/gallery-list-filters';
import { GALLERY_LIST_PAGE_SIZE } from '../model/gallery-list-keys';

/**
 * The rendition the list thumbnail asks for.
 *
 * `APP11-B03A` serves exactly two — `thumbnail` and `catalog-preview` — and a
 * 64px cell has no use for the larger one. The value is a literal of the
 * contract's own vocabulary, not a size this screen invented.
 */
export const GALLERY_COVER_RENDITION = 'thumbnail';

export interface FetchGalleryListPageInput {
  readonly filters: GalleryListFilters;
  /** Opaque keyset cursor from the previous page; absent for the first page. */
  readonly cursor?: string | undefined;
  readonly signal?: AbortSignal | undefined;
}

/**
 * One keyset page, in curated order. There is no offset and no page number: the
 * cursor is passed back exactly as the server issued it and is never parsed.
 */
export async function fetchGalleryListPage({
  filters,
  cursor,
  signal,
}: FetchGalleryListPageInput): Promise<AdminGalleryEntryListResponse> {
  try {
    const body = await adminGalleryEntryList(
      {
        limit: GALLERY_LIST_PAGE_SIZE,
        ...toGalleryListParams(filters),
        ...(cursor === undefined ? {} : { cursor }),
      },
      {
        instance: getBrowserApiClient(),
        ...(signal === undefined ? {} : { config: { signal } }),
      },
    );
    return body.data;
  } catch (error: unknown) {
    throw new GalleryListApiError(normalizeApiClientError(error));
  }
}

export interface FetchGalleryCoverInput {
  readonly assetId: string;
  readonly signal?: AbortSignal | undefined;
}

/**
 * One cover thumbnail's bytes, through the authenticated preview operation.
 *
 * The asset id is an identity and never an address: there is no URL built here,
 * no bucket, no storage key and no signed link. The server re-checks the asset
 * lane on every request, so a row cannot reach an image it is not entitled to
 * merely by holding its id.
 */
export async function fetchGalleryCover({
  assetId,
  signal,
}: FetchGalleryCoverInput): Promise<Blob> {
  try {
    return await adminGalleryAssetPreview(assetId, GALLERY_COVER_RENDITION, {
      instance: getBrowserApiClient(),
      ...(signal === undefined ? {} : { config: { signal } }),
    });
  } catch (error: unknown) {
    throw new GalleryListApiError(normalizeApiClientError(error));
  }
}
