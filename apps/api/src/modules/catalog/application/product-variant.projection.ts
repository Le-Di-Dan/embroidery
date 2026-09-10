/**
 * The Admin variant views (`APP12-N02.B01`).
 *
 * Kept apart from the OpenAPI response classes for the same reason `APP2-B02`
 * and `APP7-B01` keep them apart: adding a property to one and forgetting the
 * other shows up as a type error instead of as a silently undocumented field.
 *
 * This is the **authoring** projection, and what it does not filter is the
 * point. Inactive variants and inactive SKUs are both returned, because the
 * operator's screen is the history surface (`N02.D01` §E/§F): a delisted
 * variant is the row they are most likely to be looking for, and a SKU that has
 * been superseded is the evidence for why the current one exists. The public
 * projection (`publicProduct_variants`) answers a different question and is not
 * reused here — it is keyed by slug, refuses anything but `PUBLISHED`, filters
 * `is_active = true` on both levels, and publishes neither `code` nor
 * `isActive` (`N02.D01` §C).
 *
 * Deliberately absent: anything from the Inventory context. `skus` is the
 * definition side (REL-026), so there is no quantity, no reservation and no
 * low-stock threshold here — the stock screen is reached by `skuId`, and a
 * stock-shaped field published here would invent a second stock authority.
 */
import type { SkuRecord } from '../domain/repositories/product-sku.repository';
import type { ProductVariantRecord } from '../domain/repositories/product-variant.repository';
import { SKU_CURRENCY } from '../domain/product-sku.policy';

/** One SKU as the authoring list publishes it. */
export interface AdminVariantSkuView {
  readonly skuId: string;
  readonly code: string;
  /** Absent when the SKU has no override and the product base price applies. */
  readonly priceOverrideAmount?: string;
  readonly currencyCode: string;
  readonly isActive: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface AdminProductVariantView {
  readonly variantId: string;
  readonly productId: string;
  readonly colorName: string | null;
  readonly sizeLabel: string | null;
  readonly displayOrder: number;
  readonly isActive: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly skus: readonly AdminVariantSkuView[];
}

export interface AdminProductVariantListView {
  readonly productId: string;
  readonly variants: readonly AdminProductVariantView[];
}

/**
 * `null` on the wire rather than an omitted key.
 *
 * A variant with no colour is a meaningful, editable state — the dialog has to
 * render the field empty — and an absent property would make "not set" and "not
 * returned" the same value to a client that has to tell them apart.
 */
function labelOf(value: string | undefined): string | null {
  return value ?? null;
}

function toSkuView(sku: SkuRecord): AdminVariantSkuView {
  return {
    skuId: sku.id,
    code: sku.code,
    ...(sku.priceOverrideAmount === undefined
      ? {}
      : { priceOverrideAmount: sku.priceOverrideAmount }),
    currencyCode: SKU_CURRENCY,
    isActive: sku.isActive,
    createdAt: sku.createdAt.toISOString(),
    updatedAt: sku.updatedAt.toISOString(),
  };
}

export function toAdminProductVariantView(
  variant: ProductVariantRecord,
  skus: readonly SkuRecord[] = [],
): AdminProductVariantView {
  return {
    variantId: variant.id,
    productId: variant.productId,
    colorName: labelOf(variant.colorName),
    sizeLabel: labelOf(variant.sizeLabel),
    displayOrder: variant.displayOrder,
    isActive: variant.isActive,
    createdAt: variant.createdAt.toISOString(),
    updatedAt: variant.updatedAt.toISOString(),
    skus: skus.map(toSkuView),
  };
}

/**
 * The whole authoring list, assembled in memory from two batched reads.
 *
 * Grouping here rather than in SQL keeps the repository's two statements flat
 * and keeps the shape decision in the layer that owns the shape. A SKU whose
 * variant is not in the set cannot occur — the read joins through the same
 * Product — and is dropped rather than invented into a variant of its own.
 */
export function toAdminProductVariantListView(input: {
  readonly productId: string;
  readonly variants: readonly ProductVariantRecord[];
  readonly skus: readonly SkuRecord[];
}): AdminProductVariantListView {
  const byVariant = new Map<string, SkuRecord[]>();
  for (const sku of input.skus) {
    const bucket = byVariant.get(sku.productVariantId);
    if (bucket === undefined) {
      byVariant.set(sku.productVariantId, [sku]);
    } else {
      bucket.push(sku);
    }
  }

  return {
    productId: input.productId,
    variants: input.variants.map((variant) =>
      toAdminProductVariantView(variant, byVariant.get(variant.id) ?? []),
    ),
  };
}
