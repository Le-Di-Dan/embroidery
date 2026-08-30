/**
 * The only place a prepared Gallery `Asset` becomes something a browser may see
 * (`APP11-B03A` §8).
 *
 * An allowlist, written by hand, for the reason `asset-projection.ts` states:
 * a spread of the row would publish `storageKey` the day someone adds a field,
 * and the storage key is the one value that turns a private bucket into a
 * guessable one.
 *
 * Deliberately absent: `storageKey`, every provenance identifier — including
 * the source asset this copy was made from, which is not a fact the Admin
 * surface needs and not one the schema persists — `uploadedByCustomerId`,
 * `uploadedViaChallengeId`, `intakeExpiresAt` and every object-storage fact.
 *
 * `renditions` is the part `APP11-A02` actually needs: an operator picking an
 * image must be able to see it, and the ids alone would make the Admin client
 * compose a private address out of parts it had to guess. Each entry is a
 * relative Admin path, produced by the same builder the route registers.
 */
import type { Asset } from '../../asset/domain/repositories/asset.repository';
import { adminGalleryAssetPreviewPath } from '../domain/admin-gallery-asset-path';
import { PUBLIC_GALLERY_MEDIA_RENDITIONS } from '../domain/gallery-asset-preparation.policy';

export interface AdminGalleryAssetRenditionView {
  readonly rendition: string;
  readonly url: string;
}

export interface AdminGalleryAssetView {
  readonly assetId: string;
  readonly kind: string;
  readonly classification: string;
  readonly status: string;
  readonly mediaType: string;
  readonly byteSize: number;
  readonly checksum: string;
  /** Every rendition this asset can be previewed and publicly served at. */
  readonly renditions: readonly AdminGalleryAssetRenditionView[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

/**
 * `sizeBytes` is a `bigint` in the row and a `number` here.
 *
 * Safe by construction: the value is copied from a catalog asset bounded by the
 * 25 MiB intake limit, eight orders of magnitude below `Number.MAX_SAFE_INTEGER`.
 * The conversion is explicit so JSON serialisation never meets a `bigint`,
 * which would throw.
 */
export function toAdminGalleryAssetView(asset: Asset): AdminGalleryAssetView {
  return {
    assetId: asset.id,
    kind: asset.kind,
    classification: asset.classification,
    status: asset.status,
    mediaType: asset.mimeType,
    byteSize: Number(asset.sizeBytes),
    // Copied from the source, whose intake computed it server-side before the
    // row existed. Empty only if the source somehow carried none — never
    // fabricated, because a wrong checksum is worse than an absent one.
    checksum: asset.checksum ?? '',
    renditions: PUBLIC_GALLERY_MEDIA_RENDITIONS.map((rendition) => ({
      rendition,
      url: adminGalleryAssetPreviewPath({ assetId: asset.id, rendition }),
    })),
    createdAt: asset.createdAt.toISOString(),
    updatedAt: asset.updatedAt.toISOString(),
  };
}
