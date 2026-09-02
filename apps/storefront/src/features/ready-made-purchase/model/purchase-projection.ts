import type {
  PublicProductSkuResponse,
  PublicProductVariantListResponse,
  PublicProductVariantResponse,
} from '@embroidery/api-client';

/**
 * The `APP12-B01` purchase contract, narrowed to what the panel may render.
 *
 * `publicProductVariant_list` is the **only** purchase-data authority
 * (`APP12-S01` §6): the buyable subject, the price and the availability all come
 * from it. Nothing here consults the Product's `isDisplayOutOfStock`, which is an
 * operator display flag and not stock truth (`BR-022`), and nothing derives
 * purchasability from a compiled list, a Catalog constant or a custom-request
 * shape.
 */

/**
 * What one Product Variant offers Ready-Made right now.
 *
 * Four cases, and the two that are not purchasable are deliberately kept apart.
 * `sold-out` is a statement about inventory; `ambiguous` and `none` are not, and
 * collapsing them would make the panel claim a stock level it was never given.
 */
export type VariantSubject =
  /** Exactly one order-eligible SKU, with stock at read time. */
  | { readonly kind: 'buyable'; readonly sku: PublicProductSkuResponse }
  /** Exactly one order-eligible SKU, published with `availableQuantity = 0`. */
  | { readonly kind: 'sold-out'; readonly sku: PublicProductSkuResponse }
  /** No order-eligible SKU at all: this variant was never sellable Ready-Made. */
  | { readonly kind: 'none' }
  /**
   * More than one order-eligible SKU under one customer-visible variant.
   *
   * The delivered write-side policy caps the order-eligible set at one per
   * variant (`MAX_ORDER_ELIGIBLE_SKUS_PER_VARIANT`, `APP7-G01`), and the locked
   * rule for a larger set is that **later conversion refuses safely** — never
   * that something picks a member. `APP12-B01` therefore publishes every
   * eligible SKU in id order and marks none as preferred, and the public SKU
   * contract carries no customer-visible differentiator: `skuId` is internal
   * identity, and price and availability are facts about a SKU rather than names
   * for one.
   *
   * So this panel refuses too. It selects nothing, offers nothing, and says
   * nothing about stock. That is a transcription of the delivered refusal, not a
   * new rule, and it is why `APP12-S01` §9's two prohibitions — never render
   * `skuId` as customer copy, never silently choose one — are satisfied
   * structurally rather than by remembering to.
   */
  | { readonly kind: 'ambiguous' };

/** One variant, with its purchase subject already decided. */
export interface PurchaseVariant {
  readonly productVariantId: string;
  /** Trimmed, with a blank treated as absent. `null` is a real, renderable state. */
  readonly colorName: string | null;
  readonly sizeLabel: string | null;
  readonly subject: VariantSubject;
}

/** Everything the panel is allowed to know. */
export interface ReadyMadePurchaseView {
  /** Server order, preserved exactly: `display_order` then id (`APP5-B07`). */
  readonly variants: readonly PurchaseVariant[];
  /** Distinct colour values in first-seen server order. Never sorted. */
  readonly colorValues: readonly string[];
  /** Distinct size values in first-seen server order. Never sorted. */
  readonly sizeValues: readonly string[];
}

/** What the route learned about this Product's purchase state. */
export type ReadyMadePurchaseResult =
  | { readonly kind: 'ready'; readonly view: ReadyMadePurchaseView }
  /**
   * The projection could not be read. **Not** zero stock (`APP12-S01` §24): the
   * panel says so rather than fabricating a SKU, a price or an availability.
   */
  | { readonly kind: 'unavailable' };

function normalizeLabel(value: string | null): string | null {
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * Decides the purchase subject of one variant. No tie-break, by construction.
 *
 * `APP12-B01` already applies the only eligibility rule (`skus.is_active`) in
 * the statement, so every published SKU is order-eligible and this counts rather
 * than filters. One is resolvable; anything else is not.
 */
export function resolveVariantSubject(variant: PublicProductVariantResponse): VariantSubject {
  const skus = variant.skus;
  if (skus.length === 0) return { kind: 'none' };
  if (skus.length > 1) return { kind: 'ambiguous' };
  const sku = skus[0];
  if (sku === undefined) return { kind: 'none' };
  return sku.availableQuantity > 0 ? { kind: 'buyable', sku } : { kind: 'sold-out', sku };
}

function distinct(values: readonly (string | null)[]): readonly string[] {
  const seen: string[] = [];
  for (const value of values) {
    if (value !== null && !seen.includes(value)) seen.push(value);
  }
  return seen;
}

/**
 * Narrow the contract response to the purchase view.
 *
 * **Every variant survives.** `APP12-B01` deliberately keeps variant-list
 * membership broader than Ready-Made purchasability so a variant with nothing to
 * sell can still be chosen for a custom-embroidery request, and `APP12-S01` §7
 * forbids hiding one merely because its SKU is inactive, absent or out of stock.
 * A variant that cannot be bought is therefore projected and rendered — it is
 * simply not selectable.
 *
 * The two option axes are **derived from the response**, never declared here:
 * `APP12-D01` draws a `Phân loại` fieldset and a `Kích thước` fieldset that
 * resolves the SKU, and their values are the distinct labels the server
 * published, in the order it published them. No colour list, size list or
 * ordering is hard-coded (`APP12-S01` §8), and nothing is alphabetically
 * re-sorted — the product's own `display_order` is the studio's decision.
 */
export function toReadyMadePurchaseView(
  response: PublicProductVariantListResponse,
): ReadyMadePurchaseView {
  const variants: readonly PurchaseVariant[] = response.variants.map((variant) => ({
    productVariantId: variant.productVariantId,
    colorName: normalizeLabel(variant.colorName),
    sizeLabel: normalizeLabel(variant.sizeLabel),
    subject: resolveVariantSubject(variant),
  }));

  return {
    variants,
    colorValues: distinct(variants.map((variant) => variant.colorName)),
    sizeValues: distinct(variants.map((variant) => variant.sizeLabel)),
  };
}
