/**
 * What an authenticated operator may see of an asset's pixels
 * (`APP12-V02-C2` §14).
 *
 * ## Why this exists at all
 *
 * `APP2-A01` drew the Admin asset library with a neutral placeholder where each
 * thumbnail belongs, and said so in the component: there was no Admin binary
 * delivery contract at the time, so a placeholder was the only honest thing to
 * draw. Every other lane has since grown one — `adminGalleryAsset_preview` for
 * the showcase lane, `adminCustomRequestAsset_content` for intake,
 * `adminPaymentEvidence_content` for transfer evidence — and the catalog lane,
 * the one an image-led commerce product is actually built on, was left with the
 * placeholder. That is the gap this closes, and closing it is why the operator
 * can now see what they uploaded.
 *
 * ## What it deliberately is not
 *
 * Not a general asset browser, and not a way to reach an original. Three
 * narrowings, all enforced rather than documented:
 *
 * 1. **Lane.** The caller names a scope and gets that lane's
 *    `(kind, classification)` pair, reusing `admin-asset-scope.policy` — the
 *    same closed vocabulary the list and detail reads are confined to. An id
 *    outside the named lane is absent, identically to an id that never existed.
 * 2. **Rendition.** Only the two processed derivatives the public routes serve.
 *    There is no rendition word that maps to `ORIGINAL`, so no request can
 *    spell one: a private original is unreachable through this route by
 *    vocabulary, not by a check that could be forgotten.
 * 3. **Bucket.** `DERIVATIVES`. The originals bucket is never opened here.
 *
 * The transport constants are duplicated from the public media policies on
 * purpose. Importing Catalog or Gallery from Asset would invert the dependency
 * — those modules read Asset's ports, never the reverse — and
 * `admin-asset-preview.policy.spec.ts` pins these values against the public
 * ones instead, which is the device `admin-asset-scope.policy` already uses for
 * the `GALLERY` pair.
 */
import type { AssetDerivativeKind } from '@embroidery/database';

/** The rendition words a caller may spell, and the only ones. */
export const ADMIN_ASSET_PREVIEW_RENDITIONS = ['thumbnail', 'catalog-preview'] as const;

export type AdminAssetPreviewRendition = (typeof ADMIN_ASSET_PREVIEW_RENDITIONS)[number];

/**
 * Total over the rendition union. `ORIGINAL` appears nowhere in the value set,
 * which is what makes the private original unreachable rather than merely
 * forbidden.
 */
export const DERIVATIVE_KIND_BY_ADMIN_PREVIEW_RENDITION: Readonly<
  Record<AdminAssetPreviewRendition, AssetDerivativeKind>
> = Object.freeze({
  thumbnail: 'THUMBNAIL',
  'catalog-preview': 'CATALOG_PREVIEW',
});

export function resolveAdminPreviewDerivativeKind(
  rendition: AdminAssetPreviewRendition,
): AssetDerivativeKind {
  return DERIVATIVE_KIND_BY_ADMIN_PREVIEW_RENDITION[rendition];
}

/** Processed derivatives only; the originals bucket is not addressable here. */
export const ADMIN_PREVIEW_BUCKET = 'DERIVATIVES' as const;

/** The only derivative state whose `storage_key` is a durable reference. */
export const ADMIN_PREVIEW_DERIVATIVE_STATE = 'READY' as const;

/** WebP, the single type `APP2-W01` encodes every catalog derivative to. */
export const ADMIN_PREVIEW_CONTENT_TYPE = 'image/webp' as const;

/**
 * `no-store`, matching every other authenticated media route.
 *
 * An operator preview is behind a session. Letting a shared cache keep it would
 * put a production-sensitive image somewhere the session boundary does not
 * reach, and the images are small enough that re-fetching costs nothing worth
 * trading for that.
 */
export const ADMIN_PREVIEW_CACHE_CONTROL = 'no-store' as const;

export const ADMIN_PREVIEW_CONTENT_TYPE_OPTIONS = 'nosniff' as const;

/** Rendered in place, never offered as a download. */
export const ADMIN_PREVIEW_CONTENT_DISPOSITION = 'inline' as const;
