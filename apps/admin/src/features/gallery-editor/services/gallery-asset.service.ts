/**
 * Feature service seam over the asset operations the editor reads and the one
 * it writes.
 *
 * Three reads and one write, and the write is the interesting one.
 *
 * ## The caller chooses a source, and nothing else
 *
 * `prepareGalleryAsset` sends two values: which asset to copy, and the token
 * that asset was last read at. It cannot request a kind, a classification, a
 * lifecycle status, a storage key or a rendition set, because the operation
 * accepts none of them — those are policy the server owns, and a client that
 * could name them would be a client that could ask for a public copy of
 * something that should not have one. The response's `assetId` is a **new**
 * asset; the source keeps its id, its lane and every product association it had.
 *
 * ## The preview is bytes, not an address
 *
 * `fetchGalleryAssetPreview` returns a `Blob` through the authenticated
 * operation. There is no URL built here, no bucket, no storage key and no
 * signed link. The server re-checks the asset lane on every request, so holding
 * an id is not enough to reach an image the operator is not entitled to.
 */
import {
  adminAssetList,
  adminGalleryAssetCreate,
  adminGalleryAssetPreview,
  normalizeApiClientError,
} from '@embroidery/api-client';
import type { AdminAssetListResponse, AdminGalleryAssetResponse } from '@embroidery/api-client';

import { getBrowserApiClient } from '../../../config/browser-api-client';
import { GalleryEditorApiError } from '../model/gallery-editor-failure';
import type { GalleryAssetScope } from '../model/gallery-asset-lanes';
import { GALLERY_ASSET_PAGE_SIZE } from '../model/gallery-editor-keys';

function requestOptions(signal?: AbortSignal) {
  return {
    instance: getBrowserApiClient(),
    ...(signal === undefined ? {} : { config: { signal } }),
  };
}

/**
 * The rendition each surface asks for.
 *
 * `APP11-B03A` serves exactly two, and the choice is about pixel budget, not
 * preference: a 72px row tile has no use for the larger one, and a picker tile
 * has no use for it either. Both values are literals of the contract's own
 * vocabulary, not sizes this screen invented.
 */
export const GALLERY_ROW_RENDITION = 'thumbnail';

export interface FetchGalleryAssetPageInput {
  /** The lane to read. Always named — never left to the operation's default. */
  readonly scope: GalleryAssetScope;
  /** Opaque keyset cursor from the previous page; absent for the first page. */
  readonly cursor?: string | undefined;
  readonly signal?: AbortSignal | undefined;
}

/**
 * One keyset page of one asset lane.
 *
 * The cursor is passed back exactly as the server issued it and is never
 * parsed, so a retry after a failed continuation re-sends the very same cursor
 * rather than restarting the collection.
 */
export async function fetchGalleryAssetPage({
  scope,
  cursor,
  signal,
}: FetchGalleryAssetPageInput): Promise<AdminAssetListResponse> {
  try {
    const response = await adminAssetList(
      {
        limit: GALLERY_ASSET_PAGE_SIZE,
        scope,
        ...(cursor === undefined ? {} : { cursor }),
      },
      requestOptions(signal),
    );
    return response.data;
  } catch (error: unknown) {
    throw new GalleryEditorApiError(normalizeApiClientError(error));
  }
}

export interface PrepareGalleryAssetInput {
  readonly sourceAssetId: string;
  /** The source's `updatedAt` as this screen last read it. */
  readonly expectedSourceUpdatedAt: string;
  readonly signal?: AbortSignal | undefined;
}

/**
 * Prepares a new public gallery image from an accepted product image.
 *
 * Repeating this call prepares a second, independent asset — the operation has
 * no promotion idempotency — which is exactly why the screen never retries it
 * automatically, and why a stale-source refusal is reported for the operator to
 * resolve rather than replayed with a refreshed token.
 */
export async function prepareGalleryAsset({
  sourceAssetId,
  expectedSourceUpdatedAt,
  signal,
}: PrepareGalleryAssetInput): Promise<AdminGalleryAssetResponse> {
  try {
    const response = await adminGalleryAssetCreate(
      { sourceAssetId, expectedSourceUpdatedAt },
      requestOptions(signal),
    );
    return response.data;
  } catch (error: unknown) {
    throw new GalleryEditorApiError(normalizeApiClientError(error));
  }
}

export interface FetchGalleryAssetPreviewInput {
  readonly assetId: string;
  readonly signal?: AbortSignal | undefined;
}

/** One rendition's bytes, through the authenticated preview operation. */
export async function fetchGalleryAssetPreview({
  assetId,
  signal,
}: FetchGalleryAssetPreviewInput): Promise<Blob> {
  try {
    return await adminGalleryAssetPreview(assetId, GALLERY_ROW_RENDITION, requestOptions(signal));
  } catch (error: unknown) {
    throw new GalleryEditorApiError(normalizeApiClientError(error));
  }
}
