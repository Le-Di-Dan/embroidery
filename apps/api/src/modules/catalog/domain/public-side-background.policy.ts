/**
 * The locked public Side-background delivery policy (`APP3-B02`; IMP-D044
 * PO-01/PO-06, IMP-D041 PO-02).
 *
 * The single place that decides *what an anonymous caller may be served for a
 * Product Side background*. Everything here is either a re-export of an
 * already-approved placement constant or a mapping grounded in one — nothing is
 * re-declared as a fresh literal, because a second copy of `'PUBLISHED'`,
 * `'ACCEPTED'` or `'NORMALIZED'` is how a delivery path silently drifts away
 * from the placement path that authorised it.
 *
 * The predicate deliberately mirrors `product-placement.policy.ts`: `APP3-B01`
 * decides a Side's background *may* be used in the Studio, and this route
 * re-proves the same facts on every request. Trusting the manifest's earlier
 * `studioEligible` is exactly what would let an unpublished Product keep
 * serving bytes to anyone holding an address (`ADR-APP2-001` §4.7).
 */
import {
  APP2_CATEGORY_STATUS,
  EDITOR_SAFE_DELIVERABLE_MEDIA_TYPES,
  EDITOR_SAFE_DERIVATIVE_KIND,
  EDITOR_SAFE_DERIVATIVE_STATE,
  PRODUCT_PUBLISHED_STATE,
  SIDE_BACKGROUND_ASSET_CLASSIFICATION,
  SIDE_BACKGROUND_ASSET_KIND,
  SIDE_BACKGROUND_ASSET_STATUS,
} from './product-placement.policy';

export {
  APP2_CATEGORY_STATUS,
  EDITOR_SAFE_DERIVATIVE_KIND,
  EDITOR_SAFE_DERIVATIVE_STATE,
  PRODUCT_PUBLISHED_STATE,
  SIDE_BACKGROUND_ASSET_CLASSIFICATION,
  SIDE_BACKGROUND_ASSET_KIND,
  SIDE_BACKGROUND_ASSET_STATUS,
};

/**
 * The media types a Side background may be delivered as.
 *
 * Exactly the raster output `APP3-W01A` produces. `image/svg+xml` is absent by
 * construction and must stay absent: `APP3-W01B` sanitizes Template SVG, and a
 * Template is not a Side background — `IMP-D044` PO-03 makes SVG profile-invalid
 * for `SIDE_BACKGROUND`, and this route is the place a later widening would be
 * felt first. The check is on the **persisted** `media_type`, so a row that
 * somehow carried an unapproved type is refused rather than streamed.
 */
export const PUBLIC_SIDE_BACKGROUND_MEDIA_TYPES = EDITOR_SAFE_DELIVERABLE_MEDIA_TYPES;

export type PublicSideBackgroundMediaType = (typeof PUBLIC_SIDE_BACKGROUND_MEDIA_TYPES)[number];

export function isDeliverableSideBackgroundMediaType(
  value: string,
): value is PublicSideBackgroundMediaType {
  return (PUBLIC_SIDE_BACKGROUND_MEDIA_TYPES as readonly string[]).includes(value);
}

/**
 * `no-store`, for the same reason `APP2-T01` uses it.
 *
 * Unpublish (`TR-LC04-05`), Side retirement and background replacement must each
 * revoke the *next* request. Any shared or browser cache that could answer after
 * one of those transitions would keep serving a withdrawn background, and no
 * canonical cache-invalidation consumer exists — the `product.unpublished`
 * outbox backlog is undispatched by design at this checkpoint.
 */
export const PUBLIC_SIDE_BACKGROUND_CACHE_CONTROL = 'no-store' as const;

/**
 * `inline` with no filename.
 *
 * The original upload name is never persisted (`APP2-B01`), and inventing one
 * would describe the object falsely. Omitting the parameter is the honest
 * option, and it also keeps untrusted text out of a response header.
 */
export const PUBLIC_SIDE_BACKGROUND_CONTENT_DISPOSITION = 'inline' as const;

/** Sent alongside every binary so a browser cannot re-interpret the payload. */
export const PUBLIC_SIDE_BACKGROUND_CONTENT_TYPE_OPTIONS = 'nosniff' as const;

/** Editor-safe derivatives live here. Private originals are never served. */
export const PUBLIC_SIDE_BACKGROUND_BUCKET = 'DERIVATIVES' as const;
