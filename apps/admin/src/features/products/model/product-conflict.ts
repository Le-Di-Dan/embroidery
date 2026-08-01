/**
 * Classification of a product mutation failure.
 *
 * The domain code is the only authority. HTTP `409` alone is not a version
 * conflict: `adminProduct_update` also answers `409` for a lifecycle refusal and
 * for an ineligible media asset, and the stale-version dialog is destructive
 * advice — it tells the operator to reload, which discards their edits, to fix a
 * problem reloading cannot fix. A response that carries `409` without the exact
 * code is therefore treated as an ordinary failure, not as a conflict.
 *
 * Nothing here reads the server's message, request id or field details for
 * display. The approved copy is fixed, and echoing a backend string would leak
 * whatever the backend happened to say.
 */
import type { NormalizedApiError } from '@embroidery/api-client';

import { isProductApiError } from './product-failure';

/** The B02 domain code for a stale `expectedUpdatedAt`. */
export const PRODUCT_VERSION_CONFLICT_CODE = 'PRODUCT_VERSION_CONFLICT';
/** The product left the state this screen may edit (`409`). */
export const PRODUCT_NOT_EDITABLE_CODE = 'PRODUCT_NOT_EDITABLE';
/** A selected Asset is no longer eligible as catalog media (`409`). */
export const PRODUCT_MEDIA_ASSET_UNAVAILABLE_CODE = 'PRODUCT_MEDIA_ASSET_UNAVAILABLE';

const HTTP_NOT_FOUND = 404;

/**
 * What the operator is actually facing, and therefore which of the approved
 * messages the screen may show.
 *
 * `generic` is the safe default for every other outcome — an unrecognised code,
 * a bare status, a transport failure. It never claims to know more than it does.
 */
export type ProductSaveFailure =
  'version-conflict' | 'not-editable' | 'media-unavailable' | 'generic';

function normalizedOf(error: unknown): NormalizedApiError | null {
  return isProductApiError(error) ? error.normalized : null;
}

export function classifySaveFailure(error: unknown): ProductSaveFailure {
  switch (normalizedOf(error)?.code) {
    case PRODUCT_VERSION_CONFLICT_CODE:
      return 'version-conflict';
    case PRODUCT_NOT_EDITABLE_CODE:
      return 'not-editable';
    case PRODUCT_MEDIA_ASSET_UNAVAILABLE_CODE:
      return 'media-unavailable';
    default:
      return 'generic';
  }
}

/**
 * True only for the exact version conflict.
 *
 * This is the single gate on the approved reload dialog, so it is deliberately
 * the narrowest possible test.
 */
export function isVersionConflict(error: unknown): boolean {
  return classifySaveFailure(error) === 'version-conflict';
}

/** True when the requested product does not exist for this operator. */
export function isNotFound(error: unknown): boolean {
  return normalizedOf(error)?.httpStatus === HTTP_NOT_FOUND;
}
