import type { AdminProductMediaResponse } from '@embroidery/api-client';

import { AssetThumbnail } from '../../../shared/media/asset-thumbnail';
import { toAssetThumbnailState } from '../../../shared/media/asset-thumbnail-state';

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
    <AssetThumbnail
      assetId={media?.assetId}
      state={toAssetThumbnailState(media?.status)}
      className={className}
    />
  );
}
