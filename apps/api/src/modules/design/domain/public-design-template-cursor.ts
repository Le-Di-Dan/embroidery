/**
 * The public Design Template list cursor (`APP3-B05`).
 *
 * It reuses the canonical keyset codec from `@embroidery/persistence` — same
 * base64url-over-JSON encoding, same length bound, same single
 * `InvalidCursorError` for every malformed input — and adds the one thing that
 * codec has no field for: **the scope the cursor was issued under**.
 *
 * That binding is not decoration, and it matters more here than it does for the
 * public catalogue. A keyset cursor is a position in *an ordering*, and the
 * ordering of "published Templates for this Product/Side/Area" is a different
 * sequence for every triple. Replaying a cursor from one against another skips
 * or repeats rows silently, and the caller has no way to notice. So the whole
 * triple travels inside the cursor and a mismatch is refused rather than served:
 * changing the scope starts a new sequence, which is what the contract says it
 * does.
 *
 * The encoded payload holds `created_at`, the Template id and the three scope
 * ids — all of them ordering keys the caller already supplied or already
 * received, none of them a capability. The cursor is opaque by contract, not a
 * security boundary: it authorises nothing, and every row it can produce is a
 * row the same anonymous request would produce anyway behind the same
 * `PUBLISHED` predicate and the same eligibility check.
 */
import { InvalidCursorError, decodeCursor, encodeCursor } from '@embroidery/persistence';

import { publicDesignTemplateCursorInvalid } from './public-design-template.errors';
import type { PublishedTemplateScope } from './repositories/published-design-template.repository';

/**
 * Separates the scope from the sort value inside the encoded payload.
 *
 * Safe because no part can contain it: the three scope ids are UUIDs and the
 * sort value is an ISO-8601 timestamp, neither of which admits a `|`. The scope
 * is joined first and split by a fixed field count, so a value that somehow did
 * contain the separator would fail the count rather than shift the fields.
 */
const FIELD_SEPARATOR = '|';

/** `productId`, `productSideId`, `embroideryAreaId`, then the timestamp. */
const ENCODED_FIELD_COUNT = 4;

export interface PublicTemplatePosition {
  /** `design_templates.created_at` of the last row on the previous page. */
  readonly createdAt: Date;
  /** `design_templates.id` of that row — the unique tie-breaker (ADR-DB5-001 R2). */
  readonly id: string;
}

function scopeKey(scope: PublishedTemplateScope): string {
  return [scope.productId, scope.productSideId, scope.embroideryAreaId].join(FIELD_SEPARATOR);
}

export function encodePublicTemplateCursor(
  position: PublicTemplatePosition,
  scope: PublishedTemplateScope,
): string {
  return encodeCursor({
    sortValue: `${scopeKey(scope)}${FIELD_SEPARATOR}${position.createdAt.toISOString()}`,
    tieBreaker: position.id,
  });
}

/**
 * Decodes a cursor and proves it belongs to this scope.
 *
 * Every failure — bad base64, bad JSON, wrong shape, wrong field count, an
 * unparseable timestamp, an empty tie-breaker, a different scope — produces the
 * same `PUBLIC_DESIGN_TEMPLATE_CURSOR_INVALID`. A caller cannot probe which part
 * it got wrong, and a legitimate caller never needs to: the only cursors it can
 * hold came from a previous page of this same query.
 *
 * A malformed cursor is never treated as "start from the beginning". A caller
 * paging through the Templates of an Area would silently restart and process
 * every one of them a second time, having been told nothing.
 */
export function decodePublicTemplateCursor(
  encoded: string,
  scope: PublishedTemplateScope,
): PublicTemplatePosition {
  let sortValue: string;
  let tieBreaker: string;
  try {
    ({ sortValue, tieBreaker } = decodeCursor(encoded));
  } catch (error: unknown) {
    if (error instanceof InvalidCursorError) {
      throw publicDesignTemplateCursorInvalid();
    }
    throw error;
  }

  const fields = sortValue.split(FIELD_SEPARATOR);
  if (fields.length !== ENCODED_FIELD_COUNT) {
    throw publicDesignTemplateCursorInvalid();
  }
  const [productId, productSideId, embroideryAreaId, rawCreatedAt] = fields as [
    string,
    string,
    string,
    string,
  ];

  if (
    productId !== scope.productId ||
    productSideId !== scope.productSideId ||
    embroideryAreaId !== scope.embroideryAreaId
  ) {
    throw publicDesignTemplateCursorInvalid();
  }

  const createdAt = new Date(rawCreatedAt);
  if (Number.isNaN(createdAt.getTime())) {
    throw publicDesignTemplateCursorInvalid();
  }
  if (tieBreaker === '') {
    throw publicDesignTemplateCursorInvalid();
  }

  return { createdAt, id: tieBreaker };
}
