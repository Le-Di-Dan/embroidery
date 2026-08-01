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
  PRODUCT_MEDIA_SECONDARY_ROLE,
  PRODUCT_PUBLICATION_DERIVATIVE_KINDS,
  PRODUCT_PUBLICATION_DERIVATIVE_STATE,
  PRODUCT_PUBLICATION_REQUIREMENT_CODES,
  PRODUCT_UNSET_BASE_PRICE,
  type ProductPublicationRequirementCode,
} from './product-publication.policy';

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

export interface ProductPublicationFacts {
  readonly product: PublicationProductFacts;
  readonly category: PublicationCategoryFacts | undefined;
  /** Ordered by `display_order`, as stored. */
  readonly media: readonly PublicationMediaFacts[];
  /** Only the assets actually referenced by `media`, in any order. */
  readonly assets: readonly PublicationAssetFacts[];
  /** Live derivatives of those assets, in any order. */
  readonly derivatives: readonly PublicationDerivativeFacts[];
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
  };

  const requirements = PRODUCT_PUBLICATION_REQUIREMENT_CODES.map((code) => ({
    code,
    satisfied: satisfiedBy[code],
  }));

  return { eligible: requirements.every((entry) => entry.satisfied), requirements };
}

/** The unsatisfied codes, in the same locked order. */
export function unsatisfiedRequirements(
  readiness: ProductPublicationReadiness,
): ProductPublicationRequirementCode[] {
  return readiness.requirements.filter((r) => !r.satisfied).map((r) => r.code);
}
