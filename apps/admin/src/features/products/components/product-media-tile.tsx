import type { AdminProductMediaResponse } from '@embroidery/api-client';

import { AssetThumbnail, type AssetThumbnailState } from '../../../shared/media/asset-thumbnail';

/**
 * The product media tile.
 *
 * It replaces `ProductMediaPlaceholder`, which drew a neutral block and named
 * its own successor: "APP2 has no media-delivery contract … when it ships, this
 * component is the single place that changes." `APP12-V02-C2` shipped it, and
 * this is that change.
 *
 * A product with no selected image still renders the neutral block — that
 * absence is real and is not a failure. What no longer happens is a product
 * *with* an accepted image rendering as though it had none.
 */
export function ProductMediaTile({
  media,
  className = 'product-media',
}: {
  /** Absent when the product has selected no image. */
  readonly media?: AdminProductMediaResponse | undefined;
  readonly className?: string | undefined;
}) {
  return (
    <AssetThumbnail assetId={media?.assetId} state={toState(media?.status)} className={className} />
  );
}

/**
 * The asset lifecycle state, read as what the tile can show.
 *
 * `status` is typed `string` on the wire because the contract leaves room for
 * states this screen does not know, so this parses rather than casts and an
 * unrecognised value falls to `ABSENT` — never to a promise of an image.
 */
function toState(status: string | undefined): AssetThumbnailState {
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
