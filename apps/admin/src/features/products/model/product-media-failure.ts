/**
 * What a refused media save is allowed to say (`APP12-M01.D1` §Q).
 *
 * `APP12-M01.B2` refuses atomically: on every one of these outcomes the
 * product keeps its previous images, its published status and every commercial
 * field, and the operator's staged selection is still on screen. So each
 * message names what happened and what to do next, and every one of them says
 * the set was **not** saved — because it was not.
 *
 * The domain code is the only authority, never the HTTP status. `409` alone
 * covers a version conflict, a lifecycle refusal, an unavailable Asset *and* an
 * unpublishable set, and those four need four different next steps. A response
 * carrying a status without a code this module knows falls to `generic`, which
 * claims nothing.
 *
 * No server `message`, `requestId` or `errors` entry is read for display. The
 * copy is the approved copy; echoing the backend would put an English contract
 * string in front of a Vietnamese operator.
 */
import type { NormalizedApiError } from '@embroidery/api-client';

import { isProductApiError } from './product-failure';

/** The published set of images cannot stand on a published Product. */
export const PRODUCT_MEDIA_NOT_PUBLISHABLE_CODE = 'PRODUCT_MEDIA_NOT_PUBLISHABLE';
/** An Asset in the set is no longer `ACCEPTED`. */
export const PRODUCT_MEDIA_ASSET_UNAVAILABLE_CODE = 'PRODUCT_MEDIA_ASSET_UNAVAILABLE';
/** The same Asset appears twice in the requested array. */
export const PRODUCT_MEDIA_DUPLICATE_CODE = 'PRODUCT_MEDIA_DUPLICATE';
/** An id names no Asset, or one outside the catalog-media lane. */
export const PRODUCT_MEDIA_ASSET_NOT_FOUND_CODE = 'PRODUCT_MEDIA_ASSET_NOT_FOUND';
/** The `expectedUpdatedAt` this screen holds is stale. */
export const PRODUCT_VERSION_CONFLICT_CODE = 'PRODUCT_VERSION_CONFLICT';
/** The Product left the states that accept a media write. */
export const PRODUCT_NOT_EDITABLE_CODE = 'PRODUCT_NOT_EDITABLE';

/**
 * The classified outcome of one `adminProductMedia_replace` call.
 *
 * `version-conflict` is separated from the rest because it is the only one the
 * operator resolves by *reading* rather than by editing: the staged selection
 * may be perfectly valid and simply computed against an old token.
 */
export type ProductMediaFailure =
  | 'not-publishable'
  | 'asset-unavailable'
  | 'duplicate'
  | 'asset-not-found'
  | 'version-conflict'
  | 'not-editable'
  | 'generic';

function normalizedOf(error: unknown): NormalizedApiError | null {
  return isProductApiError(error) ? error.normalized : null;
}

export function classifyMediaFailure(error: unknown): ProductMediaFailure {
  switch (normalizedOf(error)?.code) {
    case PRODUCT_MEDIA_NOT_PUBLISHABLE_CODE:
      return 'not-publishable';
    case PRODUCT_MEDIA_ASSET_UNAVAILABLE_CODE:
      return 'asset-unavailable';
    case PRODUCT_MEDIA_DUPLICATE_CODE:
      return 'duplicate';
    case PRODUCT_MEDIA_ASSET_NOT_FOUND_CODE:
      return 'asset-not-found';
    case PRODUCT_VERSION_CONFLICT_CODE:
      return 'version-conflict';
    case PRODUCT_NOT_EDITABLE_CODE:
      return 'not-editable';
    default:
      return 'generic';
  }
}

/**
 * True only for the exact stale-token refusal.
 *
 * The single gate on the reload prompt, and deliberately the narrowest possible
 * test: telling an operator to reload discards nothing here — the staged
 * selection is preserved until they choose — but it is still advice that fixes
 * only this one cause.
 */
export function isMediaVersionConflict(error: unknown): boolean {
  return classifyMediaFailure(error) === 'version-conflict';
}
