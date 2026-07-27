import type { AdminAssetDetailResponse } from '@embroidery/api-client';

import { ASSET_COPY } from '../model/asset-copy';
import { buildAssetMetaLine, resolveAssetTitle } from '../model/asset-identity';
import { parseAssetStatus } from '../model/asset-status';
import { AssetStatusBadge } from './asset-status-badge';

interface AssetCardProps {
  readonly asset: AdminAssetDetailResponse;
}

/**
 * One asset in the collection.
 *
 * The thumbnail is a neutral placeholder, not an image. APP2 exposes no public
 * or authenticated media-delivery operation, so there is no address from which
 * a preview could honestly be loaded — and a private original must never be
 * addressed from a browser. Inventing a URL, or substituting a stand-in picture
 * that implies the stored bytes, would both be lies about what exists.
 *
 * Identity is server-backed: the media type becomes the title and
 * `{size} · {createdAt}` the secondary line. No filename is displayed because
 * the backend stores none.
 */
export function AssetCard({ asset }: AssetCardProps) {
  return (
    <li className="asset-card">
      <div
        className="asset-card__thumb"
        role="img"
        aria-label={ASSET_COPY.identity.thumbnailPlaceholder}
      >
        <span className="asset-card__glyph" aria-hidden="true">
          ▣
        </span>
      </div>
      <div className="asset-card__info">
        <p className="asset-card__title">{resolveAssetTitle(asset.mediaType)}</p>
        <p className="asset-card__meta">{buildAssetMetaLine(asset.byteSize, asset.createdAt)}</p>
        <AssetStatusBadge presentation={parseAssetStatus(asset.status)} />
      </div>
    </li>
  );
}
