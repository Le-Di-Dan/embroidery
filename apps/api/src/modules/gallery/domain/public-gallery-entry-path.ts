/**
 * The public gallery-media address, composed API-side (`APP11-B03` §6.4, §7.1).
 *
 * The same shape and the same reasoning as `public-product-catalog-path.ts`:
 * `@embroidery/contracts` owns the canonical builder for frontend consumers,
 * but the compiled API cannot `require` that package (IMP-D018), so the API
 * composes the path locally.
 *
 * The result is a **relative application path** and nothing else: no host, no
 * bucket, no object key, no signature, no expiry. It is served by the
 * publication-gated route, which re-resolves the entry, the association and the
 * asset on every request — so this string grants nothing on its own, and an
 * entry unpublished a moment later stops resolving without anything here having
 * to be recalled.
 */

/** The base path of the public gallery surface. */
export const PUBLIC_GALLERY_PATH_PREFIX = '/api/public/gallery-entries';
/** The segment that separates an entry address from one of its images. */
export const PUBLIC_GALLERY_ASSET_PATH_SEGMENT = 'assets';

export interface PublicGalleryMediaPathInput {
  readonly slug: string;
  readonly assetId: string;
  readonly rendition: string;
}

/**
 * Builds one public gallery-media path.
 *
 * Both variable segments are percent-encoded. Neither is attacker-controlled —
 * the slug and the asset id are read from rows this request already resolved —
 * but encoding is what keeps that true if a future writer widens what a slug
 * may contain, and it costs nothing here.
 */
export function publicGalleryMediaPath({
  slug,
  assetId,
  rendition,
}: PublicGalleryMediaPathInput): string {
  return [
    PUBLIC_GALLERY_PATH_PREFIX,
    encodeURIComponent(slug),
    PUBLIC_GALLERY_ASSET_PATH_SEGMENT,
    encodeURIComponent(assetId),
    rendition,
  ].join('/');
}
