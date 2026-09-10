/**
 * The Admin variant-authoring policy (`APP12-N02.B01`, `N02.G01` / `N02.D01` §E).
 *
 * `product_variants` had no writer at all before this checkpoint: `N02.G01`
 * proved that zero delivered operations insert or update a row, so every rule
 * below is being stated for the first time rather than restated. Each one is a
 * rule the approved design draws, and none is invented here:
 *
 * ```text
 * at least one nonblank label     D01 §E, dialog 975:220
 * duplicate identity refused      D01 §E, same dialog
 * no DELETE                       D01 §E — history is kept by deactivation
 * ordering is creation order      D01 §E — no drag-and-drop, no client displayOrder
 * ```
 *
 * There is no persisted "variant name": the two relational columns DB4 locked
 * (`color_name`, `size_label`) are the whole model (TBL-013), and a display
 * label is composed for reading, never stored.
 */
import type { ProductState } from '@embroidery/database';

import { SKU_AUTHORABLE_PRODUCT_STATES } from './product-sku.policy';

/**
 * Product states in which a variant may be created or edited.
 *
 * Deliberately **the same constant** the SKU authoring rule already reads, not
 * a second copy of the same two literals: a variant and its SKUs are one
 * authoring surface (`N02.D01` §H draws them in one section), and a repository
 * where the two lists could drift apart would let an operator create a variant
 * on a Product that then refuses the SKU which makes it sellable.
 *
 * `ARCHIVED` is excluded for the reason `APP7-B01` states: an archived Product
 * is withdrawn from sale, and authoring a new sellable definition on one would
 * contradict the archive.
 */
export const VARIANT_AUTHORABLE_PRODUCT_STATES: readonly ProductState[] =
  SKU_AUTHORABLE_PRODUCT_STATES;

export function isVariantAuthorableProductState(status: string): boolean {
  return (VARIANT_AUTHORABLE_PRODUCT_STATES as readonly string[]).includes(status);
}

/**
 * A newly created variant is active unless the operator says otherwise.
 *
 * The opposite of the SKU rule, and for the opposite reason. `isActive` is
 * explicit on a SKU because a variant may hold only one order-eligible SKU, so
 * defaulting it would silently consume the single slot. A Product may hold any
 * number of active variants, nothing is consumed, and an operator who has just
 * typed a colour and a size means to sell it.
 */
export const VARIANT_DEFAULT_IS_ACTIVE = true;

/** The first `display_order` a Product's variants take. `NOT NULL`, no DEFAULT. */
export const VARIANT_FIRST_DISPLAY_ORDER = 0;

/**
 * The stored form of one label: trimmed, internal whitespace collapsed, blank
 * treated as absent.
 *
 * `"  Xanh   navy  "` and `"Xanh navy"` are the same colour typed twice, and a
 * schema that stored both would make the duplicate rule below decide identity
 * on invisible characters. `undefined` is the single "no label" value — the
 * column is nullable, an empty string is not a label, and admitting `''`
 * alongside `NULL` would give one absence two representations.
 */
export function normalizeVariantLabel(value: string | null | undefined): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  const collapsed = value.trim().replace(/\s+/gu, ' ');
  return collapsed === '' ? undefined : collapsed;
}

/** The label pair after normalization — the only form the rules below read. */
export interface VariantIdentity {
  readonly colorName: string | undefined;
  readonly sizeLabel: string | undefined;
}

/**
 * At least one label must survive normalization.
 *
 * Both columns are nullable, so the database admits a variant that names
 * nothing; such a row is unaddressable in the UI and indistinguishable from
 * every other unnamed one, which is exactly the duplicate the next rule exists
 * to prevent.
 */
export function hasVariantLabel(identity: VariantIdentity): boolean {
  return identity.colorName !== undefined || identity.sizeLabel !== undefined;
}

/**
 * The comparison key for duplicate identity within one Product.
 *
 * Case-insensitive — `"Xanh navy"/"M"` and `"xanh navy"/"m"` are the same
 * variant typed twice — and deliberately **not** accent-stripped: `"Đen"` and
 * `"Den"` are different words in Vietnamese, and folding them would refuse a
 * legitimate second colour. `\u0000` separates the two halves because it cannot
 * occur in either label, so `("ab", undefined)` and `("a", "b")` stay distinct.
 *
 * There is no unique index behind this (`N02.G01`: `product_variants` carries
 * none, and `N02.B01` adds no migration), so the rule is settled in the
 * application under the write lock rather than by the database.
 */
export function variantIdentityKey(identity: VariantIdentity): string {
  return `${identity.colorName?.toLowerCase() ?? ''}\u0000${identity.sizeLabel?.toLowerCase() ?? ''}`;
}

/** The next `display_order` for a Product whose variants are already read. */
export function nextVariantDisplayOrder(existing: readonly { displayOrder: number }[]): number {
  if (existing.length === 0) {
    return VARIANT_FIRST_DISPLAY_ORDER;
  }
  return Math.max(...existing.map((variant) => variant.displayOrder)) + 1;
}
