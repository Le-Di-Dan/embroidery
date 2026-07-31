/**
 * Which assets a product may reference.
 *
 * Eligibility is read from the asset response's own fields — kind,
 * classification and lifecycle status — and from nothing else. Storage keys,
 * checksums, inspection detail and worker records are not eligibility sources
 * and are not even read here; inferring "this looks processed" from them would
 * let a half-inspected image into a catalogue.
 *
 * The list operation can return assets in other states, so this filters rather
 * than assuming: an asset that is still processing or was rejected simply does
 * not appear as an option (`437:73` — "Ảnh đang xử lý hoặc không thể sử dụng sẽ
 * không xuất hiện ở đây").
 */
import {
  AdminAssetUploadBodyAssetKind,
  AdminAssetUploadBodyClassification,
} from '@embroidery/api-client';
import type { AdminAssetDetailResponse, AdminAssetListResponse } from '@embroidery/api-client';

/** The only lifecycle state a product may reference. */
export const SELECTABLE_ASSET_STATUS = 'ACCEPTED';

export function isSelectableAsset(asset: AdminAssetDetailResponse): boolean {
  return (
    asset.kind === AdminAssetUploadBodyAssetKind.CATALOG_MEDIA &&
    asset.classification === AdminAssetUploadBodyClassification.PRODUCTION_SENSITIVE &&
    asset.status === SELECTABLE_ASSET_STATUS
  );
}

/**
 * Flattens accumulated cursor pages in server order, keeping only selectable
 * assets and the first occurrence of each `assetId`. A concurrent upload can
 * shift the keyset window and repeat an asset across pages; rendering it twice
 * would misstate the library, and re-sorting would move options under the
 * operator's cursor.
 */
export function flattenSelectableAssets(
  pages: readonly AdminAssetListResponse[],
): readonly AdminAssetDetailResponse[] {
  const seen = new Set<string>();
  const items: AdminAssetDetailResponse[] = [];
  for (const page of pages) {
    for (const asset of page.items) {
      if (seen.has(asset.assetId) || !isSelectableAsset(asset)) {
        continue;
      }
      seen.add(asset.assetId);
      items.push(asset);
    }
  }
  return items;
}

/**
 * The cursor for the next request, or `undefined` when the collection is
 * exhausted. Both parts of the contract must hold: `hasNext` alone is not a
 * cursor, and a stale `nextCursor` on a last page is not a continuation.
 */
export function resolveAssetCursor(page: AdminAssetListResponse | undefined): string | undefined {
  if (page === undefined || !page.hasNext) {
    return undefined;
  }
  return typeof page.nextCursor === 'string' && page.nextCursor !== ''
    ? page.nextCursor
    : undefined;
}
