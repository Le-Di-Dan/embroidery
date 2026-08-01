/**
 * The locked Product publication policy (`APP2-B03`, LC-04 / IMP-D035).
 *
 * Two things live here and nothing else: the lifecycle states each publication
 * transition may act on, and the closed, ordered set of readiness requirement
 * codes. Both are approved product facts rather than tuning knobs, so they are
 * declared once and read by the evaluator, the service, the DTOs and the tests.
 *
 * Every requirement below is grounded in a source document. None is invented
 * from general ecommerce practice, and the exclusions are as much the contract
 * as the inclusions — variants, SKU, inventory, shipping, discounts, reviews,
 * search, SEO fields and a nonzero display order are deliberately **not**
 * publication requirements (`APP2-B03` §7).
 */
import {
  APP2_CATEGORY_STATUS,
  PRODUCT_MEDIA_PRIMARY_ROLE,
  PRODUCT_MEDIA_SECONDARY_ROLE,
  type AssetDerivativeKind,
  type AssetDerivativeState,
  type ProductState,
} from '@embroidery/database';

import {
  PRODUCT_ARCHIVED_STATE,
  PRODUCT_CURRENCY,
  PRODUCT_DRAFT_STATE,
  PRODUCT_MEDIA_ASSET_CLASSIFICATION,
  PRODUCT_MEDIA_ASSET_KIND,
  PRODUCT_MEDIA_ASSET_STATUS,
} from './product-draft.policy';

export {
  APP2_CATEGORY_STATUS,
  PRODUCT_CURRENCY,
  PRODUCT_MEDIA_ASSET_CLASSIFICATION,
  PRODUCT_MEDIA_ASSET_KIND,
  PRODUCT_MEDIA_ASSET_STATUS,
  PRODUCT_MEDIA_PRIMARY_ROLE,
  PRODUCT_MEDIA_SECONDARY_ROLE,
};

/** The state a publish moves a product to (`TR-LC04-01`). */
export const PRODUCT_PUBLISHED_STATE = 'PUBLISHED' as const satisfies ProductState;

/**
 * The only state a publish may start from.
 *
 * `ARCHIVED → PUBLISHED` is `TR-LC04-04`, a separate *relist* transition with
 * its own audit contract (reason required). `APP2-B03` §11 permits reusing it
 * here only when source authority explicitly says so, and it does not — the
 * archive lifecycle is deferred as `FU-APP2-PRODUCT-ARCHIVE-LIFECYCLE-01`. So an
 * archived product is a safe conflict here rather than a silent relist.
 */
export const PRODUCT_PUBLISHABLE_STATES = [PRODUCT_DRAFT_STATE] as const;

/**
 * The only state an unpublish may start from (`TR-LC04-05`).
 *
 * `DRAFT` is already unpublished and `ARCHIVED` is a different lifecycle fact;
 * neither is silently accepted, because an operation that "succeeds" without a
 * transition would advance the concurrency token and write evidence for nothing.
 */
export const PRODUCT_UNPUBLISHABLE_STATES = [PRODUCT_PUBLISHED_STATE] as const;

/** The state an unpublish returns a product to — the existing editable draft. */
export const PRODUCT_UNPUBLISHED_STATE = PRODUCT_DRAFT_STATE;

/** Re-exported so callers never re-declare the archived literal. */
export { PRODUCT_ARCHIVED_STATE, PRODUCT_DRAFT_STATE };

/**
 * The closed, ordered set of publication requirement codes.
 *
 * Order is part of the contract: the readiness response lists requirements in
 * exactly this sequence, so a client can render a stable checklist without
 * sorting, and a test can assert the whole list rather than a set. Codes are
 * literals — never built from an id, a field name or a template — so no
 * identifier can leak through one.
 */
export const PRODUCT_PUBLICATION_REQUIREMENT_CODES = [
  'PRODUCT_NAME_READY',
  'PRODUCT_DESCRIPTION_READY',
  'PRODUCT_CATEGORY_READY',
  'PRODUCT_PRICE_READY',
  'PRODUCT_MEDIA_READY',
  'PRODUCT_MEDIA_ASSETS_READY',
  'PRODUCT_MEDIA_DERIVATIVES_READY',
] as const;

export type ProductPublicationRequirementCode =
  (typeof PRODUCT_PUBLICATION_REQUIREMENT_CODES)[number];

/**
 * The derivatives every attached catalog image must already have.
 *
 * `THUMBNAIL` is the product-card image (Q-01) and `CATALOG_PREVIEW` is the
 * catalog display image added for exactly this purpose by `APP2-DB01`; the
 * worker (`APP2-W01`) produces both for an accepted `CATALOG_MEDIA` asset. Both
 * must be unwatermarked — `CATALOG_PREVIEW` is physically constrained to that
 * by CST-126, and a watermarked thumbnail would put a customer-preview artifact
 * on a storefront card (INV-22).
 */
export const PRODUCT_PUBLICATION_DERIVATIVE_KINDS = [
  'THUMBNAIL',
  'CATALOG_PREVIEW',
] as const satisfies readonly AssetDerivativeKind[];

/** The only derivative state that is serveable. */
export const PRODUCT_PUBLICATION_DERIVATIVE_STATE = 'READY' as const satisfies AssetDerivativeState;

/** The base price sentinel meaning "not set yet" (IMP-D032). */
export const PRODUCT_UNSET_BASE_PRICE = 0n;

export function isPublishableState(status: string): boolean {
  return (PRODUCT_PUBLISHABLE_STATES as readonly string[]).includes(status);
}

export function isUnpublishableState(status: string): boolean {
  return (PRODUCT_UNPUBLISHABLE_STATES as readonly string[]).includes(status);
}
