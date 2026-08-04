/**
 * What a Product placement is, and what makes one Studio-eligible
 * (`APP3-B01`; IMP-D041 PO-01/PO-02/PO-03/PO-06, IMP-D044 PO-01/PO-03/PO-07).
 *
 * Placement authoring belongs to **Product/Catalog**, never Design (PO-01), so
 * this is the one place that decides it. The visibility half is deliberately a
 * **re-export** of the publication policy rather than a fresh literal: a second
 * copy of `PUBLISHED` is exactly how a manifest starts disagreeing with the
 * lifecycle that authorised it, and `public-product-catalog.policy.ts` already
 * made that argument for the catalogue itself.
 *
 * The eligibility constants below are the *editor-safe* lane, which is not the
 * catalogue-display lane: a Studio background is a `NORMALIZED` derivative and
 * never `THUMBNAIL`, `CATALOG_PREVIEW` or `PREVIEW_WATERMARKED` (IMP-D044
 * PO-01). Reusing the catalogue's kind here would put watermarked or marketing
 * bytes behind a design canvas.
 */
import type { AssetDerivativeKind } from '@embroidery/database';

import {
  APP2_CATEGORY_STATUS,
  PRODUCT_MEDIA_ASSET_CLASSIFICATION,
  PRODUCT_MEDIA_ASSET_KIND,
  PRODUCT_MEDIA_ASSET_STATUS,
  PRODUCT_PUBLICATION_DERIVATIVE_STATE,
  PRODUCT_PUBLISHED_STATE,
} from './product-publication.policy';

export {
  APP2_CATEGORY_STATUS,
  PRODUCT_MEDIA_ASSET_CLASSIFICATION,
  PRODUCT_MEDIA_ASSET_KIND,
  PRODUCT_MEDIA_ASSET_STATUS,
  PRODUCT_PUBLICATION_DERIVATIVE_STATE,
  PRODUCT_PUBLISHED_STATE,
};

/**
 * The stable machine identity of a Side or Area (IMP-D041 PO-07).
 *
 * The same expression `ck_product_sides__code_format` enforces. It has to be:
 * a code the API accepts but the CHECK rejects arrives as a bare 23514 at
 * commit — a 500 for what is really a validation failure.
 *
 * Written as a literal rather than imported, for the reason
 * `public-product-media.policy.ts` gives about renditions: the schema constant
 * lives inside the ORM namespace, which a **domain** module must not pull in
 * (`BACKEND_CONVENTIONS.md` §3), and `@embroidery/database` re-exports only
 * plain data at its root. The two declarations are held together by
 * `product-placement.policy.spec.ts`, which may import the schema because specs
 * are excluded from `dist`.
 */
export const PLACEMENT_CODE = '^[a-z0-9][a-z0-9_-]{0,63}$';

/** Longest `code` the pattern admits: one leading character plus 63 more. */
export const PLACEMENT_CODE_MAX_LENGTH = 64;
export const PLACEMENT_NAME_MAX_LENGTH = 200;

/**
 * The asset lane a side background must belong to (IMP-D044 PO-03).
 *
 * The same lane the catalogue's own images use, because a side background *is*
 * store-authored media. What differs is the derivative below, not the source.
 *
 * The classification is `PRODUCTION_SENSITIVE` and that is not a contradiction:
 * it describes the stored **original**, which is never delivered to anyone. What
 * a customer sees is a derivative, and which derivative may be seen is the
 * eligibility question, not a property of the source binary.
 */
export const SIDE_BACKGROUND_ASSET_KIND = PRODUCT_MEDIA_ASSET_KIND;
export const SIDE_BACKGROUND_ASSET_CLASSIFICATION = PRODUCT_MEDIA_ASSET_CLASSIFICATION;
export const SIDE_BACKGROUND_ASSET_STATUS = PRODUCT_MEDIA_ASSET_STATUS;

/**
 * Source media types a side background may be authored from (IMP-D044 PO-03).
 *
 * SVG is rejected here and accepted only for Admin Template assets (PO-04),
 * where it passes mandatory server-side sanitization APP3 has not built. A
 * background is raster; nothing downstream sanitizes one.
 */
export const SIDE_BACKGROUND_SOURCE_MEDIA_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export const REJECTED_SIDE_BACKGROUND_MEDIA_TYPE = 'image/svg+xml' as const;

/**
 * The sole editor-safe derivative kind (IMP-D044 PO-01).
 *
 * `NORMALIZED` means browser-decodable, orientation-normalized, metadata
 * stripped, of known intrinsic size and safe for its exact lane. No new enum
 * value was authorized, and the catalogue kinds are not interchangeable with it.
 */
export const EDITOR_SAFE_DERIVATIVE_KIND = 'NORMALIZED' as const satisfies AssetDerivativeKind;
export const EDITOR_SAFE_DERIVATIVE_STATE = PRODUCT_PUBLICATION_DERIVATIVE_STATE;

/**
 * The canonical metadata quartet a Studio-eligible derivative must carry
 * (IMP-D044 PO-07, PO-12).
 *
 * All four or none — `APP3-DB01` made that an all-or-none CHECK. Missing values
 * make a derivative **ineligible rather than fabricated**, and nothing here ever
 * asks object storage: the Studio does not guess a background's size.
 */
export const EDITOR_SAFE_METADATA_COLUMNS = [
  'width_px',
  'height_px',
  'media_type',
  'byte_size',
] as const;

/**
 * The canonical ordering tuple for every placement projection, Admin or public.
 *
 * `display_order` is the operator's curation, `code` is stable machine identity
 * and `id` is the tie-breaker without which the order is not total. Two sides
 * sharing a display order must still come back in the same sequence on every
 * read, or a Studio that auto-selects "the first side" would select a different
 * one between two page loads.
 */
export const PLACEMENT_ORDER = ['display_order', 'code', 'id'] as const;

/**
 * `no-store`, exactly as the public catalogue reads use it.
 *
 * The manifest carries `studioEligible`, which is derived from publication state
 * and derivative readiness — both of which can change without any invalidation
 * consumer existing in this repository. A stored copy could keep offering the
 * Studio for a product the operator has withdrawn.
 */
export const PUBLIC_PLACEMENT_CACHE_CONTROL = 'no-store' as const;
