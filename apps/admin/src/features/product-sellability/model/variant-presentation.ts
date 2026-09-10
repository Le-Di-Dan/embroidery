/**
 * The authoring list, turned into the facts the section renders.
 *
 * Everything in this module is derived from one response —
 * `adminProductVariant_list` — and nothing is stored. That matters because the
 * same arithmetic appears in three places on the screen (the collapsed variant
 * row, the structural warning's evidence block, and the confirmation dialogs'
 * "after this change" line), and three independent counts would eventually
 * disagree with each other on the one screen whose whole job is to tell the
 * operator whether the product can be bought.
 *
 * ### The variant title is derived, never persisted
 *
 * `product_variants` has `colorName` and `sizeLabel` and no name column. The
 * title here is the two labels joined; when only one exists it *is* the title.
 * Inventing a "variant name" would be a fourth field the contract does not
 * carry and the server could not store.
 *
 * ### Order is the server's
 *
 * The response is in creation order (`displayOrder`, server-assigned, with no
 * reorder operation), and this module reproduces it untouched — including
 * inactive rows, which stay in place as history rather than sinking to the
 * bottom. Sorting active rows first would be friendlier-looking and would
 * silently renumber a list the operator has learned the shape of.
 */
import type { AdminProductVariantResponse, AdminVariantSkuResponse } from '@embroidery/api-client';

/** The separator between a colour and a size, as the approved frames draw it. */
const TITLE_SEPARATOR = ' · ';

/**
 * The displayed title of one variant: `Xanh navy · M`, `Xanh navy`, or `M`.
 *
 * The empty string is unreachable through the contract — the server refuses a
 * variant with neither label — and is returned rather than substituted so a
 * malformed row is visible instead of being papered over with invented copy.
 */
export function variantTitle(
  variant: Pick<AdminProductVariantResponse, 'colorName' | 'sizeLabel'>,
): string {
  const parts = [variant.colorName, variant.sizeLabel].filter(
    (part): part is string => typeof part === 'string' && part.trim() !== '',
  );
  return parts.join(TITLE_SEPARATOR);
}

/** The one SKU of a variant that an order could resolve, if there is one. */
export function orderEligibleSkuOf(
  variant: Pick<AdminProductVariantResponse, 'skus'>,
): AdminVariantSkuResponse | null {
  return variant.skus.find((sku) => sku.isActive) ?? null;
}

/**
 * The product's commerce structure, counted once.
 *
 * `orderEligibleSkuCount` counts only SKUs under **active** variants, because
 * that is what the server's `HAS_ORDER_ELIGIBLE_SKU` counts: an active SKU
 * under a deactivated variant is not orderable, and reporting it as one would
 * make the Admin's evidence block disagree with the readiness checklist beside
 * it.
 */
export interface SellabilityStructure {
  readonly variantCount: number;
  readonly activeVariantCount: number;
  readonly orderEligibleSkuCount: number;
}

export function summarizeStructure(
  variants: readonly AdminProductVariantResponse[],
): SellabilityStructure {
  const active = variants.filter((variant) => variant.isActive);
  return {
    variantCount: variants.length,
    activeVariantCount: active.length,
    orderEligibleSkuCount: active.filter((variant) => orderEligibleSkuOf(variant) !== null).length,
  };
}

/**
 * Whether a published product currently has no way to be bought.
 *
 * Deliberately scoped to `PUBLISHED`. A draft with no variants is not broken —
 * it is unfinished, and the readiness checklist is where that is reported. The
 * warning exists for the case the operator cannot otherwise see: a product that
 * is live, looks healthy in every list, and cannot be ordered.
 *
 * This is **not** a sold-out test and never becomes one. Stock is not read
 * here, is not in the authoring response, and is not a publication requirement.
 */
export function isStructurallyUnsellable(status: string, structure: SellabilityStructure): boolean {
  if (status !== 'PUBLISHED') return false;
  return structure.activeVariantCount === 0 || structure.orderEligibleSkuCount === 0;
}

/**
 * Whether deactivating this variant would leave the product with no active
 * variant at all — the condition `975:254`'s confirmation is written for.
 */
export function isLastActiveVariant(
  variants: readonly AdminProductVariantResponse[],
  variantId: string,
): boolean {
  const active = variants.filter((variant) => variant.isActive);
  return active.length === 1 && active[0]?.variantId === variantId;
}

/**
 * Whether deactivating this SKU would leave the whole product with nothing
 * orderable — the condition `976:300`'s confirmation is written for.
 *
 * The question is asked of the **product**, not of the variant. A variant
 * losing its last selling SKU while another variant still sells is an ordinary
 * edit; the confirmation is reserved for the change that makes the storefront
 * unbuyable, so it keeps meaning something.
 */
export function isLastOrderEligibleSku(
  variants: readonly AdminProductVariantResponse[],
  skuId: string,
): boolean {
  const eligible = variants
    .filter((variant) => variant.isActive)
    .map((variant) => orderEligibleSkuOf(variant))
    .filter((sku): sku is AdminVariantSkuResponse => sku !== null);
  return eligible.length === 1 && eligible[0]?.skuId === skuId;
}
