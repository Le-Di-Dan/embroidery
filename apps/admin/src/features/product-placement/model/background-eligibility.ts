/**
 * Which Assets may be a Side background.
 *
 * The same lane the catalogue's own images use — `CATALOG_MEDIA` /
 * `PRODUCTION_SENSITIVE` / `ACCEPTED` — **plus one rule the product media
 * picker does not have**: the source must be raster.
 *
 * SVG is rejected for backgrounds (`IMP-D044` PO-03) and accepted only for
 * Admin Template assets, where it passes server-side sanitization APP3 has not
 * built. Nothing sanitizes a background. Offering an SVG here would produce a
 * `PLACEMENT_BACKGROUND_NOT_ELIGIBLE` refusal after the operator had already
 * chosen it, so the option is not offered in the first place.
 *
 * The allowed list is mirrored from `SIDE_BACKGROUND_SOURCE_MEDIA_TYPES` rather
 * than imported: it lives in the API's own domain module, which the Admin app
 * neither depends on nor may reach into. The server remains the authority — this
 * only decides what to *show*, and a stale list here can never widen what the
 * server accepts.
 *
 * Eligibility is read from the asset response's own fields and nothing else.
 * Storage keys, checksums and inspection detail are not eligibility sources.
 */
import {
  AdminAssetUploadBodyAssetKind,
  AdminAssetUploadBodyClassification,
} from '@embroidery/api-client';
import type { AdminAssetDetailResponse, AdminAssetListResponse } from '@embroidery/api-client';

/** The only lifecycle state a side background may reference. */
export const BACKGROUND_ASSET_STATUS = 'ACCEPTED';

/** Mirrors `SIDE_BACKGROUND_SOURCE_MEDIA_TYPES` (`IMP-D044` PO-03). */
export const BACKGROUND_SOURCE_MEDIA_TYPES: readonly string[] = [
  'image/jpeg',
  'image/png',
  'image/webp',
];

export function isEligibleBackground(asset: AdminAssetDetailResponse): boolean {
  return (
    asset.kind === AdminAssetUploadBodyAssetKind.CATALOG_MEDIA &&
    asset.classification === AdminAssetUploadBodyClassification.PRODUCTION_SENSITIVE &&
    asset.status === BACKGROUND_ASSET_STATUS &&
    BACKGROUND_SOURCE_MEDIA_TYPES.includes(asset.mediaType)
  );
}

/**
 * Flattens accumulated cursor pages in server order, keeping only eligible
 * assets and the first occurrence of each `assetId`. A concurrent upload can
 * shift the keyset window and repeat an asset across pages; rendering it twice
 * would misstate the library, and re-sorting would move options under the
 * operator's cursor.
 */
export function flattenEligibleBackgrounds(
  pages: readonly AdminAssetListResponse[],
): readonly AdminAssetDetailResponse[] {
  const seen = new Set<string>();
  const items: AdminAssetDetailResponse[] = [];
  for (const page of pages) {
    for (const asset of page.items) {
      if (seen.has(asset.assetId) || !isEligibleBackground(asset)) {
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
export function resolveBackgroundCursor(
  page: AdminAssetListResponse | undefined,
): string | undefined {
  if (page === undefined || !page.hasNext) {
    return undefined;
  }
  return typeof page.nextCursor === 'string' && page.nextCursor !== ''
    ? page.nextCursor
    : undefined;
}
