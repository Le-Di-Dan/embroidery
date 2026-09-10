/**
 * Publication readiness, evaluated as a pure function (`APP2-B03` §7/§8).
 *
 * Deliberately free of NestJS, Drizzle, transactions and I/O: readiness is a
 * decision about facts, so it is expressed as facts in and a verdict out. That
 * is what lets the publish transaction re-run *exactly* the check the readiness
 * GET reported, against rows it has just locked — two evaluators that had to
 * agree by inspection would eventually stop agreeing.
 *
 * Every requirement is grounded in a source document; the grounding is recorded
 * beside each rule rather than in a separate table that could drift from it.
 */
import {
  APP2_CATEGORY_STATUS,
  PRODUCT_CURRENCY,
  PRODUCT_MEDIA_ASSET_CLASSIFICATION,
  PRODUCT_MEDIA_ASSET_KIND,
  PRODUCT_MEDIA_ASSET_STATUS,
  PRODUCT_MEDIA_PRIMARY_ROLE,
  PRODUCT_MEDIA_PUBLICATION_REQUIREMENT_CODES,
  PRODUCT_MEDIA_SECONDARY_ROLE,
  PRODUCT_PUBLICATION_DERIVATIVE_KINDS,
  PRODUCT_PUBLICATION_DERIVATIVE_STATE,
  PRODUCT_PUBLICATION_REQUIREMENT_CODES,
  PRODUCT_UNSET_BASE_PRICE,
  type ProductPublicationRequirementCode,
} from './product-publication.policy';
import { resolvePublicSkuUnitPrice } from './public-sku-price.policy';

/** The product fields readiness reads. A subset of the row, by design. */
export interface PublicationProductFacts {
  readonly name: string;
  readonly slug: string;
  readonly description: string | undefined;
  /** `numeric(14,2)` as a string — never parsed into a JavaScript number. */
  readonly basePriceAmount: string;
  readonly currencyCode: string;
}

/** The owning category, absent only if the join found no row. */
export interface PublicationCategoryFacts {
  readonly status: string;
  readonly archivedAt: Date | undefined;
}

export interface PublicationMediaFacts {
  readonly assetId: string;
  readonly role: string;
  readonly displayOrder: number;
}

export interface PublicationAssetFacts {
  readonly assetId: string;
  readonly kind: string;
  readonly classification: string;
  readonly status: string;
  readonly deletedAt: Date | undefined;
}

export interface PublicationDerivativeFacts {
  readonly assetId: string;
  readonly kind: string;
  readonly status: string;
  readonly isWatermarked: boolean;
  readonly storageKey: string | undefined;
}

/**
 * One variant of the product (`APP12-N02.B01`).
 *
 * Two fields, because two are all three sellability requirements read. There is
 * deliberately no label, no display order and no stock: a requirement reports a
 * code and a boolean, and a fact this evaluator cannot use is a fact that would
 * only ever leak.
 */
export interface PublicationVariantFacts {
  readonly variantId: string;
  readonly isActive: boolean;
}

/**
 * One SKU under one of those variants.
 *
 * `currencyCode` is the SKU's own — `skus.currency_code` and
 * `products.currency_code` are separate columns with separate CHECKs, and each
 * is the currency *of its own row's amount*, so an override is priced in the
 * SKU's currency and an inherited base price in the product's.
 */
export interface PublicationSkuFacts {
  readonly skuId: string;
  readonly variantId: string;
  readonly isActive: boolean;
  /** `numeric(14,2)` as a string, or absent when the base price applies. */
  readonly priceOverrideAmount: string | undefined;
  readonly currencyCode: string;
}

export interface ProductPublicationFacts {
  readonly product: PublicationProductFacts;
  readonly category: PublicationCategoryFacts | undefined;
  /** Ordered by `display_order`, as stored. */
  readonly media: readonly PublicationMediaFacts[];
  /** Only the assets actually referenced by `media`, in any order. */
  readonly assets: readonly PublicationAssetFacts[];
  /** Live derivatives of those assets, in any order. */
  readonly derivatives: readonly PublicationDerivativeFacts[];
  /** Every variant of the product, active and inactive (`APP12-N02.B01`). */
  readonly variants: readonly PublicationVariantFacts[];
  /** Every SKU under those variants, active and inactive. */
  readonly skus: readonly PublicationSkuFacts[];
}

export interface ProductPublicationRequirement {
  readonly code: ProductPublicationRequirementCode;
  readonly satisfied: boolean;
}

export interface ProductPublicationReadiness {
  readonly eligible: boolean;
  readonly requirements: readonly ProductPublicationRequirement[];
}

function isPresent(value: string | undefined): boolean {
  return value !== undefined && value.trim() !== '';
}

/**
 * A whole đồng amount strictly greater than the "not set" sentinel.
 *
 * String and `BigInt` only. `numeric(14,2)` returns `250000.00`, and turning
 * that into a JavaScript float to compare it would lose precision above 2^53 —
 * money must survive the round trip exactly (`CLAUDE.md` §5). A fractional part
 * that is not all zeros is *not* silently truncated: VND has no minor unit
 * (`ck_products__currency_scale`), so such a value is unpublishable rather than
 * rounded into something the operator never entered.
 */
