/**
 * The public list cursor (`APP2-B04` §9/§10).
 *
 * It reuses the canonical keyset codec from `@embroidery/persistence` — same
 * base64url-over-JSON encoding, same length bound, same single
 * `InvalidCursorError` for every malformed input — and adds exactly one thing
 * that codec has no field for: the **filter the cursor was issued under**.
 *
 * That binding is not decoration. A keyset cursor is a position in *an
 * ordering*, and the ordering of "all published products" is not the ordering
 * of "published products in `thu-bong`". Replaying a cursor from one sequence
 * against the other silently skips or repeats rows, and the caller has no way
 * to tell. So the filter travels inside the cursor and a mismatch is rejected
 * rather than served: changing the filter starts a new sequence, which is what
 * the contract says it does.
 *
 * The encoded payload holds `display_order`, the product id and the filter —
 * all ordering keys, none of them a capability. The cursor is opaque by
 * contract, not a security boundary: it authorises nothing, and every read it
 * can produce is a read the unauthenticated endpoint would perform anyway
 * behind the same `status = 'PUBLISHED'` predicate.
 */
import { InvalidCursorError, decodeCursor, encodeCursor } from '@embroidery/persistence';

import { publicProductCursorInvalid } from './public-product-catalog.errors';

/** Stands for "no category filter". Not a valid slug, so it cannot collide. */
const NO_FILTER = '-';

/**
 * Separates the filter from the sort value inside the encoded payload.
 *
 * Safe because neither side can contain it: `display_order` is an integer and a
 * category slug is lowercase alphanumeric with hyphens (CST-011 / the fixed
 * APP2 taxonomy). Splitting on the *first* occurrence keeps that true even if
 * the vocabulary ever widens.
 */
const FILTER_SEPARATOR = ':';

export interface PublicProductPosition {
  /** `products.display_order` of the last row on the previous page. */
  readonly displayOrder: number;
  /** `products.id` of that row — the unique tie-breaker (ADR-DB5-001 R2). */
  readonly id: string;
}

export interface PublicProductCursorInput extends PublicProductPosition {
  /** The category slug the page was filtered by, if any. */
  readonly categorySlug: string | undefined;
}

export function encodePublicProductCursor(input: PublicProductCursorInput): string {
  return encodeCursor({
    sortValue: `${input.categorySlug ?? NO_FILTER}${FILTER_SEPARATOR}${String(input.displayOrder)}`,
    tieBreaker: input.id,
  });
}

/**
 * Decodes a cursor and proves it belongs to this filter.
 *
 * Every failure — bad base64, bad JSON, wrong shape, non-integer position,
 * wrong filter — produces the same `PUBLIC_PRODUCT_CURSOR_INVALID`. A caller
 * cannot probe which part it got wrong, and a legitimate caller never needs to:
 * the only cursors it can hold came from a previous page of this same query.
 */
export function decodePublicProductCursor(
  encoded: string,
  categorySlug: string | undefined,
): PublicProductPosition {
  let sortValue: string;
  let tieBreaker: string;
  try {
    ({ sortValue, tieBreaker } = decodeCursor(encoded));
  } catch (error: unknown) {
    if (error instanceof InvalidCursorError) {
      throw publicProductCursorInvalid();
    }
    throw error;
  }

  const separatorAt = sortValue.indexOf(FILTER_SEPARATOR);
  if (separatorAt < 0) {
    throw publicProductCursorInvalid();
  }
  const filter = sortValue.slice(0, separatorAt);
  const rawDisplayOrder = sortValue.slice(separatorAt + 1);

  if (filter !== (categorySlug ?? NO_FILTER)) {
    throw publicProductCursorInvalid();
  }
  // `Number` on a validated integer literal only. A float, an empty string, a
  // sign trick or `Infinity` must not reach an ORDER BY comparison.
  if (!/^-?\d{1,10}$/.test(rawDisplayOrder)) {
    throw publicProductCursorInvalid();
  }
  const displayOrder = Number(rawDisplayOrder);
  if (!Number.isSafeInteger(displayOrder)) {
    throw publicProductCursorInvalid();
  }
  if (tieBreaker === '') {
    throw publicProductCursorInvalid();
  }

  return { displayOrder, id: tieBreaker };
}
