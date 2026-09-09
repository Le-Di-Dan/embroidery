/**
 * The one mapping from an Asset's lifecycle status to what a tile can show.
 *
 * Extracted from `ProductMediaTile` by `APP12-M01.E1-C1`, which needed the same
 * mapping on a second surface — the Product **media editor** grid, where the
 * absence of it was the defect: that grid passed a literal `state="READY"` and
 * so rendered a rejected image as a healthy one while every public surface had
 * quietly moved to a fallback.
 *
 * Extracted rather than copied, deliberately. Two enum switches over the same
 * wire vocabulary are two things to keep in step, and the one that is not
 * exercised by a live journey is the one that drifts.
 *
 * It lives beside `AssetThumbnail` rather than in the products feature because
 * it produces *that component's* vocabulary, and because both callers are its
 * consumers. A mapping owned by one feature and imported by another would make
 * that feature the authority on a shared component's states — the same
 * reasoning `media-copy.ts` records next door.
 */
import { MEDIA_COPY } from './media-copy';
import type { AssetThumbnailState } from './asset-thumbnail';

/**
 * The asset lifecycle state, read as what a tile can show.
 *
 * `status` is typed `string` on the wire because the contract leaves room for
 * states this screen does not know, so this parses rather than casts and an
 * unrecognised value falls to `ABSENT` — never to a promise of an image.
 */
export function toAssetThumbnailState(status: string | undefined): AssetThumbnailState {
  if (status === 'ACCEPTED') {
    return 'READY';
  }
  if (status === 'UPLOADED' || status === 'INSPECTING') {
    return 'PROCESSING';
  }
  if (status === 'REJECTED') {
    return 'REJECTED';
  }
  return 'ABSENT';
}

/**
 * The approved caption for a state that is not an image.
 *
 * `READY` has no caption because a ready tile shows its photograph instead;
 * asking for one is a caller error, and returning the "no image" caption for it
 * would let a healthy tile describe itself as empty.
 */
export function assetThumbnailCaption(state: Exclude<AssetThumbnailState, 'READY'>): string {
  if (state === 'PROCESSING') {
    return MEDIA_COPY.processing;
  }
  if (state === 'REJECTED') {
    return MEDIA_COPY.rejected;
  }
  return MEDIA_COPY.absent;
}