export function isPublishablePrice(amount: string, currencyCode: string): boolean {
  if (currencyCode !== PRODUCT_CURRENCY) {
    return false;
  }
  const match = /^(\d+)(?:\.0+)?$/.exec(amount.trim());
  if (match?.[1] === undefined) {
    return false;
  }
  return BigInt(match[1]) > PRODUCT_UNSET_BASE_PRICE;
}

/**
 * The stored media selection is exactly what `APP2-B02` writes (IMP-D032):
 * contiguous `display_order` from zero, the first item `THUMBNAIL`, the rest
 * `GALLERY`. There is no maximum — the earlier twelve-item cap was an invented
 * product rule and the batch reads removed the only reason for it.
 */
function isPublishableMedia(media: readonly PublicationMediaFacts[]): boolean {
  if (media.length === 0) {
    return false;
  }
  return media.every((item, position) => {
    if (item.displayOrder !== position) {
      return false;
    }
    const expected = position === 0 ? PRODUCT_MEDIA_PRIMARY_ROLE : PRODUCT_MEDIA_SECONDARY_ROLE;
    return item.role === expected;
  });
}

/**
 * Every referenced asset is still in the catalog-media lane and still accepted.
 *
 * Re-checked here rather than trusted from the `APP2-B02` write that created the
 * link: an asset can be rejected or tombstoned after it was attached, and a
 * publish that trusted history would put a withdrawn image on the storefront.
 */
function areAssetsPublishable(
  media: readonly PublicationMediaFacts[],
  assets: readonly PublicationAssetFacts[],
): boolean {
  const byId = new Map(assets.map((asset) => [asset.assetId, asset]));
  return media.every((link) => {
    const asset = byId.get(link.assetId);
    return (
      asset !== undefined &&
      asset.kind === PRODUCT_MEDIA_ASSET_KIND &&
      asset.classification === PRODUCT_MEDIA_ASSET_CLASSIFICATION &&
      asset.status === PRODUCT_MEDIA_ASSET_STATUS &&
      asset.deletedAt === undefined
    );
  });
}

/**
 * Each referenced asset carries both required derivatives, ready, unwatermarked
 * and with the durable storage reference the delivery path will need.
 *
 * The storage *key* is read only to confirm it exists — it is a durable fact in
 * PostgreSQL, never resolved, never returned, and no object-storage call is made
 * anywhere in this module.
 */
function areDerivativesPublishable(
  media: readonly PublicationMediaFacts[],
  derivatives: readonly PublicationDerivativeFacts[],
): boolean {
  return media.every((link) =>
    PRODUCT_PUBLICATION_DERIVATIVE_KINDS.every((kind) =>
      derivatives.some(
        (derivative) =>
          derivative.assetId === link.assetId &&
          derivative.kind === kind &&
          derivative.status === PRODUCT_PUBLICATION_DERIVATIVE_STATE &&
          !derivative.isWatermarked &&
          isPresent(derivative.storageKey),
      ),
    ),
  );
}

/**
 * The SKUs an order could actually resolve (`APP12-N02.B01`).
 *
 * Two conditions, and the second is the one that is easy to lose: a SKU is
 * order-eligible when `is_active` is true **and** its owning variant is active.
 * An active SKU under a delisted variant is not for sale — the variant is what
 * a customer chooses — and counting it would let a Product publish on structure
 * no storefront path can reach.
 *
 * "Order-eligible ≡ `is_active = true`" is `APP7-B01`'s rule and is not
 * reinterpreted here; this only adds the reachability the variant level carries.
 */
function orderEligibleSkus(facts: ProductPublicationFacts): readonly PublicationSkuFacts[] {
  const activeVariants = new Set(
    facts.variants.filter((variant) => variant.isActive).map((variant) => variant.variantId),
  );
  return facts.skus.filter((sku) => sku.isActive && activeVariants.has(sku.variantId));
}

/**
 * Every order-eligible SKU resolves to a publishable price — **every**, not one.
 *
 * The resolution is `COALESCE(sku.price_override_amount, product.base_price_amount)`
 * (BR-021 / IMP-D058), and the predicate is the same `isPublishablePrice` the
 * base price is already checked with, so the two criteria cannot start
 * disagreeing about what a valid VND amount is.
 *
 * The quantifier is the whole point, and it is not the obvious one. A price
 * override is validated only as `^\d{1,12}$`, so `"0"` is an accepted override
 * on a Product whose base price is perfectly valid: `PRODUCT_PRICE_READY` stays
 * satisfied, the old seven stayed 7/7, and the Product would have published a
 * SKU that sells for nothing. "At least one valid price" would let that same
 * SKU through as long as a sibling were priced — so the rule is that every SKU
 * an order could resolve must be sellable, because an order does not get to
 * pick the priced one.
 *
 * Vacuously true when nothing is order-eligible: "every eligible SKU is priced"
 * holds when none is, and `HAS_ORDER_ELIGIBLE_SKU` is the requirement that
 * reports the actual problem. Reporting two failures for one missing fact would
 * tell the operator to fix two things.
 */
