/**
 * The money one Ready-Made line freezes (`BR-021`).
 *
 * Pure, and in the domain, so the rule can be proved without a database and
 * cannot be re-derived by a second caller. Its two halves are deliberately
 * borrowed rather than reimplemented:
 *
 * - the **selection** between the SKU override and the Product base price is
 *   `resolvePublicSkuUnitPrice`, the one `BR-021` function `APP12-B01` already
 *   publishes the advisory price through. The figure a customer was shown and
 *   the figure they are charged are therefore computed by the same code, which
 *   is the only way "the client's price is advisory" can be a guarantee rather
 *   than a hope;
 * - the **arithmetic** is `merchandise-amount.ts`, which can multiply by an
 *   integer count and nothing else — no addition, so no shipping fee can ever
 *   be folded in here (`BR-027`).
 *
 * ## Why an unpriceable SKU is an absence rather than a throw
 *
 * Every failure below is a Catalog row this path cannot price *exactly*: a
 * fractional đồng the VND scale CHECK would reject, an amount outside
 * `numeric(14,2)`, or a subtotal that overflows it. The client sent no amount
 * and can do nothing about any of them, so the caller reports the SKU as
 * unavailable rather than blaming the request — and the alternative, letting it
 * through, is a numeric-overflow error from the driver at insert time, which is
 * not an answer a customer can act on.
 */
import { resolvePublicSkuUnitPrice } from '../../../catalog/domain/public-sku-price.policy';
import type { PurchasableSku } from '../../../catalog/domain/repositories/purchasable-sku.port';

import {
  fitsMerchandiseColumn,
  formatMerchandiseAmount,
  isWholeDong,
  multiplyMerchandiseAmount,
  parseMerchandiseAmount,
} from './merchandise-amount';

/** The three money facts a line is frozen with, in the column's own spelling. */
export interface ReadyMadeLineMoney {
  readonly unitPriceAmount: string;
  readonly lineTotalAmount: string;
  readonly currencyCode: string;
}

/**
 * `unit price × quantity`, exactly, or `undefined` if it cannot be exact.
 *
 * For a single-line order the line total **is** the merchandise subtotal
 * (`BR-021`), which is why nothing here adds anything up.
 */
export function resolveReadyMadeLineMoney(
  sku: PurchasableSku,
  quantity: number,
): ReadyMadeLineMoney | undefined {
  // The currency travels with whichever amount won, read from that amount's own
  // row (CST-068) — never a literal, and never the other row's column.
  const resolved = resolvePublicSkuUnitPrice(
    { priceOverrideAmount: sku.priceOverrideAmount, currencyCode: sku.skuCurrencyCode },
    { basePriceAmount: sku.basePriceAmount, currencyCode: sku.productCurrencyCode },
  );

  const unitPrice = parseMerchandiseAmount(resolved.amount);
  if (unitPrice === undefined || !isWholeDong(unitPrice)) {
    return undefined;
  }

  const lineTotal = multiplyMerchandiseAmount(unitPrice, quantity);
  if (!fitsMerchandiseColumn(lineTotal)) {
    return undefined;
  }

  return {
    unitPriceAmount: formatMerchandiseAmount(unitPrice),
    lineTotalAmount: formatMerchandiseAmount(lineTotal),
    currencyCode: resolved.currencyCode,
  };
}
