/**
 * Classification of a product mutation failure.
 *
 * Only two distinctions change what the operator can do: an optimistic-
 * concurrency conflict (reload before editing further) and everything else (try
 * again later). Nothing here reads the server's message, request id or field
 * details for display — the approved copy is fixed, and echoing a backend string
 * would leak whatever the backend happened to say.
 */
import type { NormalizedApiError } from '@embroidery/api-client';

import { isProductApiError } from './product-failure';

/** The B02 domain code for a stale `expectedUpdatedAt`. */
export const PRODUCT_VERSION_CONFLICT_CODE = 'PRODUCT_VERSION_CONFLICT';
const HTTP_CONFLICT = 409;
const HTTP_NOT_FOUND = 404;

function normalizedOf(error: unknown): NormalizedApiError | null {
  return isProductApiError(error) ? error.normalized : null;
}

/**
 * True for the version conflict. The domain code is authoritative; HTTP 409 is
 * accepted as well so a proxy that preserves the status but not the envelope
 * still produces the correct, non-destructive outcome.
 */
export function isVersionConflict(error: unknown): boolean {
  const normalized = normalizedOf(error);
  if (normalized === null) {
    return false;
  }
  return (
    normalized.code === PRODUCT_VERSION_CONFLICT_CODE || normalized.httpStatus === HTTP_CONFLICT
  );
}

/** True when the requested product does not exist for this operator. */
export function isNotFound(error: unknown): boolean {
  return normalizedOf(error)?.httpStatus === HTTP_NOT_FOUND;
}
