/**
 * Official reservation eligibility — **G-DB7-27/GRD-013**.
 *
 * `orders.current_approval_snapshot_id` is `NOT NULL`, so an order cannot
 * exist without an approval — that half of GRD-013 is a physical guarantee,
 * not a runtime check. The half this guard enforces is the other one: the
 * order's Deposit obligation must be SATISFIED before stock converts from a
 * hold or a fresh reservation into an official commitment against that
 * order. The partial unique index on `(order_id, sku_stock_id)` where
 * `status = 'RESERVED'` is the physical arbiter for one-reservation-per-SKU;
 * this guard is the arbiter for *may this order reserve at all*.
 *
 * Concurrent double-spend against a single deposit is DB8 CC-22.
 */
import { Inject, Injectable } from '@nestjs/common';
import { guardViolationError } from '@embroidery/database';

import { DEPOSIT_ELIGIBILITY_PORT } from '../payment/deposit-eligibility.port';
import type { DepositEligibilityPort } from '../payment/deposit-eligibility.port';

@Injectable()
export class ReservationEligibilityGuard {
  constructor(
    @Inject(DEPOSIT_ELIGIBILITY_PORT) private readonly deposits: DepositEligibilityPort,
  ) {}

  async assertEligible(orderId: string, operation: string): Promise<void> {
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
