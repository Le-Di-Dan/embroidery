import { buildStorefrontCheckoutPath } from '../../storefront-shell';

/**
 * The continue URL the panel's call to action carries (`APP12-S01` §17–§20).
 *
 * ```text
 * /san-pham/<slug>  →  /mua-hang/<slug>?sku=<skuId>&quantity=<n>
 * ```
 *
 * ### These are hints, not a decision
 *
 * The two parameters record *what the customer was looking at*, and nothing
 * more. `APP12-B02` re-resolves the price from the SKU row and re-checks
 * availability under the inventory lock before it commits an order, and it
 * rejects a body carrying `unitPrice`, `availableQuantity` or any other
 * client-stated commercial fact outright. So the URL carries no price, no
 * availability, no total, no contact or customer identity, and no internal
 * Product id — a browser value that reached a stored order would be a price the
 * customer chose, and the contract is built so that cannot happen.
 *
 * `skuId` is safe to put here because it authorizes nothing: `APP12-B01`
 * publishes it precisely so a later order line can name its subject, and it is
 * not a credential.
 *
 * ### Encoding
 *
 * `URLSearchParams` owns the query, so a value can never write a raw `&`, `#` or
 * `?` into the address, and the path comes from the one Storefront route builder
 * rather than from a literal. The quantity is serialized as canonical decimal
 * integer text — the caller has already clamped it to a positive integer within
 * the SKU's published availability.
 */
export const PURCHASE_SKU_PARAM = 'sku';
export const PURCHASE_QUANTITY_PARAM = 'quantity';

export function buildPurchaseContinueHref(slug: string, skuId: string, quantity: number): string {
  const query = new URLSearchParams();
  query.set(PURCHASE_SKU_PARAM, skuId);
  query.set(PURCHASE_QUANTITY_PARAM, String(Math.trunc(quantity)));
  return `${buildStorefrontCheckoutPath(slug)}?${query.toString()}`;
}
