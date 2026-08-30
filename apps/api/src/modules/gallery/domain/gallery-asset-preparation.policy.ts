/**
 * The locked rules for deriving a public Gallery image from an accepted
 * catalog-media asset (`APP11-B03A` §3-§6).
 *
 * `APP11-B03-C1` recorded the gap this closes: the delivered intake lane can
 * only ever produce `CATALOG_MEDIA` / `PRODUCTION_SENSITIVE`, `APP11-B02` will
 * only attach a `PUBLIC` asset, and no operation stood between them. Nothing
 * here is a fresh literal where an approved one exists — the source lane, the
 * target lane, the rendition vocabulary, the derivative state and the transport
 * type are all re-exported from the modules that already own them, exactly as
 * `public-gallery-media.policy.ts` re-exports `APP2-T01`'s constants. A second
 * copy of `'READY'` or `'CATALOG_PREVIEW'` is how a preparation path drifts
 * away from the delivery path it exists to feed.
 *
 * ## Copy on promote
 *
 * The source is never reclassified. A catalog asset may already be attached to
 * a published Product, and `PRODUCTION_SENSITIVE` is the lane that Product
 * media is delivered from — flipping it to `PUBLIC` would move an image out
 * from under the contract that serves it. So preparation mints a **new** asset
 * with its own id, its own object keys and its own lifecycle, and leaves every
 * fact about the source exactly as it found it.
 *
 * ## Why the derived asset is `ACCEPTED` at birth
 *
 * Not because the state looks convenient: because the bytes are the same bytes
 * an inspection already accepted. The provider copies the object server-side,
 * so nothing in this process can alter it, and the derived row is created with
 * an `asset_inspections` record justifying the state — the evidence and the
 * status land in one transaction, which is the rule `recordInspection` states.
 * Sending a byte-identical copy back through the inspection worker would add a
 * queue, a delay and an asynchronous window in which `APP11-B02` could attach
 * an image `APP11-B03` cannot yet serve.
 */
import type { AssetDerivativeKind, AssetState } from '@embroidery/database';

import {
  LANE_BY_ADMIN_ASSET_SCOPE,
  type AdminAssetLane,
} from '../../asset/domain/admin-asset-scope.policy';
import {
  PUBLIC_GALLERY_DERIVATIVE_STATE,
  PUBLIC_GALLERY_MEDIA_RENDITIONS,
  PUBLIC_MEDIA_BUCKET,
  PUBLIC_MEDIA_CONTENT_TYPE,
  resolveDerivativeKind,
} from './public-gallery-media.policy';

export { PUBLIC_GALLERY_MEDIA_RENDITIONS, PUBLIC_MEDIA_BUCKET, PUBLIC_MEDIA_CONTENT_TYPE };

/** The lane a promotion source must already be in (`CATALOG_MEDIA` / `PRODUCTION_SENSITIVE`). */
export const PREPARATION_SOURCE_LANE: AdminAssetLane = LANE_BY_ADMIN_ASSET_SCOPE.CATALOG;

/** The lane the derived asset is minted into (`GALLERY_MEDIA` / `PUBLIC`). */
export const PREPARED_GALLERY_LANE: AdminAssetLane = LANE_BY_ADMIN_ASSET_SCOPE.GALLERY;

/**
 * The one source state a promotion may read from.
 *
 * Stated as a single required value rather than as an exclusion set, and that
 * asymmetry with `PUBLIC_GALLERY_ASSET_WITHDRAWN_STATES` is deliberate: for the
 * *catalog* lane `ACCEPTED` is reachable — the asset-inspection worker owns
 * exactly this `(kind, classification)` pair — so requiring it is both stricter
 * and satisfiable. `UPLOADED` and `INSPECTING` are refused because no
 * inspection has ruled yet and this checkpoint may not inherit a verdict that
 * does not exist; `REJECTED`, `DELETION_PENDING` and `DELETED` are refused
 * because one has ruled against the file or the binary is on its way out.
 */
export const PREPARATION_SOURCE_STATUS = 'ACCEPTED' satisfies AssetState;

/**
 * The state the derived asset is created in.
 *
 * The same `ACCEPTED`, and it is inside the delivery predicate rather than
 * merely outside the refused set: `APP11-B03` serves any state that is not
 * `REJECTED` / `DELETION_PENDING` / `DELETED`, and `APP2-T01` serves `ACCEPTED`
 * exactly, so a prepared image satisfies both without either being widened.
 */
export const PREPARED_GALLERY_ASSET_STATUS = 'ACCEPTED' satisfies AssetState;

/**
 * The derivatives that must exist and be `READY` on the source, and that the
 * derived asset carries in turn.
 *
 * Derived from the public rendition vocabulary rather than listed again, so the
 * set is by construction "every rendition `APP11-B03` can be asked for". Adding
 * a public rendition later therefore extends what preparation must produce, and
 * cannot leave a rendition addressable but unprepared.
 */
export const PREPARED_DERIVATIVE_KINDS: readonly AssetDerivativeKind[] = Object.freeze(
  PUBLIC_GALLERY_MEDIA_RENDITIONS.map(resolveDerivativeKind),
);

/** The state a prepared derivative must reach before the operation may succeed. */
export const PREPARED_DERIVATIVE_STATE = PUBLIC_GALLERY_DERIVATIVE_STATE;

/**
 * INV-22: a watermarked artifact is the customer/design preview, never public
 * showcase media — and `ck_asset_derivatives__watermark_by_kind` refuses a
 * watermarked `CATALOG_PREVIEW` outright. Both prepared kinds are therefore
 * unwatermarked, and the source's own flag is re-checked rather than trusted.
 */
export const PREPARED_DERIVATIVE_WATERMARKED = false;

/** Originals live here; the public route never serves from this bucket. */
export const PREPARATION_ORIGINALS_BUCKET = 'ORIGINALS' as const;

/**
 * The bounded, non-secret inspection finding recorded beside the derived
 * asset's `ACCEPTED` state.
 *
 * An asset id is a surrogate key carrying no personal data, which is why it may
 * appear here; a storage key, a bucket, a checksum or a provider message may
 * not, and none is interpolated. The row is never projected into any response —
 * no delivered operation reads `asset_inspections` — so this is operator
 * provenance in the database, not a public field.
 */
export function preparedGalleryInspectionDetail(sourceAssetId: string): string {
  return `Prepared from accepted catalog asset ${sourceAssetId}; object copied byte-identically.`;
}
