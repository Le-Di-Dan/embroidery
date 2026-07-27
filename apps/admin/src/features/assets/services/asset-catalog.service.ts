/**
 * Feature service seam over the generated B01 read operations.
 *
 * The browser Axios instance is injected here so hooks and components never
 * touch Axios, a URL or the generated tree directly (FRONTEND_CONVENTIONS §8).
 * Every failure leaves this module as an `AssetApiError` carrying only the
 * normalized envelope, so no raw transport error reaches React state.
 */
import {
  adminAssetDetail,
  adminAssetList,
  normalizeApiClientError,
  type AdminAssetDetailResponse,
  type AdminAssetListResponse,
} from '@embroidery/api-client';

import { getBrowserApiClient } from '../../../config/browser-api-client';
import { AssetApiError } from '../model/asset-failure';
import { ASSET_LIST_PAGE_SIZE } from '../model/asset-query-keys';

export interface FetchAssetPageInput {
  /** Opaque keyset cursor from the previous page; absent for the first page. */
  readonly cursor?: string | undefined;
  readonly signal?: AbortSignal | undefined;
}

/**
 * One keyset page, newest first. There is no offset or page number: the cursor
 * is passed back exactly as the server issued it and is never parsed.
 */
export async function fetchAssetPage({
  cursor,
  signal,
}: FetchAssetPageInput = {}): Promise<AdminAssetListResponse> {
  try {
    const body = await adminAssetList(
      { limit: ASSET_LIST_PAGE_SIZE, ...(cursor === undefined ? {} : { cursor }) },
      { instance: getBrowserApiClient(), ...(signal === undefined ? {} : { config: { signal } }) },
    );
    return body.data;
  } catch (error: unknown) {
    throw new AssetApiError(normalizeApiClientError(error));
  }
}

/** One asset by id — the only authoritative source for its current status. */
export async function fetchAssetDetail(
  assetId: string,
  signal?: AbortSignal,
): Promise<AdminAssetDetailResponse> {
  try {
    const body = await adminAssetDetail(assetId, {
      instance: getBrowserApiClient(),
      ...(signal === undefined ? {} : { config: { signal } }),
    });
    return body.data;
  } catch (error: unknown) {
    throw new AssetApiError(normalizeApiClientError(error));
  }
}
