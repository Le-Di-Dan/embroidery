/**
 * The two asset lanes the editor reads, and what each one may contain.
 *
 * ## Two lanes, named explicitly, never defaulted
 *
 * ```text
 * GALLERY  GALLERY_MEDIA / PUBLIC                 images an entry may show
 * CATALOG  CATALOG_MEDIA / PRODUCTION_SENSITIVE   sources one may be prepared from
 * ```
 *
 * `adminAsset_list` treats an omitted `scope` as `CATALOG`. The editor never
 * relies on that: a picker that quietly listed production-sensitive product
 * media where attachable public gallery media was meant would look, on screen,
 * exactly like one that worked — and the operator would only find out when the
 * save was refused. So both pickers name their lane.
 *
 * `CUSTOMER_PRIVATE` is in neither lane and is not reachable from either
 * operation. There is nothing to filter out here, and nothing below pretends
 * otherwise.
 *
 * ## Eligibility is applied to the response, not assumed of it
 *
 * The list can return assets in other lifecycle states, so this filters rather
 * than trusting: an image still being inspected, or one that was rejected, is
 * simply not offered. Eligibility is read from the response's own kind,
 * classification and status — never from a checksum, a storage fact or a
 * worker record, none of which is an eligibility source and none of which is
 * even read here.
 */
import {
  AdminAssetDetailResponseClassification,
  AdminAssetDetailResponseKind,
  AdminAssetListScope,
} from '@embroidery/api-client';
import type { AdminAssetDetailResponse, AdminAssetListResponse } from '@embroidery/api-client';

export type GalleryAssetScope = (typeof AdminAssetListScope)[keyof typeof AdminAssetListScope];

/** The only lifecycle state either lane may offer. */
export const SELECTABLE_ASSET_STATUS = 'ACCEPTED';

/**
 * An image already prepared for the gallery: the copy `adminGalleryAsset_create`
 * produces, which is the only kind an entry may attach.
 */
export function isAttachableGalleryAsset(asset: AdminAssetDetailResponse): boolean {
  return (
    asset.kind === AdminAssetDetailResponseKind.GALLERY_MEDIA &&
    asset.classification === AdminAssetDetailResponseClassification.PUBLIC &&
    asset.status === SELECTABLE_ASSET_STATUS
  );
}

/**
 * A product image that may be prepared from.
 *
 * The server re-checks this and reports every ineligible case identically, so
 * this filter is a courtesy that keeps unusable tiles off screen — not a
 * security boundary and not a second authority.
 */
export function isPreparableSourceAsset(asset: AdminAssetDetailResponse): boolean {
  return (
    asset.kind === AdminAssetDetailResponseKind.CATALOG_MEDIA &&
    asset.classification === AdminAssetDetailResponseClassification.PRODUCTION_SENSITIVE &&
    asset.status === SELECTABLE_ASSET_STATUS
  );
}

export function isEligibleForScope(
  asset: AdminAssetDetailResponse,
  scope: GalleryAssetScope,
): boolean {
  return scope === AdminAssetListScope.GALLERY
    ? isAttachableGalleryAsset(asset)
    : isPreparableSourceAsset(asset);
}

/**
 * Flattens accumulated cursor pages in server order, keeping only eligible
 * assets and the first occurrence of each `assetId`.
 *
 * A concurrent upload or preparation can shift the keyset window and repeat an
 * asset across pages; rendering it twice would misstate the library, and
 * re-sorting would move options under the operator's cursor.
 */
export function flattenEligibleAssets(
  pages: readonly AdminAssetListResponse[],
  scope: GalleryAssetScope,
): readonly AdminAssetDetailResponse[] {
  const seen = new Set<string>();
  const items: AdminAssetDetailResponse[] = [];
  for (const page of pages) {
    for (const asset of page.items) {
      if (seen.has(asset.assetId) || !isEligibleForScope(asset, scope)) {
        continue;
      }
      seen.add(asset.assetId);
      items.push(asset);
    }
  }
  return items;
}

/**
 * The cursor for the next request, or `undefined` when the lane is exhausted.
 *
 * Both parts of the contract must hold: `hasNext` alone is not a cursor, and a
 * stale `nextCursor` on a last page is not a continuation. The value is opaque —
 * passed back exactly as issued, never parsed into a page number.
 */
export function resolveAssetCursor(page: AdminAssetListResponse | undefined): string | undefined {
  if (page === undefined || !page.hasNext) {
    return undefined;
  }
  return typeof page.nextCursor === 'string' && page.nextCursor !== ''
    ? page.nextCursor
    : undefined;
}
