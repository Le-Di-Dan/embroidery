/**
 * The public gallery feed cursor (`APP11-B03` §6.1).
 *
 * It uses the canonical keyset codec from `@embroidery/persistence` unchanged —
 * same base64url-over-JSON encoding, same length bound, same single
 * `InvalidCursorError` for every malformed input — and adds nothing to it.
 *
 * Nothing to add is the whole point. `public-product-cursor.ts` had to bind a
 * category filter into the payload because a cursor is a position in *an
 * ordering* and "all published products" and "published products in `thu-bong`"
 * are two different orderings. The gallery feed takes no filter at all (§6.1:
 * no status, no search, no taxonomy), so there is exactly one sequence, every
 * cursor belongs to it, and a filter-binding term would be a field that could
 * only ever hold one value.
 *
 * The encoded payload holds `display_order` and the entry id — both ordering
 * keys, neither a capability. The cursor is opaque by contract, not a security
 * boundary: every read it can produce is a read the unauthenticated endpoint
 * would perform anyway behind the same `status = 'PUBLISHED'` predicate.
 */
import { InvalidCursorError, decodeCursor, encodeCursor } from '@embroidery/persistence';

import { publicGalleryEntryCursorInvalid } from './public-gallery-entry.errors';

export interface PublicGalleryEntryPosition {
  /** `gallery_entries.display_order` of the last row on the previous page. */
  readonly displayOrder: number;
  /** `gallery_entries.id` of that row — the unique tie-breaker (ADR-DB5-001 R2). */
  readonly id: string;
}

export function encodePublicGalleryEntryCursor(position: PublicGalleryEntryPosition): string {
  return encodeCursor({
    sortValue: String(position.displayOrder),
    tieBreaker: position.id,
  });
}

/**
 * Decodes a cursor into a position.
 *
 * Every failure — bad base64, bad JSON, wrong shape, a non-integer position, an
 * empty tie-breaker — produces the same `PUBLIC_GALLERY_ENTRY_CURSOR_INVALID`.
 * A caller cannot probe which part it got wrong, and a legitimate caller never
 * needs to: the only cursors it can hold came from a previous page.
 */
export function decodePublicGalleryEntryCursor(encoded: string): PublicGalleryEntryPosition {
  let sortValue: string;
  let tieBreaker: string;
  try {
    ({ sortValue, tieBreaker } = decodeCursor(encoded));
  } catch (error: unknown) {
    if (error instanceof InvalidCursorError) {
      throw publicGalleryEntryCursorInvalid();
    }
    throw error;
  }

  // `Number` on a validated integer literal only. A float, an empty string, a
  // sign trick or `Infinity` must not reach an ORDER BY comparison.
  if (!/^-?\d{1,10}$/.test(sortValue)) {
    throw publicGalleryEntryCursorInvalid();
  }
  const displayOrder = Number(sortValue);
  if (!Number.isSafeInteger(displayOrder) || tieBreaker === '') {
    throw publicGalleryEntryCursorInvalid();
  }

  return { displayOrder, id: tieBreaker };
}
