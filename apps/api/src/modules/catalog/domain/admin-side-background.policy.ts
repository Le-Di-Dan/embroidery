/**
 * The Admin Side-background delivery policy (`APP3-B02A`).
 *
 * This file declares **no constant of its own**. Every media-resolution value is
 * re-exported from the `APP3-B02` policy, which is itself a re-export hub over
 * `product-placement.policy.ts`. That indirection is the point: `IMP-D044`
 * PO-01/PO-03 decide which derivative kind, state and media types are
 * editor-safe, and a second literal here is exactly how an Admin delivery path
 * would silently drift away from the public one it must agree with.
 *
 * What B02A changes is **authorization**, not media resolution:
 *
 * - the public route requires `PUBLISHED` Product and a visible Category;
 * - this one requires an authenticated Admin and nothing about publication.
 *
 * `APP3-A01` authors placement while the Product is still `DRAFT` — that is the
 * normal case, not an edge one — so a publication predicate here would make the
 * screen unusable for exactly the products it exists to set up. The predicate
 * that replaces it is Admin authentication plus Product↔Side membership.
 *
 * The transport constants are shared verbatim. `no-store` matters *more* here
 * than on the public route: these bytes belong to a product that may never have
 * been published, so no shared or browser cache may retain them.
 */
export {
  EDITOR_SAFE_DERIVATIVE_KIND,
  EDITOR_SAFE_DERIVATIVE_STATE,
  SIDE_BACKGROUND_ASSET_CLASSIFICATION,
  SIDE_BACKGROUND_ASSET_KIND,
  SIDE_BACKGROUND_ASSET_STATUS,
} from './public-side-background.policy';

export {
  /** The W01A raster output, and never Template SVG (`IMP-D044` PO-03). */
  PUBLIC_SIDE_BACKGROUND_MEDIA_TYPES as ADMIN_SIDE_BACKGROUND_MEDIA_TYPES,
  isDeliverableSideBackgroundMediaType,
  /** Editor-safe derivatives only. A private original is never served. */
  PUBLIC_SIDE_BACKGROUND_BUCKET as ADMIN_SIDE_BACKGROUND_BUCKET,
  PUBLIC_SIDE_BACKGROUND_CACHE_CONTROL as ADMIN_SIDE_BACKGROUND_CACHE_CONTROL,
  PUBLIC_SIDE_BACKGROUND_CONTENT_DISPOSITION as ADMIN_SIDE_BACKGROUND_CONTENT_DISPOSITION,
  PUBLIC_SIDE_BACKGROUND_CONTENT_TYPE_OPTIONS as ADMIN_SIDE_BACKGROUND_CONTENT_TYPE_OPTIONS,
} from './public-side-background.policy';
