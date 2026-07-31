/**
 * Feature service seam over the generated `adminAsset_list` operation, for the
 * product media picker.
 *
 * The picker reads the asset library through the same generated operation the
 * asset screen uses, with this feature's own page size and error type. It never
 * reaches object storage, never builds a media URL and never downloads a blob:
 * `APP2` exposes no authenticated delivery contract, so there is nothing to
 * fetch and the picker renders honest placeholders instead (`APP2-T01`).
 */
import { adminAssetList, normalizeApiClientError } from '@embroidery/api-client';
import type { AdminAssetListResponse } from '@embroidery/api-client';

import { getBrowserApiClient } from '../../../config/browser-api-client';
import { ProductApiError } from '../model/product-failure';
import { PRODUCT_ASSET_PAGE_SIZE } from '../model/product-query-keys';

export interface FetchSelectableAssetPageInput {
  /** Opaque keyset cursor from the previous page; absent for the first page. */
  readonly cursor?: string | undefined;
  readonly signal?: AbortSignal | undefined;
}

/**
 * One keyset page, newest first. The cursor is passed back exactly as the
 * server issued it and is never parsed, so a retry after a failed continuation
 * re-sends the very same cursor rather than restarting the collection.
 */
export async function fetchSelectableAssetPage({
  cursor,
  signal,
}: FetchSelectableAssetPageInput = {}): Promise<AdminAssetListResponse> {
  try {
    const response = await adminAssetList(
      { limit: PRODUCT_ASSET_PAGE_SIZE, ...(cursor === undefined ? {} : { cursor }) },
      {
        instance: getBrowserApiClient(),
        ...(signal === undefined ? {} : { config: { signal } }),
      },
    );
    return response.data;
  } catch (error: unknown) {
    throw new ProductApiError(normalizeApiClientError(error));
  }
}
