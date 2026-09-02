/**
 * Resolves one Ready-Made order's exact payable total (`BR-021`, `BR-027`,
 * `APP12-B03` §10, §12).
 *
 * ```text
 * payable_total = sum(order_items.line_total_amount) + exact shipping fee
 * ```
 *
 * Its own class because it is the **one** answer to "what does this customer
 * owe", and the fee path asks it twice — once on the first confirmation and
 * once on every correction. Two copies of the composition would be two places
 * for a future edit to start reading a live price, and reading a live price is
 * precisely what `BR-021` forbids an existing order from doing.
 *
 * ### What it will not read
 *
 * The Catalog. Not `products.base_price_amount`, not
 * `skus.price_override_amount`, not a variant. A SKU repriced after the order
 * was placed leaves that order's subtotal exactly where it was, because the
 * subtotal is summed from the lines the order froze at creation. This class
 * holds no Catalog port at all, so the rule is a structural fact rather than a
 * convention someone has to remember.
 *
 * `orders.total_amount` is also deliberately not the source, even though it
 * holds the merchandise subtotal until the first fee is confirmed. It stops
 * holding it afterwards (§14), so composing a correction from it would build a
 * total out of a previous total and compound every fee change — the exact bug
 * §35's `250000 + 45000 = 295000` case exists to catch.
 */
import { Inject, Injectable } from '@nestjs/common';
import {
  READY_MADE_ORDER_REPOSITORY,
  type OrderId,
  type ReadyMadeOrderRepository,
} from '@embroidery/persistence';

import {
  isPayableObligationAmount,
  isWholeDong,
  parsePayableAmount,
  payableTotalOf,
  type PayableAmount,
} from '../../domain/ready-made/payable-total';
import { adminShippingError } from '../../domain/shipping/admin-shipping.errors';

@Injectable()
export class ReadyMadePayableTotalResolver {
  constructor(
    @Inject(READY_MADE_ORDER_REPOSITORY)
    private readonly orders: ReadyMadeOrderRepository,
  ) {}

  /**
   * The frozen subtotal plus this fee, or a refusal.
   *
   * Every failure is a refusal with nothing written rather than a defaulted
   * figure: an unreadable subtotal is escalated, never replaced by zero or by a
   * Catalog lookup, because a payable total composed from a guess is money the
   * customer never agreed to.
   */
  async resolve(id: OrderId, fee: PayableAmount): Promise<PayableAmount> {
    const stored = await this.orders.frozenMerchandiseSubtotal(id);
    if (stored === undefined) {
      throw adminShippingError('ORDER_SUBTOTAL_NOT_AVAILABLE');
    }

    const subtotal = parsePayableAmount(stored);
    if (subtotal === undefined || !isWholeDong(subtotal)) {
      throw adminShippingError('ORDER_SUBTOTAL_NOT_AVAILABLE');
    }

    const payable = payableTotalOf(subtotal, fee);
    if (payable === undefined || !isWholeDong(payable) || !isPayableObligationAmount(payable)) {
      // Overflow, a fractional đồng, or a zero total — the last of which
      // `ck_payment_obligations__amount_positive` rejects anyway. A zero
      // *fee* is legitimate; a zero *total* is nothing to pay.
      throw adminShippingError('SHIPPING_FEE_NOT_APPLICABLE');
    }
    return payable;
  }
}