function areEligiblePricesResolvable(facts: ProductPublicationFacts): boolean {
  return orderEligibleSkus(facts).every((sku) => {
    const price = resolvePublicSkuUnitPrice(sku, facts.product);
    return isPublishablePrice(price.amount, price.currencyCode);
  });
}

/**
 * Evaluates every requirement, in the locked order.
 *
 * All of them are always evaluated: an unsatisfied requirement is ordinary data
 * a client renders as a checklist, not an exception, and short-circuiting would
 * make the response depend on evaluation order.
 *
 * With no media at all, the asset and derivative requirements are *vacuously*
 * satisfied — "every attached image is eligible" is true when none is attached.
 * `PRODUCT_MEDIA_READY` is the requirement that fails in that case, and it is
 * the one that reports the actual problem; reporting three failures for one
 * missing fact would tell the operator to fix three things.
 */
export function evaluatePublicationReadiness(
  facts: ProductPublicationFacts,
): ProductPublicationReadiness {
  const satisfiedBy: Record<ProductPublicationRequirementCode, boolean> = {
    // 01-PRODUCT-REQUIREMENTS §2.2 ("Tên") and Q-01's product card. The slug is
    // checked alongside it as the product's other public identity: it is
    // `NOT NULL`, unique and server-derived, so this cannot fail in practice —
    // it is defence in depth against a row written outside the B02 seam.
    PRODUCT_NAME_READY: isPresent(facts.product.name) && isPresent(facts.product.slug),
    // 01-PRODUCT-REQUIREMENTS §2.2 ("Mô tả") and Q-02's product detail output.
    // The column is nullable, so a draft legitimately reaches publication
    // without one.
    PRODUCT_DESCRIPTION_READY: isPresent(facts.product.description),
    // Q-01 filters public listings by category, so an unpublished or archived
    // category would leave a published product unreachable in the storefront.
    PRODUCT_CATEGORY_READY:
      facts.category !== undefined &&
      facts.category.status === APP2_CATEGORY_STATUS &&
      facts.category.archivedAt === undefined,
    // 01-PRODUCT-REQUIREMENTS §2.2 ("Giá sản phẩm nền") and Q-01's card price.
    // IMP-D032's `0` sentinel means "not set" and must fail here.
    PRODUCT_PRICE_READY: isPublishablePrice(
      facts.product.basePriceAmount,
      facts.product.currencyCode,
    ),
    // 01-PRODUCT-REQUIREMENTS §2.2 ("Hình ảnh") and Q-01's card image.
    PRODUCT_MEDIA_READY: isPublishableMedia(facts.media),
    PRODUCT_MEDIA_ASSETS_READY: areAssetsPublishable(facts.media, facts.assets),
    PRODUCT_MEDIA_DERIVATIVES_READY: areDerivativesPublishable(facts.media, facts.derivatives),
    // `APP12-N02.B01` / `N02.D01` §J. A Product with no offered variant has
    // nothing a customer can choose, so the storefront can show it and never
    // sell it — the exact state `N02.G01` found live.
    HAS_ACTIVE_VARIANT: facts.variants.some((variant) => variant.isActive),
    // Vacuously satisfied with no active variant, for the same reason the media
    // requirements are vacuously satisfied with no media: `HAS_ACTIVE_VARIANT`
    // is the requirement that reports that problem.
    HAS_ORDER_ELIGIBLE_SKU:
      !facts.variants.some((variant) => variant.isActive) || orderEligibleSkus(facts).length > 0,
    SKU_PRICE_RESOLVABLE: areEligiblePricesResolvable(facts),
  };

  const requirements = PRODUCT_PUBLICATION_REQUIREMENT_CODES.map((code) => ({
    code,
    satisfied: satisfiedBy[code],
  }));

  return { eligible: requirements.every((entry) => entry.satisfied), requirements };
}

/**
 * The unsatisfied **media** codes, in the same locked order (`APP12-M01.B2`).
 *
 * The media-only curation write evaluates the whole requirement set — one
 * evaluator, one set of facts — and then refuses on this subset alone. Writing
 * it as a filter over the same verdict, rather than as a second evaluator over
 * the same facts, is what makes "publish and media curation agree about an
 * image" a structural property instead of two functions that must be kept in
 * step by inspection.
 */
export function unsatisfiedMediaRequirements(
  readiness: ProductPublicationReadiness,
): ProductPublicationRequirementCode[] {
  const media = PRODUCT_MEDIA_PUBLICATION_REQUIREMENT_CODES as readonly string[];
  return unsatisfiedRequirements(readiness).filter((code) => media.includes(code));
}

/** The unsatisfied codes, in the same locked order. */
export function unsatisfiedRequirements(
  readiness: ProductPublicationReadiness,
): ProductPublicationRequirementCode[] {
  return readiness.requirements.filter((r) => !r.satisfied).map((r) => r.code);
}
