/**
 * Classification of an Admin category mutation failure (`APP12-A01`).
 *
 * ## The domain code is the only authority
 *
 * HTTP `409` alone decides nothing here. `APP12-C02` answers `409` for a stale
 * concurrency token, for a duplicate slug, for a slug edited after publication,
 * for an illegal lifecycle move **and** for an archive still holding published
 * products — five different situations with five different safe next actions.
 * Reading the status would let the screen offer "reload and lose your edits" to
 * an operator whose real problem is that the slug is taken.
 *
 * A `409` carrying no recognised code is therefore an ordinary failure, not a
 * conflict.
 *
 * ## Nothing here reads the server's prose
 *
 * The approved copy is fixed. Echoing `message` would put a backend sentence —
 * possibly naming a column or a UUID — on an operator screen.
 */
import type { NormalizedApiError } from '@embroidery/api-client';

import { isCategoryApiError } from './category-failure';

/** The category disappeared between the read and the write. */
export const CATEGORY_NOT_FOUND_CODE = 'CATEGORY_NOT_FOUND';
/** Another category already owns this slug, in any lifecycle state. */
export const CATEGORY_SLUG_CONFLICT_CODE = 'CATEGORY_SLUG_CONFLICT';
/** The slug was sent for a PUBLISHED or ARCHIVED category. */
export const CATEGORY_SLUG_IMMUTABLE_CODE = 'CATEGORY_SLUG_IMMUTABLE';
/** The requested lifecycle move is not one the contract allows. */
export const CATEGORY_INVALID_TRANSITION_CODE = 'CATEGORY_INVALID_TRANSITION';
/** Archive refused: published products still sit in the category. */
export const CATEGORY_ARCHIVE_BLOCKED_CODE = 'CATEGORY_ARCHIVE_BLOCKED_BY_PUBLISHED_PRODUCTS';
/** `expectedUpdatedAt` was stale. */
export const CATEGORY_VERSION_CONFLICT_CODE = 'CATEGORY_VERSION_CONFLICT';
/** The taxonomy is too large for the unpaged read to answer. */
export const CATEGORY_INVENTORY_TOO_LARGE_CODE = 'CATEGORY_INVENTORY_TOO_LARGE';

const HTTP_NOT_FOUND = 404;

/**
 * What the operator is actually facing, and therefore which approved message
 * and which recovery control the screen may show.
 *
 * `generic` is the safe default for every other outcome — an unrecognised code,
 * a bare status, a transport failure. It never claims to know more than it does.
 */
export type CategoryFailure =
  | 'not-found'
  | 'slug-conflict'
  | 'slug-immutable'
  | 'invalid-transition'
  | 'archive-blocked'
  | 'version-conflict'
  | 'inventory-too-large'
  | 'generic';

function normalizedOf(error: unknown): NormalizedApiError | null {
  return isCategoryApiError(error) ? error.normalized : null;
}

const BY_CODE: Readonly<Record<string, CategoryFailure>> = {
  [CATEGORY_NOT_FOUND_CODE]: 'not-found',
  [CATEGORY_SLUG_CONFLICT_CODE]: 'slug-conflict',
  [CATEGORY_SLUG_IMMUTABLE_CODE]: 'slug-immutable',
  [CATEGORY_INVALID_TRANSITION_CODE]: 'invalid-transition',
  [CATEGORY_ARCHIVE_BLOCKED_CODE]: 'archive-blocked',
  [CATEGORY_VERSION_CONFLICT_CODE]: 'version-conflict',
  [CATEGORY_INVENTORY_TOO_LARGE_CODE]: 'inventory-too-large',
};

export function classifyCategoryFailure(error: unknown): CategoryFailure {
  const normalized = normalizedOf(error);
  const byCode = normalized?.code === undefined ? undefined : BY_CODE[normalized.code];
  if (byCode !== undefined) return byCode;
  // A 404 with no code still means the row is gone; nothing else is inferred.
  return normalized?.httpStatus === HTTP_NOT_FOUND ? 'not-found' : 'generic';
}

/**
 * Whether the failure belongs to a **field** rather than to the screen.
 *
 * Both slug refusals are answers about the slug the operator typed, so they
 * belong under the slug control where `aria-describedby` will announce them —
 * not in a page-level banner the operator has to correlate back to a field.
 */
export function isSlugFieldFailure(failure: CategoryFailure): boolean {
  return failure === 'slug-conflict' || failure === 'slug-immutable';
}

/**
 * True only for the exact version conflict.
 *
 * The single gate on the reload-latest recovery, so it is deliberately the
 * narrowest possible test: that recovery discards the operator's unsaved edits,
 * and offering it for anything else would destroy work it cannot repair.
 */
export function isCategoryVersionConflict(error: unknown): boolean {
  return classifyCategoryFailure(error) === 'version-conflict';
}
