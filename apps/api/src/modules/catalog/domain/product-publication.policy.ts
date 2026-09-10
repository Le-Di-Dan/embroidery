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
 * as the inclusions — inventory, shipping, discounts, reviews, search, SEO
 * fields and a nonzero display order are deliberately **not** publication
 * requirements (`APP2-B03` §7).
 *
 * Variants and SKUs were on that exclusion list until `APP12-N02.B01` and are
 * now the last three requirements. The reason for the change is not a change of
 * mind about §7: when it was written, no delivered operation could create a
 * variant or a SKU, so requiring one would have made every Product permanently
 * unpublishable. `APP12-N02.B01` supplies the writer, and the requirement comes
 * with it. Inventory stays excluded permanently — see
 * `PUBLICATION_STOCK_EXCLUSION`.
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
  // `APP12-N02.B01`. The three sellability requirements, appended rather than
  // inserted: the first seven keep their codes and their positions, so a client
  // that renders the list in order sees the checklist it already knew with
  // three rows added at the end.
  //
  // These are the requirements `APP2-B03` §7 deliberately excluded, and the
  // exclusion was correct *then*: no delivered operation could create a variant
  // or a SKU, so a variant requirement would have made every Ready-Made Product
  // permanently unpublishable. `APP12-N02.G01` proved the cost of leaving them
  // out once Ready-Made direct commerce shipped — a Product with no variant at
  // all reported 7/7 satisfied and published into a storefront that could never
  // sell it. `N02.B01` supplies the writer and the requirements together.
  //
  // What is still excluded, and now permanently: stock. Quantity on hand,
  // reservations and the low-stock threshold are Inventory truth (REL-026), and
  // a sold-out Product is a Product that is selling. See `PUBLICATION_STOCK_EXCLUSION`.
  'HAS_ACTIVE_VARIANT',
  'HAS_ORDER_ELIGIBLE_SKU',
  'SKU_PRICE_RESOLVABLE',
] as const;

/**
 * The Inventory facts publication readiness may never read (`APP12-N02.B01`
 * §15, `N02.D01` §J).
 *
 * Named as a constant so the exclusion is a stated rule with a home rather than
 * an absence a later reader has to infer from what the evaluator happens not to
 * do. A Product whose SKU has zero on hand, whose stock anchor has never been
 * created, or whose low-stock threshold is unset is **publishable**: those are
 * facts about supply on a Product that is offered for sale, and refusing to
 * publish on them would make "out of stock" and "not for sale" the same state.
 *
 * `evaluatePublicationReadiness` takes no argument that could carry any of
 * them, which is what makes this enforceable rather than aspirational.
 */
export const PUBLICATION_STOCK_EXCLUSION = [
  'sku_stocks',
  'quantity_on_hand',
  'low_stock_threshold',
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

/**
 * The states a **media-only** curation write may act on (`APP12-M01.B2`).
 *
 * `PUBLISHED` is here and nowhere else. A live Product's images must be
 * correctable without withdrawing it from the storefront first — unpublishing to
 * swap a photograph takes the product off Discover, drops its address out of the
 * catalog, and is visible to every customer browsing at that moment. So exactly
 * one bounded operation may write `product_media` while a Product is published,
 * and it may write nothing else: `PRODUCT_EDITABLE_STATES` is untouched, so
 * every generic Product field stays locked in `PUBLISHED` exactly as `APP2-B02`
 * left it.
 *
 * `ARCHIVED` is deliberately absent. An archived Product has no public surface
 * to curate and its own lifecycle is still deferred
 * (`FU-APP2-PRODUCT-ARCHIVE-LIFECYCLE-01`); a media write there would be an edit
 * to a retired row no reader can see.
 */
export const PRODUCT_MEDIA_CURATION_STATES = [
  PRODUCT_DRAFT_STATE,
  PRODUCT_PUBLISHED_STATE,
] as const;

/**
 * The requirements a **published** Product's media selection must satisfy.
 *
 * A strict subset of the publication requirement set, not a second readiness
 * model: the same `evaluatePublicationReadiness` runs over the requested
 * selection, and only these three codes are allowed to refuse it.
 *
 * The other four are excluded on purpose. Name, description, price and category
 * are already true of a published Product, and none is a fact a media write can
 * change — but a *category* can be archived after publication, and such a
 * Product is exactly the one an operator most needs to be able to fix an image
 * on. Blocking a media correction on it would turn an unrelated lifecycle
 * problem into an image problem.
 */
export const PRODUCT_MEDIA_PUBLICATION_REQUIREMENT_CODES = [
  'PRODUCT_MEDIA_READY',
  'PRODUCT_MEDIA_ASSETS_READY',
  'PRODUCT_MEDIA_DERIVATIVES_READY',
] as const satisfies readonly ProductPublicationRequirementCode[];

export function isPublishableState(status: string): boolean {
  return (PRODUCT_PUBLISHABLE_STATES as readonly string[]).includes(status);
}

export function isUnpublishableState(status: string): boolean {
  return (PRODUCT_UNPUBLISHABLE_STATES as readonly string[]).includes(status);
}
