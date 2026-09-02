/**
 * Official reservation eligibility — **G-DB7-27/GRD-013**, made origin-aware by
 * `APP12-B02`.
 *
 * ## The custom rule, unchanged
 *
 * For a `CUSTOM` order the gate is exactly what DB7 delivered: the order's
 * Deposit obligation must be SATISFIED before stock converts from a hold or a
 * fresh reservation into an official commitment against that order. The
 * approval half of GRD-013 used to be a physical guarantee — DB3 made
 * `orders.current_approval_snapshot_id` `NOT NULL` — and `APP12-DB01` kept it
 * one for this branch: `ck_orders__custom_chain_by_origin` still requires the
 * request, the quotation and the approval on every `CUSTOM` row.
 *
 * ## Why `READY_MADE` cannot be asked the same question
 *
 * A Ready-Made order has no deposit and never will: `BR-029` gives it exactly
 * one obligation, of kind `FULL`, and `BR-024` puts its reservation at durable
 * order creation — *before* any obligation exists at all, because stock must be
 * protected across the manual shipping-fee cycle that decides the payable
 * amount. Running the deposit predicate against it would not be a stricter
 * gate; it would be a permanently false one, and Ready-Made could never reserve.
 *
 * So the guard reads the origin first and applies the rule that belongs to it.
 * The Ready-Made rule is the FK: `fk_inventory_reservations__order_id` means a
 * reservation cannot exist without its order, and the order and the reservation
 * are written in one transaction (`BR-024`), so *the order exists* is the whole
 * precondition there is. That is stated here rather than assumed, which is why
 * an unknown order id is refused instead of falling through to the deposit
 * branch and being refused for the wrong reason.
 *
 * Nothing about the custom path changed: same port, same predicate, same code.
 * Concurrent double-spend against a single deposit is DB8 CC-22.
 */
import { Inject, Injectable } from '@nestjs/common';
import { guardViolationError } from '@embroidery/database';

import { DEPOSIT_ELIGIBILITY_PORT } from '../payment/deposit-eligibility.port';
import type { DepositEligibilityPort } from '../payment/deposit-eligibility.port';
import { ORDER_ORIGIN_PORT } from '../order/order-origin.port';
import type { OrderOriginPort } from '../order/order-origin.port';

@Injectable()
export class ReservationEligibilityGuard {
  constructor(
    @Inject(DEPOSIT_ELIGIBILITY_PORT) private readonly deposits: DepositEligibilityPort,
    @Inject(ORDER_ORIGIN_PORT) private readonly origins: OrderOriginPort,
  ) {}

  async assertEligible(orderId: string, operation: string): Promise<void> {
    const origin = await this.origins.originOf(orderId);

    if (origin === undefined) {
      // Distinct from the deposit refusal on purpose: "there is no such order"
      // and "that order has not paid its deposit" are different defects, and
      // reporting the first as the second sends the caller looking at payments.
      throw guardViolationError(
        `SkuStockRepository.${operation}`,
        'RESERVATION_ORDER_NOT_FOUND',
        'That order does not exist, so nothing can be reserved against it.',
      );
    }

    if (origin === 'READY_MADE') {
      // `BR-024`/`BR-029` — no deposit exists or ever will. The order's own
      // existence, written in this same transaction, is the precondition.
      return;
    }

    const satisfied = await this.deposits.isDepositSatisfied(orderId);
    if (!satisfied) {
      throw guardViolationError(
        `SkuStockRepository.${operation}`,
        'RESERVATION_NOT_ELIGIBLE',
        'That order is not eligible for an official reservation: its deposit is not satisfied.',
      );
    }
  }
}
