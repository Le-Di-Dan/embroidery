/**
 * Exact VND arithmetic for the Ready-Made merchandise subtotal (`BR-021`).
 *
 * ### No floating point, anywhere on this path
 *
 * `skus.price_override_amount`, `products.base_price_amount`,
 * `order_items.unit_price_amount`, `order_items.line_total_amount` and
 * `orders.total_amount` are all `numeric(14,2)` and reach this process as
 * **strings**. None of them ever becomes a JS `number`.
 * `parseFloat('150000.10') * 3` is the whole argument: a frozen line total that
 * lost a đồng is a figure the customer never agreed to, and one that gained a
 * đồng is money the store cannot collect — and unlike a quotation, nobody
 * reviews a Ready-Made subtotal before it is committed.
 *
 * Amounts are carried as `bigint` **hundredths** of a VND, exact at every
 * magnitude `numeric(14,2)` can hold, and the only way back out is
 * {@link formatMerchandiseAmount}.
 *
 * ### Why this is not `quotation/domain/pricing/vnd-amount.ts`
 *
 * The reason `payment/domain/verification/observed-amount.ts` and
 * `order/domain/shipping/shipping-fee-amount.ts` each give for the same
 * decision. That module is the quotation module's **pricing calculator** —
 * percentage, round-half-up, the deposit/remaining split — and reaching across
 * a module boundary for a full calculator in order to use one multiplication
 * would put every one of those operations one import away from a path that must
 * never perform them.
 *
 * This module can parse, multiply by an integer count, and format. It cannot
 * add, cannot subtract, cannot take a percentage and cannot round, so no future
 * edit here can quietly compose a shipping-inclusive total — which is exactly
 * what `BR-027` forbids Ready-Made order creation from producing. A module with
 * no addition cannot be edited into adding a shipping fee.
 */

/** Hundredths of one VND. The only in-memory representation of an amount. */
export type MerchandiseAmount = bigint & { readonly __brand: 'MerchandiseAmount' };

const HUNDREDTHS = 100n;

/** `numeric(14,2)` — twelve integer digits, two fractional. */
const MAX_HUNDREDTHS = 10n ** 14n - 1n;

/** No sign, no exponent, no separator, at most two fractional digits. */
const DECIMAL_PATTERN = /^\d{1,12}(?:\.\d{1,2})?$/;

/**
 * Reads a non-negative stored amount into hundredths, or `undefined`.
 *
 * The input is a column value, not client data — the client never sends a price
 * (`BR-021`) — so `undefined` here means the Catalog holds something this path
 * cannot price against, which the caller reports as an unavailable SKU rather
 * than as a client error.
 */
export function parseMerchandiseAmount(text: string): MerchandiseAmount | undefined {
  if (!DECIMAL_PATTERN.test(text)) {
    return undefined;
  }
  const [whole = '0', fraction = ''] = text.split('.');
  return (BigInt(whole) * HUNDREDTHS + BigInt(fraction.padEnd(2, '0'))) as MerchandiseAmount;
}

/** The two-decimal form `numeric(14,2)` stores. The only way out of `bigint`. */
export function formatMerchandiseAmount(amount: MerchandiseAmount): string {
  const whole = amount / HUNDREDTHS;
  const fraction = amount % HUNDREDTHS;
  return `${String(whole)}.${String(fraction).padStart(2, '0')}`;
}

/**
 * `unitPrice × quantity` — the line total, and for a single-line order the
 * merchandise subtotal too (`BR-021`).
 *
 * `quantity` is an integer count from a validated body, never an amount, so
 * converting it to `bigint` loses nothing.
 */
export function multiplyMerchandiseAmount(
  unitPrice: MerchandiseAmount,
  quantity: number,
): MerchandiseAmount {
  return (unitPrice * BigInt(quantity)) as MerchandiseAmount;
}

/**
 * Whether the result still fits `numeric(14,2)`.
 *
 * Checked rather than assumed: a legitimate unit price multiplied by a
 * legitimate quantity can exceed twelve integer digits, and the alternative to
 * refusing it here is a numeric-overflow error from the driver at insert time,
 * which is not an answer a customer can act on.
 */
export function fitsMerchandiseColumn(amount: MerchandiseAmount): boolean {
  return amount <= MAX_HUNDREDTHS;
}

/**
 * Whether the amount is a whole đồng — the database's own VND scale rule
 * (`ck_order_items__unit_price_currency_scale`, `ck_orders__total_currency_scale`).
 *
 * Mirrored here so a fractional đồng that somehow reached the Catalog is
 * refused as an unpriceable SKU rather than as a constraint violation.
 */
export function isWholeDong(amount: MerchandiseAmount): boolean {
  return amount % HUNDREDTHS === 0n;
}
