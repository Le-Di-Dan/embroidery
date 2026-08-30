/**
 * The locked public gallery-media delivery policy (`APP11-B03` §9).
 *
 * This module is the single place that decides *what bytes an anonymous caller
 * may be served for an image a published gallery entry shows*. Nothing here is
 * a fresh literal where an approved one exists: the rendition vocabulary, the
 * derivative-kind resolver and every transport constant are re-exported from
 * `APP2-T01`'s catalog-media policy, exactly as `APP3-B05A`'s Template asset
 * policy re-exports the placement constants it depends on. A second copy of
 * `'READY'`, `'image/webp'` or the word `thumbnail` is how a delivery path
 * drifts away from the one that authorised it.
 *
 * ## The address is not the authorisation
 *
 * `assetId` is an opaque subordinate identity. It is deliberately not routable
 * on its own — there is no `/api/public/assets/{assetId}` — and it grants
 * nothing: the route carries the gallery slug because the entry's publication
 * is half of the proof, and the association is the other half.
 */
import {
  DERIVATIVE_KIND_BY_RENDITION,
  PUBLIC_MEDIA_BUCKET,
  PUBLIC_MEDIA_CACHE_CONTROL,
  PUBLIC_MEDIA_CONTENT_DISPOSITION,
  PUBLIC_MEDIA_CONTENT_TYPE,
  PUBLIC_MEDIA_CONTENT_TYPE_OPTIONS,
  PUBLIC_PRODUCT_MEDIA_RENDITIONS,
  PRODUCT_PUBLICATION_DERIVATIVE_STATE,
  resolveDerivativeKind,
  type PublicProductMediaRendition,
} from '../../catalog/domain/public-product-media.policy';
import { GALLERY_ENTRY_ASSET_CLASSIFICATION } from './admin-gallery-entry.policy';

export {
  GALLERY_ENTRY_ASSET_CLASSIFICATION,
  PUBLIC_MEDIA_BUCKET,
  PUBLIC_MEDIA_CACHE_CONTROL,
  PUBLIC_MEDIA_CONTENT_DISPOSITION,
  PUBLIC_MEDIA_CONTENT_TYPE,
  PUBLIC_MEDIA_CONTENT_TYPE_OPTIONS,
  PRODUCT_PUBLICATION_DERIVATIVE_STATE as PUBLIC_GALLERY_DERIVATIVE_STATE,
  resolveDerivativeKind,
};

/**
 * The rendition words a public caller may put in the path — the **same two**
 * `APP2-T01` publishes, reused rather than re-coined.
 *
 * `thumbnail` is the card image of the `/bo-suu-tap` feed and `catalog-preview`
 * is the larger display image of the detail page. Inventing a Gallery-only
 * spelling would mean two vocabularies for one set of derivative kinds, two
 * resolvers to keep in step, and a Storefront that has to know which surface it
 * is addressing before it can build a URL.
 */
export const PUBLIC_GALLERY_MEDIA_RENDITIONS = PUBLIC_PRODUCT_MEDIA_RENDITIONS;

export type PublicGalleryMediaRendition = PublicProductMediaRendition;

export { DERIVATIVE_KIND_BY_RENDITION as GALLERY_DERIVATIVE_KIND_BY_RENDITION };

/** The rendition a feed card addresses. */
export const PUBLIC_GALLERY_LIST_RENDITION = 'thumbnail' satisfies PublicGalleryMediaRendition;

/** The rendition a detail image addresses. */
export const PUBLIC_GALLERY_DETAIL_RENDITION =
  'catalog-preview' satisfies PublicGalleryMediaRendition;

/**
 * The Asset states that are **never** publicly deliverable (`APP11-B03` §9.3,
 * closing `FU-APP11-B02-01`).
 *
 * `DELETION_PENDING` is resolved here rather than left open, and it is resolved
 * by reading the repository's existing authority rather than by inventing a
 * Gallery answer:
 *
 * - `APP2-T01`'s public catalog-media delivery serves only `status = ACCEPTED`,
 *   so `DELETION_PENDING` is already undeliverable on the one delivered public
 *   binary route;
 * - `evidence-delivery.policy.ts` calls `DELETION_PENDING` and `DELETED`
 *   "tombstones";
 * - both public status projections (`request-asset-status.service.ts`,
 *   `transfer-evidence.view.ts`) map `DELETION_PENDING` onto `REJECTED` and
 *   state that it is "deliberately absent from the public vocabulary".
 *
 * The canonical meaning is therefore unambiguous — a deletion-pending object is
 * already withdrawn, not "serveable until the sweep runs" — so Gallery refuses
 * it too. `REJECTED` joins it because inspection has ruled against the file, and
 * `DELETED` because the binary is gone.
 *
 * The predicate is stated as an exclusion set rather than as `= ACCEPTED`
 * because `ACCEPTED` is unreachable for this lane: the asset-inspection worker
 * matches on the `(kind, classification)` pair and owns neither
 * `GALLERY_MEDIA` nor `PUBLIC`, so a gallery image never leaves `UPLOADED`
 * through any delivered pipeline. Copying the catalog's `= ACCEPTED` would not
 * be stricter, it would make the entire route undeliverable by construction —
 * exactly the mutually-exclusive-lane mistake `APP11-B02` was told not to
 * repeat. Every state the catalog refuses that Gallery *can* reach is refused
 * here.
 */
export const PUBLIC_GALLERY_ASSET_WITHDRAWN_STATES = [
  'REJECTED',
  'DELETION_PENDING',
  'DELETED',
] as const;

export type PublicGalleryAssetWithdrawnState =
  (typeof PUBLIC_GALLERY_ASSET_WITHDRAWN_STATES)[number];
