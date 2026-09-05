import type { AdminAssetDetailResponse } from '@embroidery/api-client';

import { buildAssetMetaLine, resolveAssetTitle } from '../model/asset-identity';
import { parseAssetStatus } from '../model/asset-status';
import { AssetStatusBadge } from './asset-status-badge';
import { AssetThumbnail } from './asset-thumbnail';

interface AssetCardProps {
  readonly asset: AdminAssetDetailResponse;
}

/**
 * One asset in the collection.
 *
 * The tile shows the asset's own pixels once it is `READY`, through
 * `adminAsset_preview` (`APP12-V02-C2`). Until then — and if inspection refused
 * the file — `AssetThumbnail` renders the specific reason instead, so a
 * placeholder always says which state produced it rather than standing in for
 * every one of them. A private original is still never addressed from a
 * browser: the route serves only processed derivatives.
 *
 * Identity is server-backed: the media type becomes the title and
 * `{size} · {createdAt}` the secondary line. No filename is displayed because
 * the backend stores none.
 */
export function AssetCard({ asset }: AssetCardProps) {
  const presentation = parseAssetStatus(asset.status);

  return (
    <li className="asset-card">
      <AssetThumbnail assetId={asset.assetId} presentation={presentation} />
      <div className="asset-card__info">
        <p className="asset-card__title">{resolveAssetTitle(asset.mediaType)}</p>
        <p className="asset-card__meta">{buildAssetMetaLine(asset.byteSize, asset.createdAt)}</p>
        <AssetStatusBadge presentation={presentation} />
      </div>
    </li>
  );
}
