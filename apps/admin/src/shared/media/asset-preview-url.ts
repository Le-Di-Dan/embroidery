/**
 * The address of an asset's preview image (`APP12-V02-C2`).
 *
 * An `<img src>` needs a URL, not an Axios call, so this is the one place the
 * Admin composes a media path by hand. It is a path and never a client: the
 * browser sends the session cookie automatically because the gateway serves the
 * Admin and the API on one origin, so nothing here touches credentials.
 *
 * The rendition is fixed to `thumbnail` rather than accepted as a parameter.
 * The library shows tiles, the tile rendition is a design decision and not a
 * caller's choice, and leaving it open would invite a screen to ask for the
 * larger derivative where a small one belongs.
 */
import { toApiOriginBase } from '../../config/api-base';

/** The documented gateway default, matching `browser-api-client`. */
const DEFAULT_API_BASE_PATH = '/api';

/** The tile rendition. `catalog-preview` is deliberately not reachable here. */
const LIBRARY_RENDITION = 'thumbnail';

/**
 * Builds the preview URL for one asset.
 *
 * The id is encoded even though it arrives from the API as a UUID: this value
 * becomes part of a URL, and a component that builds a path from a server value
 * without encoding it is a habit that survives until the value stops being a
 * UUID.
 */
export function buildAssetPreviewUrl(assetId: string): string {
  const origin = toApiOriginBase(process.env.NEXT_PUBLIC_API_BASE_PATH ?? DEFAULT_API_BASE_PATH);
  const base = origin === '/' ? '' : origin;
  return `${base}/api/admin/assets/${encodeURIComponent(assetId)}/${LIBRARY_RENDITION}`;
}
