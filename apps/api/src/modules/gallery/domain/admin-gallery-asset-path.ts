/**
 * The Admin gallery-asset address, composed API-side (`APP11-B03A` §11).
 *
 * The same shape and the same reasoning as `public-gallery-entry-path.ts`:
 * `@embroidery/contracts` owns the canonical builder for frontend consumers,
 * but the compiled API cannot `require` that package (IMP-D018), so the API
 * composes the path locally.
 *
 * The result is a **relative application path** and nothing else: no host, no
 * bucket, no object key, no signature, no expiry. It is served by an
 * Admin-guarded route that re-resolves the asset in the gallery lane on every
 * request, so this string grants nothing on its own — an operator without a
 * live Admin session gets a 401 from it, exactly as from any other Admin route.
 */

/** The base path of the Admin gallery-asset surface. */
export const ADMIN_GALLERY_ASSET_PATH_PREFIX = '/api/admin/gallery-assets';

export interface AdminGalleryAssetPathInput {
  readonly assetId: string;
  readonly rendition: string;
}

/**
 * Builds one Admin gallery-asset preview path.
 *
 * The asset id is percent-encoded. It is not attacker-controlled — it is read
 * from a row this request already resolved — but encoding is what keeps that
 * true if a future writer widens what an id may contain, and it costs nothing.
 */
export function adminGalleryAssetPreviewPath({
  assetId,
  rendition,
}: AdminGalleryAssetPathInput): string {
  return [ADMIN_GALLERY_ASSET_PATH_PREFIX, encodeURIComponent(assetId), rendition].join('/');
}
