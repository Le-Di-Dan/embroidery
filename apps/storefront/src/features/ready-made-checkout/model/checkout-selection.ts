import type { PublicProductSkuResponse } from '@embroidery/api-client';

import type {
  PurchaseVariant,
  ReadyMadePurchaseView,
} from '../../ready-made-purchase/model/purchase-projection';

/**
 * Resolving `?sku=&quantity=` against the **current** purchase projection
 * (`APP12-S02` §9–§11).
 *
 * ## The query is a hint and never an authority
 *
 * `APP12-S01` composes `/mua-hang/<slug>?sku=<skuId>&quantity=<n>` as a record
 * of *what the customer was looking at*. Nothing about it is trusted here: this
 * route re-reads `publicProductVariant_list` on the server, on this request, and
 * the hint is then checked against what came back. A `skuId` that is unknown, or
 * that belongs to a different Product, or that sits under a variant this
 * projection cannot resolve, produces **no selection at all** — never a
 * substitute, never the first SKU, never the cheapest one.
 *
 * That is why this function takes the projection rather than the raw response:
 * `resolveVariantSubject` has already decided which variants are `buyable`,
 * `sold-out`, `none` or `ambiguous`, and this module only *looks the hint up* in
 * that decision. The `ambiguous` case therefore stays fail-closed by
 * construction (`APP12-S02` §11) — an ambiguous variant carries no `buyable`
 * subject, so no hint can select through it, whichever of its SKU ids the URL
 * names.
 *
 * ## Product ↔ SKU binding
 *
 * The binding is the lookup itself. The projection this searches is the one read
 * for **this route's slug**, so a SKU belonging to another Product simply is not
 * in it and resolves to `unknown-sku` (`APP12-S02` §9). No cross-product read is
 * issued to find out whose it is, and the refusal never says.
 *
 * ## No price, no availability and no total crosses from the URL
 *
 * The only two parameters read are `sku` and `quantity`. The unit price and the
 * availability come from the projection row this resolves to, and the quantity
 * is bounded by that row's `availableQuantity` — so a URL cannot state an amount
 * or a stock level, and could not smuggle one past `APP12-B02` even if it did:
 * the server re-resolves both under the stock lock.
 */

/** The two query parameters `APP12-S01` composes. Read here, written there. */
export const CHECKOUT_SKU_PARAM = 'sku';
export const CHECKOUT_QUANTITY_PARAM = 'quantity';

/** `APP12-D01` sets the drawn quantity at `SL 1`; one is the floor. */
export const MIN_CHECKOUT_QUANTITY = 1;

/** Why a checkout address names nothing buyable. Kept apart for the report only. */
export type CheckoutSelectionRefusal =
  /** No `sku` hint survived the navigation. */
  | 'missing-sku'
  /** The hint is not a SKU this Product currently publishes. */
  | 'unknown-sku'
  /** The SKU exists here but its variant is not resolvable or has no stock. */
  | 'not-purchasable'
  /** The purchase projection itself could not be read. */
  | 'unavailable';

export interface CheckoutSelection {
  readonly sku: PublicProductSkuResponse;
  /** The variant labels the summary line renders, in the server's own order. */
  readonly variantLabels: readonly (string | null)[];
  /** Positive integer, never above the availability this read published. */
  readonly quantity: number;
}

export type CheckoutSelectionResult =
  | { readonly kind: 'resolved'; readonly selection: CheckoutSelection }
  | { readonly kind: 'refused'; readonly refusal: CheckoutSelectionRefusal };

/**
 * The quantity a hint resolves to (`APP12-S02` §10).
 *
 * A malformed value is **reset to one**, not coerced from whatever digits it
 * contained: `2e3`, `3.7`, `-1`, `٣` and `abc` are not quantities a customer
 * chose, and turning one into an order line would be the checkout inventing the
 * order's size. The smallest D01-consistent reset is the drawn `SL 1`, and the
 * ceiling is the row's own published availability so a stale hint can never
 * exceed what this read said was there.
 *
 * `Number.parseInt` is deliberately not used: it accepts `12abc`. The pattern
 * decides first, and the parse only runs on digits.
 */
export function resolveCheckoutQuantity(
  raw: string | undefined,
  availableQuantity: number,
): number {
  const ceiling = Math.max(MIN_CHECKOUT_QUANTITY, Math.trunc(availableQuantity));
  if (raw === undefined || !/^\d+$/.test(raw.trim())) return MIN_CHECKOUT_QUANTITY;
  const parsed = Number.parseInt(raw.trim(), 10);
  if (!Number.isSafeInteger(parsed) || parsed < MIN_CHECKOUT_QUANTITY) {
    return MIN_CHECKOUT_QUANTITY;
  }
  return parsed > ceiling ? ceiling : parsed;
}

/** Every SKU id this Product publishes, whatever its variant resolved to. */
function skuIdsOf(variant: PurchaseVariant): readonly string[] {
  const { subject } = variant;
  return subject.kind === 'buyable' || subject.kind === 'sold-out' ? [subject.sku.skuId] : [];
}

/**
 * Whether the hint names a SKU this Product published at all.
 *
 * Distinguished from "published and buyable" on purpose: a SKU that is here but
 * sold out, and a SKU that belongs to somebody else, are different states and
 * only one of them means "go back and pick again on this page". Neither reveals
 * anything — both refusals render an approved state and no id.
 */
function isKnownSku(view: ReadyMadePurchaseView, skuId: string): boolean {
  return view.variants.some((variant) => skuIdsOf(variant).includes(skuId));
}

/**
 * Resolve one checkout address.
 *
 * Pure, and total: every input produces either a selection or a named refusal,
 * and there is no path that throws or that returns a SKU the projection did not
 * publish as `buyable`.
 */
export function resolveCheckoutSelection(input: {
  readonly view: ReadyMadePurchaseView | undefined;
  readonly skuHint: string | undefined;
  readonly quantityHint: string | undefined;
}): CheckoutSelectionResult {
  const { view, skuHint, quantityHint } = input;
  if (view === undefined) return { kind: 'refused', refusal: 'unavailable' };

  const skuId = skuHint?.trim();
  if (skuId === undefined || skuId === '') {
    return { kind: 'refused', refusal: 'missing-sku' };
  }

  // Only a `buyable` subject can be selected. `sold-out`, `none` and — the rule
  // this checkpoint inherits and must not soften — `ambiguous` all fall through
  // to a refusal, and the ambiguous variant's SKU ids are never even compared,
  // because `skuIdsOf` publishes none for it.
  const match = view.variants.find(
    (variant) => variant.subject.kind === 'buyable' && variant.subject.sku.skuId === skuId,
  );
  if (match === undefined || match.subject.kind !== 'buyable') {
    return {
      kind: 'refused',
      refusal: isKnownSku(view, skuId) ? 'not-purchasable' : 'unknown-sku',
    };
  }

  const { sku } = match.subject;
  return {
    kind: 'resolved',
    selection: {
      sku,
      variantLabels: [match.colorName, match.sizeLabel],
      quantity: resolveCheckoutQuantity(quantityHint, sku.availableQuantity),
    },
  };
}

/** The one query value a route may hand over, narrowed from Next's union. */
export function readQueryHint(value: string | readonly string[] | undefined): string | undefined {
  if (value === undefined) return undefined;
  // A repeated parameter (`?sku=a&sku=b`) is not a choice the customer made and
  // is not resolved by taking one of them.
  return Array.isArray(value) ? undefined : (value as string);
}
