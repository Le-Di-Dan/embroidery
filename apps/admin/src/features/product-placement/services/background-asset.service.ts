/**
 * Feature service seam over the generated `adminAsset_list` operation, for the
 * side-background picker.
 *
 * The same read the Admin asset screen and the product media picker use, with
 * this feature's own page size and error type (`APP3-A01` §15 — reuse the
 * accepted Admin asset boundary rather than inventing an intake path).
 *
 * It never reaches object storage, never builds a media URL and never downloads
 * a blob. `APP2` exposes no authenticated Admin delivery contract, so there is
 * nothing to fetch; the picker renders honest placeholders instead
 * (`APP2-T01`). The public side-background route is not used here either — it
 * requires the product to be published, and placement is authored while the
 * product is still a draft.
 */
import { adminAssetList, normalizeApiClientError } from '@embroidery/api-client';
import type { AdminAssetListResponse } from '@embroidery/api-client';

import { getBrowserApiClient } from '../../../config/browser-api-client';
import { PlacementApiError } from '../model/placement-failure';

/** Client request size for one page of the picker; the contract allows 1–100. */
export const BACKGROUND_ASSET_PAGE_SIZE = 24;

export interface FetchBackgroundAssetPageInput {
  /** Opaque keyset cursor from the previous page; absent for the first page. */
  readonly cursor?: string | undefined;
  readonly signal?: AbortSignal | undefined;
}

/**
 * One keyset page, newest first. The cursor is passed back exactly as the
 * server issued it and is never parsed, so a retry after a failed continuation
 * re-sends the very same cursor rather than restarting the collection.
 */
export async function fetchBackgroundAssetPage({
  cursor,
  signal,
}: FetchBackgroundAssetPageInput = {}): Promise<AdminAssetListResponse> {
  try {
    const response = await adminAssetList(
      { limit: BACKGROUND_ASSET_PAGE_SIZE, ...(cursor === undefined ? {} : { cursor }) },
      {
        instance: getBrowserApiClient(),
        ...(signal === undefined ? {} : { config: { signal } }),
      },
    );
    return response.data;
  } catch (error: unknown) {
    throw new PlacementApiError(normalizeApiClientError(error));
  }
}
